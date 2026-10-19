import { describe, it, expect, vi, afterEach } from 'vitest';
import { ajouterReleve, codeCompteur, controleReleve, dernier, etatPlanCompteur, isCompteurPlan, moyenneJour, serie } from '../lib/compteurs.js';
import { datesPlanDansPlage, datesFuturesPlan } from '../lib/preventif.js';

const C = { code: 'MR.ALG.BOG.01-KM', eq: 'MR.ALG.BOG.01', unite: 'km',
  releves: [{ date: '2026-09-01', valeur: 100000 }, { date: '2026-09-11', valeur: 102000 }, { date: '2026-10-01', valeur: 106000 }] };

afterEach(() => vi.useRealTimers());
const aujourdhui = (d) => { vi.useFakeTimers(); vi.setSystemTime(new Date(d + 'T10:00:00Z')); };

describe('compteurs : relevés', () => {
  it('code du compteur dérivé de l\'équipement et de l\'unité', () => {
    expect(codeCompteur('MR.ALG.BOG.01', 'km')).toBe('MR.ALG.BOG.01-KM');
    expect(codeCompteur('ED.ALG.PNT.01', 'h')).toBe('ED.ALG.PNT.01-H');
  });
  it('moyenne journalière sur les relevés', () => {
    expect(moyenneJour(C)).toBe(200);                                   // 6000 km en 30 jours
    expect(moyenneJour({ releves: [{ date: '2026-09-01', valeur: 5 }] })).toBeNull();
  });
  it('refuse un relevé inférieur au précédent, futur ou antérieur au dernier', () => {
    aujourdhui('2026-10-19');
    expect(controleReleve(C, { date: '2026-10-10', valeur: 105000 })).toMatch(/inférieure au dernier relevé/);
    expect(controleReleve(C, { date: '2026-12-01', valeur: 107000 })).toMatch(/futur/);
    expect(controleReleve(C, { date: '2026-09-20', valeur: 107000 })).toMatch(/plus récent/);
    expect(controleReleve(C, { date: '2026-10-10', valeur: 'abc' })).toMatch(/numérique/);
    expect(controleReleve(C, { date: '2026-10-10', valeur: '107 500' })).toBe('');
  });
  it('remplacement du compteur : la valeur cumulée continue', () => {
    aujourdhui('2026-10-19');
    expect(controleReleve(C, { date: '2026-10-10', valeur: 50, reset: true, ancienne: 100 })).toMatch(/ancien compteur/);
    const c2 = ajouterReleve(C, { date: '2026-10-10', valeur: 50, reset: true, ancienne: 107000 });
    expect(dernier(c2)).toMatchObject({ brut: 50, cumul: 107050, reset: true });
    expect(serie(c2).map((p) => p.cumul)).toEqual([100000, 102000, 106000, 107050]);
  });
});

describe('compteurs : plans conditionnels', () => {
  const plan = (valeurDernier, pas = 10000, seuil) => ({ declenchement: 'Compteur', compteur: C.code, pas, seuil, valeurDernier });
  it('statut selon la consommation depuis le dernier passage', () => {
    aujourdhui('2026-10-19');
    expect(etatPlanCompteur(plan(100000), C)).toMatchObject({ depuis: 6000, prochain: 110000, reste: 4000, pct: 60, statut: 'OK', dateEstimee: '2026-10-21' });
    expect(etatPlanCompteur(plan(97000), C)).toMatchObject({ pct: 90, statut: 'À déclencher' });
    expect(etatPlanCompteur(plan(97000, 10000, 95), C).statut).toBe('OK');
    expect(etatPlanCompteur(plan(95000), C)).toMatchObject({ pct: 110, statut: 'Dépassé', dateEstimee: '2026-10-19' });
    expect(etatPlanCompteur(plan(0), { releves: [] }).statut).toBe('Sans relevé');
  });
  it('le planning calendaire voit le plan compteur à sa date estimée uniquement', () => {
    const p = { ...plan(100000), periode: 'Compteur', date: '2026-10-21' };
    expect(isCompteurPlan(p)).toBe(true);
    expect(datesPlanDansPlage(p, '2026-10-01', '2026-12-31')).toEqual(['2026-10-21']);
    expect(datesPlanDansPlage({ ...p, date: '' }, '2026-10-01', '2026-12-31')).toEqual([]);
    expect(datesFuturesPlan(p)).toEqual(['2026-10-21']);
  });
});
