import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';

const rec = (id, data) => ({ id, data, version: 1, deleted: false, createdAt: '2026-10-01T08:00:00Z', updatedAt: '2026-10-01T08:00:00Z' });
const EQ = { code: 'CFO.ALG.SST.01', unit: 'Alger', system: 'CFO', subCode: 'SST', nom: 'Transformateur T1', emplacement: 'Poste HT', sousEquip: [] };
const DI = { code: 'DI-ALG-2026-0001', eq: EQ.code, nom: EQ.nom, etat: 'À Transmettre', designation: 'Fuite d\'huile', dateCreation: '2026-10-05', dateEvt: '2026-10-05 08:00' };
const OT = { code: 'OT-ALG-2026-0001', di: DI.code, eq: EQ.code, nom: EQ.nom, etat: 'En cours', type: 'Corrective', consigne: 'Contrôler la fuite', horaire: 'Jour', consignation: 'Non', taches: [{ lib: 'Inspection' }], intervenants: [], pieces: [], outillage: [], consommables: [] };
const DATA = { equipements: [EQ], dis: [DI], bts: [OT] };

vi.mock('../api.js', () => ({
  api: { me: vi.fn(), login: vi.fn(), logout: vi.fn(), changePassword: vi.fn(), list: vi.fn(), save: vi.fn(async () => ({ version: 1 })), remove: vi.fn(), bulkImport: vi.fn(async () => ({})), nextCodes: vi.fn(), listFiles: vi.fn(async () => []), fileUrl: (id) => '/api/files/' + id, users: vi.fn(async () => ({ users: [] })) },
}));
import { api } from '../api.js';
import App from '../App.jsx';

const SA = { id: 'admin', nom: 'Super Administrateur', role: 'Super Admin', superAdmin: true, mustChangePw: false, droits: {} };
const largeur = (w) => Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: w });

beforeEach(() => {
  cleanup(); vi.clearAllMocks(); window.HTMLElement.prototype.scrollIntoView = vi.fn();
  api.me.mockResolvedValue({ user: SA });
  api.list.mockImplementation(async (name) => ({ items: (DATA[name] || []).map((d) => rec(d.code, d)), serverTime: '2026-10-06T10:00:00Z' }));
});
afterEach(() => largeur(1024));

describe('Affichage sur téléphone', () => {
  it('ordinateur : menu latéral visible dès le départ', async () => {
    largeur(1280); render(<App />);
    await screen.findByTestId('menu-lateral');
  });

  it('téléphone : menu fermé au démarrage, ouverture par le bouton, fermeture par le fond ou le choix d\'un écran', async () => {
    largeur(375); render(<App />);
    const bouton = await screen.findByTestId('menu-bouton');
    expect(screen.queryByTestId('menu-lateral')).toBeNull();                       // le contenu a toute la largeur
    fireEvent.click(bouton);
    const menu = await screen.findByTestId('menu-lateral');
    expect(menu.className).toContain('fixed'); expect(screen.getByTestId('menu-fond')).toBeTruthy();   // tiroir au-dessus du contenu
    fireEvent.click(screen.getByTestId('menu-fond'));
    expect(screen.queryByTestId('menu-lateral')).toBeNull();
    fireEvent.click(bouton);
    fireEvent.click(within(await screen.findByTestId('menu-lateral')).getByText('Maintenance corrective'));
    expect(screen.queryByTestId('menu-lateral')).toBeNull();                       // se referme après le choix
    await screen.findByTestId('di-cartes');
  });

  it('DI : une carte par demande (code, équipement, désignation, état, action)', async () => {
    largeur(375); render(<App />);
    fireEvent.click(await screen.findByTestId('menu-bouton'));
    fireEvent.click(within(await screen.findByTestId('menu-lateral')).getByText('Maintenance corrective'));
    const cartes = await screen.findByTestId('di-cartes');
    await waitFor(() => expect(cartes.textContent).toContain(DI.code));
    expect(cartes.textContent).toContain('Transformateur T1'); expect(cartes.textContent).toContain("Fuite d'huile"); expect(cartes.textContent).toContain('Générer OT');
  });

  it('OT : une carte par bon, ouverture du détail au toucher, impression disponible', async () => {
    largeur(375); render(<App />);
    fireEvent.click(await screen.findByTestId('menu-bouton'));
    fireEvent.click(within(await screen.findByTestId('menu-lateral')).getByText('Maintenance corrective')); fireEvent.click(await screen.findByText('OT correctifs'));
    const cartes = await screen.findByTestId('bt-cartes');
    await waitFor(() => expect(cartes.textContent).toContain(OT.code));
    expect(cartes.textContent).toContain('Contrôler la fuite');
    fireEvent.click(within(cartes).getByText(OT.code));
    const imprimer = await screen.findByTestId('bt-imprimer');
    const w = { document: { open: vi.fn(), write: vi.fn(), close: vi.fn() }, focus: vi.fn(), print: vi.fn() };
    const ouvrir = vi.spyOn(window, 'open').mockReturnValue(w);
    fireEvent.click(imprimer);
    expect(ouvrir).toHaveBeenCalled();
    const html = w.document.write.mock.calls[0][0];
    expect(html).toContain('BON DE TRAVAIL'); expect(html).toContain(OT.code); expect(html).toContain('Poste HT');   // emplacement repris de l'équipement
    expect(html).toContain('Inspection'); expect(html).toContain('<!DOCTYPE html>');
  });
});
