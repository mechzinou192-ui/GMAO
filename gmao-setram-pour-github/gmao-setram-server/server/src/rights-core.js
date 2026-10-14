// Droits d'accès : logique PURE (sans accès à la configuration ni à la base), partagée avec la démonstration en navigateur.
/*
 * Volets (identiques à l'interface) :
 * 0 Arborescence · 1 DI · 2 BT · 3 Planning préventif · 4 Magasin & Achats
 * 5 Intervenants · 6 Indicateurs de performance
 */
export const VOLET_INDICATEURS = 6;

// Chaque collection est rattachée à un volet d'écriture (volet).
//  - shared  : donnée commune à toutes les unités (unit = '') ; accessible si l'utilisateur
//              a le volet dans AU MOINS une unité (comme dans l'interface : magasin central, intervenants…)
//  - readVolets : volets supplémentaires autorisés en LECTURE (ex. Indicateurs, ou DI qui lisent les équipements)
//  - readAll : lisible par tout utilisateur connecté (référentiels : systèmes, arborescence, jours fériés)
export const COLLECTIONS = {
  equipements:  { volet: 0, readVolets: [0, 1, 2, 3, 6] },
  dis:          { volet: 1, readVolets: [1, 6] },
  bts:          { volet: 2, readVolets: [2, 6] },
  planning:     { volet: 3, readVolets: [3, 6] },
  pieces:       { volet: 4, shared: true, readVolets: [4, 6] },
  dss:          { volet: 4, shared: true },
  bs:           { volet: 4, shared: true },
  brs:          { volet: 4, shared: true },
  decharges:    { volet: 4, shared: true },
  intervenants: { volet: 5, shared: true, readVolets: [2, 3, 5, 6] },
  prestataires: { volet: 5, shared: true, readVolets: [2, 3, 5, 6] },
  mesures:      { volet: 0, shared: true, readVolets: [0, 6] },
  controles:    { volet: 0, shared: true, readVolets: [0, 6] },
  organismes:   { volet: 0, shared: true, readVolets: [0, 6] },
  systemes:     { volet: 0, shared: true, readAll: true },
  arborescence: { volet: 0, shared: true, readAll: true },
  feries:       { volet: 5, shared: true, readAll: true },
};

const arr = (v) => (Array.isArray(v) ? v : []);

export function unitGrant(user, unit) {
  if (user.super_admin) return { all: true };
  const g = user.droits?.[unit];
  return g ? { systems: arr(g.systems), volets: arr(g.volets), kpi: g.kpi } : null;
}

function voletOk(user, unit, volet) {
  if (user.super_admin) return true;
  const g = unitGrant(user, unit);
  return !!g && g.volets.includes(volet);
}

function systemOk(user, unit, system) {
  if (user.super_admin) return true;
  const g = unitGrant(user, unit);
  if (!g) return false;
  return !system || g.systems.includes(system);
}

function voletAny(user, volet) {
  if (user.super_admin) return true;
  return Object.values(user.droits || {}).some(g => arr(g?.volets).includes(volet));
}

export function canRead(user, collection, unit, system) {
  const def = COLLECTIONS[collection];
  if (!def) return false;
  if (def.readAll) return true;
  const volets = def.readVolets || [def.volet];
  if (def.shared) return volets.some(v => voletAny(user, v));
  return volets.some(v => voletOk(user, unit, v)) && systemOk(user, unit, system);
}

export function canWrite(user, collection, unit, system) {
  const def = COLLECTIONS[collection];
  if (!def) return false;
  if (def.shared) return voletAny(user, def.volet);
  return voletOk(user, unit, def.volet) && systemOk(user, unit, system);
}
