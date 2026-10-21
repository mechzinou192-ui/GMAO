import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import fs from 'node:fs';
import path from 'node:path';
import { lireClasseur, preparerImport, completerCodes } from '../importExcel.js';
import { fmpDuLien, indexerFMP, lireFMP, nomFichierLien, tachesPourVisite } from '../lib/fmp.js';
import { buildBTPrev } from '../lib/preventif.js';

const NOM_FMP = 'ORG-CFO-IIT-FOR-0001-A__FMP_Annuelle_Armoire_Interrupteur_Disolement_IIT.xlsx';
const fixture = () => fs.readFileSync(path.join(__dirname, 'fixtures', NOM_FMP));
const UNITS = ['Alger', 'Oran', 'Sétif'];
const ABBR = { Alger: 'ALG', Oran: 'ORN', Sétif: 'SET' };
const EQ = { code: 'CFO.ALG.SST.01', system: 'CFO', subCode: 'SST', unit: 'Alger', nom: 'Armoire IIT', sousEquip: [] };
const INTER = [
  { nom: 'K. Belaïd', mat: 'MT-1', poste: 'Technicien CFO', role: 'Technicien', taux: 1000, conges: [] },
  { nom: 'S. Amrani', mat: 'MT-2', poste: 'Technicien CFO', role: 'Technicien', taux: 1000, conges: [{ du: '2026-10-01', au: '2026-10-31' }] },
  { nom: 'R. Haddad', mat: 'MT-3', poste: 'Technicien CFO', role: 'Technicien', taux: 1000, conges: [] },
  { nom: 'M. Billet', mat: 'MT-4', poste: 'Technicien BILLETTIQUE', role: 'Technicien', taux: 1000, conges: [] },
];
const PIECES = [
  { code: 'O-001', nom: 'Multimètre Fluke 117', categorie: 'Outillage', stock: 2 },
  { code: 'O-002', nom: 'Dynamomètre', categorie: 'Outillage', stock: 1 },
  { code: 'C-001', nom: 'Chiffon industriel', categorie: 'Consommable', stock: 50 },
];
const ctx = (ex = {}) => ({ units: UNITS, unitAbbr: ABBR, roles: ['Technicien'], cdcEtats: [], orgDom: [], systemsList: [['CFO', 'Courants forts']],
  treeStruct: { CFO: [{ code: 'SST', sub: 'Sous-station' }] }, today: '2026-10-21', equipements: [EQ], pieces: PIECES, intervenants: INTER,
  prestataires: [], organismes: [], mesures: [], controles: [], planning: [{ code: 'PREV-ALG-0001', unit: 'Alger', sys: 'CFO', eq: 'CFO.ALG.SST.09', periode: 'Mensuel', assignes: ['K. Belaïd'] }], ...ex });

// classeur « planning » avec une vraie cellule lien hypertexte, comme dans le PDC
async function classeurPlanning(lignes) {
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Planning préventif');
  ws.addRow(['Code GMAO', 'Type de Visite', 'lien FMP de la visite', 'piece a utiliser', 'consomable a utilier', 'outillage a utiliser']);
  for (const l of lignes) {
    const r = ws.addRow([l[0], l[1], null, l[3] || '', l[4] || '', l[5] || '']);
    if (l[2]) r.getCell(3).value = { text: 'FMP', hyperlink: l[2] };
  }
  return lireClasseur(ExcelJS, await wb.xlsx.writeBuffer());
}

describe('FMP : lecture du tableau des opérations', () => {
  it('lit la fiche SETRAM réelle : référence, titre, 19 opérations, sous-équipement fusionné, périodicité', async () => {
    const f = await lireFMP(ExcelJS, fixture(), NOM_FMP);
    expect(f.ref).toBe('ORG-CFO-IIT-FOR-0001-A');
    expect(f.titre).toMatch(/Fiche de Maintenance Préventive Annuelle Armoire Interrupteur/);
    expect(f.taches).toHaveLength(19);
    expect(f.taches[0]).toMatchObject({ n: '1', sousEquipement: "Armoire Interrupteur d'isolement IIT", periodicite: 'Annuelle' });
    expect(f.taches[0].operation).toMatch(/^Vérifier la présence et l’efficacité des dispositifs de verrouillage/);
    expect(f.taches[18].operation).toMatch(/pochette de plans/);
    expect(tachesPourVisite(f, 'Annuel')).toHaveLength(19);
  });
  it('retrouve la FMP depuis le lien du planning (chemin réseau, URL encodée, référence seule)', async () => {
    const idx = indexerFMP([await lireFMP(ExcelJS, fixture(), NOM_FMP)]);
    expect(nomFichierLien('\\\\srv-dm\\FMP\\CFO\\' + NOM_FMP)).toBe(NOM_FMP);
    expect(fmpDuLien(idx, '\\\\srv-dm\\FMP\\CFO\\' + NOM_FMP)).toBeTruthy();
    expect(fmpDuLien(idx, 'file:///S:/FMP/' + encodeURIComponent(NOM_FMP))).toBeTruthy();
    expect(fmpDuLien(idx, '../FMP/ORG-CFO-IIT-FOR-0001-A_v2.xlsx')).toBeTruthy();          // même référence documentaire
    expect(fmpDuLien(idx, 'autre-fiche.xlsx')).toBeNull();
  });
  it('fichier sans tableau des opérations : erreur claire', async () => {
    const wb = new ExcelJS.Workbook(); wb.addWorksheet('X').addRow(['rien']);
    await expect(lireFMP(ExcelJS, await wb.xlsx.writeBuffer(), 'x.xlsx')).rejects.toThrow(/tableau des opérations introuvable/);
  });
});

