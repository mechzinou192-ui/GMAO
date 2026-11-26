// Indicateurs de performance (KPI) : MTTR, MTBF, disponibilité, RH, stock, AMDEC... Calculs purs, testés.
import {UNIT_ABBR} from "./unites.js";
import {coutBT} from "./couts.js";
export const KPI_UNIT_CODE={"Alger":"ALG","Oran":"ORN","Constantine":"CST","Sidi Bel Abbès":"SBA","Ouargla":"ORG","Sétif":"STF","Mostaganem":"MGM"};
export const KPI_NEW_UNITS=["SBA","ORG","STF","MGM"]; // « nouvelles » unités : cibles plus exigeantes (comme getOBJ de l'ancienne appli)
export const kpiIsNew=(unit)=>KPI_NEW_UNITS.includes(KPI_UNIT_CODE[unit]);

/* ---------- Paramètres réglables par le super administrateur (cibles, seuils des taux, échelles AMDEC) ---------- */
// Valeurs par défaut = celles de l'ancienne appli (getOBJ). Le super administrateur peut les modifier (Indicateurs › Référentiel) ;
// l'application appelle kpiParamsSet() avec les valeurs enregistrées sur le serveur.
export const KPI_PARAMS_DEFAUT={
 objectifs:{
  nouvelles:{tcp:0.80,tcc:0.20,tmp:1,tmc:0.90,dispo:0.97,tauxPanne:5e-4,tauxRep:0.4},
  anciennes:{tcp:0.70,tcc:0.30,tmp:1,tmc:0.85,dispo:0.95,tauxPanne:3e-4,tauxRep:0.25},
  efficience:{val:1,tol:0.1},
 },
 unites:{},   // cibles propres à une unité (wilaya) : { "Oran": { dispo: 0.96, … } } — une valeur absente = celle du groupe (unités existantes / nouvelles)
 taux:{tauxPanne:[0.5,1],tauxInterv:[1,5],recurrence:[15,30]},      // % : bon < 1ᵉʳ seuil · alerte < 2ᵉ seuil · critique au-delà
 amdec:{f:[1,4,52],g:[2,20,120],crit:{high:16,med:10},ndDefaut:2},   // P : occurrences/an (P2, P3, P4) · G : minutes d'arrêt (G2, G3, G4) · C majeure / modérée · ND sans saisie
};
const nombre=(v,def)=>{const n=Number(v); return Number.isFinite(n)?n:def;};
// Fusionne des valeurs enregistrées avec les valeurs par défaut (toute valeur absente ou non numérique retombe sur le défaut)
export function kpiParamsFusion(raw){
 const D=KPI_PARAMS_DEFAUT, r=raw&&typeof raw==="object"?raw:{}, ob=r.objectifs||{}, tx=r.taux||{}, am=r.amdec||{};
 const obj=(k)=>Object.fromEntries(Object.keys(D.objectifs[k]).map(c=>[c,nombre((ob[k]||{})[c],D.objectifs[k][c])]));
 const tab=(src,def)=>def.map((d,i)=>nombre(Array.isArray(src)?src[i]:undefined,d));
 const IDS=Object.keys(D.objectifs.anciennes), unites={};
 Object.keys(r.unites||{}).filter(u=>KPI_UNIT_CODE[u]).forEach(u=>{const o={}; IDS.forEach(c=>{const v=(r.unites[u]||{})[c]; if(v!==undefined&&v!==null&&v!==""&&Number.isFinite(Number(v))) o[c]=Number(v);}); if(Object.keys(o).length) unites[u]=o;});
 return {objectifs:{nouvelles:obj("nouvelles"),anciennes:obj("anciennes"),efficience:obj("efficience")},unites,
  taux:{tauxPanne:tab(tx.tauxPanne,D.taux.tauxPanne),tauxInterv:tab(tx.tauxInterv,D.taux.tauxInterv),recurrence:tab(tx.recurrence,D.taux.recurrence)},
  amdec:{f:tab(am.f,D.amdec.f),g:tab(am.g,D.amdec.g),crit:{high:nombre((am.crit||{}).high,D.amdec.crit.high),med:nombre((am.crit||{}).med,D.amdec.crit.med)},ndDefaut:nombre(am.ndDefaut,D.amdec.ndDefaut)}};
}
let PARAMS=kpiParamsFusion(null);
export const kpiParamsGet=()=>PARAMS;
export function kpiParamsSet(raw){   // applique les paramètres : les tableaux de seuils sont modifiés en place (les imports existants restent valables)
 PARAMS=kpiParamsFusion(raw);
 KPI_SEUILS.tauxPanne.splice(0,2,...PARAMS.taux.tauxPanne); KPI_SEUILS.tauxInterv.splice(0,2,...PARAMS.taux.tauxInterv); KPI_SEUILS.recurrence.splice(0,2,...PARAMS.taux.recurrence);
 KPI_F_THR.splice(0,3,...PARAMS.amdec.f); KPI_G_THR.splice(0,3,...PARAMS.amdec.g); KPI_CRIT.high=PARAMS.amdec.crit.high; KPI_CRIT.med=PARAMS.amdec.crit.med;
 return PARAMS;
}
// Libellés des cibles (« > 80 % », « ≤ 5×10⁻⁴ /h »…) construits à partir des valeurs
export const kpiPctTxt=(v)=>String(Math.round(v*10000)/100).replace(".",",")+" %";
export function kpiSciTxt(v){
 if(!(v>0)) return "0"; const e=Math.floor(Math.log10(v)+1e-9), m=Math.round(v/Math.pow(10,e)*100)/100;
 return String(m).replace(".",",")+"×10"+String(e).split("").map(c=>c==="-"?"⁻":"⁰¹²³⁴⁵⁶⁷⁸⁹"[+c]).join("");
}
/* Cibles par unité (reprises de getOBJ). dir:"up" = plus c'est haut mieux c'est ; "down" = plus c'est bas mieux c'est */
export function kpiObj(unit){
 // cible de l'unité si elle en a une, sinon cible de son groupe (unités existantes / nouvelles)
 const o={...(kpiIsNew(unit)?PARAMS.objectifs.nouvelles:PARAMS.objectifs.anciennes),...(PARAMS.unites[unit]||{})}, ef=PARAMS.objectifs.efficience;
 return {
  tcp:{val:o.tcp,dir:"up",label:"> "+kpiPctTxt(o.tcp)},
  tcc:{val:o.tcc,dir:"down",label:"< "+kpiPctTxt(o.tcc)},
  tmp:{val:o.tmp,dir:"up",label:o.tmp>=1?"100 %":"> "+kpiPctTxt(o.tmp)},
  tmc:{val:o.tmc,dir:"up",label:"> "+kpiPctTxt(o.tmc)},
  dispo:{val:o.dispo,dir:"up",label:"> "+kpiPctTxt(o.dispo)},
  tauxPanne:{val:o.tauxPanne,dir:"down",label:"≤ "+kpiSciTxt(o.tauxPanne)+" /h"},
  tauxRep:{val:o.tauxRep,dir:"up",label:"≥ "+kpiSciTxt(o.tauxRep)+" /h"},
  efficience:{val:ef.val,dir:"around",tol:ef.tol,label:"≈ "+Math.round(ef.val*100)+" % ("+Math.round((ef.val-ef.tol)*100)+"–"+Math.round((ef.val+ef.tol)*100)+" %)"},   // charge GMAO ÷ charge RAM
 };
}
/* Statut vs cible (objClass de l'ancienne appli) : ok = atteint ; warn = à moins de 20 % de la cible ; bad = au-delà */
export function kpiStatus(o,val,has){
 if(!o||!has||val===null||val===undefined||isNaN(val)) return "na";
 if(o.dir==="around"){const e=Math.abs(val-o.val); return e<=o.tol?"ok":e<=o.tol*2?"warn":"bad";}   // cible centrée : ± tol = atteint, ± 2 tol = proche
 if(o.dir==="up") return val>=o.val?"ok":val>=o.val*0.8?"warn":"bad";
 return val<=o.val?"ok":val<=o.val*1.2?"warn":"bad";
}
/* Échelle qualitative (Taux de panne théorique / Taux d'intervention / Taux de récurrence) */
export function kpiRating(pct,bon,alerte){ return pct<bon?"ok":pct<alerte?"warn":"bad"; }
export const KPI_SEUILS={tauxPanne:[0.5,1],tauxInterv:[1,5],recurrence:[15,30]}; // en % (modifiables : voir kpiParamsSet)

