import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

vi.mock('../api.js', () => ({
  api: {
    me: vi.fn(), login: vi.fn(), logout: vi.fn(), changePassword: vi.fn(),
    list: vi.fn(async () => ({ items: [], serverTime: '2026-10-04T10:00:00Z' })),
    save: vi.fn(async () => ({ version: 1 })), remove: vi.fn(), bulkImport: vi.fn(async () => ({ imported: 0 })),
    users: vi.fn(async () => ({ users: [] })), createUser: vi.fn(async () => ({ user: {} })), updateUser: vi.fn(), deleteUser: vi.fn(),
  },
}));
import { api } from '../api.js';
import App from '../App.jsx';

const SA = { id: 'admin', nom: 'Super Administrateur', role: 'Super Admin', superAdmin: true, mustChangePw: false, droits: {} };
beforeEach(() => { cleanup(); vi.clearAllMocks(); window.HTMLElement.prototype.scrollIntoView = vi.fn(); });

async function openNewUser() {
  api.me.mockResolvedValue({ user: SA });
  render(<App />);
  fireEvent.click(await screen.findByText('Administration', { selector: 'nav button' }));
  fireEvent.click(await screen.findByText('+ Nouvel utilisateur'));
  const [nom, ident, pw] = await waitFor(() => {
    const i = [...document.querySelectorAll('input')].filter(x => x.type !== 'checkbox' && !x.disabled);
    const f = i.slice(-3); if (f.length < 3) throw new Error('form'); return f;
  });
  return { nom, ident, pw };
}

describe('Création de compte', () => {
  it('mot de passe trop court : message visible, rien envoyé', async () => {
    const { nom, ident, pw } = await openNewUser();
    fireEvent.change(nom, { target: { value: 'Karim Belaïd' } });
    fireEvent.change(ident, { target: { value: 'k.belaid' } });
    fireEvent.change(pw, { target: { value: '1234' } });
    fireEvent.click(screen.getByText('Enregistrer'));
    await screen.findByText(/⚠ Mot de passe : 10 caractères minimum/);
    expect(api.createUser).not.toHaveBeenCalled();
  });

  it('identifiant avec espace/accent/majuscule : normalisé automatiquement', async () => {
    const { nom, ident, pw } = await openNewUser();
    fireEvent.change(nom, { target: { value: 'Karim Belaïd' } });
    fireEvent.change(ident, { target: { value: 'Karim Belaïd' } });
    await screen.findByText('karim.belaid');
    fireEvent.change(pw, { target: { value: 'Technicien2026' } });
    fireEvent.click(screen.getByText('Enregistrer'));
    await waitFor(() => expect(api.createUser).toHaveBeenCalled());
    expect(api.createUser.mock.calls[0][0]).toMatchObject({ id: 'karim.belaid', nom: 'Karim Belaïd', password: 'Technicien2026' });
  });

  it('erreur du serveur affichée clairement', async () => {
    api.createUser.mockRejectedValueOnce(new Error('Cet identifiant existe déjà.'));
    const { nom, ident, pw } = await openNewUser();
    fireEvent.change(nom, { target: { value: 'Test' } });
    fireEvent.change(ident, { target: { value: 'admin' } });
    fireEvent.change(pw, { target: { value: 'Technicien2026' } });
    fireEvent.click(screen.getByText('Enregistrer'));
    await screen.findByText(/Cet identifiant existe déjà/);
  });
});
