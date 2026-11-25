// Optimisation de la maintenance : analyse annuelle automatique du retour d'expérience GMAO.
// Règles : (1) équipement avec plan préventif mais (presque) aucune panne → ESPACER le plan (maintenance systématique coûteuse) ;
// (2) équipement qui tombe trop en panne → RENFORCER : rapprocher la périodicité / revoir les tâches du plan existant,
//     ou CRÉER un plan préventif (périodicité déduite du MTBF) ; les tâches proposées viennent des causes de pannes récurrentes ;
// (3) sinon MAINTENIR. Calculs purs et testés ; aucune modification des plans (propositions à valider par l'équipe).
import {kpiCollect,kpiHeures,kpiMatch,kpiNorm,kpiPeriode,kpiUnitOf} from "./kpi.js";
import {coutBT} from "./couts.js";
import {PERIODES,isPeriodePlan,libIntervalle} from "./preventif.js";

export const OPTI_SEUILS_DEFAUT={seuilPannes:3,seuilBas:0};   // « trop de pannes » à partir de 3 pannes/an · « aucune panne » = 0
const OCC_STD={Hebdomadaire:52,Mensuel:12,Trimestriel:4,Semestriel:2,Annuel:1};

// Nombre d'occurrences d'un plan par an (null pour un plan déclenché par compteur)
export function optiOccParAn(pl){
 if(!pl||pl.declenchement==="Compteur") return null;
 if(isPeriodePlan(pl)){const n=Math.max(1,Number(pl.intervalle.n)||1); return ({jours:365,semaines:52,mois:12}[pl.intervalle.unite]||12)/n;}
 return OCC_STD[pl.periode]||null;
}
export const optiLibPlan=(pl)=>pl.declenchement==="Compteur"?"Compteur"+(pl.compteur?" ("+pl.compteur+")":""):isPeriodePlan(pl)?libIntervalle(pl.intervalle):(pl.periode||"—");

// Périodicité voisine : sens +1 = espacer (cran supérieur), −1 = rapprocher (cran inférieur). null si déjà à la limite.
export function optiPeriodeVoisine(pl,sens){
 if(pl.declenchement==="Compteur") return {lib:sens>0?"Pas du compteur × 1,5 (espacer)":"Pas du compteur × 0,67 (rapprocher)",occ:null};
 if(isPeriodePlan(pl)){const n=Math.max(1,Number(pl.intervalle.n)||1), u=pl.intervalle.unite;
  const n2=sens>0?n*2:Math.floor(n/2); if(n2<1) return null; return {lib:libIntervalle({n:n2,unite:u}),occ:optiOccParAn({...pl,intervalle:{n:n2,unite:u}})};}
 const i=PERIODES.indexOf(pl.periode); if(i<0) return null; const j=i+(sens>0?1:-1); if(j<0||j>=PERIODES.length) return null;
 return {lib:PERIODES[j],occ:OCC_STD[PERIODES[j]]};
}
// Périodicité d'un NOUVEAU plan : au plus la moitié du temps moyen entre pannes (MTBF ≈ 365 / pannes par an)
export function optiPeriodePourPannes(pannesAn){
 const mtbfJ=365/Math.max(pannesAn,1), j=mtbfJ/2;
 const p=j<=10?"Hebdomadaire":j<=45?"Mensuel":j<=135?"Trimestriel":j<=270?"Semestriel":"Annuel";
 return {periode:p,occ:OCC_STD[p],mtbfJours:mtbfJ};
}
const propre=(v)=>{const t=String(v==null?"":v).trim(); return t&&t!=="-"?t:"";};

