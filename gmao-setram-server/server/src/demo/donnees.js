/*
 * Données FICTIVES de démonstration : équipements, DI, BT, préventif, magasin, personnel...
 * Entièrement déterministes (même graine => mêmes données) et calées sur la date du jour, pour que les
 * indicateurs (KPI), alertes d'habilitations et échéances aient toujours un contenu réaliste.
 * Aucune donnée réelle : noms, téléphones et adresses sont inventés (domaines en .example).
 */
import { SYSTEMES } from './referentiels.js';

export const ABBR = { Alger: 'ALG', Oran: 'ORN', Constantine: 'CST', 'Sidi Bel Abbès': 'SBA', Ouargla: 'OUA', Sétif: 'SET', Mostaganem: 'MST' };
const pad = (n, l = 2) => String(n).padStart(l, '0');

function prng(seed) {                                   // mulberry32
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function genererDemo(now = new Date(), graine = 2026) {
  const rnd = prng(graine);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const entre = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const base = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0));
  const jourDe = (off) => { const d = new Date(base.getTime() + off * 864e5); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
  const horo = (off, h, m = 0) => `${jourDe(off)} ${pad(h)}:${pad(m)}`;
  const ajoutH = (off, h, m, plusH) => { const t = off * 24 * 60 + h * 60 + m + Math.round(plusH * 60); const o = Math.floor(t / 1440), r = t - o * 1440; return horo(o, Math.floor(r / 60), r % 60); };
  const annee = (off) => Number(jourDe(off).slice(0, 4));

  const col = { equipements: [], intervenants: [], prestataires: [], organismes: [], mesures: [], controles: [], pieces: [], dis: [], bts: [], planning: [] };
  const compteurs = new Map();                          // 'nom|scope|annee' -> dernier numéro
  const suivant = (nom, scope, an) => { const k = `${nom}|${scope}|${an}`; const n = (compteurs.get(k) || 0) + 1; compteurs.set(k, n); return n; };

  /* ───── Équipements ───── */
  const CAT = {
    CFO: { SST: ['Transformateur HT/BT', 'Redresseur & Disjoncteur', 'Jeu de barres & Cellules HTA'], LAC: ['Fil de contact & Câble porteur', 'Isolateur & Console'], ECL: ['Armoire BT Station'] },
    CFA: { VDO: ['Caméra dôme quai', 'Enregistreur NVR'], SON: ['Haut-parleur quai', "Poste d'interphonie"], HOR: ['Horloge mère station'] },
    VOIE: { RVB: ['Rail UIC60 PK4', 'Traverse béton'], AIG: ["Moteur d'aiguille AIG-12", 'Aiguillage Voie 3'] },
    BILLETTIQUE: { VAL: ['Valideur quai Centrale', 'Valideur bord Rame 02'], DAT: ['DAT station Émir'], PTL: ['Portillon accès Gare', 'Portillon accès Gare (2)'] },
    MR: { BOG: ['Bogie Rame 02', 'Disque de frein Rame 04'], TRC: ['Onduleur Rame 04'], PRT: ['Porte passager Rame 01'], CLM: ['Groupe HVAC Rame 03'] },
    ELM: { GRP: ['Groupe électrogène Dépôt', 'TGBT Atelier Central'] },
    BO: { STA: ['Abri quai Station Centrale'], DEP: ['Bâtiment Atelier Central'], HVI: ['Extincteur Atelier'] },
    EQI: { PNT: ['Pont roulant 10T'], TOR: ['Torus Dépôt'], TRF: ['Tour en fosse Atelier'] },
  };
  const PAR_UNITE = {
    Alger: null,                                                             // tout le catalogue
    Oran: { CFO: { SST: 2, LAC: 1 }, CFA: { VDO: 2, SON: 1 }, MR: { BOG: 2, PRT: 1, CLM: 1 }, BILLETTIQUE: { VAL: 2, PTL: 1 } },
    Constantine: { CFO: { SST: 1 }, BILLETTIQUE: { VAL: 2, DAT: 1 }, MR: { BOG: 1, PRT: 1 } },
    'Sidi Bel Abbès': { CFO: { SST: 1 }, CFA: { VDO: 1 }, BILLETTIQUE: { VAL: 1 }, VOIE: { AIG: 1 } },
    Ouargla: { CFO: { SST: 1 }, BILLETTIQUE: { VAL: 1, PTL: 1 }, CFA: { SON: 1 } },
    Sétif: { CFO: { SST: 1 }, BILLETTIQUE: { VAL: 1, PTL: 1 }, CFA: { SON: 1 } },
    Mostaganem: { CFO: { SST: 1 }, BILLETTIQUE: { VAL: 1, PTL: 1 }, CFA: { SON: 1 } },
  };
  const LIEUX = { Alger: ['Dépôt Alger — Atelier B', 'Station Centrale', 'Poste HT Alger', 'Quai Station Émir'], Oran: ['Dépôt Oran', 'Station Place du 1er Novembre', 'Poste HT Oran'], Constantine: ['Dépôt Constantine', 'Station Gare'], 'Sidi Bel Abbès': ['Dépôt Sidi Bel Abbès', 'Station Centre'], Ouargla: ['Dépôt Ouargla', 'Station Centre'], Sétif: ['Dépôt Sétif', 'Station Gare'], Mostaganem: ['Dépôt Mostaganem', 'Station Port'] };
  const MARQUES = ['ABB', 'Siemens', 'Schneider Electric', 'Alstom', 'Bosch', 'Hikvision', 'Legrand', 'Thales'];
  const FOURN = ['ElecPro Algérie', 'Maghreb Équipements', 'TechniParts', 'Sahara Industrie'];
  const sousEquipDe = { 'Transformateur HT/BT': ['Bobine primaire', 'Cuve et radiateur'], 'Moteur d\'aiguille AIG-12': ['Bloc moteur', 'Détecteur de fin de course'], 'Groupe HVAC Rame 03': ['Compresseur', 'Ventilateur'] };
  const eqParUnite = {};
  for (const unit of Object.keys(ABBR)) {
    eqParUnite[unit] = [];
    const quotas = PAR_UNITE[unit];
    for (const [sys, subs] of Object.entries(CAT)) for (const [sub, noms] of Object.entries(subs)) {
      const n = quotas === null ? noms.length : ((quotas[sys] || {})[sub] || 0);
      for (let i = 0; i < n; i++) {
        const code = `${sys}.${ABBR[unit]}.${sub}.${pad(i + 1)}`;
        const nom = noms[i];
        const m = pick(MARQUES);
        const eq = { code, system: sys, subCode: sub, unit, nom, emplacement: pick(LIEUX[unit]), prix: entre(8, 900) * 5000,
          sousEquip: (sousEquipDe[nom] || []).map((n2, k) => ({ code: `${code}.${pad(k + 1)}`, nom: n2, fournisseurs: [{ nom: pick(FOURN), tel: '021 00 00 00', email: 'ventes@fournisseur.example' }] })),
          constructeur: { nom: m, contact: 'Service après-vente', tel: '0550 00 00 00', email: `sav@${m.toLowerCase().replace(/[^a-z]/g, '')}.example` },
          fournisseurs: [{ nom: pick(FOURN), tel: '021 00 00 00', email: 'ventes@fournisseur.example' }] };
        col.equipements.push({ id: code, unit, system: sys, data: eq });
        eqParUnite[unit].push(eq);
      }
    }
  }

  /* ───── Personnel ───── */
  const INTER = [
    ['MT-1001', 'K. Belaïd', 'Technicien CFO', 'Technicien', 1100], ['MT-1002', 'S. Amrani', 'Technicien CFA', 'Technicien', 1050],
    ['MT-1003', 'R. Haddad', 'Technicien MR', 'Technicien', 1200], ['MT-1004', 'Y. Merabet', 'Technicien BILLETTIQUE', 'Technicien', 1000],
    ['MT-1005', 'N. Bouzid', 'Chargé de Maintenance', 'Chargé de Maintenance', 1500], ['MT-1006', 'A. Chérif', 'Responsable Maintenance', 'Responsable', 1800],
    ['MT-1007', 'F. Saadi', 'Magasinier', 'Magasinier', 900], ['MT-1008', 'M. Khelifi', 'Technicien ELM', 'Technicien', 1000],
    ['MT-1009', 'L. Taleb', 'Technicien VOIE', 'Technicien', 1000], ['MT-1010', 'H. Zerrouki', 'Agent Exploitation', 'Exploitation', 950],
  ];
  // [intitulé, jours depuis la dernière habilitation, validité en mois] : certaines expirent bientôt ou sont échues (alertes visibles)
  const HABS = { 'MT-1001': [['H2V', 330, 12], ['B2', 100, 24]], 'MT-1002': [['B1', 200, 24]], 'MT-1003': [['Conduite pont roulant', 700, 24], ['H1', 60, 12]], 'MT-1004': [['B1V', 400, 12]], 'MT-1005': [['H2V', 20, 12]], 'MT-1008': [['Travail en hauteur', 150, 12]] };
  for (const [mat, nom, poste, role, taux] of INTER) {
    col.intervenants.push({ id: mat, unit: '', system: null, data: { nom, mat, poste, role, taux,
      habs: (HABS[mat] || []).map(([i, jours, m]) => ({ i, date: jourDe(-jours), m })),
      conges: mat === 'MT-1001' ? [{ du: jourDe(25), au: jourDe(35) }] : [] } });
  }
  const PRESTA = [
    ['EXT-01', 'SOTEMA Services', 'Prestataire — Matériel roulant', ['MR'], 2200, 'M-2024/14', -400, 95, 'À préparer'],
    ['EXT-02', 'ElecPro Algérie', 'Prestataire — Courants forts', ['CFO', 'ELM'], 2000, 'M-2025/03', -200, 430, 'Validé'],
    ['EXT-03', 'Billet-Tech', 'Prestataire — Billettique', ['BILLETTIQUE'], 1900, 'M-2023/21', -700, -20, 'En préparation'],
  ];
  for (const [mat, nom, poste, systemes, taux, contrat, deb, fin, cdc] of PRESTA) {
    col.prestataires.push({ id: mat, unit: '', system: null, data: { nom, mat, poste, role: 'Prestataire', externe: true, systemes, taux, contrat, dateDebut: jourDe(deb), dateFin: jourDe(fin), cdc,
      contact: 'Service commercial', tel: '021 00 00 00', email: 'contact@prestataire.example', habs: [], conges: [] } });
  }
  for (const [code, nom, domaines] of [['ORG-01', 'APAVE Algérie', ['Contrôle réglementaire']], ['ORG-02', 'VERITAS', ['Contrôle réglementaire', 'Étalonnage']], ['ORG-03', 'ALGERAC Métrologie', ['Étalonnage']]])
    col.organismes.push({ id: code, unit: '', system: null, data: { code, nom, domaines, contact: 'Bureau planning', tel: '021 00 00 00', email: 'planning@organisme.example' } });
  [['M-01', 'Multimètre Fluke 117', -300, 65, 'ALGERAC Métrologie'], ['M-02', 'Pince ampèremétrique', -120, 245, 'ALGERAC Métrologie'], ['M-03', 'Mégohmmètre 1000 V', -400, -35, 'VERITAS'],
    ['M-04', 'Clé dynamométrique 200 N·m', -50, 315, 'VERITAS'], ['M-05', 'Pied à coulisse numérique', -200, 20, 'ALGERAC Métrologie']]
    .forEach(([code, nom, e, p, organisme]) => col.mesures.push({ id: code, unit: '', system: null, data: { code, nom, etalonnage: jourDe(e), peremption: jourDe(p), organisme } }));
  [['R-01', 'Pont roulant 10T', 'APAVE Algérie', 'Annuelle', 'Conforme'], ['R-02', 'Extincteur Atelier', 'APAVE Algérie', 'Annuelle', 'À contrôler'], ['R-03', 'Groupe électrogène Dépôt', 'VERITAS', 'Semestrielle', 'Réserves levées'],
    ['R-04', 'Tour en fosse Atelier', 'APAVE Algérie', 'Annuelle', 'Non conforme'], ['R-05', 'TGBT Atelier Central', 'VERITAS', 'Annuelle', 'Conforme']]
    .forEach(([code, nom, organisme, periodicite, statut]) => col.controles.push({ id: code, unit: '', system: null, data: { code, nom, organisme, periodicite, statut } }));

  /* ───── Magasin ───── */
  const ART = [
    ['Pièce', 'Fusible 10A', 'FUS-10A', 120, 140, 40, 200, 12], ['Pièce', 'Contacteur 25A', 'CT-25', 3400, 12, 6, 24, 3], ['Pièce', 'Relais thermique', 'RT-16', 2100, 5, 6, 20, 4],
    ['Pièce', 'Disjoncteur 16A', 'DJ-16', 1800, 18, 8, 30, 3], ['Pièce', 'Lampe LED station', 'LED-S60', 950, 60, 20, 120, 18], ['Pièce', 'Roulement 6204', 'RLT-6204', 650, 16, 8, 40, 5],
    ['Pièce', 'Plaquette de frein Rame', 'PLQ-R', 18500, 8, 4, 16, 2], ['Pièce', 'Capteur de proximité', 'CPT-12', 4200, 3, 4, 12, 0], ['Pièce', 'Carte lecteur valideur', 'CRT-VAL', 38000, 4, 2, 8, 1],
    ['Pièce', 'Joint porte rame', 'JNT-PRT', 7600, 22, 6, 30, 0], ['Pièce', 'Câble 3x2,5 (m)', 'CAB-325', 280, 420, 100, 800, 90], ['Pièce', 'Tuyau flexible HVAC', 'FLX-H', 5400, 9, 3, 12, 0],
    ['Outillage', 'Clé dynamométrique', 'CLE-DYN', 62000, 3, 1, 4, 0], ['Outillage', 'Multimètre', 'MLT-1', 28000, 5, 2, 6, 0], ['Outillage', 'Perceuse sans fil', 'PRC-18', 36000, 4, 2, 6, 0],
    ['Consommable', 'Graisse haute température', 'GRS-HT', 1200, 25, 10, 40, 8], ['Consommable', 'Nettoyant contact', 'NET-C', 780, 30, 12, 50, 14], ['Consommable', 'Chiffons (lot)', 'CHF-L', 350, 60, 20, 100, 25],
    ['Consommable', 'Gants isolants', 'GNT-I', 4800, 12, 6, 20, 3],
  ];
  const cptCat = { Pièce: 0, Outillage: 0, Consommable: 0 };
  const PREF = { Pièce: 'P', Outillage: 'O', Consommable: 'C' };
  const piecesDef = [];
  ART.forEach(([categorie, nom, ref, prix, stock, min, max, sorties90], idx) => {
    const code = `${PREF[categorie]}-${pad(++cptCat[categorie], 3)}`;
    const mouvements = [{ date: jourDe(-150), qte: stock + sorties90 + 6, type: 'Achat' }];
    let reste = sorties90;
    while (reste > 0) { const q = Math.min(reste, entre(1, Math.max(1, Math.ceil(sorties90 / 3)))); mouvements.push({ date: jourDe(-entre(2, 85)), qte: q, type: 'Sortie' }); reste -= q; }
    if (nom === 'Capteur de proximité') mouvements.splice(1, 0, { date: jourDe(-520), qte: 2, type: 'Sortie' });   // dernière sortie très ancienne : article dormant
    const data = { code, nom, ref, serie: '', prix, stock, min, max, categorie, constructeur: { nom: pick(MARQUES), contact: '', tel: '', email: '' }, fourn1: { nom: pick(FOURN), tel: '021 00 00 00', email: 'ventes@fournisseur.example' }, fourn2: { nom: '', tel: '', email: '' }, mouvements: mouvements.sort((a, b) => a.date.localeCompare(b.date)) };
    col.pieces.push({ id: code, unit: '', system: null, data });
    piecesDef.push(data);
  });
  compteurs.set('pieces:P||0', cptCat.Pièce); compteurs.set('pieces:O||0', cptCat.Outillage); compteurs.set('pieces:C||0', cptCat.Consommable);

  /* ───── DI et BT correctifs ───── */
  const DESIGN = {
    CFO: [['Surchauffe anormale', 'Ventilation obstruée', 'Nettoyage et contrôle de la ventilation'], ['Déclenchement intempestif du disjoncteur', 'Seuil de protection déréglé', 'Réglage des protections'], ['Odeur de brûlé en cellule', 'Connexion desserrée', 'Resserrage et contrôle thermographique']],
    CFA: [['Image absente sur la caméra', 'Alimentation défaillante', "Remplacement de l'alimentation"], ['Haut-parleur inaudible', 'Amplificateur en défaut', "Remplacement de l'amplificateur"], ['Horloge désynchronisée', 'Perte de liaison réseau', 'Reconfiguration du synchronisme']],
    VOIE: [["Aiguille qui ne verrouille pas", "Fin de course déréglé", 'Réglage du détecteur']],
    BILLETTIQUE: [['Valideur ne lit pas les titres', 'Lecteur encrassé', 'Nettoyage et recalibrage du lecteur'], ['Portillon bloqué', 'Capteur de passage défaillant', 'Remplacement du capteur'], ['DAT hors service', 'Monnayeur bloqué', 'Débourrage et réglage du monnayeur']],
    MR: [['Porte qui ne se ferme pas', 'Joint déformé', 'Remplacement du joint'], ['Bruit au freinage', 'Plaquettes usées', 'Remplacement des plaquettes'], ['Climatisation inopérante', 'Fuite de fluide', 'Réparation et recharge']],
    ELM: [['Groupe électrogène ne démarre pas', 'Batterie déchargée', 'Remplacement de la batterie']],
    BO: [['Fuite en toiture', 'Étanchéité dégradée', "Reprise de l'étanchéité"]],
    EQI: [['Pont roulant à-coups au levage', 'Frein à régler', 'Réglage du frein']],
  };
  const tachesCorr = ['Sécuriser la zone / consigner', 'Diagnostiquer la panne', 'Réparer ou remplacer', 'Essai de fonctionnement', 'Remise en service'];
  const techPar = { CFO: 'MT-1001', CFA: 'MT-1002', MR: 'MT-1003', BILLETTIQUE: 'MT-1004', ELM: 'MT-1008', BO: 'MT-1008', VOIE: 'MT-1009', EQI: 'MT-1008' };
  const interDe = (mat) => INTER.find((x) => x[0] === mat);
  const NB_DI = { Alger: 46, Oran: 14, Constantine: 7, 'Sidi Bel Abbès': 4, Ouargla: 3, Sétif: 3, Mostaganem: 3 };
  const demandeurs = ['Agent exploitation', 'Chef de station', 'Régulation', 'Conducteur'];
  // quelques équipements en panne récurrente (même motif) pour illustrer l'indicateur de récurrence
  const recurrents = new Set(['CFO.ALG.SST.01', 'BILLETTIQUE.ALG.PTL.01']);

  for (const unit of Object.keys(ABBR)) {
    const abr = ABBR[unit]; const eqs = eqParUnite[unit]; if (!eqs.length) continue;
    const n = NB_DI[unit];
    const evts = [];
    for (let i = 0; i < n; i++) {
      const ancien = i < n - 7;                                                   // les 7 dernières sont récentes (ouvertes)
      const off = ancien ? -entre(9, 105) : -entre(0, 6);
      evts.push({ off, eq: pick(eqs) });
    }
    if (unit === 'Alger') { for (const code of recurrents) { const eq = eqs.find((e) => e.code === code); [-62, -41, -17].forEach((o) => evts.push({ off: o, eq, force: 0 })); } }
    evts.sort((a, b) => a.off - b.off);
    evts.forEach((ev, idx) => {
      const eq = ev.eq; const an = annee(ev.off);
      const cat = DESIGN[eq.system] || DESIGN.CFO;
      const [panne, cause, solution] = ev.force !== undefined ? cat[0] : pick(cat);
      const num = suivant('dis', abr, an);
      const code = `DI-${abr}-${an}-${pad(num, 4)}`;
      const hDebut = entre(5, 21);
      const recent = ev.off >= -6;
      const etatDI = !recent ? (rnd() < 0.04 ? 'Annulé' : 'Traité') : ['À Transmettre', 'Transmis', 'Transmis', 'Traité'][entre(0, 3)];
      const di = { code, eq: eq.code, nom: eq.nom, se: '', designation: panne, emplacement: eq.emplacement, dateEvt: horo(ev.off, hDebut, pick([0, 15, 30, 45])), dateCreation: jourDe(ev.off),
        perturb: rnd() < 0.18, demandeur: pick(demandeurs), typeMaintenance: 'Corrective', sousType: 'Curative', etat: etatDI };
      col.dis.push({ id: code, unit, system: eq.system, data: di });
      if (etatDI === 'À Transmettre' || etatDI === 'Annulé') return;
      // BT lié
      const tech = interDe(techPar[eq.system] || 'MT-1001');
      const nb = suivant('bts', abr, an);
      const bcode = `BT-${abr}-${an}-${pad(nb, 4)}`;
      const duree = entre(1, 6), log = entre(0, 2);
      const clos = etatDI === 'Traité';
      const piece = piecesDef[entre(0, 11)];
      const consomme = rnd() < 0.55 ? [{ code: piece.code, qte: entre(1, 3) }] : [];
      const bt = { code: bcode, di: code, eq: eq.code, nom: eq.nom, type: 'Corrective — Curative', consigne: `Intervenir sur ${eq.nom} : ${panne.toLowerCase()}.`, horaire: hDebut >= 19 ? 'Nuit' : 'Jour',
        consignation: eq.system === 'CFO' ? 'Oui' : 'Non', exc: false, motifExc: '', assigne: tech[1], assignes: [tech[1]], dateGeneration: ajoutH(ev.off, hDebut, 30, 1),
        detection: clos ? entre(1, 4) : 0, gravite: clos ? entre(1, 4) : 0, dureeIntervention: clos ? duree : 0, tempsLogistique: clos ? log : 0,
        panne: clos ? panne : '-', cause: clos ? cause : '-', effet: clos ? solution : '-',
        intervenants: [{ nom: tech[1], fonction: tech[2], taux: tech[4], temps: clos ? duree + log : 0 }],
        pieces: clos ? consomme : [], outillage: [], consommables: [],
        taches: tachesCorr.map((lib, k) => ({ lib, res: clos ? 'OK' : (k < 2 ? 'OK' : null), com: '' })),
        etat: clos ? 'Clôturé' : 'En cours' };
      if (clos) bt.dateCloture = ajoutH(ev.off, hDebut, 30, 1 + duree + log + 0.5);
      col.bts.push({ id: bcode, unit, system: eq.system, data: bt });
      void idx;
    });
  }

  /* ───── Préventif : plans + BT générés ───── */
  const PLANS = {
    Alger: [['CFO.ALG.SST.01', 'Mensuel', 'Contrôle thermographique'], ['CFO.ALG.SST.02', 'Trimestriel', 'Contrôle du jeu de barres'], ['CFA.ALG.VDO.01', 'Trimestriel', 'Nettoyage et contrôle caméra'],
      ['MR.ALG.BOG.01', 'Mensuel', 'Inspection du bogie'], ['BILLETTIQUE.ALG.PTL.01', 'Hebdomadaire', 'Contrôle du portillon'], ['EQI.ALG.PNT.01', 'Semestriel', 'Contrôle du pont roulant']],
    Oran: [['CFO.ORN.SST.01', 'Mensuel', 'Contrôle thermographique'], ['MR.ORN.BOG.01', 'Mensuel', 'Inspection du bogie']],
    Constantine: [['MR.CST.BOG.01', 'Mensuel', 'Inspection du bogie']],
  };
  const TACHES_PREV = { Mensuel: ['Contrôle visuel', 'Serrage des connexions', 'Nettoyage', 'Relevé et report des mesures'], Hebdomadaire: ['Contrôle visuel', 'Test de fonctionnement'], Trimestriel: ['Contrôle visuel', 'Mesures électriques', 'Nettoyage', 'Test de fonctionnement'], Semestriel: ['Contrôle complet', 'Graissage', 'Essai en charge'] };
  const PAS = { Hebdomadaire: 7, Mensuel: 30, Trimestriel: 91, Semestriel: 182 };
  for (const [unit, plans] of Object.entries(PLANS)) {
    const abr = ABBR[unit];
    for (const [eqCode, periode, intitule] of plans) {
      const eq = eqParUnite[unit].find((e) => e.code === eqCode); if (!eq) continue;
      const code = `PREV-${abr}-${pad(suivant('planning', abr, 0), 4)}`;
      const pas = PAS[periode];
      const dernierOff = -entre(2, Math.min(pas - 1, 25));
      const tech = interDe(techPar[eq.system] || 'MT-1001');
      const taches = (TACHES_PREV[periode] || TACHES_PREV.Mensuel).slice();
      col.planning.push({ id: code, unit, system: eq.system, data: { code, unit, sys: eq.system, eq: eq.code, nom: eq.nom, periode, date: jourDe(dernierOff + pas), dernier: jourDe(dernierOff), assignes: [tech[1]], taches, outillage: [{ code: 'O-002', qte: 1 }], consommables: [], exc: false, motifExc: '', horaire: 'Jour', consignation: eq.system === 'CFO' ? 'Oui' : 'Non', intitule } });
      // historique : visites passées clôturées + une visite ouverte pour les plans mensuels
      const passees = Math.min(4, Math.floor(100 / pas));
      for (let k = passees; k >= 1; k--) {
        const off = dernierOff - pas * (k - 1) - 0;
        const an = annee(off);
        const bc = `BT-PREV-${abr}-${an}-${pad(suivant('bts:prev', abr, an), 4)}`;
        const ok = rnd() < 0.85;
        col.bts.push({ id: bc, unit, system: eq.system, data: { code: bc, di: null, plan: code, eq: eq.code, nom: eq.nom, type: 'Préventive', consigne: `Visite ${periode.toLowerCase()} — ${eq.nom}`, horaire: 'Jour', consignation: eq.system === 'CFO' ? 'Oui' : 'Non', exc: false, motifExc: '',
          assigne: tech[1], assignes: [tech[1]], dateGeneration: horo(off, 7, 30), detection: 0, gravite: 0, dureeIntervention: ok ? entre(1, 3) : 0, tempsLogistique: ok ? 0 : 0, panne: '-', cause: '-', effet: '-',
          intervenants: [{ nom: tech[1], fonction: tech[2], taux: tech[4], temps: ok ? entre(2, 4) : 0 }], pieces: [], outillage: [{ code: 'O-002', qte: 1 }], consommables: [],
          taches: taches.map((lib) => ({ lib, res: ok ? 'OK' : null, com: '' })), etat: ok ? 'Clôturé' : 'En cours', ...(ok ? { dateCloture: horo(off, 11, 0) } : {}) } });
      }
    }
  }

  // compteurs du serveur : la numérotation continue après les données de démonstration
  const lignesCompteurs = [...compteurs.entries()].map(([k, last]) => { const [name, scope, an] = k.split('|'); return { name, scope, year: Number(an), last }; })
    .map((c) => (c.name === 'pieces:P' || c.name === 'pieces:O' || c.name === 'pieces:C' ? c : c));

  /* ───── Comptes de démonstration ───── */
  const TOUS = SYSTEMES.map(([c]) => c);
  const tous = (volets, unites) => Object.fromEntries(unites.map((u) => [u, { systems: TOUS, volets }]));
  const users = [
    { id: 'demo.admin', nom: 'Démo — Super administrateur', role: 'Super Admin', password: 'Demo2026-Admin', superAdmin: true, droits: {},
      description: 'Accès complet : administration, import Excel, tous les écrans.' },
    { id: 'demo.responsable', nom: 'Démo — Responsable maintenance', role: 'Responsable', password: 'Demo2026-Resp', superAdmin: false, droits: tous([0, 1, 2, 3, 4, 5, 6], ['Alger', 'Oran', 'Constantine']),
      description: 'Pilote la maintenance : DI, BT, préventif, magasin, indicateurs (Alger, Oran, Constantine).' },
    { id: 'demo.technicien', nom: 'Démo — Technicien', role: 'Technicien', password: 'Demo2026-Tech', superAdmin: false, droits: { Alger: { systems: ['CFO', 'CFA', 'BILLETTIQUE'], volets: [0, 1, 2, 3] } },
      description: 'Voit et traite les DI / BT de son périmètre (courants forts et faibles, billettique — Alger).' },
    { id: 'demo.exploitation', nom: 'Démo — Exploitation', role: 'Exploitation', password: 'Demo2026-Expl', superAdmin: false, droits: tous([1], ['Alger', 'Oran']),
      description: "Déclare des anomalies (DI) — l'usage typique sur le terrain, au téléphone ou via un QR code." },
    { id: 'demo.magasin', nom: 'Démo — Magasinier', role: 'Magasinier', password: 'Demo2026-Mag', superAdmin: false, droits: tous([4], ['Alger']),
      description: 'Gère le magasin : stocks, entrées, sorties, décharges.' },
    { id: 'demo.direction', nom: 'Démo — Direction', role: 'Directeur', password: 'Demo2026-Dir', superAdmin: false, droits: tous([6], Object.keys(ABBR)),
      description: 'Consulte les tableaux de bord (KPI) de toutes les unités.' },
  ];

  const collections = {};
  for (const [nom, liste] of Object.entries(col)) collections[nom] = liste;
  return { collections, compteurs: lignesCompteurs, users, aujourdhui: jourDe(0) };
}
