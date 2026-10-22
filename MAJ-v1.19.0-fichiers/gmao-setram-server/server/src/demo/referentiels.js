// Référentiels initiaux (systèmes et arborescence). COPIE des valeurs par défaut de l'interface
// (web/src/lib/referentiels-defaut.js) : un test de l'interface vérifie que les deux restent identiques.
export const SYSTEMES = [['CFO', 'Courants Forts'], ['LAC', 'Ligne Aérienne de Contact'], ['CFA', 'Courants Faibles'], ['VOIE', 'Voie ferrée'], ['BIL', 'Billettique'], ['MR', 'Matériel Roulant'], ['ELM', 'Électromécanique'], ['BO', 'Bâtiment/Ouvrages'], ['ED', 'Équipement Dépôt'], ['MESURE', 'Appareils de Mesure'], ['CTRL', 'Contrôles Réglementaires']];

export const ARBORESCENCE = {
  CFO: [{ code: 'SST', sub: 'Sous-Station Électrique (SST) / Redressement' }, { code: 'ECL', sub: 'Éclairage & Distribution Basse Tension' }],
  LAC: [{ code: 'CAT', sub: 'Caténaire : fil de contact, câble porteur, isolateurs, consoles' }],
  CFA: [{ code: 'VDO', sub: 'Vidéoprotection (CCTV)' }, { code: 'SON', sub: 'Sonorisation (PA) & Interphonie' }, { code: 'HOR', sub: 'Horlogerie Mère / Fille' }],
  VOIE: [{ code: 'RVB', sub: 'Rails, Traverses & Ballast' }, { code: 'AIG', sub: "Aiguillages / Moteurs d'aiguille" }],
  BIL: [{ code: 'VAL', sub: 'Validateurs de Titres' }, { code: 'DAT', sub: 'Distributeurs Automatiques (DAT)' }, { code: 'PTL', sub: 'Portillons' }],
  MR: [{ code: 'BOG', sub: 'Bogies & Freinage' }, { code: 'TRC', sub: 'Chaîne de Traction & Inverseurs' }, { code: 'PRT', sub: 'Portes & Accès Passagers' }, { code: 'CLM', sub: 'Climatisation Rame (HVAC)' }],
  ELM: [{ code: 'GRP', sub: 'Groupes Électrogènes & TGBT' }],
  BO: [{ code: 'STA', sub: 'Stations Passagers & Abris' }, { code: 'DEP', sub: 'Dépôt / Atelier Central' }, { code: 'HVI', sub: 'HVAC & Extinction Incendie' }],
  ED: [{ code: 'PNT', sub: 'Pont Roulant & Vérins de Levage' }, { code: 'TOR', sub: 'Machine à Laver (Torus)' }, { code: 'TRF', sub: 'Tour en Fosse' }],
};

// Lignes telles que l'interface les attend (une ligne par système, par sous-système) — voir web/src/referentiels.js
export function lignesReferentiels() {
  const systemes = SYSTEMES.map(([code, nom], i) => ({ id: code, data: { code, nom, ordre: i } }));
  const arbo = Object.entries(ARBORESCENCE).flatMap(([sys, subs], i) => [
    { id: sys, data: { system: sys, header: true, ordre: i } },
    ...subs.map((s, j) => ({ id: `${sys}.${s.code}`, data: { system: sys, code: s.code, sub: s.sub, ordre: j } })),
  ]);
  return { systemes, arborescence: arbo };
}
