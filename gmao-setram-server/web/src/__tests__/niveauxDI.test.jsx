import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Arbo } from '../pages/Arborescence.jsx';
import { DIForm, DIDetail } from '../pages/DemandesIntervention.jsx';
import { cheminDI } from '../lib/arbre.js';
import { controleProfil, definirProfilsPersonnalises, niveauDI, niveauxDIAutorises, catalogue } from '../../../server/src/profils-core.js';

afterEach(() => { cleanup(); definirProfilsPersonnalises([]); });

const ss = { code: 'CFO.ALG.SST.01.01.01', nom: 'Rotor', fournisseurs: [] };
const se = { code: 'CFO.ALG.SST.01.01', nom: 'Moteur', sousSousEquip: [ss] };
const eq = { code: 'CFO.ALG.SST.01', nom: 'Transformateur', emplacement: 'Local 1', system: 'CFO', subCode: 'SST', unit: 'Alger', sousEquip: [se] };
const systemsList = [['CFO', 'Courant fort']];
const treeStruct = { CFO: [{ code: 'SST', sub: 'Sous-station' }] };
const ctx = { equipements: [eq], systemsList, treeStruct };

describe('niveau d\'une DI et chemin complet', () => {
  it('niveauDI reconnaît les 5 niveaux', () => {
    expect(niveauDI({ eq: 'CFO.ALG' })).toBe('systeme');
    expect(niveauDI({ eq: 'CFO.ALG.SST' })).toBe('sousSysteme');
    expect(niveauDI({ eq: eq.code })).toBe('equipement');
    expect(niveauDI({ eq: eq.code, se: se.code })).toBe('sousEquipement');
    expect(niveauDI({ eq: eq.code, se: se.code, ss: ss.code })).toBe('sousSousEquipement');
  });
  it('le chemin va du système au nœud de la DI', () => {
    const c = cheminDI({ eq: eq.code, se: se.code, ss: ss.code }, ctx);
    expect(c.map((n) => n.code)).toEqual(['CFO', 'CFO.ALG.SST', 'CFO.ALG.SST.01', 'CFO.ALG.SST.01.01', 'CFO.ALG.SST.01.01.01']);
    expect(c.map((n) => n.nom)).toEqual(['Courant fort', 'Sous-station', 'Transformateur', 'Moteur', 'Rotor']);
    expect(cheminDI({ eq: 'CFO.ALG.SST', niveau: 'sousSysteme' }, ctx).map((n) => n.code)).toEqual(['CFO', 'CFO.ALG.SST']);
  });
  it('la fiche DI affiche tous les nœuds', () => {
    const di = { code: 'DI-1', eq: eq.code, se: se.code, ss: ss.code, nom: 'x', etat: 'À Transmettre' };
    render(<DIDetail di={di} chemin={cheminDI(di, ctx)} />);
    const ch = screen.getByTestId('chemin-di').textContent;
    for (const c of ['CFO', 'CFO.ALG.SST', 'CFO.ALG.SST.01', 'CFO.ALG.SST.01.01', 'CFO.ALG.SST.01.01.01']) expect(ch).toContain(c);
  });
});

describe('profils : niveaux où créer une DI', () => {
  const user = { role: 'Exploitation' };
  it('sans réglage : tous les niveaux', () => {
    expect(niveauxDIAutorises(user)).toHaveLength(5);
    expect(controleProfil(user, 'dis', null, { eq: 'CFO.ALG', etat: 'À Transmettre' })).toBeNull();
  });
  it('profil de base restreint au sous-sous-équipement par le super admin : le serveur refuse les autres niveaux', () => {
    definirProfilsPersonnalises([{ nom: 'Exploitation', surcharge: true, niveauxDI: ['sousSousEquipement'] }]);
    expect(catalogue().Exploitation.diSeulement).toBe(true);   // le reste du profil de base est inchangé
    expect(controleProfil(user, 'dis', null, { eq: eq.code, etat: 'À Transmettre' })).toMatch(/non autorisée/);
    expect(controleProfil(user, 'dis', null, { eq: 'CFO.ALG', niveau: 'systeme', etat: 'À Transmettre' })).toMatch(/Système/);
    expect(controleProfil(user, 'dis', null, { eq: eq.code, se: se.code, ss: ss.code, etat: 'À Transmettre' })).toBeNull();
    expect(controleProfil({ superAdmin: true }, 'dis', null, { eq: 'CFO.ALG' })).toBeNull();
  });
  it('profil personnalisé : niveaux système et sous-système seulement', () => {
    definirProfilsPersonnalises([{ nom: 'Chef de district', volets: [1], niveauxDI: ['systeme', 'sousSysteme', 'inconnu'] }]);
    const u = { role: 'Chef de district' };
    expect(niveauxDIAutorises(u)).toEqual(['systeme', 'sousSysteme']);
    expect(controleProfil(u, 'dis', null, { eq: 'CFO.ALG.SST' })).toBeNull();
    expect(controleProfil(u, 'dis', null, { eq: eq.code, se: se.code })).toMatch(/Sous-équipement/);
  });
});

