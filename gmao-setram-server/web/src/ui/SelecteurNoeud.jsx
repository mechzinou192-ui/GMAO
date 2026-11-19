// Sélecteur de nœud de l'arborescence : recherche + filtre par niveau + liste courte défilante.
// Remplace la longue liste déroulante, ingérable quand l'arborescence compte des centaines de nœuds.
import React,{useState,useMemo} from "react";
import {libelleNiveau} from "../../../server/src/profils-core.js";

const norm=(t)=>String(t||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
const MAX_AFFICHES=40;
const ordreNiveaux=["systeme","sousSysteme","equipement","sousEquipement","sousSousEquipement"];
const retrait={systeme:"",sousSysteme:"pl-2",equipement:"pl-4",sousEquipement:"pl-6",sousSousEquipement:"pl-8"};

export default function SelecteurNoeud({noeuds,cle,onChange,ariaLabel="Nœud de l'arborescence",disabled=false,msgDesactive="Choisissez d'abord le système",msgVide="Aucun nœud accessible avec votre profil"}){
 const [q,setQ]=useState("");
 const [niv,setNiv]=useState("");
 const [ouvert,setOuvert]=useState(false);
 const choisi=cle?noeuds.find(x=>x.cle===cle):null;
 const niveaux=useMemo(()=>ordreNiveaux.map(n=>[n,noeuds.filter(x=>x.niveau===n).length]).filter(([,c])=>c>0),[noeuds]);
 const resultats=useMemo(()=>{
  const mots=norm(q).split(/\s+/).filter(Boolean);
  return noeuds.filter(x=>(!niv||x.niveau===niv)&&mots.every(m=>norm(x.code+" "+x.nom+" "+(x.emplacement||"")+" "+libelleNiveau(x.niveau)).includes(m)));
 },[noeuds,q,niv]);
 const box="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm mt-1";
 if(disabled) return <div className={box+" opacity-60"} aria-label={ariaLabel}>{msgDesactive}</div>;
 if(!noeuds.length) return <div className={box+" opacity-60"} aria-label={ariaLabel}>{msgVide}</div>;
 if(choisi&&!ouvert) return(
  <div className={box+" flex items-center gap-2"} data-testid="noeud-choisi">
   <div className="flex-1 min-w-0"><div className="text-[10px] uppercase tracking-wide text-slate-400">{libelleNiveau(choisi.niveau)}</div>
    <div className="truncate"><b>{choisi.code}</b>{choisi.nom?" — "+choisi.nom:""}</div></div>
   <button type="button" className="text-xs underline text-sky-400 shrink-0" onClick={()=>{setOuvert(true);setQ("");setNiv("");}}>Changer</button>
   <button type="button" aria-label="Effacer le choix" className="text-slate-400 hover:text-slate-200 shrink-0" onClick={()=>onChange("")}>✕</button>
  </div>);
 return(
  <div className="mt-1">
   <input aria-label={ariaLabel} value={q} onChange={e=>setQ(e.target.value)} placeholder="Rechercher par code ou nom (ex : moteur, SST.01…)" className={box.replace("mt-1","")} autoComplete="off"/>
   {niveaux.length>1&&<div className="flex flex-wrap gap-1 mt-1.5">
    {[["",noeuds.length],...niveaux].map(([n,c])=><button type="button" key={n||"tous"} onClick={()=>setNiv(n)} className={"text-xs px-2 py-0.5 rounded-full border "+(niv===n?"bg-indigo-700 text-white border-indigo-700":"border-slate-600 text-slate-300")}>{n?libelleNiveau(n):"Tous"} ({c})</button>)}
   </div>}
   <ul role="listbox" aria-label="Résultats" className="mt-1.5 max-h-56 overflow-y-auto rounded-lg border border-slate-700 divide-y divide-slate-800">
    {resultats.slice(0,MAX_AFFICHES).map(x=><li key={x.cle} role="option" aria-selected={x.cle===cle}>
     <button type="button" onClick={()=>{onChange(x.cle);setOuvert(false);setQ("");}} className={"w-full text-left px-2 py-1.5 text-sm hover:bg-slate-800 "+(retrait[x.niveau]||"")}>
      <span className="text-[10px] uppercase tracking-wide text-slate-400 mr-1.5">{libelleNiveau(x.niveau)}</span><b>{x.code}</b>{x.nom?" — "+x.nom:""}
     </button></li>)}
    {!resultats.length&&<li className="px-2 py-2 text-sm text-slate-400">Aucun résultat pour cette recherche.</li>}
   </ul>
   {resultats.length>MAX_AFFICHES&&<div className="text-xs text-slate-400 mt-1">{resultats.length} résultats : seuls les {MAX_AFFICHES} premiers sont affichés — tapez plus de lettres ou filtrez par niveau.</div>}
   {choisi&&<button type="button" className="text-xs underline text-sky-400 mt-1" onClick={()=>setOuvert(false)}>Garder « {choisi.code} »</button>}
  </div>);
}
