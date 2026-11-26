import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { IndicateursPage } from '../pages/Indicateurs.jsx';
import { KPI_CRIT, KPI_F_THR, KPI_G_THR, KPI_SEUILS, KPI_PARAMS_DEFAUT, kpiAmdec, kpiBand, kpiObj, kpiParamsFusion, kpiParamsSet, kpiScoreF, kpiScoreG, kpiSciTxt } from '../lib/kpi.js';
import { KPI_PARAMS_CHAMPS, KPI_PARAMS_PROPOSES, paramsValider } from '../lib/parametres.js';

afterEach(() => { kpiParamsSet(null); cleanup(); });   // toujours revenir aux valeurs par défaut

describe('Paramètres des indicateurs — calcul', () => {
  it('valeurs par défaut inchangées (libellés des cibles compris)', () => {
    expect(kpiObj('Alger').tcp.label).toBe('> 70 %'); expect(kpiObj('Sétif').tmc.label).toBe('> 90 %'); expect(kpiObj('Alger').tmp.label).toBe('100 %');
    expect(kpiObj('Alger').tauxPanne.label).toBe('≤ 3×10⁻⁴ /h'); expect(kpiObj('Alger').tauxRep.label).toBe('≥ 2,5×10⁻¹ /h'); expect(kpiObj('Sétif').tauxRep.label).toBe('≥ 4×10⁻¹ /h');
    expect(kpiObj('Alger').efficience.label).toBe('≈ 100 % (90–110 %)');
    expect([KPI_F_THR, KPI_G_THR]).toEqual([[1, 4, 52], [2, 20, 120]]); expect(KPI_CRIT).toEqual({ high: 16, med: 10 });
  });
  it('les cibles modifiées s’appliquent aux indicateurs (valeur et libellé)', () => {
    const p = kpiParamsFusion(null); p.objectifs.anciennes.tmp = 0.95; p.objectifs.anciennes.dispo = 0.93; p.objectifs.nouvelles.tauxPanne = 2e-4;
    kpiParamsSet(p);
    expect(kpiObj('Alger').tmp).toMatchObject({ val: 0.95, label: '> 95 %' }); expect(kpiObj('Alger').dispo.label).toBe('> 93 %');
    expect(kpiObj('Sétif').tauxPanne.label).toBe('≤ 2×10⁻⁴ /h'); expect(kpiObj('Oran').dispo.val).toBe(0.93);
  });
  it('échelles AMDEC modifiées : P, G, bandes de criticité et ND par défaut', () => {
    expect([kpiScoreF(0.5), kpiScoreF(3), kpiScoreF(10), kpiScoreF(60)]).toEqual([1, 2, 3, 4]);
    const p = kpiParamsFusion(null); p.amdec.f = [2, 6, 24]; p.amdec.g = [5, 30, 90]; p.amdec.crit = { high: 20, med: 12 }; p.amdec.ndDefaut = 3;
    kpiParamsSet(p);
    expect([kpiScoreF(1.5), kpiScoreF(3), kpiScoreF(10), kpiScoreF(30)]).toEqual([1, 2, 3, 4]);
    expect([kpiScoreG(4), kpiScoreG(10), kpiScoreG(60), kpiScoreG(100)]).toEqual([1, 2, 3, 4]);
    expect([kpiBand(11).label, kpiBand(12).label, kpiBand(20).label]).toEqual(['Acceptable', 'Modérée', 'Majeure']);
    const EQ = [{ code: 'CFO.ALG.SST.01', unit: 'Alger', system: 'CFO', subCode: 'SST', nom: 'T1', sousEquip: [] }];
    const corr = [{ di: { code: 'DI1', eq: EQ[0].code, etat: 'Traité', dateCreation: '2026-01-10', designation: 'x' }, bt: { code: 'OT1', di: 'DI1', eq: EQ[0].code, etat: 'Clôturé', dateGeneration: '2026-01-10', dateCloture: '2026-01-10', dureeIntervention: 1, tempsLogistique: 0 } }];
    const per = { start: new Date(2026, 0, 1), end: new Date(2026, 0, 31, 23, 59, 59), days: 31, hours: 744 };
    expect(kpiAmdec(corr, per, { groupBy: 'Équipement', gravBase: 'Durée d\'arrêt', equipements: EQ })[0]).toMatchObject({ d: 3, dDefaut: true });
  });
  it('seuils des taux modifiés en place (les imports existants restent valables)', () => {
    const p = kpiParamsFusion(null); p.taux.recurrence = [10, 20]; kpiParamsSet(p);
    expect(KPI_SEUILS.recurrence).toEqual([10, 20]); kpiParamsSet(null); expect(KPI_SEUILS.recurrence).toEqual([15, 30]);
  });
  it('valeurs absentes ou invalides : retour au défaut ; formatage scientifique', () => {
    expect(kpiParamsFusion({ objectifs: { anciennes: { tcp: 'abc' } }, amdec: { f: [9] } }).objectifs.anciennes.tcp).toBe(0.7);
    expect(kpiParamsFusion({ amdec: { f: [9] } }).amdec.f).toEqual([9, 4, 52]);
    expect([kpiSciTxt(5e-4), kpiSciTxt(0.25), kpiSciTxt(0.4), kpiSciTxt(1e-3)]).toEqual(['5×10⁻⁴', '2,5×10⁻¹', '4×10⁻¹', '1×10⁻³']);
  });
  it('validation : seuils croissants, bornes, ND entre 1 et 4', () => {
    expect(paramsValider(null)).toEqual([]); expect(paramsValider(KPI_PARAMS_PROPOSES)).toEqual([]);
    const p = kpiParamsFusion(null); p.amdec.f = [4, 2, 52]; p.amdec.crit = { high: 8, med: 10 }; p.amdec.ndDefaut = 7; p.objectifs.anciennes.dispo = 1.4; p.taux.tauxInterv = [5, 1];
    const e = paramsValider(p).join(' | ');
    for (const m of ['probabilité P', 'criticité modérée', 'détectabilité', 'DISPO', 'Taux d\'intervention']) expect(e).toContain(m);
  });
  it('proposition : seules les valeurs discutables changent (TMP, λ, ND) ; chaque champ a un « pourquoi »', () => {
    const diff = KPI_PARAMS_CHAMPS.filter((c) => c.propose !== c.defaut).map((c) => c.id).sort();
    expect(diff).toEqual(['amdec.nd', 'obj.anciennes.tauxPanne', 'obj.anciennes.tmp', 'obj.nouvelles.tauxPanne', 'obj.nouvelles.tmp']);
    expect(KPI_PARAMS_CHAMPS.every((c) => c.why && c.why.length > 10)).toBe(true);
    expect(KPI_PARAMS_DEFAUT.amdec.ndDefaut).toBe(2);
  });
});

