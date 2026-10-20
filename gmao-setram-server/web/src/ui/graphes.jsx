// Graphiques SVG légers (aucune bibliothèque externe : compatibles avec la CSP du serveur).
// Règles : traits fins, barres arrondies côté valeur et ancrées sur la ligne de base, un seul axe Y,
// infobulle au survol et au clavier, légende dès 2 séries, tableau de données accessible sous chaque graphe.
// Palette catégorielle validée (contraste ≥ 3:1 sur blanc, séparation daltonisme ΔE ≥ 14) :
import React, { useEffect, useRef, useState } from "react";
export const SERIES = ["#3B52B8", "#D9702A", "#13979A"];

const GRILLE = "#E3E7EF", AXE = "#C9D0DE", DISCRET = "#646B85";

function useLargeur(defaut = 600) {
  const ref = useRef(null);
  const [l, setL] = useState(defaut);
  useEffect(() => {
    const el = ref.current; if (!el) return undefined;
    const maj = () => { const w = el.getBoundingClientRect().width; if (w > 0) setL(Math.round(w)); };
    maj();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(maj); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, l];
}

function useInfobulle(ref) {
  const [tip, setTip] = useState(null);
  const montrer = (e, contenu) => {
    const box = ref.current ? ref.current.getBoundingClientRect() : { left: 0, top: 0, width: 600 };
    let x, y;
    if (e && e.clientX !== undefined && e.type !== "focus") { x = e.clientX - box.left; y = e.clientY - box.top; }
    else { const r = e.currentTarget.getBoundingClientRect(); x = r.left + r.width / 2 - box.left; y = r.top - box.top; }
    setTip({ x, y, contenu, droite: x > box.width * 0.6 });
  };
  const cacher = () => setTip(null);
  const rendu = tip && <div className="gm-tip" role="status" style={{ left: tip.droite ? undefined : tip.x + 14, right: tip.droite ? (ref.current ? ref.current.getBoundingClientRect().width - tip.x + 14 : 0) : undefined, top: Math.max(0, tip.y - 12) }}>{tip.contenu}</div>;
  return [montrer, cacher, rendu];
}

const arrondiMax = (v) => {
  if (!(v > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
};
// graduations « rondes » : pas de 1, 2, 2,5 ou 5 × 10^n, 4 à 5 intervalles
function echelle(lo, hiBrut) {
  const pas = arrondiMax(((hiBrut - lo) || 1) / 4);
  const hi = lo + Math.ceil(((hiBrut - lo) || 1) / pas - 1e-9) * pas;
  const g = []; for (let v = lo; v <= hi + pas / 2; v += pas) g.push(+v.toFixed(6));
  return { hi, g };
}
// barre arrondie (4 px) du côté de la valeur, angle droit sur la ligne de base
function barreV(x, y, w, h) {
  if (h <= 0) return "";
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}
function barreH(x, y, w, h) {
  if (w <= 0) return "";
  const r = Math.min(4, h / 2, w);
  return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`;
}

const Ligne = ({ coul, nom, valeur }) => <div className="gm-tip-row"><i style={{ background: coul }} /><b>{valeur}</b><span>{nom}</span></div>;

export function Legende({ series }) {
  if (!series || series.length < 2) return null;
  return <div className="gm-legend">{series.map((s) => <span key={s.nom}><i style={{ background: s.coul }} />{s.nom}</span>)}</div>;
}

function TableDonnees({ entetes, lignes }) {
  return <details className="gm-viz-table"><summary>Voir les données</summary>
    <table><thead><tr>{entetes.map((h) => <th key={h}>{h}</th>)}</tr></thead>
      <tbody>{lignes.map((l, i) => <tr key={i}>{l.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody></table></details>;
}

export function CarteGraphe({ titre, sousTitre, children, cls }) {
  return <section className={"gm-chart " + (cls || "")}><header><h3>{titre}</h3>{sousTitre && <p>{sousTitre}</p>}</header>{children}</section>;
}

/* ---------- Barres verticales groupées (une ou plusieurs séries par catégorie) ---------- */
export function BarresGroupees({ cats, series, fmt = (v) => String(v), hauteur = 240 }) {
  const [ref, L] = useLargeur();
  const [montrer, cacher, tip] = useInfobulle(ref);
  const m = { g: 36, d: 8, h: 10, b: 26 };
  const W = Math.max(260, L), H = hauteur, iw = W - m.g - m.d, ih = H - m.h - m.b;
  const { hi: max, g: graduations } = echelle(0, Math.max(1, ...series.flatMap((s) => s.vals.map((v) => v || 0))));
  const bande = iw / Math.max(1, cats.length);
  const n = series.length, gap = 2;
  const bw = Math.max(3, Math.min(22, (bande * 0.72 - gap * (n - 1)) / n));
  const groupe = bw * n + gap * (n - 1);
  const y = (v) => m.h + ih - (v / max) * ih;
  const pasEtiq = Math.ceil(cats.length / Math.max(1, Math.floor(iw / 44)));
  return (<div>
    <Legende series={series} />
    <div className="gm-viz" ref={ref}>
      <svg width={W} height={H} role="img" aria-label={series.map((s) => s.nom).join(", ")}>
        {graduations.map((v, i) => <g key={i}><line x1={m.g} x2={W - m.d} y1={y(v)} y2={y(v)} stroke={i === 0 ? AXE : GRILLE} strokeWidth="1" />
          <text x={m.g - 6} y={y(v) + 4} textAnchor="end" className="gm-axis">{fmt(v)}</text></g>)}
        {cats.map((c, i) => {
          const x0 = m.g + i * bande + (bande - groupe) / 2;
          const contenu = <><div className="gm-tip-title">{c}</div>{series.map((s) => <Ligne key={s.nom} coul={s.coul} nom={s.nom} valeur={fmt(s.vals[i] || 0)} />)}</>;
          return <g key={c} tabIndex={0} className="gm-hit" onPointerMove={(e) => montrer(e, contenu)} onPointerLeave={cacher} onFocus={(e) => montrer(e, contenu)} onBlur={cacher}>
            <rect x={m.g + i * bande} y={m.h} width={bande} height={ih} fill="transparent" />
            {series.map((s, k) => { const v = s.vals[i] || 0; return <path key={s.nom} d={barreV(x0 + k * (bw + gap), y(v), bw, m.h + ih - y(v))} fill={s.coul} />; })}
            {i % pasEtiq === 0 && <text x={m.g + i * bande + bande / 2} y={H - 8} textAnchor="middle" className="gm-axis">{c}</text>}
          </g>;
        })}
      </svg>
      {tip}
    </div>
    <TableDonnees entetes={["", ...series.map((s) => s.nom)]} lignes={cats.map((c, i) => [c, ...series.map((s) => fmt(s.vals[i] || 0))])} />
  </div>);
}

/* ---------- Courbe (une série, valeurs manquantes = rupture), ligne de cible facultative ---------- */
export function Courbe({ cats, vals, nom, coul = SERIES[0], fmt = (v) => String(v), cible, cibleLib, min, max, hauteur = 220 }) {
  const [ref, L] = useLargeur();
  const [montrer, cacher, tip] = useInfobulle(ref);
  const [survol, setSurvol] = useState(null);
  const m = { g: 44, d: 12, h: 12, b: 26 };
  const W = Math.max(260, L), H = hauteur, iw = W - m.g - m.d, ih = H - m.h - m.b;
  const definies = vals.filter((v) => v !== null && v !== undefined && Number.isFinite(v));
  const lo = min !== undefined ? min : 0;
  const ech = echelle(lo, max !== undefined ? max : Math.max(cible || 0, ...definies, lo + 1e-6));
  const hi = max !== undefined ? max : ech.hi;
  const pasX = cats.length > 1 ? iw / (cats.length - 1) : 0;
  const x = (i) => m.g + (cats.length > 1 ? i * pasX : iw / 2);
  const y = (v) => m.h + ih - ((v - lo) / ((hi - lo) || 1)) * ih;
  let d = "", ouvert = false;
  vals.forEach((v, i) => { if (v === null || v === undefined || !Number.isFinite(v)) { ouvert = false; return; } d += (ouvert ? "L" : "M") + x(i).toFixed(1) + "," + y(Math.max(lo, Math.min(hi, v))).toFixed(1); ouvert = true; });
  const graduations = max !== undefined ? echelle(lo, max).g.filter((v) => v <= max + 1e-9) : ech.g;
  const pasEtiq = Math.ceil(cats.length / Math.max(1, Math.floor(iw / 44)));
  return (<div>
    <div className="gm-viz" ref={ref}>
      <svg width={W} height={H} role="img" aria-label={nom}>
        {graduations.map((v, i) => <g key={i}><line x1={m.g} x2={W - m.d} y1={y(v)} y2={y(v)} stroke={i === 0 ? AXE : GRILLE} />
          <text x={m.g - 6} y={y(v) + 4} textAnchor="end" className="gm-axis">{fmt(v)}</text></g>)}
        {cible !== undefined && cible >= lo && cible <= hi && <g><line x1={m.g} x2={W - m.d} y1={y(cible)} y2={y(cible)} stroke={DISCRET} strokeDasharray="4 4" />
          <text x={W - m.d} y={y(cible) - 5} textAnchor="end" className="gm-axis gm-axis-strong">{cibleLib || "Cible " + fmt(cible)}</text></g>}
        {survol !== null && <line x1={x(survol)} x2={x(survol)} y1={m.h} y2={m.h + ih} stroke={AXE} />}
        <path d={d} fill="none" stroke={coul} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {vals.map((v, i) => (v === null || v === undefined || !Number.isFinite(v)) ? null :
          <circle key={i} cx={x(i)} cy={y(Math.max(lo, Math.min(hi, v)))} r={survol === i ? 5 : 4} fill={coul} stroke="#fff" strokeWidth="2" />)}
        {cats.map((c, i) => {
          const v = vals[i]; const ok = v !== null && v !== undefined && Number.isFinite(v);
          const contenu = <><div className="gm-tip-title">{c}</div><Ligne coul={coul} nom={nom} valeur={ok ? fmt(v) : "pas de donnée"} />{cible !== undefined && <div className="gm-tip-note">{cibleLib || "Cible " + fmt(cible)}</div>}</>;
          const x0 = cats.length > 1 ? x(i) - pasX / 2 : m.g;
          return <g key={c} tabIndex={0} className="gm-hit" onPointerMove={(e) => { setSurvol(i); montrer(e, contenu); }} onPointerLeave={() => { setSurvol(null); cacher(); }} onFocus={(e) => { setSurvol(i); montrer(e, contenu); }} onBlur={() => { setSurvol(null); cacher(); }}>
            <rect x={x0} y={m.h} width={cats.length > 1 ? pasX : iw} height={ih} fill="transparent" />
            {i % pasEtiq === 0 && <text x={x(i)} y={H - 8} textAnchor="middle" className="gm-axis">{c}</text>}
          </g>;
        })}
      </svg>
      {tip}
    </div>
    <TableDonnees entetes={["", nom]} lignes={cats.map((c, i) => [c, vals[i] === null || vals[i] === undefined ? "—" : fmt(vals[i])])} />
  </div>);
}

/* ---------- Barres horizontales classées (libellé à gauche, valeur à droite) ---------- */
export function BarresH({ items, fmt = (v) => String(v), coul = SERIES[0], nom = "Valeur", max: maxImpose, vide = "Aucune donnée sur la période." }) {
  const ref = useRef(null);
  const [montrer, cacher, tip] = useInfobulle(ref);
  if (!items.length) return <div className="gm-empty">{vide}</div>;
  const max = maxImpose || Math.max(...items.map((x) => x.val), 0) || 1;
  return (<div>
    <div className="gm-viz gm-hbars" ref={ref}>
      {items.map((it) => {
        const contenu = <><div className="gm-tip-title">{it.lib}</div><Ligne coul={it.coul || coul} nom={nom} valeur={fmt(it.val)} />{it.note && <div className="gm-tip-note">{it.note}</div>}</>;
        return <div key={it.lib} className="gm-hbar" tabIndex={0} onPointerMove={(e) => montrer(e, contenu)} onPointerLeave={cacher} onFocus={(e) => montrer(e, contenu)} onBlur={cacher}>
          <span className="gm-hbar-lib" title={it.lib}>{it.lib}{it.sub && <small>{it.sub}</small>}</span>
          <svg className="gm-hbar-track" viewBox="0 0 100 10" preserveAspectRatio="none"><path d={barreH(0, 1, Math.max(0.5, (it.val / max) * 100), 8)} fill={it.coul || coul} vectorEffect="non-scaling-stroke" /></svg>
          <span className="gm-hbar-val">{fmt(it.val)}</span>
        </div>;
      })}
      {tip}
    </div>
    <TableDonnees entetes={["", nom]} lignes={items.map((it) => [it.lib, fmt(it.val)])} />
  </div>);
}

/* ---------- Anneau (part d'un tout, 2 à 3 parts) ---------- */
export function Anneau({ parts, centre, centreLib, fmt = (v) => String(v) }) {
  const ref = useRef(null);
  const [montrer, cacher, tip] = useInfobulle(ref);
  const total = parts.reduce((s, p) => s + (p.val || 0), 0);
  const R = 70, E = 20, C = 2 * Math.PI * R;
  let cumul = 0;
  return (<div className="gm-donut-wrap">
    <div className="gm-viz" ref={ref} style={{ width: 180, height: 180 }}>
      <svg width="180" height="180" viewBox="0 0 180 180" role="img" aria-label={parts.map((p) => p.nom).join(", ")}>
        <circle cx="90" cy="90" r={R} fill="none" stroke={GRILLE} strokeWidth={E} />
        {total > 0 && parts.map((p) => {
          const frac = (p.val || 0) / total; const long = Math.max(0, frac * C - (parts.length > 1 && frac < 1 ? 2 : 0));
          const el = <circle key={p.nom} cx="90" cy="90" r={R} fill="none" stroke={p.coul} strokeWidth={E} strokeDasharray={`${long} ${C - long}`} strokeDashoffset={-cumul * C} transform="rotate(-90 90 90)" tabIndex={0} className="gm-hit"
            onPointerMove={(e) => montrer(e, <><div className="gm-tip-title">{p.nom}</div><Ligne coul={p.coul} nom={Math.round(frac * 100) + " % du total"} valeur={fmt(p.val)} /></>)} onPointerLeave={cacher}
            onFocus={(e) => montrer(e, <><div className="gm-tip-title">{p.nom}</div><Ligne coul={p.coul} nom={Math.round(frac * 100) + " % du total"} valeur={fmt(p.val)} /></>)} onBlur={cacher} />;
          cumul += frac; return el;
        })}
        <text x="90" y="88" textAnchor="middle" className="gm-donut-val">{centre}</text>
        <text x="90" y="108" textAnchor="middle" className="gm-axis">{centreLib}</text>
      </svg>
      {tip}
    </div>
    <ul className="gm-donut-legend">{parts.map((p) => <li key={p.nom}><i style={{ background: p.coul }} /><span>{p.nom}</span><b>{fmt(p.val)}</b><small>{total > 0 ? Math.round((p.val || 0) / total * 100) + " %" : "—"}</small></li>)}</ul>
  </div>);
}

/* ---------- Tuile chiffre clé avec variation vs période précédente ---------- */
export function TuileChiffre({ lib, valeur, variation, sens = "hausse-bonne", note, statut }) {
  let fl = null;
  if (variation !== null && variation !== undefined && Number.isFinite(variation) && Math.abs(variation) >= 0.0005) {
    const hausse = variation > 0, bon = sens === "neutre" ? null : (sens === "hausse-bonne") === hausse;
    fl = <span className={"gm-delta " + (bon === null ? "" : bon ? "is-good" : "is-bad")}>{hausse ? "▲" : "▼"} {Math.abs(variation * 100).toFixed(Math.abs(variation) < 0.1 ? 1 : 0).replace(".", ",")} %<small> vs période préc.</small></span>;
  } else if (variation === 0) fl = <span className="gm-delta"><small>stable vs période préc.</small></span>;
  return <div className={"gm-stat" + (statut ? " is-" + statut : "")}><div className="gm-stat-lib">{lib}</div><div className="gm-stat-val">{valeur}</div>{fl}{note && <div className="gm-stat-note">{note}</div>}</div>;
}
