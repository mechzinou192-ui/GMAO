import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api.js', () => ({ api: { nextCodes: vi.fn() } }));
import { api } from '../api.js';
import { reserverNumeros, messageNumerotation } from '../numbering.js';

beforeEach(() => vi.clearAllMocks());

describe('réservation de numéros auprès du serveur', () => {
  it('demande un numéro et le retourne tel que le serveur l’a attribué', async () => {
    api.nextCodes.mockResolvedValue(['DI-ALG-2026-0042']);
    const r = await reserverNumeros('dis', { unit: 'Alger' });
    expect(r).toEqual(['DI-ALG-2026-0042']);
    expect(api.nextCodes).toHaveBeenCalledWith('dis', { unit: 'Alger', variant: undefined, count: 1 });
  });

  it('transmet la variante (BT préventif, type d’article)', async () => {
    api.nextCodes.mockResolvedValue(['BT-PREV-ORN-2026-0001', 'BT-PREV-ORN-2026-0002']);
    await reserverNumeros('bts', { unit: 'Oran', variant: 'prev', count: 2 });
    expect(api.nextCodes).toHaveBeenCalledWith('bts', { unit: 'Oran', variant: 'prev', count: 2 });
  });

  it('découpe les très gros lots (le serveur accepte 200 numéros par demande)', async () => {
    let n = 0;
    api.nextCodes.mockImplementation(async (_c, { count }) => Array.from({ length: count }, () => 'BT-' + ++n));
    const r = await reserverNumeros('bts', { unit: 'Alger', count: 450 });
    expect(r).toHaveLength(450);
    expect(new Set(r).size).toBe(450);
    expect(api.nextCodes.mock.calls.map((c) => c[1].count)).toEqual([200, 200, 50]);
  });

  it('serveur injoignable : retourne null et prévient l’utilisateur (rien ne doit être créé)', async () => {
    api.nextCodes.mockRejectedValue(Object.assign(new Error('Serveur injoignable.'), { network: true }));
    const messages = [];
    window.addEventListener('gmao:error', (e) => messages.push(e.detail), { once: true });
    expect(await reserverNumeros('dis', { unit: 'Alger' })).toBeNull();
    expect(messages[0]).toContain("n'a pas été créé");
  });

  it('refus du serveur (droits) : retourne null avec le motif', async () => {
    api.nextCodes.mockRejectedValue(Object.assign(new Error("Vous n'avez pas le droit de créer ces données."), { status: 403 }));
    const messages = [];
    window.addEventListener('gmao:error', (e) => messages.push(e.detail), { once: true });
    expect(await reserverNumeros('bts', { unit: 'Oran' })).toBeNull();
    expect(messages[0]).toContain('Numérotation refusée');
    expect(messageNumerotation(new Error('x'))).toContain('x');
  });

  it('un échec au milieu d’un lot ne renvoie aucun numéro partiel', async () => {
    api.nextCodes.mockResolvedValueOnce(Array(200).fill('A')).mockRejectedValueOnce(new Error('boom'));
    expect(await reserverNumeros('bts', { unit: 'Alger', count: 300 })).toBeNull();
  });
});
