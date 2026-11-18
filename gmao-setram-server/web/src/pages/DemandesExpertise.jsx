// Demandes d'expertise / d'assistance (onglet Validation) : le chargé ou le responsable maintenance décrit son problème
// et joint son rapport (PDF, Word ou Excel) ; l'expert DG du système la prend en charge, répond (avec, au besoin, ses
// propres documents) et la clôt. Le serveur contrôle chaque étape (profils-core.js : controleDemande, depotDemandeRefuse).
import React,{useState} from "react";
import {api} from "../api.js";
import {flushAll} from "../sync.js";
import {Badge,Btn,Card,Field,Inp,KPI,Modal} from "../ui/base.jsx";

export const ACCEPT_DOCS=".pdf,.docx,.xlsx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const ico=(mime)=>/sheet/.test(mime)?"📊":/word/.test(mime)?"📝":"📄";
const maintenant=()=>new Date().toISOString().slice(0,16).replace("T"," ");
const TA="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-100 mt-1";
const SEL="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-100 mt-1";
const URGENCES=["Normale","Urgente"];

// envoie les fichiers choisis sur une demande déjà enregistrée ; renvoie les métadonnées à garder dans la demande
async function envoyerFichiers(code,fichiers,par){
 await flushAll();                                   // la demande doit exister sur le serveur avant d'y joindre un fichier
 const out=[];
 for(const f of fichiers){ const m=await api.uploadFile("demandes",code,f,f.name); out.push({id:m.id,nom:m.name,mime:m.mime,taille:m.size,par,le:maintenant()}); }
 return out;
}

function ListeFichiers({fichiers,peutRetirer,onRetirer}){
 if(!(fichiers||[]).length) return <div className="text-xs text-slate-500">Aucun document joint.</div>;
 return <ul className="space-y-1">{fichiers.map(f=><li key={f.id} className="flex items-center gap-2 text-sm">
  <span>{ico(f.mime)}</span><a className="text-sky-400 hover:underline" href={api.fileUrl(f.id)} download={f.nom}>{f.nom}</a>
  <span className="text-xs text-slate-500">{f.par==="expert"?"réponse DG":"demandeur"}{f.le?" · "+f.le:""}</span>
  {peutRetirer(f)&&<button type="button" className="text-rose-400 text-xs" onClick={()=>onRetirer(f)} aria-label={"Retirer "+f.nom}>✕</button>}
 </li>)}</ul>;
}

