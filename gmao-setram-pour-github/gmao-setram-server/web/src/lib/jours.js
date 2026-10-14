// Jours fériés, week-end algérien (vendredi-samedi) et congés des intervenants.
import {frDate,parseD} from "./dates.js";
export const congeAt=(p,date)=>(p&&p.conges||[]).find(c=>c.du&&c.au&&date>=c.du&&date<=c.au)||null;
/* ===== Jours fériés (liste tenue par l'App) : fixes (md = "MM-JJ", chaque année) ou datés (date = "AAAA-MM-JJ") ===== */
let FERIES=[];
export const setFeries=(l)=>{FERIES=l;};
export const getFeries=()=>FERIES;
export const ferieAt=(d)=>d?FERIES.find(f=>f.md?d.slice(5)===f.md:d===f.date)||null:null;
// Week-end en Algérie : vendredi (5) et samedi (6). Jour non ouvré = jour férié ou week-end.
export const JOURS_WEEKEND=[5,6];
export const nonOuvre=(d)=>{ if(!d) return null; const fe=ferieAt(d); if(fe) return {type:"ferie",nom:fe.nom};
 const g=parseD(d).getDay(); return JOURS_WEEKEND.includes(g)?{type:"weekend",nom:"Week-end ("+["dimanche","lundi","mardi","mercredi","jeudi","vendredi","samedi"][g]+")"}:null; };
export const FERIES_DEFAUT=[
 {nom:"Nouvel An",md:"01-01"},{nom:"Yennayer (Nouvel An amazigh)",md:"01-12"},{nom:"Fête du Travail",md:"05-01"},
 {nom:"Fête de l'Indépendance",md:"07-05"},{nom:"Anniversaire de la Révolution",md:"11-01"},
 // Fêtes religieuses : dates prévisionnelles, à confirmer selon l'observation de la lune
 {nom:"Aïd el-Fitr",date:"2026-03-20"},{nom:"Aïd el-Fitr",date:"2026-03-21"},
 {nom:"Aïd el-Adha",date:"2026-05-27"},{nom:"Aïd el-Adha",date:"2026-05-28"},
 {nom:"Ras el-Am el-Hijri",date:"2026-06-17"},{nom:"Achoura",date:"2026-06-26"},{nom:"Mawlid Ennabaoui",date:"2026-08-25"},
 {nom:"Aïd el-Fitr",date:"2027-03-10"},{nom:"Aïd el-Fitr",date:"2027-03-11"},
 {nom:"Aïd el-Adha",date:"2027-05-17"},{nom:"Aïd el-Adha",date:"2027-05-18"},
 {nom:"Ras el-Am el-Hijri",date:"2027-06-07"},{nom:"Achoura",date:"2027-06-16"},{nom:"Mawlid Ennabaoui",date:"2027-08-15"},
];
export const libConge=(c)=>"du "+frDate(c.du)+" au "+frDate(c.au);
