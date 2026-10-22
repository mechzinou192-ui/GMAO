// Assistant GMAO : panneau de discussion. Les réponses sont calculées localement (lib/assistant.js) sur les données
// déjà chargées pour l'utilisateur : aucune donnée n'est envoyée à un service extérieur.
import React,{useEffect,useRef,useState} from "react";
import {repondre,SUGGESTIONS} from "../lib/assistant.js";
import {I} from "../ui/icones.jsx";

function Reponse({r,onOuvrir,onQuestion}){
 return (<div className="gm-ai-rep">
  <div className="font-semibold text-[var(--ink)]">{r.titre}</div>
  {r.resume && <div className="mt-1">{r.resume}</div>}
  {r.chiffres && r.chiffres.length>0 && <div className="gm-ai-chiffres">{r.chiffres.map(([l,v])=><div key={l}><b>{v}</b><small>{l}</small></div>)}</div>}
  {(r.sections||[]).map(s=><div key={s.titre} className="mt-2">
   <div className="gm-ai-st">{s.titre}</div>
   <ul>{s.items.map((it,i)=><li key={i}>
    {it.ref&&onOuvrir?<button type="button" className="gm-ai-lien" onClick={()=>onOuvrir(it.ref)}>{it.texte}</button>:<span>{it.texte}</span>}
    {it.detail&&<small> — {it.detail}</small>}</li>)}</ul>
  </div>)}
  {r.note && <div className="gm-ai-note">{r.note}</div>}
  {r.suggestions && r.suggestions.length>0 && <div className="flex flex-wrap gap-1 mt-2">{r.suggestions.map(t=><button key={t} type="button" className="gm-ai-chip" onClick={()=>onQuestion(t)}>{t}</button>)}</div>}
 </div>);
}

export default function Assistant({contexte,unite,onOuvrir,onFermer}){
 const [fil,setFil]=useState([]);
 const [texte,setTexte]=useState("");
 const bas=useRef(null);
 useEffect(()=>{ if(bas.current&&bas.current.scrollIntoView) bas.current.scrollIntoView({block:"end"}); },[fil]);
 const poser=(q)=>{
  const question=String(q||"").trim(); if(!question) return;
  let r; try{ r=repondre(question,contexte()); }catch(e){ r={titre:"Je n'ai pas pu répondre",resume:"Erreur inattendue : "+(e.message||e)}; }
  setFil(f=>[...f,{q:question,r}]); setTexte("");
 };
 return (<div className="gm-ai" role="dialog" aria-label="Assistant GMAO" data-testid="assistant">
  <div className="gm-ai-head">
   <span className="gm-ai-ic">{I.chat}</span>
   <div className="flex-1"><b>Assistant GMAO</b><small>Réponses calculées sur les données de la GMAO — {unite}</small></div>
   <button type="button" className="gm-icon-btn" onClick={onFermer} aria-label="Fermer l'assistant">{I.x}</button>
  </div>
  <div className="gm-ai-fil">
   {fil.length===0 && <div className="gm-ai-rep">
    <div className="font-semibold text-[var(--ink)]">Bonjour, que cherchez-vous ?</div>
    <div className="mt-1">Une panne, un intervenant, un équipement, un article… Je réponds à partir des DI, OT, plans et du magasin enregistrés dans la GMAO. Rien ne sort de la GMAO.</div>
    <div className="flex flex-wrap gap-1 mt-2">{SUGGESTIONS.map(t=><button key={t} type="button" className="gm-ai-chip" onClick={()=>poser(t)}>{t}</button>)}</div>
   </div>}
   {fil.map((m,i)=><React.Fragment key={i}>
    <div className="gm-ai-q">{m.q}</div>
    <Reponse r={m.r} onOuvrir={onOuvrir} onQuestion={poser}/>
   </React.Fragment>)}
   <div ref={bas}/>
  </div>
  <form className="gm-ai-saisie" onSubmit={e=>{e.preventDefault();poser(texte);}}>
   <input value={texte} onChange={e=>setTexte(e.target.value)} placeholder="Ex. : disjoncteur qui déclenche, synthèse de K. Belaïd…" aria-label="Question à l'assistant" autoComplete="off"/>
   <button type="submit" className="gm-ai-envoi" disabled={!texte.trim()}>Envoyer</button>
  </form>
 </div>);
}
