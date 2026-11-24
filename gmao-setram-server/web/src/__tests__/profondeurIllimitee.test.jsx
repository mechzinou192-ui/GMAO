import { describe, it, expect, vi } from 'vitest';
import ExcelJS from 'exceljs';
import { render, screen, fireEvent } from '@testing-library/react';
import { lireClasseur, preparerImport } from '../importExcel.js';
import { enfantsDe, trouverNoeud, profondeur, appliquerSurEquipement, normaliserEquipement, champsNoeud, nomComposeNoeud, prochainCodeEnfant, compterNoeuds } from '../../../server/src/arbre-core.js';
import { niveauDI, controleProfil, libelleProfondeur, CLES_NIVEAUX_DI, definirProfilsPersonnalises } from '../../../server/src/profils-core.js';
import { noeudsSelectionnables, cheminDI } from '../lib/arbre.js';
import { Arbo, SousSousEquipForm } from '../pages/Arborescence.jsx';
import { DIForm } from '../pages/DemandesIntervention.jsx';

const N = (code, nom, enfants = []) => ({ code, nom, fournisseurs: [], enfants });
// équipement avec 8 niveaux sous lui : sous-équipement, sous-sous, niveau 6, 7, 8, 9, 10
const E = 'CFO.ALG.SST.01';
const profond = () => ({ code: E, nom: 'Transfo', system: 'CFO', subCode: 'SST', unit: 'Alger', emplacement: 'L1',
  sousEquip: [N(E + '.01', 'SE', [N(E + '.01.01', 'SSE', [N(E + '.01.01.01', 'N6', [N(E + '.01.01.01.01', 'N7', [N(E + '.01.01.01.01.01', 'N8')])])])])] });

describe('arbre-core : profondeur illimitée', () => {
  it('retrouve un nœud très profond avec ses ancêtres', () => {
    const r = trouverNoeud(profond(), E + '.01.01.01.01.01');
    expect(r.noeud.nom).toBe('N8'); expect(r.profondeur).toBe(5); expect(r.ancetres.map((x) => x.nom)).toEqual(['SE', 'SSE', 'N6', 'N7']);
    expect(profondeur(E, E + '.01.01.01.01.01')).toBe(5);
    expect(compterNoeuds(profond())).toBe(5);
  });
  it('lit l\'ancien format sousSousEquip et le convertit', () => {
    const vieux = { code: E, sousEquip: [{ code: E + '.01', nom: 'SE', sousSousEquip: [{ code: E + '.01.01', nom: 'SS' }] }] };
    expect(enfantsDe(vieux.sousEquip[0]).map((x) => x.code)).toEqual([E + '.01.01']);
    const n = normaliserEquipement(vieux);
    expect(n.sousEquip[0].enfants[0].code).toBe(E + '.01.01'); expect(n.sousEquip[0].sousSousEquip).toBeUndefined();
  });
  it('ajoute, modifie et retire à n\'importe quelle profondeur sans toucher au reste', () => {
    let e = appliquerSurEquipement(profond(), { type: 'ajouter', parentCode: E + '.01.01.01.01.01', noeud: N(E + '.01.01.01.01.01.01', 'N9') });
    expect(trouverNoeud(e, E + '.01.01.01.01.01.01').profondeur).toBe(6);
    e = appliquerSurEquipement(e, { type: 'modifier', noeud: { code: E + '.01.01.01', nom: 'N6 bis' } });
    expect(trouverNoeud(e, E + '.01.01.01').noeud.nom).toBe('N6 bis');
    expect(trouverNoeud(e, E + '.01.01.01.01.01.01')).not.toBeNull();   // les enfants sont conservés
    e = appliquerSurEquipement(e, { type: 'retirer', code: E + '.01.01.01' });
    expect(trouverNoeud(e, E + '.01.01.01.01')).toBeNull();
    expect(trouverNoeud(e, E + '.01.01')).not.toBeNull();
  });
  it('code suivant, champs de DI et nom composé', () => {
    const p = trouverNoeud(profond(), E + '.01.01').noeud;
    expect(prochainCodeEnfant({ code: E + '.01.01', enfants: [N(E + '.01.01.01', 'a'), N(E + '.01.01.04', 'b')] })).toBe(E + '.01.01.05');
    expect(p.code).toBe(E + '.01.01');
    expect(champsNoeud(profond(), E + '.01.01.01.01')).toEqual({ se: E + '.01', ss: E + '.01.01', noeud: E + '.01.01.01.01' });
    expect(nomComposeNoeud(profond(), E + '.01.01.01')).toBe('Transfo — ' + E + '.01 SE — ' + E + '.01.01 SSE — ' + E + '.01.01.01 N6');
  });
});

