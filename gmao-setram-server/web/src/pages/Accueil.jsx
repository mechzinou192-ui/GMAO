// Accueil : tableau de bord (menus favoris, infos DI / OT, alertes, planning, compteurs).
import React from "react";
import {etatPlanCompteur,fmtNb,isCompteurPlan} from "../lib/compteurs.js";
import {MOIS,fmtD,parseD,todayStr} from "../lib/dates.js";
import {datesPlanDansPlage} from "../lib/preventif.js";
import {Badge} from "../ui/base.jsx";
import {I} from "../ui/icones.jsx";

export const Panel=({title,count,children,cls,action})=><section className={"gm-panel "+(cls||"")}>
 <header className="gm-panel-head"><h2>{title}{count!=null&&<span className="gm-panel-count">{count}</span>}</h2>{action}</header>
 <div className="gm-panel-body">{children}</div></section>;
export const Compteur=({lib,val,coul,onClick})=><button type="button" className={"gm-counter is-"+coul} onClick={onClick}><span className="gm-counter-val">{val}</span><span className="gm-counter-lib">{lib}</span></button>;
export const ageJours=(s)=>{if(!s) return 0; const d=parseD(s); return Math.floor((parseD(todayStr())-d)/864e5);};
export function Accueil({tabOk,unit,dis,bts,planning,compteurs=[],pieces,alertes,sa,onGo,onNewDI,onNewOT,onOpenDI,onOpenOT}){
 const fav=[
  tabOk(1)&&{k:"ndi",lib:"Nouvelle demande d'intervention",coul:"green",ic:I.plus2,go:onNewDI},
  (tabOk(1)||tabOk(2))&&{k:"di",lib:"Maintenance corrective (DI / OT)",coul:"purple",ic:I.flag,go:()=>onGo(1)},
  tabOk(2)&&{k:"not",lib:"Nouvel OT préventif",coul:"teal",ic:I.plus2,go:onNewOT},
  tabOk(2)&&{k:"ot",lib:"Ordres de travail préventifs",coul:"blue",ic:I.wrench,go:()=>onGo(2)},
  tabOk(3)&&{k:"pp",lib:"Planning préventif",coul:"orange",ic:I.cal,go:()=>onGo(3)},
  tabOk(0)&&{k:"arb",lib:"Arborescence technique",coul:"navy",ic:I.tree,go:()=>onGo(0)},
  tabOk(0)&&{k:"mat",lib:"Gestion et suivi des matériaux",coul:"teal",ic:I.gauge,go:()=>onGo(9)},
  tabOk(4)&&{k:"stk",lib:"Gestion de stock",coul:"red",ic:I.store,go:()=>onGo(4)},
  tabOk(5)&&{k:"per",lib:"Gestion du personnel",coul:"cyan",ic:I.team,go:()=>onGo(5)},
  tabOk(6)&&{k:"kpi",lib:"Indicateurs de performance",coul:"slate",ic:I.chart,go:()=>onGo(6)},
  sa&&{k:"adm",lib:"Administration",coul:"grey",ic:I.gear,go:()=>onGo(7)},
 ].filter(Boolean);
 const nb=(l,f)=>l.filter(f).length;
 const diRetard=dis.filter(d=>d.etat==="À Transmettre"&&ageJours(d.dateEvt||d.dateCreation)>=2).sort((a,b)=>String(a.dateEvt).localeCompare(String(b.dateEvt)));
 const otRetard=bts.filter(b=>b.etat!=="Clôturé"&&b.etat!=="Annulé"&&ageJours(String(b.dateGeneration||b.date||"").slice(0,10))>=7);
 const today=todayStr(), fin=fmtD(new Date(parseD(today).getTime()+14*864e5));
 const prochains=planning.flatMap(p=>datesPlanDansPlage(p,today,fin).map(d=>({d,p}))).sort((a,b)=>a.d.localeCompare(b.d)).slice(0,8);
 const critiques=pieces.filter(p=>p.stock<p.min).slice(0,6);
 const cptAlertes=planning.filter(isCompteurPlan).filter(p=>!bts.some(b=>b.plan===p.code&&b.etat!=="Clôturé"))
  .map(p=>({p,st:etatPlanCompteur(p,compteurs.find(c=>c.code===p.compteur))})).filter(x=>x.st.statut==="À déclencher"||x.st.statut==="Dépassé").sort((a,b)=>b.st.pct-a.st.pct);
 return (<div className="gm-dash">
  <div className="gm-dash-col">
   {fav.length>0&&<Panel title="Mes menus favoris">
    <div className="gm-tiles">{fav.map(f=><button key={f.k} type="button" className={"gm-tile is-"+f.coul} onClick={f.go}><span className="gm-tile-ic">{f.ic}</span><span className="gm-tile-lib">{f.lib}</span></button>)}</div>
   </Panel>}
   {tabOk(1)&&<Panel title="Mes infos DI" action={<button className="gm-panel-link" onClick={()=>onGo(1)}>Voir tout ›</button>}>
    <div className="gm-counters">
     <Compteur lib="À transmettre" val={nb(dis,d=>d.etat==="À Transmettre")} coul="red" onClick={()=>onGo(1)}/>
     <Compteur lib="Transmises (OT généré)" val={nb(dis,d=>d.etat==="Transmis")} coul="blue" onClick={()=>onGo(1)}/>
     <Compteur lib="Traitées" val={nb(dis,d=>d.etat==="Traité")} coul="green" onClick={()=>onGo(1)}/>
     <Compteur lib="Avec perturbation" val={nb(dis,d=>d.perturb&&d.etat!=="Traité")} coul="orange" onClick={()=>onGo(1)}/>
    </div>
   </Panel>}
   {tabOk(2)&&<Panel title="Mes infos OT" action={<button className="gm-panel-link" onClick={()=>onGo(2)}>Voir tout ›</button>}>
    <div className="gm-counters">
     <Compteur lib="En cours" val={nb(bts,b=>b.etat==="En cours")} coul="blue" onClick={()=>onGo(2)}/>
     <Compteur lib="En attente pièce" val={nb(bts,b=>b.etat==="En attente pièce")} coul="red" onClick={()=>onGo(2)}/>
     <Compteur lib="Préventifs ouverts" val={nb(bts,b=>b.type==="Préventive"&&b.etat!=="Clôturé"&&b.etat!=="Annulé")} coul="orange" onClick={()=>onGo(2)}/>
     <Compteur lib="Clôturés" val={nb(bts,b=>b.etat==="Clôturé")} coul="green" onClick={()=>onGo(2)}/>
    </div>
   </Panel>}
   {tabOk(4)&&<Panel title="Stock critique" count={pieces.filter(p=>p.stock<p.min).length}>
    {critiques.length===0?<div className="gm-empty">Aucun article sous le seuil minimum.</div>:
    <ul className="gm-list">{critiques.map(p=><li key={p.code} onClick={()=>onGo(4)}><span className="gm-list-code">{p.code}</span><span className="gm-list-main">{p.nom}</span><span className="gm-list-side is-red">{p.stock} / min {p.min}</span></li>)}</ul>}
   </Panel>}
  </div>
  <div className="gm-dash-col">
   {alertes.length>0&&<Panel title="Mes alertes" count={alertes.length}>
    <ul className="gm-list">{alertes.map(a=><li key={a.k} onClick={()=>onGo(a.go)}><span className={"gm-list-dot "+(a.rouge?"is-red":"is-amber")}/><span className="gm-list-main"><b>{a.titre}</b><small>{a.txt}</small></span></li>)}</ul>
   </Panel>}
   {tabOk(1)&&<Panel title="Mes alertes DI en retard" count={diRetard.length}>
    {diRetard.length===0?<div className="gm-empty">Aucune DI en attente depuis plus de 48 h.</div>:
    <ul className="gm-list">{diRetard.slice(0,6).map(d=><li key={d.code} onClick={()=>onOpenDI(d.code)}><span className="gm-list-code">{d.code}</span><span className="gm-list-main">{d.designation}<small>{d.eq} — {d.nom}</small></span><span className="gm-list-side is-red">{ageJours(d.dateEvt||d.dateCreation)} j</span></li>)}</ul>}
   </Panel>}
   {tabOk(2)&&<Panel title="OT ouverts depuis plus de 7 jours" count={otRetard.length}>
    {otRetard.length===0?<div className="gm-empty">Aucun OT ouvert depuis plus de 7 jours.</div>:
    <ul className="gm-list">{otRetard.slice(0,6).map(b=><li key={b.code} onClick={()=>onOpenOT(b.code)}><span className="gm-list-code">{b.code}</span><span className="gm-list-main">{b.nom}<small>{b.type} · {b.assigne||"non assigné"}</small></span><Badge t={b.etat}/></li>)}</ul>}
   </Panel>}
   {tabOk(3)&&cptAlertes.length>0&&<Panel title="Compteurs : plans à déclencher" count={cptAlertes.length} action={<button className="gm-panel-link" onClick={()=>onGo(3)}>Préventif ›</button>}>
    <ul className="gm-list">{cptAlertes.slice(0,6).map(({p,st})=><li key={p.code} onClick={()=>onGo(3)}><span className="gm-list-code">{p.code}</span><span className="gm-list-main">{p.intitule||p.nom}<small>{p.eq} — {fmtNb(st.valeur)} / {fmtNb(st.prochain)} {st.unite}</small></span><span className={"gm-list-side"+(st.statut==="Dépassé"?" is-red":"")}>{st.pct} %</span></li>)}</ul>
   </Panel>}
   {tabOk(3)&&<Panel title="Mon planning — 14 prochains jours" count={prochains.length} action={<button className="gm-panel-link" onClick={()=>onGo(3)}>Planning ›</button>}>
    {prochains.length===0?<div className="gm-empty">Aucune visite préventive prévue sur les 14 prochains jours.</div>:
    <ul className="gm-list">{prochains.map(({d,p})=><li key={p.code+d} onClick={()=>onGo(3)}><span className="gm-date"><b>{d.slice(8,10)}</b>{MOIS[Number(d.slice(5,7))-1].slice(0,3)}</span><span className="gm-list-main">{p.intitule||("Visite "+String(p.periode||"").toLowerCase())}<small>{p.eq} — {p.nom}</small></span><span className="gm-list-side">{p.code}</span></li>)}</ul>}
   </Panel>}
  </div>
 </div>);
}
