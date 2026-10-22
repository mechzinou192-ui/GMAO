import { controleRapport } from './rapports-core.js';
// Profils utilisateurs : logique PURE (sans base de données), partagée avec la démonstration en navigateur.
//
// Le profil (colonne users.role) fixe CE QUE la personne peut faire ; les droits (users.droits) fixent OÙ :
// unités et systèmes. Les deux sont vérifiés par le serveur à chaque écriture (pas seulement masqués à l'écran).
//
// Volets : 0 Arborescence/matériaux · 1 DI · 2 OT · 3 Préventif · 4 Stock · 5 Personnel · 6 Indicateurs
export const TOUS_SYSTEMES = '*';

// Capacités (drapeaux), combinables pour les profils créés par le super administrateur :
//   volets          modules accessibles (7 = rapports d'activité)
//   cloture         clôture des OT                 creerOT (vrai par défaut)  création / génération d'OT
//   diSeulement     DI uniquement, modifiables tant qu'elles sont « À transmettre »
//   saisieSeule     OT : remplit seulement (ni création, ni clôture, ni suppression)
//   valide          validation DG : ne modifie que la validation (OT clôturés, référentiels)
//   lectureSeule    consultation : aucune modification (sauf son rôle dans les rapports d'activité)
//   rapports        rôle dans les rapports d'activité : 'uo' (prépare et envoie) | 'expert' (revoit) | 'responsable' (valide, clôture) | 'lecture'
//   toutesUnites / tousSystemes   périmètre proposé à la création du compte
//   delegationComptes             peut recevoir du super admin la main sur les comptes de son unité
//   delegable                     peut être attribué par un administrateur UO délégué
export const PROFILS = {
  'Exploitation':          { volets: [1], diSeulement: true, delegable: true, libelle: 'Crée les demandes d\'intervention (DI)' },
  'Gestionnaire de stock': { volets: [4], delegable: true, libelle: 'Gère le magasin : articles, DS / BS / BR, achats, décharges' },
  'Technicien':            { volets: [2], saisieSeule: true, creerOT: false, delegable: true, libelle: 'Remplit les OT qui lui sont confiés ; ne crée pas et ne clôture pas d\'OT' },
  'Chargé système':        { volets: [0, 1, 2, 3, 5, 6], cloture: true, delegable: true, libelle: 'Son (ses) système(s) et leurs intervenants ; génère, contrôle et clôture les OT' },
  'Responsable système':   { volets: [0, 1, 2, 3, 5, 6], cloture: true, delegable: true, libelle: 'Comme le chargé système ; informé des clôtures faites par le chargé' },
  'Administrateur UO':     { volets: [0, 1, 2, 3, 4, 5, 6, 7], cloture: true, tousSystemes: true, rapports: 'uo', delegationComptes: true, libelle: 'Tous les droits métier de son unité (tous systèmes) ; envoie le rapport d\'activité à la DG ; pas d\'import ; comptes seulement si le super admin lui en donne la main' },
  'Directeur UO':          { volets: [0, 1, 2, 3, 4, 5, 6, 7], lectureSeule: true, tousSystemes: true, rapports: 'lecture', libelle: 'Consulte toutes les données de son unité (aucune modification)' },
  'Expert DG':             { volets: [0, 1, 2, 3, 6, 7], valide: true, creerOT: false, toutesUnites: true, rapports: 'expert', libelle: 'Son (ses) système(s) sur toutes les unités ; valide les OT clôturés et les référentiels ; revoit les rapports d\'activité (erreurs, commentaire)' },
  'Responsable DG':        { volets: [0, 1, 2, 3, 4, 5, 6, 7], lectureSeule: true, toutesUnites: true, tousSystemes: true, rapports: 'responsable', libelle: 'Valide et clôture les rapports d\'activité des UO (ou les renvoie pour correction) ; consulte toutes les données' },
  'Directeur DG':          { volets: [0, 1, 2, 3, 4, 5, 6, 7], lectureSeule: true, toutesUnites: true, tousSystemes: true, rapports: 'lecture', libelle: 'Consulte toutes les données de toutes les unités (aucune modification)' },
  'Directeur':             { volets: [6], delegable: true, libelle: 'Consulte les indicateurs' },
};
export const NOMS_PROFILS = Object.keys(PROFILS);

