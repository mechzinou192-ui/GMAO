// Indicateurs de performance (MTBF, MTTR, disponibilité, AMDEC…).
import React,{useState,useMemo,useEffect} from "react";
import {Anneau,BarresGroupees,BarresH,CarteGraphe,Courbe,SERIES,TuileChiffre} from "../ui/graphes.jsx";
import {FENETRE_MOIS,chargerHistorique,historiqueCharge} from "../sync.js";
import {exporterXlsx} from "../excel.js";
import {frDate} from "../lib/dates.js";
import {KPI_NORME_DEFAUT,KPI_SEUILS,kpiAmdec,kpiCalc,kpiCollect,kpiEquipements,kpiIsNew,kpiObj,kpiPeriode,kpiRH,kpiRating,kpiStatus,kpiStock} from "../lib/kpi.js";
import {UNITS} from "../lib/unites.js";
import {Btn,Card,ExportBtn,Inp,Segment,SubTabs} from "../ui/base.jsx";

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
 ["Ingénierie","MTTR","Σ durée d'intervention (OT) des pannes réparées ÷ nombre de pannes réparées","Pas de cible directe (suivi via μ = 1/MTTR)","DI « Traité » + durée d'intervention saisie sur l'OT lié","La durée vient du compte-rendu de l'OT (en heures), plus d'import de fichier en minutes."],
 ["Ingénierie","MTBF","(Temps théorique du parc − Indisponibilité cumulée) ÷ nombre de pannes","Pas de cible directe (suivi via λ = 1/MTBF)","DI correctives « Traité », « Transmis », « À Transmettre » (annulées exclues)","Parc = équipements distincts ayant une DI/OT sur la période (méthode d'origine) ; option : tous les équipements de l'arborescence de l'unité."],
 ["Ingénierie","Disponibilité","(Temps théorique du parc − Indisponibilité) ÷ Temps théorique du parc. Temps théorique = heures de la période × nombre d'équipements","> 97 % (nouvelles unités) · > 95 % (anciennes unités)","Date événement de la DI → clôture de l'OT","Indisponibilité = clôture OT − date événement DI, bornée à la période ; à défaut de date de fin ou si écart négatif : durée d'intervention + temps logistique ; panne > 1,5 × période ignorée."],
 ["Ingénierie","λ — Taux de panne (1/MTBF)","1 ÷ MTBF","≤ 5×10⁻⁴ /h (nouvelles) · ≤ 3×10⁻⁴ /h (anciennes)","Idem MTBF","—"],
 ["Ingénierie","μ — Taux de réparation (1/MTTR)","1 ÷ MTTR","≥ 4×10⁻¹ /h (nouvelles) · ≥ 2,5×10⁻¹ /h (anciennes)","Idem MTTR","—"],
 ["Réalisation","TCP — Taux de charge préventive","Heures préventives ÷ (heures préventives + correctives), heures = durée d'intervention + temps logistique","> 80 % (nouvelles) · > 70 % (anciennes)","OT préventifs (plan) / OT correctifs (DI)","Les OT préventifs sont datés par leur date de génération (à défaut clôture, ou date du plan)."],
 ["Réalisation","TCC — Taux de charge corrective","Heures correctives ÷ (heures préventives + correctives)","< 20 % (nouvelles) · < 30 % (anciennes)","Idem TCP","—"],
 ["Réalisation","TMP — Taux de maintenance préventive","OT préventifs clôturés ÷ OT préventifs générés (hors annulés)","100 %","OT préventifs : état « Clôturé » / « En cours » / « En attente pièce »","Seuls les OT déjà générés comptent (comme dans l'ancienne appli)."],
 ["Réalisation","TMC — Taux de maintenance corrective","DI correctives traitées ÷ (traitées + transmises + à transmettre)","> 90 % (nouvelles) · > 85 % (anciennes)","DI : état « Traité » / « Transmis » / « À Transmettre »","Le cas « travaux divers » n'existe plus dans cette GMAO."],
 ["Taux","Taux de panne théorique","Heures correctives ÷ temps théorique du parc","Bon < 0,5 % · alerte 0,5–1 % · critique ≥ 1 %","OT correctifs","—"],
 ["Taux","Taux d'intervention (indisponibilité)","Indisponibilité cumulée ÷ temps théorique du parc","Bon < 1 % · alerte 1–5 % · critique ≥ 5 %","DI + OT","—"],
 ["Taux","Taux de récurrence","Pannes ayant un même équipement + même motif (≥ 2 fois) ÷ pannes totales","Bon < 15 % · alerte 15–30 % · critique ≥ 30 %","Motif = champ « Panne » de l'OT (à défaut : désignation de la DI)","Le motif est un champ saisi, plus de détection par analyse de texte."],
 ["Équipements","Catégories d'équipement","Cat. 1 = préventif ET correctif · Cat. 2 = préventif seul · Cat. 3 = correctif seul","—","OT / DI par équipement","Seuil « OT total » réglable pour surligner les équipements très sollicités."],
 ["Équipements","Taux logistique / d'intervention (correctif)","Logistique ÷ (durée + logistique) · Durée ÷ (durée + logistique)","—","OT correctifs","—"],
 ["RH","Taux d'occupation d'un technicien","Charge réelle ÷ Norme. Norme = 108 h/mois × (jours de la période ÷ 30)","Surcharge > 105 % · équilibre 75–105 % · sous-charge < 75 %","Temps saisi par intervenant sur chaque OT","On utilise le temps réel de chaque intervenant (et non la durée globale de l'intervention répartie)."],
 ["RH","Besoin en effectif","Théorique = Charge totale ÷ Norme · Essentiel = arrondi supérieur · Écart = Essentiel − nb techniciens","—","Intervenants ayant des heures sur la période","—"],
 ["RH","Taux d'efficience","Charge totale calculée GMAO ÷ Charge RAM déclarée","≈ 100 %","Charge RAM saisie manuellement","Saisie sur la période affichée."],
 ["Stock","Coût de consommation","Σ (quantité sortie × prix) ; coût moyen/mois = coût total ÷ nombre de mois de la période","—","Mouvements « Sortie » du magasin","Prix = prix actuel de l'article (pas d'historique de prix dans cette GMAO)."],
 ["Stock","Stock de sécurité","Conso. moyenne mensuelle × délai fournisseur (3 mois par défaut) ; alerte si stock < stock de sécurité","Stock ≥ stock de sécurité","Sorties de la période + stock actuel","Comparé aussi au seuil minimum saisi sur l'article."],
 ["Stock","Stock dormant / rotation","Dormant = aucune sortie depuis ≥ 365 jours et valeur de stock > 0 ; rotation = conso. des 12 derniers mois","Aucun article dormant","Mouvements + stock × prix","—"],
 ["Fiabilité","Criticité AMDEC","C = G × P × ND. P : occurrences/an extrapolées (<1 : 1 · <4 : 2 · <52 : 3 · ≥52 : 4) · G : arrêt moyen en min (<2 : 1 · <20 : 2 · <120 : 3 · ≥120 : 4) · ND : détection","Majeure ≥ 16 · Modérée ≥ 10 · Acceptable < 10","DI correctives + gravité / détection saisies sur l'OT","ND = moyenne saisie sur les OT (2 par défaut si absente) ; G au choix : durée d'arrêt ou gravité saisie."],
 ["Fiabilité","Stratégie recommandée","Arbre de décision : C ≥ 16 ou G = 4 → MBF/RCM · G = 1 et C < 10 → Corrective · ND = 1 → Basée sur l'état · P ≥ 3 → Proactive · ND ≤ 2 → TPM · sinon Préventive","—","Résultat de l'AMDEC","—"],
];

