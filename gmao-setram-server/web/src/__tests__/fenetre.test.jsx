import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { horsFenetre, lireFenetre } from '../../../server/src/archives-core.js';

vi.mock('../api.js', () => ({ api: { list: vi.fn(), save: vi.fn(), remove: vi.fn(), bulkImport: vi.fn() } }));
import { api } from '../api.js';
import { useSynced, chargerHistorique, historiqueCharge, FENETRE_MOIS } from '../sync.js';

beforeEach(() => { vi.resetAllMocks(); });

describe('fenêtre de chargement', () => {
  it('règle : seuls les DI / OT clos et non modifiés depuis N mois sont laissés de côté', () => {
    const now = new Date('2026-10-19T00:00:00Z');
    expect(horsFenetre('bts', { etat: 'Clôturé' }, '2024-01-01T00:00:00Z', 24, now)).toBe(true);
    expect(horsFenetre('bts', { etat: 'En cours' }, '2020-01-01T00:00:00Z', 24, now)).toBe(false);   // ouvert : toujours chargé
    expect(horsFenetre('bts', { etat: 'Clôturé' }, '2025-06-01T00:00:00Z', 24, now)).toBe(false);   // récent
    expect(horsFenetre('dis', { etat: 'Traité' }, '2023-01-01T00:00:00Z', 24, now)).toBe(true);
    expect(horsFenetre('pieces', { etat: 'Clôturé' }, '2000-01-01T00:00:00Z', 24, now)).toBe(false); // collection non concernée
    expect(lireFenetre(undefined)).toBeNull(); expect(lireFenetre('24')).toBe(24); expect(lireFenetre('1')).toBeNaN(); expect(lireFenetre('x')).toBeNaN();
  });

  it('DI et OT chargés avec la fenêtre, les autres collections sans ; historique complet sur demande', async () => {
    api.list.mockResolvedValue({ items: [], serverTime: 't' });
    const ot = renderHook(() => useSynced('bts'));
    const pc = renderHook(() => useSynced('pieces'));
    await waitFor(() => expect(ot.result.current[2]).toBe('ready'));
    await waitFor(() => expect(pc.result.current[2]).toBe('ready'));
    expect(api.list).toHaveBeenCalledWith('bts', undefined, { fenetre: FENETRE_MOIS });
    expect(api.list).toHaveBeenCalledWith('pieces', undefined, undefined);
    expect(historiqueCharge()).toBe(false);
    api.list.mockClear();
    await act(async () => { await chargerHistorique(); });
    expect(historiqueCharge()).toBe(true);
    expect(api.list).toHaveBeenCalledWith('bts', undefined, undefined);                // tout l'historique
    expect(api.list.mock.calls.some((c) => c[0] === 'pieces')).toBe(false);           // non concernée : pas rechargée
    ot.unmount(); pc.unmount();
  });
});