// Profils créés par le super administrateur (organigramme) : chargés depuis la collection « profils »
let PERSONNALISES = {};
const CLES = ['volets', 'cloture', 'creerOT', 'diSeulement', 'saisieSeule', 'valide', 'lectureSeule', 'rapports', 'toutesUnites', 'tousSystemes', 'delegationComptes', 'delegable', 'libelle'];
export function normaliserProfil(d) {
  const o = {};
  for (const k of CLES) if (d && d[k] !== undefined) o[k] = d[k];
  o.volets = [...new Set((Array.isArray(o.volets) ? o.volets : []).map(Number).filter((v) => Number.isInteger(v) && v >= 0 && v <= 7))].sort();
  if (!['uo', 'expert', 'responsable', 'lecture'].includes(o.rapports)) delete o.rapports;
  o.libelle = String(o.libelle || '').slice(0, 300);
  return o;
}
export function definirProfilsPersonnalises(liste) {
  PERSONNALISES = Object.fromEntries((liste || []).filter((d) => d && d.nom && !PROFILS[d.nom]).map((d) => [String(d.nom).trim(), { ...normaliserProfil(d), personnalise: true }]));
}
export const catalogue = () => ({ ...PROFILS, ...PERSONNALISES });
export const nomsProfils = () => Object.keys(catalogue());

// Anciens intitulés (avant la v1.18) -> profils
export const ANCIENS_ROLES = { 'Chargé de Maintenance': 'Chargé système', 'Responsable': 'Responsable système', 'Magasinier': 'Gestionnaire de stock' };
export const nomProfil = (role) => ANCIENS_ROLES[role] || role;
export const profilDe = (user) => (user && (user.super_admin || user.superAdmin) ? null : catalogue()[nomProfil(user?.role)] || null);
const estSuper = (user) => !!(user && (user.super_admin || user.superAdmin));

export const peutCloturer = (user) => !!(user && (estSuper(user) || !profilDe(user) || (profilDe(user).cloture && !profilDe(user).lectureSeule)));
export const peutValider = (user) => !!(user && (estSuper(user) || profilDe(user)?.valide));
export const peutCreerOT = (user) => !!(user && (estSuper(user) || !profilDe(user) || (profilDe(user).creerOT !== false && !profilDe(user).lectureSeule && !profilDe(user).diSeulement)));
export const enConsultation = (user) => !!profilDe(user)?.lectureSeule;
export const roleRapports = (user) => (estSuper(user) ? 'admin' : profilDe(user)?.rapports || null);

// Collections soumises à la validation DG, et rubriques « de fonctionnement » qui ne la remettent pas en cause
// (ex. un plan dont la prochaine échéance avance après une visite reste validé).
export const VALIDABLES = {
  bts: [],
  equipements: [],
  planning: ['dernier', 'date', 'valeurDernier', 'termine'],
  arborescence: [],
};
const sans = (o, cles) => { const c = { ...(o || {}) }; for (const k of cles) delete c[k]; return c; };
const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// comparaison indépendante de l'ordre des rubriques
const trie = (v) => (Array.isArray(v) ? v.map(trie) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, trie(v[k])])) : v);
const memes = (a, b) => egal(trie(a), trie(b));

/*
 * Contrôle d'une écriture selon le profil. cur / next = données avant / après (null = création / suppression).
 * Renvoie un message d'erreur (refus 403) ou null.
 */
