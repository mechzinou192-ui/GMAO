import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

vi.mock('../api.js', () => ({
  api: {
    me: vi.fn(), login: vi.fn(), logout: vi.fn(), changePassword: vi.fn(),
    list: vi.fn(async () => ({ items: [], serverTime: '2026-10-04T10:00:00Z' })),
    save: vi.fn(async () => ({ version: 1 })), remove: vi.fn(), bulkImport: vi.fn(async () => ({ imported: 0 })),
    users: vi.fn(async () => ({ users: [] })), createUser: vi.fn(), updateUser: vi.fn(), deleteUser: vi.fn(),
  },
}));
import { api } from '../api.js';
import App from '../App.jsx';

const SA = { id: 'admin', nom: 'Super Administrateur', role: 'Super Admin', superAdmin: true, mustChangePw: false, droits: {} };
beforeEach(() => { cleanup(); vi.clearAllMocks(); });

describe('Application', () => {
  it('affiche la connexion sans session, puis appelle l’API', async () => {
    api.me.mockRejectedValue(Object.assign(new Error('x'), { status: 401 }));
    api.login.mockResolvedValue({ user: SA });
    render(<App />);
    await screen.findByText('Connexion à votre compte');
    const [id, pw] = document.querySelectorAll('input');
    fireEvent.change(id, { target: { value: 'admin' } });
    fireEvent.change(pw, { target: { value: 'Secret2026ok' } });
    fireEvent.click(screen.getByText('Se connecter'));
    await waitFor(() => expect(api.login).toHaveBeenCalledWith('admin', 'Secret2026ok', false));
  });

  it('exige le changement de mot de passe provisoire', async () => {
    api.me.mockResolvedValue({ user: { ...SA, mustChangePw: true } });
    render(<App />);
    await screen.findByText('Choisissez un nouveau mot de passe');
  });

  it('base vierge : tous les onglets s’affichent sans erreur (super admin)', async () => {
    api.me.mockResolvedValue({ user: SA });
    render(<App />);
    await waitFor(() => expect(document.querySelector('nav')).not.toBeNull(), { timeout: 5000 });
    // les référentiels par défaut sont initialisés sur le serveur par le super admin
    await waitFor(() => expect(api.bulkImport).toHaveBeenCalledWith('systemes', expect.arrayContaining([
      expect.objectContaining({ id: 'CFO', data: expect.objectContaining({ code: 'CFO', ordre: 0 }) })])));   // une ligne par système
    await waitFor(() => expect(api.bulkImport).toHaveBeenCalledWith('arborescence', expect.arrayContaining([
      expect.objectContaining({ id: 'CFO.SST' })])));                                                          // une ligne par sous-système
    const buttons = [...document.querySelectorAll('nav button')];
    expect(buttons.length).toBeGreaterThanOrEqual(7);
    for (const b of buttons) {
      fireEvent.click(b);
      expect(document.querySelector('nav')).not.toBeNull();   // pas de plantage (écran blanc)
    }
  });
});
