import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import ExcelJS from 'exceljs';

vi.mock('../api.js', () => ({ api: { importExcel: vi.fn(), nextCodes: vi.fn() } }));
vi.mock('../sync.js', () => ({ flushAll: vi.fn(async () => {}), refreshAll: vi.fn(async () => {}) }));
import { api } from '../api.js';
import { refreshAll } from '../sync.js';
import ImportDonnees from '../ImportDonnees.jsx';

const UNITS = ['Alger', 'Oran', 'Constantine', 'Sidi Bel Abbès', 'Ouargla', 'Sétif', 'Mostaganem'];
const refs = {
  units: UNITS, unitAbbr: { Alger: 'ALG', Oran: 'ORN', Constantine: 'CST', 'Sidi Bel Abbès': 'SBA', Ouargla: 'OUA', Sétif: 'SET', Mostaganem: 'MST' },
  roles: ['Technicien', 'Responsable'], cdcEtats: ['À préparer', 'Validé'], orgDom: ['Contrôle réglementaire', 'Étalonnage'],
  systemsList: [['CFO', 'Courants forts'], ['MR', 'Matériel roulant']], treeStruct: { CFO: [{ code: 'SST', sub: 'Sous-station' }], MR: [{ code: 'BOG', sub: 'Bogies' }] },
  equipements: [], pieces: [], intervenants: [], prestataires: [], organismes: [], mesures: [], controles: [],
};

async function fichier(feuilles, nom = 'import.xlsx') {
  const wb = new ExcelJS.Workbook();
  for (const [n, lignes] of Object.entries(feuilles)) { const ws = wb.addWorksheet(n); lignes.forEach((l) => ws.addRow(l)); }
  const buf = await wb.xlsx.writeBuffer();
  const f = new File([buf], nom, { type: 'application/octet-stream' });
  f.arrayBuffer = async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return f;
}
const charger = (f) => fireEvent.change(screen.getByLabelText('Fichier Excel à importer'), { target: { files: [f] } });
const EQ = ['Unité *', 'Système *', 'Sous-système *', 'Désignation *'];

beforeEach(() => { cleanup(); vi.clearAllMocks(); });