/* ---------- Utilitaires ---------- */
export function kpiDate(s){ if(!s) return null; const t=String(s); const d=new Date(t.length<=10?t+"T00:00:00":t.replace(" ","T")); return isNaN(d.getTime())?null:d; }
export function kpiPeriode(startStr,endStr){
 const start=kpiDate(startStr)||new Date(2000,0,1); const endDay=kpiDate(endStr)||new Date(2099,11,31);
 const end=new Date(endDay.getFullYear(),endDay.getMonth(),endDay.getDate(),23,59,59);
 const days=Math.max(1,Math.round((new Date(endDay.getFullYear(),endDay.getMonth(),endDay.getDate())-new Date(start.getFullYear(),start.getMonth(),start.getDate()))/864e5)+1);
 return {start,end,days,hours:days*24};
}
export function kpiUnitOf(code,equipements){
 const e=(equipements||[]).find(x=>x.code===code); if(e) return e.unit;
 const seg=String(code||"").split("."); // SYS.ALG.SOUS.01
 if(seg.length>=2){const u=Object.keys(KPI_UNIT_CODE).find(k=>KPI_UNIT_CODE[k]===seg[1]||UNIT_ABBR[k]===seg[1]); if(u) return u;}
 return "Alger"; // code hors arborescence : rattaché à l'unité d'origine du déploiement
}
/* ---------- Filtre arborescence : système → sous-système → équipement → sous-équipement ---------- */
export function kpiEqInfo(code,equipements){
 const e=(equipements||[]).find(x=>x.code===code); if(e) return {system:e.system,sub:e.subCode,eq:e};
 const seg=String(code||"").split("."); return {system:seg[0]||"",sub:seg[2]||"",eq:null};
}
export function kpiSeOf(item,equipements){ // code du sous-équipement visé par une DI / un OT ("" = équipement entier)
 if(item&&item.se) return item.se;
 const e=(equipements||[]).find(x=>x.code===(item&&item.eq)); const t=(item&&item.nom)||"";
 const x=e&&(e.sousEquip||[]).find(y=>t.includes(y.code)); return x?x.code:"";
}
export function kpiMatch(item,flt,equipements){
 if(!flt) return true;
 const i=kpiEqInfo(item.eq,equipements);
 if(flt.sys&&i.system!==flt.sys) return false;
 if(flt.sub&&i.sub!==flt.sub) return false;
 if(flt.eq&&item.eq!==flt.eq) return false;
 if(flt.se&&kpiSeOf(item,equipements)!==flt.se) return false;
 return true;
}
export const kpiHeures=(b)=>b?(Number(b.dureeIntervention)||0)+(Number(b.tempsLogistique)||0):0; // durée intervention + temps logistique (h)
export const kpiIsPrevBT=(b)=>!!b.plan||/^pr[ée]ventive/i.test(b.type||"");
export const kpiNorm=(s)=>String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").trim();

