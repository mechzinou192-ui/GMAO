// Validation DG : l'expert DG valide (ou fait reprendre, avec un motif) les OT clôturés et les référentiels
// (équipements, plans préventifs, sous-systèmes) de son périmètre, toutes unités. Le serveur n'accepte de sa part
// que ces changements (profils-core.js) ; toute modification ultérieure par une unité remet l'élément « À valider ».
import React,{useState} from "react";
import {Badge,Btn,Card,KPI} from "../ui/base.jsx";

const maintenant=()=>new Date().toISOString().slice(0,16).replace("T"," ");

function Ligne({e,onOuvrir,onValider,onReprendre}){
 const [motif,setMotif]=useState(null);
 return (<tr className="border-t border-slate-700 align-top" data-testid={"val-"+e.code}>
  <td className="py-1.5">{onOuvrir?<button type="button" className="text-sky-400 hover:underline text-left" onClick={onOuvrir}>{e.code}</button>:e.code}
   <div className="text-xs text-slate-500">{e.unite||"—"} · {e.systeme||"—"}</div></td>
  <td className="text-sm">{e.titre}{e.detail&&<div className="text-xs text-slate-400 max-w-md">{e.detail}</div>}</td>
  <td className="text-xs text-slate-400 whitespace-nowrap">{e.date||""}</td>
  <td><Badge t={e.v?.etat||"À valider"}/>{e.v?.motif&&<div className="text-xs text-rose-300 mt-0.5 max-w-xs">{e.v.motif}</div>}</td>
  <td className="text-right">
   {motif===null
    ? <div className="flex gap-1 justify-end"><Btn cls="bg-emerald-600 hover:bg-emerald-500 text-xs text-white" onClick={onValider}>Valider</Btn>
       <Btn cls="bg-rose-700 hover:bg-rose-600 text-xs text-white" onClick={()=>setMotif("")}>À reprendre</Btn></div>
    : <div className="flex gap-1 justify-end items-center">
       <input autoFocus aria-label={"Motif pour "+e.code} value={motif} onChange={x=>setMotif(x.target.value)} placeholder="Motif (obligatoire)" className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs w-48"/>
       <Btn cls={motif.trim()?"bg-rose-700 hover:bg-rose-600 text-xs text-white":"bg-slate-700 text-slate-500 text-xs"} onClick={()=>{ if(motif.trim()) onReprendre(motif.trim()); }}>Envoyer</Btn>
       <Btn cls="bg-slate-700 hover:bg-slate-600 text-xs" onClick={()=>setMotif(null)}>Annuler</Btn></div>}
  </td>
 </tr>);
}

function Groupe({titre,liste,vide,onOuvrir,onValider,onReprendre}){
 return (<Card>
  <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
   <h2 className="font-semibold text-slate-100">{titre} <span className="text-slate-500 font-normal">({liste.length})</span></h2>
   {liste.filter(e=>e.v?.etat!=="À reprendre").length>1 && <Btn cls="bg-emerald-700 hover:bg-emerald-600 text-xs text-white" onClick={()=>{ const l=liste.filter(e=>e.v?.etat!=="À reprendre"); if(window.confirm("Valider les "+l.length+" éléments de « "+titre+" » ?")) l.forEach(onValider); }}>Tout valider</Btn>}
  </div>
  {liste.length===0 ? <div className="text-xs text-slate-500">{vide}</div> :
  <div className="overflow-x-auto"><table className="w-full text-sm">
   <thead><tr className="text-slate-400 text-left text-xs"><th className="py-1">Code</th><th>Élément</th><th>Date</th><th>État</th><th></th></tr></thead>
   <tbody>{liste.map(e=><Ligne key={e.code} e={e} onOuvrir={onOuvrir?()=>onOuvrir(e):null} onValider={()=>onValider(e)} onReprendre={(m)=>onReprendre(e,m)}/>)}</tbody>
  </table></div>}
 </Card>);
}