describe('Import Excel — interface', () => {
  it('fichier correct : contrôle, confirmation, envoi en une requête, puis rapport', async () => {
    api.nextCodes.mockResolvedValue(['P-001']);
    api.importExcel.mockResolvedValue({ totals: { created: 3, updated: 0, skipped: 0 }, collections: { equipements: { created: 2, updated: 0, skipped: 0 }, pieces: { created: 1, updated: 0, skipped: 0 } } });
    render(<ImportDonnees refs={refs} />);
    charger(await fichier({
      'Équipements': [EQ, ['Alger', 'CFO', 'SST', 'Transformateur'], ['Oran', 'MR', 'BOG', 'Bogie']],
      'Articles du magasin': [['Catégorie *', 'Désignation *', 'Stock actuel'], ['Pièce', 'Fusible', 12]],
    }));
    const tableau = await screen.findByTestId('resume-import');
    expect(tableau.textContent).toContain('Équipements');
    expect(tableau.textContent).toContain('Articles du magasin');
    expect(screen.queryByTestId('erreurs-import')).toBeNull();
    expect(refreshAll).toHaveBeenCalled();                                  // données du serveur rafraîchies avant le contrôle

    fireEvent.click(screen.getByText(/4\. Importer \(3 éléments\)/));
    const conf = await screen.findByTestId('confirmation-import');
    expect(conf.textContent).toContain('créer 3');
    expect(api.importExcel).not.toHaveBeenCalled();                          // rien n'est envoyé avant confirmation
    fireEvent.click(screen.getByText("Confirmer l'import"));

    await screen.findByTestId('import-termine');
    expect(api.importExcel).toHaveBeenCalledTimes(1);
    const body = api.importExcel.mock.calls[0][0];
    expect(body.onConflict).toBe('skip');
    expect(body.collections.equipements.map((e) => e.id)).toEqual(['CFO.ALG.SST.01', 'MR.ORN.BOG.01']);
    expect(body.collections.pieces[0]).toMatchObject({ id: 'P-001', unit: '' });
    expect(api.nextCodes).toHaveBeenCalledWith('pieces', { unit: undefined, variant: 'P', count: 1 });
    expect(screen.getByTestId('import-termine').textContent).toContain('3 créé(s)');
    expect(refreshAll).toHaveBeenCalledTimes(2);                             // et à nouveau après l'import
  });

  it('fichier avec erreurs : erreurs précises, aucun bouton d\'import, rien d\'envoyé', async () => {
    render(<ImportDonnees refs={refs} />);
    charger(await fichier({ 'Équipements': [EQ, ['Paris', 'CFO', 'SST', 'A'], ['Alger', 'XXX', 'SST', 'B'], ['Alger', 'CFO', 'SST', 'Bon']] }));
    const erreurs = await screen.findByTestId('erreurs-import');
    expect(erreurs.textContent).toContain('2 erreurs à corriger');
    expect(erreurs.textContent).toContain('ligne 2');
    expect(erreurs.textContent).toContain('« Paris » n\'est pas une valeur autorisée');
    expect(erreurs.textContent).toContain('« XXX » inconnu');
    expect(screen.queryByText(/4\. Importer/)).toBeNull();
    expect(api.importExcel).not.toHaveBeenCalled();
  });

  it('même fichier déjà importé : « rien à importer », aucun bouton d\'import', async () => {
    const deja = { code: 'CFO.ALG.SST.01', system: 'CFO', subCode: 'SST', unit: 'Alger', nom: 'Transformateur', sousEquip: [] };
    render(<ImportDonnees refs={{ ...refs, equipements: [deja] }} />);
    charger(await fichier({ 'Équipements': [EQ, ['Alger', 'CFO', 'SST', 'Transformateur']] }));
    await screen.findByText(/Rien à importer/);
    expect(screen.queryByText(/4\. Importer/)).toBeNull();
  });

  it('le mode « mettre à jour » recalcule le contrôle sans recharger le fichier', async () => {
    const deja = { code: 'CFO.ALG.SST.01', system: 'CFO', subCode: 'SST', unit: 'Alger', nom: 'Transformateur', emplacement: '', sousEquip: [] };
    render(<ImportDonnees refs={{ ...refs, equipements: [deja] }} />);
    charger(await fichier({ 'Équipements': [[...EQ, 'Emplacement'], ['Alger', 'CFO', 'SST', 'Transformateur', 'Atelier B']] }));
    await screen.findByText(/Rien à importer/);
    fireEvent.click(screen.getByLabelText(/Ajouter et mettre à jour/));
    fireEvent.click(await screen.findByText(/4\. Importer \(1 élément\)/));
    expect((await screen.findByTestId('confirmation-import')).textContent).toContain('modifier 1');
  });

  it('refus du serveur : message clair, rien n\'est présenté comme importé', async () => {
    api.importExcel.mockRejectedValue(Object.assign(new Error('equipements : identifiant en double'), { status: 400 }));
    render(<ImportDonnees refs={refs} />);
    charger(await fichier({ 'Équipements': [EQ, ['Alger', 'CFO', 'SST', 'A']] }));
    fireEvent.click(await screen.findByText(/4\. Importer/));
    fireEvent.click(await screen.findByText("Confirmer l'import"));
    const alerte = await screen.findByRole('alert');
    expect(alerte.textContent).toContain('rien n\'a été importé');
    expect(screen.queryByTestId('import-termine')).toBeNull();
  });

  it('fichier non Excel ou illisible : message, pas de plantage', async () => {
    render(<ImportDonnees refs={refs} />);
    charger(new File(['a;b'], 'donnees.csv'));
    expect((await screen.findByRole('alert')).textContent).toContain('.xlsx');
    const faux = new File(['pas un classeur'], 'faux.xlsx'); faux.arrayBuffer = async () => new TextEncoder().encode('pas un classeur').buffer;
    charger(faux);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('classeur Excel'));
  });

  it('numérotation des articles impossible : rien n\'est envoyé', async () => {
    api.nextCodes.mockRejectedValue(Object.assign(new Error('x'), { network: true }));
    render(<ImportDonnees refs={refs} />);
    charger(await fichier({ 'Articles du magasin': [['Catégorie *', 'Désignation *'], ['Pièce', 'Fusible']] }));
    fireEvent.click(await screen.findByText(/4\. Importer/));
    fireEvent.click(await screen.findByText("Confirmer l'import"));
    await waitFor(() => expect(api.nextCodes).toHaveBeenCalled());
    expect(api.importExcel).not.toHaveBeenCalled();
  });
});
