// Arborescence technique : codes des nœuds et chemin complet d'une DI / d'un OT.
// Système (SYS.UNI) → sous-système (SYS.UNI.SOUS) → équipement (SYS.UNI.SOUS.01)
//   → sous-équipement (….01.01) → sous-sous-équipement (….01.01.01)
import {UNIT_ABBR} from "./unites.js";
import {niveauDI,libelleNiveau} from "../../../server/src/profils-core.js";

export const codeSysteme=(sys,unit)=>sys+"."+(UNIT_ABBR[unit]||unit);
export const codeSousSysteme=(sys,unit,sub)=>codeSysteme(sys,unit)+"."+sub;

const nomSysteme=(code,systemsList)=>((systemsList||[]).find(x=>x[0]===code)||[])[1]||"";
const nomSousSysteme=(sys,sub,treeStruct)=>(((treeStruct||{})[sys]||[]).find(x=>x.code===sub)||{}).sub||"";

/*
 * Chemin complet du nœud visé par une DI (ou un OT : mêmes champs eq / se / ss / niveau),
 * du système jusqu'au nœud lui-même : [{niveau, code, nom}, …].
 */
export function cheminDI(d,{equipements=[],systemsList=[],treeStruct={}}={}){
 if(!d||!d.eq) return [];
 const niv=niveauDI(d);
 const e=equipements.find(x=>x.code===d.eq);
 const seg=String(d.eq).split(".");
 const sys=e?e.system:seg[0];
 const sub=e?e.subCode:seg[2];
 const out=[{niveau:"systeme",code:sys,nom:nomSysteme(sys,systemsList)}];
 if(niv==="systeme") return out;
 if(sub) out.push({niveau:"sousSysteme",code:e?codeSousSysteme(sys,e.unit,sub):seg.slice(0,3).join("."),nom:nomSousSysteme(sys,sub,treeStruct)});
 if(niv==="sousSysteme") return out;
 out.push({niveau:"equipement",code:d.eq,nom:e?e.nom:String(d.nom||"").split(" — ")[0]});
 if(d.se){
  const se=e&&(e.sousEquip||[]).find(x=>x.code===d.se);
  out.push({niveau:"sousEquipement",code:d.se,nom:se?se.nom:""});
  if(d.ss){
   const ss=se&&(se.sousSousEquip||[]).find(x=>x.code===d.ss);
   out.push({niveau:"sousSousEquipement",code:d.ss,nom:ss?ss.nom:""});
  }
 }
 return out;
}

// Texte sur une ligne : « CFO › CFO.ALG.SST › CFO.ALG.SST.01 › … »
export const cheminTexte=(chemin,avecNoms=false)=>chemin.map(n=>avecNoms&&n.nom?n.code+" "+n.nom:n.code).join(" › ");

/*
 * Le nœud concerné par une DI (ou un OT), SEUL : { code, nom } du dernier niveau choisi, sans le chemin.
 * `d.nom` contient le texte composé à la création (équipement — sous-équipement — sous-sous-équipement) :
 * on préfère le nom du nœud lui-même, et à défaut le dernier morceau de ce texte.
 */
export function noeudDI(d,chemin){
 if(!d) return {code:"",nom:""};
 const dernier=chemin&&chemin.length?chemin[chemin.length-1]:null;
 const code=(dernier&&dernier.code)||d.ss||d.se||d.eq||"";
 if(dernier&&dernier.nom) return {code,nom:dernier.nom};
 const morceaux=String(d.nom||"").split(" — ");
 const dernierMorceau=morceaux[morceaux.length-1]||"";
 if(code&&dernierMorceau.startsWith(code+" ")) return {code,nom:dernierMorceau.slice(code.length+1)};
 return {code,nom:d.ss||d.se?"":dernierMorceau};
}
export const noeudTexte=(d,chemin)=>{const n=noeudDI(d,chemin);return n.nom?n.code+" — "+n.nom:n.code;};

