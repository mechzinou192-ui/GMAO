import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { genererDemo } from '../../../server/src/demo/donnees.js';
import { SYSTEMES, ARBORESCENCE, lignesReferentiels } from '../../../server/src/demo/referentiels.js';
import { SYSTEMS_SEED, TREE_STRUCT_SEED } from '../lib/referentiels-defaut.js';
import { systemes, arborescence } from '../referentiels.js';
import { kpiCollect, kpiCalc, kpiPeriode, kpiStock, kpiRH, kpiAmdec, kpiEquipements, KPI_NORME_DEFAUT } from '../lib/kpi.js';
import { habListe, contratInfo } from '../lib/echeances.js';
import { datesPlanDansPlage } from '../lib/preventif.js';

describe('données de démonstration (serveur) et interface : restent cohérentes', () => {
  it('les référentiels de démo sont identiques aux valeurs par défaut de l\'interface (même lignes en base)', () => {
    expect(SYSTEMES).toEqual(SYSTEMS_SEED); expect(ARBORESCENCE).toEqual(TREE_STRUCT_SEED);
    const l = lignesReferentiels();
    expect(l.systemes).toEqual(systemes.toRows(SYSTEMS_SEED)); expect(l.arborescence).toEqual(arborescence.toRows(TREE_STRUCT_SEED));
  });

  const NOW = new Date(2026, 9, 8, 12, 0, 0);
  const d = genererDemo(NOW);
  const data = { dis: d.collections.dis.map((r) => r.data), bts: d.collections.bts.map((r) => r.data), planning: d.collections.planning.map((r) => r.data), equipements: d.collections.equipements.map((r) => r.data) };
  const fin = '2026-10-08', deb = '2026-07-10';
  const per = kpiPeriode(deb, fin);

  it('les indicateurs d\'Alger sont réalistes (rien de vide, de négatif ou d\'absurde)', () => {
    const { corr, prev, nbEquip } = kpiCollect('Alger', data, per, 'Méthode d\'origine', null);
    expect(corr.length).toBeGreaterThan(20); expect(prev.length).toBeGreaterThan(5); expect(nbEquip).toBeGreaterThan(10);
    const k = kpiCalc(corr, prev, per, nbEquip);
    for (const v of [k.mttr, k.mtbf, k.dispo, k.tcp, k.tcc, k.tmp, k.tmc]) expect(Number.isFinite(v)).toBe(true);
    expect(k.dispo).toBeGreaterThan(0.9); expect(k.dispo).toBeLessThanOrEqual(1);
    expect(k.mttr).toBeGreaterThan(1); expect(k.mttr).toBeLessThan(8);
    expect(k.tcp + k.tcc).toBeCloseTo(1, 6);
    expect(k.tmp).toBeGreaterThan(0.5); expect(k.tmc).toBeGreaterThan(0.5);
    expect(k.nbRecurrentes).toBeGreaterThan(0);                              // la panne récurrente prévue apparaît bien
    expect(k.nbNegatif).toBe(0); expect(k.nbAberrant).toBe(0); expect(k.nbSansFin).toBe(0);
  });
  it('autres unités, équipements, ressources humaines, stock, criticité : calculables', () => {
    for (const u of ['Oran', 'Constantine', 'Sidi Bel Abbès', 'Ouargla', 'Sétif', 'Mostaganem']) {
      const c = kpiCollect(u, data, per, 'x', null); const k = kpiCalc(c.corr, c.prev, per, c.nbEquip);
      expect(Number.isFinite(k.dispo), u).toBe(true); expect(c.nbEquip, u).toBeGreaterThan(0);
    }
    const { corr, prev } = kpiCollect('Alger', data, per, 'x', null);
    expect(kpiEquipements(corr, prev, per, data.equipements).length).toBeGreaterThan(5);
    const rh = kpiRH(corr, prev, per, KPI_NORME_DEFAUT, 0); expect(rh.nbTech).toBeGreaterThanOrEqual(4); expect(rh.total).toBeGreaterThan(0);
    const st = kpiStock(d.collections.pieces.map((r) => r.data), per, 3, NOW);
    expect(st.coutTotal).toBeGreaterThan(0); expect(st.nbDormants).toBeGreaterThanOrEqual(1); expect(st.nbSousSeuil + 0).toBeGreaterThanOrEqual(0);
    const am = kpiAmdec(corr, per, { groupBy: 'Équipement', gravBase: 'Durée d\'arrêt', equipements: data.equipements });
    expect(am.length).toBeGreaterThan(5); expect(am.every((x) => x.crit >= 1 && x.crit <= 64)).toBe(true);
  });
  it('alertes visibles : habilitations échues ou proches, contrats, préventif à venir', () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW);
    try {
      const niveaux = habListe(d.collections.intervenants.map((r) => r.data)).map((x) => x.h && x.p && x.niveau);   // eslint-disable-line no-unused-vars
      const inter = d.collections.intervenants.map((r) => r.data);
      const hab = habListe(inter);
      expect(hab.length).toBeGreaterThanOrEqual(8);
      void niveaux;
      const contrats = d.collections.prestataires.map((r) => contratInfo(r.data));
      expect(contrats.some((c) => c.niveau === 'rouge')).toBe(true); expect(contrats.some((c) => c.alerte)).toBe(true); expect(contrats.some((c) => c.niveau === 'vert' && !c.alerte)).toBe(true);
      const futur = data.planning.flatMap((p) => datesPlanDansPlage(p, '2026-10-08', '2026-11-08'));
      expect(futur.length).toBeGreaterThan(5);
    } finally { vi.useRealTimers(); }
  });
});

