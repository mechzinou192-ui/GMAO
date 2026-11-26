import { controleRapport } from './rapports-core.js';
import { COLLECTIONS } from './rights-core.js';
import { NIVEAU_PROFOND, cleNiveauProfondeur, profondeur } from './arbre-core.js';
// Profils utilisateurs : logique PURE (sans base de données), partagée avec la démonstration en navigateur.
//
// Le profil (colonne users.role) fixe CE QUE la personne peut faire ; les droits (users.droits) fixent OÙ :
// unités et systèmes. Les deux sont vérifiés par le serveur à chaque écriture (pas seulement masqués à l'écran).
//
// Volets : 0 Arborescence technique · 1 DI · 2 OT · 3 Préventif · 4 Stock · 5 Personnel · 6 Indicateurs
//          7 Rapports d'activité · 8 Gestion et suivi des matériaux (séparé de l'arborescence depuis la v1.20)
export const TOUS_SYSTEMES = '*';

// Capacités (drapeaux), combinables pour les profils créés par le super administrateur :
//   volets          modules accessibles (7 = rapports d'activité)
//   cloture         clôture des OT                 creerOT (vrai par défaut)  création / génération d'OT
//   diSeulement     DI uniquement, modifiables tant qu'elles sont « À transmettre »
//   saisieSeule     OT : remplit seulement (ni création, ni clôture, ni suppression)
//   valide          validation DG : ne modifie que la validation des référentiels (équipements, plans, sous-systèmes)
//                   et répond aux demandes d'expertise / d'assistance
//   valideOT        valide les OT clôturés de son périmètre (ou les fait reprendre, avec un motif) : responsable maintenance
//   demandes        émet des demandes d'expertise / d'assistance (problème décrit + rapport PDF / Word / Excel joint)
//   lectureSeule    consultation : aucune modification (sauf son rôle dans les rapports d'activité)
//   rapports        rôle dans les rapports d'activité : 'uo' (prépare et envoie) | 'expert' (revoit) | 'responsable' (valide, clôture) | 'lecture'
//   toutesUnites / tousSystemes   périmètre proposé à la création du compte
//   delegationComptes             peut recevoir du super admin la main sur les comptes de son unité
//   delegable                     peut être attribué par un administrateur UO délégué
//   supprimerRapports             peut supprimer un rapport d'activité (à tout statut) : donné par le super administrateur
//   niveauxDI                     niveaux de l'arborescence où le profil peut créer des DI (absent = tous)
//   niveauxPlan                   niveaux de l'arborescence où le profil peut créer des plans préventifs (absent = tous)
//   actions                       par module : actions permises { "<volet>": ["creer","modifier","supprimer"] }
//                                 (module absent = toutes les actions ; décidé par le super administrateur)
export const PROFILS = {
  'Exploitation':          { volets: [1], diSeulement: true, delegable: true, libelle: 'Crée les demandes d\'intervention (DI)' },
  'Gestionnaire de stock': { volets: [4], delegable: true, libelle: 'Gère le magasin : articles, DS / BS / BR, achats, décharges' },
  'Technicien':            { volets: [2], saisieSeule: true, creerOT: false, delegable: true, libelle: 'Remplit les OT qui lui sont confiés ; ne crée pas et ne clôture pas d\'OT' },
  'Chargé système':        { volets: [0, 1, 2, 3, 5, 6, 8], cloture: true, demandes: true, delegable: true, libelle: 'Son (ses) système(s) et leurs intervenants ; génère, contrôle et clôture les OT ; demandes d\'expertise / d\'assistance' },
  'Responsable système':   { volets: [0, 1, 2, 3, 5, 6, 8], cloture: true, valideOT: true, demandes: true, delegable: true, libelle: 'Comme le chargé système ; valide les OT clôturés de son (ses) système(s) ; demandes d\'expertise / d\'assistance' },
  'Administrateur UO':     { volets: [0, 1, 2, 3, 4, 5, 6, 7, 8], cloture: true, valideOT: true, demandes: true, tousSystemes: true, rapports: 'uo', delegationComptes: true, libelle: 'Tous les droits métier de son unité (tous systèmes) ; valide les OT clôturés ; envoie le rapport d\'activité à la DG ; pas d\'import ; comptes seulement si le super admin lui en donne la main' },
  'Directeur UO':          { volets: [0, 1, 2, 3, 4, 5, 6, 7, 8], lectureSeule: true, tousSystemes: true, rapports: 'lecture', libelle: 'Consulte toutes les données de son unité (aucune modification)' },
  'Expert DG':             { volets: [0, 1, 2, 3, 6, 7, 8], valide: true, creerOT: false, toutesUnites: true, rapports: 'expert', libelle: 'Son (ses) système(s) sur toutes les unités ; valide les référentiels ; répond aux demandes d\'expertise / d\'assistance ; revoit les rapports d\'activité (erreurs, commentaire)' },
  'Responsable DG':        { volets: [0, 1, 2, 3, 4, 5, 6, 7, 8], lectureSeule: true, toutesUnites: true, tousSystemes: true, rapports: 'responsable', libelle: 'Valide et clôture les rapports d\'activité des UO (ou les renvoie pour correction) ; consulte toutes les données' },
  'Directeur DG':          { volets: [0, 1, 2, 3, 4, 5, 6, 7, 8], lectureSeule: true, toutesUnites: true, tousSystemes: true, rapports: 'lecture', libelle: 'Consulte toutes les données de toutes les unités (aucune modification)' },
  'Directeur':             { volets: [6], delegable: true, libelle: 'Consulte les indicateurs' },
};
export const NOMS_PROFILS = Object.keys(PROFILS);