/*
 * Liste à plat de TOUS les nœuds de l'arborescence que l'on peut choisir dans un formulaire (DI, plan préventif),
 * limitée aux niveaux autorisés au profil : système, sous-système, équipement, sous-équipement, sous-sous-équipement.
 * Chaque nœud : { cle, niveau, sys, sub, eq, se, ss, code, nom, libelle, emplacement }.
 *  - eq/se/ss : mêmes champs que ceux enregistrés dans une DI / un plan (eq = code du nœud pour système et sous-système) ;
 *  - cle : valeur du <select> (le code de l'équipement pour le niveau équipement, préfixée pour les autres).
 */
export function noeudsSelectionnables({equipements=[],systemsList=[],treeStruct={},unit="",niveaux=["systeme","sousSysteme","equipement","sousEquipement","sousSousEquipement"]}={}){
 const ok=(n)=>niveaux.includes(n);
 const out=[];
 const sys=systemsList.map(x=>x[0]).filter(c=>c!=="MESURE"&&c!=="CTRL");
 const systemes=[...new Set([...sys,...equipements.map(e=>e.system)])].filter(Boolean);
 const u=unit||(equipements[0]&&equipements[0].unit)||"";
 for(const s of systemes){
  const nomS=nomSysteme(s,systemsList);
  if(ok("systeme")) out.push({cle:"systeme:"+s,niveau:"systeme",sys:s,sub:"",eq:"",se:"",ss:"",code:codeSysteme(s,u),nom:nomS,emplacement:""});
  const subs=(treeStruct[s]||[]).map(x=>({code:x.code,nom:x.sub}));
  equipements.filter(e=>e.system===s&&e.subCode&&!subs.some(x=>x.code===e.subCode)).forEach(e=>subs.push({code:e.subCode,nom:""}));
  for(const sb of subs){
   if(ok("sousSysteme")) out.push({cle:"sousSysteme:"+s+"."+sb.code,niveau:"sousSysteme",sys:s,sub:sb.code,eq:"",se:"",ss:"",code:codeSousSysteme(s,u,sb.code),nom:sb.nom,emplacement:""});
   for(const e of equipements.filter(x=>x.system===s&&x.subCode===sb.code)){
    if(ok("equipement")) out.push({cle:e.code,niveau:"equipement",sys:s,sub:sb.code,eq:e.code,se:"",ss:"",code:e.code,nom:e.nom,emplacement:e.emplacement||""});
    for(const se of (e.sousEquip||[])){
     if(ok("sousEquipement")) out.push({cle:"sousEquipement:"+e.code+"|"+se.code,niveau:"sousEquipement",sys:s,sub:sb.code,eq:e.code,se:se.code,ss:"",code:se.code,nom:se.nom,emplacement:e.emplacement||""});
     for(const ss of (se.sousSousEquip||[]))
      if(ok("sousSousEquipement")) out.push({cle:"sousSousEquipement:"+e.code+"|"+se.code+"|"+ss.code,niveau:"sousSousEquipement",sys:s,sub:sb.code,eq:e.code,se:se.code,ss:ss.code,code:ss.code,nom:ss.nom,emplacement:e.emplacement||""});
    }
   }
  }
  // équipements sans sous-système connu
  for(const e of equipements.filter(x=>x.system===s&&!x.subCode)){
   if(ok("equipement")) out.push({cle:e.code,niveau:"equipement",sys:s,sub:"",eq:e.code,se:"",ss:"",code:e.code,nom:e.nom,emplacement:e.emplacement||""});
   for(const se of (e.sousEquip||[])){
    if(ok("sousEquipement")) out.push({cle:"sousEquipement:"+e.code+"|"+se.code,niveau:"sousEquipement",sys:s,sub:"",eq:e.code,se:se.code,ss:"",code:se.code,nom:se.nom,emplacement:e.emplacement||""});
    for(const ss of (se.sousSousEquip||[]))
     if(ok("sousSousEquipement")) out.push({cle:"sousSousEquipement:"+e.code+"|"+se.code+"|"+ss.code,niveau:"sousSousEquipement",sys:s,sub:"",eq:e.code,se:se.code,ss:ss.code,code:ss.code,nom:ss.nom,emplacement:e.emplacement||""});
   }
  }
 }
 return out;
}
// Texte d'une option de liste : « Sous-équipement · CFO.ALG.SST.01.01 — Moteur »
export const libelleNoeud=(n)=>libelleNiveau(n.niveau)+" · "+n.code+(n.nom?" — "+n.nom:"");
