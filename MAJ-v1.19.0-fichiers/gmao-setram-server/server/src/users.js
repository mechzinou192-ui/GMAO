import { Router } from 'express';
import { q, audit } from './db.js';
import { hashPassword, passwordProblem, publicUser } from './auth.js';
import { validateDroits } from './rights.js';
import { nomsProfils, nomProfil, normaliserDroitsProfil, peutGererComptes, compteDansPerimetre, profilsDelegables, catalogue } from './profils-core.js';
import { adresseValide } from './mail.js';

// Monté derrière authRequired. Accès : super administrateur, ou administrateur UO à qui le super administrateur
// a donné la main (gestion_comptes) — et alors uniquement pour les comptes de SES unités, hors administrateurs / experts.
export const usersRouter = Router();

usersRouter.use((req, res, next) =>
  (peutGererComptes(req.user) ? next() : res.status(403).json({ error: 'Gestion des comptes réservée au super administrateur (ou à l\'administrateur UO à qui il en a donné la main).' })));
const superAdminSeul = (req, res, next) => (req.user.super_admin ? next() : res.status(403).json({ error: 'Réservé au super administrateur' }));

const ID_RE = /^[a-z0-9._-]{3,40}$/;
const ROLE_SUPER = 'Super Admin';

// Contrôle commun création / modification : profil connu, droits valides et limités au profil, e-mail, périmètre délégué
function preparer(req, b, cur) {
  const superAdmin = !!(cur && cur.id === req.user.id) || (req.user.super_admin ? !!(b.superAdmin ?? cur?.super_admin) : false);
  const role = superAdmin ? ROLE_SUPER : nomProfil(String(b.role ?? cur?.role ?? 'Technicien'));
  if (!superAdmin && !nomsProfils().includes(role)) return { erreur: `Profil inconnu : « ${role} ».` };
  if (!req.user.super_admin && !profilsDelegables().includes(role)) return { erreur: 'Ce profil ne peut être attribué que par le super administrateur.' };
  const d = validateDroits(superAdmin ? {} : (b.droits ?? cur?.droits ?? {}));
  if (typeof d === 'string') return { erreur: d };
  const droits = superAdmin ? {} : normaliserDroitsProfil(role, d.value);
  const email = b.email === undefined ? (cur?.email ?? null) : (String(b.email || '').trim() || null);
  if (email && !adresseValide(email)) return { erreur: 'Adresse e-mail invalide.' };
  // la main sur les comptes : donnée et retirée par le super administrateur seul, à un administrateur UO seulement
  let gestion = cur?.gestion_comptes ?? false;
  if (b.gestionComptes !== undefined) {
    if (!req.user.super_admin) return { erreur: 'Seul le super administrateur donne ou retire la gestion des comptes.' };
    gestion = !!b.gestionComptes;
  }
  if (!catalogue()[role]?.delegationComptes) gestion = false;
  const cible = { role, super_admin: superAdmin, droits };
  if (!compteDansPerimetre(req.user, cible)) return { erreur: 'Ce compte sort de votre périmètre (vos unités, profils délégables).', statut: 403 };
  return { superAdmin, role, droits, email, gestion };
}

usersRouter.get('/', async (req, res) => {
  const { rows } = await q('SELECT * FROM users ORDER BY super_admin DESC, id');
  // administrateur UO : ses propres comptes délégués seulement (+ lui-même, en lecture)
  const visibles = req.user.super_admin ? rows : rows.filter((u) => u.id === req.user.id || compteDansPerimetre(req.user, u));
  res.json({ users: visibles.map(publicUser) });
});