/* ───── Niveaux de l'arborescence où une DI peut être créée ───── */
// Système (SYS.UNI) → sous-système (SYS.UNI.SOUS) → équipement → sous-équipement → sous-sous-équipement
export const NIVEAUX_DI = [
  ['systeme', 'Système'], ['sousSysteme', 'Sous-système'], ['equipement', 'Équipement'],
  ['sousEquipement', 'Sous-équipement'], ['sousSousEquipement', 'Sous-sous-équipement'],
  // niveau 6 et plus (profondeur illimitée) : un seul droit pour tous les niveaux plus profonds
  [NIVEAU_PROFOND, 'Niveaux plus profonds (6 et suivants)'],
];
export const CLES_NIVEAUX_DI = NIVEAUX_DI.map(([k]) => k);
export const libelleNiveau = (k) => (NIVEAUX_DI.find(([c]) => c === k) || [k, k])[1];
// Libellé précis d'un nœud selon sa profondeur (« Niveau 7 » plutôt que « Niveaux plus profonds »)
export { libelleProfondeur } from './arbre-core.js';
// Niveau visé par une DI, déduit de ses données (le serveur ne se fie pas seulement au champ « niveau » envoyé).
export function niveauDI(d) {
  if (!d) return null;
  if (d.noeud && d.eq) return cleNiveauProfondeur(profondeur(d.eq, d.noeud)) ;   // profondeur lue dans le code du nœud visé
  if (d.ss) return 'sousSousEquipement';
  if (d.se) return 'sousEquipement';
  if (d.niveau === 'systeme' || d.niveau === 'sousSysteme') return d.niveau;
  const n = String(d.eq || '').split('.').filter(Boolean).length;   // SYS.UNI = système, SYS.UNI.SOUS = sous-système
  return n === 2 ? 'systeme' : n === 3 ? 'sousSysteme' : 'equipement';
}
const normaliserNiveaux = (v) => (Array.isArray(v) ? CLES_NIVEAUX_DI.filter((k) => v.includes(k)) : undefined);
const normaliserVolets = (v) => (Array.isArray(v) ? [...new Set(v.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 8))].sort() : undefined);
// Niveaux autorisés pour l'utilisateur (super administrateur ou profil sans restriction : tous)
export function niveauxDIAutorises(user) {
  const p = profilDe(user);
  return p && Array.isArray(p.niveauxDI) ? p.niveauxDI : CLES_NIVEAUX_DI;
}
export const peutCreerDIAuNiveau = (user, niveau) => niveauxDIAutorises(user).includes(niveau);
// Même réglage pour les plans préventifs : niveaux de l'arborescence où le profil peut créer un plan (absent = tous)
export function niveauxPlanAutorises(user) {
  const p = profilDe(user);
  return p && Array.isArray(p.niveauxPlan) ? p.niveauxPlan : CLES_NIVEAUX_DI;
}
export const peutCreerPlanAuNiveau = (user, niveau) => niveauxPlanAutorises(user).includes(niveau);

