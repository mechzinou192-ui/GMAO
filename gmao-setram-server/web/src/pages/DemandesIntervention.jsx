// Demandes d'Intervention (DI) : liste, détail, création.
import React,{useState,useMemo} from "react";
import PiecesJointes from "../PiecesJointes.jsx";
import {exporterXlsx} from "../excel.js";
import {Badge,Btn,Card,EquipSelect,ExportBtn,Field,Info,Inp,KPI,ouiNon,typeLabel} from "../ui/base.jsx";
import {I} from "../ui/icones.jsx";

/* ===== Page 1 : Demandes d'Intervention (créées par l'Exploitation) ===== */
export function DIPage({dis,bts,onNewDI,onOpenDI,onGenererBT}){
 const exportDI=()=>exporterXlsx({fichier:"Demandes_Intervention_DI",feuilles:[{nom:"DI",titre:"Demandes d'Intervention (DI)",
  colonnes:[{h:"Code DI"},{h:"Code équipement"},{h:"Équipement"},{h:"Demandeur"},{h:"Désignation",max:50},{h:"Type de maintenance"},{h:"Emplacement"},{h:"Date événement",t:"datetime"},{h:"Date création",t:"datetime"},{h:"Perturbation"},{h:"OT lié"},{h:"État"}],
  lignes:dis.map(d=>{const bt=bts.find(b=>b.di===d.code);return [d.code,d.eq,d.nom,d.demandeur,d.designation,typeLabel(d),d.emplacement,d.dateEvt,d.dateCreation,ouiNon(d.perturb),bt?bt.code:"",d.etat];})}]});
 return (<div className="space-y-5">
  <KPI items={[
   ["DI ouvertes",dis.filter(d=>d.etat!=="Traité").length,"text-sky-400"],
   ["À transmettre",dis.filter(d=>d.etat==="À Transmettre").length,"text-slate-300"],
   ["Transmises (OT généré)",dis.filter(d=>d.etat==="Transmis").length,"text-amber-400"],
   ["Traitées",dis.filter(d=>d.etat==="Traité").length,"text-emerald-400"],
  ]}/>
  <Card>
   <div className="flex justify-between items-center mb-1 flex-wrap gap-2">
    <div><h2 className="font-semibold text-slate-100">Demandes d'Intervention (DI)</h2><div className="text-xs text-slate-500">Créées par le service Exploitation — cliquez sur une ligne pour ouvrir la DI</div></div>
    <div className="flex gap-2"><ExportBtn onClick={exportDI}/><Btn onClick={onNewDI}><span className="flex items-center gap-1">{I.plus} Nouvelle DI</span></Btn></div>
   </div>
   <div className="md:hidden mt-3 space-y-2" data-testid="di-cartes">
    {dis.map(d=>{const bt=bts.find(b=>b.di===d.code);return <div key={d.code} onClick={()=>onOpenDI(d)} className="rounded-lg border border-slate-700 bg-slate-900/40 p-3 cursor-pointer active:bg-slate-700/40">
     <div className="flex items-start justify-between gap-2"><span className="text-sky-400 font-medium">{d.code}</span><Badge t={d.etat}/></div>
     <div className="text-sm mt-1">{d.eq}</div><div className="text-xs text-slate-400">{d.nom}</div>
     <div className="text-sm text-slate-300 mt-1 break-words">{d.designation}</div>
     <div className="text-xs text-slate-400 mt-1">{typeLabel(d)}{d.dateEvt?" · "+d.dateEvt:""}{d.perturb?<span className="text-rose-400"> · Perturbation</span>:null}</div>
     {bt && <div className="text-xs text-slate-400">OT lié : {bt.code}</div>}
     {d.etat==="À Transmettre" && <div className="mt-2"><Btn cls="bg-sky-600 hover:bg-sky-500 text-white w-full" onClick={(e)=>{e.stopPropagation();onGenererBT(d);}}>Générer OT</Btn></div>}
    </div>;})}
    {dis.length===0 && <div className="text-center text-slate-500 py-4 text-xs">Aucune DI.</div>}
   </div>
   <div className="hidden md:block overflow-x-auto mt-2"><table className="w-full text-sm">
    <thead><tr className="text-slate-400 text-left"><th className="py-1">Code DI</th><th>Équipement</th><th>Demandeur</th><th>Désignation</th><th>Type</th><th>Emplacement</th><th>Date événement</th><th>Perturb.</th><th>OT lié</th><th>État</th><th></th></tr></thead>
    <tbody>{dis.map(d=>{const bt=bts.find(b=>b.di===d.code);return <tr key={d.code} onClick={()=>onOpenDI(d)} className="border-t border-slate-700 align-top cursor-pointer hover:bg-slate-700/40">
     <td className="py-1.5 text-sky-400">{d.code}</td><td>{d.eq}<br/><span className="text-xs text-slate-400">{d.nom}</span></td>
     <td className="text-xs text-slate-400">{d.demandeur||"—"}</td>
     <td className="text-xs text-slate-400 max-w-xs">{d.designation}</td><td className="text-xs text-slate-400">{typeLabel(d)}</td><td className="text-xs text-slate-400">{d.emplacement}</td>
     <td className="text-xs text-slate-400">{d.dateEvt}</td>
     <td>{d.perturb?<span className="text-rose-400">Oui</span>:"Non"}</td>
     <td className="text-xs text-slate-400">{bt?bt.code:"—"}</td>
     <td><Badge t={d.etat}/></td>
     <td>{d.etat==="À Transmettre" && <Btn cls="bg-sky-600 hover:bg-sky-500 text-xs" onClick={(e)=>{e.stopPropagation();onGenererBT(d);}}>Générer OT</Btn>}</td>
    </tr>;})}</tbody>
   </table></div>
  </Card>
 </div>);
}

