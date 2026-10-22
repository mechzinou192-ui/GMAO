import { Router } from 'express';
import { q } from './db.js';
import { evenements, estDestinataire } from './notifications-core.js';
import { envoyerNotification } from './mail.js';
import { log } from './logger.js';

export const notificationsRouter = Router(); // monté derrière authRequired

// Crée les notifications d'un changement d'état (appelé après l'enregistrement) ; e-mail en plus si configuré.
export async function notifier(auteur, collection, recordId, unit, system, cur, next) {
  try {
    const evts = evenements(collection, cur, next, auteur);
    if (!evts.length) return;
    const { rows: comptes } = await q('SELECT id, role, actif, droits, super_admin, email FROM users WHERE actif');
    for (const evt of evts) {
      const dest = comptes.filter((u) => estDestinataire(u, evt, unit, system, auteur.id));
      if (!dest.length) continue;
      await q(`INSERT INTO notifications (user_id, type, collection, record_id, unit, texte)
               SELECT x, $2, $3, $4, $5, $6 FROM unnest($1::text[]) AS x`,
      [dest.map((u) => u.id), evt.type, collection, recordId, unit || null, evt.texte]);
      envoyerNotification(dest.map((u) => u.email).filter(Boolean), evt.texte);   // sans attendre : n'allonge pas la requête
    }
  } catch (e) {
    log.error('notification non créée', { erreur: e.message });
  }
}

// GET /api/notifications -> { items: [ 50 dernières ], nonLues }
notificationsRouter.get('/', async (req, res) => {
  const { rows } = await q('SELECT id, at, type, collection, record_id, unit, texte, lu FROM notifications WHERE user_id=$1 ORDER BY at DESC, id DESC LIMIT 50', [req.user.id]);
  const { rows: [n] } = await q('SELECT count(*)::int AS n FROM notifications WHERE user_id=$1 AND NOT lu', [req.user.id]);
  res.json({ items: rows.map((r) => ({ id: Number(r.id), at: r.at, type: r.type, collection: r.collection, recordId: r.record_id, unit: r.unit, texte: r.texte, lu: r.lu })), nonLues: n.n });
});

// POST /api/notifications/lues { ids: [..] } ou { tout: true }
notificationsRouter.post('/lues', async (req, res) => {
  const b = req.body ?? {};
  if (b.tout === true) await q('UPDATE notifications SET lu=true WHERE user_id=$1 AND NOT lu', [req.user.id]);
  else {
    const ids = Array.isArray(b.ids) ? b.ids.map(Number).filter(Number.isInteger).slice(0, 500) : [];
    if (!ids.length) return res.status(400).json({ error: 'ids ou tout attendu.' });
    await q('UPDATE notifications SET lu=true WHERE user_id=$1 AND id = ANY($2::bigint[])', [req.user.id, ids]);
  }
  res.json({ ok: true });
});
