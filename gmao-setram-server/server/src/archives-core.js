// Fenêtre de chargement : logique PURE, partagée avec la démonstration en navigateur.
/*
 * Pour que l'application reste rapide après plusieurs années d'exploitation, les DI et OT CLOS depuis plus de
 * N mois (dernière modification) ne sont pas renvoyés par défaut (?fenetre=N). Tout ce qui est ouvert reste chargé,
 * quel que soit son âge. L'historique complet reste disponible (requête sans fenêtre), par exemple pour les indicateurs.
 */
export const ARCHIVABLES = { dis: ['Traité'], bts: ['Clôturé', 'Annulé'] };
export const FENETRE_MIN = 3;
export const FENETRE_MAX = 240;

// Nombre de mois accepté, ou null (paramètre absent ou invalide = pas de fenêtre)
export function lireFenetre(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= FENETRE_MIN && n <= FENETRE_MAX ? n : NaN;
}

export function limiteFenetre(mois, now = new Date()) {
  const d = new Date(now); d.setMonth(d.getMonth() - mois); return d;
}

// true si l'élément est clos ET n'a pas été modifié depuis la limite : il est laissé de côté
export function horsFenetre(collection, data, updatedAt, mois, now = new Date()) {
  const etats = ARCHIVABLES[collection];
  if (!etats || !mois) return false;
  return etats.includes(data && data.etat) && new Date(updatedAt) < limiteFenetre(mois, now);
}
