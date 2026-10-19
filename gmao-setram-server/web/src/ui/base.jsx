// Composants d'interface communs (badges, cartes, boutons, fenêtres, champs, sélecteurs d'intervenants…).
import React,{useState} from "react";
import {frDate} from "../lib/dates.js";
import {interDuSysteme} from "../lib/equipes.js";
import {congeAt,libConge,nonOuvre} from "../lib/jours.js";
import {I} from "./icones.jsx";

export const state = (c)=>({
  "À Transmettre":"bg-slate-600 text-slate-100","Transmis":"bg-amber-600 text-amber-50","Traité":"bg-emerald-600 text-emerald-50",
  "À Faire":"bg-amber-600 text-amber-50","En attente pièce":"bg-rose-600 text-rose-50","Clôturé":"bg-emerald-600 text-emerald-50",
  "Planifié":"bg-sky-600 text-sky-50","À déclencher":"bg-amber-600 text-amber-50","Sans relevé":"bg-slate-500 text-slate-100","En cours":"bg-amber-600 text-amber-50","Réalisé":"bg-emerald-600 text-emerald-50","En retard":"bg-rose-600 text-rose-50",
  "Généré":"bg-slate-600 text-slate-100","Terminé":"bg-slate-500 text-slate-100","Envoyé Fournisseur":"bg-sky-600 text-sky-50","En cours d'expédition":"bg-amber-600 text-amber-50","Reçu":"bg-emerald-600 text-emerald-50",
  "Transmis au Magasinier":"bg-amber-600 text-amber-50","BS généré":"bg-sky-600 text-sky-50","À traiter":"bg-amber-600 text-amber-50","Annulé":"bg-slate-500 text-slate-100",
}[c]||"bg-slate-600");
export const Badge=({t})=><span className={"badge px-2 py-0.5 rounded-full text-xs font-medium "+state(t)}>{t}</span>;
export const Card=({children,cls})=><div className={"card bg-slate-800/60 border border-slate-700 rounded-xl p-4 "+(cls||"")}>{children}</div>;
export const Btn=({children,onClick,cls})=><button onClick={onClick} className={"px-3 py-2 md:py-1.5 rounded-lg text-sm font-medium transition "+(cls||"bg-sky-600 hover:bg-sky-500 text-white")}>{children}</button>;
export const SubTabs=({value,onChange,items})=><div className="gm-tabs" role="tablist">{items.map(([k,t])=><button key={k} type="button" role="tab" aria-selected={value===k} onClick={()=>onChange(k)} className={"gm-tab"+(value===k?" is-active":"")}>{t}</button>)}</div>;
export const ExportBtn=({onClick,label})=>{const [busy,setBusy]=useState(false);
 return <Btn cls="bg-slate-700 hover:bg-slate-600" onClick={async()=>{if(busy)return;setBusy(true);try{await onClick();}finally{setBusy(false);}}}><span className="flex items-center gap-1">⬇ {busy?"Export…":(label||"Exporter Excel")}</span></Btn>;};
export const fmtFourn=(l)=>(l||[]).filter(Boolean).map(f=>f.nom+(f.tel?" — "+f.tel:"")).join("\n");
export const ouiNon=(b)=>b?"Oui":"Non";
export const Modal=({title,onClose,children,wide})=>(
 <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-2 sm:p-4" onClick={onClose}>
  <div className={"gm-modal bg-slate-800 border border-slate-700 rounded-xl w-full "+(wide==="xl"?"max-w-5xl":wide?"max-w-3xl":"max-w-lg")+" p-3 sm:p-5 max-h-[92vh] sm:max-h-[85vh] overflow-y-auto"} onClick={e=>e.stopPropagation()}>
   <div className="gm-modal-head flex justify-between items-center mb-3"><h3 className="text-slate-100 font-semibold">{title}</h3><button onClick={onClose} className="gm-icon-btn" aria-label="Fermer">{I.x}</button></div>
   {children}
  </div></div>);
export const Field=({label,children})=><label className="block text-xs text-slate-400 mb-1 mt-2">{label}{children}</label>;
export const Inp=(p)=><input {...p} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-100 mt-1"/>;

export const typeLabel=(d)=>d.typeMaintenance==="Corrective"?"Corrective — "+(d.sousType||"Curative"):(d.typeMaintenance||"Corrective");