function NouvelleDemande({unites,systemesDe,equipementsDe,otsDe,onCreer,onSave,onFermer}){
 const [f,setF]=useState({type:"Expertise",unit:unites[0]||"",system:"",eq:"",ot:"",urgence:"Normale",objet:"",probleme:""});
 const [fichiers,setFichiers]=useState([]);
 const [err,setErr]=useState(""); const [envoi,setEnvoi]=useState(false);
 const sys=systemesDe(f.unit);
 const set=(k,v)=>setF(x=>({...x,[k]:v,...(k==="unit"?{system:"",eq:"",ot:""}:k==="system"?{eq:"",ot:""}:{})}));
 async function envoyer(){
  if(!f.unit) return setErr("Choisissez l'unité.");
  if(!f.system) return setErr("Choisissez le système concerné.");
  if(!f.objet.trim()) return setErr("Donnez un objet à la demande.");
  if(!f.probleme.trim()) return setErr("Décrivez le problème.");
  setErr(""); setEnvoi(true);
  try{
   const d=await onCreer({...f,objet:f.objet.trim(),probleme:f.probleme.trim()});
   if(!d){ setEnvoi(false); return; }
   if(fichiers.length){
    try{ const meta=await envoyerFichiers(d.code,fichiers,"demandeur"); onSave({...d,fichiers:meta}); }
    catch(x){ setEnvoi(false); setErr("Demande "+d.code+" envoyée, mais document non joint : "+(x.network?"serveur injoignable.":x.message)+" Rouvrez la demande pour le joindre."); return; }
   }
   onFermer();
  }catch(x){ setErr(x.message); }
  setEnvoi(false);
 }
 return (<Modal title="Nouvelle demande d'expertise / d'assistance" onClose={onFermer} wide>
  <div className="text-sm" data-testid="nouvelle-demande">
   <Field label="Type de demande">
    <div className="flex gap-2 mt-1">{[["Expertise","Demande d'expertise"],["Assistance","Demande d'assistance"]].map(([k,l])=>
     <button type="button" key={k} onClick={()=>set("type",k)} className={"px-3 py-1.5 rounded-lg text-sm font-medium "+(f.type===k?"bg-sky-600 text-white":"bg-slate-700 text-slate-300 hover:bg-slate-600")}>{l}</button>)}</div>
   </Field>
   <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
    <Field label="Unité"><select className={SEL} value={f.unit} onChange={e=>set("unit",e.target.value)}>{unites.map(u=><option key={u}>{u}</option>)}</select></Field>
    <Field label="Système"><select className={SEL} value={f.system} onChange={e=>set("system",e.target.value)}><option value="">— Choisir —</option>{sys.map(([c,n])=><option key={c} value={c}>{c} — {n}</option>)}</select></Field>
    <Field label="Urgence"><select className={SEL} value={f.urgence} onChange={e=>set("urgence",e.target.value)}>{URGENCES.map(u=><option key={u}>{u}</option>)}</select></Field>
   </div>
   <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
    <Field label="Équipement concerné (facultatif)"><select className={SEL} value={f.eq} onChange={e=>set("eq",e.target.value)} disabled={!f.system}><option value="">—</option>{equipementsDe(f.unit,f.system).map(e=><option key={e.code} value={e.code}>{e.code} — {e.nom}</option>)}</select></Field>
    <Field label="OT lié (facultatif)"><select className={SEL} value={f.ot} onChange={e=>set("ot",e.target.value)} disabled={!f.system}><option value="">—</option>{otsDe(f.unit,f.system).map(b=><option key={b.code} value={b.code}>{b.code} — {b.eq} ({b.etat})</option>)}</select></Field>
   </div>
   <Field label="Objet"><Inp value={f.objet} onChange={e=>set("objet",e.target.value)} placeholder="Ex. : échauffement anormal du redresseur SST"/></Field>
   <Field label="Description du problème"><textarea rows="5" className={TA} value={f.probleme} onChange={e=>set("probleme",e.target.value)} placeholder="Constat, contexte, actions déjà menées, ce que vous attendez de la DG…"/></Field>
   <div className="mt-3">
    <div className="text-xs text-slate-400 mb-1">Rapport joint (PDF, Word ou Excel — facultatif)</div>
    <label className="inline-block px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-700 hover:bg-slate-600 text-slate-100 cursor-pointer">+ Joindre PDF / Word / Excel
     <input type="file" multiple accept={ACCEPT_DOCS} className="hidden" aria-label="Joindre un rapport à la demande" onChange={e=>{const l=[...(e.target.files||[])]; e.target.value=""; setFichiers(x=>[...x,...l]);}}/></label>
    {fichiers.length>0&&<ul className="mt-2 space-y-1">{fichiers.map((x,i)=><li key={i} className="flex items-center gap-2 text-sm"><span>📎</span><span>{x.name}</span><button type="button" className="text-rose-400 text-xs" onClick={()=>setFichiers(l=>l.filter((_,j)=>j!==i))} aria-label={"Retirer "+x.name}>✕</button></li>)}</ul>}
   </div>
   {err&&<div role="alert" className="text-xs text-rose-400 mt-2">{err}</div>}
   <div className="flex justify-end gap-2 mt-4">
    <Btn cls="bg-slate-700 hover:bg-slate-600" onClick={onFermer}>Annuler</Btn>
    <Btn cls={envoi?"bg-slate-700 text-slate-500":"bg-sky-600 hover:bg-sky-500 text-white"} onClick={()=>{ if(!envoi) envoyer(); }}>{envoi?"Envoi…":"Envoyer à la DG"}</Btn>
   </div>
  </div>
 </Modal>);
}

