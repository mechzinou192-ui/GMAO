// Maintenance prédictive : prévision des prochaines pannes de chaque équipement à partir de l'historique des DI / OT correctifs
// (nombre de pannes, intervalles entre pannes, durées, causes, pièces consommées). Calculs purs et testés.
// Modèle : loi de Weibull ajustée sur les intervalles entre pannes quand l'historique est suffisant (≥ 5 pannes), sinon loi exponentielle (taux constant).
// Probabilité de panne dans les h prochains jours sachant la durée écoulée depuis la dernière panne (probabilité conditionnelle).
import {kpiCollect,kpiDate,kpiHeures,kpiNorm,kpiPeriode} from "./kpi.js";
import {coutBT} from "./couts.js";

export const PRED_DEFAUT={horizonJours:30,fenetreMois:0,minPannes:3};   // fenetreMois 0 = tout l'historique
const JOUR=864e5;
const propre=(v)=>{const t=String(v==null?"":v).trim(); return t&&t!=="-"?t:"";};
const moy=(a)=>a.length?a.reduce((s,x)=>s+x,0)/a.length:0;

// Ajustement de Weibull (régression sur rangs médians) : {beta, eta} — beta=1 (exponentielle) si moins de 4 intervalles ou ajustement dégénéré.
export function predWeibull(intervalles){
 const n=intervalles.length, mtbf=moy(intervalles);
 if(n<4) return {beta:1,eta:mtbf,ajuste:false};
 const t=[...intervalles].sort((a,b)=>a-b);
 const xs=t.map(v=>Math.log(Math.max(v,0.01))), ys=t.map((_,i)=>Math.log(-Math.log(1-(i+1-0.3)/(n+0.4))));
 const mx=moy(xs), my=moy(ys); const sxx=xs.reduce((s,x)=>s+(x-mx)**2,0);
 if(sxx<1e-9) return {beta:1,eta:mtbf,ajuste:false};
 const beta=Math.min(4,Math.max(0.5,xs.reduce((s,x,i)=>s+(x-mx)*(ys[i]-my),0)/sxx));
 const eta=Math.exp(mx-my/beta);
 return {beta,eta:isFinite(eta)&&eta>0?eta:mtbf,ajuste:true};
}
// P(panne dans les h prochains jours | aucune panne depuis s jours)
export const predProba=(w,s,h)=>{const z=(x)=>Math.pow(Math.max(x,0)/w.eta,w.beta); return 1-Math.exp(-(z(s+h)-z(s)));};