export function ValidationDG({user,bts,equipements,planning,treeStruct,uniteDe,systemeDe,onSaveOT,onSaveEquip,onSavePlan,onSaveSous,onOuvrirOT,onOuvrirEquip}){
 const enAttente=(v)=>v&&(v.etat==="À valider"||v.etat==="À reprendre");
 const ots=bts.filter(b=>enAttente(b.validationDG)).map(b=>({code:b.code,v:b.validationDG,unite:uniteDe(b.eq),systeme:systemeDe(b.eq),date:b.dateCloture||"",
  titre:b.eq+" — "+(b.nom||""),detail:[b.type,b.panne&&b.panne!=="-"?"Panne : "+b.panne:"",b.cause&&b.cause!=="-"?"Cause : "+b.cause:"",b.effet&&b.effet!=="-"?"Action : "+b.effet:""].filter(Boolean).join(" · "),obj:b}));
 const eqs=equipements.filter(e=>enAttente(e.validationDG)).map(e=>({code:e.code,v:e.validationDG,unite:e.unit,systeme:e.system,date:String(e.validationDG.depuis||"").slice(0,10),
  titre:e.nom,detail:(e.sousEquip||[]).length?(e.sousEquip.length+" sous-équipement(s)"):"",obj:e}));
 const plans=planning.filter(p=>enAttente(p.validationDG)).map(p=>({code:p.code,v:p.validationDG,unite:p.unit,systeme:p.sys,date:String(p.validationDG.depuis||"").slice(0,10),
  titre:p.eq+" — "+(p.nom||""),detail:[p.periode||(p.declenchement==="Compteur"?"Au compteur":""),(p.taches||[]).length+" tâche(s)",p.fmp?"FMP "+(p.fmp.ref||p.fmp.fichier||""):""].filter(Boolean).join(" · "),obj:p}));
 const sous=Object.entries(treeStruct||{}).flatMap(([sys,l])=>(l||[]).filter(s=>enAttente(s.validationDG)).map(s=>({code:sys+"."+s.code,v:s.validationDG,unite:"Toutes",systeme:sys,date:String(s.validationDG.depuis||"").slice(0,10),titre:s.sub,obj:{sys,s}})));
 const v=(etat,motif)=>({etat,par:user,le:maintenant(),...(motif?{motif}:{})});
 return (<div className="space-y-5" data-testid="validation-dg-page">
  <KPI items={[["OT clôturés à valider",ots.length,"text-amber-400"],["Équipements",eqs.length,"text-amber-400"],["Plans préventifs",plans.length,"text-amber-400"],["Sous-systèmes",sous.length,"text-amber-400"]]}/>
  <div className="text-xs text-slate-400">Votre périmètre : vos systèmes, toutes unités. « À reprendre » renvoie l'élément à l'unité avec votre motif (un OT revient « À clôturer ») ; le chargé et le responsable du système sont prévenus. Toute modification faite ensuite par l'unité le remet « À valider ».</div>
  <Groupe titre="OT clôturés" liste={ots} vide="Aucun OT clôturé en attente de validation." onOuvrir={(e)=>onOuvrirOT(e.code)}
   onValider={(e)=>onSaveOT({...e.obj,validationDG:v("Validé")})} onReprendre={(e,m)=>onSaveOT({...e.obj,etat:"À clôturer",validationDG:v("À reprendre",m)})}/>
  <Groupe titre="Équipements" liste={eqs} vide="Aucun équipement en attente." onOuvrir={(e)=>onOuvrirEquip(e.obj)}
   onValider={(e)=>onSaveEquip({...e.obj,validationDG:v("Validé")})} onReprendre={(e,m)=>onSaveEquip({...e.obj,validationDG:v("À reprendre",m)})}/>
  <Groupe titre="Plans préventifs" liste={plans} vide="Aucun plan préventif en attente."
   onValider={(e)=>onSavePlan({...e.obj,validationDG:v("Validé")})} onReprendre={(e,m)=>onSavePlan({...e.obj,validationDG:v("À reprendre",m)})}/>
  <Groupe titre="Sous-systèmes (arborescence)" liste={sous} vide="Aucun sous-système en attente."
   onValider={(e)=>onSaveSous(e.obj.sys,{...e.obj.s,validationDG:v("Validé")})} onReprendre={(e,m)=>onSaveSous(e.obj.sys,{...e.obj.s,validationDG:v("À reprendre",m)})}/>
 </div>);
}