function FicheDemande({d,user,userId,demander,repondre,onSave,onFermer}){
 const [reponse,setReponse]=useState(d.reponse||"");
 const [err,setErr]=useState(""); const [envoi,setEnvoi]=useState(false);
 const close=["Traitée","Annulée"].includes(d.etat);
 const estDemandeur=demander&&(d.demandeurId===userId||!d.demandeurId);
 const demandeurPeut=estDemandeur&&d.etat==="Envoyée";
 const expertPeut=repondre&&!close;
 const histo=(action)=>[...(d.historique||[]),{action,par:user,le:maintenant()}];
 const sauver=async(x)=>{ setErr(""); try{ await onSave(x); }catch(e){ setErr(e.message); } };
 async function joindre(e,par){
  const l=[...(e.target.files||[])]; e.target.value=""; if(!l.length) return;
  setEnvoi(true); setErr("");
  try{ const meta=await envoyerFichiers(d.code,l,par); await sauver({...d,fichiers:[...(d.fichiers||[]),...meta]}); }
  catch(x){ setErr(x.network?"Serveur injoignable : document non envoyé.":x.message); }
  setEnvoi(false);
 }
 async function retirer(f){
  try{ await api.deleteFile(f.id); }catch(x){ if(x.status!==404){ setErr(x.message); return; } }
  sauver({...d,fichiers:(d.fichiers||[]).filter(x=>x.id!==f.id)});
 }
 const peutRetirer=(f)=>(demandeurPeut&&f.par!=="expert")||(expertPeut&&f.par==="expert");
 const bouton="inline-block px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-700 hover:bg-slate-600 text-slate-100 cursor-pointer";
 return (<Modal title={"Demande d'"+d.type.toLowerCase()+" "+d.code} onClose={onFermer} wide>
  <div className="space-y-4 text-sm" data-testid="fiche-demande">
   <div className="flex flex-wrap gap-x-5 gap-y-1 items-center"><Badge t={d.etat}/>{d.urgence==="Urgente"&&<span className="text-xs font-semibold text-rose-300">URGENTE</span>}
    <span className="text-slate-400">{d.unit} · {d.system}{d.eq?" · "+d.eq:""}{d.ot?" · "+d.ot:""}</span>
    <span className="text-slate-400">Demandeur : {d.demandeur} le {d.le}</span></div>
   <Card><div className="font-semibold text-slate-100">{d.objet}</div><div className="text-slate-300 whitespace-pre-wrap mt-1">{d.probleme}</div></Card>
   <Card><div className="flex items-center justify-between flex-wrap gap-2 mb-2"><div className="font-semibold text-slate-100">Documents</div>
     <div className="flex gap-2">
      {demandeurPeut&&<label className={bouton}>{envoi?"Envoi…":"+ Joindre PDF / Word / Excel"}<input type="file" multiple accept={ACCEPT_DOCS} className="hidden" onChange={e=>joindre(e,"demandeur")} aria-label="Joindre un rapport à la demande"/></label>}
      {expertPeut&&<label className={bouton}>{envoi?"Envoi…":"+ Joindre à la réponse"}<input type="file" multiple accept={ACCEPT_DOCS} className="hidden" onChange={e=>joindre(e,"expert")} aria-label="Joindre un document à la réponse"/></label>}
     </div></div>
    <ListeFichiers fichiers={d.fichiers} peutRetirer={peutRetirer} onRetirer={retirer}/>
   </Card>
   {(d.reponse||expertPeut)&&<Card><div className="font-semibold text-slate-100 mb-1">Réponse de la DG{d.reponduPar?" — "+d.reponduPar+(d.reponduLe?" le "+d.reponduLe:""):""}</div>
    {expertPeut
     ? <><textarea rows="5" className={TA} value={reponse} onChange={e=>setReponse(e.target.value)} placeholder="Diagnostic, recommandations, intervention prévue…" aria-label="Réponse de la DG"/>
        <div className="flex justify-end gap-2 mt-2 flex-wrap">
         {d.etat==="Envoyée"&&<Btn cls="bg-amber-600 hover:bg-amber-500 text-white" onClick={()=>sauver({...d,etat:"En cours",priseEnCharge:{par:user,le:maintenant()},historique:histo("Prise en charge")})}>Prendre en charge</Btn>}
         <Btn cls="bg-slate-700 hover:bg-slate-600" onClick={()=>sauver({...d,reponse:reponse.trim(),reponduPar:user,reponduLe:maintenant(),...(d.etat==="Envoyée"?{etat:"En cours",priseEnCharge:{par:user,le:maintenant()}}:{}),historique:histo("Réponse enregistrée")})}>Enregistrer la réponse</Btn>
         <Btn cls={reponse.trim()?"bg-emerald-600 hover:bg-emerald-500 text-white":"bg-slate-700 text-slate-500"} onClick={()=>{ if(!reponse.trim()){setErr("Rédigez la réponse avant de clore la demande.");return;} sauver({...d,etat:"Traitée",reponse:reponse.trim(),reponduPar:user,reponduLe:maintenant(),historique:histo("Traitée")}); }}>Répondre et clore</Btn>
        </div></>
     : <div className="text-slate-300 whitespace-pre-wrap">{d.reponse}</div>}
   </Card>}
   {!d.reponse&&!expertPeut&&!close&&<div className="text-xs text-slate-400">{d.etat==="Envoyée"?"En attente de prise en charge par l'expert DG du système "+d.system+".":"Prise en charge par "+(d.priseEnCharge?.par||"la DG")+(d.priseEnCharge?.le?" le "+d.priseEnCharge.le:"")+" : réponse en préparation."}</div>}
   {(d.historique||[]).length>0&&<div className="text-xs text-slate-500">{d.historique.map((h,i)=><div key={i}>{h.le} — {h.action} ({h.par})</div>)}</div>}
   {err&&<div role="alert" className="text-xs text-rose-400">{err}</div>}
   {demandeurPeut&&<div className="flex justify-end"><Btn cls="bg-rose-700 hover:bg-rose-600 text-xs text-white" onClick={()=>{ if(window.confirm("Annuler la demande "+d.code+" ?")) sauver({...d,etat:"Annulée",historique:histo("Annulée par le demandeur")}); }}>Annuler la demande</Btn></div>}
  </div>
 </Modal>);
}

