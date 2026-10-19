// Compteurs d'équipement (km, heures, cycles) et plans déclenchés au compteur.
import React,{useState} from "react";
import {exporterXlsx} from "../excel.js";
import {GRANDEURS,ajouterReleve,codeCompteur,controleReleve,dernier,etatPlanCompteur,fmtNb,isCompteurPlan,moyenneJour,serie} from "../lib/compteurs.js";
import {frDate,todayStr} from "../lib/dates.js";
import {Badge,Btn,Card,ExportBtn,Field,Info,Inp,KPI,Modal} from "../ui/base.jsx";
import {I} from "../ui/icones.jsx";

/* ===== Compteurs d'équipement (km, heures, cycles) et maintenance conditionnelle ===== */
export const statutBadge=(s)=>s==="Dépassé"?"En retard":s==="À déclencher"?"À déclencher":s==="OK"?"Planifié":"Sans relevé";
export function JaugeCompteur({st}){
 const pct=Math.max(0,Math.min(100,st.pct||0));
 const coul=st.statut==="Dépassé"?"#D2453F":st.statut==="À déclencher"?"#E3832B":"#2E9E5B";
 return <div className="min-w-[140px]"><div className="flex justify-between text-xs text-slate-400"><span>{fmtNb(st.depuis)} / {fmtNb(st.pas)} {st.unite}</span><b style={{color:coul}}>{st.statut==="Sans relevé"?"—":st.pct+" %"}</b></div>
  <div className="h-1.5 rounded-full bg-slate-600 mt-1 overflow-hidden"><div style={{width:pct+"%",background:coul,height:"100%"}}/></div></div>;
}
export function CompteursPage({compteurs,planning,bts,equipements,unit,user,onSave,onDeclencher,onEditPlan}){
 const [nouveau,setNouveau]=useState(false);
 const [releve,setReleve]=useState(null);
 const liste=compteurs.filter(c=>c.unit===unit);
 const plansDe=(c)=>planning.filter(p=>isCompteurPlan(p)&&p.compteur===c.code);
 const plans=planning.filter(p=>isCompteurPlan(p)&&p.unit===unit).map(p=>{const c=compteurs.find(x=>x.code===p.compteur);return {p,c,st:etatPlanCompteur(p,c),bt:bts.find(b=>b.plan===p.code&&b.etat!=="Clôturé")};})
  .sort((a,b)=>(b.st.pct||0)-(a.st.pct||0));
 const exportCpt=()=>exporterXlsx({fichier:"Compteurs_equipements",feuilles:[
  {nom:"Compteurs",titre:"Compteurs d'équipements — Unité "+unit,colonnes:[{h:"Compteur"},{h:"Équipement"},{h:"Désignation"},{h:"Grandeur"},{h:"Dernière valeur",t:"num"},{h:"Unité"},{h:"Date du relevé",t:"date"},{h:"Moyenne / jour",t:"num"},{h:"Plans liés",t:"num"}],
   lignes:liste.map(c=>{const d=dernier(c);return [c.code,c.eq,c.nom,c.grandeur,d?d.cumul:"",c.unite,d?d.date:"",Math.round(moyenneJour(c)||0),plansDe(c).length];})},
  {nom:"Relevés",titre:"Historique des relevés",colonnes:[{h:"Compteur"},{h:"Date",t:"date"},{h:"Valeur lue",t:"num"},{h:"Valeur cumulée",t:"num"},{h:"Remplacement"},{h:"Saisi par"}],
   lignes:liste.flatMap(c=>serie(c).map(p=>[c.code,p.date,p.brut,p.cumul,p.reset?"Oui":"",p.par]))},
  {nom:"Plans compteur",titre:"Plans préventifs déclenchés au compteur",colonnes:[{h:"Plan"},{h:"Équipement"},{h:"Compteur"},{h:"Pas",t:"num"},{h:"Dernier passage",t:"num"},{h:"Prochaine échéance",t:"num"},{h:"Consommé",t:"pct"},{h:"Date estimée",t:"date"},{h:"Statut"},{h:"OT ouvert"}],
   lignes:plans.map(({p,st,bt})=>[p.code,p.eq,p.compteur,st.pas,st.valeurDernier??"",st.prochain??"",(st.pct||0)/100,st.dateEstimee,st.statut,bt?bt.code:""])}]});
 return (<div className="space-y-4">
  <KPI items={[["Compteurs suivis",liste.length,"text-sky-400"],["Plans au compteur",plans.length,"text-slate-300"],["À déclencher",plans.filter(x=>x.st.statut==="À déclencher").length,"text-amber-400"],["Échéance dépassée",plans.filter(x=>x.st.statut==="Dépassé").length,"text-rose-400"]]}/>
  <Card>
   <div className="flex flex-wrap justify-between items-end gap-3 mb-2">
    <div><h2 className="font-semibold text-slate-100">Plans déclenchés au compteur</h2>
     <div className="text-xs text-slate-500">Un plan passe « À déclencher » quand le seuil d'alerte est atteint, et « En retard » quand le pas est dépassé. La date est estimée d'après l'usage moyen des 90 derniers jours.</div></div>
   </div>
   <div className="overflow-x-auto"><table className="w-full text-sm">
    <thead><tr className="text-slate-400 text-left"><th className="py-1">Plan</th><th>Équipement</th><th>Pas</th><th>Consommation depuis le dernier passage</th><th>Prochaine échéance</th><th>Date estimée</th><th>État</th><th></th></tr></thead>
    <tbody>{plans.length===0&&<tr><td colSpan="8" className="text-xs text-slate-500 py-3 text-center">Aucun plan au compteur : créez un plan préventif et choisissez « Déclenchement : compteur ».</td></tr>}
    {plans.map(({p,st,bt})=><tr key={p.code} onClick={()=>onEditPlan(p)} className="border-t border-slate-700 align-top cursor-pointer hover:bg-slate-700/40">
     <td className="py-1.5 text-sky-400">{p.code}</td><td>{p.eq}<br/><span className="text-xs text-slate-400">{p.intitule||p.nom}</span></td>
     <td className="text-xs text-slate-400">Tous les {fmtNb(st.pas)} {st.unite}</td><td><JaugeCompteur st={st}/></td>
     <td className="text-xs">{st.prochain!=null?fmtNb(st.prochain)+" "+st.unite:"—"}<div className="text-slate-500">actuel : {fmtNb(st.valeur)}</div></td>
     <td className="text-xs text-slate-400">{st.dateEstimee?frDate(st.dateEstimee):"—"}</td>
     <td>{bt?<Badge t="En cours"/>:<Badge t={statutBadge(st.statut)}/>}</td>
     <td>{bt?<span className="text-xs text-slate-400">{bt.code}</span>:<Btn cls="bg-sky-600 hover:bg-sky-500 text-xs" onClick={(e)=>{e.stopPropagation();onDeclencher(p);}}>Déclencher</Btn>}</td>
    </tr>)}</tbody></table></div>
  </Card>
  <Card>
   <div className="flex flex-wrap justify-between items-end gap-3 mb-2">
    <div><h2 className="font-semibold text-slate-100">Compteurs d'équipements</h2><div className="text-xs text-slate-500">Kilométrage des rames, heures de fonctionnement des groupes et ponts roulants… Saisissez les relevés ici ou à la clôture de l'OT.</div></div>
    <div className="flex gap-2"><ExportBtn onClick={exportCpt}/><Btn cls="bg-emerald-700 hover:bg-emerald-600" onClick={()=>setNouveau(true)}><span className="flex items-center gap-1">{I.plus} Nouveau compteur</span></Btn></div>
   </div>
   <div className="overflow-x-auto"><table className="w-full text-sm">
    <thead><tr className="text-slate-400 text-left"><th className="py-1">Compteur</th><th>Équipement</th><th>Grandeur</th><th>Dernier relevé</th><th>Usage moyen</th><th>Plans</th><th></th></tr></thead>
    <tbody>{liste.length===0&&<tr><td colSpan="7" className="text-xs text-slate-500 py-3 text-center">Aucun compteur pour cette unité.</td></tr>}
    {liste.map(c=>{const d=dernier(c),m=moyenneJour(c);return <tr key={c.code} onClick={()=>setReleve(c)} className="border-t border-slate-700 cursor-pointer hover:bg-slate-700/40">
     <td className="py-1.5 text-sky-400">{c.code}</td><td>{c.eq}<br/><span className="text-xs text-slate-400">{c.nom}</span></td><td className="text-xs text-slate-400">{c.grandeur}</td>
     <td>{d?<><b>{fmtNb(d.cumul)} {c.unite}</b><div className="text-xs text-slate-500">le {frDate(d.date)}</div></>:<span className="text-xs text-slate-500">Aucun relevé</span>}</td>
     <td className="text-xs text-slate-400">{m!=null?fmtNb(m)+" "+c.unite+" / jour":"—"}</td><td className="text-xs">{plansDe(c).length}</td>
     <td><Btn cls="bg-sky-600 hover:bg-sky-500 text-xs" onClick={(e)=>{e.stopPropagation();setReleve(c);}}>Saisir un relevé</Btn></td>
    </tr>;})}</tbody></table></div>
  </Card>
  {nouveau&&<Modal title="Nouveau compteur d'équipement" onClose={()=>setNouveau(false)}><CompteurForm equipements={equipements} compteurs={compteurs} user={user} onSubmit={(c)=>{onSave(c);setNouveau(false);}}/></Modal>}
  {releve&&<Modal wide title={"Relevé — "+releve.code} onClose={()=>setReleve(null)}><ReleveForm compteur={compteurs.find(c=>c.code===releve.code)||releve} user={user} onSubmit={(c)=>{onSave(c);setReleve(null);}}/></Modal>}
 </div>);
}
export function CompteurForm({equipements,compteurs,user,onSubmit}){
 const [f,setF]=useState({eq:"",grandeur:GRANDEURS[0][0],valeur:"",date:todayStr()});
 const [err,setErr]=useState("");
 const unite=(GRANDEURS.find(g=>g[0]===f.grandeur)||GRANDEURS[0])[1];
 const selCls="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm mt-1";
 function valider(){
  const eq=equipements.find(e=>e.code===f.eq); if(!eq){setErr("Choisissez un équipement.");return;}
  const code=codeCompteur(eq.code,unite);
  if(compteurs.some(c=>c.code===code)){setErr("Ce compteur existe déjà ("+code+").");return;}
  const vide={code,eq:eq.code,nom:eq.nom,unit:eq.unit,sys:eq.system,grandeur:f.grandeur,unite,releves:[]};
  const e=controleReleve(vide,{date:f.date,valeur:f.valeur}); if(e){setErr(e);return;}
  onSubmit(ajouterReleve(vide,{date:f.date,valeur:f.valeur,par:user}));
 }
 return (<div>
  <Field label="Équipement"><select value={f.eq} onChange={e=>setF({...f,eq:e.target.value})} className={selCls}><option value="">— Choisir un équipement —</option>{equipements.map(e=><option key={e.code} value={e.code}>{e.code} — {e.nom}</option>)}</select></Field>
  <Field label="Grandeur suivie"><select value={f.grandeur} onChange={e=>setF({...f,grandeur:e.target.value})} className={selCls}>{GRANDEURS.map(([g,u])=><option key={g} value={g}>{g} ({u})</option>)}</select></Field>
  <div className="grid grid-cols-2 gap-2">
   <Field label={"Valeur initiale ("+unite+")"}><Inp inputMode="decimal" value={f.valeur} onChange={e=>setF({...f,valeur:e.target.value})}/></Field>
   <Field label="Date du relevé"><Inp type="date" value={f.date} onChange={e=>setF({...f,date:e.target.value})}/></Field>
  </div>
  {err&&<div className="text-xs text-rose-400 text-right mt-2">{err}</div>}
  <div className="flex justify-end mt-3"><Btn onClick={valider}>Créer le compteur</Btn></div>
 </div>);
}
export function ReleveForm({compteur,user,onSubmit}){
 const [f,setF]=useState({date:todayStr(),valeur:"",reset:false,ancienne:""});
 const [err,setErr]=useState("");
 const s=serie(compteur), d=dernier(compteur), m=moyenneJour(compteur);
 function valider(){ const e=controleReleve(compteur,f); if(e){setErr(e);return;} onSubmit(ajouterReleve(compteur,{...f,par:user})); }
 return (<div>
  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm mb-3">
   <Info l="Équipement">{compteur.eq} — {compteur.nom}</Info>
   <Info l="Dernier relevé">{d?fmtNb(d.cumul)+" "+compteur.unite+" le "+frDate(d.date):"—"}</Info>
   <Info l="Usage moyen">{m!=null?fmtNb(m)+" "+compteur.unite+" / jour":"—"}</Info>
  </div>
  <div className="grid grid-cols-2 gap-2">
   <Field label={"Valeur lue ("+compteur.unite+")"}><Inp inputMode="decimal" autoFocus value={f.valeur} onChange={e=>{setF({...f,valeur:e.target.value});setErr("");}}/></Field>
   <Field label="Date du relevé"><Inp type="date" value={f.date} onChange={e=>setF({...f,date:e.target.value})}/></Field>
  </div>
  <label className="flex items-center gap-2 mt-2 text-xs text-slate-300"><input type="checkbox" checked={f.reset} onChange={e=>setF({...f,reset:e.target.checked})}/> Remplacement du compteur (le cumul est conservé)</label>
  {f.reset&&<Field label={"Dernière valeur lue sur l'ancien compteur ("+compteur.unite+")"}><Inp inputMode="decimal" value={f.ancienne} onChange={e=>setF({...f,ancienne:e.target.value})}/></Field>}
  {err&&<div className="text-xs text-rose-400 text-right mt-2">{err}</div>}
  <div className="flex justify-end mt-3"><Btn onClick={valider}>Enregistrer le relevé</Btn></div>
  <div className="text-xs text-slate-400 mt-4 mb-1 font-medium">Historique ({s.length})</div>
  <div className="overflow-x-auto max-h-60"><table className="w-full text-sm"><thead><tr className="text-left"><th>Date</th><th>Valeur lue</th><th>Cumul</th><th>Saisi par</th></tr></thead>
   <tbody>{[...s].reverse().map((p,i)=><tr key={i} className="border-t border-slate-700"><td className="py-1">{frDate(p.date)}</td><td>{fmtNb(p.brut)}{p.reset&&<span className="text-amber-400 text-xs"> · nouveau compteur</span>}</td><td>{fmtNb(p.cumul)}</td><td className="text-xs text-slate-400">{p.par}</td></tr>)}</tbody></table></div>
 </div>);
}
