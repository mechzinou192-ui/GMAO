import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { config } from './config.js';
import { log } from './logger.js';

// Mode local : PGlite (PostgreSQL embarqué, 1 connexion). Un verrou garantit que les transactions
// de requêtes simultanées ne s'entremêlent pas. Même interface que pg.Pool.
async function createLocalPool() {
  const { PGlite } = await import('@electric-sql/pglite');
  fs.mkdirSync(config.dataDir, { recursive: true });
  const db = new PGlite(path.join(config.dataDir, 'pgdata'));
  await db.waitReady;
  let tail = Promise.resolve();
  const lock = () => {
    let release;
    const gate = new Promise(r => (release = r));
    const turn = tail.then(() => release);
    tail = tail.then(() => gate);
    return turn;
  };
  const run = async (text, params) => {
    if (params === undefined) {                         // plusieurs instructions (migrations, BEGIN...)
      const res = await db.exec(text);
      const last = res[res.length - 1] || { rows: [] };
      return { rows: last.rows, rowCount: last.affectedRows ?? last.rows.length };
    }
    const res = await db.query(text, params);
    return { rows: res.rows, rowCount: res.affectedRows ?? res.rows.length };
  };
  return {
    query: async (text, params) => { const release = await lock(); try { return await run(text, params); } finally { release(); } },
    connect: async () => {
      const release = await lock();
      return { query: (text, params) => run(text, params), release };
    },
    end: async () => { await db.close(); },
  };
}

export const pool = config.localMode
  ? await createLocalPool()
  : new pg.Pool({
      connectionString: config.databaseUrl, max: 10,
      keepAlive: true,
      idleTimeoutMillis: 30_000,            // referme les connexions inactives avant que l'hébergeur (ex. Neon) ne les coupe
      connectionTimeoutMillis: 20_000,      // laisse le temps à une base « endormie » de se réveiller
    });
// Une connexion inactive coupée par le serveur ne doit JAMAIS faire tomber l'application : on la journalise, le pool en rouvre une.
if (!config.localMode) pool.on('error', (e) => log.warn('base : connexion inactive perdue (ignorée)', { erreur: e.message }));
export const q = (text, params) => pool.query(text, params);

export async function migrate() {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');
  await q('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, at timestamptz NOT NULL DEFAULT now())');
  const done = new Set((await q('SELECT name FROM schema_migrations')).rows.map(r => r.name));
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
    if (done.has(f)) continue;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(fs.readFileSync(path.join(dir, f), 'utf8'));
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [f]);
      await client.query('COMMIT');
      log.info('migration appliquée', { fichier: f });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
}

export async function audit(req, action, extra = {}) {
  try {
    await q(
      `INSERT INTO audit_log (user_id, action, collection, record_id, unit, detail, ip)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [req?.user?.id ?? extra.userId ?? null, action, extra.collection ?? null, extra.recordId ?? null,
       extra.unit ?? null, extra.detail ? JSON.stringify(extra.detail) : null, req?.ip ?? null]
    );
  } catch (e) {
    log.error('journal d\'audit : échec d\'écriture', { erreur: e.message });
  }
}
