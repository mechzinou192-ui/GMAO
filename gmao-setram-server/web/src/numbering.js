// Réservation de numéros auprès du serveur (DI, BT, DS, BS, BR, décharges, plans préventifs, articles).
// Les numéros ne sont plus calculés sur le poste : le serveur garantit qu'ils sont uniques.
import { api } from './api.js';

const MAX = 200; // taille maximale d'un lot côté serveur

export const messageNumerotation = (e) =>
  e && e.network
    ? "Serveur injoignable : l'élément n'a pas été créé. Réessayez dans un instant."
    : 'Numérotation refusée : ' + ((e && e.message) || 'erreur inconnue');

// Retourne un tableau de `count` codes, ou null si le serveur refuse / est injoignable
// (un message est alors affiché et RIEN ne doit être créé).
export async function reserverNumeros(collection, { unit, variant, count = 1 } = {}) {
  const codes = [];
  try {
    for (let reste = count; reste > 0; reste -= MAX) {
      codes.push(...(await api.nextCodes(collection, { unit, variant, count: Math.min(reste, MAX) })));
    }
    return codes;
  } catch (e) {
    window.dispatchEvent(new CustomEvent('gmao:error', { detail: messageNumerotation(e) }));
    return null;
  }
}