export function DIDetail({di,bt,onGenererBT,onOpenBT}){
 return (<div className="space-y-3">
  <div className="flex items-center gap-2"><Badge t={di.etat}/>{di.perturb && <span className="text-xs text-rose-400">Perturbation exploitation</span>}</div>
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
   <Info l="Code DI">{di.code}</Info>
   <Info l="Équipement">{di.eq} — {di.nom}</Info>
   <Info l="Demandeur">{di.demandeur||"—"}</Info>
   <Info l="Type de maintenance">{typeLabel(di)}</Info>
   <Info l="Emplacement">{di.emplacement||"—"}</Info>
   <Info l="Date de l'événement">{di.dateEvt}</Info>
   <Info l="Date de création">{di.dateCreation}</Info>
   <Info l="Perturbation exploitation">{di.perturb?"Oui":"Non"}</Info>
  </div>
  <Info l="Désignation (constat)">{di.designation}</Info>
  <div className="border-t border-slate-700 pt-3">
   <div className="text-xs text-slate-500 mb-1">Ordre de Travail lié</div>
   {bt ? <div className="flex items-center gap-2 text-sm"><button className="text-sky-400 hover:underline" onClick={onOpenBT}>{bt.code}</button><Badge t={bt.etat}/></div>
       : <div className="text-sm text-slate-400">Aucun OT généré pour cette DI.</div>}
  </div>
  <PiecesJointes collection="dis" recordId={di.code}/>
  {di.etat==="À Transmettre" && <div className="flex justify-end"><Btn onClick={onGenererBT}>Générer l'OT</Btn></div>}
 </div>);
}

export function DIForm({prefill,equipements,demandeur,onSubmit}){
 const dateCreation=useMemo(()=>new Date().toISOString().slice(0,16).replace("T"," "),[]);
 const pre=prefill?.eq?equipements.find(e=>e.code===prefill.eq):null;
 const [f,setF]=useState({eq:pre?pre.code:"",nom:pre?(prefill.se?prefill.nom:pre.nom):"",se:prefill?.se||"",emplacement:pre?pre.emplacement:"",designation:"",dateEvt:new Date().toISOString().slice(0,16).replace("T"," ")});
 const [fromFiche,setFromFiche]=useState(!!(pre&&pre.emplacement));
 const [perturb,setPerturb]=useState("Non");
 const [typeM,setTypeM]=useState("Corrective");
 const [sousType,setSousType]=useState("Curative");
 const [err,setErr]=useState("");
 function pick(eq){
  if(!eq){setF({...f,eq:"",nom:"",se:"",emplacement:""});setFromFiche(false);return;}
  setF({...f,eq:eq.code,nom:eq.nom,se:"",emplacement:eq.emplacement||""});
  setFromFiche(!!eq.emplacement);
 }
 const sel="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm mt-1";
 return (<div>
  {pre && <div className="text-xs text-sky-400 mb-2">Équipement préchargé depuis l'arborescence</div>}
  <Field label="Demandeur (automatique)"><Inp value={demandeur} disabled className="opacity-60"/></Field>
  <Field label="Équipement"><EquipSelect equipements={equipements} value={f.eq} onPick={pick}/></Field>
  {(()=>{const cur=equipements.find(e=>e.code===f.eq); const sl=(cur&&cur.sousEquip)||[]; return sl.length>0&&<Field label="Sous-équipement concerné (optionnel)"><select value={f.se||""} onChange={e=>{const x=sl.find(y=>y.code===e.target.value); setF({...f,se:e.target.value,nom:cur.nom+(x?" — "+x.code+" "+x.nom:"")});}} className={sel}><option value="">— Équipement entier —</option>{sl.map(x=><option key={x.code} value={x.code}>{x.code} — {x.nom}</option>)}</select></Field>;})()}
  <Field label={fromFiche?"Emplacement (repris automatiquement de la fiche équipement)":"Emplacement de l'équipement"}>
   <Inp value={f.emplacement} disabled={fromFiche} className={fromFiche?"opacity-60":""} onChange={e=>setF({...f,emplacement:e.target.value})} placeholder={f.eq?"Non renseigné dans la fiche équipement — à saisir":"Choisissez d'abord l'équipement"}/>
  </Field>
  <Field label="Désignation (description du constat)"><Inp value={f.designation} onChange={e=>setF({...f,designation:e.target.value})}/></Field>
  <Field label="Type de maintenance">
   <select value={typeM} onChange={e=>setTypeM(e.target.value)} className={sel}><option>Corrective</option><option>Préventive</option></select>
  </Field>
  {typeM==="Corrective" && <Field label="Nature de la maintenance corrective">
   <select value={sousType} onChange={e=>setSousType(e.target.value)} className={sel}><option>Palliative</option><option>Curative</option></select>
  </Field>}
  <Field label="Date et heure de l'événement"><input type="datetime-local" value={f.dateEvt.replace(" ","T")} onChange={e=>setF({...f,dateEvt:e.target.value.replace("T"," ")})} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-100 mt-1"/></Field>
  <Field label="Date et heure de création (automatique)"><Inp value={dateCreation} disabled className="opacity-60"/></Field>
  <Field label="Perturbation exploitation">
   <select value={perturb} onChange={e=>setPerturb(e.target.value)} className={sel}><option>Non</option><option>Oui</option></select>
  </Field>
  <div className="text-xs text-slate-500 mt-2">État initial : "À Transmettre".</div>
  {err && <div className="text-xs text-rose-400 text-right mt-1">{err}</div>}
  <div className="flex justify-end mt-3"><Btn onClick={()=>{ if(!f.eq){setErr("Choisissez un équipement.");return;} onSubmit({...f,dateCreation,perturb,demandeur,typeMaintenance:typeM,sousType}); }}>Créer la DI</Btn></div>
 </div>);
}
