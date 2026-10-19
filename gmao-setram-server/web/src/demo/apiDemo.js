/*
 * SITE DE DÉMONSTRATION STATIQUE — un « mini serveur » qui tourne dans le navigateur.
 *
 * Remplace les appels au serveur (src/api.js) par le même comportement, en mémoire : mêmes règles de droits (unité /
 * système / volet), même numérotation (DI-ALG-2026-0001…), mêmes conflits de version, même import Excel tout-ou-rien,
 * mêmes limites de photos. Les droits et les formats viennent des MÊMES fichiers que le vrai serveur (rights-core.js,
 * numbering-core.js) : la démonstration ne peut pas diverger du comportement réel.
 *
 * Aucune donnée ne quitte le navigateur. L'état est gardé le temps de l'onglet (sessionStorage) : fermer l'onglet
 * remet la démonstration à zéro. Aucun hébergement avec serveur ni base de données n'est nécessaire : un simple dossier
 * de fichiers statiques suffit.
 */
import { genererDemo, ABBR } from '../../../server/src/demo/donnees.js';
import { horsFenetre, lireFenetre } from '../../../server/src/archives-core.js';
import { lignesReferentiels } from '../../../server/src/demo/referentiels.js';
import { COLLECTIONS, canRead, canWrite } from '../../../server/src/rights-core.js';
import { SEQUENCES, MAX_BATCH, sequenceKey, unitAbbr, currentYear, formatCode } from '../../../server/src/numbering-core.js';

const UNITS = Object.keys(ABBR);
const CLE = 'gmao-demo-statique-v3';
const ATTACHABLE = new Set(['dis', 'bts']);
const MAX_FICHIERS = 12, MAX_OCTETS = 10 * 1024 * 1024;
const DEMO_BLOQUEE = 'Désactivé dans la version de démonstration.';

