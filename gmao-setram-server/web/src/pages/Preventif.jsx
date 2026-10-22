// Planning préventif : plans, plage de déclenchement, agenda, formulaire de plan.
import React,{useState} from "react";
import {exporterXlsx} from "../excel.js";
import {imprimerHtml} from "../imprimer.js";
import {esc} from "../lib/impression.js";
import {SEUIL_DEFAUT,dernier,etatPlanCompteur,fmtNb,isCompteurPlan} from "../lib/compteurs.js";
import {JOURS,MOIS,addMonths,fmtD,occurrence,padN,parseD,todayStr} from "../lib/dates.js";
import {interPourSys} from "../lib/equipes.js";
import {JOURS_WEEKEND,congeAt,ferieAt,libConge,nonOuvre} from "../lib/jours.js";
import {PERIODES,avancement,datesFuturesPlan,datesPlanDansPlage,isPeriodePlan,occurrencesPlan} from "../lib/preventif.js";
import {Badge,Btn,Card,ExportBtn,Field,HoraireConsignation,Inp,KPI,LienFMP,MateriauxSection,Modal,MultiInter,ProgressBar,Segment,SubTabs} from "../ui/base.jsx";
import {I} from "../ui/icones.jsx";
import {CompteursPage,statutBadge} from "./Compteurs.jsx";

export function Planning(props){
 const [vue,setVue]=useState("plans");
 const [pers,setPers]=useState("");
 // filtre par intervenant assigné : s'applique aux plans, à l'agenda, à la plage de déclenchement et aux plans au compteur
 const personnes=[...new Set(props.planning.filter(p=>p.unit===props.unit).flatMap(p=>p.assignes||(p.assigne?[p.assigne]:[])))].sort((a,b)=>a.localeCompare(b,"fr"));
 const persOk=pers&&personnes.includes(pers)?pers:"";
 const planning=persOk?props.planning.filter(p=>(p.assignes||(p.assigne?[p.assigne]:[])).includes(persOk)):props.planning;
 const bts=persOk?props.bts.filter(b=>!b.plan||planning.some(p=>p.code===b.plan)):props.bts;
 return (<div className="space-y-4">
  <div className="flex flex-wrap items-end justify-between gap-3">
   <SubTabs value={vue} onChange={setVue} items={[["plans","Plans préventifs"],["compteurs","Compteurs (km, heures)"]]}/>
   <label className="text-xs text-slate-400" data-testid="filtre-intervenant">Intervenant
    <select value={persOk} onChange={e=>setPers(e.target.value)} className="block mt-1 min-w-[220px] bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm">
     <option value="">Tous les intervenants</option>{personnes.map(n=><option key={n} value={n}>{n}</option>)}
    </select></label>
  </div>
  {persOk && <div className="text-xs text-sky-400">Plans assignés à <b>{persOk}</b> : {planning.filter(p=>p.unit===props.unit).length}</div>}
  {vue==="plans"?<PlanningPlans {...props} planning={planning} bts={bts}/>:<CompteursPage compteurs={props.compteurs} planning={planning} bts={bts} equipements={props.equipements} unit={props.unit} user={props.user}
    onSave={props.onSaveCompteur} blocage={props.blocageCompteur} onSupprimer={props.onSupprimerCompteur} onDeclencher={props.onDeclencher} onEditPlan={props.onEdit}/>}
 </div>);
}