/* ---------- Collecte du périmètre (unité + période) ---------- */
export function kpiCollect(unit,data,per,parcMode,flt){
 const {dis,bts,planning,equipements}=data;
 const inPer=(d)=>!d||(d>=per.start&&d<=per.end); // date absente => ligne incluse (règle de l'ancienne appli)
 const corr=[];
 (dis||[]).forEach(di=>{
  if(di.typeMaintenance&&di.typeMaintenance!=="Corrective") return;
  if(kpiUnitOf(di.eq,equipements)!==unit) return;
  if(!kpiMatch(di,flt,equipements)) return;
  if(!inPer(kpiDate(di.dateCreation))) return; // DATE_DI = date de création de la DI
  corr.push({di,bt:(bts||[]).find(b=>b.di===di.code)||null});
 });
 const prev=(bts||[]).filter(b=>{
  if(!kpiIsPrevBT(b)) return false;
  if(kpiUnitOf(b.eq,equipements)!==unit) return false;
  if(!kpiMatch(b,flt,equipements)) return false;
  const pl=(planning||[]).find(p=>p.code===b.plan);
  const d=kpiDate(b.dateGeneration)||kpiDate(b.dateCloture)||kpiDate(pl&&(pl.dernier||pl.date)); // DATE_PREVUE
  return inPer(d);
 });
 const parc=(equipements||[]).filter(e=>e.unit===unit&&kpiMatch({eq:e.code,nom:""},flt&&{...flt,se:""},equipements)).length;
 const codes=new Set(); corr.forEach(r=>codes.add(r.di.eq)); prev.forEach(b=>codes.add(b.eq));
 // Parc de référence : méthode d'origine = équipements distincts ayant au moins une DI/OT sur la période ;
 // option « Arborescence » = tous les équipements de l'unité dans l'arborescence technique.
 const nbEquip=parcMode==="Arborescence complète"&&parc>0?parc:Math.max(codes.size,1);
 return {corr,prev,nbEquip,parc,nbActifs:codes.size};
}

