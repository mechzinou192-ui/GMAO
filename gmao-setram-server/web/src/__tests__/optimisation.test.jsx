import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { IndicateursPage } from '../pages/Indicateurs.jsx';
import { optimiserMaintenance, optiPeriodeVoisine, optiPeriodePourPannes, optiOccParAn } from '../lib/optimisation.js';

const eqs = ['CFO.ALG.SST.01', 'CFO.ALG.SST.02', 'CFO.ALG.SST.03', 'CFO.ALG.SST.04'].map((code, i) => ({ code, unit: 'Alger', system: 'CFO', subCode: 'SST', nom: 'Équipement ' + (i + 1), sousEquip: [] }));
const plan = (code, eq, periode, taches = ['Contrôle visuel']) => ({ code, eq, nom: eq, periode, taches, date: '2025-01-05', unit: 'Alger', termine: false });
const otPrev = (n, plan_, eq) => Array.from({ length: n }, (_, i) => ({ code: 'OTP-' + plan_ + '-' + i, plan: plan_, eq, type: 'Préventive', etat: 'Clôturé', dateGeneration: '2025-' + String(i + 1).padStart(2, '0') + '-10', dateCloture: '2025-' + String(i + 1).padStart(2, '0') + '-11', dureeIntervention: 2, tempsLogistique: 1, intervenants: [{ nom: 'A', temps: 2, logistique: 1, taux: 500 }], pieces: [] }));
const panne = (n, eq, cause, panneTxt = 'Surchauffe') => ({
  dis: Array.from({ length: n }, (_, i) => ({ code: 'DI-' + eq + i, eq, etat: 'Clôturé', dateCreation: '2025-0' + (i + 1) + '-15', designation: 'Arrêt' })),
  bts: Array.from({ length: n }, (_, i) => ({ code: 'OTC-' + eq + i, di: 'DI-' + eq + i, eq, type: 'Corrective', etat: 'Clôturé', dateGeneration: '2025-0' + (i + 1) + '-15', dateCloture: '2025-0' + (i + 1) + '-16', panne: panneTxt, cause, effet: '-', dureeIntervention: 4, tempsLogistique: 1, intervenants: [{ nom: 'A', temps: 4, logistique: 1, taux: 500 }], pieces: [] })),
});
const e3 = panne(4, 'CFO.ALG.SST.03', 'Roulement usé'), e4 = panne(3, 'CFO.ALG.SST.04', 'Filtre encrassé');
const data = {
  unit: 'Alger', annee: 2025, equipements: eqs, pieces: [], flt: { sys: '', sub: '', eq: '', se: '' },
  dis: [...e3.dis, ...e4.dis], bts: [...otPrev(12, 'PL-1', eqs[0].code), ...otPrev(4, 'PL-2', eqs[1].code), ...e3.bts, ...e4.bts],
  planning: [plan('PL-1', eqs[0].code, 'Mensuel'), plan('PL-2', eqs[1].code, 'Trimestriel'), plan('PL-3', eqs[2].code, 'Annuel', ['Graisser le roulement'])],
};

describe('Optimisation de la maintenance — règles', () => {
  it('périodicités : cran voisin, MTBF, occurrences par an', () => {
    expect(optiPeriodeVoisine({ periode: 'Mensuel' }, 1).lib).toBe('Trimestriel');
    expect(optiPeriodeVoisine({ periode: 'Mensuel' }, -1).lib).toBe('Hebdomadaire');
    expect(optiPeriodeVoisine({ periode: 'Annuel' }, 1)).toBeNull();
    expect(optiPeriodeVoisine({ periode: 'Hebdomadaire' }, -1)).toBeNull();
    expect(optiOccParAn({ periode: 'Trimestriel' })).toBe(4);
    expect(optiPeriodePourPannes(12).periode).toBe('Mensuel');    // MTBF ≈ 30 j → au plus 15 j… ≤ 45 → Mensuel
    expect(optiPeriodePourPannes(3).periode).toBe('Trimestriel');   // MTBF ≈ 122 j → 61 j → Trimestriel
  });
  it('équipement avec plan et sans panne → ESPACER, avec gain estimé', () => {
    const r = optimiserMaintenance(data);
    const l = r.lignes.find((x) => x.eq === eqs[0].code);
    expect(l.statut).toBe('Espacer'); expect(l.periodeActuelle).toBe('Mensuel'); expect(l.propose).toBe('Trimestriel');
    expect(l.occActuelle).toBe(12); expect(l.occPropose).toBe(4);
    expect(l.economieH).toBeCloseTo(8 * 3, 6);          // 8 OT évités × 3 h (2 h + 1 h logistique)
    expect(l.economieCout).toBeGreaterThan(0);
    expect(r.synth.economieH).toBeGreaterThan(0);
  });
  it('équipement qui tombe trop en panne avec un plan → RENFORCER (cran inférieur) ; sans plan → CRÉER', () => {
    const r = optimiserMaintenance(data);
    const a = r.lignes.find((x) => x.eq === eqs[2].code);
    expect(a.statut).toBe('Renforcer'); expect(a.propose).toBe('Semestriel');       // Annuel → Semestriel
    const b = r.lignes.find((x) => x.eq === eqs[3].code);
    expect(b.statut).toBe('Créer un plan'); expect(b.plan).toBe('(nouveau plan)'); expect(b.propose).toBe('Trimestriel');   // 3 pannes/an
    expect(r.synth).toMatchObject({ espacer: 2, renforcer: 1, creer: 1 });
  });
  it('tâches proposées issues des causes de pannes, sans doublon avec les tâches du plan', () => {
    const r = optimiserMaintenance(data);
    expect(r.taches.some((t) => t.eq === eqs[3].code && /Filtre encrassé/.test(t.tache) && t.occurrences === 3)).toBe(true);
    expect(r.taches.some((t) => t.eq === eqs[2].code && /Roulement usé/.test(t.tache))).toBe(true);
    const r2 = optimiserMaintenance({ ...data, planning: [...data.planning.slice(0, 2), plan('PL-3', eqs[2].code, 'Annuel', ['Contrôler Roulement usé'])] });
    expect(r2.taches.some((t) => t.eq === eqs[2].code)).toBe(false);                 // déjà dans le plan
  });
  it('seuils réglables : 5 pannes/an requises → plus de renforcement', () => {
    const r = optimiserMaintenance({ ...data, seuilPannes: 5 });
    expect(r.synth.renforcer + r.synth.creer).toBe(0);
  });
});

describe('Optimisation de la maintenance — onglet', () => {
  beforeEach(cleanup); afterEach(cleanup);
  it('s’affiche juste avant « Stock »', () => {
    render(<IndicateursPage unit="Alger" unitesRH={['Alger']} dis={[]} bts={[]} planning={[]} equipements={[]} pieces={[]} systemsList={[]} treeStruct={{}} chargesRAM={[]} />);
    const onglets = screen.getAllByRole('tab').map((t) => t.textContent);
    expect(onglets.indexOf('Optimisation de la maintenance')).toBe(onglets.indexOf('Stock') - 1);
    fireEvent.click(screen.getByText('Optimisation de la maintenance'));
    expect(screen.getByTestId('kpi-optimisation')).toBeTruthy();
    expect(screen.getByText('Recommandations automatiques')).toBeTruthy();
  });
});