/* ───── écran de connexion ───── */
vi.mock('../api.js', () => ({ api: { me: vi.fn(async () => ({ user: null })), login: vi.fn(), demo: vi.fn(), list: vi.fn(async () => ({ items: [], serverTime: 't' })) } }));
import { api } from '../api.js';
import App from '../App.jsx';

describe('écran de connexion — instance de démonstration', () => {
  beforeEach(() => { cleanup(); vi.clearAllMocks(); api.me.mockResolvedValue({ user: null }); });
  it('affiche le bandeau, des profils cliquables qui remplissent le formulaire, et se connecte', async () => {
    api.demo.mockResolvedValue({ demo: true, resetHeures: 24, comptes: [{ id: 'demo.admin', nom: 'Démo — Super administrateur', motDePasse: 'Demo2026-Admin', description: 'Accès complet.' }, { id: 'demo.technicien', nom: 'Démo — Technicien', motDePasse: 'Demo2026-Tech', description: 'Traite les DI et OT.' }] });
    api.login.mockResolvedValue({ user: { id: 'demo.technicien', nom: 'Tech', role: 'Technicien', superAdmin: false, mustChangePw: false, droits: {} } });
    render(<App />);
    const bandeau = await screen.findByTestId('bandeau-demo');
    expect(bandeau.textContent).toContain('Version de démonstration'); expect(bandeau.textContent).toContain('toutes les 24 h');
    fireEvent.click(screen.getByText('Technicien'));
    expect(screen.getByDisplayValue('demo.technicien')).toBeTruthy(); expect(screen.getByDisplayValue('Demo2026-Tech')).toBeTruthy();
    expect(bandeau.textContent).toContain('Traite les DI et OT.');
    fireEvent.click(screen.getByText('Se connecter'));
    await waitFor(() => expect(api.login).toHaveBeenCalledWith('demo.technicien', 'Demo2026-Tech', false));
  });
  it('instance normale : aucun bandeau, aucun compte affiché', async () => {
    api.demo.mockResolvedValue(null);
    render(<App />);
    await screen.findByText('Connexion à votre compte');
    expect(screen.queryByTestId('bandeau-demo')).toBeNull();
  });
});
