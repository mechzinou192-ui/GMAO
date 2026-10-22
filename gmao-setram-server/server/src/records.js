import { Router } from 'express';
import { pool, q, audit } from './db.js';
import { controleProfil, ajusterValidation, catalogue, nomProfil } from './profils-core.js';
import { ajusterRapport } from './rapports-core.js';
import { rechargerProfils } from './profils.js';
import { notifier } from './notifications.js';
import { config } from './config.js';
import { COLLECTIONS, canRead, canWrite } from './rights.js';
import { SEQUENCES, sequenceKey, reserveCodes, MAX_BATCH } from './numbering.js';
import { ARCHIVABLES, lireFenetre, limiteFenetre } from './archives-core.js';
import { log } from './logger.js';

export const dataRouter = Router(); // monté derrière authRequired + mustNotChangePw

const toApi = (r) => ({
  id: r.id, unit: r.unit, system: r.system, data: r.data, version: r.version,
  deleted: r.deleted, createdAt: r.created_at, updatedAt: r.updated_at, updatedBy: r.updated_by,
});

function collectionOf(req, res, next) {
  const def = COLLECTIONS[req.params.collection];
  if (!def) return res.status(404).json({ error: 'Collection inconnue.' });
  req.def = def;
  next();
}

export const validId = (id) => typeof id === 'string' && id.trim().length > 0 && id.length <= 200;
export const isObj = (o) => o && typeof o === 'object' && !Array.isArray(o);

// Résumé « avant / après » pour le journal d'audit : seules les rubriques modifiées sont conservées,
// valeurs tronquées pour que le journal reste léger.
const clip = (v) => {
  if (v === undefined) return null;
  const t = typeof v === 'string' ? v : JSON.stringify(v);
  return t.length > 200 ? t.slice(0, 200) + '…' : (typeof v === 'string' ? v : JSON.parse(t));
};
export function snapshot(data, max = 12) {
  const out = {};
  let n = 0;
  for (const [k, v] of Object.entries(isObj(data) ? data : {})) {
    if (n++ >= max) { out['…'] = 'autres rubriques non détaillées'; break; }
    out[k] = clip(v);
  }
  return out;
}
export function diffData(before, after, max = 30) {
  const a = isObj(before) ? before : {}, b = isObj(after) ? after : {};
  const changes = {};
  let n = 0;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (JSON.stringify(a[k]) === JSON.stringify(b[k])) continue;
    if (n++ >= max) { changes['…'] = 'autres modifications non détaillées'; break; }
    changes[k] = [clip(a[k]), clip(b[k])];
  }
  return changes;
}

export function resolveUnit(def, raw) {
  if (def.shared) return '';
  const unit = String(raw ?? '');
  return config.units.includes(unit) ? unit : null;
}

// Lecture : ?unit=Alger (optionnel pour super admin / multi-unités)
// &since=ISO pour ne récupérer que les changements (suppressions incluses)
// &fenetre=N (mois) : DI / OT clos depuis plus de N mois laissés de côté (voir archives-core.js)
dataRouter.get('/:collection', collectionOf, async (req, res) => {
  const serverTime = new Date().toISOString();
  const { unit, since } = req.query;
  const fenetre = lireFenetre(req.query.fenetre);
  if (Number.isNaN(fenetre)) return res.status(400).json({ error: 'fenetre invalide' });
  const params = [req.params.collection];
  let sql = 'SELECT * FROM records WHERE collection=$1';
  if (unit) { params.push(String(unit)); sql += ` AND unit=$${params.length}`; }
  // Pré-filtre en base sur les unités autorisées (le contrôle fin ligne par ligne reste fait ci-dessous)
  if (!req.user.super_admin && !req.def.shared && !req.def.readAll) {
    params.push(Object.keys(req.user.droits || {})); sql += ` AND unit = ANY($${params.length})`;
  }
  if (fenetre && ARCHIVABLES[req.params.collection] && !since) {
    params.push(ARCHIVABLES[req.params.collection]); const pe = params.length;
    params.push(limiteFenetre(fenetre)); const pl = params.length;
    sql += ` AND NOT (data->>'etat' = ANY($${pe}) AND updated_at < $${pl})`;
  }
  if (since) {
    const d = new Date(String(since));
    if (isNaN(d)) return res.status(400).json({ error: 'since invalide' });
    params.push(d); sql += ` AND updated_at > $${params.length}`;
  } else {
    sql += ' AND deleted=false';
  }
  const { rows } = await q(sql + ' ORDER BY created_at, id', params);
  // Le filtrage par droits est appliqué ligne par ligne, côté serveur.
  const visible = rows.filter(r => canRead(req.user, req.params.collection, r.unit, r.system));
  res.json({ items: visible.map(toApi), serverTime });
});

