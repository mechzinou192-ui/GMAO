import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

vi.mock('../api.js', () => ({ api: { listFiles: vi.fn(), uploadFile: vi.fn(), deleteFile: vi.fn(), fileUrl: (id) => `/api/files/${id}` } }));
vi.mock('../sync.js', () => ({ flushAll: vi.fn(async () => {}) }));
vi.mock('../photo.js', async (orig) => ({ ...(await orig()), reduirePhoto: vi.fn(async (f) => new Blob(['reduit-' + f.name], { type: 'image/jpeg' })) }));
import { api } from '../api.js';
import { flushAll } from '../sync.js';
import { reduirePhoto, dimensionsReduites } from '../photo.js';
import PiecesJointes from '../PiecesJointes.jsx';

const PH = (id, name = 'p.jpg') => ({ id, name, mime: 'image/jpeg', size: 1000, uploadedBy: 'admin', createdAt: '2026-10-06T10:00:00Z' });
const choisir = (label, files) => fireEvent.change(screen.getByLabelText(label), { target: { files } });
beforeEach(() => { cleanup(); vi.clearAllMocks(); api.listFiles.mockResolvedValue([]); });

describe('réduction des photos', () => {
  it('conserve les proportions et ne agrandit jamais', () => {
    expect(dimensionsReduites(4000, 3000)).toEqual({ w: 1600, h: 1200 });
    expect(dimensionsReduites(3000, 4000)).toEqual({ w: 1200, h: 1600 });
    expect(dimensionsReduites(800, 600)).toEqual({ w: 800, h: 600 });
    expect(dimensionsReduites(10000, 1)).toEqual({ w: 1600, h: 1 });
    expect(() => dimensionsReduites(0, 10)).toThrow(/illisible/);
  });
});

describe('PiecesJointes', () => {
  it('liste les photos de l\'élément avec leur miniature', async () => {
    api.listFiles.mockResolvedValue([PH('a1', 'fuite.jpg'), PH('b2')]);
    render(<PiecesJointes collection="dis" recordId="DI-1" />);
    await waitFor(() => expect(screen.getAllByTestId('photo')).toHaveLength(2));
    expect(api.listFiles).toHaveBeenCalledWith('dis', 'DI-1');
    expect(screen.getByAltText('fuite.jpg').getAttribute('src')).toBe('/api/files/a1');
    expect(screen.getByText('Photos (2)')).toBeTruthy();
  });
  it('aucune photo : message', async () => {
    render(<PiecesJointes collection="bts" recordId="OT-1" />);
    await screen.findByText('Aucune photo.');
  });
  it('ajout : enregistre d\'abord l\'élément, réduit la photo, l\'envoie, puis recharge la liste', async () => {
    api.listFiles.mockResolvedValueOnce([]).mockResolvedValue([PH('n1', 'terrain.jpg')]);
    api.uploadFile.mockResolvedValue(PH('n1', 'terrain.jpg'));
    render(<PiecesJointes collection="bts" recordId="OT-1" />);
    await screen.findByText('Aucune photo.');
    const f = new File(['x'], 'IMG_0042.heic', { type: 'image/heic' });
    choisir('Prendre une photo', [f]);
    await waitFor(() => expect(api.uploadFile).toHaveBeenCalledTimes(1));
    expect(flushAll).toHaveBeenCalled();
    expect(reduirePhoto).toHaveBeenCalledWith(f);
    const [col, id, blob, nom] = api.uploadFile.mock.calls[0];
    expect([col, id, nom, blob.type]).toEqual(['bts', 'OT-1', 'IMG_0042.jpg', 'image/jpeg']);   // toujours envoyée en JPEG réduit
    await waitFor(() => expect(screen.getAllByTestId('photo')).toHaveLength(1));
  });
  it('plusieurs images choisies d\'un coup : toutes envoyées', async () => {
    api.uploadFile.mockResolvedValue(PH('x'));
    render(<PiecesJointes collection="dis" recordId="DI-1" />);
    await screen.findByText('Aucune photo.');
    choisir('Choisir des images', [new File(['1'], 'a.png', { type: 'image/png' }), new File(['2'], 'b.png', { type: 'image/png' })]);
    await waitFor(() => expect(api.uploadFile).toHaveBeenCalledTimes(2));
  });
  it('erreurs : message clair (droits, réseau, image illisible), rien de planté', async () => {
    render(<PiecesJointes collection="dis" recordId="DI-1" />);
    await screen.findByText('Aucune photo.');
    api.uploadFile.mockRejectedValueOnce(Object.assign(new Error("Vous n'avez pas le droit d'ajouter une pièce jointe ici."), { status: 403 }));
    choisir('Choisir des images', [new File(['x'], 'a.jpg', { type: 'image/jpeg' })]);
    expect((await screen.findByRole('alert')).textContent).toContain("pas le droit");
    api.uploadFile.mockRejectedValueOnce(Object.assign(new Error('Serveur injoignable.'), { network: true }));
    choisir('Choisir des images', [new File(['x'], 'a.jpg', { type: 'image/jpeg' })]);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain("n'a pas été envoyée"));
    reduirePhoto.mockRejectedValueOnce(new Error("Cette image n'a pas pu être lue (format non pris en charge par ce navigateur)."));
    choisir('Choisir des images', [new File(['x'], 'a.heic', { type: 'image/heic' })]);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('format non pris en charge'));
  });
  it('suppression : confirmation puis suppression', async () => {
    api.listFiles.mockResolvedValueOnce([PH('a1', 'fuite.jpg')]).mockResolvedValue([]);
    api.deleteFile.mockResolvedValue({ ok: true });
    render(<PiecesJointes collection="dis" recordId="DI-1" />);
    fireEvent.click(await screen.findByLabelText('Supprimer fuite.jpg'));
    expect(api.deleteFile).not.toHaveBeenCalled();               // pas de suppression sur un simple toucher
    fireEvent.click(screen.getByText('Supprimer'));
    await waitFor(() => expect(api.deleteFile).toHaveBeenCalledWith('a1'));
    await screen.findByText('Aucune photo.');
  });
  it('lecture seule : aucune action d\'ajout ni de suppression', async () => {
    api.listFiles.mockResolvedValue([PH('a1', 'fuite.jpg')]);
    render(<PiecesJointes collection="dis" recordId="DI-1" lectureSeule />);
    await screen.findByTestId('photo');
    expect(screen.queryByLabelText('Prendre une photo')).toBeNull(); expect(screen.queryByLabelText('Supprimer fuite.jpg')).toBeNull();
  });
});
