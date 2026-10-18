import { Router } from 'express';
import { pool, audit } from './db.js';
import { COLLECTIONS } from './rights.js';
import { validId, isObj, resolveUnit } from './records.js';

export const importRouter = Router(); // monté derrière authRequired + superAdminRequired + mustNotChangePw

export const MAX_PER_COLLECTION = 20000;

/*
 * POST /api/import
 *   { onConflict: 'skip' | 'update',          // que faire des éléments qui existent déjà (défaut : skip)
 *                                             // une ligne peut aussi porter overwrite:true pour être mise à jour dans tous les cas
 *     dryRun: true | false,                    // true : simule et annule (aucune écriture)
 *     collections: { equipements: [{ id, unit, system, data }], pieces: [...], ... } }
 *
 *  -> { dryRun, onConflict, totals: { created, updated, skipped }, collections: { nom: { created, updated, skipped } } }
 *
 * Tout ou rien : une seule transaction pour l'ensemble des collections. À la moindre ligne invalide,
 * rien n'est écrit et la réponse indique la collection et l'identifiant en cause.
 */
importRouter.post('/', async (req, res) => {
  const b = req.body ?? {};
  const onConflict = b.onConflict === undefined ? 'skip' : b.onConflict;
  if (!['skip', 'update'].includes(onConflict)) return res.status(400).json({ error: "onConflict doit valoir 'skip' ou 'update'." });
  const dryRun = b.dryRun === true;
  if (!isObj(b.collections) || !Object.keys(b.collections).length)
    return res.status(400).json({ error: 'Aucune donnée à importer.' });

  const plan = [];
  for (const [name, items] of Object.entries(b.collections)) {
    const def = COLLECTIONS[name];
    if (!def) return res.status(400).json({ error: `Collection inconnue : ${name}.` });
    if (!Array.isArray(items) || items.length > MAX_PER_COLLECTION)
      return res.status(400).json({ error: `${name} : liste invalide (max ${MAX_PER_COLLECTION} éléments).` });
    const seen = new Set();
    const rows = [];
    for (const it of items) {
      const unit = resolveUnit(def, it?.unit);
      if (unit === null) return res.status(400).json({ error: `${name} : unité invalide pour « ${it?.id} ».` });
      if (!validId(it?.id)) return res.status(400).json({ error: `${name} : identifiant invalide.` });
      if (!isObj(it.data)) return res.status(400).json({ error: `${name} : données invalides pour « ${it.id} ».` });
      if (seen.has(it.id)) return res.status(400).json({ error: `${name} : identifiant en double dans le fichier : « ${it.id} ».` });
      seen.add(it.id);
      rows.push({ id: it.id, unit, system: it.system ? String(it.system).slice(0, 40) : null, data: it.data, overwrite: it.overwrite === true });
    }
    plan.push({ name, rows });
  }

  const client = await pool.connect();
  let released = false;
  const done = () => { if (!released) { released = true; client.release(); } };
  const report = {};
  const totals = { created: 0, updated: 0, skipped: 0 };
  try {
    await client.query('BEGIN');
    for (const { name, rows } of plan) {
      const r = (report[name] = { created: 0, updated: 0, skipped: 0 });
      const ids = rows.map(x => x.id);
      const found = new Map(); // id -> deleted ?
      for (let i = 0; i < ids.length; i += 1000) {
        const { rows: ex } = await client.query(
          'SELECT id, deleted FROM records WHERE collection=$1 AND id = ANY($2::text[])', [name, ids.slice(i, i + 1000)]);
        ex.forEach(e => found.set(e.id, e.deleted));
      }
      for (const it of rows) {
        const json = JSON.stringify(it.data);
        if (!found.has(it.id)) {
          await client.query(
            `INSERT INTO records (collection, id, unit, system, data, updated_by) VALUES ($1,$2,$3,$4,$5,$6)`,
            [name, it.id, it.unit, it.system, json, req.user.id]);
          r.created++;
        } else if (found.get(it.id) === true) {   // supprimé auparavant : recréation
          await client.query(
            `UPDATE records SET unit=$3, system=$4, data=$5, deleted=false, version=version+1, updated_at=now(), updated_by=$6
             WHERE collection=$1 AND id=$2`, [name, it.id, it.unit, it.system, json, req.user.id]);
          r.created++;
        } else if (it.overwrite || onConflict === 'update') {
          await client.query(
            `UPDATE records SET unit=$3, system=$4, data=$5, version=version+1, updated_at=now(), updated_by=$6
             WHERE collection=$1 AND id=$2`, [name, it.id, it.unit, it.system, json, req.user.id]);
          r.updated++;
        } else {
          r.skipped++;
        }
      }
      totals.created += r.created; totals.updated += r.updated; totals.skipped += r.skipped;
    }
    await client.query(dryRun ? 'ROLLBACK' : 'COMMIT');
    done();
    if (!dryRun) await audit(req, 'import_excel', { detail: { onConflict, totals, collections: report } });
    res.json({ dryRun, onConflict, totals, collections: report });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(e);
    res.status(500).json({ error: "Erreur serveur : l'import a été annulé, aucune donnée n'a été modifiée." });
  } finally {
    done();
  }
});