/* ---------- Durée d'indisponibilité d'une panne ---------- */
// fin = clôture de l'OT ; début = date de l'événement de la DI.
// Valeur de secours = durée d'intervention + temps logistique quand une date manque ou que l'écart est négatif.
export function kpiPanneHeures(r,per,hoursRef){
 const secours=kpiHeures(r.bt);
 let deb=kpiDate(r.di.dateEvt), fin=kpiDate(r.bt&&r.bt.dateCloture);
 const out={dh:0,skip:false,sansDebut:false,sansFin:false,negatif:false,aberrant:false};
 if(!deb){ deb=new Date(per.start.getTime()); deb.setHours(0,1,0,0); out.sansDebut=true; }
 if(!fin){ out.sansFin=true; out.dh=secours; }
 else{
  if(deb<per.start){deb=new Date(per.start.getTime()); deb.setHours(0,1,0,0);}
  if(fin>per.end){fin=new Date(per.end.getTime());}
  let dh=(fin-deb)/36e5;
  if(dh<=0){out.negatif=true; dh=secours;}
  out.dh=dh;
 }
 if(out.dh>hoursRef*1.5){out.aberrant=true; out.skip=true;}
 return out;
}

/* ---------- Cœur : calcKPIs adapté ---------- */
export const kpiIsDone=(di)=>di.etat==="Traité";
export const kpiIsOpen=(di)=>di.etat==="Transmis"||di.etat==="À Transmettre";
export function kpiCalc(corr,prev,per,nbEquip){
 const hPrev=prev.reduce((s,b)=>s+kpiHeures(b),0);
 const hCorr=corr.reduce((s,r)=>s+kpiHeures(r.bt),0);
 const hTotal=hPrev+hCorr;
 const tcp=hTotal>0?hPrev/hTotal:0, tcc=hTotal>0?hCorr/hTotal:0;
 // TMP : OT préventifs clôturés / OT préventifs (hors annulés)
 const prevActifs=prev.filter(b=>b.etat!=="Annulé");
 const btClosed=prevActifs.filter(b=>b.etat==="Clôturé").length, btDenom=prevActifs.length;
 const tmp=btDenom>0?btClosed/btDenom:0;
 // TMC : DI correctives traitées / (traitées + transmises + à transmettre) ; annulées exclues
 const pannesRep=corr.filter(r=>kpiIsDone(r.di));
 const pannesTot=corr.filter(r=>kpiIsDone(r.di)||kpiIsOpen(r.di));
 const nbPannesRep=pannesRep.length, nbPannesTot=pannesTot.length;
 const tmc=nbPannesTot>0?nbPannesRep/nbPannesTot:0;
 // MTTR = Σ durées d'intervention des pannes réparées / nb de pannes réparées
 const hIntervRep=pannesRep.reduce((s,r)=>s+(r.bt?(Number(r.bt.dureeIntervention)||0):0),0);
 const mttr=nbPannesRep>0?hIntervRep/nbPannesRep:0;
 // Indisponibilité cumulée
 let indispoH=0,nbSansFin=0,nbNegatif=0,nbAberrant=0;
 pannesTot.forEach(r=>{
  const x=kpiPanneHeures(r,per,per.hours);
  if(x.sansFin&&kpiHeures(r.bt)>0) nbSansFin++;
  if(x.negatif) nbNegatif++;
  if(x.aberrant){nbAberrant++;return;}
  indispoH+=x.dh;
 });
 // Temps théorique du parc = heures de la période × nb d'équipements (chaque équipement fonctionne en parallèle)
 const hoursFlotte=per.hours*Math.max(nbEquip,1);
 const tbf=Math.max(hoursFlotte-indispoH,0);
 const mtbf=nbPannesTot>0?tbf/nbPannesTot:hoursFlotte;
 const dispo=hoursFlotte>0?tbf/hoursFlotte:1;
 const tauxPanne=mtbf>0?1/mtbf:0, tauxRep=mttr>0?1/mttr:0;
 // Taux de panne théorique λ = durée d'intervention corrective / temps théorique ; taux d'intervention = indispo / temps théorique
 const lambdaTheo=hoursFlotte>0?hCorr/hoursFlotte:0;
 const tauxInterv=hoursFlotte>0?indispoH/hoursFlotte:0;
 // Récurrence : même équipement + même motif de panne, ≥ 2 occurrences
 const groupes={};
 pannesTot.forEach(r=>{
  const motif=kpiNorm(r.bt&&r.bt.panne&&r.bt.panne!=="-"?r.bt.panne:r.di.designation);
  if(!motif) return;
  const k=r.di.eq+"§"+motif;
  (groupes[k]=groupes[k]||{eq:r.di.eq,nom:r.di.nom,motif:(r.bt&&r.bt.panne&&r.bt.panne!=="-"?r.bt.panne:r.di.designation),count:0}).count++;
 });
 const recurrents=Object.values(groupes).filter(g=>g.count>=2).sort((a,b)=>b.count-a.count);
 const nbRecurrentes=recurrents.reduce((s,g)=>s+g.count,0);
 const tauxRecurrence=nbPannesTot>0?nbRecurrentes/nbPannesTot:0;
 // Perturbations d'exploitation (information propre à cette GMAO)
 const nbPerturb=corr.filter(r=>r.di.perturb).length;
 return {tcp,tcc,tmp,tmc,mttr,mtbf,dispo,tauxPanne,tauxRep,lambdaTheo,tauxInterv,tauxRecurrence,recurrents,nbRecurrentes,
  hPrev,hCorr,hTotal,btClosed,btDenom,diDone:nbPannesRep,diDenom:nbPannesTot,nbPannesRep,nbPannesTot,indispoH,tbf,hoursFlotte,nbEquip,
  nbSansFin,nbNegatif,nbAberrant,nbPerturb,nbDI:corr.length,nbBTPrev:prev.length};
}

