// Ordres de Travail (OT) : liste, détail, création, compte-rendu et clôture.
import React,{useState} from "react";
import PiecesJointes from "../PiecesJointes.jsx";
import {exporterXlsx} from "../excel.js";
import {imprimerHtml} from "../imprimer.js";
import {controleReleve,dernier,fmtNb} from "../lib/compteurs.js";
import {coutBT} from "../lib/couts.js";
import {frDate,todayStr} from "../lib/dates.js";
import {interDuSysteme,interPourSys,systemeDe} from "../lib/equipes.js";
import {btImprimableHtml} from "../lib/impression.js";
import {congeAt,libConge,nonOuvre} from "../lib/jours.js";
import {avancement,tRes} from "../lib/preventif.js";
import {Badge,Btn,Card,EquipSelect,ExportBtn,Field,HoraireConsignation,Info,Inp,KPI,LienFMP,MateriauxSection,MultiInter,ProgressBar,typeLabel} from "../ui/base.jsx";
import {I} from "../ui/icones.jsx";

/* ===== Page 2 : Ordres de Travail (générés par la Maintenance, remplis puis clôturés par un autre intervenant) ===== */
export function BTPage({bts,pieces,titre="Ordres de Travail (OT)",sousTitre,onNouveauBT,onOpenBT}){
 const [filtre,setFiltre]=useState("Tous");
 const liste=bts.filter(b=>filtre==="Tous"||b.etat===filtre);
 const exportBT=()=>exporterXlsx({fichier:"Ordres_de_Travail_OT",feuilles:[{nom:"OT",titre:titre+(filtre!=="Tous"?" — "+filtre:""),
  colonnes:[{h:"Code OT"},{h:"DI liée"},{h:"Plan préventif"},{h:"Code équipement"},{h:"Équipement"},{h:"Type"},{h:"Assigné à"},{h:"Durée de travail"},{h:"Consignation"},{h:"Travail exceptionnel"},{h:"Consigne / Panne",max:50},{h:"Avancement",t:"pct"},{h:"Coût total (DA)",t:"num"},{h:"État"},{h:"Généré le",t:"datetime"},{h:"Clôturé le",t:"datetime"}],
  lignes:liste.map(b=>[b.code,b.di||"",b.plan||"",b.eq,b.nom,b.type,b.assigne||((b.intervenants||[])[0]?.nom)||"",b.horaire||"Jour",b.consignation||"Non",b.exc?(b.motifExc||"Oui"):"",(b.consigne&&b.consigne!=="-")?b.consigne:((b.panne&&b.panne!=="-")?b.panne:""),avancement(b)===null?"":avancement(b),coutBT(b,pieces).total,b.etat,b.dateGeneration||"",b.dateCloture||""])}]});
 return (<div className="space-y-5">
  <KPI items={[
   ["OT en cours",bts.filter(b=>b.etat==="En cours").length,"text-amber-400"],
   ["En attente pièce",bts.filter(b=>b.etat==="En attente pièce").length,"text-rose-400"],
   ["OT clôturés",bts.filter(b=>b.etat==="Clôturé").length,"text-emerald-400"],
   ["Coût total clôturés (DA)",bts.filter(b=>b.etat==="Clôturé").reduce((s,b)=>s+coutBT(b,pieces).total,0).toLocaleString(),"text-sky-400"],
  ]}/>
  <Card>
   <div className="flex justify-between items-center mb-1 flex-wrap gap-2">
    <div><h2 className="font-semibold text-slate-100">{titre}</h2><div className="text-xs text-slate-500">{sousTitre||"Cliquez sur une ligne pour saisir le compte-rendu puis clôturer"}</div></div>
    <div className="flex gap-2"><ExportBtn onClick={exportBT}/>{onNouveauBT&&<Btn onClick={onNouveauBT}><span className="flex items-center gap-1">{I.plus} Nouvel OT</span></Btn>}</div>
   </div>
   <div className="flex flex-wrap gap-1 mt-2">{["Tous","En cours","En attente pièce","Clôturé"].map(f=><Btn key={f} cls={"text-xs "+(filtre===f?"bg-sky-600 text-white":"bg-slate-700 hover:bg-slate-600 text-slate-200")} onClick={()=>setFiltre(f)}>{f}</Btn>)}</div>
   <div className="md:hidden mt-3 space-y-2" data-testid="bt-cartes">
    {liste.map(b=><div key={b.code} onClick={()=>onOpenBT(b)} className="rounded-lg border border-slate-700 bg-slate-900/40 p-3 cursor-pointer active:bg-slate-700/40">
     <div className="flex items-start justify-between gap-2"><span className="text-sky-400 font-medium">{b.code}</span><Badge t={b.etat}/></div>
     <div className="text-sm mt-1">{b.eq}</div><div className="text-xs text-slate-400">{b.nom}</div>
     <div className="flex flex-wrap gap-1 mt-1">{b.horaire==="Nuit" && <span className="px-1.5 rounded bg-indigo-700 text-indigo-50 text-[10px]">🌙 Nuit</span>}{b.consignation==="Oui" && <span className="px-1.5 rounded bg-rose-600 text-rose-50 text-[10px]">Consignation</span>}</div>
     <div className="text-xs text-slate-400 mt-1">{b.type} · {b.assigne||((b.intervenants||[])[0]?.nom)||"non assigné"}{b.di?" · "+b.di:""}</div>
     <div className="text-sm text-slate-300 mt-1 break-words">{b.consigne&&b.consigne!=="-"?b.consigne:(b.panne&&b.panne!=="-"?b.panne:"—")}</div>
     {avancement(b)!==null && <div className="mt-2"><ProgressBar pct={avancement(b)}/></div>}
     <div className="text-xs text-slate-400 mt-1">{coutBT(b,pieces).total.toLocaleString()} DA</div>
    </div>)}
    {liste.length===0 && <div className="text-center text-slate-500 py-4 text-xs">Aucun OT.</div>}
   </div>
   <div className="hidden md:block overflow-x-auto mt-2"><table className="w-full text-sm">
    <thead><tr className="text-slate-400 text-left"><th className="py-1">Code OT</th><th>DI liée</th><th>Équipement</th><th>Type</th><th>Assigné à</th><th>Consigne / Panne</th><th>Avancement</th><th>Coût total</th><th>État</th></tr></thead>
    <tbody>{liste.map(b=><tr key={b.code} onClick={()=>onOpenBT(b)} className="border-t border-slate-700 align-top cursor-pointer hover:bg-slate-700/40">
     <td className="py-1.5 text-sky-400">{b.code}</td><td className="text-xs text-slate-400">{b.di||"—"}</td>
     <td>{b.eq}<br/><span className="text-xs text-slate-400">{b.nom}</span>
      <div className="flex flex-wrap gap-1 mt-0.5">{b.horaire==="Nuit" && <span className="px-1.5 rounded bg-indigo-700 text-indigo-50 text-[10px]">🌙 Nuit</span>}{b.consignation==="Oui" && <span className="px-1.5 rounded bg-rose-600 text-rose-50 text-[10px]">Consignation</span>}</div></td>
     <td>{b.type}</td>
     <td className="text-xs text-slate-400">{b.assigne||((b.intervenants||[])[0]?.nom)||"—"}</td>
     <td className="text-xs text-slate-400 max-w-xs">{b.consigne&&b.consigne!=="-"?b.consigne:(b.panne&&b.panne!=="-"?b.panne:"—")}</td>
     <td>{avancement(b)===null?<span className="text-xs text-slate-600">—</span>:<ProgressBar pct={avancement(b)}/>}</td>
     <td>{coutBT(b,pieces).total.toLocaleString()} DA</td>
     <td><Badge t={b.etat}/></td>
    </tr>)}
    {liste.length===0 && <tr><td colSpan="9" className="text-center text-slate-500 py-4 text-xs">Aucun OT.</td></tr>}</tbody>
   </table></div>
  </Card>
 </div>);
}

