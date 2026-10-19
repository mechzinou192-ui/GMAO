import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('../api.js', () => ({ api: { list: vi.fn(), save: vi.fn(), remove: vi.fn(), bulkImport: vi.fn() } }));
import { api } from '../api.js';
import { useSynced } from '../sync.js';

const rec = (id, data, version = 1, createdAt = '2026-01-01T00:00:00Z') => ({ id, data, version, createdAt, deleted: false });
beforeEach(() => { vi.resetAllMocks(); });

describe('useSynced', () => {
  it('charge, crée, modifie et supprime en enregistrant chaque changement', async () => {
    api.list.mockResolvedValue({ items: [rec('A', { code: 'A', n: 1 })], serverTime: '2026-01-01T00:00:00Z' });
    api.save.mockImplementation(async (c, id, p) => ({ id, version: (p.version || 0) + 1 }));
    api.remove.mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useSynced('pieces'));
    await waitFor(() => expect(result.current[2]).toBe('ready'));
    expect(result.current[0]).toEqual([{ code: 'A', n: 1 }]);

    act(() => result.current[1](l => [...l, { code: 'B', n: 2 }]));          // création
    await waitFor(() => expect(api.save).toHaveBeenCalledTimes(1));
    expect(api.save.mock.calls[0][1]).toBe('B');
    expect(api.save.mock.calls[0][2].version).toBeUndefined();

    act(() => result.current[1](l => l.map(x => x.code === 'A' ? { ...x, n: 9 } : x)));  // modification
    await waitFor(() => expect(api.save).toHaveBeenCalledTimes(2));
    expect(api.save.mock.calls[1][2]).toMatchObject({ data: { code: 'A', n: 9 }, version: 1 });

    act(() => result.current[1](l => l.filter(x => x.code !== 'B')));          // suppression
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith('pieces', 'B'));
  });

  it("n'enregistre pas ce qui n'a pas changé", async () => {
    api.list.mockResolvedValue({ items: [rec('A', { code: 'A' })], serverTime: 't' });
    const { result } = renderHook(() => useSynced('pieces'));
    await waitFor(() => expect(result.current[2]).toBe('ready'));
    act(() => result.current[1](l => l.map(x => ({ ...x }))));
    await new Promise(r => setTimeout(r, 600));
    expect(api.save).not.toHaveBeenCalled();
  });

  it('DI/OT : unité et système déduits de la fonction meta', async () => {
    api.list.mockResolvedValue({ items: [], serverTime: 't' });
    api.save.mockResolvedValue({ version: 1 });
    const { result } = renderHook(() => useSynced('dis', { meta: d => ({ unit: 'Oran', system: 'CFO:' + d.eq }) }));
    await waitFor(() => expect(result.current[2]).toBe('ready'));
    act(() => result.current[1](l => [{ code: 'DI-1', eq: 'X' }, ...l]));
    await waitFor(() => expect(api.save).toHaveBeenCalled());
    expect(api.save.mock.calls[0][2]).toMatchObject({ unit: 'Oran', system: 'CFO:X' });
  });

  it('conflit serveur : message + rechargement (le serveur fait foi)', async () => {
    const errs = []; window.addEventListener('gmao:error', e => errs.push(e.detail));
    api.list.mockResolvedValue({ items: [rec('A', { code: 'A', n: 1 })], serverTime: 't' });
    api.save.mockRejectedValue(Object.assign(new Error('x'), { status: 409, code: 'CONFLICT' }));
    const { result } = renderHook(() => useSynced('pieces'));
    await waitFor(() => expect(result.current[2]).toBe('ready'));
    api.list.mockResolvedValue({ items: [rec('A', { code: 'A', n: 5 }, 2)], serverTime: 't2' });
    act(() => result.current[1](l => l.map(x => ({ ...x, n: 99 }))));
    await waitFor(() => expect(errs.length).toBe(1));
    expect(errs[0]).toMatch(/modifié par un autre utilisateur/);
    await waitFor(() => expect(result.current[0][0].n).toBe(5));
  });

  it('référentiel (systèmes) : défauts si serveur vierge, le super admin crée une ligne par système', async () => {
    api.list.mockResolvedValueOnce({ items: [], serverTime: 't' })
            .mockResolvedValue({ items: [{ id: 'CFO', data: { code: 'CFO', nom: 'Courants Forts', ordre: 0 }, version: 1, createdAt: 'x' }], serverTime: 't' });
    api.bulkImport.mockResolvedValue({ imported: 1 });
    const { result } = renderHook(() => useSynced('systemes', { defaults: [['CFO', 'Courants Forts']], sa: true }));
    await waitFor(() => expect(result.current[2]).toBe('ready'));
    expect(api.bulkImport).toHaveBeenCalledWith('systemes', [{ id: 'CFO', data: { code: 'CFO', nom: 'Courants Forts', ordre: 0 } }]);
    expect(result.current[0]).toEqual([['CFO', 'Courants Forts']]);
  });
});