usersRouter.post('/', async (req, res) => {
  const b = req.body ?? {};
  const id = String(b.id ?? '').trim().toLowerCase();
  if (!ID_RE.test(id)) return res.status(400).json({ error: 'Identifiant : 3 à 40 caractères (a-z, 0-9, . _ -).' });
  const nom = String(b.nom ?? '').trim();
  if (!nom) return res.status(400).json({ error: 'Nom requis.' });
  const problem = passwordProblem(b.password, id);
  if (problem) return res.status(400).json({ error: problem });
  const p = preparer(req, b, null);
  if (p.erreur) return res.status(p.statut || 400).json({ error: p.erreur });
  if ((await q('SELECT 1 FROM users WHERE id=$1', [id])).rowCount)
    return res.status(409).json({ error: 'Cet identifiant existe déjà.' });

  const { rows } = await q(
    `INSERT INTO users (id, nom, role, pw_hash, actif, super_admin, must_change_pw, droits, email, gestion_comptes)
     VALUES ($1,$2,$3,$4,$5,$6,true,$7,$8,$9) RETURNING *`,
    [id, nom, p.role, await hashPassword(b.password), b.actif !== false, p.superAdmin, JSON.stringify(p.droits), p.email, p.gestion]
  );
  await audit(req, 'user_created', { detail: { id, role: p.role, superAdmin: p.superAdmin, gestionComptes: p.gestion } });
  res.status(201).json({ user: publicUser(rows[0]) });
});

usersRouter.put('/:id', async (req, res) => {
  const id = req.params.id.toLowerCase();
  const b = req.body ?? {};
  const { rows: found } = await q('SELECT * FROM users WHERE id=$1', [id]);
  const cur = found[0];
  if (!cur) return res.status(404).json({ error: 'Utilisateur introuvable.' });
  const isMe = id === req.user.id;
  if (!req.user.super_admin && (isMe || !compteDansPerimetre(req.user, cur)))
    return res.status(403).json({ error: 'Ce compte sort de votre périmètre.' });
  const p = preparer(req, b, cur);
  if (p.erreur) return res.status(p.statut || 400).json({ error: p.erreur });
  const actif = isMe ? true : (b.actif ?? cur.actif);

  const params = [id, String(b.nom ?? cur.nom).trim(), p.role, !!actif, p.superAdmin, JSON.stringify(p.droits), p.email, p.gestion];
  let pwSql = '';
  if (b.password) {
    const problem = passwordProblem(b.password, id);
    if (problem) return res.status(400).json({ error: problem });
    params.push(await hashPassword(b.password));
    // mot de passe réinitialisé par l'admin : changement obligatoire + sessions invalidées
    pwSql = `, pw_hash=$${params.length}, must_change_pw=true, token_version=token_version+1`;
  }
  // désactivation ou retrait des droits admin : on invalide les sessions ouvertes
  const revoke = (!actif && cur.actif) || (!p.superAdmin && cur.super_admin) ? ', token_version=token_version+1' : '';
  const { rows } = await q(
    `UPDATE users SET nom=$2, role=$3, actif=$4, super_admin=$5, droits=$6, email=$7, gestion_comptes=$8${pwSql}${revoke}
     WHERE id=$1 RETURNING *`, params);
  await audit(req, 'user_updated', { detail: { id, role: p.role, passwordReset: !!b.password, actif, superAdmin: p.superAdmin,
    ...(cur.gestion_comptes !== p.gestion ? { gestionComptes: p.gestion } : {}) } });
  res.json({ user: publicUser(rows[0]) });
});

usersRouter.delete('/:id', async (req, res) => {
  const id = req.params.id.toLowerCase();
  if (id === req.user.id) return res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte.' });
  const { rows } = await q('SELECT * FROM users WHERE id=$1', [id]);
  if (!rows[0]) return res.status(404).json({ error: 'Utilisateur introuvable.' });
  if (!compteDansPerimetre(req.user, rows[0])) return res.status(403).json({ error: 'Ce compte sort de votre périmètre.' });
  await q('DELETE FROM users WHERE id=$1', [id]);
  await audit(req, 'user_deleted', { detail: { id } });
  res.json({ ok: true });
});

usersRouter.get('/audit/log', superAdminSeul, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 200, 1000);
  const { rows } = await q('SELECT * FROM audit_log ORDER BY at DESC LIMIT $1', [limit]);
  res.json({ entries: rows });
});