/* Lecture seule d'un OT clôturé */
export function BTReadOnly({bt,pieces}){
 const c=coutBT(bt,pieces);
 const tch=bt.taches||[];
 const lotLabel={pieces:"Pièce",outillage:"Outillage",consommables:"Consommable"};
 return (<div className="space-y-3">
  {tch.length>0 && <div><div className="text-xs text-slate-500 mb-1">Tâches contrôlées ({tch.filter(t=>tRes(t)).length}/{tch.length}) — {tch.filter(t=>tRes(t)==="NOK").length} Non OK</div>
   <ProgressBar pct={avancement(bt)}/>
   {tch.map((t,i)=>{const r=tRes(t);return <div key={i} className="text-xs bg-slate-900 rounded px-2 py-1 mt-1"><div className="flex items-center gap-2"><span className={r==="OK"?"text-emerald-400":r==="NOK"?"text-rose-400":"text-slate-600"}>{r==="OK"?"✓ OK":r==="NOK"?"✗ Non OK":"○"}</span><span>{t.lib}</span></div>{r==="NOK" && <div className="text-slate-400 mt-0.5 pl-1">Commentaire : {t.com||"—"}{t.di ? <span className="text-sky-400"> — DI créée : {t.di}</span> : <span className="text-amber-400"> — Aucune DI créée</span>}</div>}</div>;})}</div>}
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
   {!(bt.type==="Préventive"||bt.plan) && <><Info l="Panne">{bt.panne}</Info><Info l="Cause">{bt.cause}</Info>
   <Info l="Solution">{bt.effet}</Info><Info l="Détection / Gravité">{bt.detection}/4 — {bt.gravite}/4</Info></>}
   <Info l="Durée d'intervention">{bt.dureeIntervention} h</Info><Info l="Temps logistique">{bt.tempsLogistique} h</Info>
  </div>
  <div><div className="text-xs text-slate-500 mb-1">Intervenants</div>
   {(bt.intervenants||[]).length===0 ? <div className="text-xs text-slate-500">—</div> :
    (bt.intervenants||[]).map((it,i)=><div key={i} className="text-xs flex justify-between bg-slate-900 rounded px-2 py-1 mt-1"><span>{it.nom} — {it.fonction} — {it.temps}h × {it.taux} DA/h</span><span>{(it.temps*it.taux).toLocaleString()} DA</span></div>)}
  </div>
  <div><div className="text-xs text-slate-500 mb-1">Matières utilisées</div>
   {["pieces","outillage","consommables"].flatMap(cat=>(bt[cat]||[]).map((it,i)=>{const pc=pieces.find(p=>p.code===it.code);
    return <div key={cat+i} className="text-xs flex justify-between bg-slate-900 rounded px-2 py-1 mt-1"><span>{lotLabel[cat]} {it.code} — {pc?.nom} × {it.qte}</span><span>{(pc?pc.prix*it.qte:0).toLocaleString()} DA</span></div>;}))}
   {["pieces","outillage","consommables"].every(c=>(bt[c]||[]).length===0) && <div className="text-xs text-slate-500">—</div>}
  </div>
  <div className="text-right text-sm text-slate-300">Coût MO: {c.mo.toLocaleString()} DA — Coût Matières: {c.mat.toLocaleString()} DA — <b>Total: {c.total.toLocaleString()} DA</b></div>
 </div>);
}

