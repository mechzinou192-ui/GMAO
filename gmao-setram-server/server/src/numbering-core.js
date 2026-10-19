// Formats de numérotation : logique PURE (sans base de données), partagée avec la démonstration en navigateur.
/*
 * Numérotation attribuée par le SERVEUR : deux utilisateurs ne peuvent plus obtenir le même numéro.
 *
 *   clé de séquence  = collection, ou collection:variante
 *   perUnit          = un compteur par unité, abréviation dans le code (DI-ALG-2026-0042)
 *   yearly           = le compteur repart de 1 chaque année civile (fuseau Africa/Algiers)
 *
 * Exemples : DI-ALG-2026-0001 · OT-ORN-2026-0007 · OT-PREV-ALG-2026-0003 · DS-2026-0012 · P-001
 */
export const SEQUENCES = {
  dis:          { collection: 'dis',        prefix: 'DI',      perUnit: true,  yearly: true,  pad: 4 },
  bts:          { collection: 'bts',        prefix: 'OT',      perUnit: true,  yearly: true,  pad: 4 },
  'bts:prev':   { collection: 'bts',        prefix: 'OT-PREV', perUnit: true,  yearly: true,  pad: 4 },
  planning:     { collection: 'planning',   prefix: 'PREV',    perUnit: true,  yearly: false, pad: 4 },
  dss:          { collection: 'dss',        prefix: 'DS',      perUnit: false, yearly: true,  pad: 4 },
  bs:           { collection: 'bs',         prefix: 'BS',      perUnit: false, yearly: true,  pad: 4 },
  brs:          { collection: 'brs',        prefix: 'BR',      perUnit: false, yearly: true,  pad: 4 },
  decharges:    { collection: 'decharges',  prefix: 'DCH',     perUnit: false, yearly: true,  pad: 4 },
  'pieces:P':   { collection: 'pieces',     prefix: 'P',       perUnit: false, yearly: false, pad: 3 },
  'pieces:O':   { collection: 'pieces',     prefix: 'O',       perUnit: false, yearly: false, pad: 3 },
  'pieces:C':   { collection: 'pieces',     prefix: 'C',       perUnit: false, yearly: false, pad: 3 },
};

export const MAX_BATCH = 200;

export const sequenceKey = (collection, variant) => (variant ? `${collection}:${variant}` : collection);

const DEFAULT_ABBR = {
  'Alger': 'ALG', 'Oran': 'ORN', 'Constantine': 'CST', 'Sidi Bel Abbès': 'SBA',
  'Ouargla': 'OUA', 'Sétif': 'SET', 'Mostaganem': 'MST',
};
export function unitAbbr(unit) {
  return DEFAULT_ABBR[unit]
    || String(unit).normalize('NFD').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase()
    || 'UNI';
}

export function currentYear(now = new Date()) {
  return Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Algiers', year: 'numeric' }).format(now));
}

export function formatCode(def, { abbr, year, n }) {
  const parts = [def.prefix];
  if (def.perUnit) parts.push(abbr);
  if (def.yearly) parts.push(String(year));
  parts.push(String(n).padStart(def.pad, '0'));
  return parts.join('-');
}
