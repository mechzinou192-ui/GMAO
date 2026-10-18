import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { q, audit } from './db.js';

const COOKIE = 'gmao_token';
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 10);

export const hashPassword = (pw) => bcrypt.hash(pw, 12);

export function publicUser(u) {
  return {
    id: u.id, nom: u.nom, role: u.role, actif: u.actif,
    superAdmin: u.super_admin, mustChangePw: u.must_change_pw,
    droits: u.droits || {}, lastLogin: u.last_login,
  };
}

export function passwordProblem(pw, id = '') {
  if (typeof pw !== 'string' || pw.length < config.minPasswordLength)
    return `Mot de passe : ${config.minPasswordLength} caractères minimum.`;
  if (pw.toLowerCase() === String(id).toLowerCase()) return "Le mot de passe ne doit pas être l'identifiant.";
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return 'Le mot de passe doit contenir au moins une lettre et un chiffre.';
  return null;
}

function issueCookie(res, user) {
  const token = jwt.sign({ sub: user.id, tv: user.token_version }, config.jwtSecret, {
    expiresIn: `${config.sessionHours}h`,
  });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.cookieSecure,
    maxAge: config.sessionHours * 3600 * 1000,
    path: '/',
  });
}

// Charge l'utilisateur à chaque requête : un compte désactivé ou dont les droits
// changent est pris en compte immédiatement.
export async function authRequired(req, res, next) {
  try {
    const token = req.cookies?.[COOKIE];
    if (!token) return res.status(401).json({ error: 'Non authentifié' });
    const payload = jwt.verify(token, config.jwtSecret);
    const { rows } = await q('SELECT * FROM users WHERE id=$1', [payload.sub]);
    const u = rows[0];
    if (!u || !u.actif || u.token_version !== payload.tv) {
      return res.status(401).json({ error: 'Session expirée' });
    }
    req.user = u;
    next();
  } catch {
    res.status(401).json({ error: 'Session invalide' });
  }
}

export const superAdminRequired = (req, res, next) =>
  req.user?.super_admin ? next() : res.status(403).json({ error: 'Réservé au super administrateur' });

// Si le mot de passe doit être changé, seules les routes d'auth restent accessibles.
export const mustNotChangePw = (req, res, next) =>
  req.user?.must_change_pw
    ? res.status(403).json({ error: 'Changement de mot de passe obligatoire', code: 'MUST_CHANGE_PW' })
    : next();

// Défense CSRF supplémentaire (en plus de SameSite=Strict)
export function csrfGuard(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('X-Requested-With') !== 'gmao') return res.status(403).json({ error: 'Requête refusée' });
  next();
}

export const authRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Trop de tentatives. Réessayez plus tard.' },
});

authRouter.post('/login', loginLimiter, async (req, res) => {
  const id = String(req.body?.id ?? '').trim().toLowerCase();
  const password = String(req.body?.password ?? '');
  const remember = !!req.body?.remember;
  const fail = () => res.status(401).json({ error: 'Identifiant ou mot de passe incorrect.' });
  if (!id || !password) return fail();

  const { rows } = await q('SELECT * FROM users WHERE id=$1', [id]);
  const u = rows[0];
  // bcrypt exécuté même si le compte n'existe pas (temps de réponse constant)
  const ok = await bcrypt.compare(password, u?.pw_hash ?? DUMMY_HASH);

  if (u?.locked_until && new Date(u.locked_until) > new Date()) {
    await audit(req, 'login_locked', { userId: id });
    return res.status(423).json({ error: 'Compte temporairement verrouillé. Réessayez dans quelques minutes.' });
  }
  if (!u || !ok) {
    if (u) {
      const attempts = u.failed_attempts + 1;
      const lock = attempts >= config.maxFailedAttempts;
      await q('UPDATE users SET failed_attempts=$2, locked_until=$3 WHERE id=$1',
        [id, lock ? 0 : attempts, lock ? new Date(Date.now() + config.lockMinutes * 60000) : null]);
    }
    await audit(req, 'login_failed', { userId: id });
    return fail();
  }
  if (!u.actif) return res.status(403).json({ error: 'Ce compte est désactivé. Contactez le super administrateur.' });
  if (!u.super_admin && Object.keys(u.droits || {}).length === 0) {
    return res.status(403).json({ error: "Aucun droit d'accès n'a encore été attribué à ce compte." });
  }

  await q('UPDATE users SET failed_attempts=0, locked_until=NULL, last_login=now() WHERE id=$1', [id]);
  issueCookie(res, u);
  await audit(req, 'login', { userId: id });
  res.json({ user: publicUser(u) });
});

authRouter.post('/logout', (req, res) => {
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
});

authRouter.get('/me', authRequired, (req, res) => res.json({ user: publicUser(req.user) }));

authRouter.post('/change-password', authRequired, async (req, res) => {
  const { current, next } = req.body ?? {};
  if (!(await bcrypt.compare(String(current ?? ''), req.user.pw_hash)))
    return res.status(400).json({ error: 'Mot de passe actuel incorrect.' });
  const problem = passwordProblem(next, req.user.id);
  if (problem) return res.status(400).json({ error: problem });
  if (current === next) return res.status(400).json({ error: "Le nouveau mot de passe doit être différent de l'ancien." });
  const { rows } = await q(
    `UPDATE users SET pw_hash=$2, must_change_pw=false, token_version=token_version+1 WHERE id=$1 RETURNING *`,
    [req.user.id, await hashPassword(next)]
  );
  issueCookie(res, rows[0]); // les autres sessions de ce compte sont invalidées
  await audit(req, 'password_changed');
  res.json({ user: publicUser(rows[0]) });
});