export function BTDetail({bt,dsOuvertes=[],compteur,pieces,inter,equipements,onSave,onCloturer,onCreateDS}){
 const clos=bt.etat==="Clôturé";
 return (<div>
  <div className="flex items-center flex-wrap gap-x-4 gap-y-2 mb-3">
   <Badge t={bt.etat}/>
   <button onClick={()=>imprimerHtml(btImprimableHtml(bt,{pieces,equipements}))} className="px-3 py-2 md:py-1.5 rounded-lg text-sm font-medium bg-slate-700 hover:bg-slate-600 text-slate-100" data-testid="bt-imprimer">🖨 Imprimer / PDF</button>
   <Info l="Équipement">{bt.eq} — {bt.nom}</Info>
   <Info l="Type">{bt.type}</Info>
   <Info l="DI liée">{bt.di||"—"}</Info>
   {bt.plan && <Info l="Plan préventif">{bt.plan}</Info>}
   {bt.fmp && <Info l="FMP"><LienFMP fmp={bt.fmp}/></Info>}
   {bt.piecesPrevues && bt.piecesPrevues.length>0 && <Info l="Pièces prévues (à demander par DS)">{bt.piecesPrevues.map(x=>{const p=pieces.find(q=>q.code===x.code);return (p?p.nom:x.code)+" × "+x.qte;}).join(", ")}</Info>}
   <Info l="Assigné à">{bt.assigne||"—"}</Info>
   <Info l="Durée de travail">{(bt.horaire||"Jour")==="Nuit"?"🌙 Nuit":"☀️ Jour"}</Info>
   <Info l="Consignation">{(bt.consignation||"Non")==="Oui"?<span className="px-2 py-0.5 rounded-full text-xs bg-rose-600 text-rose-50">Oui — nécessaire</span>:"Non"}</Info>
   {bt.exc && <Info l="Travail exceptionnel"><span className="text-amber-400">{bt.motifExc||"Oui"}</span></Info>}
   {bt.dateGeneration && <Info l="Généré le">{bt.dateGeneration}</Info>}
   {bt.dateCloture && <Info l="Clôturé le">{bt.dateCloture}</Info>}
  </div>
  {bt.consigne && bt.consigne!=="-" && <div className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-300 mb-2"><span className="text-slate-500">Consigne de la Maintenance : </span>{bt.consigne}</div>}
  {clos ? <BTReadOnly bt={bt} pieces={pieces}/> : <BTFillForm bt={bt} dsOuvertes={dsOuvertes} compteur={compteur} pieces={pieces} inter={inter} equipements={equipements} onSave={onSave} onCloturer={onCloturer} onCreateDS={onCreateDS}/>}
  <PiecesJointes collection="bts" recordId={bt.code}/>
 </div>);
}

/* Étape 1 — Génération de l'OT par la Maintenance (aucun compte-rendu : il sera saisi par un autre intervenant) */
export function BTCreateForm({di,inter,equipements,pieces,onSubmit}){
 const [f,setF]=useState({di:di?di.code:null,eq:di?di.eq:"",nom:di?di.nom:"",type:di?typeLabel(di):"Préventive",consigne:di?di.designation:"",assignes:[],pieces:[],outillage:[],consommables:[],exc:false,motifExc:"",horaire:"Jour",consignation:"Non"});
 const [errExc,setErrExc]=useState("");
 const sys=systemeDe(f.eq,f.nom,equipements);
 return (<div>
  {di && <div className="text-xs text-sky-400 mb-2">Rattaché à la DI {di.code} — {di.designation}</div>}
  {!di && <div className="text-xs text-amber-400 mb-2">OT Préventif généré directement par la Maintenance (aucune DI)</div>}
  {di ? <><Field label="Équipement"><Inp value={f.eq+" — "+f.nom} disabled className="opacity-60"/></Field>
   <Field label="Type de maintenance"><Inp value={f.type} disabled className="opacity-60"/></Field></>
  : <Field label="Équipement"><EquipSelect equipements={equipements} value={f.eq} onPick={eq=>setF({...f,eq:eq?eq.code:"",nom:eq?eq.nom:""})}/></Field>}
  <Field label="Consigne / travaux à réaliser"><Inp value={f.consigne} onChange={e=>setF({...f,consigne:e.target.value})} placeholder="ex: Contrôler le palier moteur"/></Field>
  <HoraireConsignation v={f} onChange={o=>setF({...f,...o})}/>
  <div className="text-xs text-slate-400 mb-1 mt-2">Intervenants assignés (plusieurs possibles) — {f.assignes.length} sélectionné(s)</div>
  <MultiInter inter={interPourSys(inter,sys)} value={f.assignes} onChange={v=>setF({...f,assignes:v})} sys={sys} date={todayStr()}/>
  {nonOuvre(todayStr()) && <div className="mt-2 rounded-lg border border-amber-700 bg-amber-900/20 px-2 py-2 text-xs text-amber-400">
   🎌 Aujourd'hui est un jour non ouvré : <b>{nonOuvre(todayStr()).nom}</b>. L'OT ne peut être généré que pour un travail exceptionnel.
   <label className="flex items-center gap-1 mt-1 text-slate-200"><input type="checkbox" checked={f.exc} onChange={e=>setF({...f,exc:e.target.checked})}/> Travail exceptionnel confirmé</label>
   {f.exc && <input value={f.motifExc} onChange={e=>setF({...f,motifExc:e.target.value})} placeholder="Motif (ex: intervention urgente)" className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-100 mt-1"/>}
  </div>}
  <MateriauxSection label="Pièces à utiliser" categorie="Pièce" pieces={pieces} list={f.pieces} setList={fn=>setF(st=>({...st,pieces:fn(st.pieces)}))}/>
  <MateriauxSection label="Outillage à utiliser" categorie="Outillage" pieces={pieces} list={f.outillage} setList={fn=>setF(st=>({...st,outillage:fn(st.outillage)}))}/>
  <MateriauxSection label="Consommables à utiliser" categorie="Consommable" pieces={pieces} list={f.consommables} setList={fn=>setF(st=>({...st,consommables:fn(st.consommables)}))}/>
  <div className="text-xs text-slate-500 mt-2">Les intervenants, pièces, outillage et consommables choisis ici seront déjà remplis dans l'OT (prêt pour impression). L'OT sera créé à l'état « En cours ». L'intervenant assigné ouvrira ensuite l'OT pour saisir le compte-rendu, le temps passé et les matières, puis cliquera sur « Clôturer ».</div>
  <div>{errExc && <div className="text-xs text-rose-400 text-right mt-2">{errExc}</div>}
  <div className="flex justify-end mt-3"><Btn onClick={()=>{ if(!f.eq) return; if(f.assignes.some(n=>congeAt(inter.find(x=>x.nom===n),todayStr()))) return;
   if(nonOuvre(todayStr())){ if(!f.exc){setErrExc("Jour non ouvré : cochez « Travail exceptionnel confirmé ».");return;} if(!f.motifExc.trim()){setErrExc("Indiquez le motif du travail exceptionnel.");return;} }
   setErrExc(""); onSubmit(f); }}>Générer l'OT</Btn></div></div>
 </div>);
}

/* Étape 2 — Saisie par l'intervenant puis clôture */
export function BTFillForm({bt,dsOuvertes=[],compteur,pieces,inter,equipements,onSave,onCloturer,onCreateDS}){
 const [releveCpt,setReleveCpt]=useState("");
 const sysBT=systemeDe(bt.eq,bt.nom,equipements);
 const interEq=interPourSys(inter,sysBT);
 const interSys=interDuSysteme(interEq,sysBT);
 const [ajoutInter,setAjoutInter]=useState(false);
 const clean=(v)=>v==="-"?"":(v||"");
 const [f,setF]=useState({panne:clean(bt.panne),cause:clean(bt.cause),effet:clean(bt.effet),detection:bt.detection||(bt.type==="Préventive"||bt.plan?0:1),gravite:bt.gravite||(bt.type==="Préventive"||bt.plan?0:1),dureeIntervention:bt.dureeIntervention||1,tempsLogistique:bt.tempsLogistique||0});
 const [intervenants,setIntervenants]=useState(bt.intervenants||[]);
 const [piecesBT,setPiecesBT]=useState(bt.pieces||[]);
 const [outillageBT,setOutillageBT]=useState(bt.outillage||[]);
 const [consommablesBT,setConsommablesBT]=useState(bt.consommables||[]);
 const [selInt,setSelInt]=useState("");
 const [tempsInt,setTempsInt]=useState(1);
 const [err,setErr]=useState("");
 const [taches,setTaches]=useState(bt.taches||[]);
 const pct=taches.length?Math.round(taches.filter(t=>tRes(t)).length/taches.length*100):100;
 const nokSansCom=()=>taches.some(t=>tRes(t)==="NOK" && !(t.com||"").trim());
 const nbNok=taches.filter(t=>tRes(t)==="NOK" && !t.di && t.creerDI===true).length;
 const nokSansChoix=()=>taches.some(t=>tRes(t)==="NOK" && !t.di && typeof t.creerDI!=="boolean");
 const setRes=(i,v)=>setTaches(l=>l.map((x,j)=>j===i?{...x,res:v,com:v==="OK"?"":x.com,creerDI:v==="OK"?undefined:x.creerDI}:x));
 const attente=bt.etat==="En attente pièce"||dsOuvertes.length>0;
 const isPrev=bt.type==="Préventive"||!!bt.plan;

 function ajouterInt(){
  const t=inter.find(i=>i.nom===selInt);
  if(!t) return;
  setIntervenants(l=>[...l,{nom:t.nom,fonction:t.poste,temps:tempsInt,taux:t.taux}]);
  setSelInt("");setTempsInt(1);setAjoutInter(false);
 }
 const coutMO=intervenants.reduce((s,i)=>s+i.temps*i.taux,0);
 const coutLot=(lot)=>lot.reduce((s,it)=>{const pc=pieces.find(p=>p.code===it.code);return s+(pc?pc.prix*it.qte:0);},0);
 const coutMat=coutLot(piecesBT)+coutLot(outillageBT)+coutLot(consommablesBT);
 const data=()=>({...f,assignes:intervenants.length?intervenants.map(x=>x.nom):(bt.assignes||[]),taches,panne:f.panne||"-",cause:f.cause||"-",effet:f.effet||"-",intervenants,pieces:piecesBT,outillage:outillageBT,consommables:consommablesBT});
 function cloturer(){
  if(taches.length>0 && pct<100){setErr("Clôture impossible : "+taches.filter(t=>tRes(t)).length+"/"+taches.length+" tâches contrôlées ("+pct+" %). Chaque tâche doit être cochée OK ou Non OK.");return;}
  if(nokSansCom()){setErr("Commentaire obligatoire pour chaque tâche « Non OK ».");return;}
  if(nokSansChoix()){setErr("Pour chaque tâche « Non OK », indiquez si une DI doit être créée ou non.");return;}
  if(!isPrev && taches.length===0 && !f.panne.trim()){setErr("Renseignez la panne / le constat avant de clôturer.");return;}
  if(dsOuvertes.length){setErr("Clôture impossible : la sortie magasin n'est pas traitée ("+dsOuvertes.map(d=>d.code+" — "+d.etat).join(", ")+").");return;}
  if(intervenants.length===0){setErr("Ajoutez au moins un intervenant avant de clôturer.");return;}
  if(compteur){ const e=controleReleve(compteur,{date:todayStr(),valeur:releveCpt}); if(e){setErr("Relevé du compteur : "+e);return;} onCloturer({...data(),releveCompteur:releveCpt}); return; }
  onCloturer(data());
 }
 const allItems=piecesBT;

 return (<div>
  {compteur && (()=>{const d=dernier(compteur);return <div className="mb-3 rounded-lg border border-sky-600 bg-sky-900/30 p-3" data-testid="releve-cloture">
   <div className="text-sm font-medium text-slate-100">Relevé du compteur à la réalisation ({compteur.grandeur}, {compteur.unite})</div>
   <div className="text-xs text-slate-400">Obligatoire pour clôturer : il remet à zéro le cycle du plan. Dernier relevé : {d?fmtNb(d.cumul)+" "+compteur.unite+" le "+frDate(d.date):"aucun"}.</div>
   <Inp inputMode="decimal" placeholder={"Valeur lue ("+compteur.unite+")"} value={releveCpt} onChange={e=>{setReleveCpt(e.target.value);setErr("");}}/>
  </div>;})()}
  {attente && <div className="text-xs text-rose-300 bg-rose-900/30 border border-rose-700 rounded-lg px-3 py-2 mb-2" data-testid="ot-attente-piece">OT en attente de pièce : la clôture est bloquée jusqu'au traitement de la sortie magasin{dsOuvertes.length?" ("+dsOuvertes.map(d=>d.code+" — "+d.etat).join(", ")+")":""}.</div>}
  {taches.length>0 && <div className="mb-3 bg-slate-900/60 border border-slate-700 rounded-lg p-3">
   <div className="flex justify-between text-xs text-slate-300 mb-1"><span className="font-medium">Tâches à contrôler — {taches.filter(t=>tRes(t)).length}/{taches.length}</span><span>{pct} % contrôlé</span></div>
   <ProgressBar pct={pct}/>
   {taches.map((t,i)=>{const r=tRes(t);return <div key={i} className={"rounded-lg px-2 py-1.5 mt-1 border "+(r==="NOK"?"bg-rose-950/40 border-rose-800":r==="OK"?"bg-emerald-950/30 border-emerald-900":"bg-slate-900 border-slate-800")}>
    <div className="flex items-center justify-between gap-2 flex-wrap">
     <span className="text-sm">{i+1}. {t.lib}</span>
     <div className="flex gap-1 shrink-0">
      <button type="button" disabled={!!t.di} onClick={()=>setRes(i,"OK")} className={"px-3 py-1 rounded-lg text-xs font-medium "+(r==="OK"?"bg-emerald-600 text-white":"bg-slate-700 text-slate-300 hover:bg-slate-600")}>✓ OK</button>
      <button type="button" disabled={!!t.di} onClick={()=>setRes(i,"NOK")} className={"px-3 py-1 rounded-lg text-xs font-medium "+(r==="NOK"?"bg-rose-600 text-white":"bg-slate-700 text-slate-300 hover:bg-slate-600")}>✗ Non OK</button>
     </div>
    </div>
    {r==="NOK" && <div className="mt-1.5">
     <input value={t.com||""} disabled={!!t.di} onChange={e=>setTaches(l=>l.map((x,j)=>j===i?{...x,com:e.target.value}:x))} placeholder="Commentaire obligatoire : décrire le défaut constaté" className="w-full bg-slate-900 border border-rose-800 rounded-lg px-2 py-1.5 text-sm text-slate-100"/>
     {t.di ? <div className="text-xs text-sky-400 mt-1">DI créée : {t.di}</div> : <div className="mt-1.5">
      <div className="text-xs text-slate-400 mb-1">Ce Non OK nécessite-t-il une intervention corrective ? (ce n'est pas forcément une panne : ex. manque de pièce de rechange)</div>
      <div className="flex gap-1 flex-wrap">
       <button type="button" onClick={()=>setTaches(l=>l.map((x,j)=>j===i?{...x,creerDI:true}:x))} className={"px-3 py-1 rounded-lg text-xs font-medium "+(t.creerDI===true?"bg-sky-600 text-white":"bg-slate-700 text-slate-300 hover:bg-slate-600")}>Créer une DI</button>
       <button type="button" onClick={()=>setTaches(l=>l.map((x,j)=>j===i?{...x,creerDI:false}:x))} className={"px-3 py-1 rounded-lg text-xs font-medium "+(t.creerDI===false?"bg-amber-600 text-white":"bg-slate-700 text-slate-300 hover:bg-slate-600")}>Ne pas créer de DI</button>
      </div>
      {t.creerDI===true && <div className="text-xs text-sky-300 mt-1">Une DI corrective sera créée depuis cet OT à l'enregistrement.</div>}
      {t.creerDI===false && <div className="text-xs text-slate-500 mt-1">Aucune DI ne sera créée : le commentaire ci-dessus garde la raison.</div>}
     </div>}
    </div>}
   </div>;})}
   <div className="text-xs text-slate-500 mt-2">Chaque tâche doit être cochée OK ou Non OK (commentaire obligatoire si Non OK) pour pouvoir clôturer. « Enregistrer » sauvegarde l'avancement{nbNok>0?" et crée "+nbNok+" DI (selon votre choix)":""}.</div>
  </div>}
  {!isPrev && <>
  <div className="text-xs text-slate-400 mt-1 font-medium">Compte-rendu</div>
  <Field label="Panne / constat"><Inp value={f.panne} onChange={e=>setF({...f,panne:e.target.value})}/></Field>
  <Field label="Cause"><Inp value={f.cause} onChange={e=>setF({...f,cause:e.target.value})}/></Field>
  <Field label="Solution"><Inp value={f.effet} onChange={e=>setF({...f,effet:e.target.value})}/></Field>
  <Field label="Détection (1 à 4) — capacité à détecter la panne avant occurrence">
   <div className="flex gap-2 mt-1">{[1,2,3,4].map(g=><button key={g} onClick={()=>setF({...f,detection:g})} className={"w-9 h-9 rounded-lg text-sm font-medium "+(f.detection===g?"bg-sky-600 text-white":"bg-slate-700 text-slate-300")}>{g}</button>)}</div>
  </Field>
  <Field label="Gravité (1 à 4)">
   <div className="flex gap-2 mt-1">{[1,2,3,4].map(g=><button key={g} onClick={()=>setF({...f,gravite:g})} className={"w-9 h-9 rounded-lg text-sm font-medium "+(f.gravite===g?"bg-sky-600 text-white":"bg-slate-700 text-slate-300")}>{g}</button>)}</div>
  </Field>
  </>}
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
   <Field label="Durée d'intervention (h)"><Inp type="number" step="0.5" value={f.dureeIntervention} onChange={e=>setF({...f,dureeIntervention:Number(e.target.value)})}/></Field>
   <Field label="Temps logistique (h)"><Inp type="number" step="0.5" value={f.tempsLogistique} onChange={e=>setF({...f,tempsLogistique:Number(e.target.value)})}/></Field>
  </div>

  <div className="text-xs text-slate-400 mt-3 font-medium">Intervenants assignés — saisissez la durée d'intervention de chacun (h)</div>
  {intervenants.length===0 && <div className="text-xs text-slate-500 mt-1">Aucun intervenant assigné à cet OT.</div>}
  {intervenants.map((it,idx)=><div key={idx} className="text-xs flex justify-between items-center gap-2 bg-slate-900 rounded px-2 py-1.5 mt-1">
   <span className="flex-1">{it.nom} — {it.fonction} <span className="text-slate-500">({it.taux} DA/h)</span></span>
   <input type="number" step="0.5" min="0" value={it.temps} onChange={e=>setIntervenants(l=>l.map((x,j)=>j===idx?{...x,temps:Number(e.target.value)}:x))} className="w-16 bg-slate-950 border border-slate-700 rounded px-1.5 py-1 text-sm text-center"/>
   <span className="text-slate-500">h</span>
   <span className="w-20 text-right">{(it.temps*it.taux).toLocaleString()} DA</span>
   <button className="text-slate-500 hover:text-rose-400" onClick={()=>setIntervenants(l=>l.filter((_,i)=>i!==idx))} title="Retirer cet intervenant">{I.x}</button>
  </div>)}
  {!ajoutInter && <button type="button" onClick={()=>setAjoutInter(true)} className="text-xs text-sky-400 hover:underline mt-2">+ Ajouter / modifier un intervenant</button>}
  {ajoutInter && <>
  {(bt.assignes||[]).filter(n=>!intervenants.some(x=>x.nom===n)).length>0 && <div className="flex flex-wrap gap-1 mt-2 items-center"><span className="text-xs text-slate-500">Prévus :</span>{(bt.assignes||[]).filter(n=>!intervenants.some(x=>x.nom===n)).map(n=><button type="button" key={n} className="text-xs text-sky-400 border border-slate-700 rounded px-2 py-1 hover:bg-slate-700" onClick={()=>{const t=inter.find(i=>i.nom===n);if(t)setIntervenants(l=>[...l,{nom:t.nom,fonction:t.poste,temps:1,taux:t.taux}]);setAjoutInter(false);}}>+ {n}</button>)}</div>}
  {sysBT && interSys.length<interEq.length && <div className="text-[11px] text-slate-500 mt-2">Liste limitée aux intervenants du système {sysBT}.</div>}
  <div className="flex gap-1 mt-2">
   <select value={selInt} onChange={e=>setSelInt(e.target.value)} className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm"><option value="">— Choisir un intervenant —</option>{interSys.map(i=>{const cg=congeAt(i,todayStr());return <option key={i.mat} value={i.nom} disabled={!!cg}>{i.nom} — {i.poste}{cg?" (en congé "+libConge(cg)+")":""}</option>;})}</select>
   <input type="number" step="0.5" value={tempsInt} onChange={e=>setTempsInt(Number(e.target.value))} className="w-20 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm" placeholder="h"/>
   <Btn cls="bg-slate-700 hover:bg-slate-600 text-xs" onClick={ajouterInt}>+ Ajouter</Btn>
  </div>
  </>}

  <MateriauxSection label="Pièces utilisées" categorie="Pièce" pieces={pieces} list={piecesBT} setList={setPiecesBT}/>
  <MateriauxSection label="Outillage utilisé" categorie="Outillage" pieces={pieces} list={outillageBT} setList={setOutillageBT}/>
  <MateriauxSection label="Consommable utilisé" categorie="Consommable" pieces={pieces} list={consommablesBT} setList={setConsommablesBT}/>

  {allItems.length>0 && <div className="mt-3"><div className="text-xs text-slate-400 font-medium">Demande de sortie magasin (DS) — pièces uniquement <span className="text-slate-500">(outillage et consommables : sortie par décharge)</span></div>
   <div className="flex flex-wrap gap-1 mt-1">{allItems.map((it,i)=><button key={i} className="text-xs text-sky-400 border border-slate-700 rounded px-2 py-1 hover:bg-slate-700" onClick={()=>onCreateDS(it)}>Créer DS — {it.code} × {it.qte}</button>)}</div></div>}

  <div className="text-right text-sm text-slate-300 mt-3">Coût MO: {coutMO.toLocaleString()} DA — Coût Matières: {coutMat.toLocaleString()} DA — <b>Total: {(coutMO+coutMat).toLocaleString()} DA</b></div>
  {err && <div className="text-xs text-rose-400 text-right mt-1">{err}</div>}
  <div className="flex justify-end gap-2 mt-3">
   <Btn cls="bg-slate-700 hover:bg-slate-600" onClick={()=>{if(nokSansCom()){setErr("Commentaire obligatoire pour chaque tâche « Non OK ».");return;}setErr("");onSave(data());}}>Enregistrer</Btn>
   <Btn cls={(attente||pct<100)?"bg-slate-700 text-slate-500":"bg-emerald-600 hover:bg-emerald-500 text-white"} onClick={()=>{ if(!attente) cloturer(); }}>Clôturer l'OT</Btn>
  </div>
 </div>);
}
