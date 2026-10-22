// Rapports d'activité maintenance des UO : circuit de validation par la DG. Logique PURE, partagée avec la démonstration.
//
//   Brouillon ──(UO : envoyer)──► Envoyé ──(chaque expert DG : erreurs + commentaire, « revue terminée »)──►
//   À valider DG ──(responsable DG)──► Clôturé              si aucune erreur ni commentaire
//                                 └──► À corriger ──(UO : corrige, renvoie)──► Envoyé (nouveau tour de revue) …
//
// Rapport : { code, unit, titre, periode, fichiers:[{id,nom,mime,taille,tour}], etat, tour, attendus:[ids experts],
//             revues:{ [tour]: { [idExpert]: { nom, erreurs, commentaire, terminee, le } } },
//             decision:{ etat, par, le, motif }, historique:[{ le, par, action, detail }] }
export const ETATS_RAPPORT = ['Brouillon', 'Envoyé', 'À valider DG', 'À corriger', 'Clôturé'];
const MODIFIABLE_UO = ['Brouillon', 'À corriger'];
const CHAMPS_UO = ['titre', 'periode', 'fichiers', 'commentaireUO'];

const sans = (o, cles) => { const c = { ...(o || {}) }; for (const k of cles) delete c[k]; return c; };
const trie = (v) => (Array.isArray(v) ? v.map(trie) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, trie(v[k])])) : v);
const memes = (a, b) => JSON.stringify(trie(a)) === JSON.stringify(trie(b));

export const revuesDuTour = (r) => (r?.revues || {})[String(r?.tour || 1)] || {};
export const totalErreurs = (r) => Object.values(revuesDuTour(r)).reduce((s, x) => s + (Number(x.erreurs) || 0), 0);
export const aDesRemarques = (r) => totalErreurs(r) > 0 || Object.values(revuesDuTour(r)).some((x) => String(x.commentaire || '').trim());
export const revuesTerminees = (r) => (r?.attendus || []).length > 0 && (r.attendus || []).every((id) => revuesDuTour(r)[id]?.terminee);

/*
 * Contrôle d'une écriture sur un rapport selon le rôle (« uo », « expert », « responsable », « lecture », « admin »).
 * Les champs calculés (tour, attendus, historique, état « À valider DG ») sont posés par ajusterRapport, pas par le client.
 */
export function controleRapport(role, user, cur, next) {
  if (role === 'admin') return null;
  if (!role || role === 'lecture') return 'Votre profil consulte les rapports d\'activité sans les modifier.';
  const calcules = ['tour', 'attendus', 'historique', 'decision', 'etat', 'revues'];
  if (role === 'uo') {
    if (!next) return cur && cur.etat === 'Brouillon' ? null : 'Seul un rapport en brouillon peut être supprimé.';
    if (cur && !MODIFIABLE_UO.includes(cur.etat)) return `Rapport « ${cur.etat} » : il est entre les mains de la DG.`;
    if (cur && !memes(sans(cur, [...CHAMPS_UO, ...calcules]), sans(next, [...CHAMPS_UO, ...calcules]))) return 'L\'UO ne modifie que le titre, la période, les fichiers et son commentaire.';
    if (cur && !memes(cur.revues || {}, next.revues || {})) return 'Les revues des experts ne sont pas modifiables par l\'UO.';
    const vers = next.etat || 'Brouillon';
    if (!['Brouillon', 'Envoyé', 'À corriger'].includes(vers)) return 'L\'UO enregistre ou envoie son rapport ; la validation revient à la DG.';
    if (cur && cur.etat === 'À corriger' && vers === 'Brouillon') return 'Rapport à corriger : corrigez puis renvoyez-le.';
    if (vers === 'Envoyé' && !(next.fichiers || []).length) return 'Joignez au moins un fichier (Excel ou Word) avant d\'envoyer.';
    return null;
  }
  if (!cur || !next) return 'Seule l\'UO crée ou supprime un rapport.';
  if (role === 'expert') {
    if (cur.etat !== 'Envoyé') return 'Ce rapport n\'est pas en revue.';
    if (!(cur.attendus || []).includes(user.id)) return 'Vous n\'êtes pas désigné pour revoir ce rapport.';
    const t = String(cur.tour || 1);
    const avant = { ...(cur.revues || {}) }, apres = { ...(next.revues || {}) };
    const moiAvant = (avant[t] || {})[user.id], moiApres = (apres[t] || {})[user.id];
    if (moiAvant?.terminee) return 'Votre revue est déjà terminée pour ce tour.';
    const autresAvant = sans(avant[t], [user.id]), autresApres = sans(apres[t], [user.id]);
    if (!memes(autresAvant, autresApres) || !memes(sans(avant, [t]), sans(apres, [t]))) return 'Vous ne modifiez que votre propre revue.';
    if (!memes(sans(cur, calcules), sans(next, calcules))) return 'L\'expert ne modifie que sa revue (erreurs, commentaire).';
    if (next.etat && next.etat !== cur.etat && next.etat !== 'À valider DG') return 'L\'expert ne change pas le statut du rapport.';
    if (moiApres) {
      const n = Number(moiApres.erreurs);
      if (!Number.isInteger(n) || n < 0 || n > 9999) return 'Nombre d\'erreurs : entier positif ou nul.';
      if (n > 0 && !String(moiApres.commentaire || '').trim() && moiApres.terminee) return 'Décrivez les erreurs dans le commentaire.';
    }
    return null;
  }
  if (role === 'responsable') {
    if (cur.etat !== 'À valider DG') return 'Ce rapport n\'attend pas la validation du responsable DG.';
    if (!memes(sans(cur, calcules), sans(next, calcules)) || !memes(cur.revues || {}, next.revues || {})) return 'Le responsable DG décide (clôture ou correction), il ne modifie pas le rapport.';
    if (next.etat === 'Clôturé' && aDesRemarques(cur)) return 'Des erreurs ou des commentaires ont été relevés : renvoyez le rapport à l\'UO pour correction.';
    if (!['Clôturé', 'À corriger', 'À valider DG'].includes(next.etat)) return 'Décision attendue : clôturer ou renvoyer pour correction.';
    return null;
  }
  return 'Action non autorisée.';
}