export function GraviteBar({g}){
 const cls=g>=4?"bg-rose-500":g===3?"bg-orange-500":g===2?"bg-amber-500":"bg-slate-400";
 return (<div className="flex items-center gap-1"><div className="flex gap-0.5">{[1,2,3,4].map(i=><div key={i} className={"w-2 h-4 rounded-sm "+(i<=g?cls:"bg-slate-700")}></div>)}</div><span className="text-xs text-slate-400 ml-1">{g}/4</span></div>);
}

/* ===== Congés des intervenants ===== */
export function MultiInter({inter,value,onChange,sys,date,extraDates}){
 const filtres=interDuSysteme(inter,sys);
 const toggle=(n)=>onChange(value.includes(n)?value.filter(x=>x!==n):[...value,n]);
 // Intervenants sélectionnés qui sont pourtant en congé à la date de l'intervention
 const aRemplacer=date?value.map(n=>{const t=inter.find(x=>x.nom===n);const c=congeAt(t,date);return c?{n,c}:null;}).filter(Boolean):[];
 // Congés qui tombent sur d'autres occurrences (plan récurrent) : simple avertissement
 const autres=(extraDates||[]).length?value.map(n=>{const t=inter.find(x=>x.nom===n);const ds=(extraDates||[]).filter(d=>d!==date&&congeAt(t,d));return ds.length?{n,ds}:null;}).filter(Boolean):[];
 return <div>
  {sys && filtres.length<inter.length && <div className="text-[11px] text-slate-500 mb-1">Liste limitée aux intervenants (technicien, chargé de maintenance, responsable...) du système {sys}.</div>}
  {date && nonOuvre(date) && <div className="mb-1 rounded-lg border border-amber-700 bg-amber-900/20 px-2 py-1.5 text-xs text-amber-400">🎌 {frDate(date)} : {nonOuvre(date).nom}. Assignez uniquement pour un travail exceptionnel.</div>}
  {aRemplacer.length>0 && <div className="mb-1 rounded-lg border border-rose-700 bg-rose-900/30 px-2 py-1.5 text-xs text-rose-300">⚠ {aRemplacer.map(x=>x.n+" est en congé "+libConge(x.c)).join(" ; ")}. Retirez-le et choisissez un autre intervenant.</div>}
  {autres.length>0 && <div className="mb-1 rounded-lg border border-amber-700 bg-amber-900/20 px-2 py-1.5 text-xs text-amber-400">⚠ {autres.map(x=>x.n+" sera en congé le "+x.ds.slice(0,3).map(frDate).join(", ")+(x.ds.length>3?"…":"")).join(" ; ")} : prévoyez un remplaçant pour ces dates.</div>}
  <div className="flex flex-wrap gap-1 mt-1">{filtres.map(i=>{
   const cg=date?congeAt(i,date):null, sel=value.includes(i.nom);
   if(cg && !sel) return <button type="button" key={i.mat} disabled title={"En congé "+libConge(cg)} className="px-2 py-1 rounded-lg text-xs border border-slate-700 bg-slate-900 text-slate-500 opacity-60 cursor-not-allowed">⛔ {i.nom} <span className="text-slate-500">— en congé {libConge(cg)}</span></button>;
   return <button type="button" key={i.mat} onClick={()=>toggle(i.nom)} className={"px-2 py-1 rounded-lg text-xs border "+(cg?"bg-rose-700 border-rose-500 text-white":sel?"bg-sky-600 border-sky-500 text-white":"bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-700")}>{sel?"✓ ":"+ "}{i.nom} <span className="opacity-70">{i.poste}</span>{i.externe && <span className="ml-1 px-1 rounded bg-amber-600 text-amber-50">Externe</span>}{cg && <span> — en congé</span>}</button>;
  })}</div>
 </div>;
}
export const ProgressBar=({pct})=>(<div className="flex items-center gap-2 min-w-[110px]"><div className="flex-1 bg-slate-700 rounded-full h-2 overflow-hidden"><div className={"h-2 rounded-full "+(pct>=100?"bg-emerald-500":"bg-amber-500")} style={{width:pct+"%"}}></div></div><span className="text-xs text-slate-300 w-9 text-right">{pct}%</span></div>);
export const KPI=({items})=>(<div className="grid grid-cols-2 md:grid-cols-4 gap-3">
 {items.map(([l,v,c])=><Card key={l} cls={"kpi-tile "+c}><div className="kpi-label text-xs text-slate-400">{l}</div><div className={"kpi-value text-2xl font-bold "+c}>{v}</div></Card>)}
</div>);
export const Segment=({value,options,onChange})=><div className="flex gap-1 mt-1">{options.map(o=><button type="button" key={o} onClick={()=>onChange(o)} className={"px-3 py-1.5 rounded-lg text-sm border "+(value===o?"bg-sky-600 border-sky-500 text-white":"bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-700")}>{o==="Jour"?"☀️ Jour":o==="Nuit"?"🌙 Nuit":o}</button>)}</div>;
export const HoraireConsignation=({v,onChange})=><div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
 <div><div className="text-xs text-slate-400">Durée de travail (Jour / Nuit)</div><Segment value={v.horaire||"Jour"} options={["Jour","Nuit"]} onChange={x=>onChange({horaire:x})}/></div>
 <div><div className="text-xs text-slate-400">Consignation nécessaire ?</div><Segment value={v.consignation||"Non"} options={["Oui","Non"]} onChange={x=>onChange({consignation:x})}/></div>
