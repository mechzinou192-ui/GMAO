// Indicateurs de performance (MTBF, MTTR, disponibilité, AMDEC…).
import React,{useState,useMemo,useEffect} from "react";
import {Anneau,BarresGroupees,BarresH,CarteGraphe,COULEURS_ABC,Courbe,ParetoChart,SERIES,TuileChiffre} from "../ui/graphes.jsx";
import {FENETRE_MOIS,chargerHistorique,historiqueCharge} from "../sync.js";
import {exporterXlsx} from "../excel.js";
import {frDate} from "../lib/dates.js";
import {optimiserMaintenance,OPTI_SEUILS_DEFAUT} from "../lib/optimisation.js";
import {predireMaintenance} from "../lib/predictif.js";
import {KPI_NORME_DEFAUT,KPI_PARETO_CRITERES,KPI_SEUILS,kpiAmdec,kpiCalc,kpiCollect,kpiEquipements,kpiIsNew,kpiObj,kpiPareto,kpiParetoEquipements,kpiPeriode,kpiRH,kpiRating,kpiStatus,kpiStock} from "../lib/kpi.js";
import {UNITS} from "../lib/unites.js";
import {Btn,Card,ExportBtn,Inp,Segment,SubTabs} from "../ui/base.jsx";

// Cellule de saisie de la charge RAM d'un mois : enregistrée en quittant le champ (ou avec Entrée) ; vide = supprimée.
function CelluleRAM({valeur,onSave,disabled,label}){
 const [v,setV]=useState(valeur===null||valeur===undefined?"":String(valeur));
 const valide=()=>{const n=v===""?null:Number(v); if(n!==null&&!(n>0)){setV(valeur===null||valeur===undefined?"":String(valeur));return;} if((n??null)!==(valeur??null)) onSave(n);};
 if(disabled) return <span>{valeur===null||valeur===undefined?"—":fH(valeur,1)}</span>;
 return <Inp type="number" min="0" step="any" inputMode="decimal" value={v} placeholder="h" aria-label={label} onChange={e=>setV(e.target.value)} onBlur={valide} onKeyDown={e=>{if(e.key==="Enter")e.target.blur();}} style={{maxWidth:110}}/>;
}