/* ---------- Équipements : catégories + indicateurs par équipement ---------- */
export function kpiEquipements(corr,prev,per,equipements){
 corr=corr.filter(r=>r.di.etat!=="Annulé");
 const codes=new Set(); corr.forEach(r=>codes.add(r.di.eq)); prev.forEach(b=>codes.add(b.eq));
 const rows=[...codes].map(code=>{
  const c=corr.filter(r=>r.di.eq===code), p=prev.filter(b=>b.eq===code);
  const k=kpiCalc(c,p,per,1);
  const dC=c.reduce((s,r)=>s+(r.bt?(Number(r.bt.dureeIntervention)||0):0),0);
  const lC=c.reduce((s,r)=>s+(r.bt?(Number(r.bt.tempsLogistique)||0):0),0);
  const eq=(equipements||[]).find(e=>e.code===code);
  const nom=(eq&&eq.nom)||(c[0]&&c[0].di.nom)||(p[0]&&p[0].nom)||code;
  return {code,nom,nbCorr:c.length,nbPrev:p.length,nbBT:c.filter(r=>r.bt).length+p.length,k,
   tauxLogCorr:(dC+lC)>0?lC/(dC+lC):0,tauxIntervCorr:(dC+lC)>0?dC/(dC+lC):0,hasCorrH:(dC+lC)>0,
   cat:c.length&&p.length?1:p.length?2:3};
 });
 return rows.sort((a,b)=>b.k.nbPannesTot-a.k.nbPannesTot||b.nbBT-a.nbBT);
}

/* ---------- Ressources humaines : charge / norme / efficience ---------- */
export const KPI_NORME_DEFAUT=108; // h par mois (mois de référence = 30 jours)
export function kpiRH(corr,prev,per,normeBase,chargeRAM){
 const norme=normeBase*(per.days/30); // norme proratisée au nombre de jours de la période
 const map={};
 const add=(bt)=>{ if(!bt) return; (bt.intervenants||[]).forEach(it=>{
  const h=(Number(it.temps)||0)+(Number(it.logistique)||0); const n=it.nom||"Inconnu";   // charge = intervention + logistique
  const t=map[n]||(map[n]={technicien:n,fonction:it.fonction||"",chargeReelle:0,nbInterventions:0});
  t.chargeReelle+=h; t.nbInterventions++;
 });};
 corr.forEach(r=>add(r.bt)); prev.forEach(add);
 const techs=Object.values(map).map(t=>{
  const taux=norme>0?t.chargeReelle/norme:0;
  return {...t,norme,taux,delta:t.chargeReelle-norme,statut:taux>1.05?"surcharge":taux<0.75?"sous-charge":"équilibre"};
 }).sort((a,b)=>b.taux-a.taux);
 const total=techs.reduce((s,t)=>s+t.chargeReelle,0), nbTech=techs.length;
 const besoinTheo=norme>0?total/norme:0, besoin=norme>0?Math.ceil(total/norme):0;
 return {techs,norme,total,nbTech,besoinTheo,besoin,delta:besoin-nbTech,
  tauxMoyen:nbTech>0&&norme>0?total/(nbTech*norme):0,
  nbSurcharge:techs.filter(t=>t.statut==="surcharge").length,nbSous:techs.filter(t=>t.statut==="sous-charge").length,nbEquil:techs.filter(t=>t.statut==="équilibre").length,
  efficience:chargeRAM>0?total/chargeRAM:null};
}

