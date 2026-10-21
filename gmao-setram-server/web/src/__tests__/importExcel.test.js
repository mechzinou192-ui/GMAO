import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { FEUILLES, genererModele, lireClasseur, preparerImport, completerCodes, corpsRequete, compterAEcrire, lireDate, norm } from '../importExcel.js';

const UNITS = ['Alger', 'Oran', 'Constantine', 'Sidi Bel Abbès', 'Ouargla', 'Sétif', 'Mostaganem'];
const ABBR = { Alger: 'ALG', Oran: 'ORN', Constantine: 'CST', 'Sidi Bel Abbès': 'SBA', Ouargla: 'OUA', Sétif: 'SET', Mostaganem: 'MST' };
const TREE = {
  CFO: [{ code: 'SST', sub: 'Sous-Station Électrique' }, { code: 'LAC', sub: 'Caténaire' }],
  BILLETTIQUE: [{ code: 'PTL', sub: 'Portillons' }],
  MR: [{ code: 'BOG', sub: 'Bogies' }],
};
const SYSTEMS = [['CFO', 'Courants forts'], ['BILLETTIQUE', 'Billettique'], ['MR', 'Matériel roulant'], ['MESURE', 'Mesure'], ['CTRL', 'Contrôles']];
const vide = () => ({ equipements: [], pieces: [], intervenants: [], prestataires: [], organismes: [], mesures: [], controles: [] });
const ctx = (ex = {}) => ({
  units: UNITS, unitAbbr: ABBR, roles: ['Technicien', 'Exploitation', 'Chargé de Maintenance', 'Responsable', 'Magasinier', 'Directeur'],
  cdcEtats: ['À préparer', 'En préparation', 'Validé', 'Consultation lancée'], orgDom: ['Contrôle réglementaire', 'Étalonnage'],
  systemsList: SYSTEMS, treeStruct: TREE, today: '2026-10-05', ...vide(), ...ex,
});

// Fabrique un classeur à partir de { 'Nom de feuille': [[en-têtes], [ligne], ...] } et le relit comme le ferait l'application
async function lire(feuilles) {
  const wb = new ExcelJS.Workbook();
  for (const [nom, lignes] of Object.entries(feuilles)) { const ws = wb.addWorksheet(nom); lignes.forEach((l) => ws.addRow(l)); }
  const buf = await wb.xlsx.writeBuffer();
  return lireClasseur(ExcelJS, buf);
}
const EQ_H = ['Unité *', 'Système *', 'Sous-système *', 'Désignation *', 'Emplacement', 'Prix (DA)', 'Constructeur', 'Fournisseur', 'Code'];

describe('modèle Excel', () => {
  it('contient une feuille par type, la notice et les référentiels', async () => {
    const wb = genererModele(ExcelJS, ctx());
    const noms = wb.worksheets.map((w) => w.name);
    expect(noms).toEqual(['Lisez-moi', ...FEUILLES.map((f) => f.nom), 'Référentiels']);
    const ref = wb.getWorksheet('Référentiels');
    expect(ref.getCell('A2').value).toBe('Alger'); expect(ref.getCell('B2').value).toBe('ALG');
    expect(wb.getWorksheet('Équipements').getCell('A1').value).toBe('Repère'); expect(wb.getWorksheet('Équipements').getCell('B1').value).toBe('Unité *');
    expect(wb.getWorksheet('Équipements').getCell('B2').dataValidation.formulae[0]).toContain('Alger,Oran');
  });
  it('le modèle vierge se relit sans erreur et sans donnée (mais invite à le remplir)', async () => {
    const buf = await genererModele(ExcelJS, ctx()).xlsx.writeBuffer();
    const lec = await lireClasseur(ExcelJS, buf);
    const prep = preparerImport(lec, ctx());
    expect(prep.erreurs).toHaveLength(1);
    expect(prep.erreurs[0].message).toMatch(/Aucune donnée à importer/);
  });
  it('un fichier qui n\'est pas un classeur Excel est refusé proprement', async () => {
    await expect(lireClasseur(ExcelJS, new TextEncoder().encode('ceci n\'est pas un xlsx').buffer)).rejects.toThrow(/classeur Excel/);
  });
});

