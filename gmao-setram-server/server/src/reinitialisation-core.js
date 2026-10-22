// « Repartir de zéro » : logique PURE (sans base de données), partagée avec la démonstration en navigateur.
//
// Vide des données de l'application (mise en service, ou reprise partielle). Le périmètre est au choix :
//   - les CATÉGORIES à vider (équipements, DI, OT, articles… et, sur demande, systèmes / arborescence / jours fériés) ;
//   - UNE SEULE UNITÉ (ex. « Oran ») : seuls les éléments rattachés à cette unité sont concernés ;
//   - UN SEUL SYSTÈME (ex. « CFO ») : seuls les éléments de ce système sont concernés ; pour l'arborescence, c'est
//     l'en-tête « CFO » et ses sous-systèmes « CFO.xxx » (l'arborescence est commune à toutes les unités).
// Les comptes utilisateurs et le journal d'audit ne sont JAMAIS touchés. Rien n'est effacé physiquement : les éléments
// sont archivés (table records_archive) puis marqués supprimés — la DSI peut tout restaurer.
import { SEQUENCES, unitAbbr } from './numbering-core.js';

export const PHRASE_REINITIALISATION = 'REPARTIR DE ZERO';

export const COLLECTIONS_METIER = [
  'equipements', 'dis', 'bts', 'planning', 'compteurs_eq',
  'pieces', 'dss', 'bs', 'brs', 'decharges',
  'intervenants', 'prestataires',
  'mesures', 'controles', 'organismes',
];
export const COLLECTIONS_REFERENTIELS = ['systemes', 'arborescence', 'feries'];
// référentiels sans unité, identifiés par le code système (« CFO », « CFO.SST »)
export const REFERENTIELS_PAR_SYSTEME = ['systemes', 'arborescence'];

// Saisie tolérante : accents, casse et espaces multiples ignorés (« Repartir de zéro » est accepté)
export const phraseCorrecte = (s) =>
  String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase() === PHRASE_REINITIALISATION;

const erreur = (message) => Object.assign(new Error(message), { status: 400 });
const CODE_SYSTEME = /^[A-Za-z0-9_-]{1,40}$/;

// Corps attendu :
//   { confirmation: "REPARTIR DE ZERO", sauvegardeFaite: true,
//     collections?: [...], unit?: "Oran", system?: "CFO",
//     referentiels?: bool   (ancien format, utilisé seulement si « collections » est absent),
//     numerotation?: bool }
// options.units : liste des unités valides (côté serveur) — sinon seule la forme est contrôlée.
// -> { collections, unit, system, numerotation, sequences, scopes }
//    sequences : séquences de numérotation à remettre à 1 ; scopes : abréviations d'unité concernées (null = toutes)
export function preparerReinitialisation(body, options = {}) {
  const b = body && typeof body === 'object' ? body : {};
  if (!phraseCorrecte(b.confirmation))
    throw erreur(`Confirmation incorrecte : saisissez exactement « ${PHRASE_REINITIALISATION} ».`);
  if (b.sauvegardeFaite !== true)
    throw erreur('Faites (et vérifiez) une sauvegarde de la base avant de repartir de zéro.');

  const unit = String(b.unit ?? '').trim();
  const system = String(b.system ?? '').trim();
  if (unit && options.units && !options.units.includes(unit)) throw erreur(`Unité inconnue : « ${unit} ».`);
  if (system && !CODE_SYSTEME.test(system)) throw erreur('Code système invalide.');

  let collections;
  if (Array.isArray(b.collections)) {
    const connues = [...COLLECTIONS_METIER, ...COLLECTIONS_REFERENTIELS];
    const inconnue = b.collections.find((c) => !connues.includes(c));
    if (inconnue !== undefined) throw erreur(`Catégorie inconnue : « ${String(inconnue)} ».`);
    collections = connues.filter((c) => b.collections.includes(c));          // ordre stable, sans doublon
    if (!collections.length) throw erreur('Choisissez au moins une catégorie à vider.');
  } else {
    collections = [...COLLECTIONS_METIER, ...(b.referentiels === true && !unit && !system ? COLLECTIONS_REFERENTIELS : [])];
  }
  if (unit && collections.some((c) => COLLECTIONS_REFERENTIELS.includes(c)))
    throw erreur('Les systèmes, l\'arborescence et les jours fériés sont communs à toutes les unités : ils ne peuvent pas être vidés pour une seule unité.');
  if (system && collections.includes('feries'))
    throw erreur('Les jours fériés ne dépendent d\'aucun système : ils ne peuvent pas être vidés pour un seul système.');

  // Numérotation : remise à 1 seulement quand la catégorie est vidée en entier (ou en entier pour l'unité choisie).
  // Avec un filtre par système, des éléments restent : on ne touche jamais aux compteurs.
  const numerotation = !system && b.numerotation !== false;
  const sequences = numerotation
    ? Object.keys(SEQUENCES).filter((k) => collections.includes(SEQUENCES[k].collection) && (!unit || SEQUENCES[k].perUnit))
    : [];
  const scopes = unit && sequences.length ? [unitAbbr(unit)] : null;
  return { collections, unit, system, numerotation, sequences, scopes };
}

// Un enregistrement { id, unit, system } est-il concerné par la remise à zéro de la collection c ? (démonstration)
export function enregistrementConcerne(c, r, p) {
  if (r.deleted) return false;
  if (p.unit && r.unit !== p.unit) return false;
  if (p.system) {
    if (REFERENTIELS_PAR_SYSTEME.includes(c)) return r.id === p.system || String(r.id).startsWith(`${p.system}.`);
    return r.system === p.system;
  }
  return true;
}

// Filtre SQL équivalent, pour la table « records » : { where, params }. `debut` = nombre de paramètres déjà utilisés.
export function filtreSql(c, p, debut = 0) {
  const params = [];
  const ph = (v) => { params.push(v); return `$${debut + params.length}`; };
  let where = `collection=${ph(c)} AND NOT deleted`;
  if (p.unit) where += ` AND unit=${ph(p.unit)}`;
  if (p.system) {
    if (REFERENTIELS_PAR_SYSTEME.includes(c)) {
      const exact = `${ph(p.system)}::text`, prefixe = `${ph(`${p.system}.`)}::text`;
      where += ` AND (id=${exact} OR left(id, char_length(${prefixe}))=${prefixe})`;
    } else where += ` AND system=${ph(p.system)}`;
  }
  return { where, params };
}