export function optimiserMaintenance({unit,annee,dis,bts,planning,equipements,pieces,flt,seuilPannes=OPTI_SEUILS_DEFAUT.seuilPannes,seuilBas=OPTI_SEUILS_DEFAUT.seuilBas}){
 const per=kpiPeriode(annee+"-01-01",annee+"-12-31");
 const c=kpiCollect(unit,{dis,bts,planning,equipements},per,"Équipements avec DI/OT",flt||{sys:"",sub:"",eq:"",se:""});
 const corr=c.corr.filter(r=>r.di.etat!=="Annulé");
 const plans=(planning||[]).filter(p=>!p.termine&&p.eq&&kpiUnitOf(p.eq,equipements)===unit&&kpiMatch({eq:p.eq,nom:""},flt,equipements));
 const codes=new Set([...plans.map(p=>p.eq),...corr.map(r=>r.di.eq),...c.prev.map(b=>b.eq)]);
 const nomEq=(code,def)=>{const e=(equipements||[]).find(x=>x.code===code); return (e&&e.nom)||def||code;};
 const lignes=[], taches=[]; const synth={annee,nbEquip:codes.size,espacer:0,renforcer:0,creer:0,maintenir:0,aucune:0,economieH:0,economieCout:0,pannes:corr.length,coutPannes:0};
 [...codes].sort().forEach(code=>{
  const cr=corr.filter(r=>r.di.eq===code), pv=c.prev.filter(b=>b.eq===code), pl=plans.filter(p=>p.eq===code);
  const pannes=cr.length, hPannes=cr.reduce((t,r)=>t+kpiHeures(r.bt),0), cPannes=cr.reduce((t,r)=>t+(r.bt?coutBT(r.bt,pieces||[]).total:0),0);
  const cPrev=pv.reduce((t,b)=>t+coutBT(b,pieces||[]).total,0), hPrev=pv.reduce((t,b)=>t+kpiHeures(b),0);
  synth.coutPannes+=cPannes;
  const nom=nomEq(code,(cr[0]&&cr[0].di.nom)||(pv[0]&&pv[0].nom)||(pl[0]&&pl[0].nom));
  const base={eq:code,nom,pannes,heuresPannes:hPannes,coutPannes:cPannes,nbPrev:pv.length,coutPrev:cPrev,heuresPrev:hPrev};
  // causes de pannes récurrentes → tâches à proposer
  const g={}; cr.forEach(r=>{const cause=propre(r.bt&&r.bt.cause), panne=propre(r.bt&&r.bt.panne)||propre(r.di.designation), effet=propre(r.bt&&r.bt.effet);
   const k=kpiNorm(cause||panne); if(!k) return; (g[k]=g[k]||{cause,panne,effet,n:0}).n++;});
  const causes=Object.values(g).sort((a,b)=>b.n-a.n).slice(0,5);
  const dejaPlan=(txt)=>pl.some(p=>(p.taches||[]).some(t=>kpiNorm(t).includes(kpiNorm(txt))||kpiNorm(txt).includes(kpiNorm(t))));
  const tachesProp=causes.filter(x=>!dejaPlan(x.cause||x.panne)).map(x=>({eq:code,nom,tache:x.cause?"Contrôler / traiter la cause : "+x.cause+(x.panne?" (panne « "+x.panne+" »)":""):"Contrôler : "+x.panne,occurrences:x.n}));
  if(pannes>=seuilPannes){
   if(pl.length){ synth.renforcer++;
    pl.forEach(p=>{const v=optiPeriodeVoisine(p,-1), occ=optiOccParAn(p);
     lignes.push({...base,statut:"Renforcer",plan:p.code,planIntitule:p.intitule||"",periodeActuelle:optiLibPlan(p),occActuelle:occ,propose:v?v.lib:"Périodicité déjà minimale — revoir le contenu des tâches",occPropose:v?v.occ:null,
      motif:pannes+" panne(s) en "+annee+" malgré le plan préventif : rapprocher la périodicité et/ou revoir les tâches.",economieH:0,economieCout:0,taches:tachesProp});});
   } else { synth.creer++; const v=optiPeriodePourPannes(pannes);
    lignes.push({...base,statut:"Créer un plan",plan:"(nouveau plan)",planIntitule:"",periodeActuelle:"Aucun plan préventif",occActuelle:0,propose:v.periode,occPropose:v.occ,
     motif:pannes+" panne(s) en "+annee+" sans maintenance préventive (MTBF ≈ "+Math.round(v.mtbfJours)+" j) : créer un plan "+v.periode.toLowerCase()+".",economieH:0,economieCout:0,taches:tachesProp}); }
   tachesProp.forEach(t=>taches.push(t));
  } else if(pl.length&&pannes<=seuilBas){ synth.espacer++;
   pl.forEach(p=>{const v=optiPeriodeVoisine(p,1), occ=optiOccParAn(p);
    const pOT=pv.filter(b=>b.plan===p.code), nb=pOT.length||0;
    const cMoy=nb?pOT.reduce((t,b)=>t+coutBT(b,pieces||[]).total,0)/nb:(pv.length?cPrev/pv.length:0), hMoy=nb?pOT.reduce((t,b)=>t+kpiHeures(b),0)/nb:(pv.length?hPrev/pv.length:0);
    const evit=v&&occ!=null&&v.occ!=null?Math.max(0,occ-v.occ):0, eH=evit*hMoy, eC=evit*cMoy; synth.economieH+=eH; synth.economieCout+=eC;
    lignes.push({...base,statut:"Espacer",plan:p.code,planIntitule:p.intitule||"",periodeActuelle:optiLibPlan(p),occActuelle:occ,propose:v?v.lib:"Périodicité déjà maximale — alléger les tâches ou fusionner avec un autre plan",occPropose:v?v.occ:null,
     motif:"Aucune panne en "+annee+" avec "+pv.length+" OT préventif(s) : la maintenance systématique est probablement trop fréquente.",economieH:eH,economieCout:eC,taches:[]});});
  } else if(pl.length){ synth.maintenir++;
   pl.forEach(p=>lignes.push({...base,statut:"Maintenir",plan:p.code,planIntitule:p.intitule||"",periodeActuelle:optiLibPlan(p),occActuelle:optiOccParAn(p),propose:"Conserver la périodicité actuelle",occPropose:optiOccParAn(p),
    motif:pannes+" panne(s) en "+annee+" : niveau de préventif cohérent.",economieH:0,economieCout:0,taches:[]}));
  } else synth.aucune++;
 });
 return {lignes,taches,synth};
}
