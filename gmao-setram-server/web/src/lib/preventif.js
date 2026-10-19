// Maintenance préventive : périodicités, occurrences d'un plan, génération d'un OT préventif.
import {addMonths,fmtD,occurrence,parseD,todayStr} from "./dates.js";
export const PERIODES=["Hebdomadaire","Mensuel","Trimestriel","Semestriel","Annuel"];
export function prochaineEcheance(dateStr,per){
 const add=(d)=>{const x=new Date(d);
  if(per==="Hebdomadaire"){x.setDate(x.getDate()+7); return x;}
  return addMonths(x,{Mensuel:1,Trimestriel:3,Semestriel:6,Annuel:12}[per]||1);};
 let n=add(dateStr);
 if(n.toISOString().slice(0,10)<todayStr()) n=add(todayStr());
 return n.toISOString().slice(0,10);
}
// Plan « sur une période » : du debut à la fin, avec un intervalle choisi par l'utilisateur (tous les N jours / semaines / mois)
export const isPeriodePlan=(p)=>!!(p&&p.debut&&p.fin&&p.intervalle);
export function libIntervalle(iv){const n=Math.max(1,Number(iv.n)||1);return n===1?"Chaque "+({jours:"jour",semaines:"semaine",mois:"mois"}[iv.unite]):"Tous les "+n+" "+iv.unite;}
export function occurrencesPlan(p){
 const out=[]; if(!isPeriodePlan(p)) return out;
 const n=Math.max(1,Number(p.intervalle.n)||1), u=p.intervalle.unite, b=parseD(p.debut), fin=parseD(p.fin);
 for(let k=0;k<1000;k++){
  let d=new Date(b);
  if(u==="jours") d.setDate(d.getDate()+k*n);
  else if(u==="semaines") d.setDate(d.getDate()+k*n*7);
  else d=addMonths(b,k*n);
  if(d>fin) break;
  out.push(fmtD(d));
 }
 return out;
}
export const buildBTPrev=(pl,code,dateGeneration)=>({code,di:null,plan:pl.code,eq:pl.eq,nom:pl.nom,type:"Préventive",consigne:"Plan "+pl.code+" — "+pl.periode+" ("+pl.taches.length+" tâches)",horaire:pl.horaire||"Jour",consignation:pl.consignation||"Non",assigne:(pl.assignes||[]).join(", "),assignes:pl.assignes||[],echeance:pl.date,dateGeneration,
 taches:pl.taches.map(t=>({lib:t,res:null,com:""})),detection:0,gravite:0,dureeIntervention:0,tempsLogistique:0,panne:"-",cause:"-",effet:"-",intervenants:[],pieces:[],outillage:(pl.outillage||[]).map(x=>({...x})),consommables:(pl.consommables||[]).map(x=>({...x})),etat:"En cours"});
export const tRes=(t)=>t.res||(t.fait?"OK":null);
export const avancement=(b)=>{const t=b.taches||[];return t.length?Math.round(t.filter(x=>tRes(x)).length/t.length*100):null;};
export function datesPlanDansPlage(p,deb,fin){
 const out=[]; if(p.termine||!p.date) return out;
 if(p.declenchement==="Compteur") return p.date>=deb&&p.date<=fin?[p.date]:[];   // plan compteur : date estimée unique
 if(isPeriodePlan(p)) return occurrencesPlan(p).filter(x=>x>=p.date&&x>=deb&&x<=fin);
 const base=parseD(p.date);
 for(let i=0;i<600;i++){const x=fmtD(occurrence(base,p.periode,i)); if(x>fin) break; if(x>=deb) out.push(x);}
 return out;
}
export function datesFuturesPlan(f){
 if(f.declenchement==="Compteur") return f.date?[f.date]:[];
 if(!f.date||!f.periode) return [];
 const out=[]; const base=parseD(f.date); const lim=addMonths(base,12);
 for(let i=0;i<60;i++){const d=occurrence(base,f.periode,i); if(d>lim) break; out.push(fmtD(d));}
 return out;
}