/*
 * Champs calculés par le serveur après le contrôle : tour de revue, experts attendus (liste fournie par le serveur),
 * passage automatique « À valider DG » quand toutes les revues du tour sont terminées, décision, historique.
 */
export function ajusterRapport(user, cur, next, { experts = [], maintenant = new Date().toISOString() } = {}) {
  if (!next) return next;
  const out = { ...next, historique: [...(cur?.historique || [])], revues: next.revues || cur?.revues || {} };
  const qui = user?.nom || user?.id || '';
  const trace = (action, detail) => out.historique.push({ le: maintenant, par: qui, action, ...(detail ? { detail } : {}) });
  out.tour = cur?.tour || 1;
  out.attendus = cur?.attendus || [];
  out.decision = cur?.decision;
  const avant = cur?.etat || null;
  out.etat = next.etat || avant || 'Brouillon';
  if (!cur) trace('Création');
  if (out.etat === 'Envoyé' && avant !== 'Envoyé') {
    if (avant === 'À corriger') { out.tour = (cur.tour || 1) + 1; trace('Correction renvoyée à la DG', `tour ${out.tour}`); }
    else trace('Envoyé à la DG');
    out.attendus = experts.map((e) => e.id);
  }
  if (out.etat === 'À valider DG' && avant === 'Envoyé' && !revuesTerminees(out)) out.etat = 'Envoyé';   // pas avant la dernière revue
  if (out.etat === 'Envoyé') {
    // une revue terminée dans ce tour : trace ; toutes terminées : à valider par le responsable DG
    const t = String(out.tour);
    for (const [id, rv] of Object.entries(out.revues[t] || {})) if (rv.terminee && !((cur?.revues || {})[t] || {})[id]?.terminee) trace(`Revue terminée (${rv.nom || id})`, `${Number(rv.erreurs) || 0} erreur(s)`);
    if (revuesTerminees(out)) { out.etat = 'À valider DG'; trace('Revues terminées : à valider par le responsable DG'); }
  }
  if (avant === 'À valider DG' && out.etat !== avant && (out.etat === 'Clôturé' || out.etat === 'À corriger')) {
    out.decision = { etat: out.etat, par: qui, le: maintenant, ...(next.decision?.motif ? { motif: String(next.decision.motif).slice(0, 2000) } : {}) };
    trace(out.etat === 'Clôturé' ? 'Clôturé par le responsable DG' : 'Renvoyé à l\'UO pour correction', out.decision.motif);
  }
  if (avant && avant !== out.etat && !out.historique.some((h) => h.le === maintenant)) trace(`Statut : ${avant} → ${out.etat}`);
  return out;
}

// Notifications d'un changement d'état de rapport -> [{ type, ids?: [comptes], cibles?: [profils], texte }]
export function evenementsRapport(cur, next, auteur) {
  if (!next || cur?.etat === next.etat) return [];
  const obj = `Rapport ${next.code}${next.titre ? ' — ' + next.titre : ''} (${next.unit || ''})`;
  if (next.etat === 'Envoyé') return [{ type: 'rapport_a_revoir', ids: next.attendus || [], texte: `${obj} à revoir${(next.tour || 1) > 1 ? ' (correction, tour ' + next.tour + ')' : ''}` }];
  if (next.etat === 'À valider DG') return [{ type: 'rapport_a_valider', capaciteRapports: 'responsable', texte: `${obj} : revues des experts terminées (${totalErreurs(next)} erreur(s)), à valider` }];
  if (next.etat === 'À corriger') return [{ type: 'rapport_a_corriger', capaciteRapports: 'uo', texte: `${obj} à corriger (DG${auteur?.nom ? ' — ' + auteur.nom : ''})` }];
  if (next.etat === 'Clôturé') return [{ type: 'rapport_cloture', capaciteRapports: 'uo', texte: `${obj} validé et clôturé par la DG` }];
  return [];
}