describe('droits : niveaux profonds', () => {
  it('le niveau d\'une DI se lit dans le code du nœud visé', () => {
    expect(niveauDI({ eq: E, se: E + '.01', noeud: E + '.01' })).toBe('sousEquipement');
    expect(niveauDI({ eq: E, se: E + '.01', ss: E + '.01.01', noeud: E + '.01.01' })).toBe('sousSousEquipement');
    expect(niveauDI({ eq: E, se: E + '.01', ss: E + '.01.01', noeud: E + '.01.01.01.01' })).toBe('niveauxProfonds');
    expect(CLES_NIVEAUX_DI).toContain('niveauxProfonds');
    expect(libelleProfondeur(4)).toBe('Niveau 7');
  });
  it('le serveur refuse un niveau profond non autorisé et l\'accepte une fois coché', () => {
    const di = { eq: E, se: E + '.01', ss: E + '.01.01', noeud: E + '.01.01.01', etat: 'À Transmettre' };
    const u = { role: 'Exploitation' };
    definirProfilsPersonnalises([{ nom: 'Exploitation', surcharge: true, niveauxDI: ['sousEquipement', 'sousSousEquipement'] }]);
    expect(controleProfil(u, 'dis', null, di)).toMatch(/non autorisée/);
    definirProfilsPersonnalises([{ nom: 'Exploitation', surcharge: true, niveauxDI: ['sousEquipement', 'sousSousEquipement', 'niveauxProfonds'] }]);
    expect(controleProfil(u, 'dis', null, di)).toBeNull();
    definirProfilsPersonnalises([]);
  });
});

describe('sélection et chemin', () => {
  it('liste tous les nœuds, quel que soit le niveau, avec leur libellé', () => {
    const l = noeudsSelectionnables({ equipements: [profond()], systemsList: [['CFO', 'Courants forts']], treeStruct: { CFO: [{ code: 'SST', sub: 'Sous-station' }] }, unit: 'Alger' });
    const sous = l.filter((x) => x.profondeur > 0);
    expect(sous.map((x) => x.libNiveau)).toEqual(['Sous-équipement', 'Sous-sous-équipement', 'Niveau 6', 'Niveau 7', 'Niveau 8']);
    expect(sous[4]).toMatchObject({ niveau: 'niveauxProfonds', se: E + '.01', ss: E + '.01.01', noeud: E + '.01.01.01.01.01' });
  });
  it('un profil sans « niveaux profonds » ne voit pas les niveaux 6 et plus', () => {
    const niveaux = ['systeme', 'sousSysteme', 'equipement', 'sousEquipement', 'sousSousEquipement'];
    const l = noeudsSelectionnables({ equipements: [profond()], systemsList: [['CFO', 'x']], treeStruct: { CFO: [{ code: 'SST', sub: 's' }] }, unit: 'Alger', niveaux });
    expect(l.filter((x) => x.profondeur > 0)).toHaveLength(2);
  });
  it('chemin complet d\'une DI sur un nœud de niveau 8', () => {
    const c = cheminDI({ eq: E, noeud: E + '.01.01.01.01.01', se: E + '.01', ss: E + '.01.01' }, { equipements: [profond()], systemsList: [['CFO', 'x']], treeStruct: {} });
    expect(c.map((x) => x.nom).slice(-6)).toEqual(['Transfo', 'SE', 'SSE', 'N6', 'N7', 'N8']);
  });
});