// Numérotation par le serveur : réserve 1..n numéros uniques (jamais deux fois le même).
//   POST /api/data/dis/next-code        { unit: "Alger" }                 -> { codes: ["DI-ALG-2026-0001"] }
//   POST /api/data/bts/next-code        { unit: "Alger", variant: "prev", count: 5 }
//   POST /api/data/pieces/next-code     { variant: "P" }                  -> { codes: ["P-001"] }
// Un numéro réservé puis non utilisé (erreur réseau, abandon) n'est pas réattribué : la suite peut comporter des trous.
dataRouter.post('/:collection/next-code', collectionOf, async (req, res) => {
  const { collection } = req.params;
  const b = req.body ?? {};
  const key = sequenceKey(collection, b.variant ? String(b.variant) : '');
  const def = SEQUENCES[key];
  if (!def) return res.status(404).json({ error: 'Pas de numérotation pour cette collection.' });
  const unit = def.perUnit ? String(b.unit ?? '') : '';
  if (def.perUnit && !config.units.includes(unit)) return res.status(400).json({ error: 'Unité invalide.' });
  const count = b.count === undefined ? 1 : Number(b.count);
  if (!Number.isInteger(count) || count < 1 || count > MAX_BATCH)
    return res.status(400).json({ error: `count doit être compris entre 1 et ${MAX_BATCH}.` });
  if (!canWrite(req.user, collection, def.perUnit ? unit : '', null))
    return res.status(403).json({ error: "Vous n'avez pas le droit de créer ces données." });
  try {
    const codes = await reserveCodes(key, { unit, count });
    res.json({ codes });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    log.error('erreur serveur', { requestId: req.id, path: req.originalUrl.split('?')[0], erreur: e.message, pile: e.stack });
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// Création / modification d'un objet (verrou optimiste via `version`)
dataRouter.put('/:collection/:id', collectionOf, async (req, res) => {
  const { collection } = req.params;
  const id = req.params.id;
  const b = req.body ?? {};
  if (!validId(id)) return res.status(400).json({ error: 'Identifiant invalide.' });
  if (!isObj(b.data)) return res.status(400).json({ error: '`data` doit être un objet.' });
  const unit = resolveUnit(req.def, b.unit);
  if (unit === null) return res.status(400).json({ error: 'Unité invalide.' });
  const system = b.system ? String(b.system).slice(0, 40) : null;

  if (!canWrite(req.user, collection, unit, system))
    return res.status(403).json({ error: "Vous n'avez pas le droit de modifier ces données." });

  const client = await pool.connect();
  let released = false;
  const done = () => { if (!released) { released = true; client.release(); } };
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'SELECT * FROM records WHERE collection=$1 AND id=$2 FOR UPDATE', [collection, id]);
    const cur = rows[0];
    const avant = cur && !cur.deleted ? cur.data : null;
    // profil : ce que la personne a le droit de faire (technicien sans clôture, exploitation DI seulement, expert = validation…)
    const refus = controleProfil(req.user, collection, avant, b.data);
    if (refus) { await client.query('ROLLBACK'); return res.status(403).json({ error: refus, code: 'PROFIL' }); }
    b.data = ajusterValidation(req.user, collection, avant, b.data);   // modification d'un référentiel / clôture : « À valider » par la DG
    if (collection === 'rapports') {
      // experts DG attendus pour la revue : comptes actifs au rôle « expert » ayant le volet rapports sur l'unité
      const { rows: comptes } = await client.query('SELECT id, nom, role, droits FROM users WHERE actif AND NOT super_admin');
      const experts = comptes.filter((u) => catalogue()[nomProfil(u.role)]?.rapports === 'expert' && (u.droits?.[unit]?.volets || []).includes(7));
      b.data = ajusterRapport(req.user, avant, b.data, { experts });
      if (b.data.etat === 'Envoyé' && avant?.etat !== 'Envoyé' && !experts.length) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Aucun expert DG n’a accès aux rapports de cette unité : le rapport ne peut pas être envoyé. Contactez le super administrateur.', code: 'SANS_EXPERT' });
      }
    }
    let out;
    if (cur && !cur.deleted) {
      // il faut aussi avoir le droit sur l'emplacement actuel (pas de déplacement vers/depuis une unité interdite)
      if (!canWrite(req.user, collection, cur.unit, cur.system)) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: "Vous n'avez pas le droit de modifier ces données." });
      }
      if (b.version === undefined || b.version === null) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: 'Ce code existe déjà (créé par un autre utilisateur).', code: 'EXISTS', current: toApi(cur) });
      }
      if (Number(b.version) !== cur.version) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: 'Cet élément a été modifié par un autre utilisateur.', code: 'CONFLICT', current: toApi(cur) });
      }
      out = (await client.query(
        `UPDATE records SET unit=$3, system=$4, data=$5, version=version+1, updated_at=now(), updated_by=$6
         WHERE collection=$1 AND id=$2 RETURNING *`,
        [collection, id, unit, system, JSON.stringify(b.data), req.user.id])).rows[0];
    } else if (cur) { // élément supprimé : recréation
      out = (await client.query(
        `UPDATE records SET unit=$3, system=$4, data=$5, version=version+1, deleted=false, updated_at=now(), updated_by=$6
         WHERE collection=$1 AND id=$2 RETURNING *`,
        [collection, id, unit, system, JSON.stringify(b.data), req.user.id])).rows[0];
    } else {
      out = (await client.query(
        `INSERT INTO records (collection, id, unit, system, data, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [collection, id, unit, system, JSON.stringify(b.data), req.user.id])).rows[0];
    }
    await client.query('COMMIT');
    done();
    const wasLive = cur && !cur.deleted;
    await audit(req, wasLive ? 'update' : 'create', {
      collection, recordId: id, unit,
      detail: wasLive
        ? { version: out.version, system, changes: diffData(cur.data, out.data) }
        : { version: out.version, system, recreated: !!cur },
    });
    res.json(toApi(out));
    if (collection === 'profils') rechargerProfils();
    notifier(req.user, collection, id, unit, system, avant, out.data);   // après la réponse : n'allonge pas la saisie
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    log.error('erreur serveur', { requestId: req.id, path: req.originalUrl.split('?')[0], erreur: e.message, pile: e.stack });
    res.status(500).json({ error: 'Erreur serveur.' });
  } finally {
    done();
  }
});

// Suppression (logique : l'historique et l'audit sont conservés)
dataRouter.delete('/:collection/:id', collectionOf, async (req, res) => {
  const { collection, id } = req.params;
  const { rows } = await q('SELECT * FROM records WHERE collection=$1 AND id=$2 AND deleted=false', [collection, id]);
  const cur = rows[0];
  if (!cur) return res.status(404).json({ error: 'Élément introuvable.' });
  if (!canWrite(req.user, collection, cur.unit, cur.system))
    return res.status(403).json({ error: "Vous n'avez pas le droit de supprimer ces données." });
  const refus = controleProfil(req.user, collection, cur.data, null);
  if (refus) return res.status(403).json({ error: refus, code: 'PROFIL' });
  await q(`UPDATE records SET deleted=true, version=version+1, updated_at=now(), updated_by=$3
           WHERE collection=$1 AND id=$2`, [collection, id, req.user.id]);
  await audit(req, 'delete', { collection, recordId: id, unit: cur.unit, detail: { version: cur.version + 1, system: cur.system, before: snapshot(cur.data) } });
  if (collection === 'profils') rechargerProfils();
  res.json({ ok: true });
});

// Import en masse (reprise de données initiales) — super administrateur uniquement
dataRouter.post('/:collection/bulk', collectionOf, async (req, res) => {
  if (!req.user.super_admin) return res.status(403).json({ error: 'Réservé au super administrateur.' });
  const { collection } = req.params;
  const items = req.body?.items;
  if (!Array.isArray(items) || items.length > 20000) return res.status(400).json({ error: 'items invalide (max 20 000).' });
  const client = await pool.connect();
  let released = false;
  const done = () => { if (!released) { released = true; client.release(); } };
  try {
    await client.query('BEGIN');
    for (const it of items) {
      const unit = resolveUnit(req.def, it.unit ?? req.body.unit);
      if (unit === null || !validId(it.id) || !isObj(it.data)) throw new Error(`élément invalide : ${it?.id}`);
      await client.query(
        `INSERT INTO records (collection, id, unit, system, data, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (collection, id) DO UPDATE
           SET unit=EXCLUDED.unit, system=EXCLUDED.system, data=EXCLUDED.data,
               version=records.version+1, deleted=false, updated_at=now(), updated_by=EXCLUDED.updated_by`,
        [collection, it.id, unit, it.system ?? null, JSON.stringify(it.data), req.user.id]);
    }
    await client.query('COMMIT');
    done();
    await audit(req, 'bulk_import', { collection, detail: { count: items.length } });
    res.json({ imported: items.length });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(400).json({ error: e.message });
  } finally {
    done();
  }
});
