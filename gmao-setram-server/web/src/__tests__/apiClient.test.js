import { describe, it, expect, vi, afterEach } from 'vitest';
import { api } from '../api.js';

const reponse = (status, body, headers = {}) => ({ ok: status < 400, status, json: async () => body, headers: { get: (k) => headers[k.toLowerCase()] ?? null } });
afterEach(() => { vi.unstubAllGlobals(); });

describe('client API', () => {
  it('envoie un identifiant de requête et lit le format d’erreur unique', async () => {
    const f = vi.fn(async () => reponse(409, { error: { code: 'CONFLICT', message: 'Modifié par un autre utilisateur.', requestId: 'srv-req-1' }, current: { version: 3 } }));
    vi.stubGlobal('fetch', f);
    const e = await api.save('pieces', 'P-1', { unit: '', system: null, data: {} }).catch((x) => x);
    expect(e.message).toBe('Modifié par un autre utilisateur.');
    expect(e).toMatchObject({ status: 409, code: 'CONFLICT', requestId: 'srv-req-1', current: { version: 3 } });
    const h = f.mock.calls[0][1].headers;
    expect(h['X-Request-Id']).toMatch(/^[A-Za-z0-9-]{8,64}$/);
    expect(h['X-Requested-With']).toBe('gmao');
  });
  it('accepte encore l’ancien format { error: "texte" }', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reponse(403, { error: 'Interdit.' })));
    const e = await api.list('pieces').catch((x) => x);
    expect(e.message).toBe('Interdit.'); expect(e.status).toBe(403);
  });
  it('429 : message clair avec le délai Retry-After, aucune relance automatique', async () => {
    const f = vi.fn(async () => reponse(429, { error: { code: 'RATE_LIMITED', message: 'Trop de requêtes. Réessayez dans 42 s.' } }, { 'retry-after': '42' }));
    vi.stubGlobal('fetch', f);
    const e = await api.list('pieces').catch((x) => x);
    expect(e).toMatchObject({ status: 429, code: 'RATE_LIMITED', retryAfter: 42 });
    expect(e.message).toContain('42 s');
    expect(f).toHaveBeenCalledTimes(1);
  });
});