describe('Cibles par unité (wilaya)', () => {
  it('une unité avec sa propre cible l’emporte sur son groupe ; les autres gardent la cible du groupe', () => {
    const p = kpiParamsFusion({ unites: { Oran: { dispo: 0.96, tmc: 0.8 }, Sétif: { tauxPanne: 2e-4 } } });
    kpiParamsSet(p);
    expect(kpiObj('Oran').dispo).toMatchObject({ val: 0.96, label: '> 96 %' }); expect(kpiObj('Oran').tmc.label).toBe('> 80 %'); expect(kpiObj('Oran').tcp.label).toBe('> 70 %');   // le reste vient du groupe
    expect(kpiObj('Alger').dispo.val).toBe(0.95);                                    // même groupe qu'Oran, sans surcharge
    expect(kpiObj('Sétif').tauxPanne.label).toBe('≤ 2×10⁻⁴ /h'); expect(kpiObj('Sétif').dispo.val).toBe(0.97);
    expect(kpiObj('Mostaganem').dispo.val).toBe(0.97);
  });
  it('changer la cible du groupe n’affecte pas une unité qui a la sienne', () => {
    const p = kpiParamsFusion({ unites: { Oran: { dispo: 0.96 } } }); p.objectifs.anciennes.dispo = 0.9;
    kpiParamsSet(p); expect(kpiObj('Oran').dispo.val).toBe(0.96); expect(kpiObj('Alger').dispo.val).toBe(0.9);
  });
  it('unités inconnues et valeurs invalides écartées ; validation par unité', () => {
    expect(kpiParamsFusion({ unites: { Paris: { dispo: 0.9 }, Oran: { dispo: 'x', tcp: '' } } }).unites).toEqual({});
    const e = paramsValider(kpiParamsFusion({ unites: { Oran: { dispo: 1.5, tauxRep: -1 } } })).join(' | ');
    expect(e).toContain('Unité Oran : DISPO'); expect(e).toContain('Unité Oran : μ');
  });
});