export function IndicateursPage({unit,dis,bts,planning,equipements,pieces,systemsList,treeStruct,kpiOk=()=>true}){
 const pad=(n)=>String(n).padStart(2,"0");
 const ymd=(d)=>d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
 const now=new Date(); const d30=new Date(now); d30.setDate(d30.getDate()-29);
 const [subRaw,setSub]=useState("Tableau de bord");
 const [start,setStart]=useState(ymd(d30));
 const [end,setEnd]=useState(ymd(now));
 const [histo,setHisto]=useState(historiqueCharge()); const [histoBusy,setHistoBusy]=useState(false);
 const limHisto=(()=>{const d=new Date(now);d.setMonth(d.getMonth()-FENETRE_MOIS);return ymd(d);})();
 const [normeBase,setNormeBase]=useState(KPI_NORME_DEFAUT);
 const [chargeRAM,setChargeRAM]=useState("");
 const [delai,setDelai]=useState(3);
 const [seuilBT,setSeuilBT]=useState(0);
 const [parcMode,setParcMode]=useState("Équipements avec DI/OT");
 const [groupBy,setGroupBy]=useState("Équipement");
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
 const rh=useMemo(()=>kpiRH(ctx.corr,ctx.prev,per,Number(normeBase)||KPI_NORME_DEFAUT,Number(chargeRAM)||0),[ctx,per,normeBase,chargeRAM]);
 const stk=useMemo(()=>kpiStock(pieces,per,Math.max(0.1,Number(delai)||3),new Date()),[pieces,per,delai]);
 const amdec=useMemo(()=>kpiAmdec(ctx.corr,per,{groupBy,gravBase,equipements,nomSys,nomSub}),[ctx,per,groupBy,gravBase,equipements,systemsList,treeStruct]);
 const unites=useMemo(()=>UNITS.map(u=>{const c=kpiCollect(u,{dis,bts,planning,equipements},per,parcMode,{sys:fSys,sub:fSub});return {u,c,k:kpiCalc(c.corr,c.prev,per,c.nbEquip),o:kpiObj(u)};}).filter(x=>x.c.corr.length+x.c.prev.length>0),[dis,bts,planning,equipements,per,parcMode,fSys,fSub]);
 const perLabel=frDate(start)+" → "+frDate(end)+" ("+per.days+" j · "+per.hours+" h)"+(fltActif?" — filtre : "+fltLabel:"");
 const ratePanne=kpiRating(K.lambdaTheo*100,...KPI_SEUILS.tauxPanne), rateInterv=kpiRating(K.tauxInterv*100,...KPI_SEUILS.tauxInterv), rateRec=kpiRating(K.tauxRecurrence*100,...KPI_SEUILS.recurrence);
 const lblRate=(r)=>r==="ok"?"Bon":r==="warn"?"Seuil d'alerte":"Seuil critique";

 /* ----- Exports ----- */
 const statTxt=(st)=>(KPI_ST[st]||KPI_ST.na).t;
 const exportSynthese=()=>exporterXlsx({fichier:"Indicateurs_synthese_"+unit,feuilles:[
  {nom:"Synthèse",titre:"Indicateurs de performance — "+unit+" — "+perLabel,colonnes:[{h:"Famille"},{h:"Indicateur"},{h:"Valeur"},{h:"Cible"},{h:"Statut"}],lignes:[
   ["Ingénierie","MTTR",hasCorr?fH(K.mttr,3):"—","—","—"],
   ["Ingénierie","MTBF",hasCorr?fH(K.mtbf,1):"—","—","—"],
   ["Ingénierie","Disponibilité",fPct(K.dispo,2),O.dispo.label,statTxt(kpiStatus(O.dispo,K.dispo,true))],
   ["Ingénierie","λ = 1/MTBF (/h)",fSci(K.tauxPanne),O.tauxPanne.label,statTxt(kpiStatus(O.tauxPanne,K.tauxPanne,hasCorr))],
   ["Ingénierie","μ = 1/MTTR (/h)",fSci(K.tauxRep),O.tauxRep.label,statTxt(kpiStatus(O.tauxRep,K.tauxRep,K.nbPannesRep>0))],
   ["Réalisation","TCP",fPct(K.tcp),O.tcp.label,statTxt(kpiStatus(O.tcp,K.tcp,hasH))],
   ["Réalisation","TCC",fPct(K.tcc),O.tcc.label,statTxt(kpiStatus(O.tcc,K.tcc,hasH))],
   ["Réalisation","TMP",fPct(K.tmp),O.tmp.label,statTxt(kpiStatus(O.tmp,K.tmp,hasPrev))],
   ["Réalisation","TMC",fPct(K.tmc),O.tmc.label,statTxt(kpiStatus(O.tmc,K.tmc,hasCorr))],
   ["Taux","Taux de panne théorique",fPct(K.lambdaTheo,2),"< 0,5 % Bon · < 1 % alerte",lblRate(ratePanne)],
   ["Taux","Taux d'intervention",fPct(K.tauxInterv,2),"< 1 % Bon · < 5 % alerte",lblRate(rateInterv)],
   ["Taux","Taux de récurrence",fPct(K.tauxRecurrence),"< 15 % Bon · < 30 % alerte",lblRate(rateRec)]]},
  {nom:"Comparatif unités",titre:"Comparatif des unités — "+perLabel,colonnes:[{h:"Unité"},{h:"Pannes",t:"num"},{h:"MTTR (h)",t:"num"},{h:"MTBF (h)",t:"num"},{h:"Disponibilité (%)",t:"num"},{h:"TCP (%)",t:"num"},{h:"TCC (%)",t:"num"},{h:"TMP (%)",t:"num"},{h:"TMC (%)",t:"num"}],
   lignes:unites.map(x=>[x.u,x.k.nbPannesTot,+x.k.mttr.toFixed(3),+x.k.mtbf.toFixed(1),+(x.k.dispo*100).toFixed(2),+(x.k.tcp*100).toFixed(1),+(x.k.tcc*100).toFixed(1),+(x.k.tmp*100).toFixed(1),+(x.k.tmc*100).toFixed(1)])}]});
 const exportEquip=()=>exporterXlsx({fichier:"Indicateurs_equipements_"+unit,feuilles:[{nom:"Équipements",titre:"Indicateurs par équipement — "+unit+" — "+perLabel,
  colonnes:[{h:"Code"},{h:"Équipement"},{h:"Catégorie"},{h:"OT préventifs",t:"num"},{h:"DI correctives",t:"num"},{h:"Pannes",t:"num"},{h:"MTTR (h)",t:"num"},{h:"MTBF (h)",t:"num"},{h:"Disponibilité (%)",t:"num"},{h:"Taux logistique corr. (%)",t:"num"}],
  lignes:eqRows.map(e=>[e.code,e.nom,"Cat. "+e.cat,e.nbPrev,e.nbCorr,e.k.nbPannesTot,+e.k.mttr.toFixed(3),+e.k.mtbf.toFixed(1),+(e.k.dispo*100).toFixed(2),+(e.tauxLogCorr*100).toFixed(1)])}]});
 const exportRH=()=>exporterXlsx({fichier:"Charge_RH_"+unit,feuilles:[{nom:"Charge RH",titre:"Charge et taux d'occupation — "+unit+" — "+perLabel+" — norme "+fNum(rh.norme)+" h",
  colonnes:[{h:"Technicien"},{h:"Fonction"},{h:"Interventions",t:"num"},{h:"Charge réelle (h)",t:"num"},{h:"Norme (h)",t:"num"},{h:"Taux d'occupation (%)",t:"num"},{h:"Écart (h)",t:"num"},{h:"Statut"}],
  lignes:rh.techs.map(t=>[t.technicien,t.fonction,t.nbInterventions,+t.chargeReelle.toFixed(2),+t.norme.toFixed(1),+(t.taux*100).toFixed(1),+t.delta.toFixed(1),t.statut])}]});
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
 const SUBS=["Tableau de bord","Synthèse","Équipements","Ressources humaines","Stock","Criticité (AMDEC)","Référentiel"].filter(x=>kpiOk(x==="Tableau de bord"?"Synthèse":x));
 const sub=SUBS.includes(subRaw)?subRaw:(SUBS[0]||"");
 const eqSeuil=Number(seuilBT)||0;
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

  {sub==="Tableau de bord" && <GraphiquesKPI unit={unit} dis={dis} bts={bts} planning={planning} equipements={equipements} per={per} start={start} end={end} parcMode={parcMode} flt={flt} fSys={fSys} subOpts={subOpts} sysOpts={sysOpts} K={K} O={O} eqRows={eqRows} unites={unites}/>}
  {sub==="Synthèse" && <div className="space-y-4">
   <div className="flex justify-between items-center"><div className="text-xs text-slate-500">{K.nbDI} DI correctives · {K.nbBTPrev} OT préventifs sur la période{K.nbPerturb>0?" · "+K.nbPerturb+" avec perturbation d'exploitation":""}</div><ExportBtn onClick={exportSynthese}/></div>
   {kpiOk("syn:ing")&&<div><KpiTitle sub="Fiabilité du parc (méthode d'origine : MTTR / MTBF / disponibilité / λ / μ)">Indicateurs d'ingénierie</KpiTitle>
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
     <KpiCard label="MTTR" value={hasCorr&&K.nbPannesRep>0?fH(K.mttr,3):"—"} sub={K.nbPannesRep+" panne(s) réparée(s)"}/>
     <KpiCard label="MTBF" value={hasCorr?fH(K.mtbf,1):"—"} sub={K.nbPannesTot+" panne(s) · indispo. "+fH(K.indispoH,1)}/>
     <KpiCard label="Disponibilité" value={fPct(K.dispo,2)} st={kpiStatus(O.dispo,K.dispo,true)} cible={O.dispo.label} sub={"TBF "+fH(K.tbf,0)+" / "+fH(K.hoursFlotte,0)}/>
     <KpiCard label="λ = 1/MTBF" value={hasCorr?fSci(K.tauxPanne):"—"} st={kpiStatus(O.tauxPanne,K.tauxPanne,hasCorr)} cible={O.tauxPanne.label} sub="taux de panne"/>
     <KpiCard label="μ = 1/MTTR" value={K.nbPannesRep>0?fSci(K.tauxRep):"—"} st={kpiStatus(O.tauxRep,K.tauxRep,K.nbPannesRep>0)} cible={O.tauxRep.label} sub="taux de réparation"/>
    </div></div>}
   {kpiOk("syn:real")&&<div><KpiTitle sub="Répartition de la charge et avancement des interventions">Indicateurs de réalisation</KpiTitle>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
     <KpiCard label="TCP — charge préventive" value={hasH?fPct(K.tcp):"—"} st={kpiStatus(O.tcp,K.tcp,hasH)} cible={O.tcp.label} sub={fH(K.hPrev,1)+" sur "+fH(K.hTotal,1)}/>
     <KpiCard label="TCC — charge corrective" value={hasH?fPct(K.tcc):"—"} st={kpiStatus(O.tcc,K.tcc,hasH)} cible={O.tcc.label} sub={fH(K.hCorr,1)+" sur "+fH(K.hTotal,1)}/>
     <KpiCard label="TMP — maintenance préventive" value={hasPrev?fPct(K.tmp):"—"} st={kpiStatus(O.tmp,K.tmp,hasPrev)} cible={O.tmp.label} sub={K.btClosed+" OT clôturé(s) / "+K.btDenom}/>
     <KpiCard label="TMC — maintenance corrective" value={hasCorr?fPct(K.tmc):"—"} st={kpiStatus(O.tmc,K.tmc,hasCorr)} cible={O.tmc.label} sub={K.diDone+" DI traitée(s) / "+K.diDenom}/>
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
     <div><div className="text-xs text-slate-400">Charge RAM déclarée sur la période (h)</div><Inp type="number" min="0" value={chargeRAM} placeholder="optionnel" onChange={e=>setChargeRAM(e.target.value)}/></div>
    </div><ExportBtn onClick={exportRH}/>
   </div>
   <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
    <KpiCard label="Norme de la période" value={fH(rh.norme,1)} sub={normeBase+" h × "+per.days+" j / 30"}/>
    <KpiCard label="Charge totale (GMAO)" value={fH(rh.total,1)} sub={rh.nbTech+" technicien(s)"}/>
    <KpiCard label="Taux moyen d'occupation" value={rh.nbTech>0?fPct(rh.tauxMoyen):"—"} sub={rh.nbSurcharge+" surcharge · "+rh.nbEquil+" équilibre · "+rh.nbSous+" sous-charge"}/>
    <KpiCard label="Besoin en effectif" value={rh.nbTech>0?rh.besoin:"—"} sub={rh.nbTech>0?"théorique "+fNum(rh.besoinTheo,2)+" · écart "+(rh.delta>0?"+":"")+rh.delta:""}/>
   </div>
   {rh.efficience!==null && <KpiCard label="Taux d'efficience" value={fPct(rh.efficience)} sub={"Charge GMAO "+fH(rh.total,1)+" / Charge RAM "+fH(Number(chargeRAM),1)}/>}
   <Card>
    {rh.techs.length===0?<KpiEmpty>Aucune heure d'intervenant saisie sur la période (le temps se renseigne à la clôture de l'OT).</KpiEmpty>:
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-slate-400 text-left"><Th>Technicien</Th><Th>Interventions</Th><Th>Charge réelle</Th><Th>Norme</Th><Th>Taux d'occupation</Th><Th>Écart</Th><Th>Statut</Th></tr></thead>
    <tbody>{rh.techs.map(t=><tr key={t.technicien} className="border-t border-slate-700"><td className="py-1.5">{t.technicien}<br/><span className="text-xs text-slate-400">{t.fonction}</span></td><td>{t.nbInterventions}</td><td>{fH(t.chargeReelle,1)}</td><td>{fH(t.norme,1)}</td>
     <td><div className="flex items-center gap-2"><div className="w-24 h-2 rounded bg-slate-700 overflow-hidden"><div style={{width:Math.min(100,t.taux*100)+"%",background:t.statut==="surcharge"?"#be123c":t.statut==="sous-charge"?"#b45309":"#047857"}} className="h-2"/></div>{fPct(t.taux)}</div></td>
     <td>{(t.delta>0?"+":"")+fNum(t.delta)} h</td><td><StChip st={t.statut==="surcharge"?"bad":t.statut==="sous-charge"?"warn":"ok"} txt={t.statut}/></td></tr>)}</tbody></table></div>}
   </Card>
   <div className="text-xs text-slate-500">Statuts : surcharge &gt; 105 % · équilibre 75–105 % · sous-charge &lt; 75 %. La charge est le temps saisi par chaque intervenant sur les OT de l'unité.</div>
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

  {sub==="Référentiel" && <div className="space-y-3">
   <div className="flex justify-between items-center"><div className="text-xs text-slate-500">Formules, cibles et correspondance avec les données de cette GMAO.</div><ExportBtn onClick={exportRef}/></div>
   <Card><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-slate-400 text-left"><Th>Famille</Th><Th>Indicateur</Th><Th>Formule</Th><Th>Cible</Th><Th>Source dans la GMAO</Th><Th>Adaptation</Th></tr></thead>
   <tbody>{KPI_REFERENTIEL.map((r,i)=><tr key={i} className="border-t border-slate-700 align-top"><td className="py-1.5 text-xs text-slate-400">{r[0]}</td><td className="font-medium text-slate-200">{r[1]}</td><td className="text-xs text-slate-400 max-w-sm">{r[2]}</td><td className="text-xs text-slate-400 max-w-[200px]">{r[3]}</td><td className="text-xs text-slate-400 max-w-[220px]">{r[4]}</td><td className="text-xs text-slate-500 max-w-xs">{r[5]}</td></tr>)}</tbody></table></div></Card>
  </div>}
 </div>);
}

