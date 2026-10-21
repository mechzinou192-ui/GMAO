import { config } from './config.js';
import { q } from './db.js';

import { SEQUENCES, MAX_BATCH, sequenceKey, unitAbbr, currentYear, formatCode } from './numbering-core.js';
export * from './numbering-core.js';

// Réserve `count` numéros consécutifs. Chaque incrément est atomique en base (INSERT ... ON CONFLICT DO UPDATE).
// Si un code existe déjà (ex. saisi avant la mise en place de la numérotation serveur), on le saute.
// Un code supprimé peut être réattribué (cas de la remise à zéro : la numérotation repart de 0001 ; l'ancien élément
// reste dans records_archive et le journal d'audit).
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
  // réservation par plages : un seul incrément du compteur pour tout le lot, puis contrôle groupé des codes déjà pris
  const codes = [];
  let guard = 0;
  while (codes.length < count) {
    if (++guard > 10000) throw Object.assign(new Error('Numérotation indisponible.'), { status: 500 });
    const besoin = count - codes.length;
    const { rows } = await q(
      `INSERT INTO counters (name, scope, year, last) VALUES ($1,$2,$3,$4)
       ON CONFLICT (name, scope, year) DO UPDATE SET last = counters.last + $4
       RETURNING last`, [key, scope, yr, besoin]);
    const fin = rows[0].last;
    const plage = [];
    for (let n = fin - besoin + 1; n <= fin; n++) plage.push(formatCode(def, { abbr, year, n }));
    const pris = new Set((await q(
      'SELECT id FROM records WHERE collection=$1 AND id = ANY($2::text[]) AND NOT deleted', [def.collection, plage])).rows.map(x => x.id));
    for (const c of plage) if (!pris.has(c)) codes.push(c);
  }
  return codes;
}
