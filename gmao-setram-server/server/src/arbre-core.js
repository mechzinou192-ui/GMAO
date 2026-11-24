/*
 * Arborescence sous un équipement : profondeur ILLIMITÉE.
 *
 * Modèle : un équipement a `sousEquip: [nœud]` ; chaque nœud peut avoir `enfants: [nœud]`, et ainsi de suite.
 * Le code d'un enfant = code du parent + « .NN » (ex. CFO.ALG.SST.01.01.01.01…), donc la profondeur d'un nœud
 * se déduit de son seul code. Les anciennes données (`sousSousEquip`) restent lues (lecture tolérante) et sont
 * converties en `enfants` à la première modification (et par la migration 011).
 *
 * Profondeur (sous l'équipement) : 1 = sous-équipement, 2 = sous-sous-équipement, 3 = niveau 6, 4 = niveau 7…
 * Niveau de droit : 'sousEquipement' (1), 'sousSousEquipement' (2), 'niveauxProfonds' (3 et plus).
 *
 * Pur et sans dépendance : importé par le serveur (droits) et par l'application web (écrans, import).
 */

export const NIVEAU_PROFOND = 'niveauxProfonds';

// Enfants d'un nœud (nouveau champ, ou ancien champ `sousSousEquip` des données existantes)
export const enfantsDe = (n) => (n && (Array.isArray(n.enfants) ? n.enfants : Array.isArray(n.sousSousEquip) ? n.sousSousEquip : [])) || [];

const segments = (code) => String(code || '').split('.').filter(Boolean).length;

// Profondeur d'un nœud sous son équipement, d'après les codes (0 = l'équipement lui-même)
export const profondeur = (codeEquip, codeNoeud) => (codeNoeud ? Math.max(0, segments(codeNoeud) - segments(codeEquip)) : 0);

export const cleNiveauProfondeur = (d) => (d <= 1 ? 'sousEquipement' : d === 2 ? 'sousSousEquipement' : NIVEAU_PROFOND);
// Niveau global dans l'arborescence : système 1, sous-système 2, équipement 3, sous-équipement 4, sous-sous 5, 6, 7…
export const numeroNiveau = (d) => d + 3;
export const libelleProfondeur = (d) => (d <= 1 ? 'Sous-équipement' : d === 2 ? 'Sous-sous-équipement' : `Niveau ${numeroNiveau(d)}`);

// Retourne { noeud, ancetres: [nœud1…parent direct], profondeur } ou null
export function trouverNoeud(equip, code) {
  if (!equip || !code) return null;
  const cherche = (liste, ancetres) => {
    for (const n of liste) {
      if (n.code === code) return { noeud: n, ancetres, profondeur: ancetres.length + 1 };
      // un enfant a toujours le code du parent pour préfixe : on ne descend que dans la bonne branche
      if (String(code).startsWith(n.code + '.')) {
        const r = cherche(enfantsDe(n), [...ancetres, n]);
        if (r) return r;
      }
    }
    return null;
  };
  return cherche(equip.sousEquip || [], []);
}

// Parcours en profondeur : fn(noeud, ancetres, profondeur)
export function parcourir(equip, fn) {
  const aller = (liste, ancetres) => {
    for (const n of liste) {
      fn(n, ancetres, ancetres.length + 1);
      aller(enfantsDe(n), [...ancetres, n]);
    }
  };
  aller((equip && equip.sousEquip) || [], []);
}

// Nombre total de descendants d'un nœud (ou de tous les nœuds d'un équipement)
export function compterDescendants(n) {
  return enfantsDe(n).reduce((t, e) => t + 1 + compterDescendants(e), 0);
}
export const compterNoeuds = (equip) => ((equip && equip.sousEquip) || []).reduce((t, e) => t + 1 + compterDescendants(e), 0);

// Prochain code libre sous un parent (le plus grand numéro existant + 1, donc jamais de doublon après suppression)
export function prochainCodeEnfant(parent, existants) {
  const liste = existants || enfantsDe(parent);
  const max = Math.max(0, ...liste.map((x) => parseInt(String(x.code).split('.').pop(), 10) || 0));
  return `${parent.code}.${String(max + 1).padStart(2, '0')}`;
}

// Remplace (ou retire, ou ajoute) un nœud dans l'arbre d'un équipement sans toucher au reste.
// op : { type: 'ajouter', parentCode (vide = sous l'équipement), noeud } | { type: 'modifier', noeud } | { type: 'retirer', code }
export function appliquerSurEquipement(equip, op) {
  const net = (n) => { const { sousSousEquip, ...reste } = n; return sousSousEquip && !reste.enfants ? { ...reste, enfants: sousSousEquip } : reste; };
  const mapNoeuds = (liste, fn) => liste.map((n) => fn({ ...net(n), enfants: mapNoeuds(enfantsDe(n), fn) }));
  const racine = (equip.sousEquip || []);
  if (op.type === 'retirer') {
    const retirer = (liste) => liste.filter((n) => n.code !== op.code).map((n) => ({ ...net(n), enfants: retirer(enfantsDe(n)) }));
    return { ...equip, sousEquip: retirer(racine) };
  }
  if (op.type === 'modifier') {
    return { ...equip, sousEquip: mapNoeuds(racine, (n) => (n.code === op.noeud.code ? { ...n, ...op.noeud, enfants: n.enfants } : n)) };
  }
  // ajouter
  const nouveau = { ...op.noeud, enfants: op.noeud.enfants || [] };
  if (!op.parentCode || op.parentCode === equip.code) {
    return { ...equip, sousEquip: [...mapNoeuds(racine, (n) => n), nouveau] };
  }
  return { ...equip, sousEquip: mapNoeuds(racine, (n) => (n.code === op.parentCode ? { ...n, enfants: [...n.enfants, nouveau] } : n)) };
}

// Convertit un équipement ancien format (sousSousEquip) vers le nouveau (enfants), récursivement
export function normaliserEquipement(equip) {
  if (!equip) return equip;
  const conv = (n) => { const { sousSousEquip, ...reste } = n; const enf = Array.isArray(reste.enfants) ? reste.enfants : (sousSousEquip || []); return { ...reste, enfants: enf.map(conv) }; };
  return { ...equip, sousEquip: (equip.sousEquip || []).map(conv) };
}

// Champs d'une DI / d'un OT / d'un plan visant un nœud : se et ss restent renseignés (compatibilité des écrans et indicateurs),
// `noeud` porte le code du nœud visé, quelle que soit la profondeur.
export function champsNoeud(equip, code) {
  const r = trouverNoeud(equip, code);
  if (!r) return { se: '', ss: '', noeud: '' };
  const chaine = [...r.ancetres, r.noeud];
  return { se: chaine[0].code, ss: chaine[1] ? chaine[1].code : '', noeud: r.noeud.code };
}

// Texte « équipement — N1 — N2 — … » d'un nœud (nom composé stocké dans la DI)
export function nomComposeNoeud(equip, code) {
  const r = trouverNoeud(equip, code);
  if (!r) return equip ? equip.nom : '';
  return [equip.nom, ...[...r.ancetres, r.noeud].map((n) => `${n.code} ${n.nom}`)].join(' — ');
}
