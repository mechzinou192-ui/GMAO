// Fiche de travail imprimable (A4) à remplir à la main sur le terrain, puis saisie au bureau.
// Aucun prix, aucun coût : seules les informations déjà saisies dans la GMAO sont pré-remplies, le reste est laissé vide.
// Fonction pure : retourne du texte, ne touche ni à la fenêtre ni aux données.
import {tRes} from "./preventif.js";

const ESC={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"};
export const esc=(v)=>String(v??"").replace(/[&<>"']/g,(c)=>ESC[c]);
const val=(v)=>{const t=String(v??"").trim(); return t&&t!=="-"?esc(t):"—";};
const LOT={pieces:"Pièce",outillage:"Outillage",consommables:"Consommable"};

const CSS=`
@page{size:A4;margin:12mm}
*{box-sizing:border-box}
body{font:12px/1.35 Arial,Helvetica,sans-serif;color:#111;margin:0}
h1{font-size:18px;margin:0}
.entete{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #2b3593;padding-bottom:6px;margin-bottom:8px}
.entete .soc{font-weight:bold;color:#2b3593;font-size:13px}
.entete .code{font-size:20px;font-weight:bold;text-align:right}
.etat{display:inline-block;border:1px solid #111;border-radius:10px;padding:1px 8px;font-size:11px}
h2{font-size:12px;background:#eef0fa;border-left:4px solid #2b3593;margin:10px 0 4px;padding:3px 6px;text-transform:uppercase}
table{width:100%;border-collapse:collapse}
th,td{border:1px solid #888;padding:3px 5px;text-align:left;vertical-align:top}
th{background:#f3f3f3;font-size:11px}
td.n,th.n{text-align:right;white-space:nowrap}
.id td:nth-child(odd){background:#f7f7f7;font-weight:bold;width:16%}
.box{display:inline-block;width:12px;height:12px;border:1.5px solid #111;margin-right:6px;vertical-align:middle;text-align:center;line-height:10px;font-size:11px}
.cmt{height:16px}
.vide td{height:26px}
.ecrire{height:34px}
.consigne{border:1px solid #888;padding:5px 7px;background:#fafafa}
.sign{display:flex;gap:8px;margin-top:14px;page-break-inside:avoid}
.sign div{flex:1;border:1px solid #888;height:70px;padding:3px 5px;font-size:11px}
.pied{margin-top:10px;font-size:10px;color:#555;border-top:1px solid #ccc;padding-top:3px}
tr{page-break-inside:avoid}
`;

const vide=(n,cols)=>`<tr class="vide">${"<td></td>".repeat(cols)}</tr>`.repeat(n);
const vf=(v)=>{const t=String(v??"").trim(); return t&&t!=="-"?esc(t):"";};   // valeur saisie, sinon case à écrire à la main
const note=(v)=>Number(v)>0?`<b>${esc(v)}</b> / 4`:"…… / 4";
const dateFr=(v)=>{const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(v||""));return m?`${m[3]}/${m[2]}/${m[1]}`:"…… / …… / ………";};
const heureFr=(v)=>{const m=/^(\d{1,2}):(\d{2})/.exec(String(v||""));return m?`${m[1]} h ${m[2]}`:"…… h ……";};
const heures=(v)=>v!=null&&v!==""&&Number(v)>0?esc(v)+" h":"……… h";

export function btImprimableHtml(bt,{pieces=[],equipements=[],imprimeLe=new Date(),societe="SETRAM"}={}){
 const eq=equipements.find(e=>e.code===bt.eq)||{};
 const taches=bt.taches||[];
 const prev=bt.type==="Préventive"||!!bt.plan;
 const lignesTaches=taches.length?taches.map((t,i)=>{
  const r=tRes(t);
  return `<tr><td class="n" style="width:24px">${i+1}</td><td>${esc(t.lib)}</td><td style="width:92px;white-space:nowrap"><span class="box">${r==="OK"?"✓":""}</span>OK &nbsp;<span class="box">${r==="NOK"?"✗":""}</span>Non OK</td><td style="width:34%"><div class="cmt">${esc(t.com||"")}</div></td></tr>`;
 }).join(""):`<tr><td colspan="4">Aucune tâche définie.</td></tr>`;
 // Intervenants : ceux déjà assignés sont pré-remplis (nom, fonction), les heures sont à écrire à la main.
 const inter=bt.intervenants||[];
 const assignes=inter.length?[]:String(bt.assigne||"").split(",").map(x=>x.trim()).filter(x=>x&&x!=="-");
 const lignesInter=inter.map(it=>`<tr class="vide"><td>${esc(it.nom)}</td><td>${esc(it.fonction||"")}</td><td class="n">${Number(it.temps)>0?esc(it.temps)+" h":""}</td><td class="n">${Number(it.logistique)>0?esc(it.logistique)+" h":""}</td></tr>`).join("")
  +assignes.map(n=>`<tr class="vide"><td>${esc(n)}</td><td></td><td></td><td></td></tr>`).join("");
 const nbInter=inter.length+assignes.length;
 const lignesInterTotal=lignesInter+vide(Math.max(2,4-nbInter),4);
 // Matières : pièces prévues et matières déjà saisies (sans prix), puis lignes vides à compléter.
 const prevues=(bt.piecesPrevues||[]).map(x=>{const p=pieces.find(q=>q.code===x.code);return `<tr class="vide"><td>Pièce prévue</td><td>${esc(x.code)}</td><td>${esc(p?p.nom:"")}</td><td class="n">${esc(x.qte)}</td></tr>`;});
 const matieres=["pieces","outillage","consommables"].flatMap(cat=>(bt[cat]||[]).map(it=>{
  const p=pieces.find(x=>x.code===it.code);
  return `<tr class="vide"><td>${LOT[cat]}</td><td>${esc(it.code)}</td><td>${esc(p?p.nom:"")}</td><td class="n">${esc(it.qte)}</td></tr>`;}));
 const lignesMat=[...prevues,...matieres].join("")+vide(Math.max(3,5-prevues.length-matieres.length),4);
 const d=imprimeLe instanceof Date?imprimeLe:new Date(imprimeLe);
 const quand=`${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;

 return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Fiche de travail ${esc(bt.code)}</title><style>${CSS}</style></head><body>
<div class="entete"><div><div class="soc">${esc(societe)} — GMAO</div><h1>FICHE DE TRAVAIL ${prev?"PRÉVENTIVE":"CORRECTIVE"}</h1></div>
<div><div class="code">${esc(bt.code)}</div><div style="text-align:right"><span class="etat">${esc(bt.etat||"")}</span></div></div></div>

<h2>Identification</h2>
<table class="id">
<tr><td>Équipement</td><td>${esc(bt.eq)} — ${esc(bt.nom||eq.nom||"")}</td><td>Emplacement</td><td>${val(eq.emplacement)}</td></tr>
<tr><td>Type</td><td>${val(bt.type)}</td><td>${prev?"Plan préventif":"DI liée"}</td><td>${val(prev?bt.plan:bt.di)}</td></tr>
${bt.fmp?`<tr><td>FMP</td><td colspan="3">${esc(bt.fmp.ref||bt.fmp.fichier||"")}${bt.fmp.titre?" — "+esc(bt.fmp.titre):""}</td></tr>`:""}
<tr><td>Assigné à</td><td>${val(bt.assigne)}</td><td>Horaire</td><td>${(bt.horaire||"Jour")==="Nuit"?"Nuit":"Jour"}</td></tr>
<tr><td>Consignation</td><td>${(bt.consignation||"Non")==="Oui"?"<b>OUI — nécessaire</b>":"Non"}</td><td>Travail exceptionnel</td><td>${bt.exc?esc(bt.motifExc||"Oui"):"Non"}</td></tr>
<tr><td>Date d'intervention</td><td>${dateFr(bt.dateIntervention)}</td><td>Heure d'intervention</td><td>${heureFr(bt.heureIntervention)}</td></tr>
</table>

${bt.consigne&&bt.consigne!=="-"?`<h2>Consigne de la maintenance</h2><div class="consigne">${esc(bt.consigne)}</div>`:""}

${prev?`<h2>Tâches à réaliser</h2>
<table><tr><th class="n">N°</th><th>Tâche</th><th>Résultat</th><th>Observations</th></tr>${lignesTaches}</table>`:""}

${prev?"":`<h2>Constat</h2>
<table class="id"><tr><td>Panne</td><td class="ecrire">${vf(bt.panne)}</td><td>Cause</td><td class="ecrire">${vf(bt.cause)}</td></tr>
<tr><td>Solution</td><td class="ecrire">${vf(bt.effet)}</td><td>Détection / Gravité</td><td>Détection : ${note(bt.detection)}<br>Gravité : ${note(bt.gravite)}</td></tr></table>`}

<h2>Temps</h2>
<table class="id"><tr><td>Durée d'intervention</td><td>${heures(bt.dureeIntervention)}</td><td>Temps logistique</td><td>${heures(bt.tempsLogistique)}</td></tr></table>

<h2>Intervenants</h2>
<table><tr><th>Nom</th><th>Fonction</th><th class="n">Durée d'intervention</th><th class="n">Temps logistique</th></tr>${lignesInterTotal}</table>

<h2>Pièces, outillage et consommables utilisés</h2>
<table><tr><th>Catégorie</th><th>Code</th><th>Désignation</th><th class="n">Qté</th></tr>${lignesMat}</table>

<div class="sign"><div>Intervenant (nom, date, signature)</div><div>Responsable maintenance (visa)</div><div>Exploitation — consignation / restitution (visa)</div></div>
<div class="pied">${esc(societe)} — GMAO · Fiche de travail ${esc(bt.code)} · imprimée le ${quand}</div>
</body></html>`;
}
