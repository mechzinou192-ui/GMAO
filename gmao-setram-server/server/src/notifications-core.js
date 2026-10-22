// Notifications : logique PURE (sans base de données), partagée avec la démonstration en navigateur.
// Qui prévenir quand un élément change d'état ; le texte ne contient que le numéro et l'équipement (aucun détail sensible,
// il peut partir par e-mail).
import { nomProfil, TOUS_SYSTEMES, catalogue } from './profils-core.js';
import { evenementsRapport } from './rapports-core.js';

const CHARGES = ['Chargé système', 'Responsable système'];

// -> [{ type, cibles: [profils], texte }]
export function evenements(collection, cur, next, auteur) {
  if (!next) return [];
  if (collection === 'rapports') return evenementsRapport(cur, next, auteur);
  const qui = auteur?.nom || auteur?.id || 'quelqu\'un';
  const objet = (d) => `${d.code}${d.eq ? ' — ' + d.eq : ''}`;
  const out = [];
  if (collection === 'bts') {
    const reprise = next.validationDG?.etat === 'À reprendre' && cur?.validationDG?.etat !== 'À reprendre';
    if (reprise) {
      out.push({ type: 'ot_a_reprendre', cibles: CHARGES, texte: `OT ${objet(next)} à reprendre (Expert DG ${qui}) : ${next.validationDG.motif || ''}`.trim() });
    } else if (next.etat === 'À clôturer' && cur?.etat !== 'À clôturer') {
      out.push({ type: 'ot_a_cloturer', cibles: CHARGES, texte: `OT ${objet(next)} à clôturer : saisie terminée par ${qui}` });
    }
    if (next.etat === 'Clôturé' && cur?.etat !== 'Clôturé' && nomProfil(auteur?.role) === 'Chargé système') {
      out.push({ type: 'ot_cloture', cibles: ['Responsable système'], texte: `OT ${objet(next)} clôturé par ${qui} (chargé système)` });
    }
  } else if (['equipements', 'planning', 'arborescence'].includes(collection)) {
    if (next.validationDG?.etat === 'À reprendre' && cur?.validationDG?.etat !== 'À reprendre') {
      const lib = { equipements: 'Équipement', planning: 'Plan préventif', arborescence: 'Sous-système' }[collection];
      out.push({ type: 'referentiel_a_reprendre', cibles: CHARGES, texte: `${lib} ${next.code || next.system || ''} à reprendre (Expert DG ${qui}) : ${next.validationDG.motif || ''}`.trim() });
    }
  }
  return out;
}

// Le compte `u` (forme base : role, actif, droits, super_admin) doit-il recevoir l'événement sur (unit, system) ?
export function estDestinataire(u, evt, unit, system, auteurId) {
  if (!u || !u.actif || u.id === auteurId || u.super_admin) return false;
  if (evt.ids) return evt.ids.includes(u.id);                        // destinataires désignés (experts attendus d'un rapport)
  const nom = nomProfil(u.role), p = catalogue()[nom];
  const parProfil = (evt.cibles || []).includes(nom)
    || (evt.capaciteRapports && p?.rapports === evt.capaciteRapports)
    // profils créés par le super admin : prévenus des OT à clôturer s'ils clôturent (hors périmètre « tous systèmes »)
    || ((evt.cibles || []).includes('Chargé système') && p?.personnalise && p.cloture && !p.tousSystemes && !p.lectureSeule);
  if (!parProfil) return false;
  // élément sans unité (arborescence) : toute unité où la personne suit ce système
  const grants = unit ? [(u.droits || {})[unit]].filter(Boolean) : Object.values(u.droits || {});
  return grants.some((g) => {
    const sys = Array.isArray(g.systems) ? g.systems : [];
    return !system || sys.includes(TOUS_SYSTEMES) || sys.includes(system);
  });
}
