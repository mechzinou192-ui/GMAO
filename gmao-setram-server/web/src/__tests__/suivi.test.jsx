import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { IndicateursPage } from '../pages/Indicateurs.jsx';
import { suiviAppliquer, suiviCode, suiviCompter, suiviStatut } from '../lib/suivi.js';

const EQ = [1, 2].map((i) => ({ code: 'CFO.ALG.SST.0' + i, unit: 'Alger', system: 'CFO', subCode: 'SST', nom: 'Équipement ' + i, sousEquip: [] }));
const mk = (eq, dates) => ({
  dis: dates.map((d, i) => ({ code: 'DI-' + eq + i, eq, etat: 'Clôturé', dateCreation: d, dateEvt: d, designation: 'Arrêt' })),
  bts: dates.map((d, i) => ({ code: 'OT-' + eq + i, di: 'DI-' + eq + i, eq, type: 'Corrective', etat: 'Clôturé', panne: 'Surchauffe', cause: 'Roulement usé', dureeIntervention: 4, tempsLogistique: 1, intervenants: [{ nom: 'A', temps: 4, logistique: 1, taux: 500 }], pieces: [] })),
});
const a = mk(EQ[0].code, ['2025-02-05', '2025-03-07', '2025-04-06', '2025-05-06', '2025-06-05']);   // 5 pannes régulières → risque prédictif ; 4 pannes en 2025 → plan à créer
const props = (extra = {}) => ({ unit: 'Alger', unitesRH: ['Alger'], dis: a.dis, bts: a.bts, planning: [], equipements: EQ, pieces: [], systemsList: [], treeStruct: {}, chargesRAM: [], suivis: [], onSaveSuivi: () => {}, peutTraiter: true, auteur: 'K. Benali', ...extra });

describe('Suivi du traitement — logique', () => {
  it('statut par défaut « À traiter », codes stables, compteurs', () => {
    expect(suiviStatut(undefined)).toBe('À traiter');
    expect(suiviCode('PRED', 'Sidi Bel Abbès', 'CFO.ALG.SST.01|2025-06-05')).toBe('SUIV-PRED-Sidi-Bel-Abbes-CFO-ALG-SST-01-2025-06-05');
    expect(suiviCompter(['x', 'y', 'z'], [{ code: 'x', statut: 'Traité' }, { code: 'y', statut: 'En cours' }])).toEqual({ 'À traiter': 1, 'En cours': 1, 'Traité': 1, 'Non retenu': 0 });
  });
  it('commentaire facultatif ; chaque changement ajoute une ligne d’historique', () => {
    const base = { code: 'C1', unit: 'Alger', source: 'PRED', eq: 'E1', nom: 'Pompe', resume: 'Planifier', par: 'A. Haddad', le: '2026-11-26T10:00:00Z' };
    const r1 = suiviAppliquer(undefined, { ...base, statut: 'En cours' });
    expect(r1).toMatchObject({ statut: 'En cours', commentaire: '', traitePar: 'A. Haddad' }); expect(r1.historique).toHaveLength(1);
    expect(r1.historique[0]).toMatchObject({ de: 'À traiter', a: 'En cours' });
    const r2 = suiviAppliquer(r1, { ...base, statut: 'Traité', commentaire: '  Plan mensuel créé  ', le: '2026-12-01T09:00:00Z' });
    expect(r2.commentaire).toBe('Plan mensuel créé'); expect(r2.historique.map((h) => h.a)).toEqual(['En cours', 'Traité']); expect(r2.historique[1].de).toBe('En cours');
  });
});

describe('Suivi du traitement — onglets', () => {
  beforeEach(cleanup); afterEach(cleanup);
  it('Maintenance prédictive : traiter une prévision avec commentaire facultatif', () => {
    const onSave = vi.fn(); render(<IndicateursPage {...props({ onSaveSuivi: onSave })} />);
    fireEvent.click(screen.getByText('Maintenance prédictive'));
    const compteurs = screen.getByTestId('suivi-compteurs'); expect(compteurs.textContent).toContain('À traiter : 1');
    fireEvent.click(screen.getByLabelText('Traiter Équipement 1'));
    fireEvent.change(screen.getByLabelText('Statut du traitement'), { target: { value: 'Traité' } });
    fireEvent.click(screen.getByText('Enregistrer'));                      // commentaire laissé vide : accepté
    expect(onSave).toHaveBeenCalledTimes(1);
    const rec = onSave.mock.calls[0][0];
    expect(rec).toMatchObject({ source: 'PRED', eq: EQ[0].code, unit: 'Alger', statut: 'Traité', commentaire: '', traitePar: 'K. Benali' });
    expect(rec.code).toBe('SUIV-PRED-Alger-CFO-ALG-SST-01-2025-06-05');
  });
  it('affiche le statut, le commentaire et propose « Modifier » quand un suivi existe', () => {
    const suivis = [{ code: 'SUIV-PRED-Alger-CFO-ALG-SST-01-2025-06-05', unit: 'Alger', source: 'PRED', eq: EQ[0].code, nom: 'Équipement 1', statut: 'En cours', commentaire: 'Roulement commandé', traitePar: 'A. Haddad', traiteLe: '2026-11-20T08:00:00Z', historique: [] }];
    render(<IndicateursPage {...props({ suivis })} />);
    fireEvent.click(screen.getByText('Maintenance prédictive'));
    expect(screen.getByText(/Roulement commandé/)).toBeTruthy(); expect(screen.getByLabelText('Modifier le traitement de Équipement 1')).toBeTruthy();
    expect(screen.getByTestId('suivi-compteurs').textContent).toContain('En cours : 1');
  });
  it('en consultation (lecture seule) : pas de bouton Traiter', () => {
    render(<IndicateursPage {...props({ peutTraiter: false })} />);
    fireEvent.click(screen.getByText('Maintenance prédictive'));
    expect(screen.queryByLabelText('Traiter Équipement 1')).toBeNull();
  });
  it('Optimisation de la maintenance : traiter une recommandation (plan à créer)', () => {
    const onSave = vi.fn(); render(<IndicateursPage {...props({ onSaveSuivi: onSave })} />);
    fireEvent.click(screen.getByText('Optimisation de la maintenance'));
    fireEvent.click(screen.getByText('2025'));
    fireEvent.click(screen.getByLabelText('Traiter Équipement 1'));
    fireEvent.change(screen.getByLabelText('Commentaire'), { target: { value: 'À valider en réunion de janvier' } });
    fireEvent.click(screen.getByText('Enregistrer'));
    const rec = onSave.mock.calls[0][0];
    expect(rec).toMatchObject({ source: 'OPT', eq: EQ[0].code, statut: 'En cours', commentaire: 'À valider en réunion de janvier' });
    expect(rec.code).toBe('SUIV-OPT-Alger-2025-CFO-ALG-SST-01-nouveau-plan');
  });
});
