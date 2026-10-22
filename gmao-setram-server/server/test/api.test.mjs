// Test de bout en bout : lance le serveur sur une base vierge et vérifie auth + droits.
// Usage : DATABASE_URL=postgres://... JWT_SECRET=... node --test test/
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET ||= 'test-secret-test-secret-test-secret-1234567890';
process.env.ADMIN_INITIAL_PASSWORD = 'Initial2026pw';
process.env.FILES_DIR = `/tmp/gmao-test-files-${process.pid}`;
// Le serveur principal des tests enchaîne des centaines d'appels : limites hautes ici ; les limites elles-mêmes
// sont testées sur des instances dédiées (buildApp({ rateLimit })).
process.env.LOG_LEVEL ||= 'error'; process.env.RATE_LIMIT_GLOBAL_MAX ||= '100000'; process.env.RATE_LIMIT_WRITE_MAX ||= '100000'; process.env.RATE_LIMIT_COSTLY_MAX ||= '10000'; process.env.RATE_LIMIT_AUTH_MAX ||= '10000';

const { migrate, q, pool } = await import('../src/db.js');
const { buildApp, ensureAdmin } = await import('../src/index.js');

await q('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
await migrate();
await ensureAdmin();
const server = buildApp().listen(0);
const base = `http://127.0.0.1:${server.address().port}/api`;

class Client {
  cookie = '';
  async call(method, path, body) {
    const r = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'gmao', ...(this.cookie && { Cookie: this.cookie }) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const sc = r.headers.get('set-cookie');
    if (sc) this.cookie = sc.split(';')[0];
    return { status: r.status, body: await r.json().catch(() => ({})) };
  }
}

test.after(async () => { server.close(); await pool.end(); });

const admin = new Client(), tech = new Client(), anon = new Client();

test('connexion admin, changement de mot de passe obligatoire', async () => {
  let r = await admin.call('POST', '/auth/login', { id: 'admin', password: 'Initial2026pw' });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.mustChangePw, true);
  r = await admin.call('GET', '/data/equipements?unit=Alger');
  assert.equal(r.status, 403);
  assert.equal(r.body.code, 'MUST_CHANGE_PW');
  r = await admin.call('POST', '/auth/change-password', { current: 'Initial2026pw', next: 'court' });
  assert.equal(r.status, 400);
  r = await admin.call('POST', '/auth/change-password', { current: 'Initial2026pw', next: 'NouveauMdp2026!' });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.mustChangePw, false);
});

test('mauvais mot de passe + verrouillage après 5 échecs', async () => {
  const c = new Client();
  for (let i = 0; i < 5; i++) {
    const r = await c.call('POST', '/auth/login', { id: 'admin', password: 'faux' });
    assert.equal(r.status, 401);
  }
  const r = await c.call('POST', '/auth/login', { id: 'admin', password: 'NouveauMdp2026!' });
  assert.equal(r.status, 423);
  await q("UPDATE users SET locked_until=NULL WHERE id='admin'");
});

test('routes protégées sans session / sans en-tête CSRF', async () => {
  assert.equal((await anon.call('GET', '/data/equipements?unit=Alger')).status, 401);
  const r = await fetch(base + '/auth/logout', { method: 'POST' });
  assert.equal(r.status, 403);
});

// (compte « tech » des tests de droits : profil Chargé système limité aux volets 0-1, pour tester le filtrage par volet)
test('création d’un compte avec droits limités (Alger, CFO, volets 0-1)', async () => {
  let r = await admin.call('POST', '/users', {
    id: 'k.belaid', nom: 'K. Belaïd', role: 'Chargé système', password: 'Tech2026motdepasse',
    droits: { Alger: { systems: ['CFO'], volets: [0, 1] } },
  });
  assert.equal(r.status, 201);
  r = await admin.call('POST', '/users', { id: 'x1', nom: 'X', password: 'Tech2026motdepasse', droits: { Paris: { systems: [], volets: [] } } });
  assert.equal(r.status, 400); // unité inconnue
  r = await tech.call('POST', '/auth/login', { id: 'k.belaid', password: 'Tech2026motdepasse' });
  assert.equal(r.body.user.mustChangePw, true);
  r = await tech.call('POST', '/auth/change-password', { current: 'Tech2026motdepasse', next: 'Technicien2026ok' });
  assert.equal(r.status, 200);
  assert.equal((await tech.call('GET', '/users')).status, 403);
});

test('le technicien ne peut écrire que dans son périmètre', async () => {
  const eq = { data: { nom: 'Transformateur T1' } };
  let r = await tech.call('PUT', '/data/equipements/EQ-1', { ...eq, unit: 'Alger', system: 'CFO' });
  assert.equal(r.status, 200);
  assert.equal((await tech.call('PUT', '/data/equipements/EQ-2', { ...eq, unit: 'Oran', system: 'CFO' })).status, 403);   // autre unité
  assert.equal((await tech.call('PUT', '/data/equipements/EQ-3', { ...eq, unit: 'Alger', system: 'VOIE' })).status, 403); // autre système
  assert.equal((await tech.call('PUT', '/data/bts/OT-1', { data: {}, unit: 'Alger', system: 'CFO' })).status, 403);       // volet 2 non accordé
  assert.equal((await tech.call('PUT', '/data/pieces/P-1', { data: { nom: 'x' } })).status, 403);                         // volet 4 (magasin) non accordé
  assert.equal((await tech.call('PUT', '/data/intervenants/MT-1', { data: { nom: 'x' } })).status, 403);                  // volet 5 non accordé
  assert.equal((await tech.call('PUT', '/data/systemes/main', { data: { list: [] } })).status, 403);                     // systèmes : super administrateur seul (organigramme)
  assert.equal((await tech.call('PUT', '/data/arborescence/CFO.TST', { data: { system: 'CFO', code: 'TST', sub: 'Test' } })).status, 200);   // sous-système : volet 0 suffit
  assert.equal((await tech.call('POST', '/data/equipements/bulk', { items: [] })).status, 403);
  assert.equal((await tech.call('GET', '/data/inconnue')).status, 404);
});

test('création : un code déjà pris par un autre utilisateur est refusé (EXISTS)', async () => {
  const r = await tech.call('PUT', '/data/equipements/EQ-1', { data: { nom: 'doublon' }, unit: 'Alger', system: 'CFO' });
  assert.equal(r.status, 409);
  assert.equal(r.body.code, 'EXISTS');
});

test('lecture filtrée côté serveur', async () => {
  await admin.call('PUT', '/data/equipements/EQ-VOIE', { data: { nom: 'Aiguillage' }, unit: 'Alger', system: 'VOIE' });
  await admin.call('PUT', '/data/equipements/EQ-ORAN', { data: { nom: 'Oran T' }, unit: 'Oran', system: 'CFO' });
  const a = await admin.call('GET', '/data/equipements');
  assert.equal(a.body.items.length, 3);
  const t = await tech.call('GET', '/data/equipements');
  assert.deepEqual(t.body.items.map(i => i.id), ['EQ-1']);
});

test('verrou optimiste : conflit 409 si version périmée', async () => {
  const cur = (await tech.call('GET', '/data/equipements?unit=Alger')).body.items[0];
  let r = await tech.call('PUT', '/data/equipements/EQ-1', { data: { nom: 'v2' }, unit: 'Alger', system: 'CFO', version: cur.version });
  assert.equal(r.status, 200);
  r = await tech.call('PUT', '/data/equipements/EQ-1', { data: { nom: 'v3' }, unit: 'Alger', system: 'CFO', version: cur.version });
  assert.equal(r.status, 409);
  assert.equal(r.body.code, 'CONFLICT');
});

test('suppression logique + synchronisation par since', async () => {
  const before = (await tech.call('GET', '/data/equipements?unit=Alger')).body.serverTime;
  assert.equal((await tech.call('DELETE', '/data/equipements/EQ-1')).status, 200);
  const list = (await tech.call('GET', '/data/equipements?unit=Alger')).body.items;
  assert.equal(list.length, 0);
  const delta = (await tech.call('GET', '/data/equipements?unit=Alger&since=' + encodeURIComponent(before))).body.items;
  assert.equal(delta[0].deleted, true);
});

test('désactivation d’un compte : session coupée immédiatement', async () => {
  await admin.call('PUT', '/users/k.belaid', { actif: false });
  assert.equal((await tech.call('GET', '/auth/me')).status, 401);
});

test('import en masse + journal d’audit', async () => {
  let r = await admin.call('POST', '/data/organismes/bulk', { items: [{ id: 'ORG-01', data: { nom: 'VERITAS' } }] });
  assert.equal(r.body.imported, 1);
  r = await admin.call('GET', '/users/audit/log?limit=500');
  const actions = new Set(r.body.entries.map(e => e.action));
  for (const a of ['login', 'login_failed', 'user_created', 'create', 'update', 'delete', 'bulk_import', 'password_changed'])
    assert.ok(actions.has(a), 'audit manquant : ' + a);
});

// ───────────────────────── Numérotation par le serveur ─────────────────────────
const { formatCode, currentYear, SEQUENCES, unitAbbr } = await import('../src/numbering.js');
const YEAR = currentYear();

// comptes des tests de droits par volet : profil « Chargé système » (volets 0, 1, 2, 3, 5, 6 possibles), sauf profil précisé
async function newUser(id, droits, password = 'Motdepasse2026ok', role = 'Chargé système') {
  const r = await admin.call('POST', '/users', { id, nom: id, role, password: 'Provisoire2026ok', droits });
  assert.equal(r.status, 201);
  const c = new Client();
  assert.equal((await c.call('POST', '/auth/login', { id, password: 'Provisoire2026ok' })).status, 200);
  assert.equal((await c.call('POST', '/auth/change-password', { current: 'Provisoire2026ok', next: password })).status, 200);
  return c;
}

