import { createDemoApi } from './demo/apiDemo.js';

// Client d'API. Les cookies de session sont httpOnly : le JavaScript n'a jamais accès au jeton.
const SILENT_401 = ['/auth/login', '/auth/me'];

// Identifiant de requête : envoyé au serveur et repris dans ses journaux (une erreur se retrouve en une recherche)
const nouvelId = () => (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10));

const call = async (method, path, body) => {
  let r;
  const rid = nouvelId();
  try {
    r = await fetch('/api' + path, {
      method,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'gmao', 'X-Request-Id': rid },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw Object.assign(new Error('Serveur injoignable.'), { network: true });
  }
  const json = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 401 && !SILENT_401.includes(path)) window.dispatchEvent(new Event('gmao:unauth'));
    // format d'erreur du serveur : { error: { code, message, details?, requestId } } (ancien format { error: "texte" } accepté)
    const e = json.error && typeof json.error === 'object' ? json.error : { message: json.error };
    let message = e.message || 'Erreur ' + r.status;
    if (r.status === 429 && !e.message) message = 'Trop de requêtes. Réessayez dans ' + (r.headers.get('Retry-After') || 'quelques') + ' s.';
    throw Object.assign(new Error(message), { ...json, status: r.status, code: e.code, details: e.details, requestId: e.requestId || rid,
      retryAfter: Number(r.headers.get('Retry-After')) || undefined });
  }
  return json;
};

const apiReel = {
  login: (id, password, remember) => call('POST', '/auth/login', { id, password, remember }),
  logout: () => call('POST', '/auth/logout'),
  me: () => call('GET', '/auth/me'),
  changePassword: (current, next) => call('POST', '/auth/change-password', { current, next }),

  list: (collection, since, opts = {}) =>
    call('GET', `/data/${collection}` + (since ? '?since=' + encodeURIComponent(since) : opts.fenetre ? '?fenetre=' + opts.fenetre : '')),
  save: (collection, id, { unit, system, data, version }) =>
    call('PUT', `/data/${collection}/${encodeURIComponent(id)}`, { unit, system, data, version }),
  remove: (collection, id) => call('DELETE', `/data/${collection}/${encodeURIComponent(id)}`),
  // numéros attribués par le serveur : { unit, variant, count } -> ["DI-ALG-2026-0001", ...]
  nextCodes: async (collection, { unit, variant, count = 1 } = {}) =>
    (await call('POST', `/data/${collection}/next-code`, { unit, variant, count })).codes,
  // instance de démonstration ? (comptes publics à afficher sur l'écran de connexion) — null sinon
  demo: async () => { try { const r = await fetch('/api/demo', { credentials: 'same-origin' }); return r.ok ? await r.json() : null; } catch { return null; } },
  // pièces jointes (photos) d'une DI ou d'un BT
  listFiles: async (collection, recordId) => (await call('GET', `/files?collection=${collection}&recordId=${encodeURIComponent(recordId)}`)).files,
  uploadFile: async (collection, recordId, blob, name) => {
    let r;
    try {
      r = await fetch(`/api/files?collection=${collection}&recordId=${encodeURIComponent(recordId)}&name=${encodeURIComponent(name || 'photo.jpg')}`, {
        method: 'POST', credentials: 'same-origin', body: blob, headers: { 'Content-Type': blob.type || 'application/octet-stream', 'X-Requested-With': 'gmao' } });
    } catch { throw Object.assign(new Error('Serveur injoignable.'), { network: true }); }
    const json = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(json.error || 'Erreur ' + r.status), { status: r.status });
    return json;
  },
  deleteFile: (id) => call('DELETE', `/files/${id}`),
  fileUrl: (id) => `/api/files/${id}`,
  // import Excel : une seule transaction pour toutes les collections (tout ou rien)
  importExcel: (body) => call('POST', '/import', body),
  bulkImport: (collection, items) => call('POST', `/data/${collection}/bulk`, { items }),

  users: () => call('GET', '/users'),
  createUser: (u) => call('POST', '/users', u),
  updateUser: (id, u) => call('PUT', `/users/${encodeURIComponent(id)}`, u),
  deleteUser: (id) => call('DELETE', `/users/${encodeURIComponent(id)}`),
  audit: (limit = 200) => call('GET', `/users/audit/log?limit=${limit}`),
};

// Site de démonstration statique (npm run build:demo) : le « serveur » tourne dans le navigateur. Sinon : vrai serveur.
export const api = __STATIC_DEMO__ ? createDemoApi() : apiReel;