export function predireMaintenance({unit,dis,bts,planning,equipements,pieces,flt,aujourdhui=new Date(),horizonJours=PRED_DEFAUT.horizonJours,fenetreMois=PRED_DEFAUT.fenetreMois,minPannes=PRED_DEFAUT.minPannes}){
 const c=kpiCollect(unit,{dis,bts,planning,equipements},kpiPeriode("",""),"Équipements avec DI/OT",flt||{sys:"",sub:"",eq:"",se:""});
 const now=aujourdhui.getTime(), debut=fenetreMois>0?new Date(aujourdhui.getFullYear(),aujourdhui.getMonth()-fenetreMois,aujourdhui.getDate()).getTime():-Infinity;
 const par={};
 c.corr.filter(r=>r.di.etat!=="Annulé").forEach(r=>{const d=kpiDate(r.di.dateEvt)||kpiDate(r.di.dateCreation); if(!d) return; const ms=d.getTime(); if(ms<debut||ms>now+JOUR) return; (par[r.di.eq]=par[r.di.eq]||[]).push({ms,r});});
 const nomEq=(code,def)=>{const e=(equipements||[]).find(x=>x.code===code); return (e&&e.nom)||def||code;};
 const fmt=(ms)=>{const d=new Date(ms); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");};
 const lignes=[]; let insuffisants=0;
 Object.keys(par).sort().forEach(code=>{
  const ev=par[code].sort((a,b)=>a.ms-b.ms);
  if(ev.length<minPannes){insuffisants++; return;}
  const iv=ev.slice(1).map((e,i)=>Math.max(0.5,(e.ms-ev[i].ms)/JOUR)), n=iv.length;
  const mtbf=moy(iv), k=Math.floor(n/2), ratio=k>=1?moy(iv.slice(n-k))/Math.max(moy(iv.slice(0,k)),0.01):1;
  const tendance=ratio<0.75?"Dégradation":ratio>1.33?"Amélioration":"Stable";
  const w=predWeibull(iv), derniere=ev[ev.length-1].ms, s=Math.max(0,(now-derniere)/JOUR);
  const proba=predProba(w,s,horizonJours), prochaine=derniere+mtbf*JOUR, enRetard=s>=mtbf;
  const mtbfProj=tendance==="Dégradation"?moy(iv.slice(-Math.min(3,n))):mtbf, pannes12=365/Math.max(mtbfProj,0.5);
  const bt=ev.map(e=>e.r.bt).filter(Boolean);
  const hMoy=moy(bt.map(kpiHeures)), dMoy=moy(bt.map(b=>Number(b.dureeIntervention)||0)), cMoy=moy(bt.map(b=>coutBT(b,pieces||[]).total));
  const g={}; ev.forEach(e=>{const cause=propre(e.r.bt&&e.r.bt.cause), panne=propre(e.r.bt&&e.r.bt.panne)||propre(e.r.di.designation); const key=kpiNorm(cause||panne); if(!key) return; (g[key]=g[key]||{cause,panne,n:0}).n++;});
  const causes=Object.values(g).sort((a,b)=>b.n-a.n), cause=causes[0]?(causes[0].cause||causes[0].panne):"";
  const pc={}; bt.forEach(b=>(b.pieces||[]).forEach(it=>{const p=(pc[it.code]=pc[it.code]||{code:it.code,fois:0,qte:0}); p.fois++; p.qte+=Number(it.qte)||0;}));
  const piecesProb=Object.values(pc).sort((a,b)=>b.fois-a.fois||b.qte-a.qte).slice(0,3).map(p=>{const st=(pieces||[]).find(x=>x.code===p.code); const qte=Math.max(1,Math.round(p.qte/Math.max(bt.length,1)));
   return {code:p.code,nom:(st&&(st.designation||st.nom))||p.code,qte,stockOk:st?(Number(st.stock)||0)>=qte:null};});
  let risque=proba>=0.5?"Élevé":proba>=0.25?"Moyen":"Faible"; if(enRetard&&risque==="Faible") risque="Moyen"; if(tendance==="Dégradation"&&proba>=0.3&&risque==="Moyen") risque="Élevé";
  const avant=fmt(Math.max(prochaine,now));
  const action=risque==="Élevé"?"Planifier une intervention préventive avant le "+avant+(piecesProb.length?" et prévoir les pièces":""):risque==="Moyen"?"Inspecter l'équipement et vérifier les pièces à prévoir":"Aucune action urgente";
  lignes.push({eq:code,nom:nomEq(code,(ev[0].r.di.nom)),pannes:ev.length,mtbfJours:mtbf,derniere:fmt(derniere),joursDepuis:s,prochaine:fmt(prochaine),enRetard,proba,horizonJours,tendance,
   beta:w.beta,modele:w.ajuste?"Weibull":"Exponentielle",heuresMoy:hMoy,dureeMoy:dMoy,coutMoy:cMoy,pannes12,arret12:pannes12*hMoy,cout12:pannes12*cMoy,cause,causeOcc:causes[0]?causes[0].n:0,pieces:piecesProb,risque,action});
 });
 const ordre={"Élevé":0,"Moyen":1,"Faible":2};
 lignes.sort((a,b)=>ordre[a.risque]-ordre[b.risque]||b.proba-a.proba);
 return {lignes,insuffisants,synth:{analyses:lignes.length,eleve:lignes.filter(l=>l.risque==="Élevé").length,moyen:lignes.filter(l=>l.risque==="Moyen").length,faible:lignes.filter(l=>l.risque==="Faible").length,pannes12:lignes.reduce((t,l)=>t+l.pannes12,0),arret12:lignes.reduce((t,l)=>t+l.arret12,0),cout12:lignes.reduce((t,l)=>t+l.cout12,0)}};
}