describe('écran', () => {
  const props = { unit: 'Alger', equipements: [profond()], systemsList: [['CFO', 'Courants forts']], treeStruct: { CFO: [{ code: 'SST', sub: 'Sous-station' }] }, onOpenEquip() {}, onOpenSousEquip() {} };
  it('l\'arbre se déplie jusqu\'au dernier niveau', () => {
    render(<Arbo {...props} />);
    fireEvent.click(screen.getByText('CFO', { selector: 'span' }));
    fireEvent.click(screen.getByText(/Sous-station/));
    fireEvent.click(screen.getByLabelText('Ouvrir ' + E));
    for (const c of ['.01', '.01.01', '.01.01.01', '.01.01.01.01']) fireEvent.click(screen.getByLabelText('Ouvrir ' + E + c));
    expect(screen.getByText(/— N8/)).toBeTruthy();
  });
  it('formulaire d\'un nœud de niveau 9 : code suivant et libellé', () => {
    const parent = N(E + '.01.01.01.01.01', 'N8');
    const onSubmit = vi.fn();
    render(<SousSousEquipForm modal={{ mode: 'add', equip: profond(), parent, chemin: [parent] }} onSubmit={onSubmit} />);
    expect(screen.getByDisplayValue(E + '.01.01.01.01.01.01')).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText('ex: Roulement'), { target: { value: 'Vis' } });
    fireEvent.click(screen.getByText('Créer le niveau 9'));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ parentCode: E, seCode: E + '.01.01.01.01.01', code: E + '.01.01.01.01.01.01', nom: 'Vis' });
  });
  it('une DI créée sur un nœud profond garde se, ss et noeud', () => {
    const onSubmit = vi.fn();
    const e = profond();
    render(<DIForm prefill={{ eq: E, nom: 'x', ...champsNoeud(e, E + '.01.01.01.01'), niveau: 'niveauxProfonds' }} equipements={[e]} demandeur="Karim" onSubmit={onSubmit} />);
    fireEvent.change(screen.getByPlaceholderText('Obligatoire : décrire le constat'), { target: { value: 'Fuite' } });
    fireEvent.click(screen.getByText('Créer la DI'));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ eq: E, se: E + '.01', ss: E + '.01.01', noeud: E + '.01.01.01.01', niveau: 'niveauxProfonds' });
  });
});

describe('import Excel : niveaux illimités dans une seule feuille', () => {
  const ctx = { units: ['Alger'], unitAbbr: { Alger: 'ALG' }, roles: [], cdcEtats: [], orgDom: [], systemsList: [['CFO', 'x']], treeStruct: { CFO: [{ code: 'SST', sub: 's' }] }, today: '2026-10-05',
    equipements: [], pieces: [], intervenants: [], prestataires: [], organismes: [], mesures: [], controles: [] };
  async function lire(feuilles) {
    const wb = new ExcelJS.Workbook();
    for (const [nom, lignes] of Object.entries(feuilles)) { const ws = wb.addWorksheet(nom); lignes.forEach((l) => ws.addRow(l)); }
    return lireClasseur(ExcelJS, await wb.xlsx.writeBuffer());
  }
  it('chaîne de repères : chaque ligne a pour parent une ligne précédente, sur 6 niveaux', async () => {
    const lec = await lire({
      'Équipements': [['Unité *', 'Système *', 'Sous-système *', 'Désignation *', 'Repère'], ['Alger', 'CFO', 'SST', 'Transfo', 'T1']],
      'Sous-équipements': [['Équipement parent *', 'Désignation *', 'Repère'], ['T1', 'Moteur', 'S1']],
      'Sous-sous-équipements': [['Parent (repère ou code GMAO) *', 'Désignation *', 'Repère'],
        ['S1', 'Rotor', 'A'], ['A', 'Palier', 'B'], ['B', 'Roulement', 'C'], ['C', 'Bille', 'D'], ['D', 'Revêtement']],
    });
    const p = preparerImport(lec, ctx);
    expect(p.erreurs).toEqual([]);
    const eq = p.collections.equipements[0].data;
    const code = eq.code;
    const bout = trouverNoeud(eq, code + '.01.01.01.01.01.01');
    expect(bout.noeud.nom).toBe('Revêtement'); expect(bout.profondeur).toBe(6);
    expect(p.resume.find((x) => x.cle === 'sousSous')).toMatchObject({ lignes: 5, nouveaux: 5 });
  });
  it('parent = code GMAO d\'un nœud existant de niveau 7', async () => {
    const eq = profond();
    const lec = await lire({ 'Sous-sous-équipements': [['Parent (repère ou code GMAO) *', 'Désignation *'], [E + '.01.01.01.01', 'N8 bis'], [E + '.01.01.01.01', 'N8 ter']] });
    const p = preparerImport(lec, { ...ctx, equipements: [eq] });
    expect(p.erreurs).toEqual([]);
    expect(enfantsDe(trouverNoeud(p.collections.equipements[0].data, E + '.01.01.01.01').noeud).map((x) => x.code)).toEqual([E + '.01.01.01.01.01', E + '.01.01.01.01.02', E + '.01.01.01.01.03']);
  });
  it('refuse un code qui saute un niveau', async () => {
    const lec = await lire({ 'Sous-sous-équipements': [['Parent (repère ou code GMAO) *', 'Désignation *', 'Fournisseur', 'Code'], [E + '.01.01', 'X', '', E + '.01.01.01.01']] });
    const p = preparerImport(lec, { ...ctx, equipements: [profond()] });
    expect(p.erreurs.some((e) => /un seul niveau de plus/.test(e.message))).toBe(true);
  });
});