export function controleProfil(user, collection, cur, next) {
  if (!user || estSuper(user)) return null;
  // organigramme : systèmes et profils réservés au super administrateur de la DG
  if (collection === 'systemes' || collection === 'profils') return 'Réservé au super administrateur (organigramme et systèmes).';
  if (collection === 'rapports') return controleRapport(roleRapports(user), user, cur, next);
  const nom = nomProfil(user.role);
  const p = catalogue()[nom];
  if (!p) return null;                                        // ancien compte sans profil reconnu : droits par volets seulement
  if (p.lectureSeule) return `Profil ${nom} : consultation uniquement, aucune modification.`;

  if (p.valide) {
    if (!(collection in VALIDABLES)) return `Profil ${nom} : consultation et validation uniquement.`;
    if (!cur || !next) return `Profil ${nom} : il ne crée ni ne supprime d'élément, il valide.`;
    const autorisees = ['validationDG', ...(collection === 'bts' ? ['etat'] : [])];
    if (!memes(sans(cur, autorisees), sans(next, autorisees))) return `Profil ${nom} : seule la validation peut être modifiée.`;
    if (collection === 'bts' && cur.etat !== next.etat) {
      const reprise = cur.etat === 'Clôturé' && next.etat === 'À clôturer' && next.validationDG?.etat === 'À reprendre';
      if (!reprise) return `Profil ${nom} : un OT ne peut être rouvert que par « À reprendre », avec un motif.`;
    }
    if (next.validationDG?.etat === 'À reprendre' && !String(next.validationDG.motif || '').trim()) return 'Motif obligatoire pour « À reprendre ».';
    return null;
  }

  if (p.diSeulement) {
    if (collection !== 'dis') return `Profil ${nom} : création de DI uniquement.`;
    if (cur && cur.etat !== 'À Transmettre') return `Profil ${nom} : une DI déjà prise en charge ne peut plus être modifiée.`;
    if (next && next.etat && next.etat !== 'À Transmettre') return `Profil ${nom} : la DI reste « À transmettre » jusqu'à sa prise en charge.`;
    return null;
  }

  if (collection === 'bts' && (p.saisieSeule || p.creerOT === false)) {
    if (!cur) return `Profil ${nom} : la création d'un OT est faite par le chargé ou le responsable du système.`;
    if (!next) return `Profil ${nom} : suppression d'OT non autorisée.`;
  }
  if (p.saisieSeule && collection === 'bts') {
    if (cur.etat === 'Clôturé') return `Profil ${nom} : un OT clôturé ne peut plus être modifié.`;
    if (next.etat === 'Clôturé') return `Profil ${nom} : la clôture est faite par le chargé ou le responsable du système (« Terminer la saisie » les prévient).`;
    return null;
  }

  if (collection === 'bts' && next?.etat === 'Clôturé' && cur?.etat !== 'Clôturé' && !p.cloture) return 'Votre profil ne permet pas de clôturer un OT.';
  return null;
}

/*
 * Mise à jour automatique de la validation DG (à appeler après controleProfil, avant l'enregistrement) :
 * toute création ou modification d'un référentiel, et toute clôture d'OT, par quelqu'un d'autre qu'un expert
 * remet l'élément « À valider ». Renvoie les données à enregistrer.
 */
// La validation envoyée par un autre profil n'est jamais reprise telle quelle : elle est recalculée ici
// (on ne peut pas se « valider » soi-même ; une saisie qui ne change rien garde la validation existante).
export function ajusterValidation(user, collection, cur, next, maintenant = new Date().toISOString()) {
  const ignores = VALIDABLES[collection];
  if (!ignores || !next || peutValider(user)) return next;
  const aValider = { etat: 'À valider', depuis: maintenant, par: user?.id || '' };
  const garder = (d) => { const { validationDG, ...reste } = d; void validationDG; return cur && cur.validationDG !== undefined ? { ...reste, validationDG: cur.validationDG } : reste; };
  if (collection === 'bts') {
    const cloture = next.etat === 'Clôturé' && cur?.etat !== 'Clôturé';
    return cloture ? { ...next, validationDG: aValider } : garder(next);
  }
  if (collection === 'arborescence' && next.header) return garder(next);
  const change = !cur || !memes(sans(cur, [...ignores, 'validationDG']), sans(next, [...ignores, 'validationDG']));
  return change ? { ...next, validationDG: aValider } : garder(next);
}

// Contrôle de la forme des droits selon le profil : volets limités au profil, « tous systèmes » pour l'administrateur UO
export function normaliserDroitsProfil(role, droits) {
  const p = catalogue()[nomProfil(role)];
  if (!p) return droits;
  const out = {};
  for (const [u, g] of Object.entries(droits || {})) {
    out[u] = { ...g, volets: (g.volets || []).filter((v) => p.volets.includes(v)), systems: p.tousSystemes ? [TOUS_SYSTEMES] : (g.systems || []) };
  }
  return out;
}

/* ───── Gestion des comptes déléguée à un administrateur UO ───── */
export const profilsDelegables = () => Object.entries(catalogue()).filter(([, p]) => p.delegable).map(([n]) => n);
export const PROFILS_DELEGABLES = profilsDelegables();          // profils de base (compatibilité)
export const peutGererComptes = (user) => !!(user && (user.super_admin || (profilDe(user)?.delegationComptes && user.gestion_comptes)));
// Le compte `cible` (existant ou à créer) est-il dans le périmètre de l'administrateur UO `admin` ?
export function compteDansPerimetre(admin, cible) {
  if (admin.super_admin) return true;
  if (cible.super_admin || cible.superAdmin) return false;
  if (!profilsDelegables().includes(nomProfil(cible.role))) return false;
  const siennes = Object.keys(admin.droits || {});
  const unites = Object.keys(cible.droits || {});
  return unites.length > 0 && unites.every((u) => siennes.includes(u));
}
