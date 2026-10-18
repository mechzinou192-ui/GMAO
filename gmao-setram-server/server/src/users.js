import { Router } from 'express';
import { q, audit } from './db.js';
import { hashPassword, passwordProblem, publicUser } from './auth.js';
import { validateDroits } from './rights.js';

export const usersRouter = Router(); // monté derrière authRequired + superAdminRequired

const ID_RE = /^[a-z0-9._-]{3,40}$/;

usersRouter.get('/', async (req, res) => {
  const { rows } = await q('SELECT * FROM users ORDER BY super_admin DESC, id');
  res.json({ users: rows.map(publicUser) });
});

usersRouter.post('/', async (req, res) => {
  const b = req.body ?? {};
  const id = String(b.id ?? '').trim().toLowerCase();
  if (!ID_RE.test(id)) return res.status(400).json({ error: 'Identifiant : 3 à 40 caractères (a-z, 0-9, . _ -).' });
  const nom = String(b.nom ?? '').trim();
  if (!nom) return res.status(400).json({ error: 'Nom requis.' });
  const problem = passwordProblem(b.password, id);
  if (problem) return res.status(400).json({ error: problem });
  const d = validateDroits(b.superAdmin ? {} : (b.droits ?? {}));
  if (typeof d === 'string') return res.status(400).json({ error: d });
  if ((await q('SELECT 1 FROM users WHERE id=$1', [id])).rowCount)
    return res.status(409).json({ error: 'Cet identifiant existe déjà.' });

  const { rows } = await q(
    `INSERT INTO users (id, nom, role, pw_hash, actif, super_admin, must_change_pw, droits)
     VALUES ($1,$2,$3,$4,$5,$6,true,$7) RETURNING *`,
    [id, nom, b.superAdmin ? 'Super Admin' : String(b.role ?? 'Technicien'),
     await hashPassword(b.password), b.actif !== false, !!b.superAdmin, JSON.stringify(d.value)]
  );
  await audit(req, 'user_created', { detail: { id, superAdmin: !!b.superAdmin } });
  res.status(201).json({ user: publicUser(rows[0]) });
});

usersRouter.put('/:id', async (req, res) => {
  const id = req.params.id.toLowerCase();
  const b = req.body ?? {};
  const { rows: found } = await q('SELECT * FROM users WHERE id=$1', [id]);
  const cur = found[0];
  if (!cur) return res.status(404).json({ error: 'Utilisateur introuvable.' });
  const isMe = id === req.user.id;

  const superAdmin = isMe ? true : (b.superAdmin ?? cur.super_admin);
  const actif = isMe ? true : (b.actif ?? cur.actif);
  const d = validateDroits(superAdmin ? {} : (b.droits ?? cur.droits));
  if (typeof d === 'string') return res.status(400).json({ error: d });

  let pwSql = '', params = [id, String(b.nom ?? cur.nom).trim(), superAdmin ? 'Super Admin' : String(b.role ?? cur.role),
    !!actif, !!superAdmin, JSON.stringify(d.value)];
  if (b.password) {
    const problem = passwordProblem(b.password, id);
    if (problem) return res.status(400).json({ error: problem });
    params.push(await hashPassword(b.password));
    // mot de passe réinitialisé par l'admin : changement obligatoire + sessions invalidées
    pwSql = ', pw_hash=$7, must_change_pw=true, token_version=token_version+1';
  }
  // désactivation ou retrait des droits admin : on invalide les sessions ouvertes
  const revoke = (!actif && cur.actif) || (!superAdmin && cur.super_admin) ? ', token_version=token_version+1' : '';
  const { rows } = await q(
    `UPDATE users SET nom=$2, role=$3, actif=$4, super_admin=$5, droits=$6${pwSql}${revoke}
     WHERE id=$1 RETURNING *`, params);
  await audit(req, 'user_updated', { detail: { id, passwordReset: !!b.password, actif, superAdmin } });
  res.json({ user: publicUser(rows[0]) });
});

usersRouter.delete('/:id', async (req, res) => {
  const id = req.params.id.toLowerCase();
  if (id === req.user.id) return res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte.' });
  const r = await q('DELETE FROM users WHERE id=$1', [id]);
  if (!r.rowCount) return res.status(404).json({ error: 'Utilisateur introuvable.' });
  await audit(req, 'user_deleted', { detail: { id } });
  res.json({ ok: true });
});

usersRouter.get('/audit/log', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 200, 1000);
  const { rows } = await q('SELECT * FROM audit_log ORDER BY at DESC LIMIT $1', [limit]);
  res.json({ entries: rows });
});