describe('formulaire DI en cascade', () => {
  it('DI lancée depuis l\'arborescence au niveau sous-système : nœud préchargé, non modifiable', () => {
    const onSubmit = vi.fn();
    render(<DIForm prefill={{ eq: 'CFO.ALG.SST', niveau: 'sousSysteme' }} equipements={[eq]} systemsList={systemsList} treeStruct={treeStruct} unit="Alger" demandeur="K" onSubmit={onSubmit} />);
    expect(screen.getByTestId('noeud-precharge').textContent).toContain('CFO.ALG.SST');
    expect(screen.queryByLabelText('Équipement')).toBeNull();
    fireEvent.change(screen.getByPlaceholderText('Obligatoire : décrire le constat'), { target: { value: 'Constat de test' } });
    fireEvent.click(screen.getByText('Créer la DI'));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ eq: 'CFO.ALG.SST', niveau: 'sousSysteme', se: '', ss: '' });
  });
  it('niveau non permis : refus avec message, rien n\'est envoyé', () => {
    const onSubmit = vi.fn();
    render(<DIForm equipements={[eq]} systemsList={systemsList} treeStruct={treeStruct} unit="Alger" niveaux={['sousSousEquipement']} demandeur="K" onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText('Équipement'), { target: { value: eq.code } });
    fireEvent.change(screen.getByPlaceholderText('Obligatoire : décrire le constat'), { target: { value: 'Constat de test' } });
    fireEvent.click(screen.getByText('Créer la DI'));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('ne permet pas de créer une DI au niveau « Équipement »');
  });
});

describe('arborescence : une flèche par niveau', () => {
  const props = { unit: 'Alger', equipements: [eq], systemsList, treeStruct, onAddEquip() {}, onOpenEquip() {}, onAddSystem() {}, onAddSubSystem() {}, onEditSubSystem() {}, onAddSousEquip() {}, onOpenSousEquip() {}, onRemoveSousEquip() {}, mesureList: [], ctrlList: [], organismes: [] };
  it('système → sous-système → équipement → sous-équipement → sous-sous-équipement', () => {
    render(<Arbo {...props} onCreateDI={() => {}} />);
    expect(screen.queryByText('Sous-station', { exact: false })).toBeNull();
    fireEvent.click(screen.getByText('CFO', { exact: false }).closest('button'));
    fireEvent.click(screen.getByText('Sous-station', { exact: false }).closest('button'));
    expect(screen.queryByText('CFO.ALG.SST.01.01')).toBeNull();
    fireEvent.click(screen.getByLabelText('Ouvrir CFO.ALG.SST.01'));
    expect(screen.getByText('CFO.ALG.SST.01.01')).toBeTruthy();
    expect(screen.queryByText('CFO.ALG.SST.01.01.01')).toBeNull();   // fermé tant que la flèche du sous-équipement n'est pas ouverte
    fireEvent.click(screen.getByLabelText('Ouvrir CFO.ALG.SST.01.01'));
    expect(screen.getByText('CFO.ALG.SST.01.01.01')).toBeTruthy();
  });
  it('clic droit sur un sous-système : DI à ce niveau, ou refus selon le profil', () => {
    const onCreateDI = vi.fn();
    const { unmount } = render(<Arbo {...props} onCreateDI={onCreateDI} />);
    fireEvent.click(screen.getByText('CFO', { exact: false }).closest('button'));
    fireEvent.contextMenu(screen.getByText('Sous-station', { exact: false }));
    fireEvent.click(screen.getByText('Créer une DI pour CFO.ALG.SST'));
    expect(onCreateDI).toHaveBeenCalledWith(expect.objectContaining({ eq: 'CFO.ALG.SST', niveau: 'sousSysteme' }));
    unmount();
    render(<Arbo {...props} onCreateDI={onCreateDI} niveauxDI={['sousSousEquipement']} />);
    fireEvent.click(screen.getByText('CFO', { exact: false }).closest('button'));
    fireEvent.contextMenu(screen.getByText('Sous-station', { exact: false }));
    expect(screen.getByText('DI non autorisée à ce niveau pour votre profil')).toBeTruthy();
  });
});

describe('formulaire DI : un seul champ Équipement (code GMAO + nom)', () => {
  it('aucune cascade : seuls « code — nom » des équipements sont proposés', () => {
    render(<DIForm equipements={[eq]} systemsList={systemsList} treeStruct={treeStruct} unit="Alger" demandeur="K" onSubmit={() => {}} />);
    expect(screen.queryByLabelText('Système')).toBeNull();
    expect(screen.queryByLabelText('Sous-système')).toBeNull();
    const options = [...screen.getByLabelText('Équipement').options].map((o) => o.textContent);
    expect(options).toContain('CFO.ALG.SST.01 — Transformateur');
    expect(options.some((o) => o.includes(se.code))).toBe(false);
  });
  it('choisir un équipement crée une DI sur l\'équipement entier et reprend son emplacement', () => {
    const onSubmit = vi.fn();
    render(<DIForm equipements={[eq]} systemsList={systemsList} treeStruct={treeStruct} unit="Alger" demandeur="K" onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText('Équipement'), { target: { value: eq.code } });
    expect(screen.getByDisplayValue('Local 1')).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText('Obligatoire : décrire le constat'), { target: { value: 'Fuite' } });
    fireEvent.click(screen.getByText('Créer la DI'));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ eq: eq.code, niveau: 'equipement', se: '', ss: '' });
  });
});

describe('DI : la désignation est obligatoire', () => {
  it('sans désignation : refus avec message, rien n\'est envoyé ; avec désignation : la DI est créée', () => {
    const onSubmit = vi.fn();
    render(<DIForm prefill={{ eq: eq.code }} equipements={[eq]} systemsList={systemsList} treeStruct={treeStruct} unit="Alger" demandeur="Test" onSubmit={onSubmit} />);
    fireEvent.click(screen.getByText('Créer la DI'));
    expect(screen.getByText(/désignation .* est obligatoire/i)).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.change(screen.getByPlaceholderText('Obligatoire : décrire le constat'), { target: { value: '   ' } });
    fireEvent.click(screen.getByText('Créer la DI'));
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.change(screen.getByPlaceholderText('Obligatoire : décrire le constat'), { target: { value: 'Fuite d\'huile' } });
    fireEvent.click(screen.getByText('Créer la DI'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0].designation).toBe('Fuite d\'huile');
  });
});