// Profils créés par le super administrateur (organigramme) : chargés depuis la collection « profils »
let PERSONNALISES = {};
// Réglages du super administrateur sur les profils de base (fixes) : niveaux de DI et modules (volets) en plus.
// Un profil de base ne perd jamais ses modules d'origine : on ne peut qu'en ajouter (ex. Exploitation + Arborescence).
// Enregistrés dans la même collection « profils », sous le nom du profil de base, avec surcharge: true.
let SURCHARGES = {};
/* ───── Actions permises par module (créer / modifier / supprimer), décidées par le super administrateur ───── */
export const ACTIONS = [['creer', 'Créer'], ['modifier', 'Modifier'], ['supprimer', 'Supprimer']];
export const CLES_ACTIONS = ACTIONS.map(([k]) => k);
export const NOMS_VOLETS = ['Arborescence technique', 'Demandes d\'intervention', 'Ordres de travail', 'Planning préventif', 'Gestion de stock', 'Gestion du personnel', 'Indicateurs', 'Rapports d\'activité', 'Gestion et suivi des matériaux'];
// Modules où le réglage a un sens (indicateurs : consultation seule ; rapports : circuit de validation à part)
export const VOLETS_ACTIONS = [0, 1, 2, 3, 4, 5, 8];
const LIBELLES_OP = { creer: 'création', modifier: 'modification', supprimer: 'suppression' };
export function normaliserActions(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const o = {};
  for (const [k, l] of Object.entries(v)) {
    const n = Number(k);
    if (!VOLETS_ACTIONS.includes(n) || !Array.isArray(l)) continue;
    const a = CLES_ACTIONS.filter((x) => l.includes(x));
    if (a.length < CLES_ACTIONS.length) o[n] = a;            // toutes les actions cochées = pas de restriction
  }
  return Object.keys(o).length ? o : undefined;
}
// Opération demandée d'après les données avant / après (null = création / suppression)
export const operation = (cur, next) => (!cur ? 'creer' : !next ? 'supprimer' : 'modifier');