/* ===== Page : Indicateurs de performance ===== */
export const KPI_ST={ok:{bg:"#ecfdf5",fg:"#047857",bd:"#a7f3d0",t:"Atteint"},warn:{bg:"#fffbeb",fg:"#b45309",bd:"#fde68a",t:"Proche"},bad:{bg:"#fff1f2",fg:"#be123c",bd:"#fecdd3",t:"Non atteint"},na:{bg:"#eef2f8",fg:"#64748b",bd:"#dde4ee",t:"Sans donnée"}};
export const StChip=({st,txt})=>{const c=KPI_ST[st]||KPI_ST.na;return <span style={{background:c.bg,color:c.fg,border:"1px solid "+c.bd}} className="px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap">{txt||c.t}</span>;};
export const fPct=(v,d=1)=>(v*100).toFixed(d).replace(".",",")+" %";
export const fH=(v,d=2)=>Number(v).toFixed(d).replace(".",",")+" h";
export const fDA=(v)=>Math.round(v).toLocaleString("fr-FR")+" DA";
export const fNum=(v,d=1)=>Number(v).toFixed(d).replace(".",",");
export const kpiSup=(s)=>s.replace(/[0-9]/g,(d)=>"⁰¹²³⁴⁵⁶⁷⁸⁹"[d]);
export const fSci=(v)=>{if(!(v>0)) return "0"; const m=v.toExponential(2).split("e"); const ex=parseInt(m[1],10); return m[0].replace(".",",")+"×10"+(ex<0?"⁻":"")+kpiSup(String(Math.abs(ex)));};
export const KpiCard=({label,value,sub,st,cible,stTxt})=>{const c=st&&KPI_ST[st];return <Card>
 <div className="flex justify-between items-start gap-2"><div className="text-xs text-slate-400">{label}</div>{st&&<StChip st={st} txt={stTxt}/>}</div>
 <div className="text-2xl font-bold mt-1" style={{color:c&&st!=="na"?c.fg:undefined}}>{value}</div>
 {cible&&<div className="text-xs text-slate-400 mt-1">Cible : {cible}</div>}
 {sub&&<div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
</Card>;};
export const KpiTitle=({children,sub})=><div className="mb-2 mt-1"><h3 className="text-sm font-semibold text-slate-200">{children}</h3>{sub&&<div className="text-xs text-slate-500">{sub}</div>}</div>;
export const KpiEmpty=({children})=><div className="text-sm text-slate-500 py-3">{children}</div>;
export const KpiSelect=({value,onChange,options})=><select value={value} onChange={e=>onChange(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm">{options.map(o=><option key={o}>{o}</option>)}</select>;

export const KPI_REFERENTIEL=[
 ["Réalisation","MTTR","Σ durée d'intervention (OT) des pannes réparées ÷ nombre de pannes réparées","Pas de cible directe (suivi via μ = 1/MTTR)","DI « Traité » + durée d'intervention saisie sur l'OT lié","La durée vient du compte-rendu de l'OT (en heures), plus d'import de fichier en minutes."],
 ["Réalisation","MTBF","(Temps théorique du parc − Indisponibilité cumulée) ÷ nombre de pannes","Pas de cible directe (suivi via λ = 1/MTBF)","DI correctives « Traité », « Transmis », « À Transmettre » (annulées exclues)","Parc = équipements distincts ayant une DI/OT sur la période (méthode d'origine) ; option : tous les équipements de l'arborescence de l'unité."],
 ["Réalisation","Disponibilité","(Temps théorique du parc − Indisponibilité) ÷ Temps théorique du parc. Temps théorique = heures de la période × nombre d'équipements","> 97 % (nouvelles unités) · > 95 % (anciennes unités)","Date événement de la DI → clôture de l'OT","Indisponibilité = clôture OT − date événement DI, bornée à la période ; à défaut de date de fin ou si écart négatif : durée d'intervention + temps logistique ; panne > 1,5 × période ignorée."],
 ["Réalisation","λ — Taux de panne (1/MTBF)","1 ÷ MTBF","≤ 5×10⁻⁴ /h (nouvelles) · ≤ 3×10⁻⁴ /h (anciennes)","Idem MTBF","—"],
 ["Réalisation","μ — Taux de réparation (1/MTTR)","1 ÷ MTTR","≥ 4×10⁻¹ /h (nouvelles) · ≥ 2,5×10⁻¹ /h (anciennes)","Idem MTTR","—"],
 ["Ingénierie","TCP — Taux de charge préventive","Heures préventives ÷ (heures préventives + correctives), heures = durée d'intervention + temps logistique","> 80 % (nouvelles) · > 70 % (anciennes)","OT préventifs (plan) / OT correctifs (DI)","Les OT préventifs sont datés par leur date de génération (à défaut clôture, ou date du plan)."],
 ["Ingénierie","TCC — Taux de charge corrective","Heures correctives ÷ (heures préventives + correctives)","< 20 % (nouvelles) · < 30 % (anciennes)","Idem TCP","—"],
 ["Réalisation","TMP — Taux de maintenance préventive","OT préventifs clôturés ÷ OT préventifs générés (hors annulés)","100 %","OT préventifs : état « Clôturé » / « En cours » / « En attente pièce »","Seuls les OT déjà générés comptent (comme dans l'ancienne appli)."],
 ["Réalisation","TMC — Taux de maintenance corrective","DI correctives traitées ÷ (traitées + transmises + à transmettre)","> 90 % (nouvelles) · > 85 % (anciennes)","DI : état « Traité » / « Transmis » / « À Transmettre »","Le cas « travaux divers » n'existe plus dans cette GMAO."],
 ["Taux","Taux de panne théorique","Heures correctives ÷ temps théorique du parc","Bon < 0,5 % · alerte 0,5–1 % · critique ≥ 1 %","OT correctifs","—"],
 ["Taux","Taux d'intervention (indisponibilité)","Indisponibilité cumulée ÷ temps théorique du parc","Bon < 1 % · alerte 1–5 % · critique ≥ 5 %","DI + OT","—"],
 ["Taux","Taux de récurrence","Pannes ayant un même équipement + même motif (≥ 2 fois) ÷ pannes totales","Bon < 15 % · alerte 15–30 % · critique ≥ 30 %","Motif = champ « Panne » de l'OT (à défaut : désignation de la DI)","Le motif est un champ saisi, plus de détection par analyse de texte."],
 ["Équipements","Catégories d'équipement","Cat. 1 = préventif ET correctif · Cat. 2 = préventif seul · Cat. 3 = correctif seul","—","OT / DI par équipement","Seuil « OT total » réglable pour surligner les équipements très sollicités."],
 ["Équipements","Taux logistique / d'intervention (correctif)","Logistique ÷ (durée + logistique) · Durée ÷ (durée + logistique)","—","OT correctifs","—"],
 ["RH","Taux d'occupation d'un technicien","Charge réelle ÷ Norme. Norme = 108 h/mois × (jours de la période ÷ 30)","Surcharge > 105 % · équilibre 75–105 % · sous-charge < 75 %","Temps saisi par intervenant sur chaque OT","On utilise le temps réel de chaque intervenant (et non la durée globale de l'intervention répartie)."],
 ["RH","Besoin en effectif","Théorique = Charge totale ÷ Norme · Essentiel = arrondi supérieur · Écart = Essentiel − nb techniciens","—","Intervenants ayant des heures sur la période","—"],
 ["Ingénierie","Taux d'efficience (mensuel, par unité)","Charge totale calculée GMAO du mois ÷ Charge RAM du mois","≈ 100 %","Charge RAM saisie chaque mois par le responsable maintenance (rapport d'activité)","Sauvegardée par unité et par mois ; export « Par intervenant » + « Par unité »."],
 ["Stock","Coût de consommation","Σ (quantité sortie × prix) ; coût moyen/mois = coût total ÷ nombre de mois de la période","—","Mouvements « Sortie » du magasin","Prix = prix actuel de l'article (pas d'historique de prix dans cette GMAO)."],
 ["Stock","Stock de sécurité","Conso. moyenne mensuelle × délai fournisseur (3 mois par défaut) ; alerte si stock < stock de sécurité","Stock ≥ stock de sécurité","Sorties de la période + stock actuel","Comparé aussi au seuil minimum saisi sur l'article."],
 ["Stock","Stock dormant / rotation","Dormant = aucune sortie depuis ≥ 365 jours et valeur de stock > 0 ; rotation = conso. des 12 derniers mois","Aucun article dormant","Mouvements + stock × prix","—"],
 ["Fiabilité","Criticité AMDEC","C = G × P × ND. P : occurrences/an extrapolées (<1 : 1 · <4 : 2 · <52 : 3 · ≥52 : 4) · G : arrêt moyen en min (<2 : 1 · <20 : 2 · <120 : 3 · ≥120 : 4) · ND : détection","Majeure ≥ 16 · Modérée ≥ 10 · Acceptable < 10","DI correctives + gravité / détection saisies sur l'OT","ND = moyenne saisie sur les OT (2 par défaut si absente) ; G au choix : durée d'arrêt ou gravité saisie."],
 ["Fiabilité","Stratégie recommandée","Arbre de décision : C ≥ 16 ou G = 4 → MBF/RCM · G = 1 et C < 10 → Corrective · ND = 1 → Basée sur l'état · P ≥ 3 → Proactive · ND ≤ 2 → TPM · sinon Préventive","—","Résultat de l'AMDEC","—"],
];

export function IndicateursPage({unit,unitesRH,disTous,btsTous,planningTous,equipementsTous,chargesRAM=[],onSaveChargeRAM,peutSaisirRAM=false,dis,bts,planning,equipements,pieces,systemsList,treeStruct,kpiOk=()=>true}){
 const pad=(n)=>String(n).padStart(2,"0");
 const ymd=(d)=>d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
 const now=new Date(); const d30=new Date(now); d30.setDate(d30.getDate()-29);
 const [subRaw,setSub]=useState("Tableau de bord");
 const [start,setStart]=useState(ymd(d30));
 const [end,setEnd]=useState(ymd(now));
 const [histo,setHisto]=useState(historiqueCharge()); const [histoBusy,setHistoBusy]=useState(false);
 const limHisto=(()=>{const d=new Date(now);d.setMonth(d.getMonth()-FENETRE_MOIS);return ymd(d);})();
 const [normeBase,setNormeBase]=useState(KPI_NORME_DEFAUT);
 const [anneeRAM,setAnneeRAM]=useState(now.getFullYear());   // année affichée dans « Ressources humaines » (charge RAM mensuelle)
 const [delai,setDelai]=useState(3);
 const [seuilBT,setSeuilBT]=useState(0);
 const [parcMode,setParcMode]=useState("Équipements avec DI/OT");
 const [groupBy,setGroupBy]=useState("Équipement");
 const anneeDefaut=(()=>{const d=new Date(); return d.getMonth()===0?d.getFullYear()-1:d.getFullYear();})();   // en janvier : analyse de l'année écoulée
 const [predHor,setPredHor]=useState("30 jours"), [predHist,setPredHist]=useState("Tout"), [predFiltre,setPredFiltre]=useState("Tous");
 const [optiAnnee,setOptiAnnee]=useState(String(anneeDefaut)), [optiSeuil,setOptiSeuil]=useState(String(OPTI_SEUILS_DEFAUT.seuilPannes)), [optiBas,setOptiBas]=useState(String(OPTI_SEUILS_DEFAUT.seuilBas)), [optiFiltre,setOptiFiltre]=useState("Tous");
 const [paretoCrit,setParetoCrit]=useState("nbDI"), [paretoPortee,setParetoPortee]=useState("Corrective");
 const [gravBase,setGravBase]=useState("Gravité saisie (OT)");
 const [fSys,setFSys]=useState(""), [fSub,setFSub]=useState(""), [fEq,setFEq]=useState(""), [fSe,setFSe]=useState("");
 useEffect(()=>{setFSys("");setFSub("");setFEq("");setFSe("");},[unit]);
 const chgSys=(v)=>{setFSys(v);setFSub("");setFEq("");setFSe("");};
 const chgSub=(v)=>{setFSub(v);setFEq("");setFSe("");};
 const chgEq=(v)=>{setFEq(v);setFSe("");};
 const nomSys=(c)=>{const x=(systemsList||[]).find(y=>y[0]===c);return c+(x?" — "+x[1]:"");};
 const nomSub=(sy,c)=>{const x=((treeStruct||{})[sy]||[]).find(y=>y.code===c);return c+(x?" — "+x.sub:"");};
 const sysOpts=(systemsList||[]).filter(x=>x[0]!=="MESURE"&&x[0]!=="CTRL");
 const subOpts=fSys?((treeStruct||{})[fSys]||[]):[];
 const eqOpts=(equipements||[]).filter(e=>e.unit===unit&&(!fSys||e.system===fSys)&&(!fSub||e.subCode===fSub));
 const eqSel=eqOpts.find(e=>e.code===fEq);
 const seOpts=eqSel?(eqSel.sousEquip||[]):[];
 const flt=useMemo(()=>({sys:fSys,sub:fSub,eq:fEq,se:fSe}),[fSys,fSub,fEq,fSe]);
 const fltActif=!!(fSys||fSub||fEq||fSe);
 const fltLabel=[fSys&&nomSys(fSys),fSub&&nomSub(fSys,fSub),fEq&&fEq,fSe&&fSe].filter(Boolean).join(" › ");
 const preset=(k)=>{const n=new Date(),y=n.getFullYear(),m=n.getMonth();
  if(k==="30 j"){const a=new Date(n);a.setDate(a.getDate()-29);setStart(ymd(a));setEnd(ymd(n));}
  if(k==="Mois en cours"){setStart(ymd(new Date(y,m,1)));setEnd(ymd(n));}
  if(k==="Mois précédent"){setStart(ymd(new Date(y,m-1,1)));setEnd(ymd(new Date(y,m,0)));}
  if(k==="Année"){setStart(ymd(new Date(y,0,1)));setEnd(ymd(n));}};
 const per=useMemo(()=>kpiPeriode(start,end),[start,end]);
 const periodeValide=per.start<=per.end;
 const ctx=useMemo(()=>kpiCollect(unit,{dis,bts,planning,equipements},per,parcMode,flt),[unit,dis,bts,planning,equipements,per,parcMode,flt]);
 const K=useMemo(()=>kpiCalc(ctx.corr,ctx.prev,per,ctx.nbEquip),[ctx,per]);
 const O=kpiObj(unit);
 const hasCorr=K.nbPannesTot>0, hasPrev=K.nbBTPrev>0, hasH=K.hTotal>0;
 const eqRows=useMemo(()=>kpiEquipements(ctx.corr,ctx.prev,per,equipements),[ctx,per,equipements]);
 const rh=useMemo(()=>kpiRH(ctx.corr,ctx.prev,per,Number(normeBase)||KPI_NORME_DEFAUT,0),[ctx,per,normeBase]);
 const stk=useMemo(()=>kpiStock(pieces,per,Math.max(0.1,Number(delai)||3),new Date()),[pieces,per,delai]);
 const amdec=useMemo(()=>kpiAmdec(ctx.corr,per,{groupBy,gravBase,equipements,nomSys,nomSub}),[ctx,per,groupBy,gravBase,equipements,systemsList,treeStruct]);
 // Pareto / ABC : cumul par équipement des 6 critères, puis classement selon le critère choisi
 const paretoRows=useMemo(()=>kpiParetoEquipements(ctx.corr,ctx.prev,pieces,paretoPortee,equipements),[ctx,pieces,paretoPortee,equipements]);
 const paretoCrit1=KPI_PARETO_CRITERES.find(c=>c.id===paretoCrit)||KPI_PARETO_CRITERES[0];
 const pareto=useMemo(()=>kpiPareto(paretoRows,paretoCrit),[paretoRows,paretoCrit]);
 const paretoTous=useMemo(()=>KPI_PARETO_CRITERES.map(c=>({c,p:kpiPareto(paretoRows,c.id)})),[paretoRows]);
 const parts=paretoCrit1.parts||null;   // critères décomposables : Temps d'intervention (durée + logistique) · Coût total (humain + matériel)
 const critOf=(id)=>KPI_PARETO_CRITERES.find(c=>c.id===id)||paretoCrit1;
 const sommeParts=(liste)=>parts?parts.map(pt=>liste.reduce((t,r)=>t+(Number(r.row[pt.id])||0),0)):[];
 const decoClasses=parts?[["A"],["B"],["C"],["A","B","C"]].map(cl=>{const l=pareto.items.filter(r=>cl.includes(r.classe)); return {lib:cl.length>1?"Total":"Classe "+cl[0],n:l.length,vals:sommeParts(l),tot:l.reduce((t,r)=>t+r.value,0)};}):[];
 const fParetoVal=(v,c)=>c.unite==="DA"?fDA(v):c.unite==="h"?fH(v,2):String(Math.round(v));
 const exportPareto=()=>exporterXlsx({fichier:"Pareto_ABC_"+unit,feuilles:[
  {nom:"Pareto "+paretoCrit1.lib.slice(0,20),titre:"Pareto ABC — "+paretoCrit1.lib+" ("+paretoPortee.toLowerCase()+") — "+unit+" — "+perLabel,
   colonnes:[{h:"Rang",t:"num"},{h:"Code équipement"},{h:"Équipement"},{h:paretoCrit1.lib+(paretoCrit1.unite?" ("+paretoCrit1.unite+")":""),t:"num"},{h:"% du total",t:"num"},{h:"% cumulé",t:"num"},{h:"Classe"},...(parts||[]).map(pt=>({h:pt.lib+(critOf(pt.id).unite?" ("+critOf(pt.id).unite+")":""),t:"num"}))],
   lignes:pareto.items.map(r=>[r.rang,r.code,r.nom,Number(r.value.toFixed(2)),Number((r.pct*100).toFixed(2)),Number((r.cum*100).toFixed(2)),r.classe,...(parts||[]).map(pt=>Number((Number(r.row[pt.id])||0).toFixed(2)))])},
  {nom:"Synthèse critères",titre:"Pareto ABC — nombre d'équipements par seuil — "+unit+" — "+perLabel,
   colonnes:[{h:"Critère"},{h:"Total",t:"num"},{h:"Équipements concernés",t:"num"},{h:"Classe A — 80 %",t:"num"},{h:"Jusqu'à B — 95 %",t:"num"},{h:"Jusqu'à C — 100 %",t:"num"}],
   lignes:paretoTous.map(({c,p})=>[c.lib+(c.unite?" ("+c.unite+")":""),Number(p.total.toFixed(2)),p.n100,p.n80,p.n95,p.n100])}]});
 // Maintenance prédictive : prévision des prochaines pannes par équipement (historique des DI / OT correctifs)
 const pred=useMemo(()=>predireMaintenance({unit,dis,bts,planning,equipements,pieces,flt,horizonJours:parseInt(predHor,10)||30,fenetreMois:predHist==="Tout"?0:parseInt(predHist,10)||0}),[unit,dis,bts,planning,equipements,pieces,flt,predHor,predHist]);   // eslint-disable-line
 const predLignes=pred.lignes.filter(l=>predFiltre==="Tous"||l.risque===predFiltre);
 const PRED_COUL={"Élevé":"#D32F2F","Moyen":"#F59E0B","Faible":"#2E9E5B"};
 const fJ=(j)=>(Math.round(j*10)/10).toString().replace(".",",")+" j";
 const exportPred=()=>exporterXlsx({fichier:"Maintenance_predictive_"+unit,feuilles:[{nom:"Prévisions de pannes",titre:"Maintenance prédictive — probabilité de panne sous "+predHor+" — historique : "+predHist+" — "+unit,
  colonnes:[{h:"Risque"},{h:"Code équipement"},{h:"Équipement"},{h:"Pannes (historique)",t:"num"},{h:"MTBF (jours)",t:"num"},{h:"Dernière panne"},{h:"Prochaine panne prévue"},{h:"Probabilité de panne (%)",t:"num"},{h:"Tendance"},{h:"Modèle"},{h:"Durée moyenne d'arrêt (h)",t:"num"},{h:"Pannes prévues sur 12 mois",t:"num"},{h:"Arrêt prévu sur 12 mois (h)",t:"num"},{h:"Coût prévu sur 12 mois (DA)",t:"num"},{h:"Cause probable"},{h:"Pièces à prévoir"},{h:"Action recommandée"}],
  lignes:pred.lignes.map(l=>[l.risque,l.eq,l.nom,l.pannes,Number(l.mtbfJours.toFixed(1)),l.derniere,l.prochaine+(l.enRetard?" (dépassée)":""),Number((l.proba*100).toFixed(1)),l.tendance,l.modele,Number(l.heuresMoy.toFixed(1)),Number(l.pannes12.toFixed(1)),Number(l.arret12.toFixed(1)),Math.round(l.cout12),l.cause,l.pieces.map(x=>x.qte+" × "+x.nom).join(" ; "),l.action])}]});
 // Optimisation de la maintenance : analyse annuelle automatique (espacer / renforcer / créer des plans préventifs)
 const opti=useMemo(()=>optimiserMaintenance({unit,annee:Number(optiAnnee),dis,bts,planning,equipements,pieces,flt,seuilPannes:Math.max(1,Number(optiSeuil)||OPTI_SEUILS_DEFAUT.seuilPannes),seuilBas:Math.max(0,Number(optiBas)||0)}),[unit,optiAnnee,dis,bts,planning,equipements,pieces,flt,optiSeuil,optiBas]);   // eslint-disable-line
 const optiLignes=opti.lignes.filter(l=>optiFiltre==="Tous"||l.statut===optiFiltre);
 const OPTI_COUL={"Espacer":"#2E9E5B","Renforcer":"#D32F2F","Créer un plan":"#F59E0B","Maintenir":"#64748B"};
 const fOcc=(o)=>o==null?"—":(Math.round(o*10)/10).toString().replace(".",",")+" /an";
 const exportOpti=()=>exporterXlsx({fichier:"Optimisation_maintenance_"+unit+"_"+optiAnnee,feuilles:[
  {nom:"Recommandations",titre:"Optimisation de la maintenance — analyse "+optiAnnee+" — "+unit,
   colonnes:[{h:"Statut"},{h:"Code équipement"},{h:"Équipement"},{h:"Plan"},{h:"Périodicité actuelle"},{h:"Occ./an actuelles",t:"num"},{h:"Proposition"},{h:"Occ./an proposées",t:"num"},{h:"Pannes de l'année",t:"num"},{h:"Heures d'arrêt (h)",t:"num"},{h:"Coût des pannes (DA)",t:"num"},{h:"OT préventifs",t:"num"},{h:"Coût préventif (DA)",t:"num"},{h:"Gain estimé (h/an)",t:"num"},{h:"Gain estimé (DA/an)",t:"num"},{h:"Motif"}],
   lignes:opti.lignes.map(l=>[l.statut,l.eq,l.nom,l.plan,l.periodeActuelle,l.occActuelle==null?"":Number(l.occActuelle.toFixed(1)),l.propose,l.occPropose==null?"":Number(l.occPropose.toFixed(1)),l.pannes,Number(l.heuresPannes.toFixed(1)),Math.round(l.coutPannes),l.nbPrev,Math.round(l.coutPrev),Number(l.economieH.toFixed(1)),Math.round(l.economieCout),l.motif])},
  {nom:"Tâches proposées",titre:"Tâches à ajouter aux plans préventifs, déduites des pannes de "+optiAnnee+" — "+unit,
   colonnes:[{h:"Code équipement"},{h:"Équipement"},{h:"Tâche proposée"},{h:"Occurrences de la cause",t:"num"}],lignes:opti.taches.map(t=>[t.eq,t.nom,t.tache,t.occurrences])},
  {nom:"Synthèse",titre:"Synthèse de l'optimisation — "+optiAnnee+" — "+unit,colonnes:[{h:"Indicateur"},{h:"Valeur",t:"num"}],
   lignes:[["Équipements analysés",opti.synth.nbEquip],["À espacer",opti.synth.espacer],["À renforcer (plan existant)",opti.synth.renforcer],["Plans à créer",opti.synth.creer],["À maintenir",opti.synth.maintenir],["Gain estimé (h/an)",Number(opti.synth.economieH.toFixed(1))],["Gain estimé (DA/an)",Math.round(opti.synth.economieCout)]]}]});
 // Comparatif : toutes les unités accessibles à l'utilisateur (volet Indicateurs), comme l'export RH « Par unité » —
 // une seule pour un agent d'unité ; plusieurs pour un expert / le responsable DG ; toutes pour le super administrateur
 const unitesComp=unitesRH&&unitesRH.length?unitesRH:[unit];
 const unites=useMemo(()=>{const data={dis:disTous||dis,bts:btsTous||bts,planning:planningTous||planning,equipements:equipementsTous||equipements};
  return UNITS.filter(u=>unitesComp.includes(u)).map(u=>{const c=kpiCollect(u,data,per,parcMode,{sys:fSys,sub:fSub});return {u,c,k:kpiCalc(c.corr,c.prev,per,c.nbEquip),o:kpiObj(u)};}).filter(x=>x.c.corr.length+x.c.prev.length>0);},
  [dis,bts,planning,equipements,disTous,btsTous,planningTous,equipementsTous,unitesComp.join("|"),per,parcMode,fSys,fSub]);   // eslint-disable-line
 const perLabel=frDate(start)+" → "+frDate(end)+" ("+per.days+" j · "+per.hours+" h)"+(fltActif?" — filtre : "+fltLabel:"");
 const ratePanne=kpiRating(K.lambdaTheo*100,...KPI_SEUILS.tauxPanne), rateInterv=kpiRating(K.tauxInterv*100,...KPI_SEUILS.tauxInterv), rateRec=kpiRating(K.tauxRecurrence*100,...KPI_SEUILS.recurrence);
 const lblRate=(r)=>r==="ok"?"Bon":r==="warn"?"Seuil d'alerte":"Seuil critique";

 /* ----- Exports ----- */
 const statTxt=(st)=>(KPI_ST[st]||KPI_ST.na).t;
 const exportSynthese=()=>exporterXlsx({fichier:"Indicateurs_synthese_"+unit,feuilles:[
  {nom:"Synthèse",titre:"Indicateurs de performance — "+unit+" — "+perLabel,colonnes:[{h:"Famille"},{h:"Indicateur"},{h:"Valeur"},{h:"Cible"},{h:"Statut"}],lignes:[
   ["Ingénierie","TCP — charge préventive",fPct(K.tcp),O.tcp.label,statTxt(kpiStatus(O.tcp,K.tcp,hasH))],
   ["Ingénierie","TCC — charge corrective",fPct(K.tcc),O.tcc.label,statTxt(kpiStatus(O.tcc,K.tcc,hasH))],
   ["Ingénierie","Taux d'efficience",effPeriode.eff===null?"—":fPct(effPeriode.eff),O.efficience.label,effPeriode.eff===null?"—":statTxt(kpiStatus(O.efficience,effPeriode.eff,true))],
   ["Réalisation","TMP — maintenance préventive",fPct(K.tmp),O.tmp.label,statTxt(kpiStatus(O.tmp,K.tmp,hasPrev))],
   ["Réalisation","TMC — maintenance corrective",fPct(K.tmc),O.tmc.label,statTxt(kpiStatus(O.tmc,K.tmc,hasCorr))],
   ["Réalisation","Disponibilité",fPct(K.dispo,2),O.dispo.label,statTxt(kpiStatus(O.dispo,K.dispo,true))],
   ["Réalisation","λ = 1/MTBF (/h)",fSci(K.tauxPanne),O.tauxPanne.label,statTxt(kpiStatus(O.tauxPanne,K.tauxPanne,hasCorr))],
   ["Réalisation","μ = 1/MTTR (/h)",fSci(K.tauxRep),O.tauxRep.label,statTxt(kpiStatus(O.tauxRep,K.tauxRep,K.nbPannesRep>0))],
   ["Réalisation","MTBF",hasCorr?fH(K.mtbf,1):"—","—","—"],
   ["Réalisation","MTTR",hasCorr?fH(K.mttr,3):"—","—","—"],
   ["Taux","Taux de panne théorique",fPct(K.lambdaTheo,2),"< 0,5 % Bon · < 1 % alerte",lblRate(ratePanne)],
   ["Taux","Taux d'intervention",fPct(K.tauxInterv,2),"< 1 % Bon · < 5 % alerte",lblRate(rateInterv)],
   ["Taux","Taux de récurrence",fPct(K.tauxRecurrence),"< 15 % Bon · < 30 % alerte",lblRate(rateRec)]]},
  {nom:"Comparatif unités",titre:"Comparatif des unités — "+perLabel,colonnes:[{h:"Unité"},{h:"Pannes",t:"num"},{h:"MTTR (h)",t:"num"},{h:"MTBF (h)",t:"num"},{h:"Disponibilité (%)",t:"num"},{h:"TCP (%)",t:"num"},{h:"TCC (%)",t:"num"},{h:"TMP (%)",t:"num"},{h:"TMC (%)",t:"num"}],
   lignes:unites.map(x=>[x.u,x.k.nbPannesTot,+x.k.mttr.toFixed(3),+x.k.mtbf.toFixed(1),+(x.k.dispo*100).toFixed(2),+(x.k.tcp*100).toFixed(1),+(x.k.tcc*100).toFixed(1),+(x.k.tmp*100).toFixed(1),+(x.k.tmc*100).toFixed(1)])}]});
 const exportEquip=()=>exporterXlsx({fichier:"Indicateurs_equipements_"+unit,feuilles:[{nom:"Équipements",titre:"Indicateurs par équipement — "+unit+" — "+perLabel,
  colonnes:[{h:"Code"},{h:"Équipement"},{h:"Catégorie"},{h:"OT préventifs",t:"num"},{h:"DI correctives",t:"num"},{h:"Pannes",t:"num"},{h:"MTTR (h)",t:"num"},{h:"MTBF (h)",t:"num"},{h:"Disponibilité (%)",t:"num"},{h:"Taux logistique corr. (%)",t:"num"}],
  lignes:eqRows.map(e=>[e.code,e.nom,"Cat. "+e.cat,e.nbPrev,e.nbCorr,e.k.nbPannesTot,+e.k.mttr.toFixed(3),+e.k.mtbf.toFixed(1),+(e.k.dispo*100).toFixed(2),+(e.tauxLogCorr*100).toFixed(1)])}]});
 // Export RH : deux feuilles — « Par intervenant » (période affichée) et « Par unité » (taux d'efficience mensuel de l'année, charge RAM sauvegardée)
 const exportRH=()=>{
  const lignesUnite=[];
  for(const u of (unitesRH&&unitesRH.length?unitesRH:[unit])){
   const ms=moisDe(u,anneeRAM);
   ms.forEach(x=>lignesUnite.push([u,MOIS_LONGS[x.m]+" "+anneeRAM,+x.gmao.toFixed(2),x.ram===null?"":+x.ram.toFixed(2),x.eff===null?"":+(x.eff*100).toFixed(1)]));
   const a=ms.filter(x=>x.ram!==null),g=a.reduce((t,x)=>t+x.gmao,0),r=a.reduce((t,x)=>t+x.ram,0);
   lignesUnite.push([u,"Total "+anneeRAM+" (mois saisis)",+g.toFixed(2),a.length?+r.toFixed(2):"",r>0?+(g/r*100).toFixed(1):""]);
  }
  exporterXlsx({fichier:"Charge_RH_"+unit+"_"+anneeRAM,feuilles:[
   {nom:"Par intervenant",titre:"Charge et taux d'occupation par intervenant — "+unit+" — "+perLabel+" — norme "+fNum(rh.norme)+" h",
    colonnes:[{h:"Technicien"},{h:"Fonction"},{h:"Interventions",t:"num"},{h:"Charge réelle (h)",t:"num"},{h:"Norme (h)",t:"num"},{h:"Taux d'occupation (%)",t:"num"},{h:"Écart (h)",t:"num"},{h:"Statut"}],
    lignes:rh.techs.map(t=>[t.technicien,t.fonction,t.nbInterventions,+t.chargeReelle.toFixed(2),+t.norme.toFixed(1),+(t.taux*100).toFixed(1),+t.delta.toFixed(1),t.statut])},
   {nom:"Par unité",titre:"Charge mensuelle et taux d'efficience par unité — "+anneeRAM+" — charge GMAO ÷ charge RAM (rapport d'activité)",
    colonnes:[{h:"Unité"},{h:"Mois"},{h:"Charge GMAO (h)",t:"num"},{h:"Charge RAM saisie (h)",t:"num"},{h:"Taux d'efficience (%)",t:"num"}],
    lignes:lignesUnite}]});};
 const exportStock=()=>exporterXlsx({fichier:"Indicateurs_stock",feuilles:[
  {nom:"Stock de sécurité",titre:"Stock de sécurité — délai "+delai+" mois — "+perLabel,colonnes:[{h:"Code"},{h:"Désignation"},{h:"Catégorie"},{h:"Conso. moy./mois",t:"num"},{h:"Stock de sécurité",t:"num"},{h:"Stock actuel",t:"num"},{h:"Seuil min saisi",t:"num"},{h:"Alerte"}],
   lignes:stk.secu.map(x=>[x.code,x.nom,x.categorie,+x.avgMois.toFixed(2),+x.stockSecu.toFixed(1),x.stockActuel,x.min,x.sousSeuil?"Sous le stock de sécurité":"OK"])},
  {nom:"Rotation",titre:"Rotation et stock dormant",colonnes:[{h:"Code"},{h:"Désignation"},{h:"Catégorie"},{h:"Stock",t:"num"},{h:"Valeur du stock (DA)",t:"num"},{h:"Conso. 12 mois (DA)",t:"num"},{h:"Jours depuis dernier mouvement",t:"num"},{h:"Dormant"}],
   lignes:stk.rot.map(r=>[r.code,r.nom,r.categorie,r.stock,Math.round(r.valeurStock),Math.round(r.conso12),r.jours===null?"":r.jours,r.dormant?"Oui":"Non"])}]});
 const exportAmdec=()=>exporterXlsx({fichier:"AMDEC_criticite_"+unit,feuilles:[{nom:"Criticité",titre:"Criticité AMDEC (par "+groupBy.toLowerCase()+") — "+unit+" — "+perLabel,
  colonnes:[{h:groupBy},{h:"Rattachement"},{h:"Pannes",t:"num"},{h:"Occ./an",t:"num"},{h:"Arrêt moyen (min)",t:"num"},{h:"P",t:"num"},{h:"G",t:"num"},{h:"ND",t:"num"},{h:"Criticité",t:"num"},{h:"Niveau"},{h:"Stratégie recommandée"},{h:"Justification",max:60}],
  lignes:amdec.map(g=>[g.label,g.sub,g.count,g.annual,g.avgMin,g.f,g.g,g.d,g.crit,g.band.label,g.strat.id,g.strat.why])}]});
 const exportRef=()=>exporterXlsx({fichier:"Referentiel_indicateurs",feuilles:[{nom:"Référentiel",titre:"Référentiel des indicateurs — formules, cibles et sources",
  colonnes:[{h:"Famille"},{h:"Indicateur"},{h:"Formule",max:60},{h:"Cible",max:40},{h:"Source dans la GMAO",max:40},{h:"Adaptation",max:60}],lignes:KPI_REFERENTIEL}]});

 const Th=({children,cls})=><th className={"py-1 "+(cls||"")}>{children}</th>;
 // « Tableau de bord » (graphiques) : visible dès que la Synthèse l'est
 const SUBS=["Tableau de bord","Synthèse","Équipements","Ressources humaines","Maintenance prédictive","Optimisation de la maintenance","Stock","Criticité (AMDEC)","Pareto (ABC)","Référentiel"].filter(x=>kpiOk(x==="Tableau de bord"?"Synthèse":x==="Pareto (ABC)"||x==="Optimisation de la maintenance"||x==="Maintenance prédictive"?"Criticité (AMDEC)":x));
 const sub=SUBS.includes(subRaw)?subRaw:(SUBS[0]||"");
 const eqSeuil=Number(seuilBT)||0;
 // Charge mensuelle par unité : charge GMAO (temps saisi sur les OT) ÷ charge RAM saisie chaque mois par le responsable maintenance.
 // Unité entière, sans filtre d'arborescence ; la charge RAM est sauvegardée par unité et par mois.
 // Charge GMAO / charge RAM / taux d'efficience d'un mois (unité entière, sans filtre d'arborescence).
 const chargeMois=(u,an,m)=>{const data={dis:disTous||dis,bts:btsTous||bts,planning:planningTous||planning,equipements:equipementsTous||equipements};
  const p=kpiPeriode(ymd(new Date(an,m,1)),ymd(new Date(an,m+1,0)));
  const c=kpiCollect(u,data,p,"Équipements avec DI/OT",{sys:"",sub:"",eq:"",se:""});
  const gmao=kpiRH(c.corr,c.prev,p,KPI_NORME_DEFAUT,0).total;
  const code=an+"-"+pad(m+1); const rec=(chargesRAM||[]).find(x=>x.unit===u&&x.mois===code);
  const ram=rec&&Number(rec.chargeRAM)>0?Number(rec.chargeRAM):null;
  return {m,mois:code,gmao,ram,eff:ram?gmao/ram:null,saisiPar:rec?rec.saisiPar:""};};
 const moisDe=(u,an)=>Array.from({length:12},(_,m)=>chargeMois(u,an,m));
 // Taux d'efficience de la période affichée : somme des charges GMAO ÷ somme des charges RAM des mois (saisis) qui chevauchent la période.
 const effPeriode=useMemo(()=>{let g=0,r=0,nb=0;const d=new Date(per.start.getFullYear(),per.start.getMonth(),1);
  while(d<=per.end){const x=chargeMois(unit,d.getFullYear(),d.getMonth()); if(x.ram!==null){g+=x.gmao;r+=x.ram;nb++;} d.setMonth(d.getMonth()+1);}
  return {nb,gmao:g,ram:r,eff:r>0?g/r:null};},[unit,per,dis,bts,planning,equipements,disTous,btsTous,planningTous,equipementsTous,chargesRAM]);   // eslint-disable-line
 const moisRAM=useMemo(()=>sub==="Ressources humaines"?moisDe(unit,anneeRAM):[],[sub,unit,anneeRAM,dis,bts,planning,equipements,disTous,btsTous,planningTous,equipementsTous,chargesRAM]);
 const totRAM=(()=>{const a=moisRAM.filter(x=>x.ram!==null);const g=a.reduce((t,x)=>t+x.gmao,0),r=a.reduce((t,x)=>t+x.ram,0);return {nb:a.length,gmao:g,ram:r,eff:r>0?g/r:null};})();
 const cats=[1,2,3].map(c=>eqRows.filter(e=>e.cat===c));

 return (<div className="space-y-4">
  {!histo && start<limHisto && <div className="rounded-xl border border-amber-700 bg-amber-900/20 p-3 flex flex-wrap items-center justify-between gap-2" data-testid="kpi-historique">
   <div className="text-sm text-amber-300">La période commence avant le {limHisto.split("-").reverse().join("/")} : les DI et OT clos depuis plus de {FENETRE_MOIS} mois ne sont pas chargés par défaut. Chargez l'historique complet pour des indicateurs exacts.</div>
   <Btn cls="bg-sky-600 hover:bg-sky-500" onClick={async()=>{if(histoBusy)return;setHistoBusy(true);try{await chargerHistorique();setHisto(true);}finally{setHistoBusy(false);}}}>{histoBusy?"Chargement…":"Charger l'historique complet"}</Btn>
  </div>}
  <Card>
   <div className="flex flex-wrap items-end gap-3">
    <div><div className="text-xs text-slate-400">Du</div><Inp type="date" value={start} onChange={e=>setStart(e.target.value)}/></div>
    <div><div className="text-xs text-slate-400">Au</div><Inp type="date" value={end} onChange={e=>setEnd(e.target.value)}/></div>
    <div className="flex gap-1 flex-wrap">{["30 j","Mois en cours","Mois précédent","Année"].map(k=><Btn key={k} cls="bg-slate-700 hover:bg-slate-600 text-xs" onClick={()=>preset(k)}>{k}</Btn>)}</div>
    <div><div className="text-xs text-slate-400">Parc de référence (disponibilité, MTBF)</div><Segment value={parcMode} options={["Équipements avec DI/OT","Arborescence complète"]} onChange={setParcMode}/></div>
    <div className="text-xs text-slate-400 ml-auto text-right">Unité <b className="text-slate-200">{unit}</b> · {perLabel}<br/>Parc retenu : {ctx.nbEquip} équipement(s) · Cibles {kpiIsNew(unit)?"« nouvelles unités »":"« anciennes unités »"}</div>
   </div>
   {!periodeValide && <div className="text-xs text-rose-400 mt-2">La date de fin est antérieure à la date de début.</div>}
  </Card>
  <Card>
   <div className="flex flex-wrap items-end gap-3">
    <div className="text-xs text-slate-400 self-center font-medium">Filtrer par arborescence</div>
    <div><div className="text-xs text-slate-400">Système</div><select value={fSys} onChange={e=>chgSys(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm max-w-[200px]"><option value="">Tous les systèmes</option>{sysOpts.map(x=><option key={x[0]} value={x[0]}>{x[0]} — {x[1]}</option>)}</select></div>
    <div><div className="text-xs text-slate-400">Sous-système</div><select value={fSub} onChange={e=>chgSub(e.target.value)} disabled={!fSys} className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm max-w-[220px] disabled:opacity-50"><option value="">{fSys?"Tous les sous-systèmes":"— choisir un système —"}</option>{subOpts.map(x=><option key={x.code} value={x.code}>{x.code} — {x.sub}</option>)}</select></div>
    <div><div className="text-xs text-slate-400">Équipement</div><select value={fEq} onChange={e=>chgEq(e.target.value)} disabled={!fSys} className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm max-w-[240px] disabled:opacity-50"><option value="">{fSys?"Tous les équipements":"— choisir un système —"}</option>{eqOpts.map(x=><option key={x.code} value={x.code}>{x.code} — {x.nom}</option>)}</select></div>
    <div><div className="text-xs text-slate-400">Sous-équipement</div><select value={fSe} onChange={e=>setFSe(e.target.value)} disabled={!fEq} className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm max-w-[240px] disabled:opacity-50"><option value="">{fEq?(seOpts.length?"Tous les sous-équipements":"Aucun sous-équipement"):"— choisir un équipement —"}</option>{seOpts.map(x=><option key={x.code} value={x.code}>{x.code} — {x.nom}</option>)}</select></div>
    {fltActif && <Btn cls="bg-slate-700 hover:bg-slate-600 text-xs" onClick={()=>chgSys("")}>Réinitialiser</Btn>}
   </div>
   {fltActif && <div className="text-xs text-sky-400 mt-2">Indicateurs calculés uniquement sur : {fltLabel}. {ctx.corr.length+ctx.prev.length===0?"Aucune DI ni OT sur la période pour ce périmètre.":""}</div>}
  </Card>
  <SubTabs value={sub} onChange={setSub} items={SUBS.map(s=>[s,s])}/>

  {sub==="Tableau de bord" && <GraphiquesKPI kpiOk={kpiOk} unit={unit} dis={dis} bts={bts} planning={planning} equipements={equipements} per={per} start={start} end={end} parcMode={parcMode} flt={flt} fSys={fSys} subOpts={subOpts} sysOpts={sysOpts} K={K} O={O} eqRows={eqRows} unites={unites} effPeriode={effPeriode} chargeMois={chargeMois}/>}
  {sub==="Synthèse" && <div className="space-y-4">
   <div className="flex justify-between items-center"><div className="text-xs text-slate-500">{K.nbDI} DI correctives · {K.nbBTPrev} OT préventifs sur la période{K.nbPerturb>0?" · "+K.nbPerturb+" avec perturbation d'exploitation":""}</div><ExportBtn onClick={exportSynthese}/></div>
   {kpiOk("syn:ing")&&<div><KpiTitle sub="Répartition de la charge de travail et rendement de l'équipe">Indicateurs d'ingénierie</KpiTitle>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
     <KpiCard label="TCP — charge préventive" value={hasH?fPct(K.tcp):"—"} st={kpiStatus(O.tcp,K.tcp,hasH)} cible={O.tcp.label} sub={fH(K.hPrev,1)+" sur "+fH(K.hTotal,1)}/>
     <KpiCard label="TCC — charge corrective" value={hasH?fPct(K.tcc):"—"} st={kpiStatus(O.tcc,K.tcc,hasH)} cible={O.tcc.label} sub={fH(K.hCorr,1)+" sur "+fH(K.hTotal,1)}/>
     <KpiCard label="Taux d'efficience" value={effPeriode.eff===null?"—":fPct(effPeriode.eff)} st={effPeriode.eff===null?"na":kpiStatus(O.efficience,effPeriode.eff,true)} cible={O.efficience.label} sub={effPeriode.nb?fH(effPeriode.gmao,1)+" GMAO ÷ "+fH(effPeriode.ram,1)+" RAM ("+effPeriode.nb+" mois saisi(s))":"Charge RAM non saisie (onglet Ressources humaines)"}/>
    </div></div>}
   {kpiOk("syn:real")&&<div><KpiTitle sub="Avancement des interventions et fiabilité du parc (MTBF / MTTR / disponibilité / λ / μ)">Indicateurs de réalisation</KpiTitle>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
     <KpiCard label="TMP — maintenance préventive" value={hasPrev?fPct(K.tmp):"—"} st={kpiStatus(O.tmp,K.tmp,hasPrev)} cible={O.tmp.label} sub={K.btClosed+" OT clôturé(s) / "+K.btDenom}/>
     <KpiCard label="TMC — maintenance corrective" value={hasCorr?fPct(K.tmc):"—"} st={kpiStatus(O.tmc,K.tmc,hasCorr)} cible={O.tmc.label} sub={K.diDone+" DI traitée(s) / "+K.diDenom}/>
     <KpiCard label="Disponibilité" value={fPct(K.dispo,2)} st={kpiStatus(O.dispo,K.dispo,true)} cible={O.dispo.label} sub={"TBF "+fH(K.tbf,0)+" / "+fH(K.hoursFlotte,0)}/>
     <KpiCard label="λ = 1/MTBF" value={hasCorr?fSci(K.tauxPanne):"—"} st={kpiStatus(O.tauxPanne,K.tauxPanne,hasCorr)} cible={O.tauxPanne.label} sub="taux de panne"/>
     <KpiCard label="μ = 1/MTTR" value={K.nbPannesRep>0?fSci(K.tauxRep):"—"} st={kpiStatus(O.tauxRep,K.tauxRep,K.nbPannesRep>0)} cible={O.tauxRep.label} sub="taux de réparation"/>
     <KpiCard label="MTBF" value={hasCorr?fH(K.mtbf,1):"—"} sub={K.nbPannesTot+" panne(s) · indispo. "+fH(K.indispoH,1)}/>
     <KpiCard label="MTTR" value={hasCorr&&K.nbPannesRep>0?fH(K.mttr,3):"—"} sub={K.nbPannesRep+" panne(s) réparée(s)"}/>
    </div></div>}
   {kpiOk("syn:taux")&&<div><KpiTitle sub="Échelle qualitative : Bon / Seuil d'alerte / Seuil critique">Taux de panne, d'intervention et de récurrence</KpiTitle>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
     <KpiCard label="Taux de panne théorique" value={hasH?fPct(K.lambdaTheo,2):"—"} st={hasH?ratePanne:"na"} stTxt={lblRate(ratePanne)} cible="< 0,5 % Bon · 0,5–1 % alerte" sub={"Heures correctives / temps théorique du parc ("+fH(K.hoursFlotte,0)+")"}/>
     <KpiCard label="Taux d'intervention" value={hasCorr?fPct(K.tauxInterv,2):"—"} st={hasCorr?rateInterv:"na"} stTxt={lblRate(rateInterv)} cible="< 1 % Bon · 1–5 % alerte" sub="Indisponibilité / temps théorique du parc"/>
     <KpiCard label="Taux de récurrence" value={hasCorr?fPct(K.tauxRecurrence):"—"} st={hasCorr?rateRec:"na"} stTxt={lblRate(rateRec)} cible="< 15 % Bon · 15–30 % alerte" sub={K.nbRecurrentes+" panne(s) récurrente(s) / "+K.nbPannesTot}/>
    </div>
    {K.recurrents.length>0 && <Card cls="mt-3"><div className="text-xs text-slate-400 mb-1">Pannes récurrentes (même équipement, même motif)</div>
     <table className="w-full text-sm"><thead><tr className="text-slate-400 text-left"><Th>Équipement</Th><Th>Motif</Th><Th cls="text-right">Occurrences</Th></tr></thead>
     <tbody>{K.recurrents.slice(0,8).map(g=><tr key={g.eq+g.motif} className="border-t border-slate-700"><td className="py-1">{g.eq}<span className="text-xs text-slate-400"> — {g.nom}</span></td><td className="text-xs text-slate-400">{g.motif}</td><td className="text-right text-rose-400 font-medium">{g.count}</td></tr>)}</tbody></table></Card>}
   </div>}
   {kpiOk("syn:taux")&&(K.nbSansFin>0||K.nbNegatif>0||K.nbAberrant>0) && <Card><div className="text-xs text-amber-400 font-medium mb-1">Qualité des données</div><div className="text-xs text-slate-400 space-y-0.5">
    {K.nbSansFin>0 && <div>• {K.nbSansFin} panne(s) sans clôture d'OT : l'indisponibilité est estimée par durée d'intervention + temps logistique.</div>}
    {K.nbNegatif>0 && <div>• {K.nbNegatif} panne(s) avec une clôture antérieure à la date de l'événement : durée de secours utilisée.</div>}
    {K.nbAberrant>0 && <div>• {K.nbAberrant} panne(s) avec une durée aberrante (&gt; 1,5 × la période) : ignorée(s) dans l'indisponibilité.</div>}</div></Card>}
   {kpiOk("syn:comp")&&<Card>
    <KpiTitle sub="Chaque unité est comparée à ses propres cibles (rouge = non atteint, orange = proche)">Comparatif des unités</KpiTitle>
    {unites.length===0?<KpiEmpty>Aucune donnée sur la période pour aucune unité.</KpiEmpty>:
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-slate-400 text-left"><Th>Unité</Th><Th>Pannes</Th><Th>MTTR</Th><Th>MTBF</Th><Th>Disponibilité</Th><Th>TCP</Th><Th>TCC</Th><Th>TMP</Th><Th>TMC</Th></tr></thead>
    <tbody>{unites.map(({u,c,k,o})=>{const cell=(key,val,txt,has)=>{const st=kpiStatus(o[key],val,has);const cl=KPI_ST[st];return <td style={{color:st==="na"?undefined:cl.fg}} className="font-medium">{has?txt:"—"}</td>;};
     return <tr key={u} className={"border-t border-slate-700 "+(u===unit?"bg-sky-900/30":"")}><td className="py-1.5">{u}</td><td>{k.nbPannesTot}</td><td>{k.nbPannesRep>0?fH(k.mttr,2):"—"}</td><td>{k.nbPannesTot>0?fH(k.mtbf,0):"—"}</td>
      {cell("dispo",k.dispo,fPct(k.dispo,2),true)}{cell("tcp",k.tcp,fPct(k.tcp),k.hTotal>0)}{cell("tcc",k.tcc,fPct(k.tcc),k.hTotal>0)}{cell("tmp",k.tmp,fPct(k.tmp),k.nbBTPrev>0)}{cell("tmc",k.tmc,fPct(k.tmc),k.nbPannesTot>0)}</tr>;})}</tbody></table></div>}
   </Card>}
  </div>}

  {sub==="Équipements" && <div className="space-y-4">
   <div className="flex flex-wrap justify-between items-end gap-3">
    <div className="flex items-end gap-3"><div><div className="text-xs text-slate-400">Seuil « OT total » (0 = désactivé)</div><Inp type="number" min="0" value={seuilBT} onChange={e=>setSeuilBT(e.target.value)}/></div><div className="text-xs text-slate-500 pb-2">Surligne les équipements dont les OT (préventifs + correctifs) atteignent le seuil.</div></div>
    <ExportBtn onClick={exportEquip}/>
   </div>
   <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
    <KpiCard label="Catégorie 1 — Préventif ET correctif" value={cats[0].length} sub="équipements suivis et en panne"/>
    <KpiCard label="Catégorie 2 — Préventif seulement" value={cats[1].length} sub="équipements sans panne"/>
    <KpiCard label="Catégorie 3 — Correctif seulement" value={cats[2].length} sub="équipements en panne sans préventif — à planifier"/>
   </div>
   <Card>
    {eqRows.length===0?<KpiEmpty>Aucun équipement avec DI ou OT sur la période.</KpiEmpty>:
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-slate-400 text-left"><Th>Équipement</Th><Th>Cat.</Th><Th>OT prév.</Th><Th>DI corr.</Th><Th>Pannes</Th><Th>MTTR</Th><Th>MTBF</Th><Th>Disponibilité</Th><Th>Taux logistique</Th><Th>Taux intervention</Th></tr></thead>
    <tbody>{eqRows.map(e=>{const hot=eqSeuil>0&&e.nbBT>=eqSeuil;return <tr key={e.code} className="border-t border-slate-700" style={hot?{background:"#fff1f2"}:undefined}>
     <td className="py-1.5"><span className="text-sky-400">{e.code}</span><br/><span className="text-xs text-slate-400">{e.nom}</span></td>
     <td><span className="px-2 py-0.5 rounded-full text-xs bg-slate-700">Cat. {e.cat}</span></td>
     <td>{e.nbPrev}</td><td>{e.nbCorr}</td><td>{e.k.nbPannesTot}</td>
     <td>{e.k.nbPannesRep>0?fH(e.k.mttr,2):"—"}</td><td>{e.k.nbPannesTot>0?fH(e.k.mtbf,0):"—"}</td>
     <td className="font-medium" style={{color:e.k.dispo<0.95?"#be123c":"#047857"}}>{fPct(e.k.dispo,2)}</td>
     <td>{e.hasCorrH?fPct(e.tauxLogCorr):"—"}</td><td>{e.hasCorrH?fPct(e.tauxIntervCorr):"—"}</td></tr>;})}</tbody></table></div>}
   </Card>
   <div className="text-xs text-slate-500">Par équipement : MTTR = durée d'intervention / pannes réparées · MTBF = (période − indisponibilité) / pannes · taux logistique = logistique / (durée + logistique).</div>
  </div>}

  {sub==="Ressources humaines" && <div className="space-y-4">
   <div className="flex flex-wrap justify-between items-end gap-3">
    <div className="flex flex-wrap items-end gap-3">
     <div><div className="text-xs text-slate-400">Norme mensuelle (h / technicien)</div><Inp type="number" min="1" value={normeBase} onChange={e=>setNormeBase(e.target.value)}/></div>
    </div><ExportBtn onClick={exportRH}/>
   </div>
   <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
    <KpiCard label="Norme de la période" value={fH(rh.norme,1)} sub={normeBase+" h × "+per.days+" j / 30"}/>
    <KpiCard label="Charge totale (GMAO)" value={fH(rh.total,1)} sub={rh.nbTech+" technicien(s)"}/>
    <KpiCard label="Taux moyen d'occupation" value={rh.nbTech>0?fPct(rh.tauxMoyen):"—"} sub={rh.nbSurcharge+" surcharge · "+rh.nbEquil+" équilibre · "+rh.nbSous+" sous-charge"}/>
    <KpiCard label="Besoin en effectif" value={rh.nbTech>0?rh.besoin:"—"} sub={rh.nbTech>0?"théorique "+fNum(rh.besoinTheo,2)+" · écart "+(rh.delta>0?"+":"")+rh.delta:""}/>
   </div>
   <Card>
    {rh.techs.length===0?<KpiEmpty>Aucune heure d'intervenant saisie sur la période (le temps se renseigne à la clôture de l'OT).</KpiEmpty>:
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-slate-400 text-left"><Th>Technicien</Th><Th>Interventions</Th><Th>Charge réelle</Th><Th>Norme</Th><Th>Taux d'occupation</Th><Th>Écart</Th><Th>Statut</Th></tr></thead>
    <tbody>{rh.techs.map(t=><tr key={t.technicien} className="border-t border-slate-700"><td className="py-1.5">{t.technicien}<br/><span className="text-xs text-slate-400">{t.fonction}</span></td><td>{t.nbInterventions}</td><td>{fH(t.chargeReelle,1)}</td><td>{fH(t.norme,1)}</td>
     <td><div className="flex items-center gap-2"><div className="w-24 h-2 rounded bg-slate-700 overflow-hidden"><div style={{width:Math.min(100,t.taux*100)+"%",background:t.statut==="surcharge"?"#be123c":t.statut==="sous-charge"?"#b45309":"#047857"}} className="h-2"/></div>{fPct(t.taux)}</div></td>
     <td>{(t.delta>0?"+":"")+fNum(t.delta)} h</td><td><StChip st={t.statut==="surcharge"?"bad":t.statut==="sous-charge"?"warn":"ok"} txt={t.statut}/></td></tr>)}</tbody></table></div>}
   </Card>
   <Card>
     <div className="flex flex-wrap justify-between items-end gap-3 mb-2" data-testid="rh-ram">
      <div><div className="font-semibold text-slate-100">Taux d'efficience mensuel — {unit}</div>
       <div className="text-xs text-slate-400">Chaque mois, saisissez la charge du rapport d'activité (RAM) : elle est sauvegardée pour l'unité. Taux = charge GMAO ÷ charge RAM.</div></div>
      <div className="flex items-end gap-2"><div><div className="text-xs text-slate-400">Année</div><Inp type="number" min="2000" max="2100" value={anneeRAM} onChange={e=>setAnneeRAM(Number(e.target.value)||now.getFullYear())} data-testid="rh-annee"/></div></div>
     </div>
     {!histo && new Date(anneeRAM,0,1)<new Date(limHisto) && <div className="text-xs text-amber-300 mb-2">Les OT clos depuis plus de {FENETRE_MOIS} mois ne sont pas chargés : chargez l'historique complet (bandeau en haut) pour des charges GMAO exactes.</div>}
     <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-slate-400 text-left"><Th>Mois</Th><Th>Charge GMAO</Th><Th>Charge RAM (h)</Th><Th>Taux d'efficience</Th></tr></thead>
      <tbody>{moisRAM.map(x=><tr key={x.mois} className="border-t border-slate-700" data-testid={"rh-mois-"+x.mois}><td className="py-1.5">{MOIS_LONGS[x.m]}</td><td>{fH(x.gmao,1)}</td>
       <td><CelluleRAM key={x.mois+"|"+(x.ram??"")} valeur={x.ram} disabled={!peutSaisirRAM||!onSaveChargeRAM} onSave={(v)=>onSaveChargeRAM(unit,x.mois,v)} label={"Charge RAM "+MOIS_LONGS[x.m]}/></td>
       <td>{x.eff===null?"—":fPct(x.eff)}</td></tr>)}
       <tr className="border-t-2 border-slate-600 font-semibold"><td className="py-1.5">Total {anneeRAM} (mois saisis)</td><td>{fH(totRAM.gmao,1)}</td><td>{totRAM.nb?fH(totRAM.ram,1):"—"}</td><td>{totRAM.eff===null?"—":fPct(totRAM.eff)}</td></tr></tbody></table></div>
     <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
      <CarteGraphe titre="Charge GMAO et charge RAM par mois" sousTitre="Heures — la charge RAM n'apparaît que pour les mois saisis">
       <BarresGroupees cats={moisRAM.map(x=>MOIS_COURTS[x.m])} series={[{nom:"Charge GMAO",coul:SERIES[0],vals:moisRAM.map(x=>x.gmao)},{nom:"Charge RAM",coul:SERIES[1],vals:moisRAM.map(x=>x.ram||0)}]} fmt={(v)=>String(Math.round(v))}/>
      </CarteGraphe>
      <CarteGraphe titre="Taux d'efficience mensuel" sousTitre="Charge GMAO ÷ charge RAM — cible ≈ 100 %">
       <Courbe cats={moisRAM.map(x=>MOIS_COURTS[x.m])} nom="Taux d'efficience" vals={moisRAM.map(x=>x.eff===null?null:x.eff*100)} fmt={(v)=>Math.round(v)+" %"} cible={100} cibleLib="100 %" min={0}/>
      </CarteGraphe>
     </div>
    </Card>
    <div className="text-xs text-slate-500">Statuts : surcharge &gt; 105 % · équilibre 75–105 % · sous-charge &lt; 75 %. La charge est le temps saisi par chaque intervenant sur les OT de l'unité.</div>
  </div>}

  {sub==="Maintenance prédictive" && <div className="space-y-4" data-testid="kpi-predictif">
   <div className="flex flex-wrap justify-between items-end gap-3">
    <div className="flex flex-wrap items-end gap-3">
     <div><div className="text-xs text-slate-400">Prévoir les pannes sous</div><Segment value={predHor} options={["30 jours","60 jours","90 jours"]} onChange={setPredHor}/></div>
     <div><div className="text-xs text-slate-400">Historique utilisé</div><Segment value={predHist} options={["12 mois","24 mois","Tout"]} onChange={setPredHist}/></div>
    </div><ExportBtn onClick={exportPred}/>
   </div>
   <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
    <KpiCard label="Risque élevé" value={pred.synth.eleve+" équip."} st={pred.synth.eleve>0?"bad":"ok"} stTxt={pred.synth.eleve>0?"À traiter":"Aucun"} sub={"panne probable sous "+predHor}/>
    <KpiCard label="Risque moyen" value={pred.synth.moyen+" équip."} st={pred.synth.moyen>0?"warn":"ok"} stTxt={pred.synth.moyen>0?"À surveiller":"Aucun"} sub="à inspecter"/>
    <KpiCard label="Pannes prévues sur 12 mois" value={String(Math.round(pred.synth.pannes12))} sub={pred.synth.analyses+" équipement(s) analysé(s)"}/>
    <KpiCard label="Arrêt prévu sur 12 mois" value={fH(pred.synth.arret12,0)} sub={"≈ "+fDA(pred.synth.cout12)+" de coût de pannes"}/>
   </div>
   {pred.lignes.length===0?<Card><KpiEmpty>Aucun équipement n'a assez de pannes pour une prévision (3 pannes minimum){pred.insuffisants>0?" — "+pred.insuffisants+" équipement(s) avec 1 à 2 pannes seulement.":"."}</KpiEmpty></Card>:<>
   <CarteGraphe titre="Probabilité de panne par équipement" sousTitre={"Sous "+predHor+" · les 10 équipements les plus exposés · rouge : élevé · orange : moyen · vert : faible"}>
    <BarresH items={pred.lignes.slice().sort((a,b)=>b.proba-a.proba).slice(0,10).map(l=>({lib:l.nom,sub:l.eq,val:l.proba*100,coul:PRED_COUL[l.risque],note:"MTBF "+fJ(l.mtbfJours)+" · "+l.pannes+" pannes"}))} nom="Probabilité" fmt={(v)=>fNum(v,0)+" %"} max={100}/>
   </CarteGraphe>
   <Card>
    <div className="flex flex-wrap justify-between items-end gap-3"><KpiTitle sub={"Prévision à partir du nombre de pannes, des intervalles entre pannes, des durées et des causes relevées dans les OT correctifs."+(pred.insuffisants>0?" "+pred.insuffisants+" équipement(s) non analysé(s) : moins de 3 pannes.":"")}>Prévisions de pannes par équipement</KpiTitle>
     <Segment value={predFiltre} options={["Tous","Élevé","Moyen","Faible"]} onChange={setPredFiltre}/></div>
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-slate-400 text-left"><Th>Risque</Th><Th>Équipement</Th><Th>Pannes</Th><Th>MTBF</Th><Th>Prochaine panne prévue</Th><Th>Probabilité</Th><Th>Tendance</Th><Th>Arrêt moyen</Th><Th>Cause probable</Th><Th>Pièces à prévoir</Th><Th>Action</Th></tr></thead>
    <tbody>{predLignes.map(l=><tr key={l.eq} className="border-t border-slate-700 align-top">
     <td className="py-1.5"><span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{background:PRED_COUL[l.risque]+"22",color:PRED_COUL[l.risque],border:"1px solid "+PRED_COUL[l.risque]}}>{l.risque}</span></td>
     <td>{l.nom}<br/><span className="text-xs text-slate-400">{l.eq}</span></td><td>{l.pannes}<br/><span className="text-xs text-slate-400">dernière : {l.derniere}</span></td><td>{fJ(l.mtbfJours)}</td>
     <td>{l.prochaine}{l.enRetard&&<><br/><span className="text-xs text-amber-400">échéance dépassée</span></>}</td>
     <td>{fPct(l.proba,0)}<br/><span className="text-xs text-slate-400">sous {l.horizonJours} j</span></td>
     <td><span style={{color:l.tendance==="Dégradation"?"#D32F2F":l.tendance==="Amélioration"?"#2E9E5B":undefined}}>{l.tendance}</span></td>
     <td>{fH(l.heuresMoy,1)}</td><td className="text-xs max-w-[11rem]">{l.cause||"—"}{l.causeOcc>1&&<span className="text-slate-400"> ({l.causeOcc}×)</span>}</td>
     <td className="text-xs">{l.pieces.length?l.pieces.map(x=><div key={x.code}>{x.qte} × {x.nom}{x.stockOk===false&&<span className="text-rose-400"> (stock insuffisant)</span>}</div>):"—"}</td>
     <td className="text-xs text-slate-300 max-w-xs">{l.action}</td></tr>)}</tbody></table></div>
   </Card></>}
   <div className="text-xs text-slate-500">Méthode : à partir des dates des pannes de chaque équipement (DI correctives), on calcule le temps moyen entre pannes (MTBF) et la tendance (dégradation si les pannes se rapprochent). La probabilité de panne sous l'horizon choisi est calculée avec une loi de Weibull lorsque l'historique compte au moins 5 pannes, avec une loi exponentielle (taux de panne constant) sinon, en tenant compte du temps écoulé depuis la dernière panne. Risque élevé : probabilité ≥ 50 % (ou ≥ 30 % avec dégradation) ; moyen : ≥ 25 % ou échéance dépassée. Les durées, coûts, causes et pièces viennent des OT correctifs. C'est une aide à la décision : plus l'historique est long et bien renseigné (dates, causes, pièces), plus la prévision est fiable.</div>
  </div>}

  {sub==="Optimisation de la maintenance" && <div className="space-y-4" data-testid="kpi-optimisation">
   <div className="flex flex-wrap justify-between items-end gap-3">
    <div className="flex flex-wrap items-end gap-3">
     <div><div className="text-xs text-slate-400">Année analysée</div><Segment value={optiAnnee} options={Array.from({length:5},(_,i)=>String(new Date().getFullYear()-4+i))} onChange={setOptiAnnee}/></div>
     <div><div className="text-xs text-slate-400">« Trop de pannes » à partir de (pannes/an)</div><Inp type="number" min="1" value={optiSeuil} onChange={e=>setOptiSeuil(e.target.value)} style={{maxWidth:110}}/></div>
     <div><div className="text-xs text-slate-400">« Sans panne » jusqu'à (pannes/an)</div><Inp type="number" min="0" value={optiBas} onChange={e=>setOptiBas(e.target.value)} style={{maxWidth:110}}/></div>
    </div><ExportBtn onClick={exportOpti}/>
   </div>
   <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
    <KpiCard label="À espacer (alléger)" value={opti.synth.espacer+" équip."} sub="plan préventif sans panne"/>
    <KpiCard label="À renforcer / créer" value={(opti.synth.renforcer+opti.synth.creer)+" équip."} sub={opti.synth.renforcer+" plan(s) à revoir · "+opti.synth.creer+" plan(s) à créer"}/>
    <KpiCard label="À maintenir" value={opti.synth.maintenir+" équip."} sub="niveau de préventif cohérent"/>
    <KpiCard label="Gain estimé par an" value={fDA(opti.synth.economieCout)} sub={fH(opti.synth.economieH,1)+" de maintenance en moins"}/>
   </div>
   <Card>
    <div className="flex flex-wrap justify-between items-end gap-3"><KpiTitle sub={"Bilan "+optiAnnee+" : "+opti.synth.nbEquip+" équipement(s) analysé(s), "+opti.synth.pannes+" panne(s), "+fDA(opti.synth.coutPannes)+" de coût de pannes. Propositions à valider par l'équipe avant modification des plans."}>Recommandations automatiques</KpiTitle>
     <Segment value={optiFiltre} options={["Tous","Espacer","Renforcer","Créer un plan","Maintenir"]} onChange={setOptiFiltre}/></div>
    {optiLignes.length===0?<KpiEmpty>Aucune recommandation pour cette année et ce filtre.</KpiEmpty>:
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-slate-400 text-left"><Th>Action</Th><Th>Équipement</Th><Th>Plan</Th><Th>Périodicité actuelle</Th><Th>Proposition</Th><Th>Pannes</Th><Th>OT prév.</Th><Th>Gain estimé / an</Th><Th>Pourquoi</Th></tr></thead>
    <tbody>{optiLignes.map((l,i)=><tr key={l.eq+l.plan+i} className="border-t border-slate-700 align-top">
     <td className="py-1.5"><span className="px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap" style={{background:OPTI_COUL[l.statut]+"22",color:OPTI_COUL[l.statut],border:"1px solid "+OPTI_COUL[l.statut]}}>{l.statut}</span></td>
     <td>{l.nom}<br/><span className="text-xs text-slate-400">{l.eq}</span></td><td>{l.plan}</td>
     <td>{l.periodeActuelle}<br/><span className="text-xs text-slate-400">{fOcc(l.occActuelle)}</span></td>
     <td>{l.propose}<br/><span className="text-xs text-slate-400">{fOcc(l.occPropose)}</span></td>
     <td>{l.pannes}<br/><span className="text-xs text-slate-400">{fH(l.heuresPannes,1)} d'arrêt</span></td><td>{l.nbPrev}</td>
     <td>{l.statut==="Espacer"?<>{fDA(l.economieCout)}<br/><span className="text-xs text-slate-400">{fH(l.economieH,1)}</span></>:"—"}</td>
     <td className="text-xs text-slate-300 max-w-xs">{l.motif}</td></tr>)}</tbody></table></div>}
   </Card>
   <Card>
    <KpiTitle sub="Déduites des causes de pannes récurrentes de l'année (hors tâches déjà présentes dans les plans). À ajouter au plan existant ou au nouveau plan.">Tâches préventives proposées</KpiTitle>
    {opti.taches.length===0?<KpiEmpty>Aucune tâche à proposer : aucune panne récurrente avec une cause renseignée.</KpiEmpty>:
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-slate-400 text-left"><Th>Équipement</Th><Th>Tâche proposée</Th><Th>Occurrences</Th></tr></thead>
    <tbody>{opti.taches.map((t,i)=><tr key={t.eq+i} className="border-t border-slate-700"><td className="py-1.5">{t.nom}<br/><span className="text-xs text-slate-400">{t.eq}</span></td><td>{t.tache}</td><td>{t.occurrences}</td></tr>)}</tbody></table></div>}
   </Card>
   <div className="text-xs text-slate-500">Méthode : sur l'année choisie, un équipement avec plan préventif et sans panne voit sa périodicité allongée d'un cran (gain = occurrences évitées × coût moyen d'un OT préventif de ce plan) ; un équipement avec trop de pannes voit son plan rapproché d'un cran et ses tâches complétées, ou reçoit un nouveau plan dont la périodicité est au plus la moitié du temps moyen entre pannes (MTBF ≈ 365 ÷ pannes/an). Les seuils sont réglables ci-dessus. Aucun plan n'est modifié automatiquement.</div>
  </div>}

  {sub==="Stock" && <div className="space-y-4">
   <div className="flex flex-wrap justify-between items-end gap-3">
    <div><div className="text-xs text-slate-400">Délai fournisseur (mois)</div><Inp type="number" min="0.1" step="0.5" value={delai} onChange={e=>setDelai(e.target.value)}/></div><ExportBtn onClick={exportStock}/>
   </div>
   <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
    <KpiCard label="Coût des sorties (période)" value={fDA(stk.coutTotal)} sub={stk.nbSorties+" mouvement(s) de sortie"}/>
    <KpiCard label="Coût moyen / mois" value={fDA(stk.coutMoyenMois)} sub={"sur "+stk.nbMois+" mois couvert(s)"}/>
    <KpiCard label="Valeur du stock" value={fDA(stk.valeurStock)} sub={stk.rot.length+" article(s)"}/>
    <KpiCard label="Sous le stock de sécurité" value={stk.nbSousSeuil} st={stk.secu.length?(stk.nbSousSeuil===0?"ok":"bad"):"na"} cible="0 article" sub={stk.nbDormants+" dormant(s) · "+fDA(stk.valeurDormants)+" immobilisés"}/>
   </div>
   <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
    <Card><KpiTitle>Coût par catégorie</KpiTitle>
     {Object.keys(stk.parCat).length===0?<KpiEmpty>Aucune sortie sur la période.</KpiEmpty>:<table className="w-full text-sm"><tbody>{Object.entries(stk.parCat).sort((a,b)=>b[1]-a[1]).map(([c,v])=><tr key={c} className="border-t border-slate-700"><td className="py-1.5">{c}</td><td className="text-right">{fDA(v)}</td><td className="text-right text-slate-400 w-16">{fPct(stk.coutTotal>0?v/stk.coutTotal:0,0)}</td></tr>)}</tbody></table>}</Card>
    <Card><KpiTitle>Articles les plus coûteux</KpiTitle>
     {stk.top.length===0?<KpiEmpty>Aucune sortie sur la période.</KpiEmpty>:<table className="w-full text-sm"><tbody>{stk.top.slice(0,8).map(x=><tr key={x.code} className="border-t border-slate-700"><td className="py-1.5"><span className="text-sky-400">{x.code}</span> <span className="text-xs text-slate-400">{x.nom}</span></td><td className="text-right text-slate-400">×{x.qte}</td><td className="text-right">{fDA(x.cout)}</td></tr>)}</tbody></table>}</Card>
   </div>
   <Card><KpiTitle sub="Stock de sécurité = consommation moyenne mensuelle × délai fournisseur">Stock de sécurité</KpiTitle>
    {stk.secu.length===0?<KpiEmpty>Aucune consommation sur la période.</KpiEmpty>:<div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-slate-400 text-left"><Th>Article</Th><Th>Conso. moy./mois</Th><Th>Stock de sécurité</Th><Th>Stock actuel</Th><Th>Seuil min saisi</Th><Th>Alerte</Th></tr></thead>
    <tbody>{stk.secu.map(x=><tr key={x.code} className="border-t border-slate-700"><td className="py-1.5"><span className="text-sky-400">{x.code}</span> <span className="text-xs text-slate-400">{x.nom}</span></td><td>{fNum(x.avgMois,1)}</td><td>{fNum(x.stockSecu,1)}</td><td className="font-medium" style={{color:x.sousSeuil?"#be123c":"#047857"}}>{x.stockActuel}</td><td>{x.min}</td><td>{x.sousSeuil?<StChip st="bad" txt="Sous le stock de sécurité"/>:<StChip st="ok" txt="OK"/>}</td></tr>)}</tbody></table></div>}</Card>
   <Card><KpiTitle sub="Dormant = aucune sortie depuis 365 jours ou plus, avec une valeur de stock > 0">Rotation et stock dormant</KpiTitle>
    {stk.rot.length===0?<KpiEmpty>Aucun article en stock.</KpiEmpty>:<div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-slate-400 text-left"><Th>Article</Th><Th>Stock</Th><Th>Valeur du stock</Th><Th>Conso. 12 mois</Th><Th>Dernier mouvement</Th><Th></Th></tr></thead>
    <tbody>{stk.rot.map(r=><tr key={r.code} className="border-t border-slate-700"><td className="py-1.5"><span className="text-sky-400">{r.code}</span> <span className="text-xs text-slate-400">{r.nom}</span></td><td>{r.stock}</td><td>{fDA(r.valeurStock)}</td><td>{fDA(r.conso12)}</td><td>{r.jours===null?"—":"il y a "+r.jours+" j"}</td><td>{r.dormant&&<StChip st="bad" txt="Dormant"/>}</td></tr>)}</tbody></table></div>}</Card>
  </div>}

  {sub==="Criticité (AMDEC)" && <div className="space-y-4">
   <div className="flex flex-wrap justify-between items-end gap-3">
    <div className="flex flex-wrap items-end gap-3">
     <div><div className="text-xs text-slate-400">Regrouper par</div><Segment value={groupBy} options={["Système","Sous-système","Équipement","Sous-équipement"]} onChange={setGroupBy}/></div>
     <div><div className="text-xs text-slate-400">Base de la gravité (G)</div><Segment value={gravBase} options={["Gravité saisie (OT)","Durée d'arrêt moyenne"]} onChange={setGravBase}/></div>
    </div><ExportBtn onClick={exportAmdec}/>
   </div>
   <Card>
    {amdec.length===0?<KpiEmpty>Aucune panne corrective sur la période.</KpiEmpty>:
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-slate-400 text-left"><Th>{groupBy}</Th><Th>Pannes</Th><Th>Occ./an</Th><Th>Arrêt moy.</Th><Th>P</Th><Th>G</Th><Th>ND</Th><Th>Criticité C</Th><Th>Stratégie recommandée</Th></tr></thead>
    <tbody>{amdec.map(g=><tr key={g.key} className="border-t border-slate-700 align-top"><td className="py-1.5">{g.label}<br/><span className="text-xs text-slate-400">{g.sub||g.exemples[0]}</span></td><td>{g.count}</td><td>{fNum(g.annual,1)}</td><td>{g.avgMin} min</td><td>{g.f}</td><td title={gravBase==="Gravité saisie (OT)"?(g.gDefaut?"Aucune gravité saisie sur les OT : repli sur la durée d'arrêt":"Moyenne arrondie de "+g.nbGrav+" gravité(s) saisie(s) sur les OT (min "+g.gMin+" · max "+g.gMax+")"):"Calculée d'après la durée d'arrêt moyenne"}>{g.g}{g.gDefaut?"*":""}{gravBase==="Gravité saisie (OT)"&&!g.gDefaut&&<span className="text-xs text-slate-500"> ({g.nbGrav}/{g.count} OT)</span>}</td><td title={g.dDefaut?"Non saisie sur les OT : valeur par défaut 2":"Moyenne des détections saisies"}>{g.d}{g.dDefaut?"*":""}</td>
     <td><StChip st={g.band.cls} txt={g.crit+" — "+g.band.label}/></td><td title={g.strat.why}><span className="px-2 py-0.5 rounded-full text-xs bg-slate-700">{g.strat.id}</span><div className="text-xs text-slate-500 max-w-xs mt-0.5">{g.strat.why}</div></td></tr>)}</tbody></table></div>}
   </Card>
   <div className="text-xs text-slate-500">C = G × P × ND · Majeure ≥ 16 · Modérée ≥ 10 · Acceptable &lt; 10. P est extrapolée sur 365 jours à partir de la période affichée. G « Gravité saisie (OT) » = moyenne arrondie des gravités 1 à 4 saisies dans le compte-rendu des OT ; * G = durée d'arrêt quand aucune gravité n'est saisie ; * ND = 2 par défaut quand la détection n'est pas saisie sur les OT.</div>
  </div>}

  {sub==="Pareto (ABC)" && <div className="space-y-4" data-testid="kpi-pareto">
   <div className="flex flex-wrap justify-between items-end gap-3">
    <div className="flex flex-wrap items-end gap-3">
     <div><div className="text-xs text-slate-400">Critère</div><Segment value={paretoCrit1.lib} options={KPI_PARETO_CRITERES.map(c=>c.lib)} onChange={v=>setParetoCrit((KPI_PARETO_CRITERES.find(c=>c.lib===v)||KPI_PARETO_CRITERES[0]).id)}/></div>
     <div><div className="text-xs text-slate-400">Maintenance</div><Segment value={paretoPortee} options={["Corrective","Préventive","Toutes"]} onChange={setParetoPortee}/></div>
    </div><ExportBtn onClick={exportPareto}/>
   </div>
   {pareto.items.length===0?<Card><KpiEmpty>Aucune donnée pour ce critère sur la période.</KpiEmpty></Card>:<>
   <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
    <KpiCard label={"Total — "+paretoCrit1.lib} value={fParetoVal(pareto.total,paretoCrit1)} sub={pareto.n100+" équipement(s) concerné(s)"}/>
    <KpiCard label="Classe A — 80 %" value={pareto.n80+" équip."} sub={fPct(pareto.n80/pareto.n100,0)+" des équipements concernés"}/>
    <KpiCard label="Jusqu'à la classe B — 95 %" value={pareto.n95+" équip."} sub={fPct(pareto.n95/pareto.n100,0)+" des équipements concernés"}/>
    <KpiCard label="Jusqu'à la classe C — 100 %" value={pareto.n100+" équip."} sub="tous les équipements concernés"/>
   </div>
   <CarteGraphe titre={"Pareto — "+paretoCrit1.lib} sousTitre={"Équipements classés du plus au moins pénalisant · lignes pointillées : 80 % et 95 %"+(pareto.items.length>30?" · 30 premiers affichés":"")}>
    <ParetoChart items={pareto.items} fmt={v=>paretoCrit1.unite==="DA"?Math.round(v).toLocaleString("fr-FR"):fNum(v,paretoCrit1.unite==="h"?1:0)} unite={paretoCrit1.unite} titre={"Pareto — "+paretoCrit1.lib}/>
    <div className="flex gap-4 text-xs text-slate-400 mt-1">{["A","B","C"].map(c=><span key={c} className="flex items-center gap-1"><span style={{background:COULEURS_ABC[c],width:10,height:10,borderRadius:2,display:"inline-block"}}/>Classe {c} ({c==="A"?"jusqu'à 80 %":c==="B"?"80 à 95 %":"95 à 100 %"})</span>)}</div>
   </CarteGraphe>
   {parts&&<Card data-testid="pareto-deco">
    <KpiTitle sub={paretoCrit1.id==="tempsTotal"?"Temps d'intervention = durée d'intervention + temps logistique":"Coût total = coût humain + coût matériel"}>{"Décomposition — "+paretoCrit1.lib}</KpiTitle>
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-slate-400 text-left"><Th></Th><Th>Équipements</Th>{parts.map(pt=><Th key={pt.id}>{pt.lib}</Th>)}<Th>{paretoCrit1.lib}</Th></tr></thead>
    <tbody>{decoClasses.map(d=><tr key={d.lib} className={"border-t border-slate-700"+(d.lib==="Total"?" font-semibold":"")}><td className="py-1.5">{d.lib}</td><td>{d.n}</td>
     {d.vals.map((v,i)=><td key={parts[i].id}>{fParetoVal(v,critOf(parts[i].id))}{d.tot>0&&<span className="text-xs text-slate-400"> ({fPct(v/d.tot,0)})</span>}</td>)}<td>{fParetoVal(d.tot,paretoCrit1)}</td></tr>)}</tbody></table></div>
   </Card>}
   <Card>
    <KpiTitle sub="Classe A : équipements qui expliquent les 80 % premiers % du critère · B : jusqu'à 95 % · C : jusqu'à 100 %">Classement des équipements</KpiTitle>
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-slate-400 text-left"><Th>Rang</Th><Th>Équipement</Th><Th>{paretoCrit1.lib}</Th><Th>% du total</Th><Th>% cumulé</Th><Th>Classe</Th>{parts&&parts.map(pt=><Th key={pt.id}>{pt.lib}</Th>)}</tr></thead>
    <tbody>{pareto.items.map(r=><tr key={r.code} className="border-t border-slate-700"><td className="py-1.5">{r.rang}</td><td>{r.nom}<br/><span className="text-xs text-slate-400">{r.code}</span></td><td>{fParetoVal(r.value,paretoCrit1)}</td><td>{fPct(r.pct)}</td><td>{fPct(r.cum)}</td>
     <td><span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{background:COULEURS_ABC[r.classe]+"22",color:COULEURS_ABC[r.classe],border:"1px solid "+COULEURS_ABC[r.classe]}}>{r.classe}</span></td>{parts&&parts.map(pt=><td key={pt.id}>{fParetoVal(Number(r.row[pt.id])||0,critOf(pt.id))}{r.value>0&&<span className="text-xs text-slate-400"> ({fPct((Number(r.row[pt.id])||0)/r.value,0)})</span>}</td>)}</tr>)}</tbody></table></div>
   </Card></>}
   <Card>
    <KpiTitle sub="Combien d'équipements faut-il traiter pour couvrir 80 %, 95 % et 100 % de chaque critère ? Le classement change d'un critère à l'autre.">Comparaison des critères</KpiTitle>
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-slate-400 text-left"><Th>Critère</Th><Th>Total</Th><Th>Équipements à 80 % (A)</Th><Th>à 95 % (A+B)</Th><Th>à 100 % (A+B+C)</Th></tr></thead>
    <tbody>{paretoTous.map(({c,p})=><tr key={c.id} className="border-t border-slate-700"><td className="py-1.5">{c.lib}</td><td>{p.n100?fParetoVal(p.total,c):"—"}</td><td>{p.n100?p.n80:"—"}</td><td>{p.n100?p.n95:"—"}</td><td>{p.n100?p.n100:"—"}</td></tr>)}</tbody></table></div>
   </Card>
   <div className="text-xs text-slate-500">Temps d'intervention = durée d'intervention + temps logistique ; il se décompose en ses deux parts, comme le coût total (humain + matériel). Les coûts viennent des OT : coût humain = (durée d'intervention + temps logistique) × taux horaire de chaque intervenant ; coût matériel = pièces + outillage + consommables au prix du stock. « Nombre de DI » compte les DI correctives non annulées (en maintenance préventive ou « Toutes », chaque OT préventif compte pour une intervention). Un équipement est de classe A tant que le cumul avant lui est inférieur à 80 %, de classe B jusqu'à 95 %, puis C.</div>
  </div>}

  {sub==="Référentiel" && <div className="space-y-3">
   <div className="flex justify-between items-center"><div className="text-xs text-slate-500">Formules, cibles et correspondance avec les données de cette GMAO.</div><ExportBtn onClick={exportRef}/></div>
   <Card><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-slate-400 text-left"><Th>Famille</Th><Th>Indicateur</Th><Th>Formule</Th><Th>Cible</Th><Th>Source dans la GMAO</Th><Th>Adaptation</Th></tr></thead>
   <tbody>{KPI_REFERENTIEL.map((r,i)=><tr key={i} className="border-t border-slate-700 align-top"><td className="py-1.5 text-xs text-slate-400">{r[0]}</td><td className="font-medium text-slate-200">{r[1]}</td><td className="text-xs text-slate-400 max-w-sm">{r[2]}</td><td className="text-xs text-slate-400 max-w-[200px]">{r[3]}</td><td className="text-xs text-slate-400 max-w-[220px]">{r[4]}</td><td className="text-xs text-slate-500 max-w-xs">{r[5]}</td></tr>)}</tbody></table></div></Card>
  </div>}
 </div>);
}

/* ===== Tableau de bord graphique des indicateurs ===== */
const MOIS_LONGS=["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
const MOIS_COURTS=["janv.","févr.","mars","avr.","mai","juin","juil.","août","sept.","oct.","nov.","déc."];
const ymdD=(d)=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
const varRel=(a,b)=>(b>0&&Number.isFinite(a)&&Number.isFinite(b))?(a-b)/b:null;
export function GraphiquesKPI({unit,dis,bts,planning,equipements,per,start,end,parcMode,flt,fSys,subOpts,sysOpts,K,O,eqRows,unites,effPeriode,chargeMois,kpiOk=()=>true}){
 const data={dis,bts,planning,equipements};
 // période précédente de même durée
 const Kprev=useMemo(()=>{const s=new Date(per.start);s.setDate(s.getDate()-per.days);const e=new Date(per.start);e.setDate(e.getDate()-1);
  const p=kpiPeriode(ymdD(s),ymdD(e)); const c=kpiCollect(unit,data,p,parcMode,flt); return kpiCalc(c.corr,c.prev,p,c.nbEquip);},[unit,dis,bts,planning,equipements,per,parcMode,flt]);
 // 12 mois glissants se terminant au mois de fin de période
 const mois=useMemo(()=>{const fin=new Date(per.end);const out=[];
  for(let k=11;k>=0;k--){const a=new Date(fin.getFullYear(),fin.getMonth()-k,1);const b=new Date(fin.getFullYear(),fin.getMonth()-k+1,0);
   const p=kpiPeriode(ymdD(a),ymdD(b)); const c=kpiCollect(unit,data,p,parcMode,flt); const k2=kpiCalc(c.corr,c.prev,p,c.nbEquip);
   out.push({lib:MOIS_COURTS[a.getMonth()]+(a.getMonth()===0||k===11?" "+String(a.getFullYear()).slice(2):""),k:k2,actif:c.corr.length+c.prev.length>0,an:a.getFullYear(),mo:a.getMonth()});}
  return out;},[unit,dis,bts,planning,equipements,per,parcMode,flt]);
 // taux d'efficience mensuel (unité entière) : charge GMAO ÷ charge RAM saisie — null si la charge RAM du mois n'est pas saisie
 const effMois=useMemo(()=>mois.map(m=>chargeMois(unit,m.an,m.mo).eff),[mois,unit,chargeMois]);
 const parGroupe=useMemo(()=>{
  const groupes=fSys?subOpts.map(s=>({code:s.code,lib:s.code+" — "+s.sub,f:{...flt,sub:s.code,eq:"",se:""}})):sysOpts.map(([c,n])=>({code:c,lib:c+" — "+n,f:{sys:c,sub:"",eq:"",se:""}}));
  return groupes.map(g=>{const c=kpiCollect(unit,data,per,parcMode,g.f);const k=kpiCalc(c.corr,c.prev,per,c.nbEquip);return {lib:g.lib,val:k.nbPannesTot,note:"MTTR "+fH(k.mttr,2)+" · disponibilité "+fPct(k.dispo,2)};})
   .filter(x=>x.val>0).sort((a,b)=>b.val-a.val);
 },[unit,dis,bts,planning,equipements,per,parcMode,flt,fSys,subOpts,sysOpts]);
 const top=eqRows.filter(e=>e.k.nbPannesTot>0).slice(0,10).map(e=>({lib:e.code,sub:e.nom,val:e.k.nbPannesTot,note:"MTTR "+fH(e.k.mttr,2)+" · disponibilité "+fPct(e.k.dispo,2)}));
 const st=(o,v,has)=>{const s=kpiStatus(o,v,has);return s==="ok"?"ok":s==="warn"?"warn":s==="bad"?"bad":"";};
 const has=K.nbPannesTot>0;
 const cats=mois.map(m=>m.lib);
 const pctF=(d=0)=>(v)=>v.toFixed(d).replace(".",",")+" %";
 const mm=(f,ok)=>mois.map(m=>ok(m)?f(m.k):null);
 const sciUnit=1e4;   // λ affiché en ×10⁻⁴ /h sur l'axe pour rester lisible
 const evoIng=[
  {id:"tcp",lib:"TCP — charge préventive",val:K.hTotal>0?fPct(K.tcp):"—",st:kpiStatus(O.tcp,K.tcp,K.hTotal>0),cible:O.tcp.label,vals:mm(k=>k.tcp*100,m=>m.k.hTotal>0),fmt:pctF(0),min:0,max:100,cv:O.tcp.val*100},
  {id:"tcc",lib:"TCC — charge corrective",val:K.hTotal>0?fPct(K.tcc):"—",st:kpiStatus(O.tcc,K.tcc,K.hTotal>0),cible:O.tcc.label,vals:mm(k=>k.tcc*100,m=>m.k.hTotal>0),fmt:pctF(0),min:0,max:100,cv:O.tcc.val*100},
  {id:"eff",lib:"Taux d'efficience",val:effPeriode&&effPeriode.eff!==null?fPct(effPeriode.eff):"—",st:effPeriode&&effPeriode.eff!==null?kpiStatus(O.efficience,effPeriode.eff,true):"na",cible:O.efficience.label,vals:effMois.map(v=>v===null?null:v*100),fmt:pctF(0),min:0,cv:100,note:"Unité entière · mois dont la charge RAM est saisie"},
 ];
 const evoReal=[
  {id:"tmp",lib:"TMP — maintenance préventive",val:K.nbBTPrev>0?fPct(K.tmp):"—",st:kpiStatus(O.tmp,K.tmp,K.nbBTPrev>0),cible:O.tmp.label,vals:mm(k=>k.tmp*100,m=>m.k.nbBTPrev>0),fmt:pctF(0),min:0,max:100,cv:100},
  {id:"tmc",lib:"TMC — maintenance corrective",val:has?fPct(K.tmc):"—",st:kpiStatus(O.tmc,K.tmc,has),cible:O.tmc.label,vals:mm(k=>k.tmc*100,m=>m.k.nbPannesTot>0),fmt:pctF(0),min:0,max:100,cv:O.tmc.val*100},
  {id:"dispo",lib:"Disponibilité",val:fPct(K.dispo,2),st:kpiStatus(O.dispo,K.dispo,true),cible:O.dispo.label,vals:mm(k=>k.dispo*100,m=>m.actif),fmt:pctF(1),min:Math.max(0,Math.floor(Math.min(O.dispo.val*100,...mois.filter(m=>m.actif).map(m=>m.k.dispo*100))/5)*5-5),max:100,cv:O.dispo.val*100},
  {id:"lambda",lib:"λ = 1/MTBF",val:has?fSci(K.tauxPanne):"—",st:kpiStatus(O.tauxPanne,K.tauxPanne,has),cible:O.tauxPanne.label,vals:mois.map(m=>m.k.nbPannesTot>0?m.k.tauxPanne*sciUnit:null),fmt:(v)=>fNum(v,1),min:0,cv:O.tauxPanne.val*sciUnit,cibleLib:"Cible "+O.tauxPanne.label,unite:"×10⁻⁴ /h"},
  {id:"mu",lib:"μ = 1/MTTR",val:K.nbPannesRep>0?fSci(K.tauxRep):"—",st:kpiStatus(O.tauxRep,K.tauxRep,K.nbPannesRep>0),cible:O.tauxRep.label,vals:mois.map(m=>m.k.nbPannesRep>0?m.k.tauxRep:null),fmt:(v)=>fNum(v,2),min:0,cv:O.tauxRep.val,cibleLib:"Cible "+O.tauxRep.label,unite:"/h"},
  {id:"mtbf",lib:"MTBF",val:has?fH(K.mtbf,1):"—",vals:mois.map(m=>m.k.nbPannesTot>0?m.k.mtbf:null),fmt:(v)=>fNum(v,0),min:0,unite:"heures"},
  {id:"mttr",lib:"MTTR",val:has&&K.nbPannesRep>0?fH(K.mttr,3):"—",vals:mois.map(m=>m.k.nbPannesRep>0?m.k.mttr:null),fmt:(v)=>fNum(v,1),min:0,unite:"heures"},
 ];
 const CarteEvo=({e})=><CarteGraphe titre={e.lib} sousTitre={"Évolution mensuelle — 12 derniers mois"+(e.unite?" ("+e.unite+")":"")+(e.note?" · "+e.note:"")}>
  <div className="flex items-center justify-between gap-2 mb-1"><div className="text-2xl font-bold" style={{color:e.st&&e.st!=="na"?KPI_ST[e.st].fg:undefined}}>{e.val}</div>{e.st&&<StChip st={e.st}/>}</div>
  {e.cible&&<div className="text-xs text-slate-400 mb-1">Cible : {e.cible}</div>}
  <Courbe cats={cats} nom={e.lib} coul={SERIES[0]} vals={e.vals} fmt={e.fmt} min={e.min} max={e.max} cible={e.cv} cibleLib={e.cibleLib||(e.cible?"Cible "+e.cible:undefined)} hauteur={190}/>
 </CarteGraphe>;
 return (<div className="space-y-4" data-testid="kpi-graphiques">
  {kpiOk("syn:ing")&&<div data-testid="kpi-evo-ing"><KpiTitle sub="Charge préventive / corrective et efficience — valeur de la période et évolution sur 12 mois">Indicateurs d'ingénierie</KpiTitle>
   <div className="gm-charts">{evoIng.map(e=><CarteEvo key={e.id} e={e}/>)}</div></div>}
  {kpiOk("syn:real")&&<div data-testid="kpi-evo-real"><KpiTitle sub="Avancement des interventions et fiabilité du parc — valeur de la période et évolution sur 12 mois">Indicateurs de réalisation</KpiTitle>
   <div className="gm-charts">{evoReal.map(e=><CarteEvo key={e.id} e={e}/>)}</div></div>}
  <div className="gm-stats">
   <TuileChiffre lib="Disponibilité" valeur={fPct(K.dispo,2)} variation={varRel(K.dispo,Kprev.dispo)} statut={st(O.dispo,K.dispo,true)} note={"Cible "+O.dispo.label}/>
   <TuileChiffre lib="MTBF" valeur={has?fH(K.mtbf,1):"—"} variation={has?varRel(K.mtbf,Kprev.mtbf):null} note="Temps moyen entre pannes"/>
   <TuileChiffre lib="MTTR" valeur={has?fH(K.mttr,2):"—"} variation={has?varRel(K.mttr,Kprev.mttr):null} sens="baisse-bonne" note="Temps moyen de réparation"/>
   <TuileChiffre lib="Pannes" valeur={String(K.nbPannesTot)} variation={varRel(K.nbPannesTot,Kprev.nbPannesTot)} sens="baisse-bonne" note={K.nbPerturb+" avec perturbation"}/>
   <TuileChiffre lib="Réalisation préventif (TMP)" valeur={K.nbBTPrev?fPct(K.tmp,0):"—"} variation={K.nbBTPrev?varRel(K.tmp,Kprev.tmp):null} statut={st(O.tmp,K.tmp,K.nbBTPrev>0)} note={K.btClosed+" / "+K.btDenom+" OT clôturés"}/>
  </div>
  <div className="gm-charts">
   <CarteGraphe cls="is-wide" titre="Activité de maintenance — 12 derniers mois" sousTitre="Pannes (DI correctives) et OT préventifs, par mois">
    <BarresGroupees cats={cats} series={[{nom:"Pannes",coul:SERIES[0],vals:mois.map(m=>m.k.nbPannesTot)},{nom:"OT préventifs",coul:SERIES[1],vals:mois.map(m=>m.k.nbBTPrev)}]} fmt={(v)=>String(Math.round(v))}/>
   </CarteGraphe>
   <CarteGraphe titre="Charge préventive / corrective" sousTitre="Heures d'intervention sur la période">
    <Anneau parts={[{nom:"Préventif",val:K.hPrev,coul:SERIES[0]},{nom:"Correctif",val:K.hCorr,coul:SERIES[1]}]} centre={K.hTotal>0?fPct(K.tcp,0):"—"} centreLib="préventif" fmt={(v)=>fNum(v,1)+" h"}/>
   </CarteGraphe>
   <CarteGraphe titre={fSys?"Pannes par sous-système":"Pannes par système"} sousTitre="Nombre de pannes sur la période">
    <BarresH items={parGroupe} nom="Pannes" fmt={(v)=>String(v)}/>
   </CarteGraphe>
   <CarteGraphe titre="Top 10 des équipements en panne" sousTitre="Équipements les plus souvent en panne sur la période">
    <BarresH items={top} nom="Pannes" coul={SERIES[2]} fmt={(v)=>String(v)}/>
   </CarteGraphe>
   {unites.length>1 && <CarteGraphe titre="Disponibilité par unité" sousTitre="Comparatif des unités sur la période">
    <BarresH items={unites.map(x=>({lib:x.u,val:x.k.dispo*100,note:x.k.nbPannesTot+" panne(s) · cible "+x.o.dispo.label})).sort((a,b)=>a.val-b.val)} nom="Disponibilité" max={100} fmt={(v)=>v.toFixed(2).replace(".",",")+" %"}/>
   </CarteGraphe>}
  </div>
 </div>);
}
