// Migration des codes (v1.18) : logique PURE, testée sans base.
//   - la Ligne Aérienne de Contact devient un système à part :  CFO.<UNITÉ>.LAC.<n>  ->  LAC.<UNITÉ>.CAT.<n>
//   - la billettique prend le code court :                      BILLETTIQUE…        ->  BIL…
// Tout le contenu d'un élément est parcouru (codes d'équipement dans les DI, OT, plans, compteurs, sous-équipements,
// textes), puis les rubriques « système » des éléments LAC passent de CFO à LAC.
export const ANCIEN_BIL = 'BILLETTIQUE', NOUVEAU_BIL = 'BIL';
export const NOUVEAU_LAC = 'LAC', SOUS_SYSTEME_LAC = 'CAT';
export const LIBELLE_LAC = 'Ligne Aérienne de Contact';
export const LIBELLE_SOUS_LAC = 'Caténaire : fil de contact, câble porteur, isolateurs, consoles';

const RE_LAC = /\bCFO\.([A-Z0-9]{2,5})\.LAC\b/g;          // CFO.ALG.LAC(.01…)
const RE_BIL = /\bBILLETTIQUE\b/g;

export function renommerTexte(s) {
  if (typeof s !== 'string') return s;
  return s.replace(RE_LAC, `${NOUVEAU_LAC}.$1.${SOUS_SYSTEME_LAC}`).replace(RE_BIL, NOUVEAU_BIL);
}
export function renommerValeur(v) {
  if (typeof v === 'string') return renommerTexte(v);
  if (Array.isArray(v)) return v.map(renommerValeur);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, renommerValeur(x)]));
  return v;
}
const estLac = (code) => typeof code === 'string' && code.startsWith(`${NOUVEAU_LAC}.`);

// Un enregistrement { collection, id, system, data } -> { id, system, data, change }
export function migrerEnregistrement(r) {
  const data = renommerValeur(r.data);
  let id = renommerTexte(r.id);
  let system = r.system === ANCIEN_BIL ? NOUVEAU_BIL : r.system;
  const ref = data && (data.eq || data.code || id);
  if (estLac(ref) || estLac(id)) {
    if (system === 'CFO') system = NOUVEAU_LAC;
    for (const k of ['system', 'sys']) if (data[k] === 'CFO') data[k] = NOUVEAU_LAC;
    if (r.collection === 'equipements' && data.subCode === 'LAC') data.subCode = SOUS_SYSTEME_LAC;
  }
  if (r.collection === 'arborescence') {
    if (r.id === 'CFO.LAC') return { supprimer: true, change: true, id: r.id, system, data };   // remplacé par LAC.CAT
    id = renommerTexte(r.id);
  }
  const change = id !== r.id || system !== r.system || JSON.stringify(data) !== JSON.stringify(r.data);
  return { id, system, data, change };
}

// Droits d'un compte : BILLETTIQUE -> BIL ; qui avait CFO garde l'accès à la LAC
export function migrerDroits(droits) {
  const out = {};
  let change = false;
  for (const [u, g] of Object.entries(droits || {})) {
    const sys = (g.systems || []).map((s) => (s === ANCIEN_BIL ? NOUVEAU_BIL : s));
    if (sys.includes('CFO') && !sys.includes(NOUVEAU_LAC)) sys.push(NOUVEAU_LAC);
    if (JSON.stringify(sys) !== JSON.stringify(g.systems || [])) change = true;
    out[u] = { ...g, systems: sys };
  }
  return { droits: out, change };
}

// Lignes de référentiel à ajouter (système LAC et son sous-système) si absentes
export function lignesLac(systemes, arborescence) {
  const ajout = [];
  if (!systemes.some((s) => s.id === NOUVEAU_LAC)) {
    const cfo = systemes.find((s) => s.id === 'CFO');
    ajout.push({ collection: 'systemes', id: NOUVEAU_LAC, data: { code: NOUVEAU_LAC, nom: LIBELLE_LAC, ordre: (cfo?.data?.ordre ?? 0) + 0.5 } });
  }
  if (!arborescence.some((a) => a.id === NOUVEAU_LAC)) {
    const cfo = arborescence.find((a) => a.id === 'CFO');
    ajout.push({ collection: 'arborescence', id: NOUVEAU_LAC, data: { system: NOUVEAU_LAC, header: true, ordre: (cfo?.data?.ordre ?? 0) + 0.5 } });
  }
  if (!arborescence.some((a) => a.id === `${NOUVEAU_LAC}.${SOUS_SYSTEME_LAC}`)) {
    ajout.push({ collection: 'arborescence', id: `${NOUVEAU_LAC}.${SOUS_SYSTEME_LAC}`, data: { system: NOUVEAU_LAC, code: SOUS_SYSTEME_LAC, sub: LIBELLE_SOUS_LAC, ordre: 0 } });
  }
  return ajout;
}