/* ---------- Stock : coûts, stock de sécurité, rotation / dormants ---------- */
export function kpiStock(pieces,per,delaiMois,today){
 const ref=today||new Date();
 const toD=(m)=>kpiDate(m.date);
 const sorties=[]; (pieces||[]).forEach(p=>(p.mouvements||[]).forEach(m=>{
  if(m.type!=="Sortie") return;
  const q=Number(m.qte)||0; sorties.push({p,date:toD(m),qte:q,valeur:q*(Number(p.prix)||0)});
 }));
 const inPer=(d)=>!d||(d>=per.start&&d<=per.end);
 const rows=sorties.filter(s=>inPer(s.date));
 const nbMois=Math.max(1,(per.end.getFullYear()-per.start.getFullYear())*12+(per.end.getMonth()-per.start.getMonth())+1);
 const coutTotal=rows.reduce((s,r)=>s+r.valeur,0);
 const parCat={}, parPiece={};
 rows.forEach(r=>{
  parCat[r.p.categorie]=(parCat[r.p.categorie]||0)+r.valeur;
  const x=parPiece[r.p.code]||(parPiece[r.p.code]={code:r.p.code,nom:r.p.nom,categorie:r.p.categorie,qte:0,cout:0}); x.qte+=r.qte; x.cout+=r.valeur;
 });
 const top=Object.values(parPiece).sort((a,b)=>b.cout-a.cout);
 // Stock de sécurité = conso. moyenne mensuelle × délai fournisseur
 const secu=top.map(x=>{
  const p=pieces.find(q=>q.code===x.code); const avg=x.qte/nbMois; const ss=avg*delaiMois;
  return {code:x.code,nom:x.nom,categorie:x.categorie,avgMois:avg,stockSecu:ss,stockActuel:p?p.stock:0,min:p?p.min:0,sousSeuil:(p?p.stock:0)<ss};
 }).filter(x=>x.avgMois>0);
 // Rotation / dormants (historique complet, hors filtre de dates)
 const il12=new Date(ref); il12.setFullYear(il12.getFullYear()-1);
 const rot=(pieces||[]).map(p=>{
  const mv=(p.mouvements||[]); const sd=mv.filter(m=>m.type==="Sortie").map(toD).filter(Boolean);
  const ad=mv.map(toD).filter(Boolean);
  const last=sd.length?new Date(Math.max(...sd)):ad.length?new Date(Math.max(...ad)):null;
  const conso12=sorties.filter(s=>s.p.code===p.code&&s.date&&s.date>=il12).reduce((s,r)=>s+r.valeur,0);
  const valeurStock=(Number(p.stock)||0)*(Number(p.prix)||0);
  const jours=last?Math.round((ref-last)/864e5):null;
  return {code:p.code,nom:p.nom,categorie:p.categorie,stock:p.stock,valeurStock,conso12,jours,dormant:jours!==null&&jours>=365&&valeurStock>0};
 }).sort((a,b)=>b.valeurStock-a.valeurStock);
 return {coutTotal,nbSorties:rows.length,nbMois,coutMoyenMois:coutTotal/nbMois,parCat,top,secu,rot,
  valeurStock:rot.reduce((s,r)=>s+r.valeurStock,0),
  nbSousSeuil:secu.filter(x=>x.sousSeuil).length,
  nbDormants:rot.filter(r=>r.dormant).length,valeurDormants:rot.filter(r=>r.dormant).reduce((s,r)=>s+r.valeurStock,0)};
}