export function DemandesExpertise({demandes,user,userId,demander,repondre,unites,systemesDe,equipementsDe,otsDe,onCreer,onSave}){
 const [nouvelle,setNouvelle]=useState(false);
 const [ouverte,setOuverte]=useState(null);
 const [filtre,setFiltre]=useState("ouvertes");
 const liste=demandes.filter(d=>filtre==="toutes"||!["Traitée","Annulée"].includes(d.etat));
 const d=ouverte&&demandes.find(x=>x.code===ouverte);
 const nb=(e)=>demandes.filter(x=>x.etat===e).length;
 return (<Card>
  <div data-testid="demandes-expertise">
  <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
   <h2 className="font-semibold text-slate-100">Demandes d'expertise et d'assistance <span className="text-slate-500 font-normal">({liste.length})</span></h2>
   <div className="flex gap-2 items-center">
    <select aria-label="Filtrer les demandes" value={filtre} onChange={e=>setFiltre(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs"><option value="ouvertes">En cours</option><option value="toutes">Toutes</option></select>
    {demander&&unites.length>0&&<Btn cls="bg-sky-600 hover:bg-sky-500 text-xs text-white" onClick={()=>setNouvelle(true)}>+ Demande d'expertise / d'assistance</Btn>}
   </div>
  </div>
  <div className="mb-3"><KPI items={[["Envoyées",nb("Envoyée"),"text-sky-400"],["En cours",nb("En cours"),"text-amber-400"],["Traitées",nb("Traitée"),"text-emerald-400"],["Urgentes ouvertes",demandes.filter(x=>x.urgence==="Urgente"&&!["Traitée","Annulée"].includes(x.etat)).length,"text-rose-400"]]}/></div>
  <div className="text-xs text-slate-400 mb-2">{demander?"Décrivez votre problème et joignez votre rapport (PDF, Word ou Excel) : l'expert DG du système est prévenu, prend en charge et vous répond ici.":"Demandes des chargés et responsables maintenance sur vos systèmes : prenez-les en charge, répondez (avec vos documents si besoin) puis clôturez."}</div>
  {liste.length===0 ? <div className="text-xs text-slate-500">Aucune demande{filtre==="ouvertes"?" en cours":""}.</div> :
  <div className="overflow-x-auto"><table className="w-full text-sm">
   <thead><tr className="text-slate-400 text-left text-xs"><th className="py-1">Code</th><th>Type</th><th>Objet</th><th>Demandeur</th><th>Date</th><th>Docs</th><th>État</th></tr></thead>
   <tbody>{liste.map(x=><tr key={x.code} className="border-t border-slate-700 align-top" data-testid={"dem-"+x.code}>
    <td className="py-1.5"><button type="button" className="text-sky-400 hover:underline text-left" onClick={()=>setOuverte(x.code)}>{x.code}</button><div className="text-xs text-slate-500">{x.unit} · {x.system}</div></td>
    <td className="text-xs">{x.type}{x.urgence==="Urgente"&&<div className="text-rose-300 font-semibold">urgente</div>}</td>
    <td className="text-sm">{x.objet}<div className="text-xs text-slate-400 max-w-md truncate">{x.probleme}</div></td>
    <td className="text-xs text-slate-400">{x.demandeur}</td>
    <td className="text-xs text-slate-400 whitespace-nowrap">{x.le}</td>
    <td className="text-xs text-slate-400">{(x.fichiers||[]).length||"—"}</td>
    <td><Badge t={x.etat}/></td>
   </tr>)}</tbody>
  </table></div>}
  {nouvelle&&<NouvelleDemande unites={unites} systemesDe={systemesDe} equipementsDe={equipementsDe} otsDe={otsDe} onCreer={onCreer} onSave={onSave} onFermer={()=>setNouvelle(false)}/>}
  {d&&<FicheDemande key={d.code} d={d} user={user} userId={userId} demander={demander} repondre={repondre} onSave={onSave} onFermer={()=>setOuverte(null)}/>}
  </div>
 </Card>);
}
