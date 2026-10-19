// Ordre de travail imprimable (A4) : document HTML autonome, prévu pour « Imprimer » ou « Enregistrer au format PDF ».
// Fonction pure : retourne du texte, ne touche ni à la fenêtre ni aux données.
import {tRes} from "./preventif.js";
import {coutBT} from "./couts.js";

const ESC={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"};
export const esc=(v)=>String(v??"").replace(/[&<>"']/g,(c)=>ESC[c]);
const nb=(n)=>String(Math.round(Number(n)||0)).replace(/\B(?=(\d{3})+(?!\d))/g," ");   // 1 250 000
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
.vide td{height:22px}
.consigne{border:1px solid #888;padding:5px 7px;background:#fafafa}
.tot{text-align:right;margin-top:4px}
.sign{display:flex;gap:8px;margin-top:14px;page-break-inside:avoid}
.sign div{flex:1;border:1px solid #888;height:70px;padding:3px 5px;font-size:11px}
.pied{margin-top:10px;font-size:10px;color:#555;border-top:1px solid #ccc;padding-top:3px}
tr{page-break-inside:avoid}
`;

export function btImprimableHtml(bt,{pieces=[],equipements=[],imprimeLe=new Date(),societe="SETRAM"}={}){
 const eq=equipements.find(e=>e.code===bt.eq)||{};
 const c=coutBT(bt,pieces);
 const taches=bt.taches||[];
 const prev=bt.type==="Préventive"||!!bt.plan;
 const lignesTaches=taches.length?taches.map((t,i)=>{
  const r=tRes(t);
  const case_=r==="OK"?'<span class="box">✓</span>':r==="NOK"?'<span class="box">✗</span>':'<span class="box"></span>';
  return `<tr><td class="n" style="width:24px">${i+1}</td><td>${case_}${esc(t.lib)}</td><td style="width:70px">${r==="OK"?"OK":r==="NOK"?"Non OK":""}</td><td style="width:34%"><div class="cmt">${esc(t.com||"")}</div></td></tr>`;
 }).join(""):`<tr><td colspan="4">Aucune tâche définie.</td></tr>`;
 const inter=bt.intervenants||[];
 const lignesInter=inter.length?inter.map(it=>`<tr><td>${esc(it.nom)}</td><td>${esc(it.fonction||"")}</td><td class="n">${esc(it.temps)} h</td><td class="n">${nb(it.taux)} DA/h</td><td class="n">${nb((Number(it.temps)||0)*(Number(it.taux)||0))} DA</td></tr>`).join("")
  :'<tr class="vide"><td></td><td></td><td></td><td></td><td></td></tr>'.repeat(3);
 const matieres=["pieces","outillage","consommables"].flatMap(cat=>(bt[cat]||[]).map(it=>{
  const p=pieces.find(x=>x.code===it.code);
  return `<tr><td>${LOT[cat]}</td><td>${esc(it.code)}</td><td>${esc(p?p.nom:"")}</td><td class="n">${esc(it.qte)}</td><td class="n">${nb(p?p.prix*it.qte:0)} DA</td></tr>`;}));
 const lignesMat=matieres.length?matieres.join(""):'<tr class="vide"><td></td><td></td><td></td><td></td><td></td></tr>'.repeat(3);
 const d=imprimeLe instanceof Date?imprimeLe:new Date(imprimeLe);
 const quand=`${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;

 return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Ordre de travail ${esc(bt.code)}</title><style>${CSS}</style></head><body>
<div class="entete"><div><div class="soc">${esc(societe)} — GMAO</div><h1>BON DE TRAVAIL</h1></div>
<div><div class="code">${esc(bt.code)}</div><div style="text-align:right"><span class="etat">${esc(bt.etat||"")}</span></div></div></div>

<h2>Identification</h2>
<table class="id">
<tr><td>Équipement</td><td>${esc(bt.eq)} — ${esc(bt.nom||eq.nom||"")}</td><td>Emplacement</td><td>${val(eq.emplacement)}</td></tr>
<tr><td>Type</td><td>${val(bt.type)}</td><td>${prev?"Plan préventif":"DI liée"}</td><td>${val(prev?bt.plan:bt.di)}</td></tr>
<tr><td>Assigné à</td><td>${val(bt.assigne)}</td><td>Horaire</td><td>${(bt.horaire||"Jour")==="Nuit"?"Nuit":"Jour"}</td></tr>
<tr><td>Consignation</td><td>${(bt.consignation||"Non")==="Oui"?"<b>OUI — nécessaire</b>":"Non"}</td><td>Travail exceptionnel</td><td>${bt.exc?esc(bt.motifExc||"Oui"):"Non"}</td></tr>
<tr><td>Généré le</td><td>${val(bt.dateGeneration)}</td><td>Clôturé le</td><td>${val(bt.dateCloture)}</td></tr>
</table>

${bt.consigne&&bt.consigne!=="-"?`<h2>Consigne de la maintenance</h2><div class="consigne">${esc(bt.consigne)}</div>`:""}

<h2>Tâches à réaliser / contrôlées</h2>
<table><tr><th class="n">N°</th><th>Tâche</th><th>Résultat</th><th>Observations</th></tr>${lignesTaches}</table>

${prev?"":`<h2>Constat</h2>
<table class="id"><tr><td>Panne</td><td>${val(bt.panne)}</td><td>Cause</td><td>${val(bt.cause)}</td></tr>
<tr><td>Solution</td><td>${val(bt.effet)}</td><td>Détection / Gravité</td><td>${bt.detection!=null&&bt.detection!==""?esc(bt.detection)+"/4":"—"} — ${bt.gravite!=null&&bt.gravite!==""?esc(bt.gravite)+"/4":"—"}</td></tr></table>`}

<h2>Temps</h2>
<table class="id"><tr><td>Durée d'intervention</td><td>${bt.dureeIntervention!=null&&bt.dureeIntervention!==""?esc(bt.dureeIntervention)+" h":"……… h"}</td><td>Temps logistique</td><td>${bt.tempsLogistique!=null&&bt.tempsLogistique!==""?esc(bt.tempsLogistique)+" h":"……… h"}</td></tr></table>

<h2>Intervenants</h2>
<table><tr><th>Nom</th><th>Fonction</th><th class="n">Temps</th><th class="n">Taux</th><th class="n">Montant</th></tr>${lignesInter}</table>

<h2>Pièces, outillage et consommables utilisés</h2>
<table><tr><th>Catégorie</th><th>Code</th><th>Désignation</th><th class="n">Qté</th><th class="n">Montant</th></tr>${lignesMat}</table>
<div class="tot">Main-d'œuvre : ${nb(c.mo)} DA — Matières : ${nb(c.mat)} DA — <b>Total : ${nb(c.total)} DA</b></div>

<div class="sign"><div>Intervenant (nom, date, signature)</div><div>Responsable maintenance (visa)</div><div>Exploitation — consignation / restitution (visa)</div></div>
<div class="pied">${esc(societe)} — GMAO · Ordre de travail ${esc(bt.code)} · imprimé le ${quand}</div>
</body></html>`;
}
