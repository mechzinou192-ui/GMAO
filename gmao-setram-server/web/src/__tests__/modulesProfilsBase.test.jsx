import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

vi.mock('../api.js', () => ({ api: { users: vi.fn(async () => ({ users: [] })) } }));
import { EditeurProfils } from '../pages/Administration.jsx';
import { DIDetail } from '../pages/DemandesIntervention.jsx';
import { cheminDI, noeudDI, noeudTexte } from '../lib/arbre.js';
import { controleProfil, definirProfilsPersonnalises, catalogue, normaliserDroitsProfil, PROFILS } from '../../../server/src/profils-core.js';

afterEach(() => { cleanup(); definirProfilsPersonnalises([]); });

describe('profil de base : ajouter des modules (ex. Exploitation + Arborescence)', () => {
  const droits = { Alger: { systems: ['CFO'], volets: [0, 1] } };

  it('sans réglage : Exploitation n\'a que les DI, le volet Arborescence est retiré des droits', () => {
    expect(catalogue().Exploitation.volets).toEqual([1]);
    expect(normaliserDroitsProfil('Exploitation', droits).Alger.volets).toEqual([1]);
  });

  it('avec le module ajouté par le super admin : Arborescence + DI, le reste du profil est inchangé', () => {
    definirProfilsPersonnalises([{ nom: 'Exploitation', surcharge: true, volets: [0, 1] }]);
    const p = catalogue().Exploitation;
    expect(p.volets).toEqual([0, 1]);
    expect(p.diSeulement).toBe(true);
    expect(normaliserDroitsProfil('Exploitation', droits).Alger.volets).toEqual([0, 1]);
    // consultation seulement : le serveur refuse toujours toute écriture hors DI
    expect(controleProfil({ role: 'Exploitation' }, 'equipements', { code: 'A' }, { code: 'A', nom: 'x' })).toMatch(/DI uniquement/);
    expect(controleProfil({ role: 'Exploitation' }, 'dis', null, { eq: 'CFO.ALG.SST.01', etat: 'À Transmettre' })).toBeNull();
  });

  it('les modules d\'origine ne peuvent pas être retirés ; valeurs invalides ignorées', () => {
    definirProfilsPersonnalises([{ nom: 'Exploitation', surcharge: true, volets: [0, 9, -1, 'x'] }]);
    expect(catalogue().Exploitation.volets).toEqual([0, 1]);
    definirProfilsPersonnalises([{ nom: 'Exploitation', surcharge: true, volets: [] }]);
    expect(catalogue().Exploitation.volets).toEqual(PROFILS.Exploitation.volets);
  });

  it('niveaux de DI et modules se combinent', () => {
    definirProfilsPersonnalises([{ nom: 'Exploitation', surcharge: true, volets: [0, 1], niveauxDI: ['sousSousEquipement'] }]);
    expect(catalogue().Exploitation).toMatchObject({ volets: [0, 1], niveauxDI: ['sousSousEquipement'], diSeulement: true });
  });

  it('éditeur : on coche Arborescence sur Exploitation et on enregistre', async () => {
    const setProfilsPerso = vi.fn();
    render(<EditeurProfils profilsPerso={[]} setProfilsPerso={setProfilsPerso} />);
    fireEvent.click(await screen.findByText('Exploitation'));
    const zone = await screen.findByTestId('modules-base');
    const caseDI = screen.getByLabelText(/Demandes d'Intervention \(DI\) \(d'origine\)/);
    expect(caseDI.checked).toBe(true);
    expect(caseDI.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText(/^Arborescence technique/));
    expect(zone).toBeTruthy();
    fireEvent.click(screen.getByText('Enregistrer'));
    await waitFor(() => expect(setProfilsPerso).toHaveBeenCalled());
    const maj = setProfilsPerso.mock.calls[0][0]([]);
    expect(maj).toEqual([{ nom: 'Exploitation', surcharge: true, volets: [0, 1] }]);
  });
});

describe('DI : seul le nœud concerné est affiché', () => {
  const se = { code: 'LAC.ALG.CDP.01.01.04', nom: 'Relevage LAC', fournisseurs: [] };
  const eq = { code: 'LAC.ALG.CDP.01.01', nom: 'Canton de Pose N° T01-01 (628,00m) Secteur 1', system: 'LAC', subCode: 'CDP', unit: 'Alger', sousEquip: [se] };
  const ctx = { equipements: [eq], systemsList: [['LAC', 'Lignes de contact']], treeStruct: { LAC: [{ code: 'CDP', sub: 'Canton de Pose' }] } };
  // texte composé à la création, tel qu'il est enregistré dans les DI existantes
  const nomStocke = eq.nom + ' — ' + se.code + ' ' + se.nom;

  it('sous-équipement : code + nom du sous-équipement uniquement', () => {
    const di = { code: 'DI-1', eq: eq.code, se: se.code, nom: nomStocke, etat: 'À Transmettre' };
    expect(noeudDI(di, cheminDI(di, ctx))).toEqual({ code: se.code, nom: 'Relevage LAC' });
    expect(noeudTexte(di, cheminDI(di, ctx))).toBe('LAC.ALG.CDP.01.01.04 — Relevage LAC');
  });

  it('retrouve le nom même si l\'équipement n\'existe plus (dernier morceau du texte enregistré)', () => {
    const di = { code: 'DI-1', eq: eq.code, se: se.code, nom: nomStocke };
    expect(noeudTexte(di, cheminDI(di, { equipements: [] }))).toBe('LAC.ALG.CDP.01.01.04 — Relevage LAC');
  });

  it('équipement et sous-sous-équipement', () => {
    const diEq = { eq: eq.code, nom: eq.nom };
    expect(noeudDI(diEq, cheminDI(diEq, ctx))).toEqual({ code: eq.code, nom: eq.nom });
    const ss = { code: 'LAC.ALG.CDP.01.01.04.01', nom: 'Moteur', fournisseurs: [] };
    const ctx2 = { ...ctx, equipements: [{ ...eq, sousEquip: [{ ...se, sousSousEquip: [ss] }] }] };
    const diSs = { eq: eq.code, se: se.code, ss: ss.code, nom: nomStocke + ' — ' + ss.code + ' ' + ss.nom };
    expect(noeudTexte(diSs, cheminDI(diSs, ctx2))).toBe('LAC.ALG.CDP.01.01.04.01 — Moteur');
  });

  it('la fiche DI : « Nœud visé » ne montre plus tous les codes', () => {
    const di = { code: 'DI-1', eq: eq.code, se: se.code, nom: nomStocke, etat: 'À Transmettre' };
    render(<DIDetail di={di} chemin={cheminDI(di, ctx)} />);
    const noeud = screen.getByText('Nœud visé').parentElement.textContent;
    expect(noeud).toBe('Nœud viséLAC.ALG.CDP.01.01.04 — Relevage LAC');
    expect(noeud).not.toContain('Canton de Pose');
  });
});
