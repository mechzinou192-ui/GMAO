// Maintenance conditionnelle par compteur (kilométrage, heures de fonctionnement, cycles).
//
// Un compteur est rattaché à un équipement et reçoit des relevés datés :
//   { code, eq, nom, unit, sys, grandeur, unite, releves: [{ date: "AAAA-MM-JJ", valeur, par, reset?, ancienne? }] }
// Un relevé « reset » marque le remplacement du compteur physique : « ancienne » est la dernière valeur lue sur
// l'ancien compteur, « valeur » celle du nouveau. Les calculs travaillent en valeur CUMULÉE pour que l'usure
// suivie par les plans ne soit pas remise à zéro par un remplacement de compteur.
//
// Un plan préventif « compteur » porte : declenchement: "Compteur", compteur (code), pas (ex. 15000 km),
// seuil (% du pas à partir duquel l'OT est à déclencher, 90 par défaut), valeurDernier (cumul au dernier passage).
import { fmtD, parseD, todayStr } from './dates.js';

export const GRANDEURS = [['Kilométrage', 'km'], ['Heures de fonctionnement', 'h'], ['Cycles', 'cycles']];
export const SEUIL_DEFAUT = 90;
export const isCompteurPlan = (p) => !!(p && p.declenchement === 'Compteur');
export const codeCompteur = (eq, unite) => `${eq}-${({ km: 'KM', h: 'H', cycles: 'CYC' })[unite] || String(unite || 'X').toUpperCase()}`;
const jours = (a, b) => Math.round((parseD(b) - parseD(a)) / 864e5);
const nombre = (v) => (v === '' || v === null || v === undefined ? NaN : Number(String(v).replace(/\s/g, '').replace(',', '.')));

export function relevesTries(c) {
  return [...((c && c.releves) || [])].sort((a, b) => a.date.localeCompare(b.date));
}

// Série chronologique { date, brut, cumul, reset }
export function serie(c) {
  let decalage = 0, prec = null;
  return relevesTries(c).map((r) => {
    if (r.reset) decalage += (Number.isFinite(r.ancienne) ? r.ancienne : (prec ? prec.brut : 0));
    const p = { date: r.date, brut: r.valeur, cumul: decalage + r.valeur, reset: !!r.reset, par: r.par || '' };
    prec = p; return p;
  });
}

export function dernier(c) { const s = serie(c); return s.length ? s[s.length - 1] : null; }

// Usage moyen par jour, sur les 90 derniers jours de relevés (au moins deux relevés, sinon null)
export function moyenneJour(c) {
  const s = serie(c); if (s.length < 2) return null;
  const fin = s[s.length - 1];
  const debut = s.find((p) => jours(p.date, fin.date) <= 90) || s[0];
  const ref = debut === fin ? s[s.length - 2] : debut;
  const j = jours(ref.date, fin.date); if (j <= 0) return null;
  return Math.max(0, (fin.cumul - ref.cumul) / j);
}

// Contrôle d'un nouveau relevé : renvoie un message d'erreur, ou "" si le relevé est acceptable
export function controleReleve(c, { date, valeur, reset, ancienne }) {
  const v = nombre(valeur);
  if (!Number.isFinite(v) || v < 0) return 'Saisissez une valeur numérique positive.';
  if (!date) return 'Indiquez la date du relevé.';
  if (date > todayStr()) return 'La date du relevé ne peut pas être dans le futur.';
  const d = dernier(c);
  if (d && date < d.date) return `Un relevé plus récent existe déjà (${d.date}).`;
  if (reset) {
    const a = nombre(ancienne);
    if (d && (!Number.isFinite(a) || a < d.brut)) return `Remplacement du compteur : indiquez la dernière valeur lue sur l'ancien compteur (au moins ${d.brut}).`;
    return '';
  }
  if (d && v < d.brut) return `Valeur inférieure au dernier relevé (${d.brut} le ${d.date}). S'il s'agit d'un remplacement du compteur, cochez « Remplacement du compteur ».`;
  return '';
}

export function ajouterReleve(c, { date, valeur, reset, ancienne, par }) {
  const r = { date, valeur: nombre(valeur), par: par || '' };
  if (reset) Object.assign(r, { reset: true, ancienne: nombre(ancienne) });
  return { ...c, releves: [...relevesTries(c).filter((x) => !(x.date === date && !reset && !x.reset)), r].sort((a, b) => a.date.localeCompare(b.date)) };
}

// Situation d'un plan compteur : consommation depuis le dernier passage, échéance, statut, date estimée
export function etatPlanCompteur(p, c) {
  const pas = Number(p.pas) || 0, seuil = Number(p.seuil) || SEUIL_DEFAUT;
  const base = { unite: (c && c.unite) || '', pas, seuil, valeur: null, depuis: null, prochain: null, reste: null, pct: 0, statut: 'Sans relevé', dateEstimee: '' };
  const d = dernier(c); if (!d || pas <= 0) return base;
  const valeurDernier = Number.isFinite(Number(p.valeurDernier)) ? Number(p.valeurDernier) : d.cumul;
  const prochain = valeurDernier + pas, depuis = d.cumul - valeurDernier, reste = prochain - d.cumul;
  const pct = Math.round((depuis / pas) * 100);
  const statut = pct >= 100 ? 'Dépassé' : pct >= seuil ? 'À déclencher' : 'OK';
  const moy = moyenneJour(c);
  let dateEstimee = '';
  if (reste <= 0) dateEstimee = todayStr();
  else if (moy && moy > 0) { const x = parseD(d.date); x.setDate(x.getDate() + Math.ceil(reste / moy)); dateEstimee = fmtD(x); }
  return { ...base, valeur: d.cumul, depuis, prochain, reste, pct, statut, dateEstimee, valeurDernier, moy };
}

export const fmtNb = (n) => (n === null || n === undefined || !Number.isFinite(Number(n)) ? '—' : Math.round(Number(n)).toLocaleString('fr-FR'));