describe('Seuils paramétrables — écran du Référentiel', () => {
  beforeEach(cleanup);
  const montrer = (extra = {}) => render(<IndicateursPage unit="Alger" unitesRH={['Alger']} dis={[]} bts={[]} planning={[]} equipements={[]} pieces={[]} systemsList={[]} treeStruct={{}} chargesRAM={[]} {...extra} />);
  it('super administrateur : modifier, proposer, enregistrer', () => {
    const onSave = vi.fn(); montrer({ estSuper: true, onSaveParametres: onSave });
    fireEvent.click(screen.getByText('Référentiel'));
    expect(screen.getByTestId('parametres-kpi')).toBeTruthy();
    const champ = screen.getAllByLabelText('TMP — maintenance préventive réalisée')[0];
    fireEvent.change(champ, { target: { value: '92' } });
    fireEvent.click(screen.getByText('Enregistrer'));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0].objectifs.anciennes.tmp).toBeCloseTo(0.92, 6);
    fireEvent.click(screen.getByText('Appliquer les seuils proposés')); fireEvent.click(screen.getByText('Enregistrer'));
    expect(onSave.mock.calls[1][0]).toMatchObject({ amdec: { ndDefaut: 3 }, objectifs: { anciennes: { tmp: 0.95 } } });
  });
  it('super administrateur : cible propre à une wilaya, enregistrée puis effaçable', () => {
    const onSave = vi.fn(); montrer({ estSuper: true, onSaveParametres: onSave });
    fireEvent.click(screen.getByText('Référentiel'));
    fireEvent.change(screen.getByLabelText('Disponibilité (min.) — Oran'), { target: { value: '96' } });
    fireEvent.click(screen.getByText('Enregistrer'));
    expect(onSave.mock.calls[0][0].unites).toEqual({ Oran: { dispo: 0.96 } });
    fireEvent.click(screen.getByLabelText('Effacer les cibles propres de Oran')); fireEvent.click(screen.getByText('Enregistrer'));
    expect(onSave.mock.calls[1][0].unites).toEqual({});
    expect(screen.getByTestId('cibles-unites').textContent).toContain('Sidi Bel Abbès');   // toutes les wilayas listées
  });
  it('autres profils : voient la cible de chaque wilaya (propre ou héritée du groupe)', () => {
    montrer({ estSuper: false, parametres: kpiParamsFusion({ unites: { Oran: { dispo: 0.96 } } }) });
    fireEvent.click(screen.getByText('Référentiel'));
    const bloc = screen.getByTestId('cibles-unites'); expect(bloc.querySelectorAll('input').length).toBe(0);
    expect(bloc.textContent).toContain('96 %'); expect(bloc.textContent).toContain('95 %'); expect(bloc.textContent).toContain('97 %');
  });
  it('valeur invalide : message d’erreur et aucun enregistrement', () => {
    const onSave = vi.fn(); montrer({ estSuper: true, onSaveParametres: onSave });
    fireEvent.click(screen.getByText('Référentiel'));
    fireEvent.change(screen.getByLabelText('Criticité majeure à partir de (C ≥)'), { target: { value: '5' } });
    fireEvent.click(screen.getByText('Enregistrer'));
    expect(onSave).not.toHaveBeenCalled(); expect(screen.getByRole('alert').textContent).toContain('criticité modérée');
  });
  it('autres profils : consultation seule (valeurs en vigueur, proposées et justification, sans champ de saisie)', () => {
    const p = kpiParamsFusion(null); p.objectifs.anciennes.tmp = 0.9;
    montrer({ estSuper: false, parametres: p });
    fireEvent.click(screen.getByText('Référentiel'));
    const bloc = screen.getByTestId('parametres-kpi');
    expect(bloc.querySelectorAll('input').length).toBe(0); expect(screen.queryByText('Enregistrer')).toBeNull();
    expect(bloc.textContent).toContain('90 %'); expect(bloc.textContent).toContain('modifié'); expect(bloc.textContent).toContain('Proposition prudente : ND = 3');
  });
});
