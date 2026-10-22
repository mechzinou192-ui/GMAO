// Migration des codes (LAC système à part, BILLETTIQUE -> BIL) sur une base existante.
//
//   npm run migrer-codes               simulation : rapport de ce qui changerait, RIEN n'est écrit
//   npm run migrer-codes -- --appliquer  application, en UNE transaction (tout ou rien), tracée dans le journal d'audit
//
// À faire APRÈS une sauvegarde (./scripts/backup.sh), application arrêtée ou hors des heures d'utilisation.
// Les navigateurs ouverts doivent être rechargés ensuite (les codes d'équipement changent).
import { pool, migrate } from './db.js';
import { log } from './logger.js';
import { migrerEnregistrement, migrerDroits, lignesLac } from './migration-codes-core.js';

export async function migrerCodes({ appliquer = false } = {}) {
  const client = await pool.connect();
  const rapport = { collections: {}, idsRenommes: [], comptes: 0, ajouts: [], conflits: [] };
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT collection, id, unit, system, data FROM records WHERE NOT deleted ORDER BY collection, id');
    const existants = new Set(rows.map((r) => `${r.collection}|${r.id}`));
    for (const r of rows) {
      const m = migrerEnregistrement(r);
      if (!m.change) continue;
      rapport.collections[r.collection] = (rapport.collections[r.collection] || 0) + 1;
      if (m.supprimer) {
        await client.query(`UPDATE records SET deleted=true, version=version+1, updated_at=now(), updated_by='migration' WHERE collection=$1 AND id=$2`, [r.collection, r.id]);
        continue;
      }
      if (m.id !== r.id) {
        if (existants.has(`${r.collection}|${m.id}`)) { rapport.conflits.push(`${r.collection} : ${r.id} -> ${m.id} (existe déjà)`); continue; }
        rapport.idsRenommes.push(`${r.collection} : ${r.id} -> ${m.id}`);
        // ancien code : supprimé logiquement (historique conservé) ; nouveau code : créé avec le contenu migré
        await client.query(`UPDATE records SET deleted=true, version=version+1, updated_at=now(), updated_by='migration' WHERE collection=$1 AND id=$2`, [r.collection, r.id]);
        await client.query(
          `INSERT INTO records (collection, id, unit, system, data, updated_by) VALUES ($1,$2,$3,$4,$5,'migration')
           ON CONFLICT (collection, id) DO UPDATE SET unit=EXCLUDED.unit, system=EXCLUDED.system, data=EXCLUDED.data, deleted=false, version=records.version+1, updated_at=now(), updated_by='migration'`,
          [r.collection, m.id, r.unit, m.system, JSON.stringify(m.data)]);
        existants.add(`${r.collection}|${m.id}`);
      } else {
        await client.query(`UPDATE records SET system=$3, data=$4, version=version+1, updated_at=now(), updated_by='migration' WHERE collection=$1 AND id=$2`,
          [r.collection, r.id, m.system, JSON.stringify(m.data)]);
      }
    }
    const sys = rows.filter((r) => r.collection === 'systemes').map((r) => ({ ...r, id: r.id === 'BILLETTIQUE' ? 'BIL' : r.id }));
    const arbo = rows.filter((r) => r.collection === 'arborescence');
    if (sys.length || arbo.length) {
      for (const a of lignesLac(sys, arbo)) {
        rapport.ajouts.push(`${a.collection} : ${a.id}`);
        await client.query(
          `INSERT INTO records (collection, id, unit, system, data, updated_by) VALUES ($1,$2,'',NULL,$3,'migration')
           ON CONFLICT (collection, id) DO UPDATE SET data=EXCLUDED.data, deleted=false, version=records.version+1, updated_at=now()`,
          [a.collection, a.id, JSON.stringify(a.data)]);
      }
    }
    const { rows: users } = await client.query('SELECT id, droits FROM users');
    for (const u of users) {
      const m = migrerDroits(u.droits);
      if (!m.change) continue;
      rapport.comptes++;
      await client.query('UPDATE users SET droits=$2 WHERE id=$1', [u.id, JSON.stringify(m.droits)]);
    }
    if (rapport.conflits.length || !appliquer) await client.query('ROLLBACK');
    else {
      await client.query(`INSERT INTO audit_log (user_id, action, detail) VALUES ('migration', 'migration_codes', $1)`,
        [JSON.stringify({ collections: rapport.collections, idsRenommes: rapport.idsRenommes.length, comptes: rapport.comptes, ajouts: rapport.ajouts })]);
      await client.query('COMMIT');
    }
    return { ...rapport, applique: appliquer && !rapport.conflits.length };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

// Exécution en ligne de commande
if (process.argv[1] && process.argv[1].endsWith('migrer-codes.js')) {
  const appliquer = process.argv.includes('--appliquer');
  try {
    await migrate();
    const r = await migrerCodes({ appliquer });
    console.log(JSON.stringify(r, null, 2));
    console.log(r.conflits.length ? '\nCONFLITS : rien n\'a été écrit. Corrigez les codes en double puis relancez.'
      : r.applique ? '\nMigration APPLIQUÉE. Demandez aux utilisateurs de recharger la GMAO.'
        : '\nSIMULATION : rien n\'a été écrit. Relancez avec --appliquer après une sauvegarde.');
    await pool.end();
    process.exit(r.conflits.length ? 2 : 0);
  } catch (e) {
    log.error('migration des codes en échec : rien n\'a été écrit', { erreur: e.message });
    await pool.end().catch(() => {});
    process.exit(1);
  }
}
