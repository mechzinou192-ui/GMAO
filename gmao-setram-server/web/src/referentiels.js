/*
 * Référentiels partagés (systèmes, arborescence, jours fériés) : l'application les manipule sous forme de liste ou
 * d'objet, le serveur les stocke UNE LIGNE PAR ÉLÉMENT. Deux administrateurs qui modifient deux éléments différents
 * ne se gênent donc plus (avant : une seule fiche pour tout le référentiel, le second perdait sa saisie).
 *
 * toRows(valeur)   -> [{ id, data }]       fromRows(liste de data) -> valeur
 * Les ids sont déterministes : même valeur => mêmes ids, ce qui permet de n'enregistrer que ce qui a changé.
 */
const num = (a, b) => (a ?? 0) - (b ?? 0);
const txt = (a, b) => String(a ?? '').localeCompare(String(b ?? ''));

/* systèmes : [[code, nom], ...] — l'ordre est conservé */
export const systemes = {
  toRows: (v) => (v || []).map(([code, nom], i) => ({ id: String(code), data: { code, nom, ordre: i } })),
  fromRows: (ds) => [...ds].sort((a, b) => num(a.ordre, b.ordre) || txt(a.code, b.code)).map((d) => [d.code, d.nom]),
};

/* arborescence : { SYS: [{ code, sub }, ...] } — une ligne « en-tête » par système (même s'il n'a aucun sous-système) */
export const arborescence = {
  toRows: (v) => Object.entries(v || {}).flatMap(([sys, subs], i) => [
    { id: sys, data: { system: sys, header: true, ordre: i } },
    ...(subs || []).map((s, j) => ({ id: `${sys}.${s.code}`, data: { system: sys, code: s.code, sub: s.sub, ordre: j, ...(s.validationDG ? { validationDG: s.validationDG } : {}) } })),
  ]),
  fromRows: (ds) => {
    const out = {};
    const heads = ds.filter((d) => d.header).sort((a, b) => num(a.ordre, b.ordre) || txt(a.system, b.system));
    heads.forEach((h) => { out[h.system] = []; });
    ds.filter((d) => !d.header).sort((a, b) => num(a.ordre, b.ordre) || txt(a.code, b.code)).forEach((d) => {
      (out[d.system] ||= []).push({ code: d.code, sub: d.sub, ...(d.validationDG ? { validationDG: d.validationDG } : {}) });   // validation DG conservée
    });
    return out;
  },
};

/* jours fériés : [{ nom, md: 'MM-JJ' } | { nom, date: 'AAAA-MM-JJ' }] — triés par date */
const cleFerie = (f) => (f.md ? `md:${f.md}` : `date:${f.date}`);
export const feries = {
  toRows: (v) => {
    const vus = new Map();
    return (v || []).map((f) => {
      const k = cleFerie(f); const n = (vus.get(k) || 0) + 1; vus.set(k, n);
      return { id: n === 1 ? k : `${k}~${n}`, data: f.md ? { nom: f.nom, md: f.md } : { nom: f.nom, date: f.date } };
    });
  },
  fromRows: (ds) => [...ds].sort((a, b) => txt(a.date || a.md, b.date || b.md) || txt(a.nom, b.nom)),
};