/* ===== Tableau de bord graphique des indicateurs ===== */
const MOIS_COURTS=["janv.","févr.","mars","avr.","mai","juin","juil.","août","sept.","oct.","nov.","déc."];
const ymdD=(d)=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
const varRel=(a,b)=>(b>0&&Number.isFinite(a)&&Number.isFinite(b))?(a-b)/b:null;
export function GraphiquesKPI({unit,dis,bts,planning,equipements,per,start,end,parcMode,flt,fSys,subOpts,sysOpts,K,O,eqRows,unites}){
 const data={dis,bts,planning,equipements};
 // période précédente de même durée
 const Kprev=useMemo(()=>{const s=new Date(per.start);s.setDate(s.getDate()-per.days);const e=new Date(per.start);e.setDate(e.getDate()-1);
  const p=kpiPeriode(ymdD(s),ymdD(e)); const c=kpiCollect(unit,data,p,parcMode,flt); return kpiCalc(c.corr,c.prev,p,c.nbEquip);},[unit,dis,bts,planning,equipements,per,parcMode,flt]);
 // 12 mois glissants se terminant au mois de fin de période
 const mois=useMemo(()=>{const fin=new Date(per.end);const out=[];
  for(let k=11;k>=0;k--){const a=new Date(fin.getFullYear(),fin.getMonth()-k,1);const b=new Date(fin.getFullYear(),fin.getMonth()-k+1,0);
   const p=kpiPeriode(ymdD(a),ymdD(b)); const c=kpiCollect(unit,data,p,parcMode,flt); const k2=kpiCalc(c.corr,c.prev,p,c.nbEquip);
   out.push({lib:MOIS_COURTS[a.getMonth()]+(a.getMonth()===0||k===11?" "+String(a.getFullYear()).slice(2):""),k:k2,actif:c.corr.length+c.prev.length>0});}
  return out;},[unit,dis,bts,planning,equipements,per,parcMode,flt]);
 const parGroupe=useMemo(()=>{
  const groupes=fSys?subOpts.map(s=>({code:s.code,lib:s.code+" — "+s.sub,f:{...flt,sub:s.code,eq:"",se:""}})):sysOpts.map(([c,n])=>({code:c,lib:c+" — "+n,f:{sys:c,sub:"",eq:"",se:""}}));
  return groupes.map(g=>{const c=kpiCollect(unit,data,per,parcMode,g.f);const k=kpiCalc(c.corr,c.prev,per,c.nbEquip);return {lib:g.lib,val:k.nbPannesTot,note:"MTTR "+fH(k.mttr,2)+" · disponibilité "+fPct(k.dispo,2)};})
   .filter(x=>x.val>0).sort((a,b)=>b.val-a.val);
 },[unit,dis,bts,planning,equipements,per,parcMode,flt,fSys,subOpts,sysOpts]);
 const top=eqRows.filter(e=>e.k.nbPannesTot>0).slice(0,10).map(e=>({lib:e.code,sub:e.nom,val:e.k.nbPannesTot,note:"MTTR "+fH(e.k.mttr,2)+" · disponibilité "+fPct(e.k.dispo,2)}));
 const st=(o,v,has)=>{const s=kpiStatus(o,v,has);return s==="ok"?"ok":s==="warn"?"warn":s==="bad"?"bad":"";};
 const has=K.nbPannesTot>0;
 const cats=mois.map(m=>m.lib);
 return (<div className="space-y-4" data-testid="kpi-graphiques">
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
   <CarteGraphe titre="Disponibilité mensuelle" sousTitre="Part du temps où le parc est disponible">
    <Courbe cats={cats} nom="Disponibilité" vals={mois.map(m=>m.actif?m.k.dispo*100:null)} fmt={(v)=>v.toFixed(1).replace(".",",")+" %"} min={Math.max(0,Math.floor(Math.min(O.dispo.val*100,...mois.filter(m=>m.actif).map(m=>m.k.dispo*100))/5)*5-5)} max={100} cible={O.dispo.val*100} cibleLib={"Cible "+O.dispo.label}/>
   </CarteGraphe>
   <CarteGraphe titre="MTTR mensuel" sousTitre="Temps moyen de réparation (heures), mois avec pannes réparées">
    <Courbe cats={cats} nom="MTTR" coul={SERIES[2]} vals={mois.map(m=>m.k.nbPannesRep>0?m.k.mttr:null)} fmt={(v)=>v.toFixed(1).replace(".",",")+" h"}/>
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
