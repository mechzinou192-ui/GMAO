import { config } from './config.js';
import { q } from './db.js';

import { SEQUENCES, MAX_BATCH, sequenceKey, unitAbbr, currentYear, formatCode } from './numbering-core.js';
export * from './numbering-core.js';

// Réserve `count` numéros consécutifs. Chaque incrément est atomique en base (INSERT ... ON CONFLICT DO UPDATE).
// Si un code existe déjà (ex. saisi avant la mise en place de la numérotation serveur), on le saute.
export async function reserveCodes(key, { unit, count = 1, year = currentYear() }) {
  const def = SEQUENCES[key];
  if (!def) throw Object.assign(new Error('Séquence inconnue.'), { status: 404 });
  if (def.perUnit && !config.units.includes(unit))
    throw Object.assign(new Error('Unité invalide.'), { status: 400 });
  if (!Number.isInteger(count) || count < 1 || count > MAX_BATCH)
    throw Object.assign(new Error(`count doit être compris entre 1 et ${MAX_BATCH}.`), { status: 400 });

  const abbr = def.perUnit ? unitAbbr(unit) : '';
  const scope = abbr;
  const yr = def.yearly ? year : 0;
  const codes = [];
  let guard = 0;
  while (codes.length < count) {
    if (++guard > count + 1000) throw Object.assign(new Error('Numérotation indisponible.'), { status: 500 });
    const { rows } = await q(
      `INSERT INTO counters (name, scope, year, last) VALUES ($1,$2,$3,1)
       ON CONFLICT (name, scope, year) DO UPDATE SET last = counters.last + 1
       RETURNING last`, [key, scope, yr]);
    const code = formatCode(def, { abbr, year, n: rows[0].last });
    const taken = await q('SELECT 1 FROM records WHERE collection=$1 AND id=$2', [def.collection, code]);
    if (!taken.rows.length) codes.push(code);
  }
  return codes;
}