export function PlanningPlans({planning,compteurs,bts,systemsList,unit,onAdd,onEdit,onDeclencher,onDeclencherLot,onOpenBT}){
 const [fsys,setFsys]=useState("Tous");
 const [cal,setCal]=useState(false);
 const today=todayStr();
 const rows=planning.filter(p=>p.unit===unit&&(fsys==="Tous"||p.sys===fsys)).map(p=>{
  const bt=bts.find(b=>b.plan===p.code&&b.etat!=="Clôturé");
  const etatCpt=isCompteurPlan(p)?statutBadge(etatPlanCompteur(p,compteurs.find(c=>c.code===p.compteur)).statut):null;
  return {p,bt,etat:bt?"En cours":(p.termine?"Terminé":etatCpt||(p.date<today?"En retard":"Planifié"))};
 });
 const cnt=(e)=>rows.filter(r=>r.etat===e).length;
 const exportPlanning=()=>exporterXlsx({fichier:"Planning_Preventif",feuilles:[{nom:"Planning préventif",titre:"Planning Préventif — Unité "+unit,
  colonnes:[{h:"Plan"},{h:"Système"},{h:"Code équipement"},{h:"Équipement"},{h:"Périodicité"},{h:"Échéance",t:"date"},{h:"Dernier passage",t:"date"},{h:"Nb tâches",t:"num"},{h:"Assigné(s)"},{h:"Durée de travail"},{h:"Consignation"},{h:"Travail exceptionnel"},{h:"OT ouvert"},{h:"Avancement de l'OT",t:"pct"},{h:"État"}],
  lignes:rows.map(({p,bt,etat})=>[p.code,p.sys,p.eq,p.nom,p.periode+(isPeriodePlan(p)?" (du "+p.debut.split("-").reverse().join("/")+" au "+p.fin.split("-").reverse().join("/")+")":""),p.date,p.dernier||"",p.taches.length,(p.assignes||[]).join(", "),p.horaire||"Jour",p.consignation||"Non",p.exc?(p.motifExc||"Oui"):"",bt?bt.code:"",bt?(avancement(bt)||0):"",etat])}]});
 return (<div className="space-y-4">
  <KPI items={[["Plans préventifs",rows.length,"text-sky-400"],["Planifiés",cnt("Planifié"),"text-slate-300"],["En cours (OT ouvert)",cnt("En cours"),"text-amber-400"],["En retard",cnt("En retard"),"text-rose-400"]]}/>
  <PlageDeclenchement rows={rows} bts={bts} onDeclencherLot={onDeclencherLot}/>
  <Card>
   <div className="flex flex-wrap justify-between items-end gap-3 mb-2">
    <div>
     <h2 className="font-semibold text-slate-100">Planning Préventif</h2>
     <div className="text-xs text-slate-500">Cliquez sur « Déclencher » pour générer l'OT préventif d'un plan. L'OT ne pourra être clôturé qu'à 100 % des tâches réalisées.</div>
    </div>
    <div className="flex gap-2 items-end">
     <div><div className="text-xs text-slate-400 mb-1">Système</div>
      <select value={fsys} onChange={e=>setFsys(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm">
       <option value="Tous">Tous</option>{systemsList.map(([c,n])=><option key={c} value={c}>{c} — {n}</option>)}
      </select></div>
     <ExportBtn onClick={exportPlanning}/>
     <Btn cls="bg-violet-700 hover:bg-violet-600" onClick={()=>setCal(true)}><span className="flex items-center gap-1">{I.cal} Calendrier / Agenda</span></Btn>
     <Btn cls="bg-emerald-700 hover:bg-emerald-600" onClick={onAdd}><span className="flex items-center gap-1">{I.plus} Nouveau plan</span></Btn>
    </div>
   </div>
   <div className="overflow-x-auto"><table className="w-full text-sm">
    <thead><tr className="text-slate-400 text-left"><th className="py-1">Plan</th><th>Système</th><th>Équipement</th><th>Périodicité</th><th>Échéance</th><th>Tâches</th><th>Assigné</th><th>Avancement de l'OT</th><th>État</th><th></th></tr></thead>
    <tbody>{rows.length===0 && <tr><td colSpan="10" className="text-xs text-slate-500 py-3 text-center">Aucun plan préventif pour cette unité.</td></tr>}
    {rows.map(({p,bt,etat})=><tr key={p.code} onClick={()=>onEdit(p)} className="border-t border-slate-700 align-top cursor-pointer hover:bg-slate-700/40">
     <td className="py-1.5 text-sky-400">{p.code}{p.validationDG && p.validationDG.etat!=="Validé" && <span className="ml-1 align-middle"><Badge t={p.validationDG.etat}/></span>}{p.fmp && <div className="text-[11px] text-slate-500 font-normal" title={p.fmp.titre}>{p.fmp.ref||p.fmp.fichier}</div>}</td><td className="text-xs">{p.sys}</td>
     <td>{p.eq}<br/><span className="text-xs text-slate-400">{p.nom}</span></td>
     <td className="text-xs text-slate-400">{isCompteurPlan(p)?<span>Compteur<div className="text-slate-500">tous les {fmtNb(p.pas)} {(compteurs.find(c=>c.code===p.compteur)||{}).unite||""}</div></span>:p.periode}{isPeriodePlan(p) && <div className="text-slate-500">du {p.debut.split("-").reverse().join("/")} au {p.fin.split("-").reverse().join("/")}</div>}</td><td className="text-xs text-slate-400">{p.date}{p.exc && <div className="text-amber-400" title={p.motifExc}>Exceptionnel</div>}{p.dernier && <div className="text-slate-500">Dernier : {p.dernier}</div>}</td>
     <td className="text-xs text-slate-400">{p.taches.length}</td><td className="text-xs text-sky-400">{(p.assignes||[]).join(", ")||"—"}</td>
     <td>{bt?<div><div className="text-xs text-slate-400 mb-0.5">{bt.code}</div><ProgressBar pct={avancement(bt)||0}/></div>:<span className="text-xs text-slate-600">—</span>}</td>
     <td><Badge t={etat}/></td>
     <td>{!bt && !p.termine && <Btn cls="bg-sky-600 hover:bg-sky-500 text-xs" onClick={(e)=>{e.stopPropagation();onDeclencher(p);}}>Déclencher</Btn>}</td>
    </tr>)}</tbody>
   </table></div>
  </Card>
  {cal && <Modal wide="full" title="Agenda des OT préventifs à réaliser" onClose={()=>setCal(false)}>
   <CalendrierBT rows={rows} bts={bts} onDeclencher={onDeclencher} onOpenBT={(c)=>{setCal(false);onOpenBT(c);}}/>
  </Modal>}
 </div>);
}

// Dates de déclenchement prévues d'un plan dans la plage [deb, fin] (à partir de sa prochaine échéance, selon sa périodicité)

export function PlageDeclenchement({rows,bts,onDeclencherLot}){
 const y=new Date().getFullYear();
 const [deb,setDeb]=useState(y+"-01-01");
 const [fin,setFin]=useState(y+"-12-31");
 const frD=(s)=>s.split("-").reverse().join("/");
 const valide=!!deb&&!!fin&&fin>=deb;
 const preset=(mois)=>{const a=parseD(todayStr());const b=addMonths(a,mois);b.setDate(b.getDate()-1);setDeb(fmtD(a));setFin(fmtD(b));};
 const lignes=valide?rows.map(({p,bt})=>({p,bt,dates:datesPlanDansPlage(p,deb,fin)})):[];
 const total=lignes.reduce((n,l)=>n+l.dates.length,0);
 const eligibles=lignes.filter(l=>l.dates.length>0 && !l.bt);
 const [confirm,setConfirm]=useState(false);
 function lancer(){ onDeclencherLot(eligibles.map(l=>l.p.code)); setConfirm(false); }
 const declenches=lignes.filter(l=>l.bt&&l.dates[0]===l.p.date).length;
 const realises=valide?bts.filter(b=>b.plan&&b.etat==="Clôturé"&&rows.some(r=>r.p.code===b.plan)&&(b.dateCloture||"").slice(0,10)>=deb&&(b.dateCloture||"").slice(0,10)<=fin).length:0;
 const parMois={}; lignes.forEach(l=>l.dates.forEach(d=>{const k=d.slice(0,7);parMois[k]=(parMois[k]||0)+1;}));
 const moisCles=Object.keys(parMois).sort();
 const iCls="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-100";
 return (<Card>
  <div className="flex flex-wrap items-end justify-between gap-3">
   <div>
    <h2 className="font-semibold text-slate-100">Plage de déclenchement — total des OT prévus</h2>
    <div className="text-xs text-slate-500">Choisissez une période : le total des OT préventifs à déclencher est calculé à partir de l'échéance et de la périodicité de chaque plan (filtre Système appliqué).</div>
   </div>
   <div className="flex flex-wrap items-end gap-2">
    <div><div className="text-xs text-slate-400 mb-1">Du</div><input type="date" value={deb} onChange={e=>setDeb(e.target.value)} className={iCls}/></div>
    <div><div className="text-xs text-slate-400 mb-1">Au</div><input type="date" value={fin} onChange={e=>setFin(e.target.value)} className={iCls}/></div>
    {[[3,"3 mois"],[6,"6 mois"],[12,"12 mois"]].map(([m,l])=><Btn key={m} cls="bg-slate-700 hover:bg-slate-600 text-xs" onClick={()=>preset(m)}>{l}</Btn>)}
    <Btn cls="bg-slate-700 hover:bg-slate-600 text-xs" onClick={()=>{setDeb(y+"-01-01");setFin(y+"-12-31");}}>Année {y}</Btn>
   </div>
  </div>
  {valide && eligibles.length>0 && <div className="flex justify-end mt-3">
   {!confirm ? <Btn cls="bg-emerald-600 hover:bg-emerald-500" onClick={()=>setConfirm(true)}>{"Déclencher toutes les visites prévues ("+eligibles.length+")"}</Btn>
    : <div className="flex items-center gap-2 text-sm">
       <span className="text-slate-300">Générer {eligibles.length} OT préventif{eligibles.length>1?"s":""} pour la plage {frD(deb)} → {frD(fin)} ?</span>
       <Btn cls="bg-emerald-600 hover:bg-emerald-500 text-xs" onClick={lancer}>Confirmer</Btn>
       <Btn cls="bg-slate-700 hover:bg-slate-600 text-xs" onClick={()=>setConfirm(false)}>Annuler</Btn>
      </div>}
  </div>}
  {valide && eligibles.length===0 && total>0 && <div className="text-xs text-slate-500 mt-3 text-right">Toutes les visites prévues sur cette plage ont déjà un OT en cours.</div>}
  {!valide ? <div className="text-xs text-rose-400 mt-3">La date de fin doit être postérieure ou égale à la date de début.</div> : <>
   <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-3"><div className="text-xs text-slate-400">OT prévus sur la plage</div><div className="text-2xl font-bold text-sky-400">{total}</div><div className="text-xs text-slate-500">du {frD(deb)} au {frD(fin)}</div></div>
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-3"><div className="text-xs text-slate-400">Dont déjà déclenchés (OT ouvert)</div><div className="text-2xl font-bold text-amber-400">{declenches}</div></div>
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-3"><div className="text-xs text-slate-400">OT préventifs clôturés sur la plage</div><div className="text-2xl font-bold text-emerald-400">{realises}</div></div>
   </div>
   {moisCles.length>0 && <div className="flex flex-wrap gap-1.5 mt-3">{moisCles.map(k=><span key={k} className="text-xs bg-slate-900 border border-slate-700 rounded-full px-2.5 py-1 text-slate-300">{MOIS[Number(k.slice(5))-1].slice(0,4)}. {k.slice(0,4)} : <b className="text-sky-400">{parMois[k]}</b></span>)}</div>}
   <div className="overflow-x-auto mt-3"><table className="w-full text-sm">
    <thead><tr className="text-slate-400 text-left"><th className="py-1">Plan</th><th>Équipement</th><th>Périodicité</th><th>OT prévus</th><th>Dates de déclenchement</th></tr></thead>
    <tbody>{lignes.filter(l=>l.dates.length>0).length===0 && <tr><td colSpan="5" className="text-xs text-slate-500 py-2 text-center">Aucun déclenchement prévu sur cette plage.</td></tr>}
    {lignes.filter(l=>l.dates.length>0).map(({p,dates})=><tr key={p.code} className="border-t border-slate-700 align-top">
     <td className="py-1.5 text-sky-400">{p.code}</td><td>{p.eq}<br/><span className="text-xs text-slate-400">{p.nom}</span></td>
     <td className="text-xs text-slate-400">{p.periode}</td><td className="font-semibold">{dates.length}</td>
     <td className="text-xs text-slate-400">{dates.slice(0,8).map(frD).join(", ")}{dates.length>8 && " … "+frD(dates[dates.length-1])}</td>
    </tr>)}
    {total>0 && <tr className="border-t border-slate-600"><td colSpan="3" className="py-1.5 text-right text-xs text-slate-400">Total</td><td className="font-bold text-sky-400">{total}</td><td></td></tr>}
    </tbody>
   </table></div>
  </>}
 </Card>);
}

export const DOT={"Planifié":"bg-sky-500","En cours":"bg-amber-500","En retard":"bg-rose-500","Réalisé":"bg-emerald-500"};

export function CalendrierBT({rows,bts,onDeclencher,onOpenBT}){
 const now=new Date(); const today=fmtD(now);
 const [cur,setCur]=useState(new Date(now.getFullYear(),now.getMonth(),1));
 const [sel,setSel]=useState(today);
 const [vue,setVue]=useState("mois");   // jour | mois | annee (vue annuelle type PDC : plans × 12 mois)
 const y=cur.getFullYear(), m=cur.getMonth();
 const limit=vue==="annee"?new Date(y,11,31):new Date(y,m+1,0);
 // Occurrences : prochaine échéance de chaque plan puis projection selon la périodicité + OT réalisés
 const events=[];
 rows.forEach(({p,bt,etat})=>{
  if(isPeriodePlan(p)){
   if(p.termine && !bt) return;
   occurrencesPlan(p).filter(x=>x>=p.date && parseD(x)<=limit).forEach((x,i)=>events.push({key:p.code+"-"+x,date:x,p,bt:i===0?bt:null,etat:i===0?etat:"Planifié",first:i===0}));
   return;
  }
  if(isCompteurPlan(p)){ if(p.date&&parseD(p.date)<=limit) events.push({key:p.code+"-"+p.date,date:p.date,p,bt,etat,first:true}); return; }
  const base=parseD(p.date);
  for(let i=0;i<300;i++){
   const d=occurrence(base,p.periode,i); if(d>limit) break;
   events.push({key:p.code+"-"+fmtD(d),date:fmtD(d),p,bt:i===0?bt:null,etat:i===0?etat:"Planifié",first:i===0});
  }
 });
 bts.filter(b=>b.plan && b.etat==="Clôturé").forEach(b=>{
  const r=rows.find(x=>x.p.code===b.plan); if(!r) return;
  const dt=(b.dateCloture||b.dateGeneration||"").slice(0,10); if(!dt) return;
  events.push({key:b.code,date:dt,p:r.p,bt:b,etat:"Réalisé",first:false});
 });
 const byDay={}; events.forEach(e=>{(byDay[e.date]=byDay[e.date]||[]).push(e);});
 const prefix=y+"-"+padN(m+1);
 const monthEvents=events.filter(e=>e.date.startsWith(prefix)).sort((a,b)=>a.date.localeCompare(b.date));
 const offset=(new Date(y,m,1).getDay()+6)%7;
 const nbJours=new Date(y,m+1,0).getDate();
 const cells=[]; for(let i=0;i<offset;i++) cells.push(null); for(let d=1;d<=nbJours;d++) cells.push(d);
 const selEvents=byDay[sel]||[];
 const allerJour=(ds)=>{setSel(ds);setCur(new Date(Number(ds.slice(0,4)),Number(ds.slice(5,7))-1,1));};
 const go=(n)=>{
  if(vue==="jour"){const d=parseD(sel);d.setDate(d.getDate()+n);allerJour(fmtD(d));return;}
  setCur(vue==="annee"?new Date(y+n,m,1):new Date(y,m+n,1));
 };
 const ouvrirJour=(ds)=>{setCur(new Date(Number(ds.slice(0,4)),Number(ds.slice(5,7))-1,1));setSel(ds);setVue("mois");};
 return (<div>
  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
   <div className="flex items-center gap-1 flex-wrap">
    <label className="text-xs text-slate-400 mr-2">Vue
     <select value={vue} onChange={e=>setVue(e.target.value)} className="ml-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm" aria-label="Vue du calendrier" data-testid="calendrier-vue">
      <option value="jour">Jour</option><option value="mois">Mois</option><option value="annee">Année complète</option>
     </select></label>
    <Btn cls="bg-slate-700 hover:bg-slate-600" onClick={()=>go(-1)}>‹</Btn>
    <div className={"text-slate-100 font-semibold text-center "+(vue==="jour"?"w-64":"w-44")}>{vue==="annee"?"Année "+y:vue==="jour"?parseD(sel).toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long",year:"numeric"}):MOIS[m]+" "+y}</div>
    <Btn cls="bg-slate-700 hover:bg-slate-600" onClick={()=>go(1)}>›</Btn>
    <Btn cls="bg-slate-700 hover:bg-slate-600 text-xs ml-2" onClick={()=>{setCur(new Date(now.getFullYear(),now.getMonth(),1));setSel(today);}}>Aujourd'hui</Btn>
   </div>
   <div className="flex flex-wrap gap-3 text-xs text-slate-400">{Object.keys(DOT).map(k=><span key={k} className="flex items-center gap-1"><span className={"w-2.5 h-2.5 rounded-full "+DOT[k]}></span>{k}</span>)}</div>
  </div>
  {vue==="annee" ? <VueAnnuelle annee={y} rows={rows} events={events} onJour={ouvrirJour}/> :
   vue==="jour" ? <VueJour jour={sel} events={(byDay[sel]||[]).slice().sort((a,b)=>String(a.p.eq).localeCompare(String(b.p.eq)))} onOpenBT={onOpenBT} onDeclencher={onDeclencher}/> :
  <div className="grid md:grid-cols-3 gap-4">
   <div className="md:col-span-2">
    <div className="grid grid-cols-7 gap-1 text-xs text-slate-500 text-center mb-1">{JOURS.map(j=><div key={j}>{j}</div>)}</div>
    <div className="grid grid-cols-7 gap-1">{cells.map((d,i)=>{
     if(d===null) return <div key={"b"+i}></div>;
     const ds=prefix+"-"+padN(d); const ev=byDay[ds]||[];
     const fe=ferieAt(ds), we=!fe&&JOURS_WEEKEND.includes(parseD(ds).getDay());
     return <button key={ds} type="button" onClick={()=>setSel(ds)} title={fe?fe.nom:undefined} className={"min-h-[64px] text-left rounded-lg border p-1 flex flex-col gap-0.5 "+(sel===ds?"border-sky-500 bg-sky-900/30":fe?"border-rose-700 bg-rose-900/30 hover:bg-rose-900/40":we?"border-slate-800 bg-slate-800/60 opacity-80 hover:bg-slate-700/40":"border-slate-700 bg-slate-900 hover:bg-slate-700/40")}>
      <span className={"text-xs "+(ds===today?"bg-sky-600 text-white rounded-full w-5 h-5 flex items-center justify-center":fe?"text-rose-300":"text-slate-400")}>{d}</span>
      {fe && <span className="text-[10px] text-rose-300 truncate">🎌 {fe.nom}</span>}
      {ev.slice(0,2).map(e=><span key={e.key} className="flex items-center gap-1 text-[10px] text-slate-300 truncate"><span className={"w-1.5 h-1.5 rounded-full shrink-0 "+DOT[e.etat]}></span><span className="truncate">{e.p.nom}</span></span>)}
      {ev.length>2 && <span className="text-[10px] text-slate-500">+{ev.length-2} autre(s)</span>}
     </button>;})}</div>
   </div>
   <div className="space-y-3">
    <div>
     <div className="flex items-center justify-between gap-2"><div className="text-sm text-slate-100 font-medium">Agenda du {parseD(sel).toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long"})}</div>
      <button type="button" className="text-xs text-sky-400 underline" onClick={()=>setVue("jour")}>Voir la journée</button></div>
     {nonOuvre(sel) && <div className="mt-1 rounded-lg border border-rose-700 bg-rose-900/30 px-2 py-1 text-xs text-rose-300">🎌 {nonOuvre(sel).type==="ferie"?"Jour férié : ":""}{nonOuvre(sel).nom} — travail possible uniquement à titre exceptionnel</div>}
     {selEvents.length===0 && <div className="text-xs text-slate-500 mt-1">Aucun OT prévu ce jour.</div>}
     {selEvents.map(e=><div key={e.key} className="bg-slate-900 border border-slate-700 rounded-lg p-2 mt-2">
      <div className="flex justify-between items-start gap-2">
       <div><div className="text-sm text-sky-400">{e.p.code} <span className="text-slate-300">— {e.p.nom}</span></div><div className="text-xs text-slate-500">{e.p.eq} · {e.p.periode}</div></div>
       <Badge t={e.etat}/>
      </div>
      <div className="text-xs text-slate-400 mt-1">{e.p.taches.length} tâche(s) · Intervenants : {(e.p.assignes||[]).join(", ")||"à définir"}</div>
      {((e.p.outillage||[]).length>0||(e.p.consommables||[]).length>0) && <div className="text-xs text-slate-500">Outillage : {(e.p.outillage||[]).length} · Consommables : {(e.p.consommables||[]).length}</div>}
      <div className="flex gap-1 mt-2">
       {e.bt && <Btn cls="bg-slate-700 hover:bg-slate-600 text-xs" onClick={()=>onOpenBT(e.bt.code)}>Ouvrir {e.bt.code}</Btn>}
       {e.first && !e.bt && e.etat!=="Réalisé" && <Btn cls="bg-sky-600 hover:bg-sky-500 text-xs" onClick={()=>onDeclencher(e.p)}>Déclencher l'OT</Btn>}
      </div>
     </div>)}
    </div>
    <div className="border-t border-slate-700 pt-2">
     <div className="text-xs text-slate-400 font-medium">OT du mois ({monthEvents.length})</div>
     {monthEvents.length===0 && <div className="text-xs text-slate-600 mt-1">Aucun OT ce mois-ci.</div>}
     {monthEvents.map(e=><button type="button" key={e.key} onClick={()=>setSel(e.date)} className="w-full flex items-center gap-2 text-xs text-left hover:bg-slate-700/40 rounded px-1 py-1"><span className={"w-2 h-2 rounded-full shrink-0 "+DOT[e.etat]}></span><span className="text-slate-500 w-14 shrink-0">{e.date.slice(8)}/{e.date.slice(5,7)}</span><span className="text-slate-300 truncate">{e.p.nom}</span></button>)}
    </div>
   </div>
  </div>}
 </div>);
}

/* Vue du jour : feuille de route détaillée (équipe, tâches, outillage, consignation, FMP) et impression */
function VueJour({jour,events,onOpenBT,onDeclencher}){
 const [ouvert,setOuvert]=useState({});
 const date=parseD(jour).toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
 const fe=nonOuvre(jour);
 const equipe=[...new Set(events.flatMap(e=>e.p.assignes||[]))];
 const lot=(l)=>(l||[]).map(x=>x.code+(x.qte>1?" ×"+x.qte:"")).join(", ");
 const imprimer=()=>{
  const lignes=events.map((e,i)=>`<tr><td>${i+1}</td><td><b>${esc(e.p.eq)}</b><br>${esc(e.p.nom)}</td><td>${esc(e.p.code)}<br><small>${esc(isCompteurPlan(e.p)?"Compteur":e.p.periode)}</small></td>
   <td>${esc((e.p.assignes||[]).join(", ")||"à définir")}</td><td>${esc(e.p.horaire||"Jour")}${(e.p.consignation||"Non")==="Oui"?"<br><b>Consignation</b>":""}</td>
   <td>${(e.p.taches||[]).length} tâche(s)${e.p.fmp?"<br><small>FMP "+esc(e.p.fmp.ref||e.p.fmp.fichier||"")+"</small>":""}</td><td>${esc(lot(e.p.outillage))}</td><td>${esc(e.bt?e.bt.code:"")}<br><small>${esc(e.etat)}</small></td><td></td></tr>`).join("");
  imprimerHtml(`<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Planning du ${esc(date)}</title><style>
   body{font:12px/1.4 Montserrat,Arial,sans-serif;color:#141B3D;margin:18px}h1{font-size:18px;margin:0 0 4px;color:#2A3B90}.s{color:#646B85;margin-bottom:12px}
   table{border-collapse:collapse;width:100%}th,td{border:1px solid #9AA1B6;padding:5px 6px;vertical-align:top;text-align:left}th{background:#EEF0FA;font-size:11px}
   td:last-child{width:110px}small{color:#646B85}@page{size:A4 landscape;margin:12mm}</style></head><body>
   <h1>Planning préventif du ${esc(date)}</h1><div class="s">${events.length} visite(s) · Équipe : ${esc(equipe.join(", ")||"—")}${fe?" · "+esc(fe.nom)+" (jour non ouvré)":""}</div>
   <table><thead><tr><th>#</th><th>Équipement</th><th>Plan</th><th>Intervenants</th><th>Horaire</th><th>Tâches / FMP</th><th>Outillage</th><th>OT / état</th><th>Visa</th></tr></thead><tbody>${lignes||"<tr><td colspan=9>Aucune visite prévue.</td></tr>"}</tbody></table></body></html>`);
 };
 return (<div data-testid="vue-jour">
  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
   <div className="text-sm text-slate-300"><b>{events.length}</b> visite(s){equipe.length>0 && <> · Équipe : <span className="text-slate-100">{equipe.join(", ")}</span></>}</div>
   <Btn cls="bg-slate-700 hover:bg-slate-600" onClick={imprimer}>🖨 Imprimer la journée</Btn>
  </div>
  {fe && <div className="mb-3 rounded-lg border border-rose-700 bg-rose-900/30 px-3 py-2 text-xs text-rose-300">🎌 {fe.type==="ferie"?"Jour férié : ":""}{fe.nom} — travail possible uniquement à titre exceptionnel</div>}
  {events.length===0 && <div className="text-sm text-slate-500 py-8 text-center">Aucune visite préventive prévue ce jour.</div>}
  <div className="grid md:grid-cols-2 gap-3">{events.map(e=>{const p=e.p;const vu=!!ouvert[e.key];return <div key={e.key} className="card bg-slate-800/60 border border-slate-700 rounded-xl p-3">
   <div className="flex items-start justify-between gap-2">
    <div><div className="text-sky-400 font-semibold">{p.eq} <span className="text-slate-300 font-normal">— {p.nom}</span></div>
     <div className="text-xs text-slate-500">{p.code} · {isCompteurPlan(p)?"Compteur":p.periode}{p.intitule?" · "+p.intitule:""}</div></div>
    <Badge t={e.etat}/>
   </div>
   <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs mt-2">
    <div><span className="text-slate-500">Intervenants : </span>{(p.assignes||[]).join(", ")||"à définir"}</div>
    <div><span className="text-slate-500">Horaire : </span>{(p.horaire||"Jour")==="Nuit"?"🌙 Nuit":"☀️ Jour"}{(p.consignation||"Non")==="Oui" && <span className="ml-2 px-1.5 rounded bg-rose-600 text-rose-50 text-[10px]">Consignation</span>}</div>
    {(p.outillage||[]).length>0 && <div><span className="text-slate-500">Outillage : </span>{lot(p.outillage)}</div>}
    {(p.consommables||[]).length>0 && <div><span className="text-slate-500">Consommables : </span>{lot(p.consommables)}</div>}
    {p.fmp && <div className="col-span-2"><span className="text-slate-500">FMP : </span><LienFMP fmp={p.fmp}/></div>}
   </div>
   <button type="button" className="text-xs text-sky-400 underline mt-2" onClick={()=>setOuvert(o=>({...o,[e.key]:!vu}))}>{vu?"Masquer":"Voir"} les {(p.taches||[]).length} tâche(s)</button>
   {vu && <ol className="mt-1 text-xs text-slate-300 list-decimal pl-5 space-y-0.5">{(p.taches||[]).map((t,i)=><li key={i}>{typeof t==="string"?t:t.lib}</li>)}</ol>}
   <div className="flex gap-1 mt-2">
    {e.bt && <Btn cls="bg-slate-700 hover:bg-slate-600 text-xs" onClick={()=>onOpenBT(e.bt.code)}>Ouvrir {e.bt.code}</Btn>}
    {e.first && !e.bt && e.etat!=="Réalisé" && <Btn cls="bg-sky-600 hover:bg-sky-500 text-xs" onClick={()=>onDeclencher(p)}>Déclencher l'OT</Btn>}
   </div>
  </div>;})}</div>
 </div>);
}

/* Vue annuelle (type PDC) : une ligne par plan, une colonne par mois ; chaque visite est une pastille avec son jour.
   Un clic sur une pastille ouvre le mois sur ce jour. Ligne de total : charge mensuelle (nombre de visites). */
function VueAnnuelle({annee,rows,events,onJour}){
 const MC=["Janv.","Févr.","Mars","Avr.","Mai","Juin","Juil.","Août","Sept.","Oct.","Nov.","Déc."];
 const dans=events.filter(e=>e.date.startsWith(annee+"-"));
 const parPlan={}; dans.forEach(e=>{const k=e.p.code;((parPlan[k]=parPlan[k]||Array.from({length:12},()=>[]))[Number(e.date.slice(5,7))-1]).push(e);});
 const lignes=rows.map(r=>r.p).filter(p=>parPlan[p.code]).sort((a,b)=>String(a.eq).localeCompare(String(b.eq))||a.code.localeCompare(b.code));
 const totaux=Array.from({length:12},(_,i)=>lignes.reduce((s,p)=>s+parPlan[p.code][i].length,0));
 const maxT=Math.max(1,...totaux);
 const exporter=()=>exporterXlsx({fichier:"Planning_annuel_"+annee,feuilles:[{nom:"Planning "+annee,titre:"Planning préventif annuel "+annee,
  colonnes:[{h:"Plan"},{h:"Code équipement"},{h:"Équipement"},{h:"Périodicité"},{h:"FMP"},{h:"Intervenants"},...MOIS.map(x=>({h:x})),{h:"Total",t:"num"}],
  lignes:[...lignes.map(p=>[p.code,p.eq,p.nom,isCompteurPlan(p)?"Compteur":p.periode,(p.fmp&&(p.fmp.ref||p.fmp.fichier))||"",(p.assignes||[]).join(", "),
   ...parPlan[p.code].map(l=>l.map(e=>e.date.slice(8)).join(" ; ")),parPlan[p.code].reduce((s,l)=>s+l.length,0)]),
   ["Total","","","","","",...totaux.map(String),totaux.reduce((a,b)=>a+b,0)]]}]});
 return (<div data-testid="vue-annuelle">
  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
   <div className="text-xs text-slate-500">{lignes.length} plan(s) · {dans.length} visite(s) en {annee} — cliquez sur un jour pour l'ouvrir dans le mois</div>
   <ExportBtn onClick={exporter}/>
  </div>
  <div className="overflow-x-auto"><table className="w-full text-sm gm-annuel">
   <thead><tr className="text-left"><th className="py-1">Plan / équipement</th>{MC.map((x,i)=><th key={i} className="text-center">{x}</th>)}<th className="text-center">Total</th></tr></thead>
   <tbody>
    {lignes.length===0 && <tr><td colSpan="14" className="text-center text-xs text-slate-500 py-4">Aucune visite prévue en {annee}.</td></tr>}
    {lignes.map(p=><tr key={p.code} className="border-t border-slate-700 align-top">
     <td className="py-1.5 min-w-[220px]"><span className="text-sky-400">{p.code}</span> <span className="text-xs text-slate-500">{isCompteurPlan(p)?"Compteur":p.periode}</span><div className="text-xs">{p.eq} — <span className="text-slate-400">{p.nom}</span></div>{(p.assignes||[]).length>0 && <div className="text-[11px] text-slate-500">{p.assignes.join(", ")}</div>}</td>
     {parPlan[p.code].map((l,i)=><td key={i} className="text-center px-1 min-w-[54px]"><div className="flex flex-wrap gap-0.5 justify-center">
      {l.map(e=><button key={e.key} type="button" onClick={()=>onJour(e.date)} title={e.date.split("-").reverse().join("/")+" — "+e.etat} className={"gm-pastille "+DOT[e.etat]}>{e.date.slice(8)}</button>)}
     </div></td>)}
     <td className="text-center font-semibold">{parPlan[p.code].reduce((s,l)=>s+l.length,0)}</td>
    </tr>)}
   </tbody>
   {lignes.length>0 && <tfoot><tr className="border-t-2 border-slate-600"><td className="py-1.5 font-semibold">Visites par mois</td>
    {totaux.map((t,i)=><td key={i} className="text-center align-bottom"><div className="gm-charge" style={{height:(t?Math.round(4+28*t/maxT):0)+"px"}} title={t+" visite(s)"}/><b>{t}</b></td>)}
    <td className="text-center font-semibold">{totaux.reduce((a,b)=>a+b,0)}</td></tr></tfoot>}
  </table></div>
 </div>);
}

// Prochaines échéances d'un plan (12 mois) pour prévenir d'un congé sur une occurrence ultérieure
export function PlanForm({mode,item,compteurs=[],systemsList,equipements,inter,pieces,onSubmit}){
 const isEdit=mode==="edit";
 const [cf,setCf]=useState(isEdit&&isCompteurPlan(item)?{declenchement:"Compteur",compteur:item.compteur||"",pas:String(item.pas||""),seuil:String(item.seuil||SEUIL_DEFAUT),valeurDernier:String(item.valeurDernier??"")}
  :{declenchement:"Calendrier",compteur:"",pas:"",seuil:String(SEUIL_DEFAUT),valeurDernier:""});
 const parCpt=cf.declenchement==="Compteur";
 const [f,setF]=useState(isEdit?{code:item.code,sys:item.sys,eq:item.eq,nom:item.nom,periode:item.periode,date:item.date,assignes:item.assignes||(item.assigne?[item.assigne]:[]),exc:!!item.exc,motifExc:item.motifExc||"",horaire:item.horaire||"Jour",consignation:item.consignation||"Non"}
  :{code:null,sys:"",eq:"",nom:"",periode:"Mensuel",date:todayStr(),assignes:[],exc:false,motifExc:"",horaire:"Jour",consignation:"Non"});
 const [taches,setTaches]=useState(isEdit?[...item.taches]:[]);
 const [outil,setOutil]=useState(isEdit?[...(item.outillage||[])]:[]);
 const [conso,setConso]=useState(isEdit?[...(item.consommables||[])]:[]);
 const [nt,setNt]=useState("");
 const [err,setErr]=useState("");
 const selCls="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm mt-1";
 const liste=equipements.filter(e=>e.system===f.sys);
 function addT(){ if(!nt.trim()) return; setTaches(l=>[...l,nt.trim()]); setNt(""); }
 function valider(){
  if(!f.sys){setErr("Choisissez un système.");return;}
  if(!f.eq){setErr("Choisissez un équipement.");return;}
  if(taches.length===0){setErr("Ajoutez au moins une tâche à réaliser.");return;}
  if(parCpt){
   const c=compteurs.find(x=>x.code===cf.compteur);
   if(!c){setErr("Choisissez le compteur de l'équipement (créez-le dans l'onglet « Compteurs » s'il n'existe pas).");return;}
   const pas=Number(String(cf.pas).replace(/\s/g,"").replace(",",".")), seuil=Number(cf.seuil);
   if(!(pas>0)){setErr("Indiquez le pas du plan (ex. 15000 km).");return;}
   if(!(seuil>=50&&seuil<=100)){setErr("Le seuil d'alerte doit être compris entre 50 et 100 %.");return;}
   const d=dernier(c); const vd=String(cf.valeurDernier).trim()===""?(d?d.cumul:0):Number(String(cf.valeurDernier).replace(/\s/g,"").replace(",","."));
   if(!Number.isFinite(vd)||vd<0){setErr("Valeur au dernier passage invalide.");return;}
   onSubmit({mode,data:{...f,periode:"Compteur",date:"",exc:false,motifExc:"",declenchement:"Compteur",compteur:c.code,pas,seuil,valeurDernier:vd,debut:undefined,fin:undefined,intervalle:undefined,auto:undefined,avance:undefined,termine:false,taches,outillage:outil,consommables:conso}});
   return;
  }
  if(nonOuvre(f.date)&&!f.exc){setErr("La date tombe un jour non ouvré ("+nonOuvre(f.date).nom+") : changez la date ou cochez « Travail exceptionnel confirmé ».");return;}
  if(nonOuvre(f.date)&&!f.motifExc.trim()){setErr("Indiquez le motif du travail exceptionnel.");return;}
  const enConge=f.assignes.map(n=>({n,c:congeAt(inter.find(x=>x.nom===n),f.date)})).filter(x=>x.c);
  if(enConge.length){setErr("Changez l'intervenant : "+enConge.map(x=>x.n+" est en congé "+libConge(x.c)).join(" ; ")+".");return;}
  onSubmit({mode,data:{...f,exc:!!nonOuvre(f.date)&&f.exc,motifExc:nonOuvre(f.date)&&f.exc?f.motifExc.trim():"",debut:undefined,fin:undefined,intervalle:undefined,auto:undefined,avance:undefined,termine:false,declenchement:undefined,compteur:undefined,pas:undefined,seuil:undefined,valeurDernier:undefined,taches,outillage:outil,consommables:conso}});
 }
 const cptsDispo=compteurs.filter(c=>c.eq===f.eq);
 const cptSel=compteurs.find(c=>c.code===cf.compteur);
 return (<div>
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
   <Field label="Système">
    <select value={f.sys} onChange={e=>setF({...f,sys:e.target.value,eq:"",nom:""})} className={selCls}>
     <option value="">— Choisir un système —</option>{systemsList.map(([c,n])=><option key={c} value={c}>{c} — {n}</option>)}
    </select>
   </Field>
   <Field label="Équipement">
    <select value={f.eq} disabled={!f.sys} onChange={e=>{const q=liste.find(x=>x.code===e.target.value);setF({...f,eq:q?q.code:"",nom:q?q.nom:""});}} className={selCls}>
     <option value="">{f.sys?"— Choisir un équipement —":"Choisissez d'abord le système"}</option>{liste.map(e=><option key={e.code} value={e.code}>{e.code} — {e.nom}</option>)}
    </select>
   </Field>
  </div>
  <div className="mt-2"><div className="text-xs text-slate-400">Déclenchement</div><Segment value={parCpt?"Compteur (km, heures…)":"Calendrier"} options={["Calendrier","Compteur (km, heures…)"]} onChange={v=>setCf({...cf,declenchement:v==="Calendrier"?"Calendrier":"Compteur"})}/></div>
  {!parCpt && <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
   <Field label="Périodicité"><select value={f.periode==="Compteur"?"Mensuel":f.periode} onChange={e=>setF({...f,periode:e.target.value})} className={selCls}>{PERIODES.map(x=><option key={x}>{x}</option>)}</select></Field>
   <Field label="Prochaine échéance"><input type="date" value={f.date||todayStr()} onChange={e=>setF({...f,date:e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-100 mt-1"/></Field>
  </div>}
  {parCpt && <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" data-testid="plan-compteur">
   <Field label="Compteur de l'équipement"><select value={cf.compteur} onChange={e=>setCf({...cf,compteur:e.target.value})} className={selCls}>
    <option value="">{f.eq?(cptsDispo.length?"— Choisir un compteur —":"Aucun compteur sur cet équipement"):"Choisissez d'abord l'équipement"}</option>
    {cptsDispo.map(c=>{const d=dernier(c);return <option key={c.code} value={c.code}>{c.grandeur} — {d?fmtNb(d.cumul)+" "+c.unite:"aucun relevé"}</option>;})}</select></Field>
   <Field label={"Pas : intervention tous les… ("+((cptSel&&cptSel.unite)||"km / h")+")"}><Inp inputMode="decimal" placeholder="ex. 15000" value={cf.pas} onChange={e=>setCf({...cf,pas:e.target.value})}/></Field>
   <Field label="Seuil d'alerte (% du pas)"><Inp type="number" min="50" max="100" value={cf.seuil} onChange={e=>setCf({...cf,seuil:e.target.value})}/></Field>
   <Field label={"Valeur au dernier passage"+(cptSel&&dernier(cptSel)?" (vide = "+fmtNb(dernier(cptSel).cumul)+")":"")}><Inp inputMode="decimal" value={cf.valeurDernier} onChange={e=>setCf({...cf,valeurDernier:e.target.value})}/></Field>
  </div>}
  {!parCpt && nonOuvre(f.date) && <div className="mt-2 rounded-lg border border-amber-700 bg-amber-900/20 px-2 py-2 text-xs text-amber-400">
   🎌 Cette échéance tombe un jour non ouvré : <b>{nonOuvre(f.date).nom}</b>. Changez la date, ou confirmez un travail exceptionnel.
   <label className="flex items-center gap-1 mt-1 text-slate-200"><input type="checkbox" checked={f.exc} onChange={e=>setF({...f,exc:e.target.checked})}/> Travail exceptionnel confirmé</label>
   {f.exc && <input value={f.motifExc} onChange={e=>setF({...f,motifExc:e.target.value})} placeholder="Motif (ex: arrêt de nuit, intervention urgente...)" className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-100 mt-1"/>}
  </div>}
  <HoraireConsignation v={f} onChange={o=>setF({...f,...o})}/>
  <div className="text-xs text-slate-400 mb-1 mt-2">Intervenants assignés (plusieurs possibles, optionnel) — {f.assignes.length} sélectionné(s)</div>
  <MultiInter inter={interPourSys(inter,f.sys)} value={f.assignes} onChange={v=>setF({...f,assignes:v})} sys={f.sys} date={parCpt?todayStr():f.date} extraDates={parCpt?[]:datesFuturesPlan(f)}/>
  {isEdit && item.fmp && <div className="mt-3 rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs"><span className="text-slate-400">Tâches issues de la FMP : </span><LienFMP fmp={item.fmp}/>{item.fmp.titre && <div className="text-slate-500 mt-0.5">{item.fmp.titre}</div>}</div>}
  <div className="text-xs text-slate-400 mt-3 font-medium">Tâches à réaliser à chaque déclenchement ({taches.length})</div>
  {taches.map((t,i)=><div key={i} className="text-xs flex justify-between items-center bg-slate-900 rounded px-2 py-1 mt-1"><span>{i+1}. {t}</span><button className="text-slate-500 hover:text-rose-400" onClick={()=>setTaches(l=>l.filter((_,j)=>j!==i))}>{I.x}</button></div>)}
  <div className="flex gap-1 mt-2">
   <input value={nt} onChange={e=>setNt(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();addT();}}} placeholder="ex: Contrôler le serrage des fixations" className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm"/>
   <Btn cls="bg-slate-700 hover:bg-slate-600 text-xs" onClick={addT}>+ Ajouter</Btn>
  </div>
  <MateriauxSection label="Outillage à utiliser" categorie="Outillage" pieces={pieces} list={outil} setList={setOutil}/>
  <MateriauxSection label="Consommables à utiliser" categorie="Consommable" pieces={pieces} list={conso} setList={setConso}/>
  {err && <div className="text-xs text-rose-400 text-right mt-2">{err}</div>}
  <div className="flex justify-end mt-3"><Btn onClick={valider}>{isEdit?"Enregistrer les modifications":"Créer le plan"}</Btn></div>
 </div>);
}
