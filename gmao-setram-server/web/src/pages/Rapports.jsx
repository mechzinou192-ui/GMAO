// Rapports d'activité maintenance des UO : l'administrateur UO dépose (Excel / Word / PDF) et envoie à la DG ;
// chaque expert DG relève ses erreurs et commente ; le responsable DG clôture ou renvoie pour correction ; l'UO corrige
// et renvoie (nouveau tour de revue). Le serveur contrôle chaque étape (rapports-core.js) et prévient les intervenants.
import React,{useMemo,useState} from "react";
import {api} from "../api.js";
import {flushAll} from "../sync.js";
import {ETATS_RAPPORT,revuesDuTour,totalErreurs,aDesRemarques} from "../../../server/src/rapports-core.js";
import {Badge,Btn,Card,Field,Inp,KPI,Modal} from "../ui/base.jsx";
import {I} from "../ui/icones.jsx";

const ACCEPT=".xlsx,.docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const fr=(s)=>String(s||"").slice(0,16).replace("T"," ");
const moisLib=(p)=>{const m=String(p||"").match(/^(\d{4})-(\d{2})$/); return m?new Date(+m[1],+m[2]-1,1).toLocaleDateString("fr-FR",{month:"long",year:"numeric"}):(p||"—");};
const ico=(mime)=>/sheet/.test(mime)?"📊":/word/.test(mime)?"📝":"📄";

function Revues({r}){
 const tours=Object.keys(r.revues||{}).map(Number).sort((a,b)=>b-a);
 if(!tours.length) return <div className="text-xs text-slate-500">Aucune revue pour le moment.</div>;
 return tours.map(t=>{const rv=(r.revues||{})[t]||{}; const ids=t===(r.tour||1)?[...new Set([...(r.attendus||[]),...Object.keys(rv)])]:Object.keys(rv);
  return <div key={t} className="mt-2"><div className="text-xs text-slate-400 font-medium">Tour {t}{t===(r.tour||1)?" (en cours)":""}</div>
   <table className="w-full text-sm"><thead><tr className="text-slate-400 text-left text-xs"><th className="py-1">Expert</th><th>Erreurs</th><th>Commentaire</th><th>État</th></tr></thead>
   <tbody>{ids.map(id=>{const x=rv[id]; return <tr key={id} className="border-t border-slate-700 align-top"><td className="py-1">{x?.nom||id}</td><td>{x?Number(x.erreurs)||0:"—"}</td>
    <td className="text-xs text-slate-300 whitespace-pre-wrap max-w-md">{x?.commentaire||""}</td><td>{x?.terminee?<Badge t="Terminé"/>:<span className="text-xs text-amber-400">en attente</span>}</td></tr>;})}</tbody></table></div>;});
}