test('numérotation : format, séquence par unité, lot', async () => {
  let r = await admin.call('POST', '/data/dis/next-code', { unit: 'Alger' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.codes, [`DI-ALG-${YEAR}-0001`]);
  r = await admin.call('POST', '/data/dis/next-code', { unit: 'Alger' });
  assert.deepEqual(r.body.codes, [`DI-ALG-${YEAR}-0002`]);
  r = await admin.call('POST', '/data/dis/next-code', { unit: 'Oran' });          // compteur propre à chaque unité
  assert.deepEqual(r.body.codes, [`DI-ORN-${YEAR}-0001`]);
  r = await admin.call('POST', '/data/dis/next-code', { unit: 'Alger', count: 3 });
  assert.deepEqual(r.body.codes, [`DI-ALG-${YEAR}-0003`, `DI-ALG-${YEAR}-0004`, `DI-ALG-${YEAR}-0005`]);
});

test('numérotation : OT, OT préventif, plan, magasin et articles', async () => {
  const code = async (col, body) => (await admin.call('POST', `/data/${col}/next-code`, body)).body.codes[0];
  assert.equal(await code('bts', { unit: 'Sétif' }), `OT-SET-${YEAR}-0001`);
  assert.equal(await code('bts', { unit: 'Sétif', variant: 'prev' }), `OT-PREV-SET-${YEAR}-0001`);
  assert.equal(await code('bts', { unit: 'Sétif', variant: 'prev' }), `OT-PREV-SET-${YEAR}-0002`);
  assert.equal(await code('planning', { unit: 'Sidi Bel Abbès' }), 'PREV-SBA-0001');
  assert.equal(await code('dss', {}), `DS-${YEAR}-0001`);
  assert.equal(await code('bs', {}), `BS-${YEAR}-0001`);
  assert.equal(await code('brs', {}), `BR-${YEAR}-0001`);
  assert.equal(await code('decharges', {}), `DCH-${YEAR}-0001`);
  assert.equal(await code('dss', { unit: 'Oran' }), `DS-${YEAR}-0002`);            // magasin central : un seul compteur
  assert.equal(await code('pieces', { variant: 'P' }), 'P-001');
  assert.equal(await code('pieces', { variant: 'O' }), 'O-001');
  assert.equal(await code('pieces', { variant: 'P' }), 'P-002');
});

test('numérotation : 25 demandes simultanées donnent 25 numéros distincts', async () => {
  const results = await Promise.all(Array.from({ length: 25 }, () =>
    admin.call('POST', '/data/dis/next-code', { unit: 'Mostaganem' })));
  assert.ok(results.every(r => r.status === 200));
  const codes = results.map(r => r.body.codes[0]);
  assert.equal(new Set(codes).size, 25);
  assert.equal(codes.sort()[0], `DI-MST-${YEAR}-0001`);
  assert.equal(codes.sort()[24], `DI-MST-${YEAR}-0025`);
});

test('numérotation : un code déjà utilisé est sauté', async () => {
  await admin.call('PUT', `/data/dis/DI-OUA-${YEAR}-0001`, { data: { x: 1 }, unit: 'Ouargla', system: 'CFO' });
  await admin.call('PUT', `/data/dis/DI-OUA-${YEAR}-0002`, { data: { x: 1 }, unit: 'Ouargla', system: 'CFO' });
  const r = await admin.call('POST', '/data/dis/next-code', { unit: 'Ouargla' });
  assert.deepEqual(r.body.codes, [`DI-OUA-${YEAR}-0003`]);
});

test('numérotation : droits et validations', async () => {
  const u = await newUser('num.alger', { Alger: { systems: ['CFO'], volets: [1] } });
  let r = await u.call('POST', '/data/dis/next-code', { unit: 'Alger' });
  assert.equal(r.status, 200);
  assert.match(r.body.codes[0], new RegExp(`^DI-ALG-${YEAR}-\\d{4}$`));
  assert.equal((await u.call('POST', '/data/dis/next-code', { unit: 'Oran' })).status, 403);   // autre unité
  assert.equal((await u.call('POST', '/data/bts/next-code', { unit: 'Alger' })).status, 403);  // volet OT non accordé
  assert.equal((await u.call('POST', '/data/dss/next-code', {})).status, 403);                 // volet Magasin non accordé
  assert.equal((await u.call('POST', '/data/pieces/next-code', { variant: 'P' })).status, 403);
  assert.equal((await admin.call('POST', '/data/dis/next-code', { unit: 'Paris' })).status, 400);
  assert.equal((await admin.call('POST', '/data/dis/next-code', {})).status, 400);             // unité obligatoire
  assert.equal((await admin.call('POST', '/data/dis/next-code', { unit: 'Alger', count: 0 })).status, 400);
  assert.equal((await admin.call('POST', '/data/dis/next-code', { unit: 'Alger', count: 1001 })).status, 400);
  assert.equal((await admin.call('POST', '/data/dis/next-code', { unit: 'Alger', count: 'a' })).status, 400);
  assert.equal((await admin.call('POST', '/data/pieces/next-code', { variant: 'Z' })).status, 404);
  assert.equal((await admin.call('POST', '/data/equipements/next-code', { unit: 'Alger' })).status, 404); // pas de numérotation serveur
  assert.equal((await anon.call('POST', '/data/dis/next-code', { unit: 'Alger' })).status, 401);
});

test('compteurs d’équipement : relevés autorisés au volet OT ou Préventif, lecture par les indicateurs', async () => {
  const cpt = { data: { code: 'MR.ALG.BOG.01-KM', eq: 'MR.ALG.BOG.01', unite: 'km', releves: [{ date: '2026-10-01', valeur: 1000 }] }, unit: 'Alger', system: 'MR' };
  const ot = await newUser('cpt.ot', { Alger: { systems: ['MR'], volets: [2] } });
  const prev = await newUser('cpt.prev', { Alger: { systems: ['MR'], volets: [3] } });
  const expl = await newUser('cpt.expl', { Alger: { systems: ['MR'], volets: [1] } });
  const kpi = await newUser('cpt.kpi', { Alger: { systems: ['MR'], volets: [6] } });
  assert.equal((await prev.call('PUT', '/data/compteurs_eq/MR.ALG.BOG.01-KM', cpt)).status, 200);
  const lu = await ot.call('GET', '/data/compteurs_eq');
  assert.equal(lu.status, 200); assert.equal(lu.body.items.length, 1);
  const v = lu.body.items[0].version;
  assert.equal((await ot.call('PUT', '/data/compteurs_eq/MR.ALG.BOG.01-KM', { ...cpt, version: v, data: { ...cpt.data, releves: [...cpt.data.releves, { date: '2026-10-10', valeur: 2500 }] } })).status, 200);
  assert.equal((await ot.call('PUT', '/data/compteurs_eq/MR.ORN.BOG.01-KM', { ...cpt, unit: 'Oran' })).status, 403);          // autre unité
  assert.equal((await ot.call('PUT', '/data/compteurs_eq/CFO.ALG.SST.01-H', { ...cpt, system: 'CFO' })).status, 403);         // autre système
  assert.equal((await expl.call('PUT', '/data/compteurs_eq/MR.ALG.BOG.02-KM', cpt)).status, 403);                             // volet DI seul
  assert.equal((await expl.call('GET', '/data/compteurs_eq')).body.items.length, 0);
  assert.equal((await kpi.call('GET', '/data/compteurs_eq')).body.items.length, 1);
  assert.equal((await kpi.call('PUT', '/data/compteurs_eq/MR.ALG.BOG.02-KM', cpt)).status, 403);                              // lecture seule
});

test('fenêtre de chargement : OT clos anciens laissés de côté, ouverts toujours chargés, historique sur demande', async () => {
  const mk = (id, etat) => admin.call('PUT', `/data/bts/${id}`, { data: { code: id, etat }, unit: 'Sétif', system: 'CFO' });
  for (const [id, etat] of [['OT-F-1', 'Clôturé'], ['OT-F-2', 'En cours'], ['OT-F-3', 'Clôturé']]) assert.equal((await mk(id, etat)).status, 200);
  await q("UPDATE records SET updated_at = now() - interval '30 months' WHERE collection='bts' AND id IN ('OT-F-1','OT-F-2')");
  const ids = async (qs) => (await admin.call('GET', '/data/bts' + qs)).body.items.map((r) => r.id).filter((x) => x.startsWith('OT-F-')).sort();
  assert.deepEqual(await ids('?fenetre=24'), ['OT-F-2', 'OT-F-3']);      // ancien mais ouvert : chargé ; ancien et clos : laissé de côté
  assert.deepEqual(await ids(''), ['OT-F-1', 'OT-F-2', 'OT-F-3']);         // historique complet
  assert.deepEqual(await ids('?fenetre=48'), ['OT-F-1', 'OT-F-2', 'OT-F-3']);
  assert.equal((await admin.call('GET', '/data/bts?fenetre=abc')).status, 400);
  assert.equal((await admin.call('GET', '/data/bts?fenetre=1')).status, 400);
  // pré-filtre par unité : un utilisateur d'Alger ne reçoit rien de Sétif
  const alg = await newUser('fen.alg', { Alger: { systems: ['CFO'], volets: [2] } });
  assert.deepEqual((await alg.call('GET', '/data/bts')).body.items.filter((r) => r.id.startsWith('OT-F-')), []);
});

test('erreurs : format unique { error: { code, message, requestId } }, identifiant de requête repris', async () => {
  const r = await fetch(base + '/data/inconnue', { headers: { 'X-Requested-With': 'gmao', Cookie: admin.cookie, 'X-Request-Id': 'test-req-123456' } });
  assert.equal(r.status, 404);
  assert.equal(r.headers.get('x-request-id'), 'test-req-123456');
  const b = await r.json();
  assert.deepEqual(b, { error: { code: 'NOT_FOUND', message: 'Collection inconnue.', requestId: 'test-req-123456' } });
  const sans = await anon.call('GET', '/auth/me');
  assert.equal(sans.status, 401); assert.equal(sans.body.error.code, 'UNAUTHENTICATED'); assert.match(sans.body.error.requestId, /^[0-9a-f-]{36}$/);
  const piege = await fetch(base + '/live', { headers: { 'X-Request-Id': 'x<script>' } });                         // identifiant malsain : remplacé
  assert.match(piege.headers.get('x-request-id'), /^[0-9a-f-]{36}$/);
});

test('supervision : /live, /ready et /health répondent sans session', async () => {
  for (const p of ['/live', '/ready', '/health']) { const r = await anon.call('GET', p); assert.equal(r.status, 200, p); assert.equal(r.body.ok, true); }
});

test('limitation de débit : 429 + Retry-After + en-têtes RateLimit, limites lues dans la configuration, supervision exemptée', async () => {
  const lim = { windowSec: 60, globalMax: 10, writeMax: 100, costlyMax: 2, authWindowMin: 15, authMax: 3 };
  const srv = buildApp({ rateLimit: lim }).listen(0);
  const b2 = `http://127.0.0.1:${srv.address().port}/api`;
  const h = { 'Content-Type': 'application/json', 'X-Requested-With': 'gmao' };
  try {
    // connexion : la 4e tentative depuis la même adresse est refusée
    const essais = [];
    for (let i = 0; i < 4; i++) essais.push(await fetch(b2 + '/auth/login', { method: 'POST', headers: h, body: JSON.stringify({ id: 'personne', password: 'faux' }) }));
    assert.deepEqual(essais.map((r) => r.status), [401, 401, 401, 429]);
    const bloque = essais[3];
    assert.ok(Number(bloque.headers.get('retry-after')) > 0);
    assert.equal(bloque.headers.get('ratelimit-limit'), '3');
    assert.equal((await bloque.json()).error.code, 'RATE_LIMITED');
    // global : 10 requêtes par minute et par adresse (utilisateur non connecté) ; /live, /ready, /health jamais limités
    let derniere;
    for (let i = 0; i < 12; i++) derniere = await fetch(b2 + '/config', { headers: h });
    assert.equal(derniere.status, 429);
    for (const p of ['/live', '/ready', '/health']) assert.equal((await fetch(b2 + p)).status, 200, p);
    // X-Forwarded-For envoyé par le client est ignoré sans TRUST_PROXY : même adresse, toujours bloquée
    const login = await fetch(b2 + '/auth/login', { method: 'POST', headers: { ...h, 'X-Forwarded-For': '9.9.9.9' }, body: JSON.stringify({ id: 'admin', password: 'x' }) });
    assert.equal(login.status, 429);
  } finally { srv.close(); }
  // une limite plus haute (configuration) laisse passer les mêmes requêtes
  const srv2 = buildApp({ rateLimit: { ...lim, globalMax: 100, authMax: 50 } }).listen(0);
  try {
    const b3 = `http://127.0.0.1:${srv2.address().port}/api`;
    const st = [];
    for (let i = 0; i < 12; i++) st.push((await fetch(b3 + '/auth/login', { method: 'POST', headers: h, body: JSON.stringify({ id: 'personne', password: 'faux' }) })).status);
    assert.ok(st.every((x) => x === 401));
  } finally { srv2.close(); }
});

test('limitation de débit : écritures comptées par utilisateur connecté', async () => {
  const srv = buildApp({ rateLimit: { windowSec: 60, globalMax: 1000, writeMax: 3, costlyMax: 2, authWindowMin: 15, authMax: 50 } }).listen(0);
  const b2 = `http://127.0.0.1:${srv.address().port}/api`;
  try {
    const st = [];
    for (let i = 0; i < 4; i++) {
      const r = await fetch(b2 + `/data/pieces/LIM-${i}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'gmao', Cookie: admin.cookie }, body: JSON.stringify({ data: { nom: 'x' } }) });
      st.push(r.status);
    }
    assert.deepEqual(st, [200, 200, 200, 429]);
    // un autre utilisateur n'est pas bloqué par le compteur du premier
    const r = await fetch(b2 + '/data/pieces', { headers: { 'X-Requested-With': 'gmao', Cookie: tech.cookie } });
    assert.notEqual(r.status, 429);
  } finally { srv.close(); }
});

test('numérotation : le millésime suit l’année civile d’Alger', () => {
  assert.equal(currentYear(new Date('2026-12-31T22:30:00Z')), 2026);   // 23h30 à Alger
  assert.equal(currentYear(new Date('2026-12-31T23:30:00Z')), 2027);   // 00h30 le 1er janvier à Alger
  assert.equal(formatCode(SEQUENCES.dis, { abbr: 'ALG', year: 2027, n: 42 }), 'DI-ALG-2027-0042');
  assert.equal(formatCode(SEQUENCES['pieces:C'], { abbr: '', year: 2027, n: 7 }), 'C-007');
  assert.equal(unitAbbr('Sidi Bel Abbès'), 'SBA');
  assert.equal(unitAbbr('Tizi Ouzou'), 'TIZ');                          // unité ajoutée via UNITS
});

test('journal d’audit : avant / après sur les modifications et suppressions', async () => {
  await admin.call('PUT', '/data/pieces/P-AUDIT', { data: { nom: 'Fusible', stock: 10, prix: 5 } });
  const cur = (await admin.call('GET', '/data/pieces')).body.items.find(i => i.id === 'P-AUDIT');
  await admin.call('PUT', '/data/pieces/P-AUDIT', { data: { nom: 'Fusible', stock: 7, prix: 5 }, version: cur.version });
  await admin.call('DELETE', '/data/pieces/P-AUDIT');
  const log = (await admin.call('GET', '/users/audit/log?limit=500')).body.entries.filter(e => e.record_id === 'P-AUDIT');
  const upd = log.find(e => e.action === 'update');
  assert.deepEqual(upd.detail.changes, { stock: [10, 7] });          // seule la rubrique modifiée est conservée
  assert.equal(upd.detail.version, 2);
  const del = log.find(e => e.action === 'delete');
  assert.equal(del.detail.before.nom, 'Fusible');
  assert.equal(log.find(e => e.action === 'create').detail.version, 1);
});

// ───────────────────────── Import Excel (route /api/import) ─────────────────────────
const imp = (c, body) => c.call('POST', '/import', body);
const count = async (col) => (await q('SELECT count(*)::int AS n FROM records WHERE collection=$1 AND deleted=false', [col])).rows[0].n;

test('import : réservé au super administrateur', async () => {
  const u = await newUser('imp.tech', { Alger: { systems: ['CFO'], volets: [0, 4, 5] } });
  const n0 = await count('pieces');
  assert.equal((await imp(u, { collections: { pieces: [{ id: 'P-X', data: { nom: 'x' } }] } })).status, 403);
  assert.equal((await imp(anon, { collections: {} })).status, 401);
  assert.equal(await count('pieces'), n0);                                  // rien écrit
});

test('import : création, puis rejeu = tout ignoré (idempotent), puis mise à jour', async () => {
  const body = (nom) => ({ onConflict: 'skip', collections: {
    equipements: [
      { id: 'CFO.ALG.SST.01', unit: 'Alger', system: 'CFO', data: { code: 'CFO.ALG.SST.01', nom, sousEquip: [] } },
      { id: 'CFO.ORN.SST.01', unit: 'Oran', system: 'CFO', data: { code: 'CFO.ORN.SST.01', nom: 'T Oran', sousEquip: [] } },
    ],
    pieces: [{ id: 'P-IMP-1', data: { code: 'P-IMP-1', nom: 'Fusible 10A', stock: 5 } }],
    organismes: [{ id: 'ORG-IMP', data: { code: 'ORG-IMP', nom: 'APAVE' } }],
  } });
  let r = await imp(admin, body('Transformateur'));
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.totals, { created: 4, updated: 0, skipped: 0 });
  assert.deepEqual(r.body.collections.equipements, { created: 2, updated: 0, skipped: 0 });

  r = await imp(admin, body('Transformateur MODIFIÉ'));                  // même fichier rejoué
  assert.deepEqual(r.body.totals, { created: 0, updated: 0, skipped: 4 });
  const stored = (await admin.call('GET', '/data/equipements?unit=Alger')).body.items.find(i => i.id === 'CFO.ALG.SST.01');
  assert.equal(stored.data.nom, 'Transformateur');                         // rien n'a été écrasé
  assert.equal(stored.version, 1);

  r = await imp(admin, { ...body('Transformateur MODIFIÉ'), onConflict: 'update' });
  assert.deepEqual(r.body.totals, { created: 0, updated: 4, skipped: 0 });
  const after = (await admin.call('GET', '/data/equipements?unit=Alger')).body.items.find(i => i.id === 'CFO.ALG.SST.01');
  assert.equal(after.data.nom, 'Transformateur MODIFIÉ');
  assert.equal(after.version, 2);                                          // la version avance : les postes connectés se resynchronisent
  assert.equal(after.unit, 'Alger');
  assert.equal(after.system, 'CFO');
});

test('import : simulation (dryRun) sans aucune écriture', async () => {
  const before = await count('mesures');
  const r = await imp(admin, { dryRun: true, collections: { mesures: [{ id: 'M-S1', data: { nom: 'a' } }, { id: 'M-S2', data: { nom: 'b' } }] } });
  assert.equal(r.status, 200);
  assert.equal(r.body.dryRun, true);
  assert.deepEqual(r.body.totals, { created: 2, updated: 0, skipped: 0 });
  assert.equal(await count('mesures'), before);
});

test('import : tout ou rien — une ligne invalide annule tout', async () => {
  const before = { p: await count('pieces'), e: await count('equipements') };
  const bad = [
    { collections: { pieces: [{ id: 'P-OK', data: { nom: 'ok' } }], equipements: [{ id: 'EQ-BAD', unit: 'Paris', data: {} }] } },   // unité inconnue
    { collections: { pieces: [{ id: 'P-OK2', data: { nom: 'ok' } }, { id: 'P-OK2', data: { nom: 'doublon' } }] } },                 // doublon dans le fichier
    { collections: { pieces: [{ id: 'P-OK3', data: 'pas un objet' }] } },
    { collections: { pieces: [{ id: '', data: {} }] } },
    { collections: { inconnue: [{ id: 'x', data: {} }] } },
    { collections: {} },
    { onConflict: 'écraser', collections: { pieces: [{ id: 'P-OK4', data: {} }] } },
  ];
  for (const b of bad) assert.equal((await imp(admin, b)).status, 400, JSON.stringify(b).slice(0, 80));
  assert.equal(await count('pieces'), before.p);
  assert.equal(await count('equipements'), before.e);
  assert.equal((await q("SELECT count(*)::int AS n FROM records WHERE id IN ('P-OK','P-OK2','P-OK3','EQ-BAD')")).rows[0].n, 0);
});

test('import : un élément supprimé est recréé ; échec en cours de route = rien écrit', async () => {
  await imp(admin, { collections: { organismes: [{ id: 'ORG-DEL', data: { nom: 'Ancien' } }] } });
  await admin.call('DELETE', '/data/organismes/ORG-DEL');
  let r = await imp(admin, { collections: { organismes: [{ id: 'ORG-DEL', data: { nom: 'Nouveau' } }] } });
  assert.deepEqual(r.body.totals, { created: 1, updated: 0, skipped: 0 });
  assert.equal((await admin.call('GET', '/data/organismes')).body.items.find(i => i.id === 'ORG-DEL').data.nom, 'Nouveau');

  // échec SQL au milieu (donnée non sérialisable en base) : la transaction est annulée
  const n0 = await count('pieces');
  r = await imp(admin, { collections: { pieces: [
    { id: 'P-A', data: { nom: 'a' } },
    { id: 'P-B', data: { nom: 'b\u0000c' } },        // caractère NUL : refusé par PostgreSQL (jsonb)
  ] } });
  assert.equal(r.status, 500);
  assert.equal(await count('pieces'), n0);
});

test('import : gros volume (100 000 lignes en une feuille), mise à jour groupée, journal d’audit', async () => {
  const N = 100000;
  const items = Array.from({ length: N }, (_, i) => ({ id: `P-BIG-${i}`, data: { nom: `Article ${i}`, stock: i } }));
  const t0 = Date.now();
  const r = await imp(admin, { collections: { pieces: items } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.totals.created, N);
  const duree = Date.now() - t0;
  assert.ok(duree < 120000, 'import trop lent : ' + duree + ' ms');
  const n = (await q("SELECT count(*)::int AS n FROM records WHERE collection='pieces' AND id LIKE 'P-BIG-%' AND NOT deleted")).rows[0].n;
  assert.equal(n, N);
  const log = (await admin.call('GET', '/users/audit/log?limit=50')).body.entries.find(e => e.action === 'import_excel' && e.detail.collections.pieces?.created === N);
  assert.ok(log, 'import absent du journal');
  assert.equal(log.detail.onConflict, 'skip');
  // second passage : 2 000 mises à jour + 1 000 créations, en lots
  const maj = Array.from({ length: 2000 }, (_, i) => ({ id: `P-BIG-${i}`, data: { nom: `Article ${i} bis`, stock: 0 } }))
    .concat(Array.from({ length: 1000 }, (_, i) => ({ id: `P-BIG2-${i}`, data: { nom: 'Nouveau' } })));
  const r2 = await imp(admin, { onConflict: 'update', collections: { pieces: maj } });
  assert.deepEqual(r2.body.totals, { created: 1000, updated: 2000, skipped: 0 });
  const p = (await q("SELECT data, version FROM records WHERE collection='pieces' AND id='P-BIG-1999'")).rows[0];
  assert.equal(p.data.nom, 'Article 1999 bis'); assert.equal(p.version, 2);
  await q("DELETE FROM records WHERE collection='pieces' AND (id LIKE 'P-BIG-%' OR id LIKE 'P-BIG2-%')");
});

test('import : au-delà de la limite (IMPORT_MAX_LIGNES) la feuille est refusée sans rien écrire', async () => {
  const { config: cfgImp } = await import('../src/config.js');
  const avant = cfgImp.importMaxLignes; cfgImp.importMaxLignes = 1000;
  try {
    const items = Array.from({ length: 1001 }, (_, i) => ({ id: `P-LIM-${i}`, data: { nom: 'x' } }));
    const r = await imp(admin, { collections: { pieces: items } });
    assert.equal(r.status, 400); assert.match(r.body.error.message || r.body.error, /max 1000/);
    assert.equal((await q("SELECT count(*)::int AS n FROM records WHERE id LIKE 'P-LIM-%'")).rows[0].n, 0);
  } finally { cfgImp.importMaxLignes = avant; }
  assert.deepEqual((await admin.call('GET', '/config')).body.import, { maxLignes: avant, maxMo: 100 });
});

test('numérotation : lot de 1 000 numéros en une requête, codes déjà pris sautés', async () => {
  await admin.call('PUT', `/data/dis/DI-CST-${YEAR}-0003`, { data: { x: 1 }, unit: 'Constantine', system: 'CFO' });
  const r = await admin.call('POST', '/data/dis/next-code', { unit: 'Constantine', count: 1000 });
  assert.equal(r.status, 200);
  assert.equal(r.body.codes.length, 1000); assert.equal(new Set(r.body.codes).size, 1000);
  assert.ok(!r.body.codes.includes(`DI-CST-${YEAR}-0003`));
  assert.equal(r.body.codes.at(-1), `DI-CST-${YEAR}-1001`);
});

// ───────────────────────── Migration 003 : référentiels en une ligne par élément ─────────────────────────
import fs from 'node:fs';
const SQL_003 = fs.readFileSync(new URL('../src/migrations/003_referentiels_en_lignes.sql', import.meta.url), 'utf8');

test('migration 003 : anciennes fiches « main » converties en lignes, puis rejouable', async () => {
  await q(`DELETE FROM records WHERE collection IN ('systemes','arborescence','feries')`);
  const old = (collection, data) => q(`INSERT INTO records (collection, id, unit, data) VALUES ($1,'main','',$2)`, [collection, JSON.stringify(data)]);
  await old('systemes', { list: [['CFO', 'Courants Forts'], ['MR', 'Matériel Roulant'], ['VOIE', 'Voie ferrée']] });
  await old('arborescence', { CFO: [{ code: 'SST', sub: 'Sous-Station' }, { code: 'LAC', sub: 'Caténaire' }], MR: [{ code: 'BOG', sub: 'Bogies' }], VOIE: [] });
  await old('feries', { list: [{ nom: 'Nouvel An', md: '01-01' }, { nom: 'Aïd', date: '2026-03-20' }, { nom: 'Doublon', date: '2026-03-20' }] });

  await q(SQL_003);

  const rows = async (c) => (await q('SELECT id, data, deleted FROM records WHERE collection=$1 ORDER BY id', [c])).rows;
  const sys = (await rows('systemes')).filter(r => !r.deleted);
  assert.deepEqual(sys.map(r => r.id), ['CFO', 'MR', 'VOIE']);
  assert.deepEqual(sys.find(r => r.id === 'MR').data, { code: 'MR', nom: 'Matériel Roulant', ordre: 1 });

  const arb = (await rows('arborescence')).filter(r => !r.deleted);
  assert.deepEqual(arb.map(r => r.id), ['CFO', 'CFO.LAC', 'CFO.SST', 'MR', 'MR.BOG', 'VOIE']);   // en-têtes + sous-systèmes (VOIE : en-tête seul)
  assert.deepEqual(arb.find(r => r.id === 'CFO.LAC').data, { system: 'CFO', code: 'LAC', sub: 'Caténaire', ordre: 1 });
  assert.equal(arb.find(r => r.id === 'VOIE').data.header, true);

  const fer = (await rows('feries')).filter(r => !r.deleted);
  assert.deepEqual(fer.map(r => r.id), ['date:2026-03-20', 'md:01-01']);            // doublon exact écarté
  assert.deepEqual(fer.find(r => r.id === 'md:01-01').data, { nom: 'Nouvel An', md: '01-01' });

  for (const c of ['systemes', 'arborescence', 'feries'])
    assert.equal((await rows(c)).find(r => r.id === 'main').deleted, true, `${c} : fiche « main » non retirée`);

  // rejouable : rien n'est dupliqué ni écrasé
  await q(`UPDATE records SET data = jsonb_set(data, '{nom}', '"Renommé par l''admin"') WHERE collection='systemes' AND id='MR'`);
  await q(SQL_003);
  assert.equal((await rows('systemes')).filter(r => !r.deleted).length, 3);
  assert.equal((await rows('systemes')).find(r => r.id === 'MR').data.nom, "Renommé par l'admin");

  // et l'API les sert comme n'importe quelle collection (lecture ouverte à tout utilisateur connecté)
  const u = await newUser('lecteur.ref', { Alger: { systems: ['CFO'], volets: [1] } });
  const r = await u.call('GET', '/data/arborescence');
  assert.equal(r.status, 200);
  assert.equal(r.body.items.filter(i => !i.deleted).length, 6);
});

test('référentiels : deux modifications simultanées sur deux éléments différents ne se gênent pas', async () => {
  const get = async (c, id) => (await admin.call('GET', `/data/${c}`)).body.items.find(i => i.id === id);
  await admin.call('PUT', '/data/systemes/ELM', { data: { code: 'ELM', nom: 'Électromécanique', ordre: 3 } });
  await admin.call('PUT', '/data/systemes/ED', { data: { code: 'ED', nom: 'Équipement Dépôt', ordre: 4 } });
  const a = await get('systemes', 'ELM'), b = await get('systemes', 'ED');
  // deux administrateurs modifient CHACUN un système, à partir de la même version de départ
  const [r1, r2] = await Promise.all([
    admin.call('PUT', '/data/systemes/ELM', { data: { ...a.data, nom: 'Électromécanique (A)' }, version: a.version }),
    admin.call('PUT', '/data/systemes/ED', { data: { ...b.data, nom: 'Équipement Dépôt (B)' }, version: b.version }),
  ]);
  assert.equal(r1.status, 200); assert.equal(r2.status, 200);                      // avant : le second aurait reçu un conflit
  // le conflit subsiste, à juste titre, pour le MÊME élément
  const r3 = await admin.call('PUT', '/data/systemes/ELM', { data: { ...a.data, nom: 'périmé' }, version: a.version });
  assert.equal(r3.status, 409);
});

// ───────────────────────── Pièces jointes (photos) ─────────────────────────
import fsx from 'node:fs';
const FILES_DIR = process.env.FILES_DIR;
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16]), Buffer.from('JFIF-photo-de-test'), Buffer.alloc(40, 7)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 1)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBPVP8 '), Buffer.alloc(40, 2)]);

async function upload(c, query, buf, type = 'image/jpeg') {
  const r = await fetch(`${base}/files?${new URLSearchParams(query)}`, { method: 'POST', body: buf,
    headers: { 'Content-Type': type, 'X-Requested-With': 'gmao', ...(c.cookie && { Cookie: c.cookie }) } });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
async function download(c, id) {
  const r = await fetch(`${base}/files/${id}`, { headers: { ...(c.cookie && { Cookie: c.cookie }) } });
  return { status: r.status, headers: r.headers, buf: Buffer.from(await r.arrayBuffer()) };
}
const putDI = (code, unit = 'Alger', system = 'CFO') => admin.call('PUT', `/data/dis/${code}`, { unit, system, data: { code, etat: 'Transmis' } });

test('pièces jointes : envoi, liste, lecture, contenu identique, en-têtes de sécurité', async () => {
  assert.equal((await putDI('DI-F1')).status, 200);
  const q1 = { collection: 'dis', recordId: 'DI-F1', name: 'fuite.jpg' };
  const up = await upload(admin, q1, JPEG, 'text/html');                       // le type annoncé par le navigateur est ignoré
  assert.equal(up.status, 201);
  assert.deepEqual({ name: up.body.name, mime: up.body.mime, size: up.body.size, by: up.body.uploadedBy }, { name: 'fuite.jpg', mime: 'image/jpeg', size: JPEG.length, by: 'admin' });
  assert.equal((await upload(admin, q1, PNG, 'application/octet-stream')).body.mime, 'image/png');
  assert.equal((await upload(admin, q1, WEBP)).body.mime, 'image/webp');

  const list = await admin.call('GET', '/files?collection=dis&recordId=DI-F1');
  assert.equal(list.body.files.length, 3);

  const dl = await download(admin, up.body.id);
  assert.equal(dl.status, 200);
  assert.ok(dl.buf.equals(JPEG));
  assert.equal(dl.headers.get('content-type'), 'image/jpeg');
  assert.equal(dl.headers.get('x-content-type-options'), 'nosniff');
  assert.match(dl.headers.get('content-security-policy'), /sandbox/);
  assert.match(dl.headers.get('content-disposition'), /^inline; filename\*=UTF-8''fuite\.jpg$/);
  assert.ok(fsx.readdirSync(FILES_DIR).includes(`${up.body.id}.jpg`));          // sur disque, nommé par UUID (jamais par le nom d'origine)
});

test('pièces jointes : seuls JPEG, PNG et WebP sont acceptés (contrôle du contenu)', async () => {
  const q1 = { collection: 'dis', recordId: 'DI-F1' };
  const refus = [
    ['GIF', Buffer.from('GIF89a' + 'x'.repeat(30))],
    ['SVG', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>')],
    ['HTML', Buffer.from('<html><script>alert(1)</script></html>')],
    ['EXE', Buffer.concat([Buffer.from('MZ'), Buffer.alloc(40)])],
    ['PDF', Buffer.from('%PDF-1.7' + ' '.repeat(30))],
    ['trop court', Buffer.from([0xff, 0xd8, 0xff])],
  ];
  for (const [nom, buf] of refus) assert.equal((await upload(admin, { ...q1, name: 'x.jpg' }, buf, 'image/jpeg')).status, 415, nom);   // même déguisé en image/jpeg
  assert.equal((await upload(admin, q1, Buffer.alloc(0))).status, 400);
  assert.equal((await upload(admin, { collection: 'equipements', recordId: 'X' }, JPEG)).status, 400);       // pas de pièce jointe sur ce type
  assert.equal((await upload(admin, { collection: 'dis' }, JPEG)).status, 400);
  assert.equal((await upload(admin, { collection: 'dis', recordId: 'DI-INCONNU' }, JPEG)).status, 404);
});

test('pièces jointes : taille maximale et nombre maximal par élément', async () => {
  await putDI('DI-F2');
  const gros = Buffer.concat([JPEG, Buffer.alloc(10 * 1024 * 1024 + 10, 1)]);
  const r = await fetch(`${base}/files?collection=dis&recordId=DI-F2`, { method: 'POST', body: gros, headers: { 'Content-Type': 'image/jpeg', 'X-Requested-With': 'gmao', Cookie: admin.cookie } });
  assert.equal(r.status, 413);
  assert.match((await r.json()).error.message, /trop volumineux/);
  for (let i = 0; i < 12; i++) assert.equal((await upload(admin, { collection: 'dis', recordId: 'DI-F2' }, JPEG)).status, 201, `envoi ${i + 1}`);
  const r13 = await upload(admin, { collection: 'dis', recordId: 'DI-F2' }, JPEG);
  assert.equal(r13.status, 409); assert.match(r13.body.error.message, /Maximum 12/);
});

test('pièces jointes : mêmes droits que la DI / l’OT correspondant', async () => {
  const f = (await upload(admin, { collection: 'dis', recordId: 'DI-F1' }, JPEG)).body;
  const alger = await newUser('pj.alger', { Alger: { systems: ['CFO'], volets: [1] } });
  const oran = await newUser('pj.oran', { Oran: { systems: ['CFO'], volets: [1] } });
  const btSeul = await newUser('pj.bt', { Alger: { systems: ['CFO'], volets: [2] } });
  const autreSys = await newUser('pj.mr', { Alger: { systems: ['MR'], volets: [1] } });

  assert.equal((await upload(alger, { collection: 'dis', recordId: 'DI-F1' }, JPEG)).status, 201);
  assert.equal((await download(alger, f.id)).status, 200);
  assert.equal((await alger.call('GET', '/files?collection=dis&recordId=DI-F1')).status, 200);

  for (const [nom, u] of [['autre unité', oran], ['autre volet', btSeul], ['autre système', autreSys]]) {
    assert.equal((await upload(u, { collection: 'dis', recordId: 'DI-F1' }, JPEG)).status, 403, `envoi : ${nom}`);
    assert.equal((await download(u, f.id)).status, 403, `lecture : ${nom}`);
    assert.equal((await u.call('GET', '/files?collection=dis&recordId=DI-F1')).status, 403, `liste : ${nom}`);
    assert.equal((await u.call('DELETE', `/files/${f.id}`)).status, 403, `suppression : ${nom}`);
  }
  assert.equal((await anon.call('GET', '/files?collection=dis&recordId=DI-F1')).status, 401);
  assert.equal((await download(anon, f.id)).status, 401);
  assert.equal((await upload(anon, { collection: 'dis', recordId: 'DI-F1' }, JPEG)).status, 401);
});

test('pièces jointes : suppression, journal d’audit, identifiants piégés', async () => {
  const f = (await upload(admin, { collection: 'dis', recordId: 'DI-F1', name: '../../etc/passwd<x>.jpg' }, JPEG)).body;
  assert.equal(f.name, 'passwdx.jpg');                                          // chemin et caractères interdits retirés
  for (const id of ['..%2f..%2fetc%2fpasswd', 'abc', '00000000-0000-0000-0000-000000000000', "x'%20OR%201=1"]) {
    assert.equal((await download(admin, id)).status, 404, id);
  }
  assert.equal((await admin.call('DELETE', `/files/${f.id}`)).status, 200);
  assert.equal((await download(admin, f.id)).status, 404);
  assert.ok(!fsx.readdirSync(FILES_DIR).some(n => n.startsWith(f.id)));
  assert.ok(!(await admin.call('GET', '/files?collection=dis&recordId=DI-F1')).body.files.some(x => x.id === f.id));
  const log = (await admin.call('GET', '/users/audit/log?limit=500')).body.entries.filter(e => e.detail?.id === f.id);
  assert.deepEqual(log.map(e => e.action).sort(), ['file_added', 'file_deleted']);
  // DI supprimée : ses pièces jointes ne sont plus servies
  const g = (await upload(admin, { collection: 'dis', recordId: 'DI-F1' }, JPEG)).body;
  await admin.call('DELETE', '/data/dis/DI-F1');
  assert.equal((await download(admin, g.id)).status, 404);
});

test('repartir de zéro par périmètre : une seule unité, un seul système, arborescence seule', async () => {
  const corps = (o) => ({ confirmation: 'REPARTIR DE ZERO', sauvegardeFaite: true, ...o });
  const vivant = async (c, id) => (await q('SELECT count(*)::int AS n FROM records WHERE collection=$1 AND id=$2 AND NOT deleted', [c, id])).rows[0].n;
  const put = (c, id, unit, system) => admin.call('PUT', `/data/${c}/${id}`, { data: { code: id }, ...(unit ? { unit, system } : {}) });
  const suivant = async (unit) => (await admin.call('POST', '/data/dis/next-code', { unit })).body.codes[0];
  const A = `DI-SET-${YEAR}-7001`, B = `DI-SET-${YEAR}-7002`, C = `DI-MST-${YEAR}-7001`;
  for (const [id, u, sy] of [[A, 'Sétif', 'CFO'], [B, 'Sétif', 'CFA'], [C, 'Mostaganem', 'CFO']]) assert.equal((await put('dis', id, u, sy)).status, 200);

  // refus : rien n'est modifié
  for (const o of [{ unit: 'Mars', collections: ['dis'] }, { unit: 'Sétif', collections: ['arborescence'] }, { collections: [] },
                   { system: 'CFO', collections: ['feries'] }, { collections: ['users'] }])
    assert.equal((await admin.call('POST', '/admin/reinitialiser', corps(o))).status, 400, JSON.stringify(o));
  assert.equal(await vivant('dis', A) + await vivant('dis', B) + await vivant('dis', C), 3);

  // une seule unité : les autres unités et les autres catégories restent ; seuls les compteurs de cette unité repartent de 1
  // (indépendant de l'ordre des tests : d'autres tests ont pu consommer des numéros avant)
  const mst = (k) => `DI-MST-${YEAR}-${String(k).padStart(4, '0')}`;
  assert.match(await suivant('Sétif'), new RegExp(`^DI-SET-${YEAR}-\\d{4}$`));
  const m0 = Number((await suivant('Mostaganem')).slice(-4));
  let r = await admin.call('POST', '/admin/reinitialiser', corps({ collections: ['dis'], unit: 'Sétif' }));
  assert.equal(r.status, 200);
  assert.equal(r.body.unit, 'Sétif');
  assert.equal(r.body.collections.dis, 2);
  assert.deepEqual([await vivant('dis', A), await vivant('dis', B), await vivant('dis', C)], [0, 0, 1]);
  const op = (await q('SELECT unite, systeme, collections FROM reinitialisations WHERE id=$1', [r.body.reinitialisation])).rows[0];
  assert.deepEqual({ unite: op.unite, systeme: op.systeme, collections: op.collections }, { unite: 'Sétif', systeme: null, collections: ['dis'] });
  assert.equal(await suivant('Sétif'), `DI-SET-${YEAR}-0001`, 'compteur de l\'unité remis à 1');
  assert.equal(await suivant('Mostaganem'), mst(m0 + 1), 'compteur des autres unités conservé');

  // un seul système : les autres systèmes restent, la numérotation n'est jamais touchée
  for (const [id, u, sy] of [[A, 'Sétif', 'CFO'], [B, 'Sétif', 'CFA']]) assert.equal((await put('dis', id, u, sy)).status, 200);
  r = await admin.call('POST', '/admin/reinitialiser', corps({ collections: ['dis'], system: 'CFO', numerotation: true }));
  assert.equal(r.status, 200);
  assert.equal(r.body.numerotation, false);
  assert.ok(r.body.collections.dis >= 2);
  assert.deepEqual([await vivant('dis', A), await vivant('dis', B), await vivant('dis', C)], [0, 1, 0]);
  assert.equal(await suivant('Mostaganem'), mst(m0 + 2));

  // arborescence d'un seul système : l'en-tête « ZZ1 » et « ZZ1.xxx », pas « ZZ10 » ; systèmes et autres catégories conservés
  for (const id of ['ZZ1', 'ZZ1.SST', 'ZZ10', 'ZZ10.SST']) assert.equal((await put('arborescence', id)).status, 200);
  const sys = (await q("SELECT count(*)::int AS n FROM records WHERE collection='systemes' AND NOT deleted")).rows[0].n;
  r = await admin.call('POST', '/admin/reinitialiser', corps({ collections: ['arborescence'], system: 'ZZ1' }));
  assert.equal(r.status, 200);
  assert.equal(r.body.collections.arborescence, 2);
  assert.deepEqual([await vivant('arborescence', 'ZZ1'), await vivant('arborescence', 'ZZ1.SST'), await vivant('arborescence', 'ZZ10'), await vivant('arborescence', 'ZZ10.SST')], [0, 0, 1, 1]);
  assert.equal((await q("SELECT count(*)::int AS n FROM records WHERE collection='systemes' AND NOT deleted")).rows[0].n, sys);
  assert.equal(await vivant('dis', B), 1);
});

// ───────────────────────── Profils, circuit de clôture, notifications, validation DG ─────────────────────────
const { _definirTransport } = await import('../src/mail.js');
const attendreQue = async (f, ms = 3000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await f()) return true; await new Promise((r) => setTimeout(r, 30)); } return false; };

test('profils : exploitation = DI seulement, technicien sans création ni clôture, chargé clôture, notifications GMAO + e-mail', async () => {
  const mails = [];
  _definirTransport({ sendMail: async (m) => { mails.push(m); } });
  try {
    const U = 'Constantine';
    const expl = await newUser('p.expl', { [U]: { systems: ['CFO'], volets: [1] } }, undefined, 'Exploitation');
    const tec = await newUser('p.tech', { [U]: { systems: ['CFO'], volets: [2] } }, undefined, 'Technicien');
    const chg = await newUser('p.charge', { [U]: { systems: ['CFO'], volets: [0, 1, 2, 3, 5, 6] } }, undefined, 'Chargé système');
    const resp = await newUser('p.resp', { [U]: { systems: ['CFO'], volets: [0, 1, 2, 3, 5, 6] } }, undefined, 'Responsable système');
    const autre = await newUser('p.resp.mr', { [U]: { systems: ['MR'], volets: [0, 1, 2, 3, 5, 6] } }, undefined, 'Responsable système');
    await admin.call('PUT', '/users/p.charge', { email: 'charge@setram.dz' });
    await admin.call('PUT', '/users/p.resp', { email: 'resp@setram.dz' });
    assert.equal((await admin.call('PUT', '/users/p.resp', { email: 'pas une adresse' })).status, 400);
    // les volets sont limités au profil : un technicien ne reçoit pas le magasin même si on le coche
    const t = (await admin.call('GET', '/users')).body.users.find((u) => u.id === 'p.tech');
    assert.deepEqual(t.droits[U].volets, [2]);
    assert.equal((await admin.call('POST', '/users', { id: 'p.inconnu', nom: 'x', role: 'Pilote', password: 'Provisoire2026ok', droits: {} })).status, 400);

    // exploitation : crée une DI, ne la fait pas avancer, ne crée pas d'OT
    const di = { data: { code: 'DI-CST-P1', eq: 'CFO.CST.SST.01', etat: 'À Transmettre' }, unit: U, system: 'CFO' };
    assert.equal((await expl.call('PUT', '/data/dis/DI-CST-P1', di)).status, 200);
    let r = await expl.call('PUT', '/data/dis/DI-CST-P1', { ...di, version: 1, data: { ...di.data, etat: 'Transmis' } });
    assert.equal(r.status, 403); assert.equal(r.body.error.code, 'PROFIL');
    assert.equal((await expl.call('PUT', '/data/bts/OT-CST-P1', { data: { code: 'OT-CST-P1' }, unit: U, system: 'CFO' })).status, 403);

    // technicien : pas de création d'OT ; remplit, « termine la saisie » ; ne clôture pas
    const ot = { code: 'OT-CST-P1', eq: 'CFO.CST.SST.01', etat: 'En cours' };
    assert.equal((await tec.call('PUT', '/data/bts/OT-CST-P1', { data: ot, unit: U, system: 'CFO' })).status, 403);
    r = await chg.call('PUT', '/data/bts/OT-CST-P1', { data: ot, unit: U, system: 'CFO' });
    assert.equal(r.status, 200);
    r = await tec.call('PUT', '/data/bts/OT-CST-P1', { data: { ...ot, etat: 'Clôturé' }, unit: U, system: 'CFO', version: 1 });
    assert.equal(r.status, 403); assert.match(r.body.error.message, /clôture est faite par le chargé/);
    r = await tec.call('PUT', '/data/bts/OT-CST-P1', { data: { ...ot, etat: 'À clôturer', panne: 'x' }, unit: U, system: 'CFO', version: 1 });
    assert.equal(r.status, 200);
    // notification au chargé et au responsable du système (pas à celui d'un autre système, pas à l'auteur)
    const nb = async (c) => (await c.call('GET', '/notifications')).body;
    assert.ok(await attendreQue(async () => (await nb(chg)).nonLues === 1 && (await nb(resp)).nonLues === 1));
    assert.equal((await nb(autre)).nonLues, 0); assert.equal((await nb(tec)).nonLues, 0);
    const n = (await nb(chg)).items[0];
    assert.match(n.texte, /OT OT-CST-P1 — CFO\.CST\.SST\.01 à clôturer : saisie terminée par p\.tech/);
    assert.equal(n.recordId, 'OT-CST-P1');
    assert.ok(await attendreQue(() => mails.length === 1));
    assert.deepEqual(mails[0].bcc.sort(), ['charge@setram.dz', 'resp@setram.dz']);
    assert.ok(!/panne|cause/i.test(mails[0].text), 'aucun détail technique dans l\'e-mail');
    // lu / tout lu
    assert.equal((await chg.call('POST', '/notifications/lues', { ids: [n.id] })).status, 200);
    assert.equal((await nb(chg)).nonLues, 0);
    assert.equal((await chg.call('POST', '/notifications/lues', {})).status, 400);

    // le chargé clôture : le responsable est prévenu ; l'OT passe « À valider » par la DG
    r = await chg.call('PUT', '/data/bts/OT-CST-P1', { data: { ...ot, etat: 'Clôturé', panne: 'x' }, unit: U, system: 'CFO', version: 2 });
    assert.equal(r.status, 200);
    assert.equal(r.body.data.validationDG.etat, 'À valider');
    assert.ok(await attendreQue(async () => (await nb(resp)).items.some((x) => x.type === 'ot_cloture')));
    assert.ok(!(await nb(chg)).items.some((x) => x.type === 'ot_cloture'));
    // le technicien ne modifie plus un OT clôturé
    assert.equal((await tec.call('PUT', '/data/bts/OT-CST-P1', { data: { ...ot, etat: 'Clôturé', panne: 'y' }, unit: U, system: 'CFO', version: 3 })).status, 403);
  } finally { _definirTransport(null); }
});

test('validation DG : l\'expert valide ou fait reprendre (motif), ne modifie rien d\'autre ; personne d\'autre ne se valide', async () => {
  const U = 'Constantine';
  const droitsToutes = Object.fromEntries(['Alger', 'Oran', 'Constantine'].map((u) => [u, { systems: ['CFO'], volets: [0, 1, 2, 3, 6] }]));
  const exp = await newUser('p.expert', droitsToutes, undefined, 'Expert DG');
  const chg = (() => { const c = new Client(); return c; })();
  assert.equal((await chg.call('POST', '/auth/login', { id: 'p.charge', password: 'Motdepasse2026ok' })).status, 200);
  const lire = async () => (await admin.call('GET', '/data/bts?unit=Constantine')).body.items.find((i) => i.id === 'OT-CST-P1');
  let cur = await lire();
  // l'expert ne change pas la saisie
  let r = await exp.call('PUT', '/data/bts/OT-CST-P1', { data: { ...cur.data, panne: 'modifiée' }, unit: U, system: 'CFO', version: cur.version });
  assert.equal(r.status, 403);
  assert.equal((await exp.call('PUT', '/data/bts/OT-NEW', { data: { code: 'OT-NEW' }, unit: U, system: 'CFO' })).status, 403);
  // à reprendre sans motif : refusé ; avec motif : l'OT revient « À clôturer » et le chargé est prévenu
  r = await exp.call('PUT', '/data/bts/OT-CST-P1', { data: { ...cur.data, etat: 'À clôturer', validationDG: { etat: 'À reprendre' } }, unit: U, system: 'CFO', version: cur.version });
  assert.equal(r.status, 403);
  r = await exp.call('PUT', '/data/bts/OT-CST-P1', { data: { ...cur.data, etat: 'À clôturer', validationDG: { etat: 'À reprendre', motif: 'Cause non renseignée', par: 'p.expert' } }, unit: U, system: 'CFO', version: cur.version });
  assert.equal(r.status, 200);
  assert.ok(await attendreQue(async () => (await chg.call('GET', '/notifications')).body.items.some((x) => x.type === 'ot_a_reprendre' && /Cause non renseignée/.test(x.texte))));
  // le chargé ne peut pas se valider lui-même : la validation est recalculée par le serveur
  cur = await lire();
  r = await chg.call('PUT', '/data/bts/OT-CST-P1', { data: { ...cur.data, etat: 'Clôturé', cause: 'Ventilation', validationDG: { etat: 'Validé' } }, unit: U, system: 'CFO', version: cur.version });
  assert.equal(r.status, 200); assert.equal(r.body.data.validationDG.etat, 'À valider');
  cur = await lire();
  r = await exp.call('PUT', '/data/bts/OT-CST-P1', { data: { ...cur.data, validationDG: { etat: 'Validé', par: 'p.expert' } }, unit: U, system: 'CFO', version: cur.version });
  assert.equal(r.status, 200);
  // référentiel : création / modification par le chargé -> « À valider » ; l'avancement d'un plan ne la remet pas en cause
  r = await chg.call('PUT', '/data/planning/PREV-CST-P1', { data: { code: 'PREV-CST-P1', eq: 'CFO.CST.SST.01', periode: 'Mensuel', date: '2026-11-01' }, unit: U, system: 'CFO' });
  assert.equal(r.body.data.validationDG.etat, 'À valider');
  r = await exp.call('PUT', '/data/planning/PREV-CST-P1', { data: { ...r.body.data, validationDG: { etat: 'Validé' } }, unit: U, system: 'CFO', version: 1 });
  assert.equal(r.status, 200);
  r = await chg.call('PUT', '/data/planning/PREV-CST-P1', { data: { ...r.body.data, date: '2026-12-01', dernier: '2026-11-01' }, unit: U, system: 'CFO', version: 2 });
  assert.equal(r.body.data.validationDG.etat, 'Validé');
  r = await chg.call('PUT', '/data/planning/PREV-CST-P1', { data: { ...r.body.data, periode: 'Trimestriel' }, unit: U, system: 'CFO', version: 3 });
  assert.equal(r.body.data.validationDG.etat, 'À valider');
  // l'expert voit son système sur toutes les unités, pas les autres systèmes
  await admin.call('PUT', '/data/equipements/EQ-EXP-MR', { data: { code: 'EQ-EXP-MR' }, unit: 'Oran', system: 'MR' });
  await admin.call('PUT', '/data/equipements/EQ-EXP-CFO', { data: { code: 'EQ-EXP-CFO' }, unit: 'Oran', system: 'CFO' });
  const vus = (await exp.call('GET', '/data/equipements')).body.items.map((i) => i.id);
  assert.ok(vus.includes('EQ-EXP-CFO') && !vus.includes('EQ-EXP-MR'));
});

test('administrateur UO : tous les systèmes de son unité, pas d\'import ; comptes seulement si le super admin lui donne la main', async () => {
  const uo = await newUser('p.admin.uo', { Oran: { systems: ['CFO'], volets: [0, 1, 2, 3, 4, 5, 6] } }, undefined, 'Administrateur UO');
  const moi = (await uo.call('GET', '/auth/me')).body.user;
  assert.deepEqual(moi.droits.Oran.systems, ['*']); assert.equal(moi.gestionComptes, false);
  assert.equal((await uo.call('PUT', '/data/equipements/EQ-UO-1', { data: { code: 'EQ-UO-1' }, unit: 'Oran', system: 'VOIE' })).status, 200);  // tout système
  assert.equal((await uo.call('PUT', '/data/equipements/EQ-UO-2', { data: { code: 'EQ-UO-2' }, unit: 'Alger', system: 'VOIE' })).status, 403); // autre unité
  assert.equal((await uo.call('POST', '/import', { collections: { pieces: [] } })).status, 403);
  assert.equal((await uo.call('GET', '/users')).status, 403);                       // pas la main
  // le super admin lui donne la main
  assert.equal((await admin.call('PUT', '/users/p.admin.uo', { gestionComptes: true })).status, 200);
  const liste = (await uo.call('GET', '/users')).body.users.map((u) => u.id);
  assert.ok(liste.includes('p.admin.uo') && !liste.includes('admin') && !liste.includes('p.charge'));   // ses unités seulement
  const nouveau = { id: 'p.tech.oran', nom: 'Tech Oran', role: 'Technicien', password: 'Provisoire2026ok', droits: { Oran: { systems: ['CFO'], volets: [2] } } };
  assert.equal((await uo.call('POST', '/users', nouveau)).status, 201);
  assert.equal((await uo.call('POST', '/users', { ...nouveau, id: 'p.x1', droits: { Alger: { systems: ['CFO'], volets: [2] } } })).status, 403);  // autre unité
  assert.equal((await uo.call('POST', '/users', { ...nouveau, id: 'p.x2', role: 'Expert DG' })).status, 400);                                     // profil réservé
  assert.equal((await uo.call('POST', '/users', { ...nouveau, id: 'p.x3', superAdmin: true })).status, 201);                                     // ignoré : pas super admin
  assert.equal((await admin.call('GET', '/users')).body.users.find((u) => u.id === 'p.x3').superAdmin, false);
  assert.equal((await uo.call('PUT', '/users/p.admin.uo', { gestionComptes: true })).status, 403);   // pas sur lui-même
  assert.equal((await uo.call('PUT', '/users/p.charge', { nom: 'x' })).status, 403);                 // hors périmètre
  assert.equal((await uo.call('GET', '/users/audit/log')).status, 403);
  // le super admin lui retire la main : effet immédiat
  assert.equal((await admin.call('PUT', '/users/p.admin.uo', { gestionComptes: false })).status, 200);
  assert.equal((await uo.call('GET', '/users')).status, 403);
  const audit = (await admin.call('GET', '/users/audit/log?limit=50')).body.entries.find((e) => e.action === 'user_updated' && e.detail.id === 'p.admin.uo' && e.detail.gestionComptes === false);
  assert.ok(audit, 'retrait de la main tracé');
});

test('migration des codes : LAC devient un système, BILLETTIQUE devient BIL (simulation, puis application en une transaction)', async () => {
  const { migrerCodes } = await import('../src/migrer-codes.js');
  const put = (c, id, unit, system, data) => q(`INSERT INTO records (collection, id, unit, system, data) VALUES ($1,$2,$3,$4,$5)
    ON CONFLICT (collection, id) DO UPDATE SET unit=EXCLUDED.unit, system=EXCLUDED.system, data=EXCLUDED.data, deleted=false`, [c, id, unit, system, JSON.stringify(data)]);
  await put('systemes', 'CFO', '', null, { code: 'CFO', nom: 'Courants Forts', ordre: 0 });
  await put('systemes', 'BILLETTIQUE', '', null, { code: 'BILLETTIQUE', nom: 'Billettique', ordre: 3 });
  await put('arborescence', 'CFO', '', null, { system: 'CFO', header: true, ordre: 0 });
  await put('arborescence', 'CFO.LAC', '', null, { system: 'CFO', code: 'LAC', sub: 'LAC / Caténaire', ordre: 1 });
  await put('arborescence', 'BILLETTIQUE', '', null, { system: 'BILLETTIQUE', header: true, ordre: 3 });
  await put('arborescence', 'BILLETTIQUE.PTL', '', null, { system: 'BILLETTIQUE', code: 'PTL', sub: 'Portillons', ordre: 0 });
  await put('equipements', 'CFO.MST.LAC.01', 'Mostaganem', 'CFO', { code: 'CFO.MST.LAC.01', system: 'CFO', subCode: 'LAC', unit: 'Mostaganem', nom: 'Fil de contact', sousEquip: [{ code: 'CFO.MST.LAC.01.SE01', nom: 'Console' }] });
  await put('equipements', 'CFO.MST.SST.01', 'Mostaganem', 'CFO', { code: 'CFO.MST.SST.01', system: 'CFO', subCode: 'SST', nom: 'Transformateur' });
  await put('equipements', 'BILLETTIQUE.MST.PTL.01', 'Mostaganem', 'BILLETTIQUE', { code: 'BILLETTIQUE.MST.PTL.01', system: 'BILLETTIQUE', subCode: 'PTL', nom: 'Portillon' });
  await put('dis', 'DI-MST-MIG-1', 'Mostaganem', 'CFO', { code: 'DI-MST-MIG-1', eq: 'CFO.MST.LAC.01', nom: 'Fil de contact — CFO.MST.LAC.01.SE01', designation: 'Usure' });
  await put('bts', 'OT-MST-MIG-1', 'Mostaganem', 'BILLETTIQUE', { code: 'OT-MST-MIG-1', eq: 'BILLETTIQUE.MST.PTL.01', consigne: 'Voir BILLETTIQUE.MST.PTL.01' });
  await put('planning', 'PREV-MST-MIG', 'Mostaganem', 'CFO', { code: 'PREV-MST-MIG', eq: 'CFO.MST.LAC.01', sys: 'CFO' });
  await put('prestataires', 'EXT-MIG', '', null, { nom: 'Billet-Tech', systemes: ['BILLETTIQUE'] });
  await admin.call('POST', '/users', { id: 'mig.cfo', nom: 'Mig', role: 'Chargé système', password: 'Provisoire2026ok', droits: { Mostaganem: { systems: ['CFO', 'BILLETTIQUE'], volets: [0, 1, 2] } } });
  const lire = async (c, id) => (await q('SELECT system, data, deleted FROM records WHERE collection=$1 AND id=$2', [c, id])).rows[0];

  // simulation : rapport, rien d'écrit
  const sim = await migrerCodes({ appliquer: false });
  assert.equal(sim.applique, false); assert.deepEqual(sim.conflits, []);
  assert.ok(sim.idsRenommes.includes('equipements : CFO.MST.LAC.01 -> LAC.MST.CAT.01'));
  assert.equal((await lire('equipements', 'CFO.MST.LAC.01')).deleted, false);
  assert.equal(await lire('equipements', 'LAC.MST.CAT.01'), undefined);

  // application
  const r = await migrerCodes({ appliquer: true });
  assert.equal(r.applique, true);
  const lac = await lire('equipements', 'LAC.MST.CAT.01');
  assert.equal(lac.system, 'LAC'); assert.equal(lac.data.system, 'LAC'); assert.equal(lac.data.subCode, 'CAT');
  assert.equal(lac.data.sousEquip[0].code, 'LAC.MST.CAT.01.SE01');
  assert.equal((await lire('equipements', 'CFO.MST.LAC.01')).deleted, true);                      // ancien code conservé, supprimé logiquement
  assert.equal((await lire('equipements', 'CFO.MST.SST.01')).system, 'CFO');                      // le reste de CFO ne bouge pas
  assert.equal((await lire('equipements', 'BIL.MST.PTL.01')).system, 'BIL');
  const di = await lire('dis', 'DI-MST-MIG-1');
  assert.equal(di.system, 'LAC'); assert.equal(di.data.eq, 'LAC.MST.CAT.01'); assert.equal(di.data.nom, 'Fil de contact — LAC.MST.CAT.01.SE01');
  const ot = await lire('bts', 'OT-MST-MIG-1');
  assert.equal(ot.system, 'BIL'); assert.equal(ot.data.consigne, 'Voir BIL.MST.PTL.01');
  const pl = await lire('planning', 'PREV-MST-MIG');
  assert.equal(pl.system, 'LAC'); assert.equal(pl.data.sys, 'LAC');
  assert.deepEqual((await lire('prestataires', 'EXT-MIG')).data.systemes, ['BIL']);
  assert.equal((await lire('systemes', 'BIL')).data.code, 'BIL');
  assert.equal((await lire('systemes', 'LAC')).data.nom, 'Ligne Aérienne de Contact');
  assert.equal((await lire('arborescence', 'CFO.LAC')).deleted, true);
  assert.equal((await lire('arborescence', 'LAC.CAT')).data.system, 'LAC');
  assert.equal((await lire('arborescence', 'BIL.PTL')).data.system, 'BIL');
  const u = (await q("SELECT droits FROM users WHERE id='mig.cfo'")).rows[0];
  assert.deepEqual(u.droits.Mostaganem.systems.sort(), ['BIL', 'CFO', 'LAC']);                   // qui avait CFO garde la LAC
  assert.equal((await q("SELECT 1 FROM audit_log WHERE action='migration_codes'")).rows.length, 1);
  // rejouable : plus rien à changer
  const encore = await migrerCodes({ appliquer: true });
  assert.deepEqual(encore.idsRenommes, []); assert.equal(encore.comptes, 0);
});

test('profils créés par le super administrateur ; profils de consultation (Directeur UO / DG)', async () => {
  // un « Coordinateur méthodes » : DI + OT + préventif, clôture, sans validation
  let r = await admin.call('PUT', '/data/profils/Coordinateur méthodes', { data: { libelle: 'Méthodes', volets: [1, 2, 3, 9], cloture: true, rapports: 'pirate' } });
  assert.equal(r.status, 200);
  const coord = await newUser('p.coord', { Oran: { systems: ['CFO'], volets: [1, 2, 3, 4] } }, undefined, 'Coordinateur méthodes');
  const moi = (await coord.call('GET', '/auth/me')).body.user;
  assert.deepEqual(moi.droits.Oran.volets, [1, 2, 3]);                                      // volets limités au profil (9 et 4 écartés)
  assert.equal((await coord.call('PUT', '/data/bts/OT-ORN-C1', { data: { code: 'OT-ORN-C1', etat: 'Clôturé' }, unit: 'Oran', system: 'CFO' })).status, 200);
  assert.equal((await coord.call('PUT', '/data/profils/X', { data: { volets: [0] } })).status, 403);      // organigramme : super admin seul
  assert.equal((await coord.call('PUT', '/data/systemes/NOUV', { data: { code: 'NOUV' } })).status, 403);
  // retiré du catalogue : le compte n'a plus de capacités particulières mais garde ses droits par volet
  assert.equal((await admin.call('DELETE', '/data/profils/Coordinateur méthodes')).status, 200);
  assert.equal((await admin.call('POST', '/users', { id: 'p.coord2', nom: 'x', role: 'Coordinateur méthodes', password: 'Provisoire2026ok', droits: {} })).status, 400);
  // Directeur UO : voit son unité, ne modifie rien
  const dir = await newUser('p.dir.uo', { Oran: { systems: ['CFO'], volets: [0, 1, 2] } }, undefined, 'Directeur UO');
  assert.deepEqual((await dir.call('GET', '/auth/me')).body.user.droits.Oran.systems, ['*']);
  assert.ok((await dir.call('GET', '/data/bts')).body.items.some((i) => i.id === 'OT-ORN-C1'));
  r = await dir.call('PUT', '/data/dis/DI-ORN-DIR', { data: { code: 'DI-ORN-DIR', etat: 'À Transmettre' }, unit: 'Oran', system: 'CFO' });
  assert.equal(r.status, 403); assert.match(r.body.error.message, /consultation uniquement/);
});

test('rapports d\'activité : UO -> experts DG (erreurs, commentaire) -> responsable DG -> correction -> nouvelle revue -> clôture', async () => {
  const U = 'Ouargla';
  const tous = (v) => Object.fromEntries(['Alger', 'Oran', 'Ouargla'].map((u) => [u, { systems: ['CFO'], volets: v }]));
  const uo = await newUser('r.uo', { [U]: { systems: ['*'], volets: [0, 1, 2, 3, 4, 5, 6, 7] } }, undefined, 'Administrateur UO');
  const e1 = await newUser('r.exp1', tous([0, 1, 2, 3, 6, 7]), undefined, 'Expert DG');
  const e2 = await newUser('r.exp2', tous([0, 1, 2, 3, 6, 7]), undefined, 'Expert DG');
  const rdg = await newUser('r.resp.dg', tous([0, 1, 2, 3, 4, 5, 6, 7]), undefined, 'Responsable DG');
  const chg = await newUser('r.charge', { [U]: { systems: ['CFO'], volets: [0, 1, 2] } }, undefined, 'Chargé système');
  const XLSX = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('....[Content_Types].xml xl/workbook.xml xl/worksheets/sheet1.xml')]);
  const DOCX = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('....word/document.xml')]);
  const XLSM = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('....xl/workbook.xml xl/vbaProject.bin')]);
  const id = (await uo.call('POST', '/data/rapports/next-code', { unit: U })).body.codes[0];
  assert.match(id, new RegExp(`^RAP-OUA-${YEAR}-\\d{3}$`));
  const lire = async () => (await admin.call('GET', `/data/rapports?unit=${U}`)).body.items.find((i) => i.id === id);
  const ecrire = async (c, data) => { const cur = await lire(); return c.call('PUT', `/data/rapports/${id}`, { data, unit: U, version: cur?.version }); };
  // 1. brouillon, fichiers contrôlés par leur contenu, pas d'envoi sans fichier
  let r = await uo.call('PUT', `/data/rapports/${id}`, { data: { code: id, unit: U, titre: 'Rapport septembre', periode: '2026-09', fichiers: [] }, unit: U });
  assert.equal(r.status, 200); assert.equal(r.body.data.etat, 'Brouillon');
  assert.equal((await chg.call('GET', '/data/rapports')).body.items.length, 0);                 // le chargé n'a pas le volet rapports
  assert.equal((await upload(uo, { collection: 'rapports', recordId: id, name: 'macro.xlsm' }, XLSM, 'application/octet-stream')).status, 415);
  assert.equal((await upload(e1, { collection: 'rapports', recordId: id, name: 'x.xlsx' }, XLSX, 'application/octet-stream')).status, 403);   // l'expert ne dépose pas
  const f1 = await upload(uo, { collection: 'rapports', recordId: id, name: 'Rapport.xlsx' }, XLSX, 'application/octet-stream');
  assert.equal(f1.status, 201); assert.equal(f1.body.mime, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  const f2 = await upload(uo, { collection: 'rapports', recordId: id, name: 'Rapport.docx' }, DOCX, 'application/octet-stream');
  assert.equal(f2.status, 201);
  const dl = await download(e1, f1.body.id);
  assert.equal(dl.status, 200); assert.match(dl.headers.get('content-disposition'), /^attachment/);
  let cur = (await lire()).data;
  assert.equal((await ecrire(uo, { ...cur, etat: 'Envoyé' })).status, 403);                     // pas de fichier déclaré dans le rapport
  const fichiers = [f1.body, f2.body].map((f) => ({ id: f.id, nom: f.name, mime: f.mime, tour: 1 }));
  // 2. envoi : les experts ayant le volet rapports sur l'unité sont attendus et notifiés
  r = await ecrire(uo, { ...cur, fichiers, etat: 'Envoyé' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.data.attendus.sort(), ['r.exp1', 'r.exp2']);
  const notifs = async (c) => (await c.call('GET', '/notifications')).body.items;
  assert.ok(await attendreQue(async () => (await notifs(e1)).some((n) => n.type === 'rapport_a_revoir' && n.recordId === id)));
  assert.equal((await upload(uo, { collection: 'rapports', recordId: id, name: 'tard.xlsx' }, XLSX, 'application/octet-stream')).status, 403);   // entre les mains de la DG
  assert.equal((await ecrire(uo, { ...(await lire()).data, titre: 'modifié' })).status, 403);
  // 3. revues : chacun la sienne ; le responsable DG ne décide qu'après toutes les revues
  cur = (await lire()).data;
  assert.equal((await ecrire(e1, { ...cur, revues: { 1: { 'r.exp2': { erreurs: 0, terminee: true } } } })).status, 403);
  r = await ecrire(e1, { ...cur, revues: { 1: { 'r.exp1': { nom: 'Expert 1', erreurs: 2, commentaire: 'MTBF CFO faux ; OT non clôturés comptés', terminee: true } } } });
  assert.equal(r.status, 200); assert.equal(r.body.data.etat, 'Envoyé');
  cur = (await lire()).data;
  assert.equal((await ecrire(rdg, { ...cur, etat: 'Clôturé' })).status, 403);
  r = await ecrire(e2, { ...cur, revues: { 1: { ...cur.revues[1], 'r.exp2': { nom: 'Expert 2', erreurs: 0, commentaire: '', terminee: true } } } });
  assert.equal(r.status, 200); assert.equal(r.body.data.etat, 'À valider DG');
  assert.ok(await attendreQue(async () => (await notifs(rdg)).some((n) => n.type === 'rapport_a_valider' && /2 erreur/.test(n.texte))));
  // 4. responsable DG : clôture refusée (erreurs) ; renvoi pour correction -> l'UO est notifiée
  cur = (await lire()).data;
  r = await ecrire(rdg, { ...cur, etat: 'Clôturé' });
  assert.equal(r.status, 403); assert.match(r.body.error.message, /renvoyez le rapport/);
  r = await ecrire(rdg, { ...cur, etat: 'À corriger', decision: { motif: 'Corriger le MTBF CFO' } });
  assert.equal(r.status, 200); assert.equal(r.body.data.decision.etat, 'À corriger');
  assert.ok(await attendreQue(async () => (await notifs(uo)).some((n) => n.type === 'rapport_a_corriger')));
  // 5. l'UO corrige (nouveau fichier) et renvoie : tour 2, les experts sont de nouveau notifiés et revoient
  const f3 = await upload(uo, { collection: 'rapports', recordId: id, name: 'Rapport_v2.xlsx' }, XLSX, 'application/octet-stream');
  assert.equal(f3.status, 201);
  cur = (await lire()).data;
  r = await ecrire(uo, { ...cur, fichiers: [...cur.fichiers, { id: f3.body.id, nom: f3.body.name, mime: f3.body.mime, tour: 2 }], etat: 'Envoyé' });
  assert.equal(r.status, 200); assert.equal(r.body.data.tour, 2); assert.equal(r.body.data.etat, 'Envoyé');
  assert.ok(await attendreQue(async () => (await notifs(e2)).filter((n) => n.type === 'rapport_a_revoir' && n.recordId === id).length === 2));
  for (const [c, nom] of [[e1, 'r.exp1'], [e2, 'r.exp2']]) {
    cur = (await lire()).data;
    r = await ecrire(c, { ...cur, revues: { ...cur.revues, 2: { ...(cur.revues[2] || {}), [nom]: { nom, erreurs: 0, commentaire: '', terminee: true } } } });
    assert.equal(r.status, 200);
  }
  cur = (await lire()).data;
  assert.equal(cur.etat, 'À valider DG');
  r = await ecrire(rdg, { ...cur, etat: 'Clôturé' });
  assert.equal(r.status, 200); assert.equal(r.body.data.etat, 'Clôturé');
  const h = r.body.data.historique.map((x) => x.action);
  assert.ok(h.includes('Envoyé à la DG') && h.includes('Correction renvoyée à la DG') && h.includes('Clôturé par le responsable DG'));
  assert.ok(await attendreQue(async () => (await notifs(uo)).some((n) => n.type === 'rapport_cloture')));
  // super administrateur : statut modifiable à la main (réouverture)
  r = await admin.call('PUT', `/data/rapports/${id}`, { data: { ...r.body.data, etat: 'À corriger' }, unit: U, version: r.body.version });
  assert.equal(r.status, 200);
  assert.ok(r.body.data.historique.some((x) => x.action === 'Statut : Clôturé → À corriger'));
});

// ───────────────────────── Mode démonstration ─────────────────────────
const { seedDemo, resetDemo, demoDejaPresente } = await import('../src/demo/seed.js');
const { genererDemo } = await import('../src/demo/donnees.js');
const { lignesReferentiels } = await import('../src/demo/referentiels.js');
const { config: cfg } = await import('../src/config.js');

test('repartir de zéro : réservé au super administrateur, confirmation + sauvegarde exigées, archivage, numérotation à 0001', async () => {
  const vivants = async (c) => (await q('SELECT count(*)::int AS n FROM records WHERE collection=$1 AND NOT deleted', [c])).rows[0].n;
  await admin.call('PUT', '/data/systemes/SYS-RZ', { data: { code: 'SYS-RZ' } });
  await admin.call('PUT', `/data/dis/DI-OUA-${YEAR}-0042`, { data: { code: `DI-OUA-${YEAR}-0042` }, unit: 'Ouargla', system: 'CFO' });
  await admin.call('PUT', '/data/pieces/P-RZ', { data: { code: 'P-RZ' } });
  const avantSys = await vivants('systemes');
  const avantDis = await vivants('dis');
  assert.ok(avantDis > 0);

  await admin.call('POST', '/users', { id: 'resp.rz', nom: 'Resp RZ', role: 'Responsable', password: 'Resp2026motdepasse', droits: { Alger: { systems: ['CFO'], volets: [0, 1, 2, 3, 4, 5, 6] } } });
  await q("UPDATE users SET must_change_pw=false WHERE id='resp.rz'");
  const resp = new Client();
  assert.equal((await resp.call('POST', '/auth/login', { id: 'resp.rz', password: 'Resp2026motdepasse' })).status, 200);
  assert.equal((await resp.call('POST', '/admin/reinitialiser', { confirmation: 'REPARTIR DE ZERO', sauvegardeFaite: true })).status, 403, 'même avec tous les volets, réservé au super administrateur');
  let r = await admin.call('POST', '/admin/reinitialiser', { confirmation: 'oui', sauvegardeFaite: true });
  assert.equal(r.status, 400);
  r = await admin.call('POST', '/admin/reinitialiser', { confirmation: 'REPARTIR DE ZERO' });
  assert.equal(r.status, 400);
  assert.equal(await vivants('dis'), avantDis, 'refus = rien de modifié');

  const depuis = new Date(Date.now() - 1000).toISOString();
  r = await admin.call('POST', '/admin/reinitialiser', { confirmation: 'repartir de zero', sauvegardeFaite: true });
  assert.equal(r.status, 200);
  assert.equal(r.body.collections.dis, avantDis);
  assert.ok(r.body.collections.pieces >= 1);
  assert.equal(r.body.numerotation, true);
  for (const c of ['dis', 'bts', 'equipements', 'pieces', 'intervenants']) assert.equal(await vivants(c), 0, c);
  assert.equal(await vivants('systemes'), avantSys, 'référentiels conservés par défaut');
  assert.ok((await admin.call('GET', '/users')).body.users.length >= 2, 'comptes conservés');
  // archivage complet, restaurable
  const arch = (await q('SELECT count(*)::int AS n FROM records_archive WHERE reinitialisation=$1', [r.body.reinitialisation])).rows[0].n;
  assert.equal(arch, r.body.total);
  // les autres navigateurs voient les suppressions à la synchronisation suivante
  const sync = (await admin.call('GET', `/data/dis?since=${encodeURIComponent(depuis)}`)).body.items;
  assert.ok(sync.length >= avantDis && sync.every(i => i.deleted));
  // numérotation repartie de 1, et le numéro réattribué s'enregistre (recréation sur l'élément archivé)
  const n = await admin.call('POST', '/data/dis/next-code', { unit: 'Ouargla' });
  assert.deepEqual(n.body.codes, [`DI-OUA-${YEAR}-0001`]);
  assert.equal((await admin.call('PUT', `/data/dis/DI-OUA-${YEAR}-0001`, { data: { x: 2 }, unit: 'Ouargla', system: 'CFO' })).status, 200);
  const a = (await q("SELECT detail FROM audit_log WHERE action='reinitialisation' ORDER BY id DESC LIMIT 1")).rows[0];
  assert.equal(a.detail.total, r.body.total);

  // référentiels inclus sur demande, numérotation conservée sur demande
  r = await admin.call('POST', '/admin/reinitialiser', { confirmation: 'REPARTIR DE ZERO', sauvegardeFaite: true, referentiels: true, numerotation: false });
  assert.equal(r.status, 200);
  assert.equal(await vivants('systemes'), 0);
  assert.deepEqual((await admin.call('POST', '/data/dis/next-code', { unit: 'Ouargla' })).body.codes, [`DI-OUA-${YEAR}-0002`]);
});

test('démo : la route des comptes publics n\'existe que si DEMO=1', async () => {
  cfg.demo = false;
  assert.equal((await anon.call('GET', '/demo')).status, 404);
  cfg.demo = true;
  try {
    const r = await anon.call('GET', '/demo');
    assert.equal(r.status, 200); assert.equal(r.body.demo, true);
    assert.ok(r.body.comptes.length >= 5 && r.body.comptes.every(c => c.id.startsWith('demo.') && c.motDePasse.length >= 10 && c.description));
  } finally { cfg.demo = false; }
});

test('démo : données créées, comptes utilisables, périmètres respectés, numérotation qui continue', async () => {
  await q(`DELETE FROM records WHERE collection NOT IN ('x')`); await q('DELETE FROM counters');
  assert.equal(await demoDejaPresente(), false);
  const d = await seedDemo(new Date());
  assert.equal(await demoDejaPresente(), true);
  const n = async (c) => (await q('SELECT count(*)::int AS n FROM records WHERE collection=$1 AND NOT deleted', [c])).rows[0].n;
  assert.equal(await n('dis'), d.collections.dis.length); assert.equal(await n('equipements'), d.collections.equipements.length);
  assert.equal(await n('systemes'), lignesReferentiels().systemes.length); assert.ok(await n('arborescence') > 20);

  const login = async (id, password) => { const c = new Client(); const r = await c.call('POST', '/auth/login', { id, password }); assert.equal(r.status, 200, id); assert.equal(r.body.user.mustChangePw, false); return c; };
  const comptes = Object.fromEntries(d.users.map(u => [u.id, u]));
  const tech = await login('demo.technicien', comptes['demo.technicien'].password);
  const ots = (await tech.call('GET', '/data/bts')).body.items;          // profil Technicien : volet OT seulement
  assert.ok(ots.length > 5 && ots.every(i => i.unit === 'Alger' && ['CFO', 'CFA', 'BIL'].includes(i.system)), 'le technicien ne voit que son périmètre');
  const dir = await login('demo.direction', comptes['demo.direction'].password);
  assert.ok(new Set((await dir.call('GET', '/data/dis')).body.items.map(i => i.unit)).size >= 4, 'la direction voit toutes les unités');
  assert.equal((await dir.call('PUT', '/data/dis/DI-X', { unit: 'Alger', system: 'CFO', data: { code: 'DI-X' } })).status, 403);   // lecture seule en pratique
  const expl = await login('demo.exploitation', comptes['demo.exploitation'].password);
  assert.equal((await expl.call('GET', '/data/bts')).body.items.length, 0);
  const mag = await login('demo.magasin', comptes['demo.magasin'].password);
  assert.ok((await mag.call('GET', '/data/pieces')).body.items.length >= 15);
  await login('demo.admin', comptes['demo.admin'].password);

  // la numérotation continue après les données de démonstration (pas de doublon avec les DI existantes)
  const max = Math.max(...d.collections.dis.filter(r => r.id.startsWith(`DI-ALG-${new Date().getFullYear()}-`)).map(r => Number(r.id.slice(-4))));
  const r = await expl.call('POST', '/data/dis/next-code', { unit: 'Alger' });
  assert.equal(r.status, 200); assert.equal(Number(r.body.codes[0].slice(-4)), max + 1);
});

test('démo : gestion des comptes et mots de passe verrouillés ; reste du site utilisable', async () => {
  const c = new Client(); await c.call('POST', '/auth/login', { id: 'demo.admin', password: 'Demo2026-Admin' });
  cfg.demo = true;
  try {
    for (const [m, p, b] of [['POST', '/users', { id: 'intrus', nom: 'x', role: 'Technicien', password: 'Motdepasse2026ok', droits: {} }], ['PUT', '/users/demo.technicien', { actif: false }], ['DELETE', '/users/demo.technicien'], ['POST', '/auth/change-password', { current: 'Demo2026-Admin', next: 'Autre2026-mdp-ok' }]]) {
      const r = await c.call(m, p, b); assert.equal(r.status, 403, `${m} ${p}`); assert.match(r.body.error.message, /démonstration/);
    }
    assert.equal((await c.call('GET', '/users')).status, 200);                               // consultation toujours possible
    assert.equal((await c.call('GET', '/data/dis')).status, 200);
    assert.equal((await c.call('POST', '/auth/login', { id: 'demo.admin', password: 'Demo2026-Admin' })).status, 200);
  } finally { cfg.demo = false; }
  assert.equal((await q("SELECT count(*)::int AS n FROM users WHERE id='intrus'")).rows[0].n, 0);
});

test('démo : remise à zéro = retour exact à l\'état initial (modifications, photos et comptes retirés)', async () => {
  const c = new Client(); await c.call('POST', '/auth/login', { id: 'demo.admin', password: 'Demo2026-Admin' });
  const avant = (await c.call('GET', '/data/dis')).body.items.length;
  await c.call('DELETE', `/data/dis/${(await c.call('GET', '/data/dis')).body.items[0].id}`);
  await c.call('PUT', '/data/pieces/P-VISITEUR', { data: { code: 'P-VISITEUR', nom: 'Ajouté par un visiteur' } });
  const dis0 = (await c.call('GET', '/data/dis')).body.items[0].id;
  await upload(c, { collection: 'dis', recordId: dis0 }, JPEG);
  assert.ok(fsx.readdirSync(FILES_DIR).length > 0);
  await resetDemo(new Date());
  const c2 = new Client(); assert.equal((await c2.call('POST', '/auth/login', { id: 'demo.admin', password: 'Demo2026-Admin' })).status, 200);
  assert.equal((await c2.call('GET', '/data/dis')).body.items.length, avant);
  assert.ok(!(await c2.call('GET', '/data/pieces')).body.items.some(i => i.id === 'P-VISITEUR'));
  assert.equal((await q('SELECT count(*)::int AS n FROM files')).rows[0].n, 0);
  assert.equal(fsx.existsSync(FILES_DIR) ? fsx.readdirSync(FILES_DIR).length : 0, 0);
  assert.equal((await q("SELECT count(*)::int AS n FROM users WHERE id='admin'")).rows[0].n, 1);   // le vrai compte admin n'est jamais touché
});

test('démo : jeu de données cohérent (références, formats, dates, droits)', () => {
  const d = genererDemo(new Date(2026, 9, 8)); const c = d.collections;
  const eqParCode = new Map(c.equipements.map(r => [r.id, r]));
  assert.ok(c.equipements.length >= 60);
  for (const r of c.dis) { const e = eqParCode.get(r.data.eq); assert.ok(e, r.id); assert.equal(r.unit, e.unit); assert.equal(r.system, e.system); assert.match(r.id, /^DI-[A-Z]{3}-20\d\d-\d{4}$/); }
  const disParCode = new Map(c.dis.map(r => [r.id, r]));
  for (const r of c.bts) {
    const e = eqParCode.get(r.data.eq); assert.ok(e, r.id); assert.equal(r.unit, e.unit);
    if (r.data.di) { assert.ok(disParCode.has(r.data.di), `${r.id} → ${r.data.di}`); assert.equal(disParCode.get(r.data.di).data.eq, r.data.eq); assert.match(r.id, /^OT-[A-Z]{3}-20\d\d-\d{4}$/); }
    else assert.match(r.id, /^OT-PREV-[A-Z]{3}-20\d\d-\d{4}$/);
    if (r.data.etat === 'Clôturé') assert.ok(r.data.dateCloture > r.data.dateGeneration, r.id);
  }
  const traites = c.dis.filter(r => r.data.etat === 'Traité'); assert.ok(traites.every(r => c.bts.some(b => b.data.di === r.id && b.data.etat === 'Clôturé')));
  assert.ok(c.dis.some(r => r.data.etat === 'À Transmettre') && c.dis.some(r => r.data.etat === 'Transmis'), 'DI ouvertes présentes');
  for (const p of c.planning) assert.ok(eqParCode.has(p.data.eq) && p.data.date >= d.aujourdhui.slice(0, 0));
  const pcs = new Set(c.pieces.map(r => r.id)); for (const b of c.bts) for (const it of b.data.pieces) assert.ok(pcs.has(it.code), `${b.id} → ${it.code}`);
  assert.ok(c.pieces.some(p => p.data.stock < p.data.min), 'des articles sous le seuil (alertes)');
  assert.ok(c.intervenants.some(i => i.data.habs.some(h => h.date)), 'habilitations');
  assert.ok(c.prestataires.some(p => p.data.dateFin < d.aujourdhui) && c.prestataires.some(p => p.data.cdc === 'À préparer'), 'alertes de contrats');
  // même date => mêmes données ; autre jour => dates décalées mais mêmes volumes
  assert.deepEqual(genererDemo(new Date(2026, 9, 8)).collections.dis.map(r => r.id), c.dis.map(r => r.id));
  assert.equal(genererDemo(new Date(2026, 11, 20)).collections.dis.length, c.dis.length);
});

// ───────────────────────── Configuration de production : refus des valeurs d'exemple ─────────────────────────
import { spawnSync } from 'node:child_process';
const configAvec = (env) => spawnSync(process.execPath, ['-e', "import('./src/config.js').then(()=>process.exit(0)).catch(e=>{console.error(e.message);process.exit(3)})"],
  { cwd: new URL('..', import.meta.url).pathname, env: { PATH: process.env.PATH, ...env }, encoding: 'utf8', timeout: 20000 });

test('configuration : les secrets et mots de passe d\'exemple sont refusés en production', () => {
  const bon = { NODE_ENV: 'production', DATABASE_URL: 'postgres://gmao:UnVraiMotDePasse-2026@db:5432/gmao', JWT_SECRET: 'x'.repeat(48) };
  assert.equal(configAvec(bon).status, 0, 'une configuration correcte doit être acceptée');
  let r = configAvec({ ...bon, DATABASE_URL: 'postgres://gmao:changez-moi-mot-de-passe@db:5432/gmao' });
  assert.equal(r.status, 3); assert.match(r.stderr, /mot de passe d'exemple/);
  r = configAvec({ ...bon, JWT_SECRET: 'changez-moi-cle-aleatoire-de-48-caracteres-minimum-xx' });
  assert.equal(r.status, 3);
  r = configAvec({ ...bon, JWT_SECRET: 'trop-court' });
  assert.equal(r.status, 3);
  r = configAvec({ NODE_ENV: 'production', DATABASE_URL: bon.DATABASE_URL });                  // secret absent
  assert.equal(r.status, 3);
});
