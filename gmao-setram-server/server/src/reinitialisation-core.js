// « Repartir de zéro » : logique PURE (sans base de données), partagée avec la démonstration en navigateur.
//
// Vide les données de l'application avant la reprise des vraies données (mise en service d'une nouvelle GMAO).
// Les comptes utilisateurs et le journal d'audit ne sont JAMAIS touchés. Les référentiels (systèmes, arborescence,
// jours fériés) ne sont vidés que sur demande explicite. Rien n'est effacé physiquement : les éléments sont
// archivés (table records_archive) puis marqués supprimés — la DSI peut tout restaurer.
import { SEQUENCES } from './numbering-core.js';

export const PHRASE_REINITIALISATION = 'REPARTIR DE ZERO';

export const COLLECTIONS_METIER = [
  'equipements', 'dis', 'bts', 'planning', 'compteurs_eq',
  'pieces', 'dss', 'bs', 'brs', 'decharges',
  'intervenants', 'prestataires',
  'mesures', 'controles', 'organismes',
];
export const COLLECTIONS_REFERENTIELS = ['systemes', 'arborescence', 'feries'];

const erreur = (message) => Object.assign(new Error(message), { status: 400 });

// Corps attendu : { confirmation: "REPARTIR DE ZERO", sauvegardeFaite: true, referentiels?: bool, numerotation?: bool }
// -> { collections, numerotation, sequences } (séquences de numérotation à remettre à 1)
export function preparerReinitialisation(body) {
  const b = body && typeof body === 'object' ? body : {};
  if (String(b.confirmation ?? '').trim().toUpperCase() !== PHRASE_REINITIALISATION)
    throw erreur(`Confirmation incorrecte : saisissez exactement « ${PHRASE_REINITIALISATION} ».`);
  if (b.sauvegardeFaite !== true)
    throw erreur('Faites (et vérifiez) une sauvegarde de la base avant de repartir de zéro.');
  const collections = [...COLLECTIONS_METIER, ...(b.referentiels === true ? COLLECTIONS_REFERENTIELS : [])];
  const numerotation = b.numerotation !== false;
  const sequences = numerotation
    ? Object.keys(SEQUENCES).filter((k) => collections.includes(SEQUENCES[k].collection))
    : [];
  return { collections, numerotation, sequences };
}
