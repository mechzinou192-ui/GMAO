// Arborescence technique : codes des nœuds et chemin complet d'une DI / d'un OT.
// Système (SYS.UNI) → sous-système (SYS.UNI.SOUS) → équipement (SYS.UNI.SOUS.01)
//   → sous-équipement (….01.01) → sous-sous-équipement (….01.01.01)
import {UNIT_ABBR} from "./unites.js";
import {niveauDI} from "../../../server/src/profils-core.js";

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