function FicheRapport({r,role,userId,userNom,sa,onSave,onFermer}){
 const [err,setErr]=useState(""); const [envoi,setEnvoi]=useState(false);
 const tour=String(r.tour||1);
 const maRevue=(r.revues?.[tour]||{})[userId]||{erreurs:0,commentaire:""};
 const [erreurs,setErreurs]=useState(String(maRevue.erreurs??0)); const [commentaire,setCommentaire]=useState(maRevue.commentaire||"");
 const [motif,setMotif]=useState(""); const [commentaireUO,setCommentaireUO]=useState(r.commentaireUO||"");
 const [statut,setStatut]=useState(r.etat);
 const uoPeut=(role==="uo"||sa)&&["Brouillon","À corriger"].includes(r.etat);
 const expertPeut=role==="expert"&&r.etat==="Envoyé"&&(r.attendus||[]).includes(userId)&&!maRevue.terminee;
 const respPeut=(role==="responsable"||sa)&&r.etat==="À valider DG";
 const sauver=async(data)=>{ setErr(""); try{ await onSave(data); }catch(e){ setErr(e.message); } };

 async function deposer(e){
  const fichiers=[...(e.target.files||[])]; e.target.value=""; if(!fichiers.length) return;
  setEnvoi(true); setErr("");
  try{
   await flushAll();                                   // le rapport doit exister sur le serveur avant d'y joindre un fichier
   const ajout=[];
   for(const f of fichiers){ const m=await api.uploadFile("rapports",r.code,f,f.name); ajout.push({id:m.id,nom:m.name,mime:m.mime,taille:m.size,tour:r.tour||1}); }
   await sauver({...r,fichiers:[...(r.fichiers||[]),...ajout]});
  }catch(x){ setErr(x.network?"Serveur injoignable : fichier non envoyé.":x.message); }
  setEnvoi(false);
 }
 async function retirer(f){
  try{ await api.deleteFile(f.id); }catch(x){ if(x.status!==404){ setErr(x.message); return; } }
  sauver({...r,fichiers:(r.fichiers||[]).filter(x=>x.id!==f.id)});
 }
 const revue=(terminee)=>{
  const n=Number(erreurs);
  if(!Number.isInteger(n)||n<0){ setErr("Nombre d'erreurs : entier positif ou nul."); return; }
  if(terminee&&n>0&&!commentaire.trim()){ setErr("Décrivez les erreurs dans le commentaire."); return; }
  sauver({...r,revues:{...(r.revues||{}),[tour]:{...(r.revues?.[tour]||{}),[userId]:{nom:userNom,erreurs:n,commentaire:commentaire.trim(),terminee,le:new Date().toISOString().slice(0,16).replace("T"," ")}}}});
 };
 const remarques=aDesRemarques(r);
 return (<Modal title={"Rapport "+r.code+" — "+r.unit} onClose={onFermer} wide>
  <div className="space-y-4 text-sm" data-testid="fiche-rapport">
   <div className="flex flex-wrap gap-x-5 gap-y-1 items-center"><Badge t={r.etat}/><span><b>{r.titre}</b></span><span className="text-slate-400">Période : {moisLib(r.periode)}</span><span className="text-slate-400">Tour de revue : {r.tour||1}</span>
    {r.etat!=="Brouillon"&&<span className="text-slate-400">Erreurs (tour en cours) : <b className={totalErreurs(r)?"text-rose-400":"text-emerald-400"}>{totalErreurs(r)}</b></span>}</div>
   {r.decision&&r.decision.etat==="À corriger"&&r.etat==="À corriger"&&<div className="rounded-lg border border-rose-600 bg-rose-900/30 px-3 py-2 text-xs text-rose-200"><b>À corriger</b> — renvoyé par {r.decision.par} le {fr(r.decision.le)}{r.decision.motif?" : "+r.decision.motif:""}</div>}

   <Card><div className="flex items-center justify-between flex-wrap gap-2"><div className="font-semibold text-slate-100">Fichiers du rapport</div>
     {uoPeut&&<label className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-700 hover:bg-slate-600 text-slate-100 cursor-pointer">{envoi?"Envoi…":"+ Joindre Excel / Word / PDF"}<input type="file" multiple accept={ACCEPT} className="hidden" onChange={deposer} aria-label="Joindre des fichiers au rapport"/></label>}</div>
    {(r.fichiers||[]).length===0?<div className="text-xs text-slate-500 mt-1">Aucun fichier.{uoPeut?" Joignez le rapport (Excel et / ou Word) avant de l'envoyer.":""}</div>:
    <ul className="mt-2 space-y-1">{[...(r.fichiers||[])].sort((a,b)=>(b.tour||1)-(a.tour||1)).map(f=><li key={f.id} className="flex items-center gap-2">
     <span>{ico(f.mime)}</span><a className="text-sky-400 hover:underline" href={api.fileUrl(f.id)} download={f.nom}>{f.nom}</a><span className="text-xs text-slate-500">tour {f.tour||1}</span>
     {uoPeut&&(f.tour||1)===(r.tour||1)&&<button type="button" className="text-rose-400 text-xs" onClick={()=>retirer(f)} aria-label={"Retirer "+f.nom}>✕</button>}</li>)}</ul>}
   </Card>

   {uoPeut&&<Card><div className="font-semibold text-slate-100 mb-1">{r.etat==="À corriger"?"Correction":"Envoi à la DG"}</div>
    <Field label="Commentaire de l'UO (facultatif)"><textarea value={commentaireUO} onChange={e=>setCommentaireUO(e.target.value)} rows="2" className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm mt-1"/></Field>
    <div className="flex justify-end gap-2 mt-2">
     <Btn cls="bg-slate-700 hover:bg-slate-600" onClick={()=>sauver({...r,commentaireUO:commentaireUO.trim()})}>Enregistrer</Btn>
     <Btn onClick={()=>{ if(!(r.fichiers||[]).length){setErr("Joignez au moins un fichier avant d'envoyer.");return;} sauver({...r,commentaireUO:commentaireUO.trim(),etat:"Envoyé"}); }}>{r.etat==="À corriger"?"Correction terminée — renvoyer aux experts":"Envoyer à la DG"}</Btn>
    </div></Card>}

   {expertPeut&&<Card><div className="font-semibold text-slate-100 mb-1">Ma revue (tour {tour})</div>
    <div className="grid sm:grid-cols-4 gap-3">
     <Field label="Nombre d'erreurs"><Inp type="number" min="0" value={erreurs} onChange={e=>setErreurs(e.target.value)} aria-label="Nombre d'erreurs"/></Field>
     <div className="sm:col-span-3"><Field label="Commentaire"><textarea aria-label="Commentaire de revue" value={commentaire} onChange={e=>setCommentaire(e.target.value)} rows="3" className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm mt-1" placeholder="Erreurs relevées, données à vérifier…"/></Field></div>
    </div>
    <div className="flex justify-end gap-2 mt-2"><Btn cls="bg-slate-700 hover:bg-slate-600" onClick={()=>revue(false)}>Enregistrer</Btn><Btn onClick={()=>revue(true)}>Terminer ma revue</Btn></div>
   </Card>}

   {respPeut&&<Card><div className="font-semibold text-slate-100 mb-1">Décision du responsable DG</div>
    <div className="text-xs text-slate-400">{remarques?"Des erreurs ou des commentaires ont été relevés : le rapport doit être renvoyé à l'UO pour correction.":"Aucune erreur ni commentaire : le rapport peut être clôturé."}</div>
    <Field label="Motif / consignes pour l'UO"><textarea aria-label="Motif de renvoi" value={motif} onChange={e=>setMotif(e.target.value)} rows="2" className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm mt-1"/></Field>
    <div className="flex justify-end gap-2 mt-2">
     <Btn cls="bg-rose-700 hover:bg-rose-600 text-white" onClick={()=>sauver({...r,etat:"À corriger",decision:{motif:motif.trim()}})}>Renvoyer à l'UO pour correction</Btn>
     <Btn cls={remarques?"bg-slate-700 text-slate-500 cursor-not-allowed":"bg-emerald-600 hover:bg-emerald-500 text-white"} onClick={()=>{ if(!remarques) sauver({...r,etat:"Clôturé"}); }}>Valider et clôturer</Btn>
    </div></Card>}

   <Card><div className="font-semibold text-slate-100">Revues des experts DG</div><Revues r={r}/></Card>

   {sa&&<Card><div className="font-semibold text-amber-300 mb-1">Statut (super administrateur)</div>
    <div className="flex gap-2 items-center flex-wrap"><select aria-label="Statut du rapport" value={statut} onChange={e=>setStatut(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm">{ETATS_RAPPORT.map(x=><option key={x}>{x}</option>)}</select>
     <Btn cls="bg-amber-600 hover:bg-amber-500 text-white" onClick={()=>statut!==r.etat&&sauver({...r,etat:statut})}>Appliquer</Btn>
     <span className="text-xs text-slate-400">Tracé dans l'historique du rapport et le journal d'audit.</span></div></Card>}

   <Card><div className="font-semibold text-slate-100 mb-1">Historique</div>
    <ul className="text-xs space-y-0.5">{[...(r.historique||[])].reverse().map((h,i)=><li key={i}><span className="text-slate-500">{fr(h.le)}</span> — {h.action}{h.detail?" ("+h.detail+")":""} <span className="text-slate-500">· {h.par}</span></li>)}</ul></Card>
   {err&&<div className="text-sm text-rose-100 bg-rose-900/60 border border-rose-500 rounded-lg px-3 py-2">⚠ {err}</div>}
  </div>
 </Modal>);
}

export function RapportsPage({rapports,role,userId,userNom,sa,unitesUO,ouvert,setOuvert,onSave,onCreer}){
 const [fUnite,setFUnite]=useState(""); const [fEtat,setFEtat]=useState("");
 const [nouveau,setNouveau]=useState(null);
 const unites=useMemo(()=>[...new Set(rapports.map(r=>r.unit))].sort(),[rapports]);
 const aFaire=(r)=>(role==="expert"&&r.etat==="Envoyé"&&(r.attendus||[]).includes(userId)&&!revuesDuTour(r)[userId]?.terminee)
  ||(role==="responsable"&&r.etat==="À valider DG")||(role==="uo"&&["Brouillon","À corriger"].includes(r.etat));
 const liste=rapports.filter(r=>(!fUnite||r.unit===fUnite)&&(!fEtat||r.etat===fEtat)).sort((a,b)=>(aFaire(b)-aFaire(a))||String(b.periode).localeCompare(String(a.periode)));
 const nb=(e)=>rapports.filter(r=>r.etat===e).length;
 const courant=ouvert&&rapports.find(r=>r.code===ouvert);
 const moisDernier=(()=>{const d=new Date(); d.setMonth(d.getMonth()-1); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0");})();
 return (<div className="space-y-5" data-testid="rapports-page">
  <KPI items={[["À traiter par vous",rapports.filter(aFaire).length,"text-sky-400"],["En revue (experts)",nb("Envoyé"),"text-amber-400"],["À valider DG",nb("À valider DG"),"text-amber-400"],["À corriger (UO)",nb("À corriger"),"text-rose-400"],["Clôturés",nb("Clôturé"),"text-emerald-400"]]}/>
  <Card>
   <div className="flex justify-between items-center flex-wrap gap-2 mb-2">
    <div><h2 className="font-semibold text-slate-100">Rapports d'activité maintenance</h2>
     <div className="text-xs text-slate-500">UO → experts DG (erreurs, commentaire) → responsable DG : clôture, ou correction par l'UO et nouvelle revue.</div></div>
    <div className="flex gap-2 flex-wrap">
     <select aria-label="Filtrer par unité" value={fUnite} onChange={e=>setFUnite(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm"><option value="">Toutes les unités</option>{unites.map(u=><option key={u}>{u}</option>)}</select>
     <select aria-label="Filtrer par état" value={fEtat} onChange={e=>setFEtat(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm"><option value="">Tous les états</option>{ETATS_RAPPORT.map(x=><option key={x}>{x}</option>)}</select>
     {(role==="uo"||sa)&&unitesUO.length>0&&<Btn onClick={()=>setNouveau({unit:unitesUO[0],periode:moisDernier,titre:""})}><span className="flex items-center gap-1">{I.plus} Nouveau rapport</span></Btn>}
    </div>
   </div>
   {liste.length===0?<div className="text-xs text-slate-500">Aucun rapport.</div>:
   <div className="overflow-x-auto"><table className="w-full text-sm">
    <thead><tr className="text-slate-400 text-left text-xs"><th className="py-1">Code</th><th>Unité</th><th>Période</th><th>Titre</th><th>Tour</th><th>Revues</th><th>Erreurs</th><th>État</th></tr></thead>
    <tbody>{liste.map(r=>{const rv=revuesDuTour(r); const fini=(r.attendus||[]).filter(id=>rv[id]?.terminee).length;
     return <tr key={r.code} onClick={()=>setOuvert(r.code)} className={"border-t border-slate-700 cursor-pointer hover:bg-slate-700/30"+(aFaire(r)?" font-semibold":"")} data-testid={"rapport-"+r.code}>
      <td className="py-1.5 text-sky-400">{r.code}{aFaire(r)&&<span className="ml-1 text-[10px] text-sky-300 uppercase">à traiter</span>}</td><td>{r.unit}</td><td>{moisLib(r.periode)}</td><td className="max-w-xs truncate">{r.titre}</td>
      <td>{r.tour||1}</td><td>{(r.attendus||[]).length?fini+"/"+r.attendus.length:"—"}</td><td>{r.etat==="Brouillon"?"—":totalErreurs(r)}</td><td><Badge t={r.etat}/></td></tr>;})}</tbody>
   </table></div>}
  </Card>
  {nouveau&&<Modal title="Nouveau rapport d'activité" onClose={()=>setNouveau(null)}>
   <Field label="Unité"><select aria-label="Unité du rapport" value={nouveau.unit} onChange={e=>setNouveau({...nouveau,unit:e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm mt-1">{unitesUO.map(u=><option key={u}>{u}</option>)}</select></Field>
   <Field label="Période (mois)"><Inp type="month" value={nouveau.periode} onChange={e=>setNouveau({...nouveau,periode:e.target.value})} aria-label="Période"/></Field>
   <Field label="Titre"><Inp value={nouveau.titre} onChange={e=>setNouveau({...nouveau,titre:e.target.value})} placeholder={"Rapport d'activité maintenance — "+moisLib(nouveau.periode)}/></Field>
   <div className="text-xs text-slate-500 mt-2">Le rapport est créé en brouillon : joignez ensuite vos fichiers Excel et Word, puis envoyez-le à la DG.</div>
   <div className="flex justify-end mt-3"><Btn onClick={async()=>{const code=await onCreer({...nouveau,titre:nouveau.titre.trim()||"Rapport d'activité maintenance — "+moisLib(nouveau.periode)}); setNouveau(null); if(code) setOuvert(code);}}>Créer le brouillon</Btn></div>
  </Modal>}
  {courant&&<FicheRapport key={courant.code+"-"+(courant.tour||1)+"-"+courant.etat} r={courant} role={role} userId={userId} userNom={userNom} sa={sa} onSave={onSave} onFermer={()=>setOuvert(null)}/>}
 </div>);
}