/* ---------- Criticité AMDEC (C = G × P × ND) + stratégie de maintenance recommandée ---------- */
export const KPI_F_THR=[1,4,52];    // occurrences / an : P2, P3, P4
export const KPI_G_THR=[2,20,120];  // minutes d'arrêt : G2, G3, G4
export const KPI_CRIT={high:16,med:10};
export const kpiScoreF=(r)=>r>=KPI_F_THR[2]?4:r>=KPI_F_THR[1]?3:r>=KPI_F_THR[0]?2:1;
export const kpiScoreG=(m)=>m>=KPI_G_THR[2]?4:m>=KPI_G_THR[1]?3:m>=KPI_G_THR[0]?2:1;
export const kpiBand=(c)=>c>=KPI_CRIT.high?{cls:"bad",label:"Majeure"}:c>=KPI_CRIT.med?{cls:"warn",label:"Modérée"}:{cls:"ok",label:"Acceptable"};
export function kpiStrategie(f,g,d,crit){
 if(crit>=KPI_CRIT.high||g>=4) return {id:"MBF / RCM",why:"Très critique ou gravité maximale (C="+crit+") → stratégie MBF/RCM multi-modes."};
 if(g<=1&&crit<KPI_CRIT.med) return {id:"Corrective",why:"Conséquence faible (G=1) et criticité acceptable → remplacement au coup par coup."};
 if(d<=1) return {id:"Basée sur l'état",why:"Défaillance détectable avant qu'elle survienne (ND=1) → surveillance de l'état / prédictif."};
 if(f>=3) return {id:"Proactive",why:"Défaillance probable ou fréquente (P="+f+") → rechercher et éliminer la cause racine."};
 if(d<=2) return {id:"TPM",why:"Anomalie détectable par inspection simple (ND="+d+") → impliquer les opérateurs."};
 return {id:"Préventive",why:"Défaillance prévisible dans le temps, sans signe avant-coureur → préventif périodique."};
}
export function kpiAmdec(corr,per,opt){
 const {groupBy,gravBase,equipements}=opt;
 const nomSys=opt.nomSys||((c)=>c), nomSub=opt.nomSub||((sy,c)=>c);
 const map={};
 corr.filter(r=>kpiIsDone(r.di)||kpiIsOpen(r.di)).forEach(r=>{
  const code=r.di.eq, i=kpiEqInfo(code,equipements), se=kpiSeOf(r.di,equipements);
  const eqNom=i.eq?i.eq.nom:(r.di.nom||code);
  const seObj=i.eq&&se?(i.eq.sousEquip||[]).find(x=>x.code===se):null;
  let key,label,sub;
  if(groupBy==="Système"){key=i.system||"Non codifié"; label=nomSys(key); sub="";}
  else if(groupBy==="Sous-système"){key=(i.system||"?")+"."+(i.sub||"?"); label=nomSub(i.system,i.sub); sub=nomSys(i.system||"Non codifié");}
  else if(groupBy==="Sous-équipement"){key=code+"|"+(se||"-"); label=se?se+" — "+(seObj?seObj.nom:""):eqNom+" (équipement entier)"; sub=code+" — "+eqNom;}
  else {key=code; label=eqNom; sub=nomSys(i.system||"Non codifié");}
  const g=map[key]||(map[key]={key,label,sub,count:0,minutes:0,grav:[],det:[],exemples:new Set()});
  const x=kpiPanneHeures(r,per,per.hours);
  g.count++; if(!x.skip) g.minutes+=x.dh*60;
  if(r.bt&&Number(r.bt.gravite)>0) g.grav.push(Number(r.bt.gravite));
  if(r.bt&&Number(r.bt.detection)>0) g.det.push(Number(r.bt.detection));
  if(g.exemples.size<2) g.exemples.add(r.di.designation);
 });
 return Object.values(map).map(g=>{
  const annual=g.count*(365/Math.max(per.days,1));
  const f=kpiScoreF(annual);
  const avgMin=g.count?g.minutes/g.count:0;
  const gDuree=kpiScoreG(avgMin);
  // G saisie : moyenne arrondie des gravités (1 à 4) saisies sur les OT du groupe
  const gSaisie=g.grav.length?Math.max(1,Math.min(4,Math.round(g.grav.reduce((s,v)=>s+v,0)/g.grav.length))):null;
  const useSaisie=gravBase==="Gravité saisie (OT)";
  const gs=useSaisie&&gSaisie!==null?gSaisie:gDuree;
  const gDefaut=useSaisie&&gSaisie===null; // aucune gravité saisie : repli sur la durée d'arrêt
  const dSaisie=g.det.length?Math.max(1,Math.min(4,Math.round(g.det.reduce((s,v)=>s+v,0)/g.det.length))):null;
  const d=dSaisie!==null?dSaisie:PARAMS.amdec.ndDefaut;
  const crit=f*gs*d;
  return {...g,exemples:[...g.exemples],annual:Math.round(annual*10)/10,avgMin:Math.round(avgMin),f,g:gs,gDefaut,nbGrav:g.grav.length,gMin:g.grav.length?Math.min(...g.grav):0,gMax:g.grav.length?Math.max(...g.grav):0,d,dDefaut:dSaisie===null,crit,band:kpiBand(crit),strat:kpiStrategie(f,gs,d,crit)};
 }).sort((a,b)=>b.crit-a.crit||b.count-a.count);
}


