import { describe, it, expect, vi, beforeEach, afterEach, onTestFinished } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('../api.js', () => ({ api: { list: vi.fn(), save: vi.fn(), remove: vi.fn(), bulkImport: vi.fn() } }));
import { api } from '../api.js';
import { useSynced } from '../sync.js';
import { systemes, arborescence, feries } from '../referentiels.js';

const SYS = [['CFO', 'Courants Forts'], ['MR', 'Matériel Roulant'], ['VOIE', 'Voie ferrée']];
const TREE = { CFO: [{ code: 'SST', sub: 'Sous-Station' }, { code: 'LAC', sub: 'Caténaire' }], MR: [{ code: 'BOG', sub: 'Bogies' }], VOIE: [] };
const FER = [{ nom: 'Nouvel An', md: '01-01' }, { nom: 'Aïd', date: '2026-03-20' }, { nom: 'Aïd', date: '2026-03-21' }];
const rec = (id, data, version = 1) => ({ id, data, version, createdAt: '2026-01-01T00:00:00Z', deleted: false });

describe('adaptateurs de référentiels', () => {
  it('systèmes : aller-retour sans perte, ordre conservé', () => {
    const rows = systemes.toRows(SYS);
    expect(rows.map((r) => r.id)).toEqual(['CFO', 'MR', 'VOIE']);
    expect(systemes.fromRows([...rows].reverse().map((r) => r.data))).toEqual(SYS);
  });
  it('arborescence : aller-retour, y compris un système sans sous-système', () => {
    const rows = arborescence.toRows(TREE);
    expect(rows.map((r) => r.id)).toEqual(['CFO', 'CFO.SST', 'CFO.LAC', 'MR', 'MR.BOG', 'VOIE']);
    const back = arborescence.fromRows([...rows].reverse().map((r) => r.data));
    expect(back).toEqual(TREE);
    expect(Object.keys(back)).toEqual(['CFO', 'MR', 'VOIE']);
    expect(back.VOIE).toEqual([]);
  });
  it('jours fériés : aller-retour, doublons exacts conservés avec un id distinct', () => {
    const rows = feries.toRows([...FER, { nom: 'Aïd bis', date: '2026-03-20' }]);
    expect(rows.map((r) => r.id)).toEqual(['md:01-01', 'date:2026-03-20', 'date:2026-03-21', 'date:2026-03-20~2']);
    const back = feries.fromRows(rows.map((r) => r.data));
    expect(back).toHaveLength(4);
    expect(feries.toRows(back).map((r) => r.id).sort()).toEqual(rows.map((r) => r.id).sort());   // ids stables
  });
  it('les ids sont stables : même valeur, mêmes lignes', () => {
    expect(arborescence.toRows(TREE)).toEqual(arborescence.toRows(JSON.parse(JSON.stringify(TREE))));
  });
});

