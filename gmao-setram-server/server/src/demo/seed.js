import fs from 'node:fs';
import { config } from '../config.js';
import { q, pool } from '../db.js';
import { hashPassword } from '../auth.js';
import { genererDemo } from './donnees.js';
import { lignesReferentiels } from './referentiels.js';

/*
 * MODE DÉMONSTRATION (variable d'environnement DEMO=1) — à n'utiliser QUE sur une instance publique de présentation.
 * Crée des comptes aux mots de passe PUBLICS et des données FICTIVES ; interdit la gestion des comptes et le changement
 * de mot de passe ; remet tout à zéro périodiquement. Ne jamais l'activer sur une instance contenant de vraies données.
 */

export const comptesPublics = (users) => users.map(({ id, password, role, nom, description }) => ({ id, motDePasse: password, role, nom, description }));

export async function demoDejaPresente() {
  const { rows } = await q("SELECT count(*)::int AS n FROM users WHERE id = 'demo.admin'");
  return rows[0].n > 0;
}

export async function seedDemo(now = new Date()) {
  const d = genererDemo(now);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const u of d.users) {
      await client.query(
        `INSERT INTO users (id, nom, role, pw_hash, super_admin, must_change_pw, droits) VALUES ($1,$2,$3,$4,$5,false,$6)
         ON CONFLICT (id) DO NOTHING`, [u.id, u.nom, u.role, await hashPassword(u.password), u.superAdmin, JSON.stringify(u.droits)]);
    }
    const ins = (collection, r) => client.query(
      `INSERT INTO records (collection, id, unit, system, data, updated_by) VALUES ($1,$2,$3,$4,$5,'demo') ON CONFLICT (collection, id) DO NOTHING`,
      [collection, r.id, r.unit, r.system, JSON.stringify(r.data)]);
    const ref = lignesReferentiels();
    for (const r of ref.systemes) await ins('systemes', { id: r.id, unit: '', system: null, data: r.data });
    for (const r of ref.arborescence) await ins('arborescence', { id: r.id, unit: '', system: null, data: r.data });
    for (const [collection, liste] of Object.entries(d.collections)) for (const r of liste) await ins(collection, r);
    for (const c of d.compteurs)
      await client.query(`INSERT INTO counters (name, scope, year, last) VALUES ($1,$2,$3,$4) ON CONFLICT (name, scope, year) DO UPDATE SET last = GREATEST(counters.last, EXCLUDED.last)`, [c.name, c.scope, c.year, c.last]);
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e; } finally { client.release(); }
  return d;
}

export async function resetDemo(now = new Date()) {
  await q('DELETE FROM records');
  await q('DELETE FROM counters');
  await q('DELETE FROM files');
  await q('DELETE FROM audit_log');
  await q("DELETE FROM users WHERE id LIKE 'demo.%'");
  try { fs.rmSync(config.filesDir, { recursive: true, force: true }); } catch { /* dossier absent : rien à nettoyer */ }
  return seedDemo(now);
}

export async function initDemo() {
  if (!config.demo) return;
  console.log('\n*** MODE DÉMONSTRATION ACTIF : comptes publics, données fictives, remises à zéro régulières. NE PAS UTILISER AVEC DE VRAIES DONNÉES. ***\n');
  if (!(await demoDejaPresente())) { const d = await seedDemo(); console.log(`[démo] données créées : ${d.collections.dis.length} DI, ${d.collections.bts.length} OT, ${d.collections.equipements.length} équipements.`); }
  if (config.demoResetHours > 0) {
    const t = setInterval(() => resetDemo().then(() => console.log('[démo] remise à zéro effectuée')).catch((e) => console.error('[démo] échec de la remise à zéro', e)), config.demoResetHours * 3600 * 1000);
    t.unref();
  }
}
