// Paramétrage des seuils des indicateurs et des échelles AMDEC (super administrateur) :
// description des champs, valeurs PROPOSÉES (avec justification) et validation. Logique pure et testée.
import {KPI_PARAMS_DEFAUT,KPI_UNIT_CODE,kpiIsNew,kpiParamsFusion} from "./kpi.js";

// Valeurs proposées : les valeurs par défaut, corrigées là où elles posent question (voir « why »).
export const KPI_PARAMS_PROPOSES=(()=>{const p=kpiParamsFusion(null);
 p.objectifs.nouvelles.tmp=0.95; p.objectifs.anciennes.tmp=0.95;            // 100 % rarement tenable
 p.objectifs.nouvelles.tauxPanne=3e-4; p.objectifs.anciennes.tauxPanne=5e-4;   // cohérence « nouvelles unités = plus exigeantes »
 p.amdec.ndDefaut=3;                                                          // prudence quand la détection n'est pas saisie
 return p;})();

const get=(v,chemin)=>chemin.reduce((o,k)=>(o==null?o:o[k]),v);
const set=(v,chemin,x)=>{const c=chemin.slice(0,-1).reduce((o,k)=>o[k],v); c[chemin[chemin.length-1]]=x;};
// type : "pct" (saisi en %, stocké en fraction) · "taux" (valeur par heure) · "pctSeuil" (déjà en %) · "num" · "min" (minutes) · "int"
const OBJ=(grp,cle,suffixe)=>({
 tcp:{lib:"TCP — charge préventive (cible minimale)",type:"pct",why:"Une maintenance maîtrisée consacre au moins 70 à 80 % des heures au préventif : valeur conservée."},
 tcc:{lib:"TCC — charge corrective (cible maximale)",type:"pct",why:"Complément du TCP (TCP + TCC = 100 %) : valeur conservée."},
 tmp:{lib:"TMP — maintenance préventive réalisée",type:"pct",why:"100 % est rarement tenable (équipement indisponible, OT reporté) et déclenche des alertes permanentes. Une cible de 95 % reste exigeante : proposition 95 %."},
 tmc:{lib:"TMC — maintenance corrective traitée",type:"pct",why:"Part des DI traitées dans la période : valeur conservée."},
 dispo:{lib:"Disponibilité",type:"pct",why:"Pour un parc de transport, 95 % (anciennes unités) à 97 % (nouvelles) est un niveau courant : valeur conservée."},
 tauxPanne:{lib:"λ = 1/MTBF — taux de panne maximal (/h)",type:"taux",why:cle==="nouvelles"
  ?"À VÉRIFIER : les nouvelles unités ont une cible plus laxiste (5×10⁻⁴ /h, soit MTBF ≥ 2 000 h) que les anciennes (3×10⁻⁴ /h, MTBF ≥ 3 333 h), alors que toutes leurs autres cibles sont plus exigeantes. Proposition : 3×10⁻⁴ /h."
  :"À VÉRIFIER : voir les nouvelles unités. Proposition : 5×10⁻⁴ /h (MTBF ≥ 2 000 h), moins exigeant que les nouvelles unités."},
 tauxRep:{lib:"μ = 1/MTTR — taux de réparation minimal (/h)",type:"taux",why:"0,4 /h correspond à un MTTR ≤ 2,5 h et 0,25 /h à un MTTR ≤ 4 h : valeurs conservées."},
});
const champsObj=(cle,titre)=>Object.entries(OBJ(titre,cle)).map(([k,d])=>({id:"obj."+cle+"."+k,groupe:"Cibles — "+titre,lib:d.lib,type:d.type,chemin:["objectifs",cle,k],why:d.why}));
export const KPI_PARAMS_CHAMPS=[
 ...champsObj("anciennes","unités existantes (Alger, Oran, Constantine)"),
 ...champsObj("nouvelles","nouvelles unités (Sidi Bel Abbès, Ouargla, Sétif, Mostaganem)"),
 {id:"obj.efficience.val",groupe:"Taux d'efficience",lib:"Cible du taux d'efficience",type:"pct",chemin:["objectifs","efficience","val"],why:"Charge GMAO ÷ charge RAM : 100 % signifie que le rapport d'activité reflète toute la charge saisie dans la GMAO. Valeur conservée."},
 {id:"obj.efficience.tol",groupe:"Taux d'efficience",lib:"Tolérance autour de la cible (±)",type:"pct",chemin:["objectifs","efficience","tol"],why:"± 10 % = atteint, ± 20 % = proche, au-delà = non atteint. Valeur conservée."},
 {id:"taux.tauxPanne.0",groupe:"Échelle qualitative des taux (en %)",lib:"Taux de panne théorique — Bon jusqu'à (<)",type:"pctSeuil",chemin:["taux","tauxPanne",0],why:"Heures correctives ÷ temps théorique du parc : valeur conservée."},
 {id:"taux.tauxPanne.1",groupe:"Échelle qualitative des taux (en %)",lib:"Taux de panne théorique — Alerte jusqu'à (<)",type:"pctSeuil",chemin:["taux","tauxPanne",1],why:"Au-delà : seuil critique. Valeur conservée."},
 {id:"taux.tauxInterv.0",groupe:"Échelle qualitative des taux (en %)",lib:"Taux d'intervention — Bon jusqu'à (<)",type:"pctSeuil",chemin:["taux","tauxInterv",0],why:"Indisponibilité cumulée ÷ temps théorique : valeur conservée."},
 {id:"taux.tauxInterv.1",groupe:"Échelle qualitative des taux (en %)",lib:"Taux d'intervention — Alerte jusqu'à (<)",type:"pctSeuil",chemin:["taux","tauxInterv",1],why:"Au-delà : seuil critique. Valeur conservée."},
 {id:"taux.recurrence.0",groupe:"Échelle qualitative des taux (en %)",lib:"Taux de récurrence — Bon jusqu'à (<)",type:"pctSeuil",chemin:["taux","recurrence",0],why:"Pannes répétées (même équipement et même motif) : valeur conservée."},
 {id:"taux.recurrence.1",groupe:"Échelle qualitative des taux (en %)",lib:"Taux de récurrence — Alerte jusqu'à (<)",type:"pctSeuil",chemin:["taux","recurrence",1],why:"Au-delà : seuil critique. Valeur conservée."},
 {id:"amdec.f.0",groupe:"AMDEC — Probabilité P (occurrences par an)",lib:"P = 2 à partir de (occurrences/an)",type:"num",chemin:["amdec","f",0],why:"Une panne par an : défaillance possible. Valeur conservée."},
 {id:"amdec.f.1",groupe:"AMDEC — Probabilité P (occurrences par an)",lib:"P = 3 à partir de (occurrences/an)",type:"num",chemin:["amdec","f",1],why:"4 par an (trimestriel) : défaillance probable. Valeur conservée."},
 {id:"amdec.f.2",groupe:"AMDEC — Probabilité P (occurrences par an)",lib:"P = 4 à partir de (occurrences/an)",type:"num",chemin:["amdec","f",2],why:"52 par an (hebdomadaire) : défaillance fréquente. Valeur conservée."},
 {id:"amdec.g.0",groupe:"AMDEC — Gravité G (arrêt moyen en minutes)",lib:"G = 2 à partir de (min)",type:"num",chemin:["amdec","g",0],why:"À ajuster selon l'impact sur le service : valeur conservée."},
 {id:"amdec.g.1",groupe:"AMDEC — Gravité G (arrêt moyen en minutes)",lib:"G = 3 à partir de (min)",type:"num",chemin:["amdec","g",1],why:"20 minutes : valeur conservée."},
 {id:"amdec.g.2",groupe:"AMDEC — Gravité G (arrêt moyen en minutes)",lib:"G = 4 à partir de (min)",type:"num",chemin:["amdec","g",2],why:"2 heures : valeur conservée."},
 {id:"amdec.crit.med",groupe:"AMDEC — Criticité C = G × P × ND (1 à 64)",lib:"Criticité modérée à partir de (C ≥)",type:"int",chemin:["amdec","crit","med"],why:"Valeur conservée."},
 {id:"amdec.crit.high",groupe:"AMDEC — Criticité C = G × P × ND (1 à 64)",lib:"Criticité majeure à partir de (C ≥)",type:"int",chemin:["amdec","crit","high"],why:"16 = 25 % du score maximal (64). Valeur conservée."},
 {id:"amdec.nd",groupe:"AMDEC — Détectabilité ND",lib:"ND appliquée quand la détection n'est pas saisie sur l'OT (1 à 4)",type:"int",chemin:["amdec","ndDefaut"],why:"ND = 2 suppose une panne détectable par simple inspection, ce qui sous-estime la criticité quand rien n'est saisi. Proposition prudente : ND = 3."},
];
// Cibles par unité (wilaya) : les 7 cibles de la maintenance, surchargeables unité par unité (valeur vide = celle du groupe)
export const KPI_UNITES=Object.keys(KPI_UNIT_CODE);
export const KPI_CIBLES_UNITE=[["tcp","TCP — charge préventive (min.)","pct"],["tcc","TCC — charge corrective (max.)","pct"],["tmp","TMP — maintenance préventive","pct"],["tmc","TMC — maintenance corrective","pct"],["dispo","Disponibilité (min.)","pct"],["tauxPanne","λ — taux de panne (max., /h)","taux"],["tauxRep","μ — taux de réparation (min., /h)","taux"]].map(([id,lib,type])=>({id,lib,type}));
export const unitesGroupe=(u)=>kpiIsNew(u)?"nouvelles":"anciennes";
KPI_PARAMS_CHAMPS.forEach(c=>{c.defaut=get(KPI_PARAMS_DEFAUT,c.chemin); c.propose=get(KPI_PARAMS_PROPOSES,c.chemin);});

