import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { IndicateursPage } from '../pages/Indicateurs.jsx';
import { kpiObj, kpiStatus } from '../lib/kpi.js';

const EQ = { code: 'CFO.ALG.SST.01', unit: 'Alger', system: 'CFO', subCode: 'SST', nom: 'Transformateur T1', sousEquip: [] };
const now = new Date();
const mois = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
const jour = mois + '-' + String(now.getDate()).padStart(2, '0');
const OT = { code: 'OT-PREV-1', eq: EQ.code, nom: EQ.nom, type: 'Préventive', plan: 'PLAN-1', etat: 'Clôturé', dateGeneration: jour, dateCloture: jour,
  intervenants: [{ nom: 'A. Haddad', fonction: 'Technicien', temps: 3, logistique: 1 }, { nom: 'M. Rahmani', fonction: 'Technicien', temps: 4, logistique: 0 }] };

const afficher = (extra = {}) => render(<IndicateursPage unit="Alger" unitesRH={['Alger']} dis={[]} bts={[OT]} planning={[]} equipements={[EQ]} pieces={[]} systemsList={[]} treeStruct={{}}
  chargesRAM={[{ code: 'RAM-Alger-' + mois, unit: 'Alger', mois, chargeRAM: 10 }]} peutSaisirRAM {...extra} />);

beforeEach(cleanup); afterEach(cleanup);

describe('Indicateurs : Synthèse et Tableau de bord', () => {
  it('statut du taux d’efficience : cible centrée sur 100 % (± 10 % atteint, ± 20 % proche)', () => {
    const o = kpiObj('Alger').efficience;
    expect(kpiStatus(o, 1.05, true)).toBe('ok');
    expect(kpiStatus(o, 0.8, true)).toBe('warn');   // 20 % d'écart : toujours « proche »
    expect(kpiStatus(o, 0.5, true)).toBe('bad');
  });
  it('Synthèse : ingénierie = TCP, TCC, efficience ; réalisation = TMP, TMC, disponibilité, λ, μ, MTBF, MTTR', () => {
    afficher();
    fireEvent.click(screen.getByText('Synthèse'));
    const blocs = [...document.querySelectorAll('h3')].filter((h) => /^Indicateurs d'ingénierie$|^Indicateurs de réalisation$/.test(h.textContent));
    expect(blocs.length).toBe(2);
    const ing = blocs[0].parentElement.parentElement.textContent, real = blocs[1].parentElement.parentElement.textContent;
    for (const t of ['TCP — charge préventive', 'TCC — charge corrective', 'Taux d\'efficience']) expect(ing).toContain(t);
    expect(ing).toContain('80,0 %');   // 8 h GMAO ÷ 10 h RAM
    for (const t of ['TMP — maintenance préventive', 'TMC — maintenance corrective', 'Disponibilité', 'λ = 1/MTBF', 'μ = 1/MTTR', 'MTBF', 'MTTR']) expect(real).toContain(t);
    expect(real).not.toContain('TCP');
  });
  it('Tableau de bord : les 10 indicateurs de la Synthèse en tête, chacun avec sa courbe d’évolution', () => {
    afficher();
    const ing = screen.getByTestId('kpi-evo-ing'), real = screen.getByTestId('kpi-evo-real');
    expect(ing.querySelectorAll('section.gm-chart').length).toBe(3);
    expect(real.querySelectorAll('section.gm-chart').length).toBe(7);
    expect(within(ing).getAllByRole('img').length).toBe(3);
    expect(within(real).getAllByRole('img').length).toBe(7);
    // le tableau de bord commence par ces deux blocs
    expect(screen.getByTestId('kpi-graphiques').firstElementChild).toBe(ing);
  });
});
