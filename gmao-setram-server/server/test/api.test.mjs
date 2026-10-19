// Test de bout en bout : lance le serveur sur une base vierge et vérifie auth + droits.
// Usage : DATABASE_URL=postgres://... JWT_SECRET=... node --test test/
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET ||= 'test-secret-test-secret-test-secret-1234567890';
process.env.ADMIN_INITIAL_PASSWORD = 'Initial2026pw';
process.env.FILES_DIR = `/tmp/gmao-test-files-${process.pid}`;

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

test('création d’un technicien avec droits limités (Alger, CFO, volets 0-1)', async () => {
  let r = await admin.call('POST', '/users', {
    id: 'k.belaid', nom: 'K. Belaïd', role: 'Technicien', password: 'Tech2026motdepasse',
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
  assert.equal((await tech.call('PUT', '/data/systemes/main', { data: { list: [] } })).status, 200);                     // référentiel : volet 0 suffit
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

async function newUser(id, droits, password = 'Motdepasse2026ok') {
  const r = await admin.call('POST', '/users', { id, nom: id, role: 'Technicien', password: 'Provisoire2026ok', droits });
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
  assert.equal((await admin.call('POST', '/data/dis/next-code', { unit: 'Alger', count: 201 })).status, 400);
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

test('import : gros volume (3000 lignes) et journal d’audit', async () => {
  const items = Array.from({ length: 3000 }, (_, i) => ({ id: `P-BIG-${i}`, data: { nom: `Article ${i}`, stock: i } }));
  const t0 = Date.now();
  const r = await imp(admin, { collections: { pieces: items } });
  assert.equal(r.status, 200);
  assert.equal(r.body.totals.created, 3000);
  assert.ok(Date.now() - t0 < 60000, 'import trop lent');
  const log = (await admin.call('GET', '/users/audit/log?limit=50')).body.entries.find(e => e.action === 'import_excel' && e.detail.collections.pieces?.created === 3000);
  assert.ok(log, 'import absent du journal');
  assert.equal(log.detail.onConflict, 'skip');
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
  assert.match((await r.json()).error, /trop volumineux/);
  for (let i = 0; i < 12; i++) assert.equal((await upload(admin, { collection: 'dis', recordId: 'DI-F2' }, JPEG)).status, 201, `envoi ${i + 1}`);
  const r13 = await upload(admin, { collection: 'dis', recordId: 'DI-F2' }, JPEG);
  assert.equal(r13.status, 409); assert.match(r13.body.error, /Maximum 12/);
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

// ───────────────────────── Mode démonstration ─────────────────────────
const { seedDemo, resetDemo, demoDejaPresente } = await import('../src/demo/seed.js');
const { genererDemo } = await import('../src/demo/donnees.js');
const { lignesReferentiels } = await import('../src/demo/referentiels.js');
const { config: cfg } = await import('../src/config.js');

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
  const dis = (await tech.call('GET', '/data/dis')).body.items;
  assert.ok(dis.length > 5 && dis.every(i => i.unit === 'Alger' && ['CFO', 'CFA', 'BILLETTIQUE'].includes(i.system)), 'le technicien ne voit que son périmètre');
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
      const r = await c.call(m, p, b); assert.equal(r.status, 403, `${m} ${p}`); assert.match(r.body.error, /démonstration/);
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