describe('analyse des dates', () => {
  it('accepte JJ/MM/AAAA, ISO, dates Excel et numéros de série', () => {
    expect(lireDate('05/10/2026')).toBe('2026-10-05');
    expect(lireDate('5-10-2026')).toBe('2026-10-05');
    expect(lireDate('2026-10-05')).toBe('2026-10-05');
    expect(lireDate(new Date(Date.UTC(2026, 9, 5)))).toBe('2026-10-05');
    expect(lireDate(46300)).toBe('2026-10-05');
  });
  it('refuse les dates impossibles ou hors période', () => {
    expect(() => lireDate('31/02/2026')).toThrow();
    expect(() => lireDate('2026-13-01')).toThrow();
    expect(() => lireDate('05/10/1850')).toThrow();
    expect(() => lireDate('bientôt')).toThrow(/n'est pas une date/);
    expect(() => lireDate(12)).toThrow();
  });
});

describe('équipements', () => {
  it('crée les codes automatiquement, par unité / système / sous-système', async () => {
    const lec = await lire({ 'Équipements': [EQ_H,
      ['Alger', 'CFO', 'SST', 'Transformateur T1', 'Poste HT', '1 250 000,50', 'ABB', 'ElecPro'],
      ['Alger', 'CFO', 'SST', 'Transformateur T2'],
      ['Oran', 'CFO', 'SST', 'Transformateur Oran'],
      ['Alger', 'billettique', 'ptl', 'Portillon 1'],
      ['ALG', 'Courants forts', 'Caténaire', 'Fil de contact'],
    ] });
    const p = preparerImport(lec, ctx());
    expect(p.erreurs).toEqual([]);
    const eq = p.collections.equipements;
    expect(eq.map((e) => e.id)).toEqual(['CFO.ALG.SST.01', 'CFO.ALG.SST.02', 'CFO.ORN.SST.01', 'BILLETTIQUE.ALG.PTL.01', 'CFO.ALG.LAC.01']);
    expect(eq[0]).toMatchObject({ unit: 'Alger', system: 'CFO' });
    expect(eq[0].data).toMatchObject({ code: 'CFO.ALG.SST.01', subCode: 'SST', unit: 'Alger', nom: 'Transformateur T1', emplacement: 'Poste HT', prix: 1250000.5, sousEquip: [] });
    expect(eq[0].data.constructeur.nom).toBe('ABB');
    expect(eq[0].data.fournisseurs).toEqual([{ nom: 'ElecPro', tel: '', email: '' }]);
    expect(eq[1].data.fournisseurs[0].nom).toBe('Non renseigné');
    expect(p.resume[0]).toMatchObject({ lignes: 5, nouveaux: 5, existants: 0 });
  });

  it('poursuit la numérotation après les équipements existants, même s\'il y a eu des suppressions', async () => {
    const existant = { code: 'CFO.ALG.SST.07', system: 'CFO', subCode: 'SST', unit: 'Alger', nom: 'Ancien', sousEquip: [] };
    const lec = await lire({ 'Équipements': [EQ_H, ['Alger', 'CFO', 'SST', 'Nouveau']] });
    const p = preparerImport(lec, ctx({ equipements: [existant] }));
    expect(p.collections.equipements[0].id).toBe('CFO.ALG.SST.08');
  });

  it('rejouer le même fichier ne crée aucun doublon (y compris des désignations identiques)', async () => {
    const rows = [['Alger', 'BILLETTIQUE', 'PTL', 'Portillon'], ['Alger', 'BILLETTIQUE', 'PTL', 'Portillon'], ['Alger', 'BILLETTIQUE', 'PTL', 'Portillon']];
    const lec = await lire({ 'Équipements': [EQ_H, ...rows] });
    const p1 = preparerImport(lec, ctx());
    expect(p1.collections.equipements).toHaveLength(3);                       // 3 portillons identiques : légitime
    const deja = p1.collections.equipements.map((r) => r.data);
    const p2 = preparerImport(lec, ctx({ equipements: deja }));
    expect(p2.collections.equipements ?? []).toHaveLength(0);                 // rien à écrire
    expect(p2.resume[0]).toMatchObject({ nouveaux: 0, existants: 3 });
    const p3 = preparerImport(await lire({ 'Équipements': [EQ_H, ...rows, ['Alger', 'BILLETTIQUE', 'PTL', 'Portillon']] }), ctx({ equipements: deja }));
    expect(p3.collections.equipements.map((r) => r.id)).toEqual(['BILLETTIQUE.ALG.PTL.04']);   // seul le 4e est nouveau
  });

  it('signale chaque erreur avec feuille, ligne et colonne, et n\'écrit rien d\'utile', async () => {
    const lec = await lire({ 'Équipements': [EQ_H,
      ['Paris', 'CFO', 'SST', 'X'],
      ['Alger', 'XYZ', 'SST', 'X'],
      ['Alger', 'CFO', 'ZZZ', 'X'],
      ['Alger', 'CFO', 'SST', ''],
      ['Alger', 'CFO', 'SST', 'Prix faux', '', 'beaucoup'],
      ['Alger', 'CFO', 'SST', 'Code faux', '', '', '', '', 'MR.ALG.BOG.01'],
      ['Alger', 'CFO', 'SST', 'Prix négatif', '', '-5'],
    ] });
    const p = preparerImport(lec, ctx());
    const m = p.erreurs.map((e) => `${e.feuille}|${e.ligne}|${e.message}`);
    expect(p.erreurs).toHaveLength(7);
    expect(m[0]).toMatch(/^Équipements\|2\|colonne « Unité » : « Paris » n'est pas une valeur autorisée/);
    expect(m[1]).toMatch(/\|3\|colonne « Système » : « XYZ » inconnu/);
    expect(m[2]).toMatch(/\|4\|colonne « Sous-système » : « ZZZ » inconnu pour le système CFO \(choix : SST, LAC\)/);
    expect(m[3]).toMatch(/\|5\|colonne « Désignation » : valeur obligatoire manquante/);
    expect(m[4]).toMatch(/\|6\|colonne « Prix \(DA\) » : « beaucoup » n'est pas un nombre/);
    expect(m[5]).toMatch(/\|7\|colonne « Code » : « MR.ALG.BOG.01 » ne correspond pas/);
    expect(m[6]).toMatch(/\|8\|colonne « Prix \(DA\) » : « -5 » doit être supérieur/);
  });

  it('colonne obligatoire absente : message clair', async () => {
    const lec = await lire({ 'Équipements': [['Unité', 'Désignation'], ['Alger', 'x']] });
    const p = preparerImport(lec, ctx());
    expect(p.erreurs[0].message).toMatch(/Système.*Sous-système|introuvable/);
  });

  it('mode « mettre à jour » : modifie les cellules renseignées, conserve le reste', async () => {
    const ex = { code: 'CFO.ALG.SST.01', system: 'CFO', subCode: 'SST', unit: 'Alger', nom: 'Transformateur T1', emplacement: 'Ancien lieu', prix: 100, sousEquip: [{ code: 'CFO.ALG.SST.01.01', nom: 'Bobine', fournisseurs: [] }],
      constructeur: { nom: 'ABB', contact: 'M. X', tel: '1', email: 'a@b' }, fournisseurs: [{ nom: 'F', tel: '', email: '' }] };
    const lec = await lire({ 'Équipements': [EQ_H, ['Alger', 'CFO', 'SST', 'Transformateur T1', 'Nouveau lieu', '', '', '', 'CFO.ALG.SST.01']] });
    const skip = preparerImport(lec, ctx({ equipements: [ex] }));
    expect(skip.collections.equipements ?? []).toHaveLength(0);
    const maj = preparerImport(lec, ctx({ equipements: [ex] }), { onConflict: 'update' });
    const r = maj.collections.equipements[0];
    expect(r.ecrase).toBe(true);
    expect(r.data.emplacement).toBe('Nouveau lieu');
    expect(r.data.prix).toBe(100);                           // cellule vide : valeur conservée
    expect(r.data.constructeur.contact).toBe('M. X');
    expect(r.data.sousEquip).toHaveLength(1);                // sous-équipements conservés
  });
});

describe('sous-équipements', () => {
  it('rattache au parent du fichier ou à un parent existant ; en mode « ignorer », ajoute sans toucher au reste', async () => {
    const parent = { code: 'CFO.ALG.SST.01', system: 'CFO', subCode: 'SST', unit: 'Alger', nom: 'T1', sousEquip: [{ code: 'CFO.ALG.SST.01.01', nom: 'Bobine', fournisseurs: [] }] };
    const lec = await lire({
      'Équipements': [EQ_H, ['Alger', 'CFO', 'SST', 'Nouveau T']],
      'Sous-équipements': [['Code équipement parent *', 'Désignation *'], ['CFO.ALG.SST.01', 'Bobine'], ['CFO.ALG.SST.01', 'Noyau'], ['CFO.ALG.SST.02', 'Cuve'], ['cfo.alg.sst.02', 'Radiateur']],
    });
    const p = preparerImport(lec, ctx({ equipements: [parent] }));
    expect(p.erreurs).toEqual([]);
    const par = Object.fromEntries(p.collections.equipements.map((r) => [r.id, r]));
    expect(par['CFO.ALG.SST.01'].ecrase).toBe(true);
    expect(par['CFO.ALG.SST.01'].data.sousEquip.map((s) => s.code)).toEqual(['CFO.ALG.SST.01.01', 'CFO.ALG.SST.01.02']);   // « Bobine » reconnue, « Noyau » ajouté
    expect(par['CFO.ALG.SST.02'].ecrase).toBe(false);
    expect(par['CFO.ALG.SST.02'].data.sousEquip.map((s) => s.nom)).toEqual(['Cuve', 'Radiateur']);
  });
  it('import en une seule fois : sous-équipements rattachés par le repère de la feuille Équipements (code GMAO inconnu à l’avance)', async () => {
    const existant = { code: 'CFO.ALG.SST.01', system: 'CFO', subCode: 'SST', unit: 'Alger', nom: 'T existant', sousEquip: [] };
    const lec = await lire({
      'Équipements': [['Repère', ...EQ_H], ['T1', 'Alger', 'CFO', 'SST', 'Transformateur A'], ['t2', 'Alger', 'CFO', 'SST', 'Transformateur B'], ['', 'Alger', 'CFO', 'SST', 'Sans repère']],
      'Sous-équipements': [['Équipement parent (repère ou code GMAO) *', 'Désignation *'], ['T1', 'Bobine'], ['T1', 'Cuve'], ['T2', 'Bobine'], ['CFO.ALG.SST.01', 'Radiateur']],
    });
    const p = preparerImport(lec, ctx({ equipements: [existant] }));
    expect(p.erreurs).toEqual([]);
    const par = Object.fromEntries(p.collections.equipements.map((r) => [r.data.nom, r.data]));
    expect(par['Transformateur A'].code).toBe('CFO.ALG.SST.02');
    expect(par['Transformateur A'].sousEquip.map((x) => x.code + ' ' + x.nom)).toEqual(['CFO.ALG.SST.02.01 Bobine', 'CFO.ALG.SST.02.02 Cuve']);
    expect(par['Transformateur B'].sousEquip.map((x) => x.code)).toEqual(['CFO.ALG.SST.03.01']);   // repère insensible à la casse
    expect(par['Sans repère'].sousEquip).toEqual([]);
    expect(par['T existant'].sousEquip.map((x) => x.nom)).toEqual(['Radiateur']);               // code GMAO existant toujours accepté
  });
  it('repère en double ou inconnu : erreurs claires, rien n’est importé', async () => {
    const lec = await lire({
      'Équipements': [['Repère', ...EQ_H], ['T1', 'Alger', 'CFO', 'SST', 'A'], ['T1', 'Alger', 'CFO', 'SST', 'B']],
      'Sous-équipements': [['Équipement parent (repère ou code GMAO) *', 'Désignation *'], ['T9', 'Bobine']],
    });
    const msgs = preparerImport(lec, ctx()).erreurs.map((e) => e.message).join(' | ');
    expect(msgs).toMatch(/« T1 » est déjà utilisé/);
    expect(msgs).toMatch(/« T9 » est introuvable/);
  });
  it('parent introuvable : erreur', async () => {
    const lec = await lire({ 'Sous-équipements': [['Code équipement parent *', 'Désignation *'], ['CFO.ALG.SST.99', 'X']] });
    expect(preparerImport(lec, ctx()).erreurs[0].message).toMatch(/« CFO.ALG.SST.99 » est introuvable/);
  });
});

describe('articles du magasin', () => {
  const H = ['Catégorie *', 'Désignation *', 'Référence', 'Prix unitaire (DA)', 'Stock actuel', 'Seuil min', 'Seuil max', 'Code'];
  it('prépare les articles, attribue les codes par le serveur et crée le mouvement initial', async () => {
    const lec = await lire({ 'Articles du magasin': [H, ['Pièce', 'Fusible 10A', 'FUS-10', 120, 50, 10, 100], ['outillage', 'Clé 17', '', '', 2], ['Consommable', 'Chiffon', '', '', 0], ['Pièce', 'Relais', '', 80, 5, 1, 9]] });
    const p = preparerImport(lec, ctx());
    expect(p.erreurs).toEqual([]);
    expect(p.aCoder).toHaveLength(4);
    const appels = [];
    const body = await completerCodes(p, async (col, o) => { appels.push([col, o.variant, o.count]); return Array.from({ length: o.count }, (_, i) => `${o.variant}-${String(i + 1).padStart(3, '0')}`); });
    expect(appels).toEqual([['pieces', 'P', 2], ['pieces', 'O', 1], ['pieces', 'C', 1]]);
    const items = body.collections.pieces;
    expect(items.map((i) => i.id)).toEqual(['P-001', 'O-001', 'C-001', 'P-002']);
    expect(items[0].data).toMatchObject({ code: 'P-001', nom: 'Fusible 10A', ref: 'FUS-10', prix: 120, stock: 50, min: 10, max: 100, categorie: 'Pièce' });
    expect(items[0].data.mouvements).toEqual([{ date: '2026-10-05', qte: 50, type: 'Achat' }]);
    expect(items[2].data.mouvements).toEqual([]);
    expect(items.every((i) => i.unit === '' && !i.overwrite)).toBe(true);
  });
  it('échec de la numérotation : rien n\'est envoyé', async () => {
    const p = preparerImport(await lire({ 'Articles du magasin': [H, ['Pièce', 'X']] }), ctx());
    expect(await completerCodes(p, async () => null)).toBeNull();
  });
  it('seuil max < seuil min, catégorie inconnue, stock négatif : erreurs', async () => {
    const lec = await lire({ 'Articles du magasin': [H, ['Pièce', 'A', '', '', 5, 10, 3], ['Machin', 'B'], ['Pièce', 'C', '', '', -1]] });
    const p = preparerImport(lec, ctx());
    expect(p.erreurs.map((e) => e.ligne)).toEqual([2, 3, 4]);
    expect(p.erreurs[0].message).toMatch(/Seuil max/);
  });
  it('rejeu : article reconnu (même désignation/référence), stock jamais modifié, avertissement en mise à jour', async () => {
    const ex = { code: 'P-001', nom: 'Fusible 10A', ref: 'FUS-10', categorie: 'Pièce', stock: 40, min: 1, max: 2, prix: 5, mouvements: [{ type: 'Achat', qte: 40 }], constructeur: {}, fourn1: {}, fourn2: {} };
    const lec = await lire({ 'Articles du magasin': [H, ['Pièce', 'Fusible 10A', 'FUS-10', 130, 99, 10, 100]] });
    const skip = preparerImport(lec, ctx({ pieces: [ex] }));
    expect(skip.aCoder).toHaveLength(0); expect(skip.collections.pieces ?? []).toHaveLength(0); expect(skip.resume[0].existants).toBe(1);
    const maj = preparerImport(lec, ctx({ pieces: [ex] }), { onConflict: 'update' });
    const r = maj.collections.pieces[0];
    expect(r).toMatchObject({ id: 'P-001', ecrase: true });
    expect(r.data.prix).toBe(130); expect(r.data.stock).toBe(40); expect(r.data.mouvements).toHaveLength(1);
    expect(maj.avertissements[0].message).toMatch(/stock de P-001 non modifié \(40\)/);
  });
  it('code inconnu : refusé plutôt qu\'inventé', async () => {
    const p = preparerImport(await lire({ 'Articles du magasin': [H, ['Pièce', 'X', '', '', '', '', '', 'P-777']] }), ctx());
    expect(p.erreurs[0].message).toMatch(/« P-777 » n'existe pas/);
  });
});

describe('intervenants et habilitations', () => {
  it('crée les intervenants avec leurs habilitations', async () => {
    const lec = await lire({
      'Intervenants': [['Matricule *', 'Nom *', 'Poste / Fonction', 'Rôle', 'Taux horaire (DA/h)'], ['MT-1', 'K. Belaïd', 'Tech CFO', 'technicien', '1 000'], ['MT-2', 'S. Amar', '', '', 900]],
      'Habilitations': [['Matricule *', 'Habilitation *', 'Date de la dernière habilitation *', 'Validité (mois)'], ['MT-1', 'H2V', '15/03/2026', 24], ['mt-1', 'B2', new Date(Date.UTC(2026, 0, 10))]],
    });
    const p = preparerImport(lec, ctx());
    expect(p.erreurs).toEqual([]);
    const [a, b] = p.collections.intervenants;
    expect(a.id).toBe('MT-1'); expect(a.data).toMatchObject({ role: 'Technicien', taux: 1000, poste: 'Tech CFO' });
    expect(a.data.habs).toEqual([{ i: 'H2V', date: '2026-03-15', m: 24 }, { i: 'B2', date: '2026-01-10', m: 12 }]);
    expect(b.data).toMatchObject({ role: 'Technicien', taux: 900, habs: [] });
  });
  it('matricule en double, taux manquant, matricule d\'habilitation inconnu : erreurs', async () => {
    const lec = await lire({
      'Intervenants': [['Matricule *', 'Nom *', 'Taux horaire (DA/h)'], ['MT-1', 'A', 100], ['MT-1', 'B', 100], ['MT-3', 'C', '']],
      'Habilitations': [['Matricule *', 'Habilitation *', 'Date de la dernière habilitation *'], ['MT-9', 'H2V', '01/01/2026']],
    });
    const m = preparerImport(lec, ctx()).erreurs.map((e) => e.message);
    expect(m.some((x) => /« MT-1 » apparaît plusieurs fois/.test(x))).toBe(true);
    expect(m.some((x) => /obligatoire pour un nouvel intervenant/.test(x))).toBe(true);
    expect(m.some((x) => /« MT-9 » est introuvable/.test(x))).toBe(true);
  });
  it('ajoute des habilitations à un intervenant existant sans toucher à ses congés', async () => {
    const ex = { mat: 'MT-1', nom: 'A', poste: 'x', role: 'Technicien', taux: 10, habs: [{ i: 'H2V', date: '2025-01-01', m: 12 }], conges: [{ du: '2026-08-01', au: '2026-08-15' }] };
    const lec = await lire({ 'Habilitations': [['Matricule *', 'Habilitation *', 'Date de la dernière habilitation *'], ['MT-1', 'H2V', '01/01/2026'], ['MT-1', 'B2', '01/02/2026']] });
    const p = preparerImport(lec, ctx({ intervenants: [ex] }));
    const r = p.collections.intervenants[0];
    expect(r.ecrase).toBe(true);
    expect(r.data.habs.map((h) => h.i)).toEqual(['H2V', 'B2']);
    expect(r.data.habs[0].date).toBe('2025-01-01');          // ligne existante laissée telle quelle en mode « ignorer »
    expect(r.data.conges).toHaveLength(1);
    const maj = preparerImport(lec, ctx({ intervenants: [ex] }), { onConflict: 'update' });
    expect(maj.collections.intervenants[0].data.habs[0].date).toBe('2026-01-01');
  });
});

describe('prestataires, organismes, appareils de mesure, contrôles', () => {
  it('crée les codes EXT-, ORG-, M-, R- à la suite de l\'existant', async () => {
    const lec = await lire({
      'Prestataires': [['Prestataire *', 'Taux horaire (DA/h)', 'Début du contrat', 'Fin du contrat', 'Cahier des charges', 'Systèmes (codes séparés par ;)'], ['SOTEMA', 2000, '01/01/2026', '31/12/2027', 'validé', 'MR; cfo'], ['ENIEM', 1500, '', '', '', 'Billettique']],
      'Organismes': [['Organisme *', 'Domaines (séparés par ;)'], ['VERITAS', 'Étalonnage'], ['APAVE', '']],
      'Appareils de mesure': [['Désignation *', 'Date d\'étalonnage', 'Date de péremption', 'Organisme d\'étalonnage'], ['Pied à coulisse', '01/02/2026', '01/02/2027', 'VERITAS']],
      'Contrôles réglementaires': [['Équipement *', 'Organisme de contrôle', 'Périodicité', 'Statut'], ['Pont roulant', 'APAVE', 'semestrielle', '']],
    });
    const p = preparerImport(lec, ctx({ prestataires: [{ mat: 'EXT-04', nom: 'Autre' }], organismes: [{ code: 'ORG-02', nom: 'ALGERAC', domaines: ['Étalonnage'] }], mesures: [{ code: 'M-03', nom: 'x' }], controles: [{ code: 'R-05', nom: 'y', organisme: '' }] }));
    expect(p.erreurs).toEqual([]);
    expect(p.collections.prestataires.map((r) => r.id)).toEqual(['EXT-05', 'EXT-06']);
    expect(p.collections.prestataires[0].data).toMatchObject({ role: 'Prestataire', externe: true, systemes: ['MR', 'CFO'], cdc: 'Validé', dateFin: '2027-12-31', taux: 2000 });
    expect(p.collections.organismes.map((r) => r.id)).toEqual(['ORG-03', 'ORG-04']);
    expect(p.collections.organismes[0].data.domaines).toEqual(['Étalonnage']);
    expect(p.collections.organismes[1].data.domaines).toEqual(['Contrôle réglementaire', 'Étalonnage']);   // défaut de l'application
    expect(p.collections.mesures[0]).toMatchObject({ id: 'M-04' });
    expect(p.avertissements).toEqual([]);                                  // VERITAS et APAVE sont dans le fichier
    expect(p.collections.controles[0]).toMatchObject({ id: 'R-06' });
    expect(p.collections.controles[0].data).toMatchObject({ periodicite: 'Semestrielle', statut: 'À contrôler', organisme: 'APAVE' });
  });
  it('avertit (sans bloquer) pour un organisme inconnu ; refuse les dates incohérentes et systèmes inconnus', async () => {
    const lec = await lire({
      'Appareils de mesure': [['Désignation *', 'Date d\'étalonnage', 'Date de péremption', 'Organisme d\'étalonnage'], ['A', '01/02/2026', '01/02/2027', 'INCONNU'], ['B', '01/02/2027', '01/02/2026', '']],
      'Prestataires': [['Prestataire *', 'Taux horaire (DA/h)', 'Systèmes (codes séparés par ;)'], ['P', 10, 'NIMPORTE'], ['Q', 10, ''], ['R', '', 'MR']],
    });
    const p = preparerImport(lec, ctx());
    expect(p.avertissements).toHaveLength(1);
    expect(p.avertissements[0].message).toMatch(/organisme « INCONNU » inconnu/);
    expect(p.erreurs.map((e) => e.ligne).sort()).toEqual([3, 2, 3, 4].sort());
    expect(p.erreurs.some((e) => /système inconnu/.test(e.message))).toBe(true);
    expect(p.erreurs.some((e) => /postérieure à la date d'étalonnage/.test(e.message))).toBe(true);
  });
  it('rejeu : tout est reconnu par nom, aucun doublon', async () => {
    const lec = await lire({ 'Organismes': [['Organisme *'], ['VERITAS'], ['APAVE']], 'Appareils de mesure': [['Désignation *'], ['Pied à coulisse']] });
    const p1 = preparerImport(lec, ctx());
    const org = p1.collections.organismes.map((r) => r.data), mes = p1.collections.mesures.map((r) => r.data);
    const p2 = preparerImport(lec, ctx({ organismes: org, mesures: mes }));
    expect(Object.keys(p2.collections)).toEqual([]);
    expect(p2.resume.every((r) => r.nouveaux === 0 && r.existants > 0)).toBe(true);
  });
});

describe('robustesse de la lecture', () => {
  it('ignore lignes vides, feuilles inconnues, en-têtes dans le désordre ou avec accents/majuscules, cellules formules / texte riche', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('équipements');
    ws.addRow([]); ws.addRow(['DÉSIGNATION', 'sous systeme', 'SYSTÈME', 'unite', 'Colonne en trop']);
    ws.addRow(['Moteur', 'SST', 'CFO', 'Alger', 'bla']);
    ws.addRow([]);
    ws.addRow([{ richText: [{ text: 'Moteur ' }, { text: 'B' }] }, 'SST', { formula: 'A1', result: 'CFO' }, 'Alger']);
    wb.addWorksheet('Autre feuille').addRow(['x']);
    const lec = await lireClasseur(ExcelJS, await wb.xlsx.writeBuffer());
    expect(lec.inconnues).toEqual(['Autre feuille']);
    const p = preparerImport(lec, ctx());
    expect(p.erreurs).toEqual([]);
    expect(p.collections.equipements.map((r) => r.data.nom)).toEqual(['Moteur', 'Moteur B']);
    expect(p.avertissements[0].message).toMatch(/feuille non reconnue/);
  });
  it('texte trop long refusé', async () => {
    const p = preparerImport(await lire({ 'Équipements': [EQ_H, ['Alger', 'CFO', 'SST', 'x'.repeat(400)]] }), ctx());
    expect(p.erreurs[0].message).toMatch(/texte trop long/);
  });
  it('norm() ignore accents, casse et ponctuation', () => { expect(norm('  Sidi-Bel Abbès ')).toBe('sidi bel abbes'); });
});

describe('requête envoyée au serveur', () => {
  it('ne contient que ce qui doit être écrit, avec overwrite pour les éléments existants modifiés', async () => {
    const parent = { code: 'CFO.ALG.SST.01', system: 'CFO', subCode: 'SST', unit: 'Alger', nom: 'T1', sousEquip: [] };
    const lec = await lire({ 'Sous-équipements': [['Code équipement parent *', 'Désignation *'], ['CFO.ALG.SST.01', 'Bobine']], 'Organismes': [['Organisme *'], ['VERITAS']] });
    const prep = preparerImport(lec, ctx({ equipements: [parent] }));
    const body = corpsRequete(prep, { dryRun: true });
    expect(body.dryRun).toBe(true);
    expect(body.collections.equipements).toEqual([{ id: 'CFO.ALG.SST.01', unit: 'Alger', system: 'CFO', data: expect.objectContaining({ sousEquip: [expect.objectContaining({ code: 'CFO.ALG.SST.01.01' })] }), overwrite: true }]);
    expect(body.collections.organismes[0].overwrite).toBeUndefined();
    expect(compterAEcrire(prep).total).toBe(2);
  });
});