describe('import du planning préventif avec les tâches des FMP', () => {
  it('crée le plan avec les 19 tâches de la FMP, les outils du magasin et un technicien du système réparti automatiquement', async () => {
    const lec = await classeurPlanning([['CFO.ALG.SST.01', 'Annuelle', '\\\\srv\\FMP\\' + NOM_FMP, '', 'chiffon industriel', 'multimetre;dynamometre x2']]);
    const fmps = indexerFMP([await lireFMP(ExcelJS, fixture(), NOM_FMP)]);
    const p = preparerImport(lec, ctx({ fmps }));
    expect(p.erreurs).toEqual([]);
    expect(p.avertissements).toEqual([]);
    const [rec] = p.collections.planning;
    expect(rec).toMatchObject({ unit: 'Alger', system: 'CFO', collection: 'planning' });
    const d = rec.data;
    expect(d).toMatchObject({ eq: 'CFO.ALG.SST.01', periode: 'Annuel', date: '2026-10-21', sys: 'CFO', unit: 'Alger' });
    expect(d.taches).toHaveLength(19);
    expect(d.fmp).toMatchObject({ ref: 'ORG-CFO-IIT-FOR-0001-A', fichier: NOM_FMP });
    expect(d.outillage).toEqual([{ code: 'O-001', qte: 1 }, { code: 'O-002', qte: 2 }]);
    expect(d.consommables).toEqual([{ code: 'C-001', qte: 1 }]);
    // K. Belaïd a déjà un plan, S. Amrani est en congé : R. Haddad (le moins chargé, disponible) est choisi ; pas le technicien billettique
    expect(d.assignes).toEqual(['R. Haddad']);
    // numéro attribué par le serveur, par unité
    const appels = [];
    const body = await completerCodes(p, async (col, o) => { appels.push([col, o]); return ['PREV-ALG-0002']; });
    expect(appels).toEqual([['planning', { unit: 'Alger', count: 1 }]]);
    expect(body.collections.planning[0]).toMatchObject({ id: 'PREV-ALG-0002', data: { code: 'PREV-ALG-0002' } });
    // l'OT généré depuis ce plan reprend les tâches et la FMP
    const ot = buildBTPrev(body.collections.planning[0].data, 'OT-PREV-ALG-2026-0001', '2026-10-21 08:00');
    expect(ot.taches).toHaveLength(19); expect(ot.fmp.ref).toBe('ORG-CFO-IIT-FOR-0001-A');
  });
  it('erreurs claires : FMP non fournie, équipement inconnu, type de visite inconnu ; article inconnu = simple avertissement', async () => {
    const lec = await classeurPlanning([
      ['CFO.ALG.SST.01', 'Annuelle', 'FMP-inconnue.xlsx'],
      ['CFO.ALG.SST.77', 'Mensuel', NOM_FMP],
      ['CFO.ALG.SST.01', 'Bimensuelle', NOM_FMP],
      ['CFO.ALG.SST.01', 'Mensuelle', NOM_FMP, '', '', 'clé à choc'],
    ]);
    const fmps = indexerFMP([await lireFMP(ExcelJS, fixture(), NOM_FMP)]);
    const p = preparerImport(lec, ctx({ fmps }));
    const msgs = p.erreurs.map((e) => `${e.ligne}: ${e.message}`).join(' | ');
    expect(msgs).toMatch(/2: .*FMP « FMP-inconnue.xlsx » non fournie/);
    expect(msgs).toMatch(/3: .*« CFO.ALG.SST.77 » : équipement introuvable/);
    expect(msgs).toMatch(/4: .*type de visite inconnu/);
    expect(p.avertissements[0].message).toMatch(/« clé à choc » introuvable/);
  });
  it('réimport : le plan existant (même équipement, même visite, même FMP) est reconnu, pas de doublon', async () => {
    const fmps = indexerFMP([await lireFMP(ExcelJS, fixture(), NOM_FMP)]);
    const existant = { code: 'PREV-ALG-0005', unit: 'Alger', sys: 'CFO', eq: 'CFO.ALG.SST.01', periode: 'Annuel', fmp: { ref: 'ORG-CFO-IIT-FOR-0001-A' }, assignes: [], taches: [] };
    const lec = await classeurPlanning([['CFO.ALG.SST.01', 'Annuelle', NOM_FMP]]);
    const p = preparerImport(lec, ctx({ fmps, planning: [existant] }));
    expect(p.erreurs).toEqual([]);
    expect(p.collections.planning || []).toHaveLength(0);
    expect(p.resume.find((r) => r.cle === 'planning')).toMatchObject({ nouveaux: 0, existants: 1 });
    const maj = preparerImport(lec, ctx({ fmps, planning: [existant] }), { onConflict: 'update' });
    expect(maj.collections.planning[0]).toMatchObject({ id: 'PREV-ALG-0005', ecrase: true });
    expect(maj.collections.planning[0].data.taches).toHaveLength(19);
  });
});