const err = (status, message, extra = {}) => Object.assign(new Error(message), { status, ...extra });
const isObj = (o) => o && typeof o === 'object' && !Array.isArray(o);
const validId = (id) => typeof id === 'string' && id.length > 0 && id.length <= 200 && !/[\\/?#]/.test(id);

export function createDemoApi({ now = new Date(), stockage = (typeof sessionStorage !== 'undefined' ? sessionStorage : null) } = {}) {
  const jeu = genererDemo(now);
  const comptes = jeu.users;
  let horloge = 0;
  const tick = () => { horloge = Math.max(Date.now(), horloge + 1); return new Date(horloge).toISOString(); };
  const blobs = new Map();                                   // id de fichier -> URL locale (non conservée au rechargement)

  /* ───── état ───── */
  let etat = null;
  const initial = () => {
    const t = new Date().toISOString();
    const records = {}; const put = (c, id, unit, system, data) => { (records[c] ||= {})[id] = { id, unit, system, data, version: 1, deleted: false, createdAt: t, updatedAt: t }; };
    const ref = lignesReferentiels();
    ref.systemes.forEach((r) => put('systemes', r.id, '', null, r.data));
    ref.arborescence.forEach((r) => put('arborescence', r.id, '', null, r.data));
    for (const [c, liste] of Object.entries(jeu.collections)) liste.forEach((r) => put(c, r.id, r.unit, r.system, r.data));
    const compteurs = {};
    jeu.compteurs.forEach((c) => { compteurs[`${c.name}|${c.scope}|${c.year}`] = c.last; });
    return { records, compteurs, audit: [], fichiers: {}, session: null };
  };
  const charger = () => {
    try { const j = stockage && stockage.getItem(CLE); if (j) { const e = JSON.parse(j); if (e && e.records) return { ...e, fichiers: {} }; } } catch { /* état illisible : on repart de zéro */ }
    return initial();
  };
  const sauver = () => { try { stockage && stockage.setItem(CLE, JSON.stringify({ ...etat, fichiers: {} })); } catch { /* quota dépassé : sans importance pour une démo */ } };
  etat = charger();

  /* ───── utilitaires ───── */
  const publicUser = (u) => ({ id: u.id, nom: u.nom, role: u.role, actif: true, superAdmin: u.superAdmin, mustChangePw: false, droits: u.droits });
  const actuel = (silencieux = false) => {
    const u = etat.session && comptes.find((c) => c.id === etat.session);
    if (!u) { if (!silencieux && typeof window !== 'undefined') window.dispatchEvent(new Event('gmao:unauth')); throw err(401, 'Non authentifié.'); }
    return { ...publicUser(u), super_admin: u.superAdmin };      // forme attendue par rights-core.js
  };
  const toApi = (r) => ({ id: r.id, unit: r.unit, system: r.system, data: r.data, version: r.version, deleted: r.deleted, createdAt: r.createdAt, updatedAt: r.updatedAt });
  const col = (c) => { if (!COLLECTIONS[c]) throw err(404, 'Collection inconnue.'); return (etat.records[c] ||= {}); };
  const unitDe = (def, brut) => (def.shared ? '' : (UNITS.includes(String(brut ?? '')) ? String(brut) : null));
  const journal = (user, action, extra = {}) => {
    etat.audit.push({ id: etat.audit.length + 1, at: new Date().toISOString(), user_id: user.id, action, collection: extra.collection ?? null, record_id: extra.recordId ?? null, unit: extra.unit ?? null, detail: extra.detail ?? null, ip: null });
    if (etat.audit.length > 500) etat.audit.shift();
  };
  const enregistrer = (r) => r;

  /* ───── numérotation (mêmes formats que le serveur) ───── */
  const reserver = (cle, { unit, count = 1 }) => {
    const def = SEQUENCES[cle];
    const abbr = def.perUnit ? unitAbbr(unit) : '';
    const an = def.yearly ? currentYear() : 0;
    const codes = [];
    for (let garde = 0; codes.length < count && garde < count + 1000; garde++) {
      const k = `${cle}|${abbr}|${an}`;
      etat.compteurs[k] = (etat.compteurs[k] || 0) + 1;
      const code = formatCode(def, { abbr, year: currentYear(), n: etat.compteurs[k] });
      if (!(etat.records[def.collection] || {})[code]) codes.push(code);        // un code déjà pris est sauté
    }
    return codes;
  };

  const api = {
    /* ───── session ───── */
    login: async (id, password) => {
      const u = comptes.find((c) => c.id === String(id).trim().toLowerCase());
      if (!u || u.password !== password) throw err(401, 'Identifiant ou mot de passe incorrect.');
      etat.session = u.id; sauver();
      return { user: publicUser(u) };
    },
    logout: async () => { etat.session = null; sauver(); return { ok: true }; },
    me: async () => ({ user: publicUser(comptes.find((c) => c.id === (actuel(true).id))) }),
    changePassword: async () => { throw err(403, DEMO_BLOQUEE); },

    /* ───── données ───── */
    list: async (collection, since, opts = {}) => {
      const user = actuel();
      const serverTime = new Date().toISOString();
      let rows = Object.values(col(collection));
      const fenetre = lireFenetre(opts.fenetre);
      if (Number.isNaN(fenetre)) throw err(400, 'fenetre invalide');
      if (fenetre && !since) rows = rows.filter((r) => !horsFenetre(collection, r.data, r.updatedAt, fenetre));
      if (since) { const d = new Date(since); if (Number.isNaN(d.getTime())) throw err(400, 'since invalide'); rows = rows.filter((r) => new Date(r.updatedAt) > d); }
      else rows = rows.filter((r) => !r.deleted);
      rows.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : 1));
      return { items: rows.filter((r) => canRead(user, collection, r.unit, r.system)).map(toApi), serverTime };
    },
    save: async (collection, id, { unit, system, data, version }) => {
      const user = actuel(); const def = COLLECTIONS[collection]; const rows = col(collection);
      if (!validId(id)) throw err(400, 'Identifiant invalide.');
      if (!isObj(data)) throw err(400, '`data` doit être un objet.');
      const u = unitDe(def, unit); if (u === null) throw err(400, 'Unité invalide.');
      const sys = system ? String(system).slice(0, 40) : null;
      if (!canWrite(user, collection, u, sys)) throw err(403, "Vous n'avez pas le droit de modifier ces données.");
      const cur = rows[id];
      const t = tick();
      let out;
      if (cur && !cur.deleted) {
        if (!canWrite(user, collection, cur.unit, cur.system)) throw err(403, "Vous n'avez pas le droit de modifier ces données.");
        if (version === undefined || version === null) throw err(409, 'Ce code existe déjà (créé par un autre utilisateur).', { code: 'EXISTS', current: toApi(cur) });
        if (Number(version) !== cur.version) throw err(409, 'Cet élément a été modifié par un autre utilisateur.', { code: 'CONFLICT', current: toApi(cur) });
        out = Object.assign(cur, { unit: u, system: sys, data: JSON.parse(JSON.stringify(data)), version: cur.version + 1, updatedAt: t });
        journal(user, 'update', { collection, recordId: id, unit: u, detail: { version: out.version, system: sys } });
      } else if (cur) {
        out = Object.assign(cur, { unit: u, system: sys, data: JSON.parse(JSON.stringify(data)), version: cur.version + 1, deleted: false, updatedAt: t });
        journal(user, 'create', { collection, recordId: id, unit: u, detail: { version: out.version, system: sys, recreated: true } });
      } else {
        out = rows[id] = { id, unit: u, system: sys, data: JSON.parse(JSON.stringify(data)), version: 1, deleted: false, createdAt: t, updatedAt: t };
        journal(user, 'create', { collection, recordId: id, unit: u, detail: { version: 1, system: sys } });
      }
      sauver();
      return enregistrer(toApi(out));
    },
    remove: async (collection, id) => {
      const user = actuel(); const cur = col(collection)[id];
      if (!cur || cur.deleted) throw err(404, 'Introuvable.');
      if (!canWrite(user, collection, cur.unit, cur.system)) throw err(403, "Vous n'avez pas le droit de supprimer ces données.");
      Object.assign(cur, { deleted: true, version: cur.version + 1, updatedAt: tick() });
      journal(user, 'delete', { collection, recordId: id, unit: cur.unit });
      sauver();
      return { ok: true };
    },
    nextCodes: async (collection, { unit, variant, count = 1 } = {}) => {
      const user = actuel();
      const cle = sequenceKey(collection, variant ? String(variant) : '');
      const def = SEQUENCES[cle];
      if (!def) throw err(404, 'Pas de numérotation pour cette collection.');
      const u = def.perUnit ? String(unit ?? '') : '';
      if (def.perUnit && !UNITS.includes(u)) throw err(400, 'Unité invalide.');
      if (!Number.isInteger(count) || count < 1 || count > MAX_BATCH) throw err(400, `count doit être compris entre 1 et ${MAX_BATCH}.`);
      if (!canWrite(user, collection, def.perUnit ? u : '', null)) throw err(403, "Vous n'avez pas le droit de créer ces données.");
      const codes = reserver(cle, { unit: u, count }); sauver();
      return codes;
    },
    bulkImport: async (collection, items) => {
      const user = actuel(); if (!user.super_admin) throw err(403, 'Réservé au super administrateur.');
      const rows = col(collection); let n = 0; const t = tick();
      for (const it of items || []) { if (!rows[it.id]) { rows[it.id] = { id: it.id, unit: it.unit || '', system: it.system || null, data: it.data, version: 1, deleted: false, createdAt: t, updatedAt: t }; n++; } }
      sauver(); return { imported: n };
    },

    /* ───── import Excel (tout ou rien, comme le serveur) ───── */
    importExcel: async (body) => {
      const user = actuel(); if (!user.super_admin) throw err(403, 'Réservé au super administrateur.');
      const b = body || {};
      const onConflict = b.onConflict === undefined ? 'skip' : b.onConflict;
      if (!['skip', 'update'].includes(onConflict)) throw err(400, "onConflict doit valoir 'skip' ou 'update'.");
      if (!isObj(b.collections) || !Object.keys(b.collections).length) throw err(400, 'Aucune donnée à importer.');
      const plan = [];
      for (const [name, items] of Object.entries(b.collections)) {
        const def = COLLECTIONS[name]; if (!def) throw err(400, `Collection inconnue : ${name}.`);
        if (!Array.isArray(items) || items.length > 20000) throw err(400, `${name} : liste invalide (max 20000 éléments).`);
        const vus = new Set();
        for (const it of items) {
          const u = unitDe(def, it?.unit); if (u === null) throw err(400, `${name} : unité invalide pour « ${it?.id} ».`);
          if (!validId(it?.id)) throw err(400, `${name} : identifiant invalide.`);
          if (!isObj(it.data)) throw err(400, `${name} : données invalides pour « ${it.id} ».`);
          if (vus.has(it.id)) throw err(400, `${name} : identifiant en double dans le fichier : « ${it.id} ».`);
          vus.add(it.id);
        }
        plan.push({ name, def, items });
      }
      const totals = { created: 0, updated: 0, skipped: 0 }; const rapport = {};
      const t = tick();
      for (const { name, def, items } of plan) {
        const r = (rapport[name] = { created: 0, updated: 0, skipped: 0 }); const rows = col(name);
        for (const it of items) {
          const u = unitDe(def, it.unit); const sys = it.system ? String(it.system).slice(0, 40) : null; const cur = rows[it.id];
          const data = JSON.parse(JSON.stringify(it.data));
          if (!cur) { if (!b.dryRun) rows[it.id] = { id: it.id, unit: u, system: sys, data, version: 1, deleted: false, createdAt: t, updatedAt: t }; r.created++; }
          else if (cur.deleted) { if (!b.dryRun) Object.assign(cur, { unit: u, system: sys, data, deleted: false, version: cur.version + 1, updatedAt: t }); r.created++; }
          else if (it.overwrite === true || onConflict === 'update') { if (!b.dryRun) Object.assign(cur, { unit: u, system: sys, data, version: cur.version + 1, updatedAt: t }); r.updated++; }
          else r.skipped++;
        }
        totals.created += r.created; totals.updated += r.updated; totals.skipped += r.skipped;
      }
      if (!b.dryRun) { journal(user, 'import_excel', { detail: { onConflict, totals, collections: rapport } }); sauver(); }
      return { dryRun: b.dryRun === true, onConflict, totals, collections: rapport };
    },

    /* ───── photos (conservées le temps de l'onglet) ───── */
    listFiles: async (collection, recordId) => {
      const user = actuel();
      if (!ATTACHABLE.has(collection)) throw err(400, 'Collection ou enregistrement invalide.');
      const rec = (etat.records[collection] || {})[recordId];
      if (!rec || rec.deleted) return [];
      if (!canRead(user, collection, rec.unit, rec.system)) throw err(403, "Vous n'avez pas accès à ces données.");
      return Object.values(etat.fichiers).filter((f) => f.collection === collection && f.recordId === recordId)
        .map(({ id, name, mime, size, uploadedBy, createdAt }) => ({ id, name, mime, size, uploadedBy, createdAt }));
    },
    uploadFile: async (collection, recordId, blob, name) => {
      const user = actuel();
      if (!ATTACHABLE.has(collection) || !recordId) throw err(400, 'Collection ou enregistrement invalide.');
      const rec = (etat.records[collection] || {})[recordId];
      if (!rec || rec.deleted) throw err(404, "Enregistrement introuvable (a-t-il bien été enregistré ?).");
      if (!canWrite(user, collection, rec.unit, rec.system)) throw err(403, "Vous n'avez pas le droit d'ajouter une pièce jointe ici.");
      if (!blob || !blob.size) throw err(400, 'Aucun fichier reçu.');
      if (blob.size > MAX_OCTETS) throw err(413, 'Fichier ou envoi trop volumineux.');
      const mime = await detecterImage(blob);
      if (!mime) throw err(415, 'Format non accepté : photos JPEG, PNG ou WebP uniquement.');
      if (Object.values(etat.fichiers).filter((f) => f.collection === collection && f.recordId === recordId).length >= MAX_FICHIERS)
        throw err(409, `Maximum ${MAX_FICHIERS} pièces jointes par élément.`);
      const id = (globalThis.crypto && crypto.randomUUID) ? crypto.randomUUID() : `f-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const meta = { id, collection, recordId, name: String(name || 'photo').split(/[\\/]/).pop().slice(0, 80) || 'photo', mime, size: blob.size, uploadedBy: user.id, createdAt: new Date().toISOString() };
      etat.fichiers[id] = meta;
      if (typeof URL !== 'undefined' && URL.createObjectURL) blobs.set(id, URL.createObjectURL(blob));
      journal(user, 'file_added', { collection, recordId, unit: rec.unit, detail: { id, name: meta.name, size: meta.size } });
      const { collection: c0, recordId: r0, ...pub } = meta; void c0; void r0;
      return pub;
    },
    deleteFile: async (id) => {
      const user = actuel(); const f = etat.fichiers[id];
      if (!f) throw err(404, 'Fichier introuvable.');
      const rec = (etat.records[f.collection] || {})[f.recordId];
      if (!rec || !canWrite(user, f.collection, rec.unit, rec.system)) throw err(403, "Vous n'avez pas accès à ce fichier.");
      delete etat.fichiers[id];
      const u = blobs.get(id); if (u && URL.revokeObjectURL) URL.revokeObjectURL(u); blobs.delete(id);
      journal(user, 'file_deleted', { collection: f.collection, recordId: f.recordId, unit: rec.unit, detail: { id, name: f.name } });
      return { ok: true };
    },
    fileUrl: (id) => blobs.get(id) || '',

    /* ───── administration (consultation seulement) ───── */
    users: async () => {
      const user = actuel(); if (!user.super_admin) throw err(403, 'Accès réservé au super administrateur.');
      return { users: comptes.map((u) => ({ ...publicUser(u), createdAt: null })) };
    },
    createUser: async () => { throw err(403, DEMO_BLOQUEE); },
    updateUser: async () => { throw err(403, DEMO_BLOQUEE); },
    deleteUser: async () => { throw err(403, DEMO_BLOQUEE); },
    audit: async (limit = 200) => {
      const user = actuel(); if (!user.super_admin) throw err(403, 'Accès réservé au super administrateur.');
      return { entries: [...etat.audit].reverse().slice(0, Math.min(limit, 1000)) };
    },

    /* ───── écran de connexion : profils de démonstration ───── */
    demo: async () => ({ demo: true, statique: true, resetHeures: 0,
      comptes: comptes.map(({ id, nom, role, password, description }) => ({ id, nom, role, motDePasse: password, description })) }),

    // pour les tests : état interne et remise à zéro
    _reinitialiser: () => { etat = initial(); sauver(); },
    _etat: () => etat,
  };
  return api;
}

// Le type d'une image est déterminé par son contenu (signature), jamais par ce qu'annonce le navigateur.
async function octets(blob, n) {
  const part = blob.slice(0, n);
  if (part.arrayBuffer) return new Uint8Array(await part.arrayBuffer());
  return new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(new Uint8Array(r.result)); r.onerror = () => ko(r.error); r.readAsArrayBuffer(part); });
}
export async function detecterImage(blob) {
  const b = await octets(blob, 12);
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if ([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v)) return 'image/png';
  const t = (i, s) => [...s].every((c, k) => b[i + k] === c.charCodeAt(0));
  if (t(0, 'RIFF') && t(8, 'WEBP')) return 'image/webp';
  return null;
}
