import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { IndicateursPage } from '../pages/Indicateurs.jsx';
import { predireMaintenance, predWeibull, predProba } from '../lib/predictif.js';
import { optiAlerteAnnuelle } from '../lib/optimisation.js';

const EQ = [1, 2, 3].map((i) => ({ code: 'CFO.ALG.SST.0' + i, unit: 'Alger', system: 'CFO', subCode: 'SST', nom: 'Équipement ' + i, sousEquip: [] }));
const AUJ = new Date(2026, 5, 30);   // 30/06/2026
// pannes de EQ[0] : tous les ~30 jours, la dernière le 05/06/2026 ; EQ[1] : seulement 2 pannes ; EQ[2] : pannes espacées de ~150 j
const mk = (eq, dates, extra = {}) => ({
  dis: dates.map((d, i) => ({ code: 'DI-' + eq + i, eq, etat: 'Clôturé', dateCreation: d, dateEvt: d, designation: 'Arrêt' })),
  bts: dates.map((d, i) => ({ code: 'OT-' + eq + i, di: 'DI-' + eq + i, eq, type: 'Corrective', etat: 'Clôturé', panne: 'Surchauffe', cause: 'Roulement usé', dureeIntervention: 4, tempsLogistique: 1,
    intervenants: [{ nom: 'A', temps: 4, logistique: 1, taux: 500 }], pieces: [{ code: 'P1', qte: 2 }], ...extra })),
});
const a = mk(EQ[0].code, ['2026-02-05', '2026-03-07', '2026-04-06', '2026-05-06', '2026-06-05']);
const b = mk(EQ[1].code, ['2026-03-01', '2026-04-01']);
const c = mk(EQ[2].code, ['2025-01-10', '2025-06-10', '2025-11-10']);
const data = { unit: 'Alger', dis: [...a.dis, ...b.dis, ...c.dis], bts: [...a.bts, ...b.bts, ...c.bts], planning: [], equipements: EQ, pieces: [{ code: 'P1', designation: 'Roulement 6204', prix: 1200, stock: 1 }], aujourdhui: AUJ };

describe('Maintenance prédictive — calcul', () => {
  it('MTBF, dernière panne, prochaine panne prévue et risque élevé quand l’échéance est imminente', () => {
    const r = predireMaintenance(data);
    const l = r.lignes.find((x) => x.eq === EQ[0].code);
    expect(l.pannes).toBe(5); expect(l.mtbfJours).toBeCloseTo(30, 0); expect(l.derniere).toBe('2026-06-05');
    expect(l.prochaine).toBe('2026-07-05');
    expect(l.proba).toBeGreaterThan(0.5); expect(l.risque).toBe('Élevé');
    expect(l.modele).toBe('Exponentielle');   // 4 intervalles identiques : ajustement dégénéré → taux constant
  });
  it('moins de 3 pannes → non analysé ; panne ancienne → risque plus faible', () => {
    const r = predireMaintenance(data);
    expect(r.lignes.some((x) => x.eq === EQ[1].code)).toBe(false);
    expect(r.insuffisants).toBe(1);
    const lc = r.lignes.find((x) => x.eq === EQ[2].code); const la = r.lignes.find((x) => x.eq === EQ[0].code);
    expect(lc.proba).toBeLessThan(la.proba);
  });
  it('durée moyenne, pièces à prévoir (avec stock), cause probable et projection sur 12 mois', () => {
    const l = predireMaintenance(data).lignes.find((x) => x.eq === EQ[0].code);
    expect(l.heuresMoy).toBe(5); expect(l.cause).toBe('Roulement usé'); expect(l.causeOcc).toBe(5);
    expect(l.pieces[0]).toMatchObject({ code: 'P1', nom: 'Roulement 6204', qte: 2, stockOk: false });
    expect(l.pannes12).toBeCloseTo(365 / 30, 0); expect(l.arret12).toBeCloseTo(l.pannes12 * 5, 6);
  });
  it('tendance : pannes de plus en plus rapprochées → Dégradation', () => {
    const d = mk(EQ[0].code, ['2026-01-01', '2026-03-01', '2026-04-15', '2026-05-10', '2026-05-25']);
    const l = predireMaintenance({ ...data, dis: d.dis, bts: d.bts }).lignes[0];
    expect(l.tendance).toBe('Dégradation');
  });
  it('Weibull : beta > 1 pour des intervalles réguliers ; probabilité conditionnelle croissante avec le temps écoulé', () => {
    const w = predWeibull([28, 30, 31, 29, 32]);
    expect(w.ajuste).toBe(true); expect(w.beta).toBeGreaterThan(1);
    expect(predProba(w, 28, 10)).toBeGreaterThan(predProba(w, 2, 10));
  });
  it('fenêtre d’historique : 3 mois ne garde que les pannes récentes', () => {
    const r = predireMaintenance({ ...data, fenetreMois: 3 });
    expect(r.lignes.find((x) => x.eq === EQ[0].code).pannes).toBe(3);   // 06/05 non : 30/03 → 05/04, 06/05, 05/06 → 3 pannes
  });
});

describe('Alerte annuelle', () => {
  it('janvier et février : bilan de l’année écoulée ; sinon aucune alerte', () => {
    expect(optiAlerteAnnuelle(new Date(2028, 0, 3))).toEqual({ annee: 2027, pour: 2028 });
    expect(optiAlerteAnnuelle(new Date(2028, 1, 20))).toEqual({ annee: 2027, pour: 2028 });
    expect(optiAlerteAnnuelle(new Date(2028, 2, 1))).toBeNull();
    expect(optiAlerteAnnuelle(new Date(2026, 10, 25))).toBeNull();
  });
});

describe('Maintenance prédictive — onglet', () => {
  beforeEach(cleanup); afterEach(cleanup);
  it('s’affiche juste avant « Optimisation de la maintenance »', () => {
    render(<IndicateursPage unit="Alger" unitesRH={['Alger']} dis={[]} bts={[]} planning={[]} equipements={[]} pieces={[]} systemsList={[]} treeStruct={{}} chargesRAM={[]} />);
    const onglets = screen.getAllByRole('tab').map((t) => t.textContent);
    expect(onglets.indexOf('Maintenance prédictive')).toBe(onglets.indexOf('Optimisation de la maintenance') - 1);
    fireEvent.click(screen.getByText('Maintenance prédictive'));
    expect(screen.getByTestId('kpi-predictif')).toBeTruthy();
  });
});