const CLES = ['actions', 'volets', 'cloture', 'creerOT', 'diSeulement', 'saisieSeule', 'valide', 'valideOT', 'demandes', 'lectureSeule', 'rapports', 'toutesUnites', 'tousSystemes', 'delegationComptes', 'delegable', 'libelle', 'niveauxDI', 'niveauxPlan', 'supprimerRapports'];
export function normaliserProfil(d) {
  const o = {};
  for (const k of CLES) if (d && d[k] !== undefined) o[k] = d[k];
  o.volets = [...new Set((Array.isArray(o.volets) ? o.volets : []).map(Number).filter((v) => Number.isInteger(v) && v >= 0 && v <= 8))].sort();
  if (!['uo', 'expert', 'responsable', 'lecture'].includes(o.rapports)) delete o.rapports;
  o.libelle = String(o.libelle || '').slice(0, 300);
  const niv = normaliserNiveaux(o.niveauxDI);
  if (niv) o.niveauxDI = niv; else delete o.niveauxDI;
  const nivP = normaliserNiveaux(o.niveauxPlan);
  if (nivP) o.niveauxPlan = nivP; else delete o.niveauxPlan;
  const act = normaliserActions(o.actions);
  if (act) o.actions = act; else delete o.actions;
  if (o.supprimerRapports === true) o.supprimerRapports = true; else delete o.supprimerRapports;
  return o;
}
export function definirProfilsPersonnalises(liste) {
  const l = (liste || []).filter((d) => d && d.nom);
  PERSONNALISES = Object.fromEntries(l.filter((d) => !PROFILS[d.nom]).map((d) => [String(d.nom).trim(), { ...normaliserProfil(d), personnalise: true }]));
  SURCHARGES = Object.fromEntries(l.filter((d) => PROFILS[d.nom]).map((d) => {
    const reglage = {};
    const niv = normaliserNiveaux(d.niveauxDI);
    if (niv) reglage.niveauxDI = niv;
    const nivP = normaliserNiveaux(d.niveauxPlan);
    if (nivP) reglage.niveauxPlan = nivP;
    const act = normaliserActions(d.actions);
    if (act) reglage.actions = act;
    if (d.supprimerRapports === true) reglage.supprimerRapports = true;
    const vol = normaliserVolets(d.volets);
    if (vol) {
      const tous = [...new Set([...PROFILS[d.nom].volets, ...vol])].sort();
      if (tous.length > PROFILS[d.nom].volets.length) reglage.volets = tous;
    }
    return [d.nom, reglage];
  }).filter(([, reglage]) => Object.keys(reglage).length));
}
export const estSurchargeBase = (d) => !!(d && PROFILS[d.nom]);
export const catalogue = () => ({ ...Object.fromEntries(Object.entries(PROFILS).map(([n, p]) => [n, SURCHARGES[n] ? { ...p, ...SURCHARGES[n] } : p])), ...PERSONNALISES });
export const nomsProfils = () => Object.keys(catalogue());

// Anciens intitulés (avant la v1.18) -> profils
export const ANCIENS_ROLES = { 'Chargé de Maintenance': 'Chargé système', 'Responsable': 'Responsable système', 'Magasinier': 'Gestionnaire de stock' };
export const nomProfil = (role) => ANCIENS_ROLES[role] || role;
export const profilDe = (user) => (user && (user.super_admin || user.superAdmin) ? null : catalogue()[nomProfil(user?.role)] || null);
const estSuper = (user) => !!(user && (user.super_admin || user.superAdmin));