</div>;
export const Info=({l,children})=><div><div className="text-xs text-slate-500">{l}</div><div className="text-sm text-slate-200">{children}</div></div>;

export const EquipSelect=({equipements,value,onPick})=>(
 <select value={value} onChange={e=>{const eq=equipements.find(x=>x.code===e.target.value);onPick(eq||null);}} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm mt-1">
  <option value="">— Choisir un équipement —</option>
  {equipements.map(e=><option key={e.code} value={e.code}>{e.code} — {e.nom}</option>)}
 </select>);

export function MotifForm({onSubmit}){
 const [motif,setMotif]=useState("");
 return (<div>
  <Field label="Motif d'annulation"><textarea value={motif} onChange={e=>setMotif(e.target.value)} rows="3" className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-100 mt-1"/></Field>
  <div className="flex justify-end mt-3"><Btn cls="bg-rose-700 hover:bg-rose-600" onClick={()=>onSubmit(motif)}>Confirmer l'annulation</Btn></div>
 </div>);
}

export function MateriauxSection({label,categorie,pieces,list,setList}){
 const options=pieces.filter(p=>p.categorie===categorie);
 const [sel,setSel]=useState("");
 const [qte,setQte]=useState(1);
 const [ouvert,setOuvert]=useState(false);
 function ajouter(){ if(!sel) return; setList(l=>[...l,{code:sel,qte}]); setSel(""); setQte(1); setOuvert(false); }
 return (<div>
  <div className="text-xs text-slate-400 mt-3 font-medium">{label} (prix hérité de la fiche magasin) — modifiable</div>
  {list.length===0 && <div className="text-xs text-slate-500 mt-1">Aucun{categorie==="Pièce"?"e":""} {categorie.toLowerCase()} pour le moment.</div>}
  {list.map((it,idx)=>{const pc=pieces.find(p=>p.code===it.code);return <div key={idx} className="text-xs flex justify-between bg-slate-900 rounded px-2 py-1 mt-1"><span>{it.code} — {pc?.nom} × {it.qte}</span><span className="flex items-center gap-2">{(pc?pc.prix*it.qte:0).toLocaleString()} DA<button type="button" className="text-slate-500 hover:text-rose-400" onClick={()=>setList(l=>l.filter((_,i)=>i!==idx))}>{I.x}</button></span></div>;})}
  {options.length===0 ? <div className="text-xs text-slate-600 mt-1">Aucun article de catégorie "{categorie}" dans le magasin.</div> : <>
  {!ouvert && <button type="button" onClick={()=>setOuvert(true)} className="text-xs text-sky-400 hover:underline mt-2">+ Ajouter / modifier {categorie==="Pièce"?"une pièce":categorie==="Outillage"?"un outillage":"un consommable"}</button>}
  {ouvert && <div className="flex gap-1 mt-2">
   <select value={sel} onChange={e=>setSel(e.target.value)} className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm"><option value="">— Choisir —</option>{options.map(p=><option key={p.code} value={p.code}>{p.code} — {p.nom} (PU {p.prix} DA)</option>)}</select>
   <input type="number" min="1" value={qte} onChange={e=>setQte(Number(e.target.value))} className="w-16 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm"/>
   <Btn cls="bg-slate-700 hover:bg-slate-600 text-xs" onClick={ajouter}>+ Ajouter</Btn>
  </div>}
  </>}
 </div>);
}
export const Chk=({checked,onChange,children})=><label className="flex items-center gap-1.5 text-sm cursor-pointer"><input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)}/>{children}</label>;