describe('useSynced — référentiel stocké une ligne par élément', () => {
  beforeEach(() => { vi.resetAllMocks(); api.save.mockImplementation(async (c, id, p) => ({ id, version: (p.version || 0) + 1 })); api.remove.mockResolvedValue({ ok: true }); });
  afterEach(() => vi.useRealTimers());

  const charger = async (opts = {}) => {
    api.list.mockResolvedValue({ items: systemes.toRows(SYS).map((r) => rec(r.id, r.data)), serverTime: '2026-10-05T10:00:00Z' });
    const h = renderHook(() => useSynced('systemes', { defaults: [['X', 'défaut']], ...opts }));
    await waitFor(() => expect(h.result.current[2]).toBe('ready'));
    return h;
  };

  it('reconstitue la liste depuis les lignes du serveur', async () => {
    const { result } = await charger();
    expect(result.current[0]).toEqual(SYS);
  });

  it('ajouter un système n\'enregistre QUE la nouvelle ligne', async () => {
    const { result } = await charger();
    act(() => result.current[1]((s) => [...s, ['ELM', 'Électromécanique']]));
    await waitFor(() => expect(api.save).toHaveBeenCalledTimes(1));
    expect(api.save.mock.calls[0][0]).toBe('systemes');
    expect(api.save.mock.calls[0][1]).toBe('ELM');
    expect(api.save.mock.calls[0][2]).toMatchObject({ unit: '', system: null, data: { code: 'ELM', nom: 'Électromécanique', ordre: 3 } });
    expect(api.save.mock.calls[0][2].version).toBeUndefined();         // création
  });

  it('renommer un système n\'enregistre que celui-là, avec sa version', async () => {
    const { result } = await charger();
    act(() => result.current[1]((s) => s.map(([c, n]) => (c === 'MR' ? [c, 'Matériel roulant'] : [c, n]))));
    await waitFor(() => expect(api.save).toHaveBeenCalledTimes(1));
    expect(api.save.mock.calls[0][1]).toBe('MR');
    expect(api.save.mock.calls[0][2]).toMatchObject({ data: { nom: 'Matériel roulant' }, version: 1 });
  });

  it('supprimer un système supprime sa ligne', async () => {
    const { result } = await charger();
    act(() => result.current[1]((s) => s.filter(([c]) => c !== 'VOIE')));
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith('systemes', 'VOIE'));
    expect(api.save).not.toHaveBeenCalled();
  });

  it('arborescence : ajouter un sous-système n\'enregistre que ce sous-système', async () => {
    api.list.mockResolvedValue({ items: arborescence.toRows(TREE).map((r) => rec(r.id, r.data)), serverTime: 't' });
    const { result } = renderHook(() => useSynced('arborescence', { defaults: {} }));
    await waitFor(() => expect(result.current[2]).toBe('ready'));
    expect(result.current[0]).toEqual(TREE);
    act(() => result.current[1]((t) => ({ ...t, CFO: [...t.CFO, { code: 'ECL', sub: 'Éclairage' }] })));
    await waitFor(() => expect(api.save).toHaveBeenCalledTimes(1));
    expect(api.save.mock.calls[0][1]).toBe('CFO.ECL');
    act(() => result.current[1]((t) => ({ ...t, NEUF: [] })));              // nouveau système vide : ligne d'en-tête
    await waitFor(() => expect(api.save).toHaveBeenCalledTimes(2));
    expect(api.save.mock.calls[1][1]).toBe('NEUF');
  });

  it('deux administrateurs, deux éléments différents : aucune perte (le poll fusionne les lignes de l\'autre)', async () => {
    const espion = vi.spyOn(globalThis, 'setInterval');
    onTestFinished(() => espion.mockRestore());
    const { result } = await charger();
    const poll = espion.mock.calls.find((c) => c[1] === 15000)[0];
    // nous ajoutons « BO » ; pendant ce temps l'autre administrateur ajoute « ELM » et renomme « MR »
    act(() => result.current[1]((s) => [...s, ['BO', 'Bâtiment']]));
    await waitFor(() => expect(api.save).toHaveBeenCalledTimes(1));
    api.list.mockResolvedValue({ items: [
      rec('ELM', { code: 'ELM', nom: 'Électromécanique', ordre: 4 }, 1),
      rec('MR', { code: 'MR', nom: 'Matériel roulant', ordre: 1 }, 2),
    ], serverTime: '2026-10-05T10:00:15Z' });
    await act(async () => { await poll(); });
    const codes = result.current[0].map(([c]) => c);
    expect(codes).toEqual(['CFO', 'MR', 'VOIE', 'BO', 'ELM']);                    // notre ajout est conservé
    expect(result.current[0].find(([c]) => c === 'MR')[1]).toBe('Matériel roulant');   // le renommage de l'autre est appliqué
    // une suppression faite par l'autre administrateur est appliquée aussi
    api.list.mockResolvedValue({ items: [{ id: 'VOIE', data: {}, version: 2, deleted: true }], serverTime: '2026-10-05T10:00:30Z' });
    await act(async () => { await poll(); });

    expect(result.current[0].map(([c]) => c)).toEqual(['CFO', 'MR', 'BO', 'ELM']);
  });

  it('serveur vierge : le super administrateur crée les lignes par défaut (une par élément)', async () => {
    api.list.mockResolvedValueOnce({ items: [], serverTime: 't' })
      .mockResolvedValueOnce({ items: systemes.toRows([['X', 'défaut']]).map((r) => rec(r.id, r.data)), serverTime: 't2' });
    api.bulkImport.mockResolvedValue({ imported: 1 });
    const { result } = renderHook(() => useSynced('systemes', { defaults: [['X', 'défaut']], sa: true }));
    await waitFor(() => expect(result.current[2]).toBe('ready'));
    expect(api.bulkImport).toHaveBeenCalledWith('systemes', [{ id: 'X', data: { code: 'X', nom: 'défaut', ordre: 0 } }]);
    expect(result.current[0]).toEqual([['X', 'défaut']]);
  });

  it('serveur vierge et utilisateur non administrateur : valeurs par défaut, rien n\'est écrit', async () => {
    api.list.mockResolvedValue({ items: [], serverTime: 't' });
    const { result } = renderHook(() => useSynced('systemes', { defaults: [['X', 'défaut']], sa: false }));
    await waitFor(() => expect(result.current[2]).toBe('ready'));
    expect(result.current[0]).toEqual([['X', 'défaut']]);
    expect(api.bulkImport).not.toHaveBeenCalled();
  });
});