export const peutCloturer = (user) => !!(user && (estSuper(user) || !profilDe(user) || (profilDe(user).cloture && !profilDe(user).lectureSeule)));
export const peutValider = (user) => !!(user && (estSuper(user) || profilDe(user)?.valide));
// Validation des OT clôturés : le responsable maintenance (responsable système, administrateur UO), et non plus l'expert DG
export const peutValiderOT = (user) => !!(user && (estSuper(user) || (profilDe(user)?.valideOT && !profilDe(user)?.lectureSeule)));
// Demandes d'expertise / d'assistance : émises par le chargé et le responsable maintenance, traitées par l'expert DG
export const peutDemander = (user) => !!(user && (estSuper(user) || (profilDe(user)?.demandes && !profilDe(user)?.lectureSeule)));
export const peutRepondreDemandes = (user) => !!(user && (estSuper(user) || profilDe(user)?.valide));
// Onglet « Validation » : validation des OT, des référentiels, ou demandes d'expertise
export const accesValidation = (user) => peutValider(user) || peutValiderOT(user) || peutDemander(user);
export const peutCreerOT = (user) => !!(user && (estSuper(user) || !profilDe(user) || (profilDe(user).creerOT !== false && !profilDe(user).lectureSeule && !profilDe(user).diSeulement)));
export const enConsultation = (user) => !!profilDe(user)?.lectureSeule;
// Le profil permet-il cette action (creer | modifier | supprimer) dans ce module ? (affichage des boutons)
export function peutFaire(user, volet, op) {
  if (!user || estSuper(user)) return true;
  const a = profilDe(user)?.actions?.[volet];
  return !a || a.includes(op);
}
// Même question pour une collection (contrôle du serveur) : permise si l'un des modules qui l'écrivent, détenus par le
// profil, l'autorise (ex. DS : stock ou OT).
export function actionPermise(user, collection, op) {
  if (!user || estSuper(user)) return true;
  const p = profilDe(user);
  const def = COLLECTIONS[collection];
  if (!p || !p.actions || !def) return true;
  const vs = (def.writeVolets || [def.volet]).filter((v) => p.volets.includes(v));
  return !vs.length || vs.some((v) => peutFaire(user, v, op));
}
function refusAction(user, collection, op) {
  if (actionPermise(user, collection, op)) return null;
  const def = COLLECTIONS[collection];
  const v = (def.writeVolets || [def.volet]).find((x) => profilDe(user).volets.includes(x));
  return `Profil ${nomProfil(user.role)} : ${LIBELLES_OP[op]} non autorisée dans le module « ${NOMS_VOLETS[v] || collection} » (réglage du super administrateur).`;
}
// Suppression d'un rapport d'activité : le super administrateur seul, ou un profil auquel il en a donné la main
// (Administration → Profils → « Peut supprimer les rapports d'activité »). Contrôlé par le serveur.
export const peutSupprimerRapports = (user) => !!(user && (estSuper(user) || catalogue()[nomProfil(user.role)]?.supprimerRapports));
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
const pick = (o, cles) => Object.fromEntries(cles.filter((k) => o?.[k] !== undefined).map((k) => [k, o[k]]));
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
  if (collection === 'parametres_kpi') return 'Réservé au super administrateur (seuils des indicateurs et de l\'AMDEC).';
  if (collection === 'rapports') {
    if (cur && !next && peutSupprimerRapports(user)) return null;     // suppression : main donnée par le super administrateur
    return controleRapport(roleRapports(user), user, cur, next);
  }
  const nom = nomProfil(user.role);
  const p = catalogue()[nom];
  if (!p) return null;                                        // ancien compte sans profil reconnu : droits par volets seulement
  if (p.lectureSeule) return `Profil ${nom} : consultation uniquement, aucune modification.`;
  // actions permises par module (créer / modifier / supprimer), réglées par le super administrateur
  const refusOp = refusAction(user, collection, operation(cur, next));
  if (refusOp) return refusOp;

  // DI : niveau de l'arborescence autorisé par le super administrateur (création, ou changement de l'élément visé)
  if (collection === 'dis' && next && Array.isArray(p.niveauxDI)) {
    const niv = niveauDI(next);
    const change = !cur || niveauDI(cur) !== niv || cur.eq !== next.eq || (cur.se || '') !== (next.se || '') || (cur.ss || '') !== (next.ss || '') || (cur.noeud || '') !== (next.noeud || '');
    if (change && !p.niveauxDI.includes(niv)) return `Profil ${nom} : création de DI non autorisée au niveau « ${libelleNiveau(niv)} » (niveaux permis : ${p.niveauxDI.map(libelleNiveau).join(', ') || 'aucun'}).`;
  }

  // Plan préventif : même contrôle (création, ou changement du nœud visé)
  if (collection === 'planning' && next && Array.isArray(p.niveauxPlan)) {
    const niv = niveauDI(next);
    const change = !cur || niveauDI(cur) !== niv || cur.eq !== next.eq || (cur.se || '') !== (next.se || '') || (cur.ss || '') !== (next.ss || '') || (cur.noeud || '') !== (next.noeud || '');
    if (change && !p.niveauxPlan.includes(niv)) return `Profil ${nom} : création de plan préventif non autorisée au niveau « ${libelleNiveau(niv)} » (niveaux permis : ${p.niveauxPlan.map(libelleNiveau).join(', ') || 'aucun'}).`;
  }

  if (collection === 'demandes') return controleDemande(user, p, cur, next);

  if (p.valide) {
    if (collection === 'bts') return `Profil ${nom} : la validation des OT clôturés est faite par le responsable maintenance (responsable système).`;
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
  if (collection === 'bts' && p.valideOT) { const e = controleValidationOT(cur, next); if (e) return e; }
  return null;
}