// Conversion saisie ⇄ stockage (pourcentages saisis en %, stockés en fractions)
export const paramVersSaisie=(c,v)=>c.type==="pct"?Math.round(v*10000)/100:v;
export const paramDepuisSaisie=(c,x)=>c.type==="pct"?Number(x)/100:Number(x);
export const paramLireValeur=(valeurs,c)=>get(valeurs,c.chemin);
export function paramEcrire(valeurs,c,x){const v=JSON.parse(JSON.stringify(valeurs)); set(v,c.chemin,x); return v;}
export const paramsClone=(v)=>JSON.parse(JSON.stringify(kpiParamsFusion(v)));

// Validation : renvoie la liste des erreurs (vide = valide)
export function paramsValider(v){
 const e=[], p=kpiParamsFusion(v), fin=(x)=>Number.isFinite(x);
 ["anciennes","nouvelles"].forEach(k=>{const o=p.objectifs[k], nom=k==="anciennes"?"unités existantes":"nouvelles unités";
  ["tcp","tcc","tmp","tmc","dispo"].forEach(c=>{ if(!(o[c]>0&&o[c]<=1)) e.push("Cibles "+nom+" : "+c.toUpperCase()+" doit être comprise entre 0 et 100 %."); });
  ["tauxPanne","tauxRep"].forEach(c=>{ if(!(o[c]>0)) e.push("Cibles "+nom+" : "+(c==="tauxPanne"?"λ":"μ")+" doit être positif."); });});
 Object.keys(p.unites).forEach(u=>{const o=p.unites[u];
  ["tcp","tcc","tmp","tmc","dispo"].forEach(c=>{ if(o[c]!==undefined&&!(o[c]>0&&o[c]<=1)) e.push("Unité "+u+" : "+c.toUpperCase()+" doit être comprise entre 0 et 100 %."); });
  ["tauxPanne","tauxRep"].forEach(c=>{ if(o[c]!==undefined&&!(o[c]>0)) e.push("Unité "+u+" : "+(c==="tauxPanne"?"λ":"μ")+" doit être positif."); });});
 const ef=p.objectifs.efficience; if(!(ef.val>0&&ef.val<=2)) e.push("Taux d'efficience : la cible doit être comprise entre 0 et 200 %."); if(!(ef.tol>0&&ef.tol<=0.5)) e.push("Taux d'efficience : la tolérance doit être comprise entre 0 et 50 %.");
 [["tauxPanne","Taux de panne théorique"],["tauxInterv","Taux d'intervention"],["recurrence","Taux de récurrence"]].forEach(([k,n])=>{const [a,b]=p.taux[k]; if(!(a>0&&b>a)) e.push(n+" : le seuil « Bon » doit être positif et inférieur au seuil « Alerte ».");});
 const croissant=(t)=>t.every(fin)&&t[0]>0&&t[1]>t[0]&&t[2]>t[1];
 if(!croissant(p.amdec.f)) e.push("AMDEC : les seuils de probabilité P doivent être positifs et croissants (P2 < P3 < P4).");
 if(!croissant(p.amdec.g)) e.push("AMDEC : les seuils de gravité G doivent être positifs et croissants (G2 < G3 < G4).");
 if(!(p.amdec.crit.med>0&&p.amdec.crit.high>p.amdec.crit.med&&p.amdec.crit.high<=64)) e.push("AMDEC : la criticité modérée doit être inférieure à la criticité majeure (≤ 64).");
 if(![1,2,3,4].includes(p.amdec.ndDefaut)) e.push("AMDEC : la détectabilité par défaut doit être 1, 2, 3 ou 4.");
 return e;
}