/* ---------- Pareto / méthode ABC des équipements ---------- */
// Six critères au choix. Le classement, les cumuls et les classes A / B / C changent avec le critère retenu.
export const KPI_PARETO_CRITERES=[
 {id:"nbDI",lib:"Nombre de DI",unite:"DI"},
 {id:"tempsTotal",lib:"Temps d'intervention",unite:"h",parts:[{id:"duree",lib:"Durée d'intervention"},{id:"logistique",lib:"Temps logistique"}]},   // = durée d'intervention + temps logistique
 {id:"duree",lib:"Durée d'intervention",unite:"h"},
 {id:"logistique",lib:"Temps logistique",unite:"h"},
 {id:"coutTotal",lib:"Coût total",unite:"DA",parts:[{id:"coutHum",lib:"Coût humain"},{id:"coutMat",lib:"Coût matériel"}]},
 {id:"coutHum",lib:"Coût humain",unite:"DA"},
 {id:"coutMat",lib:"Coût matériel",unite:"DA"},
];
// Cumule, par équipement, les six critères. portee : "Corrective" (DI + OT correctifs) · "Préventive" (OT préventifs) · "Toutes".
// « Nombre de DI » compte les DI correctives ; en portée Préventive / Toutes, chaque OT préventif compte pour une intervention.
export function kpiParetoEquipements(corr,prev,pieces,portee,equipements){
 const map={};
 const ligne=(code,nom)=>map[code]||(map[code]={code,nom:nom||code,nbDI:0,tempsTotal:0,duree:0,logistique:0,coutTotal:0,coutMat:0,coutHum:0});
 const ajoute=(l,bt)=>{ if(!bt) return; const c=coutBT(bt,pieces||[]);
  l.duree+=Number(bt.dureeIntervention)||0; l.logistique+=Number(bt.tempsLogistique)||0; l.tempsTotal=l.duree+l.logistique;
  l.coutTotal+=c.total; l.coutMat+=c.mat; l.coutHum+=c.mo; };
 const nomEq=(code,defaut)=>{const e=(equipements||[]).find(x=>x.code===code); return (e&&e.nom)||defaut||code;};
 if(portee!=="Préventive") (corr||[]).filter(r=>r.di.etat!=="Annulé").forEach(r=>{const l=ligne(r.di.eq,nomEq(r.di.eq,r.di.nom)); l.nbDI+=1; ajoute(l,r.bt);});
 if(portee!=="Corrective") (prev||[]).forEach(b=>{const l=ligne(b.eq,nomEq(b.eq,b.nom)); l.nbDI+=1; ajoute(l,b);});
 return Object.values(map);
}
// Classement décroissant + cumul + classe ABC. Un équipement est en A tant que le cumul AVANT lui est < 80 %,
// en B tant qu'il est < 95 %, en C ensuite (l'équipement qui franchit le seuil appartient à la classe du seuil).
export function kpiPareto(rows,critere,seuilA=0.8,seuilB=0.95){
 const eps=1e-9;
 const items=rows.map(r=>({code:r.code,nom:r.nom,value:Number(r[critere])||0,row:r})).filter(r=>r.value>0).sort((a,b)=>b.value-a.value||String(a.code).localeCompare(String(b.code)));
 const total=items.reduce((s,r)=>s+r.value,0);
 let cumV=0;
 items.forEach((r,i)=>{ const avant=total>0?cumV/total:0; cumV+=r.value;
  r.rang=i+1; r.pct=total>0?r.value/total:0; r.cum=total>0?Math.min(1,cumV/total):0;
  r.classe=avant<seuilA-eps?"A":avant<seuilB-eps?"B":"C"; });
 const n80=items.filter(r=>r.classe==="A").length, n95=items.filter(r=>r.classe!=="C").length;
 return {items,total,n80,n95,n100:items.length,nbA:n80,nbB:n95-n80,nbC:items.length-n95};
}