// Validation d'un OT par le responsable maintenance : seul un OT clôturé se valide ; « À reprendre » exige un motif
// et renvoie l'OT « À clôturer ».
const changeValidation = (cur, next) => !!next?.validationDG && ['Validé', 'À reprendre'].includes(next.validationDG.etat)
  && JSON.stringify(next.validationDG) !== JSON.stringify(cur?.validationDG);
function controleValidationOT(cur, next) {
  if (!cur || !next || !changeValidation(cur, next)) return null;
  const v = next.validationDG;
  if (v.etat === 'Validé' && !(cur.etat === 'Clôturé' && next.etat === 'Clôturé')) return 'Seul un OT clôturé peut être validé.';
  if (v.etat === 'À reprendre') {
    if (!String(v.motif || '').trim()) return 'Motif obligatoire pour « À reprendre ».';
    if (!(cur.etat === 'Clôturé' && next.etat === 'À clôturer')) return 'Un OT à reprendre revient « À clôturer ».';
  }
  return null;
}

/* ───── Demandes d'expertise / d'assistance ───── */
// { code, unit, system, type: 'Expertise' | 'Assistance', objet, probleme, eq?, ot?, urgence, etat, demandeur, le,
//   reponse?, reponduPar?, reponduLe?, historique: [...] }
// États : Envoyée → En cours (prise en charge par l'expert DG) → Traitée ; le demandeur peut l'annuler tant qu'elle est « Envoyée ».
export const TYPES_DEMANDE = ['Expertise', 'Assistance'];
export const ETATS_DEMANDE = ['Envoyée', 'En cours', 'Traitée', 'Annulée'];
// rubriques que l'expert DG peut modifier (les documents eux-mêmes sont contrôlés à l'envoi : depotDemandeRefuse)
const CHAMPS_REPONSE = ['etat', 'reponse', 'reponduPar', 'reponduLe', 'historique', 'priseEnCharge', 'fichiers'];
function controleDemande(user, p, cur, next) {
  const nom = nomProfil(user.role);
  if (next) {
    if (!TYPES_DEMANDE.includes(next.type)) return 'Type de demande invalide (expertise ou assistance).';
    if (!ETATS_DEMANDE.includes(next.etat)) return 'État de demande invalide.';
    if (!String(next.probleme || '').trim()) return 'Décrivez le problème.';
  }
  if (p.valide) {                                             // expert DG : prise en charge et réponse seulement
    if (!cur || !next) return `Profil ${nom} : il répond aux demandes, il ne les crée ni ne les supprime.`;
    if (!memes(sans(cur, CHAMPS_REPONSE), sans(next, CHAMPS_REPONSE))) return `Profil ${nom} : seule la réponse peut être modifiée.`;
    if (['Traitée', 'Annulée'].includes(cur.etat) && cur.etat !== next.etat) return 'Demande close : elle ne peut plus changer d\'état.';
    if (next.etat === 'Annulée' || (next.etat === 'Envoyée' && cur.etat !== 'Envoyée')) return 'Seul le demandeur annule une demande.';
    if (next.etat === 'Traitée' && !String(next.reponse || '').trim()) return 'Réponse obligatoire pour clore la demande.';
    return null;
  }
  if (!p.demandes) return `Profil ${nom} : les demandes d'expertise / d'assistance sont émises par le chargé ou le responsable maintenance.`;
  if (!cur) return next.etat === 'Envoyée' ? null : 'Une nouvelle demande est « Envoyée ».';
  if (!next) return cur.etat === 'Envoyée' ? null : 'Demande prise en charge par la DG : elle ne peut plus être supprimée.';
  if (!memes(sans(cur, CHAMPS_REPONSE), sans(next, CHAMPS_REPONSE)) && cur.etat !== 'Envoyée') return 'Demande prise en charge par la DG : elle ne peut plus être modifiée.';
  if (!memes(pick(cur, ['reponse', 'reponduPar', 'reponduLe']), pick(next, ['reponse', 'reponduPar', 'reponduLe']))) return 'La réponse est rédigée par l\'expert DG.';
  if (cur.etat !== next.etat && !(cur.etat === 'Envoyée' && next.etat === 'Annulée')) return 'Le demandeur peut seulement annuler une demande encore « Envoyée ».';
  return null;
}
// Dépôt / retrait d'un rapport joint à une demande : le demandeur tant qu'elle est « Envoyée », l'expert DG tant qu'elle
// n'est pas close (pièce jointe à sa réponse).
export function depotDemandeRefuse(user, rec) {
  if (estSuper(user)) return null;
  const etat = rec?.data?.etat;
  if (peutRepondreDemandes(user)) return ['Traitée', 'Annulée'].includes(etat) ? 'Demande close : pièces jointes non modifiables.' : null;
  if (!peutDemander(user)) return 'Votre profil ne permet pas de joindre un rapport à une demande.';
  return etat === 'Envoyée' ? null : 'Demande prise en charge par la DG : pièces jointes non modifiables.';
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
  if (!ignores || !next) return next;
  if (collection === 'bts' ? estSuper(user) : peutValider(user)) return next;
  const aValider = { etat: 'À valider', depuis: maintenant, par: user?.id || '' };
  const garder = (d) => { const { validationDG, ...reste } = d; void validationDG; return cur && cur.validationDG !== undefined ? { ...reste, validationDG: cur.validationDG } : reste; };
  if (collection === 'bts') {
    // responsable maintenance : sa validation (ou sa demande de reprise) est horodatée et signée par le serveur
    if (peutValiderOT(user) && changeValidation(cur, next)) return { ...next, validationDG: { ...next.validationDG, par: user?.nom || next.validationDG.par || user?.id || '', parId: user?.id || '', le: maintenant.slice(0, 16).replace('T', ' ') } };
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

/* ───── Répercussion d'une modification de profil sur les comptes qui l'utilisent ───── */
// Modules et périmètre système d'un profil d'après son enregistrement « profils » (data = null : enregistrement absent
// ou supprimé → profil de base d'origine, ou null pour un profil personnalisé supprimé).
export function definitionProfil(nom, data) {
  const base = PROFILS[nom];
  if (base) return { volets: [...new Set([...base.volets, ...(normaliserVolets(data?.volets) || [])])].sort(), tousSystemes: !!base.tousSystemes };
  if (!data) return null;
  const p = normaliserProfil(data);
  return { volets: p.volets, tousSystemes: !!p.tousSystemes };
}
// Droits d'un compte après modification de son profil (avant → apres) : les modules ajoutés au profil sont donnés sur
// chaque unité du compte, les modules retirés du profil sont enlevés ; les modules décochés à la main restent décochés.
export function propagerDroitsProfil(droits, avant, apres) {
  if (!apres) return droits;
  const ajoutes = apres.volets.filter((v) => !(avant?.volets || []).includes(v));
  const out = {};
  for (const [u, g] of Object.entries(droits || {})) {
    const volets = [...new Set([...(g?.volets || []).filter((v) => apres.volets.includes(v)), ...ajoutes])].sort();
    out[u] = { ...g, volets, systems: apres.tousSystemes ? [TOUS_SYSTEMES] : (g?.systems || []) };
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
