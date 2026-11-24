import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { IndicateursPage } from '../pages/Indicateurs.jsx';
import { KPI_PARETO_CRITERES, kpiPareto, kpiParetoEquipements } from '../lib/kpi.js';

describe('Pareto / ABC — calcul', () => {
  const rows = [
    { code: 'E1', nom: 'Pompe', nbDI: 50, duree: 5 }, { code: 'E2', nom: 'Moteur', nbDI: 30, duree: 40 },
    { code: 'E3', nom: 'Vanne', nbDI: 10, duree: 1 }, { code: 'E4', nom: 'Capteur', nbDI: 6, duree: 2 }, { code: 'E5', nom: 'Filtre', nbDI: 4, duree: 2 }];
  it('classe A jusqu’à 80 %, B jusqu’à 95 %, C jusqu’à 100 %', () => {
    const p = kpiPareto(rows, 'nbDI');
    expect(p.items.map((r) => r.code)).toEqual(['E1', 'E2', 'E3', 'E4', 'E5']);
    expect(p.items.map((r) => r.classe)).toEqual(['A', 'A', 'B', 'B', 'C']);   // cumul : 50, 80, 90, 96, 100 (E4 franchit 95 % → B)
    expect([p.n80, p.n95, p.n100]).toEqual([2, 4, 5]);
    expect(p.items[4].cum).toBeCloseTo(1, 9);
  });
  it('Temps d’intervention = durée + logistique, décomposable ; Coût total = humain + matériel', () => {
    const r = [{ code: 'E1', nom: 'A', duree: 10, logistique: 1, tempsTotal: 11, coutHum: 100, coutMat: 900, coutTotal: 1000 },
      { code: 'E2', nom: 'B', duree: 2, logistique: 8, tempsTotal: 10, coutHum: 700, coutMat: 100, coutTotal: 800 }];
    expect(KPI_PARETO_CRITERES.find((c) => c.id === 'tempsTotal').parts.map((x) => x.id)).toEqual(['duree', 'logistique']);
    expect(KPI_PARETO_CRITERES.find((c) => c.id === 'coutTotal').parts.map((x) => x.id)).toEqual(['coutHum', 'coutMat']);
    const p = kpiPareto(r, 'tempsTotal');
    expect(p.items[0].value).toBe(11);
    expect(p.items[0].row.duree + p.items[0].row.logistique).toBe(p.items[0].value);
  });
  it('le classement change avec le critère', () => {
    expect(kpiPareto(rows, 'duree').items[0].code).toBe('E2');
  });
  it('agrège DI, durées, logistique et coûts (humain + matériel) par équipement', () => {
    const pieces = [{ code: 'P1', prix: 100 }];
    const bt = { dureeIntervention: 2, tempsLogistique: 1, intervenants: [{ nom: 'A', temps: 2, logistique: 1, taux: 500 }], pieces: [{ code: 'P1', qte: 3 }] };
    const r = kpiParetoEquipements([{ di: { eq: 'E1', etat: 'Clôturé' }, bt }, { di: { eq: 'E1', etat: 'Annulé' }, bt: null }], [], pieces, 'Corrective', [{ code: 'E1', nom: 'Pompe' }]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ code: 'E1', nom: 'Pompe', nbDI: 1, duree: 2, logistique: 1, tempsTotal: 3, coutHum: 1500, coutMat: 300, coutTotal: 1800 });
  });
});

describe('Pareto / ABC — onglet', () => {
  beforeEach(cleanup); afterEach(cleanup);
  it('s’ouvre après « Criticité (AMDEC) » avec les 6 critères', () => {
    render(<IndicateursPage unit="Alger" unitesRH={['Alger']} dis={[]} bts={[]} planning={[]} equipements={[]} pieces={[]} systemsList={[]} treeStruct={{}} chargesRAM={[]} />);
    const onglets = screen.getAllByRole('tab').map((t) => t.textContent);
    expect(onglets.indexOf('Pareto (ABC)')).toBe(onglets.indexOf('Criticité (AMDEC)') + 1);
    fireEvent.click(screen.getByText('Pareto (ABC)'));
    for (const c of ['Nombre de DI', "Temps d'intervention", "Durée d'intervention", 'Temps logistique', 'Coût total', 'Coût humain', 'Coût matériel']) expect(screen.getAllByText(c).length).toBeGreaterThan(0);
  });
});
