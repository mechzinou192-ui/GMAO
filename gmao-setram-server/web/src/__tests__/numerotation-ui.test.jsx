import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

const EQ = { code: 'CFO.ALG.SLT.01', unit: 'Alger', system: 'CFO', subCode: 'SLT', nom: 'Transformateur T1', emplacement: 'Poste HT', sousEquip: [] };
const rec = (id, data) => ({ id, data, version: 1, deleted: false, createdAt: '2026-10-01T08:00:00Z', updatedAt: '2026-10-01T08:00:00Z' });

vi.mock('../api.js', () => ({
  api: {
    me: vi.fn(), login: vi.fn(), logout: vi.fn(), changePassword: vi.fn(),
    list: vi.fn(),
    save: vi.fn(async () => ({ version: 1 })), remove: vi.fn(), bulkImport: vi.fn(async () => ({ imported: 0 })),
    nextCodes: vi.fn(),
    users: vi.fn(async () => ({ users: [] })), createUser: vi.fn(), updateUser: vi.fn(), deleteUser: vi.fn(),
  },
}));
import { api } from '../api.js';
import App from '../App.jsx';

const SA = { id: 'admin', nom: 'Super Administrateur', role: 'Super Admin', superAdmin: true, mustChangePw: false, droits: {} };

beforeEach(() => {
  cleanup(); vi.clearAllMocks();
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  api.me.mockResolvedValue({ user: SA });
  api.list.mockImplementation(async (name) => ({
    items: name === 'equipements' ? [rec(EQ.code, EQ)] : [],
    serverTime: '2026-10-04T10:00:00Z',
  }));
});

async function ouvrirFormulaireDI() {
  render(<App />);
  fireEvent.click(await screen.findByText('Demandes (DI)', { selector: 'nav button' }));
  fireEvent.click(await screen.findByText('Nouvelle DI'));
  const select = await waitFor(() => {
    const s = [...document.querySelectorAll('select')].find((x) => [...x.options].some((o) => o.value === EQ.code));
    if (!s) throw new Error('liste des équipements absente');
    return s;
  });
  fireEvent.change(select, { target: { value: EQ.code } });
}

describe('Création d’une DI : le numéro vient du serveur', () => {
  it('utilise le numéro attribué par le serveur (unité de l’équipement) et l’enregistre', async () => {
    api.nextCodes.mockResolvedValue(['DI-ALG-2026-0042']);
    await ouvrirFormulaireDI();
    fireEvent.click(screen.getByText('Créer la DI'));
    await waitFor(() => expect(api.nextCodes).toHaveBeenCalledWith('dis', { unit: 'Alger', variant: undefined, count: 1 }));
    expect((await screen.findAllByText('DI-ALG-2026-0042')).length).toBeGreaterThan(0);   // carte (téléphone) + tableau (ordinateur)
    await waitFor(() => expect(api.save).toHaveBeenCalledWith('dis', 'DI-ALG-2026-0042',
      expect.objectContaining({ unit: 'Alger', system: 'CFO', data: expect.objectContaining({ code: 'DI-ALG-2026-0042', eq: EQ.code }) })));
  });

  it('numérotation impossible : aucune DI n’est créée et un message s’affiche', async () => {
    api.nextCodes.mockRejectedValue(Object.assign(new Error('Serveur injoignable.'), { network: true }));
    await ouvrirFormulaireDI();
    fireEvent.click(screen.getByText('Créer la DI'));
    await screen.findByText(/n'a pas été créé/);
    expect(api.save).not.toHaveBeenCalledWith('dis', expect.anything(), expect.anything());
  });

  it('double clic : une seule DI, un seul numéro réservé', async () => {
    let fin;
    api.nextCodes.mockImplementation(() => new Promise((r) => { fin = () => r(['DI-ALG-2026-0007']); }));
    await ouvrirFormulaireDI();
    const bouton = screen.getByText('Créer la DI');
    fireEvent.click(bouton); fireEvent.click(bouton); fireEvent.click(bouton);
    await waitFor(() => expect(api.nextCodes).toHaveBeenCalledTimes(1));
    fin();
    expect((await screen.findAllByText('DI-ALG-2026-0007')).length).toBeGreaterThan(0);   // carte (téléphone) + tableau (ordinateur)
    expect(api.nextCodes).toHaveBeenCalledTimes(1);
  });
});
