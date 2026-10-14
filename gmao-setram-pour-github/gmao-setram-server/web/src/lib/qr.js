// QR codes d'équipements : lien profond + planche d'étiquettes imprimable. Fonctions pures.
import {esc} from "./impression.js";

const CODE_OK=/^[A-Za-z0-9._-]{1,80}$/;

// Lien encodé dans le QR : l'ouverture de l'application avec ?eq=CODE crée une DI pour cet équipement
export const lienEquipement=(origin,code)=>`${String(origin).replace(/\/+$/,"")}/?eq=${encodeURIComponent(code)}`;

// Lit le paramètre ?eq=... de l'adresse ; null si absent ou suspect
export function codeDepuisAdresse(search){
 try{
  const v=new URLSearchParams(search||"").get("eq");
  return v&&CODE_OK.test(v)?v:null;
 }catch{ return null; }
}

const CSS=`
@page{size:A4;margin:10mm}
*{box-sizing:border-box}
body{font:11px/1.25 Arial,Helvetica,sans-serif;color:#111;margin:0}
.grille{display:grid;grid-template-columns:repeat(3,1fr);gap:6mm}
.et{border:1px dashed #888;padding:4mm;display:flex;gap:3mm;align-items:center;page-break-inside:avoid;height:38mm}
.et svg{width:28mm;height:28mm;flex:none}
.et .code{font-weight:bold;font-size:12px;word-break:break-all}
.et .nom{margin-top:1mm}
.et .lieu{color:#444;margin-top:1mm;font-size:10px}
.et .soc{color:#2b3593;font-size:9px;margin-top:2mm}
.titre{font-size:11px;color:#555;margin-bottom:4mm}
`;

// items : [{code, nom, emplacement, svg}]  (svg = QR déjà généré, texte SVG sûr produit par la bibliothèque)
export function planchetteEtiquettesHtml(items,{societe="SETRAM",titre="Étiquettes équipements — scanner pour déclarer une anomalie"}={}){
 const cases=items.map(it=>`<div class="et">${it.svg}<div><div class="code">${esc(it.code)}</div><div class="nom">${esc(it.nom)}</div>${it.emplacement?`<div class="lieu">${esc(it.emplacement)}</div>`:""}<div class="soc">${esc(societe)} — GMAO · Scanner = déclarer une anomalie</div></div></div>`).join("");
 return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Étiquettes QR</title><style>${CSS}</style></head><body><div class="titre">${esc(titre)} (${items.length})</div><div class="grille">${cases}</div></body></html>`;
}
