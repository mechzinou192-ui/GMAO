// Validation :
//  - le responsable maintenance (responsable système / administrateur UO) valide (ou fait reprendre, avec un motif)
//    les OT clôturés de son périmètre ;
//  - l'expert DG valide les référentiels (arborescence en une seule validation, plans préventifs) de ses systèmes, toutes unités ;
//  - les chargés et responsables maintenance adressent à l'expert DG des demandes d'expertise / d'assistance.
// Le serveur contrôle chaque changement (profils-core.js) ; toute modification ultérieure par une unité remet
// l'élément « À valider ».
import React,{useState} from "react";
import {Badge,Btn,Card,KPI} from "../ui/base.jsx";
import {DemandesExpertise} from "./DemandesExpertise.jsx";

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

export function ValidationDG({user,bts,equipements,planning,treeStruct,uniteDe,systemeDe,onSaveOT,onSaveEquip,onSavePlan,onSaveSous,onOuvrirOT,onOuvrirEquip,
  valideOT=true,valideRef=true,demandesProps=null}){
 const enAttente=(v)=>v&&(v.etat==="À valider"||v.etat==="À reprendre");
 const ots=bts.filter(b=>b.etat==="Clôturé"&&enAttente(b.validationDG))   // un OT « à reprendre » revient « À clôturer » : il réapparaît à sa nouvelle clôture
 .map(b=>({code:b.code,v:b.validationDG,unite:uniteDe(b.eq),systeme:systemeDe(b.eq),date:b.dateCloture||"",
  titre:b.eq+" — "+(b.nom||""),detail:[b.type,b.panne&&b.panne!=="-"?"Panne : "+b.panne:"",b.cause&&b.cause!=="-"?"Cause : "+b.cause:"",b.effet&&b.effet!=="-"?"Action : "+b.effet:""].filter(Boolean).join(" · "),obj:b}));
 // Arborescence : UNE seule validation pour tout ce qui a été ajouté dans l'arbre, du sous-système jusqu'au sous-sous-équipement
 // (valider un équipement valide aussi ses sous-équipements et sous-sous-équipements, qui en font partie).
 const feuilles=(e)=>(e.sousEquip||[]).flatMap(se=>[{niveau:"Sous-équipement",code:se.code,nom:se.nom},...(se.sousSousEquip||[]).map(ss=>({niveau:"Sous-sous-équipement",code:ss.code,nom:ss.nom}))]);
 const arboEq=equipements.filter(e=>enAttente(e.validationDG)).map(e=>({kind:"equipement",niveau:"Équipement",code:e.code,v:e.validationDG,unite:e.unit,systeme:e.system,date:String(e.validationDG.depuis||"").slice(0,10),
  titre:"Équipement · "+e.nom,detail:feuilles(e).map(x=>x.niveau+" "+x.code+(x.nom?" — "+x.nom:"")).join(" ; "),obj:e}));
 const arboSous=Object.entries(treeStruct||{}).flatMap(([sys,l])=>(l||[]).filter(s=>enAttente(s.validationDG)).map(s=>({kind:"sousSysteme",niveau:"Sous-système",code:sys+"."+s.code,v:s.validationDG,unite:"Toutes",systeme:sys,date:String(s.validationDG.depuis||"").slice(0,10),titre:"Sous-système · "+s.sub,obj:{sys,s}})));
 const arbo=[...arboSous,...arboEq].sort((a,b)=>String(a.systeme).localeCompare(String(b.systeme))||String(a.code).localeCompare(String(b.code)));
 const plans=planning.filter(p=>enAttente(p.validationDG)).map(p=>({code:p.code,v:p.validationDG,unite:p.unit,systeme:p.sys,date:String(p.validationDG.depuis||"").slice(0,10),
  titre:p.eq+" — "+(p.nom||""),detail:[p.periode||(p.declenchement==="Compteur"?"Au compteur":""),(p.taches||[]).length+" tâche(s)",p.fmp?"FMP "+(p.fmp.ref||p.fmp.fichier||""):""].filter(Boolean).join(" · "),obj:p}));
 const v=(etat,motif)=>({etat,par:user,le:maintenant(),...(motif?{motif}:{})});
 return (<div className="space-y-5" data-testid="validation-dg-page">
  {(valideOT||valideRef)&&<KPI items={[...(valideOT?[["OT clôturés à valider",ots.length,"text-amber-400"]]:[]),...(valideRef?[["Arborescence",arbo.length,"text-amber-400"],["Plans préventifs",plans.length,"text-amber-400"]]:[])]}/>}
  {valideOT&&<div className="text-xs text-slate-400">Validation des OT clôturés par le responsable maintenance, sur votre périmètre (unités et systèmes). « À reprendre » renvoie l'OT « À clôturer » avec votre motif ; le chargé du système est prévenu.</div>}
  {valideRef&&<div className="text-xs text-slate-400">Référentiels de vos systèmes, toutes unités. « À reprendre » renvoie l'élément à l'unité avec votre motif ; le chargé et le responsable du système sont prévenus. Toute modification faite ensuite par l'unité le remet « À valider ».</div>}
  {valideOT&&<Groupe titre="OT clôturés" liste={ots} vide="Aucun OT clôturé en attente de validation." onOuvrir={(e)=>onOuvrirOT(e.code)}
   onValider={(e)=>onSaveOT({...e.obj,validationDG:v("Validé")})} onReprendre={(e,m)=>onSaveOT({...e.obj,etat:"À clôturer",validationDG:v("À reprendre",m)})}/>}
  {demandesProps&&<DemandesExpertise {...demandesProps}/>}
  {valideRef&&<><Groupe titre="Arborescence (sous-systèmes, équipements, sous-équipements, sous-sous-équipements)" liste={arbo} vide="Rien à valider dans l'arborescence."
   onOuvrir={(e)=>e.kind==="equipement"?onOuvrirEquip(e.obj):null}
   onValider={(e)=>e.kind==="equipement"?onSaveEquip({...e.obj,validationDG:v("Validé")}):onSaveSous(e.obj.sys,{...e.obj.s,validationDG:v("Validé")})}
   onReprendre={(e,m)=>e.kind==="equipement"?onSaveEquip({...e.obj,validationDG:v("À reprendre",m)}):onSaveSous(e.obj.sys,{...e.obj.s,validationDG:v("À reprendre",m)})}/>
  <Groupe titre="Plans préventifs" liste={plans} vide="Aucun plan préventif en attente."
   onValider={(e)=>onSavePlan({...e.obj,validationDG:v("Validé")})} onReprendre={(e,m)=>onSavePlan({...e.obj,validationDG:v("À reprendre",m)})}/>
</>}
 </div>);
}
