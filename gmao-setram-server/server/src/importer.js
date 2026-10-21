import { Router } from 'express';
import { pool, audit } from './db.js';
import { COLLECTIONS } from './rights.js';
import { validId, isObj, resolveUnit } from './records.js';
import { log } from './logger.js';
import { config } from './config.js';

export const importRouter = Router(); // monté derrière authRequired + superAdminRequired + mustNotChangePw

// lignes par collection et par import (IMPORT_MAX_LIGNES, 100 000 par défaut)
export const maxParCollection = () => config.importMaxLignes;
const LOT = 1000;   // écritures groupées par 1 000 lignes (une requête SQL par lot)

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
    if (!Array.isArray(items) || items.length > maxParCollection())
      return res.status(400).json({ error: `${name} : liste invalide (max ${maxParCollection()} éléments).` });
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
      // tri des lignes, puis écriture groupée par lots (une requête SQL pour 1 000 lignes au lieu d'une par ligne)
      const nouveaux = [], recrees = [], majs = [];
      for (const it of rows) {
        if (!found.has(it.id)) nouveaux.push(it);
        else if (found.get(it.id) === true) recrees.push(it);         // supprimé auparavant : recréation
        else if (it.overwrite || onConflict === 'update') majs.push(it);
        else r.skipped++;
      }
      const cols = (l) => [l.map(x => x.id), l.map(x => x.unit), l.map(x => x.system), l.map(x => JSON.stringify(x.data))];
      for (let i = 0; i < nouveaux.length; i += LOT) {
        const [ids, units, systems, datas] = cols(nouveaux.slice(i, i + LOT));
        await client.query(
          `INSERT INTO records (collection, id, unit, system, data, updated_by)
           SELECT $1, t.id, t.unit, t.system, t.data::jsonb, $6
           FROM unnest($2::text[], $3::text[], $4::text[], $5::text[]) AS t(id, unit, system, data)`,
          [name, ids, units, systems, datas, req.user.id]);
      }
      for (const [liste, recreer] of [[recrees, true], [majs, false]]) {
        for (let i = 0; i < liste.length; i += LOT) {
          const [ids, units, systems, datas] = cols(liste.slice(i, i + LOT));
          await client.query(
            `UPDATE records r SET unit=t.unit, system=t.system, data=t.data::jsonb, ${recreer ? 'deleted=false, ' : ''}version=r.version+1, updated_at=now(), updated_by=$6
             FROM unnest($2::text[], $3::text[], $4::text[], $5::text[]) AS t(id, unit, system, data)
             WHERE r.collection=$1 AND r.id=t.id`,
            [name, ids, units, systems, datas, req.user.id]);
        }
      }
      r.created += nouveaux.length + recrees.length; r.updated += majs.length;
      totals.created += r.created; totals.updated += r.updated; totals.skipped += r.skipped;
    }
    await client.query(dryRun ? 'ROLLBACK' : 'COMMIT');
    done();
    if (!dryRun) await audit(req, 'import_excel', { detail: { onConflict, totals, collections: report } });
    res.json({ dryRun, onConflict, totals, collections: report });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    log.error('erreur serveur', { requestId: req.id, path: req.originalUrl.split('?')[0], erreur: e.message, pile: e.stack });
    res.status(500).json({ error: "Erreur serveur : l'import a été annulé, aucune donnée n'a été modifiée." });
  } finally {
    done();
  }
});
