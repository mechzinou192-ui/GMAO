/*
 * useSynced(nom, options) : remplace useState pour une collection de données métier.
 *  - même API que useState : [valeur, setValeur, statut]  (setValeur accepte une fonction)
 *  - charge la collection depuis le serveur au montage
 *  - détecte les éléments créés / modifiés / supprimés (par identifiant) et les enregistre
 *  - resynchronise périodiquement les modifications des autres utilisateurs
 *  - en cas de conflit (même élément modifié ailleurs, code déjà pris), le serveur fait foi
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { api } from './api.js';
import * as REFERENTIELS from './referentiels.js';

export const REG = {};            // nom -> ref de la valeur courante (lisible par les autres collections)
const flushers = new Set();       // pour vider les files en attente (déconnexion)
const POLL_MS = 15000;
const RETRY_MS = 5000;

const byCode = (x) => x.code;
const asValueOf = (c) => !!(c.single || c.rows);
const BASE = {
  equipements:  { id: byCode, meta: (x) => ({ unit: x.unit, system: x.system }) },
  dis:          { id: byCode, newestFirst: true, fenetre: true },
  bts:          { id: byCode, newestFirst: true, fenetre: true },
  planning:     { id: byCode, meta: (x) => ({ unit: x.unit, system: x.sys }) },
  compteurs_eq: { id: byCode, meta: (x) => ({ unit: x.unit, system: x.sys }) },
  pieces:       { id: byCode },
  rapports:     { id: byCode, newestFirst: true, meta: (r) => ({ unit: r.unit, system: null }) },
  profils:      { id: (p) => p.nom },
  dss:          { id: byCode, newestFirst: true },
  bs:           { id: byCode, newestFirst: true },
  brs:          { id: byCode, newestFirst: true },
  decharges:    { id: byCode, newestFirst: true },
  intervenants: { id: (x) => x.mat },
  prestataires: { id: (x) => x.mat },
  mesures:      { id: byCode },
  controles:    { id: byCode },
  organismes:   { id: byCode },
  // référentiels : l'application les voit comme une liste / un objet, le serveur les stocke une ligne par élément
  systemes:     { rows: REFERENTIELS.systemes },
  arborescence: { rows: REFERENTIELS.arborescence },
  feries:       { rows: REFERENTIELS.feries },
};

// Fenêtre de chargement : les DI / OT clos depuis plus de FENETRE_MOIS ne sont pas chargés au démarrage
// (application rapide même après des années de données). chargerHistorique() recharge tout, sur demande.
export const FENETRE_MOIS = 24;
let historiqueComplet = false;
export const historiqueCharge = () => historiqueComplet;
export async function chargerHistorique() {
  historiqueComplet = true;
  await Promise.all([...flushers].filter((f) => f.fenetre).map((f) => f.refresh()));
}

export const hasPending = () => [...flushers].some((f) => f.pending());
// Recharge toutes les listes depuis le serveur (après un import en masse)
export const refreshAll = () => Promise.all([...flushers].map((f) => (f.refresh ? f.refresh() : null)));
export const flushAll = () => Promise.all([...flushers].map((f) => f.flush()));
const emitError = (msg) => window.dispatchEvent(new CustomEvent('gmao:error', { detail: msg }));

export function useSynced(name, opts = {}) {
  const cfg = { ...BASE[name], ...opts };
  const cfgRef = useRef(cfg); cfgRef.current = cfg;
  const asValue = !!(cfg.single || cfg.rows);          // valeur unique (liste ou objet) plutôt que liste d'éléments
  const initial = asValue ? cfg.defaults : [];
  const [items, setItemsState] = useState(initial);
  const [status, setStatus] = useState('loading');
  const ref = useRef(initial); REG[name] = ref;
  const versions = useRef(new Map());
  const store = useRef(new Map());                    // référentiels : id de ligne -> données connues du serveur
  const queue = useRef(new Map());
  const timer = useRef(null);
  const flushing = useRef(false);
  const since = useRef(null);
  const alive = useRef(true);

  const apply = (next) => { ref.current = next; if (alive.current) setItemsState(next); };

  const build = (recs) => {
    const c = cfgRef.current;
    if (c.rows) {
      const live = recs.filter((r) => !r.deleted);
      store.current = new Map(live.map((r) => [r.id, r.data]));
      live.forEach((r) => versions.current.set(r.id, r.version));
      return live.length ? c.rows.fromRows(live.map((r) => r.data)) : null;
    }
    if (c.single) {
      const r = recs.find((x) => x.id === 'main' && !x.deleted);
      if (!r) return null;
      versions.current.set('main', r.version);
      return c.unwrap ? c.unwrap(r.data) : r.data;
    }
    const sorted = [...recs].sort((a, b) =>
      c.newestFirst
        ? String(b.createdAt).localeCompare(String(a.createdAt)) || String(b.id).localeCompare(String(a.id))
        : String(a.createdAt).localeCompare(String(b.createdAt)) || String(a.id).localeCompare(String(b.id)));
    sorted.forEach((r) => versions.current.set(r.id, r.version));
    return sorted.map((r) => (c.unwrap ? c.unwrap(r.data) : r.data));
  };

  const seedServer = async () => {
    const c = cfgRef.current;
    if (c.rows) {
      await api.bulkImport(name, c.rows.toRows(c.defaults).map((r) => ({ id: r.id, data: r.data })));
    } else if (c.single) {
      const res = await api.save(name, 'main', { unit: '', system: null, data: c.wrap ? c.wrap(c.defaults) : c.defaults });
      versions.current.set('main', res.version);
    } else {
      await api.bulkImport(name, c.defaults.map((x) => ({ id: c.id(x), data: x })));
    }
  };

  const load = useCallback(async (allowSeed = true) => {
    const c = cfgRef.current;
    try {
      const res = await api.list(name, undefined, c.fenetre && !historiqueComplet ? { fenetre: FENETRE_MOIS } : undefined);
      since.current = res.serverTime;
      versions.current.clear();
      let next = build(res.items);
      const empty = asValueOf(c) ? next === null : res.items.length === 0;
      if (empty && c.defaults) {
        // serveur vierge : le super administrateur initialise les référentiels par défaut
        if (c.sa && allowSeed) { await seedServer(); return load(false); }
        next = c.defaults;
      }
      apply(next === null ? (asValueOf(c) ? c.defaults : []) : next);
      setStatus('ready');
    } catch (e) {
      if (e.status !== 401) setStatus('error');
    }
  }, []);

  const flush = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    try {
      while (queue.current.size) {
        const batch = [...queue.current.entries()];
        queue.current.clear();
        const lignes = cfgRef.current.rows ? new Map(cfgRef.current.rows.toRows(ref.current).map((r) => [r.id, r.data])) : null;
        for (const [id, op] of batch) {
          const c = cfgRef.current;
          try {
            if (op === 'del') {
              try { await api.remove(name, id); } catch (e) { if (e.status !== 404) throw e; }
              versions.current.delete(id);
              store.current.delete(id);
            } else {
              const item = c.rows ? lignes.get(id) : c.single ? ref.current : ref.current.find((x) => c.id(x) === id);
              if (item === undefined) continue;
              const m = c.rows || c.single || !c.meta ? { unit: '', system: null } : c.meta(item);
              const res = await api.save(name, id, {
                ...m, data: c.wrap ? c.wrap(item) : item, version: versions.current.get(id) });
              versions.current.set(id, res.version);
              // le serveur peut compléter la saisie (ex. validation DG remise « À valider ») : on reprend sa version,
              // sauf si l'élément a encore été modifié localement entre-temps
              const envoye = c.wrap ? c.wrap(item) : item;
              const differe = res.data && JSON.stringify(res.data) !== JSON.stringify(envoye) && !queue.current.has(id);
              if (c.rows) store.current.set(id, differe ? res.data : item);
              if (differe && c.rows) apply(c.rows.fromRows([...store.current.values()]));
              else if (differe && !c.single) {
                const srv = c.unwrap ? c.unwrap(res.data) : res.data;
                apply(ref.current.map((x) => (String(c.id(x)) === id ? srv : x)));
              }
            }
          } catch (e) {
            if (e.network) {
              queue.current.set(id, op);           // réessai automatique
              emitError('Connexion au serveur perdue : vos modifications seront enregistrées dès son retour.');
              clearTimeout(timer.current); timer.current = setTimeout(flush, RETRY_MS);
            } else if (e.status === 429) {
              // limite de débit atteinte : la modification est conservée et renvoyée après le délai indiqué par le serveur
              queue.current.set(id, op);
              emitError(`Trop de requêtes : vos modifications seront enregistrées dans ${e.retryAfter || 5} s.`);
              clearTimeout(timer.current); timer.current = setTimeout(flush, Math.max(RETRY_MS, (e.retryAfter || 0) * 1000));
              return;
            } else if (e.status === 401) {
              return;
            } else {
              emitError(e.code === 'EXISTS'
                ? `« ${id} » existe déjà (créé par un autre utilisateur). Votre saisie n'a pas été enregistrée : recommencez.`
                : e.code === 'CONFLICT'
                  ? `« ${id} » a été modifié par un autre utilisateur. Vos changements n'ont pas été enregistrés ; les données ont été actualisées.`
                  : `Enregistrement refusé (${id}) : ${e.message}`);
              await load(false);                    // le serveur fait foi
            }
          }
        }
      }
    } finally {
      flushing.current = false;
    }
  }, []);

  const schedule = () => { clearTimeout(timer.current); timer.current = setTimeout(flush, 350); };
  const enqueue = (id, op) => { queue.current.set(id, op); schedule(); };

  const setItems = useCallback((upd) => {
    const prev = ref.current;
    const next = typeof upd === 'function' ? upd(prev) : upd;
    if (next === prev) return;
    apply(next);
    const c = cfgRef.current;
    if (c.rows) {                         // une ligne par élément : seules les lignes modifiées sont enregistrées
      const pr = new Map(c.rows.toRows(prev).map((r) => [r.id, r.data]));
      const nr = new Map(c.rows.toRows(next).map((r) => [r.id, r.data]));
      for (const [id, d] of nr) { const p = pr.get(id); if (!p || JSON.stringify(p) !== JSON.stringify(d)) enqueue(id, 'save'); }
      for (const id of pr.keys()) if (!nr.has(id)) enqueue(id, 'del');
      return;
    }
    if (c.single) return enqueue('main', 'save');
    const pm = new Map(prev.map((x) => [String(c.id(x)), x]));
    const nm = new Map(next.map((x) => [String(c.id(x)), x]));
    for (const [id, x] of nm) {
      if (id === 'undefined' || id === 'null' || id === '') continue;
      const p = pm.get(id);
      if (!p || (p !== x && JSON.stringify(p) !== JSON.stringify(x))) enqueue(id, 'save');
    }
    for (const id of pm.keys()) if (!nm.has(id)) enqueue(id, 'del');
  }, []);

  // modifications des autres utilisateurs (fenêtre de recouvrement de 5 s, fusion idempotente par version)
  const poll = useCallback(async () => {
    if (document.hidden || queue.current.size || flushing.current || !since.current) return;
    try {
      const from = new Date(new Date(since.current).getTime() - 5000).toISOString();
      const res = await api.list(name, from);
      since.current = res.serverTime;
      const c = cfgRef.current;
      if (c.rows) {
        let changed = false;
        for (const r of res.items) {
          const lv = versions.current.get(r.id);
          if (lv !== undefined && r.version <= lv) continue;
          versions.current.set(r.id, r.version);
          if (r.deleted) { if (store.current.delete(r.id)) changed = true; } else { store.current.set(r.id, r.data); changed = true; }
        }
        if (changed) apply(c.rows.fromRows([...store.current.values()]));
        return;
      }
      if (c.single) {
        const r = res.items.find((x) => x.id === 'main' && !x.deleted);
        if (r && r.version > (versions.current.get('main') || 0)) {
          versions.current.set('main', r.version);
          apply(c.unwrap ? c.unwrap(r.data) : r.data);
        }
        return;
      }
      let cur = ref.current, changed = false;
      for (const r of res.items) {
        const lv = versions.current.get(r.id);
        if (lv !== undefined && r.version <= lv) continue;
        const idx = cur.findIndex((x) => String(c.id(x)) === r.id);
        if (r.deleted) {
          versions.current.set(r.id, r.version);
          if (idx >= 0) { cur = cur.filter((_, i) => i !== idx); changed = true; }
        } else {
          const item = c.unwrap ? c.unwrap(r.data) : r.data;
          versions.current.set(r.id, r.version);
          if (idx >= 0) cur = cur.map((x, i) => (i === idx ? item : x));
          else cur = c.newestFirst ? [item, ...cur] : [...cur, item];
          changed = true;
        }
      }
      if (changed) apply(cur);
    } catch { /* réseau coupé : on réessaiera au prochain cycle */ }
  }, []);

  useEffect(() => {
    alive.current = true;
    load();
    const iv = setInterval(poll, POLL_MS);
    const f = { pending: () => queue.current.size > 0 || flushing.current, flush: async () => { clearTimeout(timer.current); await flush(); }, refresh: () => load(false), fenetre: !!cfgRef.current.fenetre };
    flushers.add(f);
    return () => { alive.current = false; clearInterval(iv); clearTimeout(timer.current); flushers.delete(f); delete REG[name]; };
  }, []);

  return [items, setItems, status, load];
}
