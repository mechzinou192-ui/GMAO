import { Router } from 'express';
import { pool, audit } from './db.js';
import { preparerReinitialisation, filtreSql } from './reinitialisation-core.js';
import { config } from './config.js';
import { log } from './logger.js';

export const reinitRouter = Router(); // monté derrière authRequired + superAdminRequired + mustNotChangePw

/*
 * POST /api/admin/reinitialiser
 *   { confirmation: "REPARTIR DE ZERO", sauvegardeFaite: true, collections?: [...], unit?: "Oran", system?: "CFO",
 *     referentiels?: false (ancien format), numerotation?: true }
 *   -> { reinitialisation, collections: { nom: nombre archivé }, total, numerotation, unit, system }
 *
 * Périmètre au choix : catégories, une seule unité, un seul système (voir reinitialisation-core.js).
 *
 * Tout ou rien (une transaction) : copie des éléments dans records_archive, puis suppression LOGIQUE
 * (deleted=true, version+1 : les autres navigateurs ouverts voient la suppression à leur prochaine synchronisation).
 * Comptes utilisateurs et journal d'audit conservés. Numérotation remise à 1 si demandé (DI-…-0001) ; avec une unité, seuls les compteurs de cette unité ; jamais avec un système.
 */
reinitRouter.post('/reinitialiser', async (req, res) => {
  let p;
  try { p = preparerReinitialisation(req.body, { units: config.units }); } catch (e) { return res.status(e.status || 400).json({ error: e.message }); }

  const client = await pool.connect();
  let released = false;
  const done = () => { if (!released) { released = true; client.release(); } };
  try {
    await client.query('BEGIN');
    const compteurs = p.sequences.length
      ? (await client.query('SELECT name, scope, year, last FROM counters WHERE name = ANY($1::text[]) AND ($2::text[] IS NULL OR scope = ANY($2::text[]))', [p.sequences, p.scopes])).rows
      : [];
    const { rows: [op] } = await client.query(
      `INSERT INTO reinitialisations (user_id, collections, numerotation, compteurs, totaux, unite, systeme) VALUES ($1,$2,$3,$4,'{}',$5,$6) RETURNING id`,
      [req.user.id, p.collections, p.numerotation, JSON.stringify(compteurs), p.unit || null, p.system || null]);
    const totaux = {};
    let total = 0;
    for (const c of p.collections) {
      const f = filtreSql(c, p, 1);          // $1 = numéro d'opération (archivage) ou utilisateur (mise à jour)
      const { rowCount } = await client.query(
        `INSERT INTO records_archive (reinitialisation, collection, id, unit, system, data, version, created_at, updated_at, updated_by)
         SELECT $1, collection, id, unit, system, data, version, created_at, updated_at, updated_by
         FROM records WHERE ${f.where}`, [op.id, ...f.params]);
      await client.query(
        `UPDATE records SET deleted=true, version=version+1, updated_at=now(), updated_by=$1 WHERE ${f.where}`,
        [req.user.id, ...f.params]);
      totaux[c] = rowCount; total += rowCount;
    }
    // photos des DI / OT archivés : retirées de l'affichage (les fichiers restent sur le disque). Uniquement pour une
    // remise à zéro complète de la catégorie : avec une unité ou un système, les photos restent rattachées (et invisibles)
    if (!p.unit && !p.system)
      await client.query(
        `UPDATE files SET deleted=true WHERE NOT deleted AND collection = ANY($1::text[])`, [p.collections.filter(c => c === 'dis' || c === 'bts')]);
    if (p.sequences.length)
      await client.query('DELETE FROM counters WHERE name = ANY($1::text[]) AND ($2::text[] IS NULL OR scope = ANY($2::text[]))', [p.sequences, p.scopes]);
    await client.query('UPDATE reinitialisations SET totaux=$2 WHERE id=$1', [op.id, JSON.stringify(totaux)]);
    await client.query('COMMIT');
    done();
    await audit(req, 'reinitialisation', { detail: { reinitialisation: Number(op.id), collections: totaux, total, numerotation: p.numerotation, unit: p.unit || null, system: p.system || null } });
    log.warn('données remises à zéro', { requestId: req.id, utilisateur: req.user.id, reinitialisation: Number(op.id), total });
    res.json({ reinitialisation: Number(op.id), collections: totaux, total, numerotation: p.numerotation, unit: p.unit || null, system: p.system || null });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    log.error('erreur serveur', { requestId: req.id, path: req.originalUrl.split('?')[0], erreur: e.message, pile: e.stack });
    res.status(500).json({ error: "Erreur serveur : la remise à zéro a été annulée, aucune donnée n'a été modifiée." });
  } finally {
    done();
  }
});
