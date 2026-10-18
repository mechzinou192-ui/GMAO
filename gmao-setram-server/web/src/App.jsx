import React,{useState,useMemo,useEffect,useRef} from "react";
import {api} from "./api.js";
import {useSynced,hasPending,flushAll,REG} from "./sync.js";
import {reserverNumeros} from "./numbering.js";
import ImportDonnees from "./ImportDonnees.jsx";
import PiecesJointes from "./PiecesJointes.jsx";
import {SYSTEMS_SEED,TREE_STRUCT_SEED} from "./lib/referentiels-defaut.js";
import {codeDepuisAdresse} from "./lib/qr.js";
import {imprimerEtiquettes,MAX_ETIQUETTES} from "./etiquettes.js";
import {btImprimableHtml} from "./lib/impression.js";
import {imprimerHtml} from "./imprimer.js";
import {CDC_ETATS,CONTRAT_SEUIL_MOIS,HAB_SEUIL_MOIS,contratInfo,expStatus,habFin,habListe,habStatus} from "./lib/echeances.js";
import {FERIES_DEFAUT,JOURS_WEEKEND,congeAt,ferieAt,libConge,nonOuvre} from "./lib/jours.js";
import {JOURS,MOIS,addMonths,fmtD,frDate,occurrence,padN,parseD,todayStr} from "./lib/dates.js";
import {KPI_NORME_DEFAUT,KPI_SEUILS,kpiAmdec,kpiCalc,kpiCollect,kpiEqInfo,kpiEquipements,kpiIsNew,kpiObj,kpiPeriode,kpiRH,kpiRating,kpiStatus,kpiStock,kpiUnitOf} from "./lib/kpi.js";
import {PERIODES,avancement,buildBTPrev,datesFuturesPlan,datesPlanDansPlage,isPeriodePlan,occurrencesPlan,prochaineEcheance,tRes} from "./lib/preventif.js";
import {UNITS,UNIT_ABBR} from "./lib/unites.js";
import {coutBT} from "./lib/couts.js";
import {interDuSysteme,interPourSys,systemeDe} from "./lib/equipes.js";
import {XL_LOGO,xlToDate,exporterXlsx} from "./excel.js";
const Icon=({p,cls})=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={cls||"w-4 h-4"}>{p}</svg>;
const I={
 menu:<Icon p={<path d="M4 6h16M4 12h16M4 18h16"/>}/>,
 board:<Icon p={<><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></>}/>,
 tree:<Icon p={<><circle cx="12" cy="4" r="2"/><circle cx="6" cy="14" r="2"/><circle cx="18" cy="14" r="2"/><path d="M12 6v4M12 10 6 12M12 10l6 2M6 16v4M18 16v4"/></>}/>,
 cal:<Icon p={<><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></>}/>,
 store:<Icon p={<><path d="M3 7l2-4h14l2 4M3 7v13h18V7M3 7h18"/><path d="M9 21v-6h6v6"/></>}/>,
 team:<Icon p={<><circle cx="9" cy="7" r="3"/><path d="M2 21v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2"/><circle cx="18" cy="8" r="2.5"/><path d="M16 21v-1a4 4 0 0 1 4-4h1"/></>}/>,
 plus:<Icon p={<path d="M12 5v14M5 12h14"/>}/>,
 x:<Icon p={<path d="M18 6 6 18M6 6l12 12"/>}/>,
 alert:<Icon p={<><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></>}/>,
 check:<Icon p={<path d="M20 6 9 17l-5-5"/>}/>,
 chart:<Icon p={<path d="M3 3v18h18M7 15l4-4 3 3 5-6"/>}/>,
};
const state = (c)=>({
  "À Transmettre":"bg-slate-600 text-slate-100","Transmis":"bg-amber-600 text-amber-50","Traité":"bg-emerald-600 text-emerald-50",
  "À Faire":"bg-amber-600 text-amber-50","En attente pièce":"bg-rose-600 text-rose-50","Clôturé":"bg-emerald-600 text-emerald-50",
  "Planifié":"bg-sky-600 text-sky-50","En cours":"bg-amber-600 text-amber-50","Réalisé":"bg-emerald-600 text-emerald-50","En retard":"bg-rose-600 text-rose-50",
  "Généré":"bg-slate-600 text-slate-100","Terminé":"bg-slate-500 text-slate-100","Envoyé Fournisseur":"bg-sky-600 text-sky-50","En cours d'expédition":"bg-amber-600 text-amber-50","Reçu":"bg-emerald-600 text-emerald-50",
  "Transmis au Magasinier":"bg-amber-600 text-amber-50","BS généré":"bg-sky-600 text-sky-50","À traiter":"bg-amber-600 text-amber-50","Annulé":"bg-slate-500 text-slate-100",
}[c]||"bg-slate-600");
const Badge=({t})=><span className={"px-2 py-0.5 rounded-full text-xs font-medium "+state(t)}>{t}</span>;
const Card=({children,cls})=><div className={"bg-slate-800/60 border border-slate-700 rounded-xl p-4 "+(cls||"")}>{children}</div>;
const Btn=({children,onClick,cls})=><button onClick={onClick} className={"px-3 py-2 md:py-1.5 rounded-lg text-sm font-medium transition "+(cls||"bg-sky-600 hover:bg-sky-500 text-white")}>{children}</button>;
const ExportBtn=({onClick,label})=>{const [busy,setBusy]=useState(false);
 return <Btn cls="bg-slate-700 hover:bg-slate-600" onClick={async()=>{if(busy)return;setBusy(true);try{await onClick();}finally{setBusy(false);}}}><span className="flex items-center gap-1">⬇ {busy?"Export…":(label||"Exporter Excel")}</span></Btn>;};
const fmtFourn=(l)=>(l||[]).filter(Boolean).map(f=>f.nom+(f.tel?" — "+f.tel:"")).join("\n");
const ouiNon=(b)=>b?"Oui":"Non";
const Modal=({title,onClose,children,wide})=>(
 <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-2 sm:p-4" onClick={onClose}>
  <div className={"bg-slate-800 border border-slate-700 rounded-xl w-full "+(wide==="xl"?"max-w-5xl":wide?"max-w-3xl":"max-w-lg")+" p-3 sm:p-5 max-h-[92vh] sm:max-h-[85vh] overflow-y-auto"} onClick={e=>e.stopPropagation()}>
   <div className="flex justify-between items-center mb-3"><h3 className="text-slate-100 font-semibold">{title}</h3><button onClick={onClose} className="text-slate-400">{I.x}</button></div>
   {children}
  </div></div>);
const Field=({label,children})=><label className="block text-xs text-slate-400 mb-1 mt-2">{label}{children}</label>;
const Inp=(p)=><input {...p} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-100 mt-1"/>;

const typeLabel=(d)=>d.typeMaintenance==="Corrective"?"Corrective — "+(d.sousType||"Curative"):(d.typeMaintenance||"Corrective");
function GmaoApp({session,onLogout}){
 const sa=session.superAdmin; const user=session.nom;
 const unitsOk=sa?UNITS:UNITS.filter(u=>session.droits[u]);
 const [unit,setUnit]=useState(unitsOk[0]||"");
 const grant=sa?{systems:[],volets:[]}:(session.droits[unit]||{systems:[],volets:[]});
 const sysOk=(code)=>sa||grant.systems.includes(code);
 const kpiOk=(k)=>sa||!grant.kpi||grant.kpi.includes(k); // kpi absent = tout autorisé (comptes existants)
 const tabOk=(i)=>i===7?sa:(sa||grant.volets.includes(i));
 const [tabRaw,setTabRaw]=useState(0);
 const tab=tabOk(tabRaw)?tabRaw:Math.max(0,[0,1,2,3,4,5,6,7].findIndex(tabOk));
 const setTab=(i)=>{if(tabOk(i))setTabRaw(i);};
 const mobile=()=>typeof window!=="undefined"&&window.innerWidth<768;
 const [sidebar,setSidebar]=useState(()=>!mobile());   // téléphone : menu fermé au démarrage
 const allerA=(i)=>{setTab(i); if(mobile()) setSidebar(false);};
 // Une seule création à la fois : évite un double clic pendant que le serveur attribue le numéro
 const creating=useRef(false);
 const unSeul=(fn)=>async(...a)=>{ if(creating.current) return; creating.current=true; try{ return await fn(...a); } finally{ creating.current=false; } };
 const numeros=reserverNumeros;
 const [diModal,setDiModal]=useState(null);
 const [btModal,setBtModal]=useState(null);
 const [diDetail,setDiDetail]=useState(null);
 const [btDetail,setBtDetail]=useState(null);
 const [dsModal,setDsModal]=useState(null);
 const [brModal,setBrModal]=useState(false);
 const [pieceForm,setPieceForm]=useState(null);
 const [achatModal,setAchatModal]=useState(null);
 const [dechargeModal,setDechargeModal]=useState(null);
 const [decharges,setDecharges,sDch]=useSynced("decharges");
 const [pieceModal,setPieceModal]=useState(null);
 const [equipModal,setEquipModal]=useState(null);
 const [equipDetail,setEquipDetail]=useState(null);
 const [sousEquipModal,setSousEquipModal]=useState(null);
 const [sousEquipDetail,setSousEquipDetail]=useState(null);
 const [equipements,setEquipements,sEq]=useSynced("equipements");
 const [systemsList,setSystemsList,sSys]=useSynced("systemes",{defaults:SYSTEMS_SEED,sa:session.superAdmin});
 const [treeStruct,setTreeStruct,sTree]=useSynced("arborescence",{defaults:TREE_STRUCT_SEED,sa:session.superAdmin});
 const [systemModal,setSystemModal]=useState(null);
 const [subSystemModal,setSubSystemModal]=useState(null);
 const [mesureList,setMesureList,sMes]=useSynced("mesures");
 const [mesureModal,setMesureModal]=useState(null);
 const [ctrlList,setCtrlList,sCtrl]=useSynced("controles");
 const [organismes,setOrganismes,sOrg]=useSynced("organismes",{sa:session.superAdmin});
 const [orgModal,setOrgModal]=useState(null);
 const [prestataires,setPrestataires,sPre]=useSynced("prestataires");
 const [prestaModal,setPrestaModal]=useState(null);
 const [ctrlModal,setCtrlModal]=useState(null);
 const [motifModal,setMotifModal]=useState(null);

 function saveSystem(f){
  if(f.mode==="add"){
   const c=(f.code||"").toUpperCase().trim(); if(!c) return;
   setSystemsList(s=>[...s,[c,f.nom||c]]);
   setTreeStruct(t=>({...t,[c]:[]}));
  } else {
   setSystemsList(s=>s.map(([c,n])=>c===f.code?[c,f.nom]:[c,n]));
  }
  setSystemModal(null);
 }
 function saveSubSystem(f){
  if(f.mode==="add"){
   const c=(f.code||"").toUpperCase().trim(); if(!c) return;
   setTreeStruct(t=>({...t,[f.systemCode]:[...(t[f.systemCode]||[]),{code:c,sub:f.nom||c}]}));
  } else {
   setTreeStruct(t=>({...t,[f.systemCode]:t[f.systemCode].map(s=>s.code===f.code?{...s,sub:f.nom}:s)}));
  }
  setSubSystemModal(null);
 }

 function saveEquipement(payload){
  setEquipements(list=>{
   const exists=list.some(e=>e.code===payload.code);
   if(exists) return list.map(e=>e.code===payload.code?{...e,...payload}:e);
   return [...list,{...payload,sousEquip:[]}];
  });
  setEquipModal(null);
 }
 function saveSousEquipement(payload){
  const {parentCode,...se}=payload;
  setEquipements(list=>list.map(e=>{
   if(e.code!==parentCode) return e;
   const cur=e.sousEquip||[];
   const exists=cur.some(x=>x.code===se.code);
   return {...e,sousEquip:exists?cur.map(x=>x.code===se.code?{...x,...se}:x):[...cur,se]};
  }));
  setSousEquipModal(null);
 }
 function removeSousEquip(parentCode,code){
  setEquipements(list=>list.map(e=>e.code===parentCode?{...e,sousEquip:(e.sousEquip||[]).filter(x=>x.code!==code)}:e));
 }

 function saveMesure(payload){
  setMesureList(list=>{
   const exists=list.some(m=>m.code===payload.code);
   if(exists) return list.map(m=>m.code===payload.code?{...m,...payload}:m);
   return [...list,payload];
  });
  setMesureModal(null);
 }

 function saveCtrl(payload){
  setCtrlList(list=>{
   const exists=list.some(c=>c.code===payload.code);
   if(exists) return list.map(c=>c.code===payload.code?{...c,...payload}:c);
   return [...list,payload];
  });
  setCtrlModal(null);
 }

 function saveOrg(payload){
  setOrganismes(list=>list.some(o=>o.code===payload.code)?list.map(o=>o.code===payload.code?{...o,...payload}:o):[...list,payload]);
  setOrgModal(null);
 }
 function savePresta(f){
  if(f.mode==="edit") setPrestataires(l=>l.map(x=>x.mat===f.data.mat?f.data:x));
  else setPrestataires(l=>[...l,f.data]);
  setPrestaModal(null);
 }

 function annulerDS(dsCode,motif){
  setDss(d=>d.map(x=>x.code===dsCode?{...x,etat:"Annulé",motif:motif||"Non précisé"}:x));
  setMotifModal(null);
 }

 const [dis,setDis,sDis]=useSynced("dis",{meta:(d)=>{const E=REG.equipements?REG.equipements.current:[];return {unit:kpiUnitOf(d.eq,E),system:kpiEqInfo(d.eq,E).system};}});

 const [pieces,setPieces,sPie]=useSynced("pieces");

 const [bts,setBts,sBts]=useSynced("bts",{meta:(d)=>{const E=REG.equipements?REG.equipements.current:[];return {unit:kpiUnitOf(d.eq,E),system:kpiEqInfo(d.eq,E).system};}});

 const [dss,setDss,sDss]=useSynced("dss");
 const [bsList,setBsList,sBs]=useSynced("bs");
 const [brs,setBrs,sBrs]=useSynced("brs");

 const [planModal,setPlanModal]=useState(null);
 const [planning,setPlanning,sPla]=useSynced("planning");

 const [interModal,setInterModal]=useState(null);
 const [inter,setInter,sInt]=useSynced("intervenants");
 const interAll=[...inter,...prestataires]; // internes + prestataires externes (ces derniers ne sont proposés que sur leurs équipements)

 // DS créée par le Technicien/Chargé depuis un BT (ou seule) ; état initial "Transmis au Magasinier"
 // sauf rupture de stock -> "En attente pièce" (et le BT lié passe alors aussi "En attente pièce")
 async function addDS(f){
  const piece=pieces.find(p=>p.code===f.piece);
  const nums=await numeros("dss"); if(!nums) return;
  const dsCode=nums[0];
  const suffisant = piece.stock>=f.qte;
  const ds={code:dsCode,eq:f.eq,nom:f.nom,designation:f.designation,piece:piece.code,pieceNom:piece.nom,qte:f.qte,prix:piece.prix,bt:f.bt||null,etat:suffisant?"Transmis au Magasinier":"En attente pièce"};
  setDss(d=>[ds,...d]);
  if(!suffisant){
   if(f.bt) setBts(bs=>bs.map(b=>b.code===f.bt?{...b,etat:"En attente pièce"}:b));
  }
  setDsModal(null);
 }

 // Le magasinier génère le BS à partir d'une DS "Transmis au Magasinier"
 async function genererBS(dsCode){
  const ds=dss.find(d=>d.code===dsCode);
  if(!ds || ds.etat!=="Transmis au Magasinier") return;
  const piece=pieces.find(p=>p.code===ds.piece);
  if(!piece || piece.stock<ds.qte){ alert("Stock insuffisant pour générer le BS."); return; }
  const nums=await numeros("bs"); if(!nums) return;
  const bsCode=nums[0];
  setBsList(b=>[{code:bsCode,ds:dsCode,piece:ds.piece,pieceNom:ds.pieceNom,qte:ds.qte,prix:ds.prix,etat:"À traiter"},...b]);
  setDss(d=>d.map(x=>x.code===dsCode?{...x,etat:"BS généré",bs:bsCode}:x));
 }

 // Traitement du BS par le Magasinier : décrémente le stock, clôt le BS et la DS liée, débloque le BT associé
 function traiterBS(bsCode){
  const bs=bsList.find(x=>x.code===bsCode);
  setPieces(ps=>ps.map(p=>{
   if(p.code!==bs.piece) return p;
   const newStock=Math.max(p.stock-bs.qte,0);
   return {...p,stock:newStock,mouvements:[...(p.mouvements||[]),{date:new Date().toISOString().slice(0,10),qte:bs.qte,type:"Sortie",ref:bs.code}]};
  }));
  setBsList(b=>b.map(x=>x.code===bsCode?{...x,etat:"Traité"}:x));
  const ds=dss.find(d=>d.code===bs.ds);
  if(ds){
   setDss(d=>d.map(x=>x.code===ds.code?{...x,etat:"Traité"}:x));
   if(ds.bt) setBts(b=>b.map(x=>x.code===ds.bt && x.etat==="En attente pièce"?{...x,etat:"En cours"}:x));
  }
 }

 // Bon de Retour : réintègre une pièce non utilisée en stock
 async function addBR(f){
  const piece=pieces.find(p=>p.code===f.piece);
  const nums=await numeros("brs"); if(!nums) return;
  const brCode=nums[0];
  setBrs(b=>[{code:brCode,piece:piece.code,pieceNom:piece.nom,qte:f.qte,prix:piece.prix},...b]);
  setPieces(ps=>ps.map(p=>p.code===piece.code?{...p,stock:p.stock+f.qte,mouvements:[...(p.mouvements||[]),{date:new Date().toISOString().slice(0,10),qte:f.qte,type:"Retour",ref:brCode}]}:p));
  setBrModal(false);
 }

 // Le BT est saisi par un autre intervenant (compte-rendu, temps, matières) puis clôturé.
 async function savePlan(f){
  if(f.mode==="edit") setPlanning(l=>l.map(x=>x.code===f.data.code?{...x,...f.data}:x));
  else {
   const nums=await numeros("planning",{unit}); if(!nums) return;
   const code=nums[0];
   setPlanning(l=>[...l,{...f.data,code,unit,dernier:""}]);
  }
  setPlanModal(null);
 }

 // Déclenchement manuel d'un plan : génère un BT préventif « En cours » avec la liste des tâches du plan
async function declencherPlan(pl){
  if(bts.some(b=>b.plan===pl.code && b.etat!=="Clôturé")) return;
  const nums=await numeros("bts",{unit:pl.unit||unit,variant:"prev"}); if(!nums) return;
  const code=nums[0];
  const dateGeneration=new Date().toISOString().slice(0,16).replace("T"," ");
  setBts(bs=>[buildBTPrev(pl,code,dateGeneration),...bs]);
  setPlanning(l=>l.map(x=>x.code===pl.code?{...x,dernier:todayStr()}:x));
 }

 // Déclenche en une fois toutes les visites prévues (sur la plage choisie) qui n'ont pas déjà un BT ouvert
 async function declencherLot(codesPlan){
  const dateGeneration=new Date().toISOString().slice(0,16).replace("T"," ");
  const eligibles=codesPlan.filter(c=>!bts.some(b=>b.plan===c && b.etat!=="Clôturé"));
  if(eligibles.length){
   // un numéro de BT préventif par plan, réservé auprès du serveur (par unité)
   const parUnite={};
   eligibles.forEach(c=>{const pl=planning.find(x=>x.code===c); const u=(pl&&pl.unit)||unit; (parUnite[u]=parUnite[u]||[]).push(c);});
   const attribues={};
   for(const u of Object.keys(parUnite)){
    const nums=await numeros("bts",{unit:u,variant:"prev",count:parUnite[u].length}); if(!nums) return;
    parUnite[u].forEach((c,k)=>{attribues[c]=nums[k];});
   }
   const nouveaux=eligibles.map(c=>buildBTPrev(planning.find(x=>x.code===c),attribues[c],dateGeneration));
   setBts(bs=>[...nouveaux,...bs]);
  }
  setPlanning(l=>l.map(x=>codesPlan.includes(x.code)?{...x,dernier:todayStr()}:x));
 }

const [notice,setNotice]=useState(null);
 // Lien d'un QR code (?eq=CODE) : ouvre la déclaration d'une DI pour cet équipement, une seule fois
 const lienEq=useRef(typeof window!=="undefined"?codeDepuisAdresse(window.location.search):null);
 useEffect(()=>{
  const code=lienEq.current; if(!code||sEq!=="ready") return;
  lienEq.current=null;
  try{ window.history.replaceState(null,"",window.location.pathname); }catch{ /* adresse non modifiable : sans importance */ }
  const avis=(t)=>{setNotice(t); setTimeout(()=>setNotice(null),9000);};
  const e=equipements.find(x=>x.code===code);
  if(!e) return avis("QR code : équipement « "+code+" » introuvable ou hors de vos droits d'accès.");
  if(!sa && !((session.droits[e.unit]||{}).volets||[]).includes(1)) return avis("QR code "+code+" : vous n'avez pas le droit de créer une demande d'intervention pour cette unité.");
  setUnit(e.unit); setTab(1); setDiModal({prefill:{eq:e.code,nom:e.nom}});
 },[sEq,equipements]);
 const [syncErr,setSyncErr]=useState(null);
 useEffect(()=>{let t;const h=(e)=>{setSyncErr(e.detail);clearTimeout(t);t=setTimeout(()=>setSyncErr(null),10000);};window.addEventListener("gmao:error",h);return()=>{window.removeEventListener("gmao:error",h);clearTimeout(t);};},[]);
 const [feries,setFeries,sFer]=useSynced("feries",{defaults:FERIES_DEFAUT,sa:session.superAdmin});
 setFeries(feries); // les helpers (calendrier, formulaires) lisent la liste courante
 // Alertes : intervenants assignés (plans / BT ouverts) alors qu'ils sont en congé → à remplacer
 const [alertesMasquees,setAlertesMasquees]=useState("");
 const alertesConge=(()=>{
  const out=[], auj=todayStr(), lim=addMonths(new Date(),12); const fin12=fmtD(lim);
  planning.filter(x=>x.unit===unit&&!x.termine).forEach(pl=>{
   const ds=datesPlanDansPlage(pl,auj,fin12);
   (pl.assignes||[]).forEach(n=>{
    const t=interAll.find(i=>i.nom===n); const hit=ds.filter(d=>congeAt(t,d));
    if(hit.length) out.push({key:"P|"+pl.code+"|"+n+"|"+hit[0],kind:"plan",code:pl.code,label:pl.code+" — "+pl.nom,nom:n,dates:hit,c:congeAt(t,hit[0])});
   });
  });
  bts.filter(b=>b.etat!=="Clôturé").forEach(b=>{
   const d=(b.echeance&&b.echeance>auj)?b.echeance:auj;
   (b.assignes||[]).forEach(n=>{
    const t=interAll.find(i=>i.nom===n); const c=congeAt(t,d);
    if(c) out.push({key:"B|"+b.code+"|"+n+"|"+d,kind:"bt",code:b.code,label:b.code+" — "+b.nom,nom:n,dates:[d],c});
   });
  });
  return out;
 })();
 const alertesVisibles=alertesConge.filter(a=>alertesMasquees.indexOf(a.key)<0);
 // Tâche « Non OK » sur un BT préventif : une DI corrective n'est créée que si l'intervenant le décide (Non OK ≠ forcément une panne : ex. manque de pièce de rechange)
 async function genererDIsDefauts(bt,taches){
  const now=new Date().toISOString().slice(0,16).replace("T"," ");
  const eqObj=equipements.find(e=>e.code===bt.eq)||{};
  const aCreer=taches.filter(t=>tRes(t)==="NOK" && !t.di && t.creerDI===true);
  let codes=[];
  if(aCreer.length){ codes=await numeros("dis",{unit:kpiUnitOf(bt.eq,equipements),count:aCreer.length}); if(!codes) return null; }
  let k=0;
  const nouvelles=[];
  const out=taches.map(t=>{
   if(tRes(t)==="NOK" && !t.di && t.creerDI===true){
    const code=codes[k++];
    nouvelles.push({code,eq:bt.eq,nom:bt.nom,designation:"Défaut constaté lors du BT préventif "+bt.code+" — Tâche : "+t.lib+" — "+(t.com||""),emplacement:eqObj.emplacement||"",dateEvt:now,dateCreation:now,perturb:false,demandeur:bt.assigne||"Maintenance",typeMaintenance:"Corrective",sousType:"Curative",etat:"À Transmettre",btOrigine:bt.code});
    return {...t,di:code};
   }
   return t;
  });
  if(nouvelles.length){
   setDis(ds=>[...nouvelles,...ds]);
   setNotice(nouvelles.length+" DI corrective(s) créée(s) depuis "+bt.code+" : "+nouvelles.map(d=>d.code).join(", "));
   setTimeout(()=>setNotice(null),7000);
  }
  return out;
 }
 async function saveBT(code,data){
  const btx=bts.find(b=>b.code===code); if(data&&data.taches&&btx){ const t=await genererDIsDefauts(btx,data.taches); if(!t) return; data={...data,taches:t}; }
  setBts(bs=>bs.map(b=>b.code===code?{...b,...data}:b));
  setBtDetail(null);
 }
 async function cloturerBT(code,data){
  const btx=bts.find(b=>b.code===code); if(data&&data.taches&&btx){ const t=await genererDIsDefauts(btx,data.taches); if(!t) return; data={...data,taches:t}; }
  setBts(bs=>bs.map(b=>b.code===code?{...b,...(data||{}),etat:"Clôturé",dateCloture:new Date().toISOString().slice(0,16).replace("T"," ")}:b));
  const bt=bts.find(b=>b.code===code);
  if(bt && bt.di) setDis(ds=>ds.map(d=>d.code===bt.di?{...d,etat:"Traité"}:d));
  if(bt && bt.plan) setPlanning(l=>l.map(x=>{
   if(x.code!==bt.plan) return x;
   if(isPeriodePlan(x)){
    const nxt=occurrencesPlan(x).find(d=>d>x.date&&d>=todayStr());
    return nxt?{...x,date:nxt,dernier:todayStr()}:{...x,dernier:todayStr(),termine:true};
   }
   return {...x,date:prochaineEcheance(x.date,x.periode),dernier:todayStr()};
  }));
  setBtDetail(null);
 }


 // Nouvel achat d'une pièce / d'un consommable / d'un outillage déjà existant : entrée en stock + mouvement
 function addAchat(f){
  setPieces(ps=>ps.map(p=>p.code===f.piece?{...p,stock:p.stock+f.qte,prix:f.prix>0?f.prix:p.prix,mouvements:[...(p.mouvements||[]),{date:f.date,qte:f.qte,type:"Achat",ref:f.ref||""}]}:p));
  setAchatModal(null);
 }

 // Outillage et consommables sortent par décharge (pas de DS) : sortie de stock immédiate + mouvement
 async function addDecharge(f){
  const piece=pieces.find(p=>p.code===f.piece);
  const nums=await numeros("decharges"); if(!nums) return;
  const code=nums[0];
  setDecharges(d=>[{code,piece:piece.code,pieceNom:piece.nom,categorie:piece.categorie,qte:f.qte,prix:piece.prix,recu:f.recu,bt:f.bt||null,date:f.date},...d]);
  setPieces(ps=>ps.map(p=>p.code===piece.code?{...p,stock:p.stock-f.qte,mouvements:[...(p.mouvements||[]),{date:f.date,qte:f.qte,type:"Décharge",ref:code,detail:f.recu}]}:p));
  setDechargeModal(null);
 }

 function saveInter(f){
  if(f.mode==="edit") setInter(l=>l.map(x=>x.mat===f.data.mat?f.data:x));
  else setInter(l=>[...l,f.data]);
  setInterModal(null);
 }

 async function savePiece(f){
  if(f.mode==="edit"){
   setPieces(ps=>ps.map(x=>x.code===f.code?{...x,...f.data}:x));
  } else {
   const variant={"Pièce":"P","Outillage":"O","Consommable":"C"}[f.data.categorie];
   const nums=await numeros("pieces",{variant}); if(!nums) return;
   const code=nums[0];
   const today=new Date().toISOString().slice(0,10);
   setPieces(ps=>[...ps,{...f.data,code,mouvements:f.data.stock>0?[{date:today,qte:f.data.stock,type:"Achat"}]:[]}]);
  }
  setPieceForm(null);
 }

 async function addDI(f){
  const nums=await numeros("dis",{unit:kpiUnitOf(f.eq,equipements)}); if(!nums) return;
  setDis(ds=>[{code:nums[0],eq:f.eq,nom:f.nom,se:f.se||"",designation:f.designation,emplacement:f.emplacement,dateEvt:f.dateEvt,dateCreation:f.dateCreation,perturb:f.perturb==="Oui",demandeur:f.demandeur,typeMaintenance:f.typeMaintenance,sousType:f.typeMaintenance==="Corrective"?f.sousType:"",etat:"À Transmettre"},...ds]);
  setDiModal(null);
 }

 // Le BT est une entité indépendante générée par le service Maintenance :
 // soit à partir d'une DI existante (Corrective, et la DI passe alors à "Transmis"),
 // soit directement par la maintenance sans DI (ex: Préventif).
 async function addBT(f){
  const nums=await numeros("bts",{unit:kpiUnitOf(f.eq,equipements)}); if(!nums) return;
  const code=nums[0];
  const dateGeneration=new Date().toISOString().slice(0,16).replace("T"," ");
  const intervenants=(f.assignes||[]).map(nom=>{const t=interAll.find(i=>i.nom===nom);return {nom,fonction:t?t.poste:"",taux:t?t.taux:0,temps:0};});
  setBts(bs=>[{code,di:f.di||null,eq:f.eq,nom:f.nom,type:f.type||(f.di?"Corrective — Curative":"Préventive"),consigne:f.consigne||"-",horaire:f.horaire||"Jour",consignation:f.consignation||"Non",exc:!!f.exc,motifExc:f.exc?(f.motifExc||""):"",assigne:(f.assignes||[]).join(", "),assignes:f.assignes||[],dateGeneration,
   detection:0,gravite:0,dureeIntervention:0,tempsLogistique:0,panne:"-",cause:"-",effet:"-",intervenants,pieces:f.pieces||[],outillage:f.outillage||[],consommables:f.consommables||[],etat:"En cours"},...bs]);
  if(f.di) setDis(ds=>ds.map(d=>d.code===f.di?{...d,etat:"Transmis"}:d));
  setBtModal(null);
  setDiDetail(null);
 }

 const tabs=[
  {n:"Arborescence Technique",ic:I.tree},
  {n:"Demandes d'Intervention (DI)",ic:I.board},
  {n:"Bons de Travail (BT)",ic:I.cal},
  {n:"Planning Préventif",ic:I.cal},
  {n:"Magasin & Achats",ic:I.store},
  {n:"Intervenants",ic:I.team},
  {n:"Indicateurs de performance",ic:I.chart},
  {n:"Administration",ic:I.team},
 ];

 const inScope=(code)=>kpiUnitOf(code,equipements)===unit&&sysOk(kpiEqInfo(code,equipements).system);
 const visEquip=sa?equipements:equipements.filter(e=>e.unit===unit&&sysOk(e.system));
 const visSystems=sa?systemsList:systemsList.filter(([c])=>sysOk(c));
 const visPlanning=sa?planning:planning.filter(p=>p.unit===unit&&sysOk(p.sys));
 const visDis=sa?dis:dis.filter(d=>inScope(d.eq));
 const visBts=sa?bts:bts.filter(b=>inScope(b.eq));
 const sysAll=sa||systemsList.every(([c])=>grant.systems.includes(c));
 const interOk=(p)=>sysAll||(p.externe?(p.systemes||[]).some(sysOk):grant.systems.some(c=>new RegExp("\\b"+c+"\\b","i").test(p.poste||"")));
 const visInter=inter.filter(interOk), visPresta=prestataires.filter(interOk);
 const critStock = pieces.filter(p=>p.stock<p.min);
 const ctAl=visPresta.map(contratInfo).filter(c=>c.alerte); const ctRouge=ctAl.filter(c=>c.niveau==="rouge").length, ctOrange=ctAl.length-ctRouge;
 const habAl=habListe(visInter); const habRouge=habAl.filter(x=>x.niveau==="rouge").length, habOrange=habAl.filter(x=>x.niveau==="orange").length;
 const syncStates=[sEq,sSys,sTree,sMes,sCtrl,sOrg,sPre,sDch,sDss,sBs,sBrs,sFer,sDis,sBts,sPie,sPla,sInt];
 if(syncStates.includes("error")) return <Splash msg="Impossible de joindre le serveur GMAO." action={()=>window.location.reload()} actionLabel="Réessayer"/>;
 if(!syncStates.every(s=>s==="ready")) return <Splash msg="Chargement des données…"/>;

 return (
 <div className="min-h-screen flex text-slate-200" style={{paddingTop:"env(safe-area-inset-top,0px)",paddingBottom:"env(safe-area-inset-bottom,0px)"}}>
  {sidebar && <div className="fixed inset-0 bg-black/50 z-30 md:hidden" onClick={()=>setSidebar(false)} data-testid="menu-fond"/>}
  {sidebar && <aside className="w-72 max-w-[85vw] fixed inset-y-0 left-0 z-40 overflow-y-auto md:static md:w-64 md:max-w-none md:z-auto md:overflow-visible shrink-0 bg-slate-900 border-r border-slate-800 p-4 flex flex-col gap-4" style={{paddingTop:"max(1rem,env(safe-area-inset-top,0px))"}} data-testid="menu-lateral">
   <div className="flex flex-col items-center text-center -mt-1"><img src={XL_LOGO} alt="SETRAM" style={{width:170,height:"auto"}}/><div style={{fontSize:15,fontWeight:700,color:"#0f2447",letterSpacing:2,marginTop:-4}}>GMAO</div></div>
   <div>
    <div className="text-xs text-slate-500 uppercase mb-1">Unité opérationnelle</div>
    <select value={unit} onChange={e=>{setUnit(e.target.value); if(mobile()) setSidebar(false);}} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-sm">
     {unitsOk.map(u=><option key={u}>{u}</option>)}
    </select>
   </div>
   <div>
    <div className="text-xs text-slate-500 uppercase mb-1">Utilisateur connecté</div>
    <div className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-sm"><div className="font-medium text-slate-100">{user}</div><div className="text-xs text-slate-500">{sa?"Super administrateur":session.role}</div></div><button onClick={onLogout} className="mt-2 w-full text-xs px-2 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600">Se déconnecter</button>
   </div>
   <nav className="flex flex-col gap-1 mt-2">
    {tabs.map((t,i)=>!tabOk(i)?null:(
     <button key={i} onClick={()=>allerA(i)} className={"flex items-center gap-2 px-3 py-2.5 md:py-2 rounded-lg text-sm text-left "+(tab===i?"bg-sky-600 text-white":"hover:bg-slate-800 text-slate-300")}>
      {t.ic}{t.n}
      {t.n==="Intervenants"&&(habRouge+habOrange+ctAl.length>0)&&<span className={"ml-auto px-1.5 rounded-full text-xs "+((habRouge+ctRouge)>0?"bg-rose-600 text-white":"bg-amber-500 text-white")} title="Habilitations et contrats prestataires à traiter">{habRouge+habOrange+ctAl.length}</span>}
     </button>))}
   </nav>
   <div className="mt-auto flex flex-col gap-2">
   {tabOk(5)&&ctAl.length>0 && <Card cls={"cursor-pointer "+(ctRouge>0?"border-rose-700 bg-rose-900/30":"border-amber-700 bg-amber-900/20")}>
    <div onClick={()=>setTab(5)}><div className={"flex items-center gap-2 text-sm font-medium "+(ctRouge>0?"text-rose-300":"text-amber-300")}>{I.alert} Contrats prestataires</div>
    <div className={"text-xs mt-1 "+(ctRouge>0?"text-rose-200":"text-amber-200")}>{ctRouge>0?ctRouge+" expiré(s)":""}{ctRouge>0&&ctOrange>0?" · ":""}{ctOrange>0?ctOrange+" à renouveler sous "+CONTRAT_SEUIL_MOIS+" mois — préparer le cahier des charges":""}</div></div>
   </Card>}
   {tabOk(5)&&(habRouge+habOrange)>0 && <Card cls={"cursor-pointer "+(habRouge>0?"border-rose-700 bg-rose-900/30":"border-amber-700 bg-amber-900/20")}>
    <div onClick={()=>setTab(5)}><div className={"flex items-center gap-2 text-sm font-medium "+(habRouge>0?"text-rose-300":"text-amber-300")}>{I.alert} Habilitations</div>
    <div className={"text-xs mt-1 "+(habRouge>0?"text-rose-200":"text-amber-200")}>{habRouge>0?habRouge+" expirée(s)":""}{habRouge>0&&habOrange>0?" · ":""}{habOrange>0?habOrange+" à renouveler sous "+HAB_SEUIL_MOIS+" mois":""}</div></div>
   </Card>}
   {tabOk(4)&&critStock.length>0 && <Card cls="border-rose-700 bg-rose-900/30">
    <div className="flex items-center gap-2 text-rose-300 text-sm font-medium">{I.alert} Stock critique</div>
    <div className="text-xs text-rose-200 mt-1">{critStock.length} pièce(s) sous le seuil min</div>
   </Card>}
   </div>
  </aside>}

  <main className="flex-1 min-w-0 p-3 md:p-5 overflow-y-auto">
   {tabOk(5)&&alertesVisibles.length>0 && <div className="mb-4 rounded-xl border border-rose-700 bg-rose-900/30 p-3">
    <div className="flex justify-between items-start gap-2">
     <div className="text-sm font-semibold text-rose-300">⚠ Intervenant en congé — changez l'intervenant ({alertesVisibles.length})</div>
     <button className="text-xs text-slate-400 hover:text-slate-200" onClick={()=>setAlertesMasquees(m=>m+alertesVisibles.map(a=>a.key).join("~"))}>Masquer</button>
    </div>
    <div className="mt-2 space-y-1.5">{alertesVisibles.slice(0,6).map(a=><div key={a.key} className="flex flex-wrap items-center justify-between gap-2 text-xs bg-slate-900 rounded-lg px-2 py-1.5">
     <span className="text-slate-300"><b className="text-rose-300">{a.nom}</b> est en congé {libConge(a.c)}, mais est assigné à <span className="text-sky-400">{a.label}</span> ({a.kind==="plan"?"prévu le "+a.dates.slice(0,3).map(frDate).join(", ")+(a.dates.length>3?"…":""):"BT en cours"}).</span>
     <Btn cls="bg-rose-700 hover:bg-rose-600 text-white text-xs" onClick={()=>{ if(a.kind==="plan"){const pl=planning.find(x=>x.code===a.code); setTab(3); setPlanModal({mode:"edit",item:pl});} else {setTab(2); setBtDetail(a.code);} }}>Changer l'intervenant</Btn>
    </div>)}
    {alertesVisibles.length>6 && <div className="text-xs text-slate-400">… et {alertesVisibles.length-6} autre(s) alerte(s).</div>}</div>
   </div>}
   <div className="flex items-center justify-between mb-5">
    <div className="flex items-center gap-3">
     <button onClick={()=>setSidebar(s=>!s)} className="text-slate-400 p-2 -ml-2" aria-label="Menu" data-testid="menu-bouton">{I.menu}</button>
     <h1 className="text-lg md:text-xl font-semibold text-slate-100">{tabs[tab].n} <span className="text-slate-500 text-sm font-normal">— Unité {unit}</span></h1>
    </div>
   </div>

   {tab===1 && <DIPage dis={visDis} bts={visBts} onNewDI={()=>setDiModal({})} onOpenDI={(d)=>setDiDetail(d.code)} onGenererBT={(di)=>setBtModal({di})}/>}
   {tab===2 && <BTPage bts={visBts} pieces={pieces} onNouveauBT={()=>setBtModal({di:null})} onOpenBT={(b)=>setBtDetail(b.code)}/>}
   {tab===0 && <Arbo unit={unit} equipements={equipements} systemsList={visSystems} treeStruct={treeStruct}
     onAddEquip={(system,subCode,subNom)=>setEquipModal({mode:"add",system,subCode,subNom,unit})}
     onOpenEquip={setEquipDetail}
     onCreateDI={(equip)=>setDiModal({prefill:{eq:equip.code,nom:equip.nom}})}
     onAddSousEquip={(equip)=>setSousEquipModal({mode:"add",equip})}
     onOpenSousEquip={(equip,se)=>setSousEquipDetail({equip,se})}
     onRemoveSousEquip={removeSousEquip}
     onAddSystem={()=>setSystemModal({mode:"add",code:"",nom:""})}
     onEditSystem={(code,nom)=>setSystemModal({mode:"edit",code,nom})}
     onAddSubSystem={(systemCode)=>setSubSystemModal({mode:"add",systemCode,code:"",nom:""})}
     onEditSubSystem={(systemCode,code,nom)=>setSubSystemModal({mode:"edit",systemCode,code,nom})}
     mesureList={mesureList} ctrlList={ctrlList} onAddCtrl={()=>setCtrlModal({mode:"add"})} onEditCtrl={(c)=>setCtrlModal({mode:"edit",item:c})} organismes={organismes} onAddOrg={()=>setOrgModal({mode:"add"})} onEditOrg={(o)=>setOrgModal({mode:"edit",item:o})}
         onAddMesure={()=>setMesureModal({mode:"add"})}
     onEditMesure={(item)=>setMesureModal({mode:"edit",item})}/>}
   {!tabOk(tab) && <Card><div className="text-sm text-slate-400">Aucun volet n'est accessible pour votre compte sur cette unité. Contactez le super administrateur.</div></Card>}
   {tab===7 && sa && <AdminPage systemsList={systemsList} me={session.id} importRefs={{units:UNITS,unitAbbr:UNIT_ABBR,roles:ROLES,cdcEtats:CDC_ETATS,orgDom:ORG_DOM,systemsList,treeStruct,equipements,pieces,intervenants:inter,prestataires,organismes,mesures:mesureList,controles:ctrlList}}/>}
   {tab===3 && <Planning planning={visPlanning} bts={visBts} systemsList={visSystems} unit={unit} onAdd={()=>setPlanModal({mode:"add"})} onEdit={(pl)=>setPlanModal({mode:"edit",item:pl})} onDeclencher={unSeul(declencherPlan)} onDeclencherLot={unSeul(declencherLot)} onOpenBT={(c)=>setBtDetail(c)}/>}
   {tab===4 && <Magasin pieces={pieces} decharges={decharges} onNewAchat={(code)=>setAchatModal({prefill:code})} onNewDecharge={(code)=>setDechargeModal({prefill:code})} dss={dss} bsList={bsList} brs={brs} onNewDS={()=>setDsModal({})} onNewBR={()=>setBrModal(true)} onTraiterBS={traiterBS} onGenererBS={unSeul(genererBS)} onAnnulerDS={(code)=>setMotifModal({ds:code})} onOpenPiece={setPieceModal} onAddPiece={(categorie)=>setPieceForm({mode:"add",categorie})} onEditPiece={(piece)=>setPieceForm({mode:"edit",piece})}/>}
   {tab===5 && <Equipe inter={visInter} prestataires={visPresta} equipements={equipements} onAddPresta={()=>setPrestaModal({mode:"add"})} onEditPresta={(p)=>setPrestaModal({mode:"edit",item:p})} feries={feries} onChangeFeries={setFeries} onAdd={()=>setInterModal({mode:"add"})} onEdit={(p)=>setInterModal({mode:"edit",item:p})}/>}
   {tab===6 && <IndicateursPage kpiOk={kpiOk} unit={unit} dis={visDis} bts={visBts} planning={visPlanning} equipements={visEquip} pieces={pieces} systemsList={visSystems} treeStruct={treeStruct}/>}
  </main>

  {diModal && <Modal title="Nouvelle Demande d'Intervention (DI) — Service Exploitation" onClose={()=>setDiModal(null)}>
   <DIForm prefill={diModal.prefill} equipements={equipements.filter(e=>e.unit===unit&&sysOk(e.system))} demandeur={user} onSubmit={unSeul(addDI)}/>
  </Modal>}

  {btModal && <Modal title={btModal.di? "Générer un BT depuis "+btModal.di.code+" — Service Maintenance" : "Nouveau BT (Préventif) — Service Maintenance"} onClose={()=>setBtModal(null)}>
   <BTCreateForm di={btModal.di} inter={interAll} pieces={pieces} equipements={equipements.filter(e=>e.unit===unit&&sysOk(e.system))} onSubmit={unSeul(addBT)}/>
  </Modal>}

  {diDetail && (()=>{const d=dis.find(x=>x.code===diDetail); if(!d) return null; const btLie=bts.find(b=>b.di===d.code);
   return <Modal wide title={"Demande d'Intervention — "+d.code} onClose={()=>setDiDetail(null)}>
    <DIDetail di={d} bt={btLie} onGenererBT={()=>{setDiDetail(null);setBtModal({di:d});}} onOpenBT={()=>{setDiDetail(null);setTab(2);setBtDetail(btLie.code);}}/>
   </Modal>;})()}

  {notice && <div className="fixed bottom-4 right-4 z-[60] max-w-sm bg-emerald-700 text-emerald-50 text-sm rounded-xl px-4 py-3 shadow-lg">✓ {notice}</div>}
  {syncErr && <div className="fixed bottom-4 left-4 z-[70] max-w-md bg-rose-700 text-rose-50 text-sm rounded-xl px-4 py-3 shadow-lg" onClick={()=>setSyncErr(null)}>⚠ {syncErr}</div>}

  {btDetail && (()=>{const b=bts.find(x=>x.code===btDetail); if(!b) return null;
   return <Modal wide title={"Bon de Travail — "+b.code} onClose={()=>setBtDetail(null)}>
    <BTDetail key={b.code} bt={b} pieces={pieces} inter={interAll} equipements={equipements} onSave={(data)=>unSeul(saveBT)(b.code,data)} onCloturer={(data)=>unSeul(cloturerBT)(b.code,data)}
     onCreateDS={(item)=>{setBtDetail(null);setDsModal({prefill:{eq:b.eq,nom:b.nom,piece:item.code,qte:item.qte,bt:b.code}});}}/>
   </Modal>;})()}

  {equipModal && <Modal title={equipModal.mode==="edit"?"Modifier l'équipement — "+equipModal.equip.code:"Créer un équipement — "+equipModal.system+"."+UNIT_ABBR[equipModal.unit]+"."+equipModal.subCode} onClose={()=>setEquipModal(null)}>
   <EquipForm modal={equipModal} count={equipModal.mode==="add"?equipements.filter(e=>e.system===equipModal.system&&e.subCode===equipModal.subCode&&e.unit===equipModal.unit).length:0} onSubmit={saveEquipement}/>
  </Modal>}

  {equipDetail && (()=>{const ed=equipements.find(x=>x.code===equipDetail.code)||equipDetail; const sousL=ed.sousEquip||[];
   return <Modal title={"Fiche équipement — "+ed.code} onClose={()=>setEquipDetail(null)}>
   <div className="text-sm space-y-3">
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
     <div><span className="text-slate-500">Code :</span> {ed.code}</div>
     <div><span className="text-slate-500">Nom :</span> {ed.nom}</div>
     <div><span className="text-slate-500">Prix :</span> {ed.prix.toLocaleString()} DA</div>
     <div><span className="text-slate-500">Unité :</span> {ed.unit}</div>
     <div className="col-span-2"><span className="text-slate-500">Emplacement :</span> {ed.emplacement||"—"}</div>
    </div>
    <div className="border-t border-slate-700 pt-2 text-xs text-slate-300">
     <div className="text-slate-400 font-medium mb-1">Constructeur</div>
     {ed.constructeur.nom||"—"} {ed.constructeur.contact&&"— "+ed.constructeur.contact}<br/>{ed.constructeur.tel} {ed.constructeur.email&&"— "+ed.constructeur.email}
    </div>
    <div className="border-t border-slate-700 pt-2 text-xs text-slate-300">
     <div className="text-slate-400 font-medium mb-1">Fournisseur(s)</div>
     {ed.fournisseurs.map((f,idx)=><div key={idx} className="py-0.5">{idx+1}. {f.nom} — {f.tel} — {f.email}</div>)}
    </div>
    <div className="border-t border-slate-700 pt-2 text-xs text-slate-300">
     <div className="text-slate-400 font-medium mb-1">Prestataire(s) externe(s) intervenant sur le système {ed.system}</div>
     {(()=>{const l=prestataires.filter(x=>(x.systemes||[]).includes(ed.system)); return l.length===0?<div className="text-slate-600">Aucun prestataire externe sur le système {ed.system}.</div>:l.map(x=><div key={x.mat} className="py-0.5">◦ {x.nom}{x.tel?" — "+x.tel:""}</div>);})()}
    </div>
    <div className="border-t border-slate-700 pt-2 text-xs text-slate-300">
     <div className="flex items-center justify-between mb-1"><span className="text-slate-400 font-medium">Sous-équipements ({sousL.length})</span>
      <Btn cls="bg-slate-700 hover:bg-slate-600 text-xs" onClick={()=>{setSousEquipModal({mode:"add",equip:ed});}}>+ Sous-équipement</Btn></div>
     {sousL.length===0 && <div className="text-slate-600">Aucun sous-équipement.</div>}
     {sousL.map(se=><div key={se.code} onClick={()=>setSousEquipDetail({equip:ed,se})} className="py-0.5 cursor-pointer hover:text-sky-400">◦ <span className="text-slate-400">{se.code}</span> — {se.nom}</div>)}
    </div>
    <div className="flex justify-end gap-2">
     <Btn cls="bg-slate-700 hover:bg-slate-600" onClick={()=>setEquipDetail(null)}>Fermer</Btn>
     <Btn cls="bg-amber-600 hover:bg-amber-500" onClick={()=>{setEquipModal({mode:"edit",equip:ed});setEquipDetail(null);}}>Modifier</Btn>
     <Btn onClick={()=>{setDiModal({prefill:{eq:ed.code,nom:ed.nom}});setEquipDetail(null);}}>Créer une DI</Btn>
    </div>
   </div>
  </Modal>;})()}

  {sousEquipModal && <Modal title={sousEquipModal.mode==="edit"?"Modifier le sous-équipement — "+sousEquipModal.se.code:"Créer un sous-équipement — "+sousEquipModal.equip.code} onClose={()=>setSousEquipModal(null)}>
   <SousEquipForm modal={sousEquipModal} count={sousEquipModal.mode==="add"?(equipements.find(x=>x.code===sousEquipModal.equip.code)||sousEquipModal.equip).sousEquip?.length||0:0} onSubmit={saveSousEquipement}/>
  </Modal>}

  {sousEquipDetail && (()=>{
   const parent=equipements.find(x=>x.code===sousEquipDetail.equip.code)||sousEquipDetail.equip;
   const se=(parent.sousEquip||[]).find(x=>x.code===sousEquipDetail.se.code)||sousEquipDetail.se;
   return <Modal title={"Fiche sous-équipement — "+se.code} onClose={()=>setSousEquipDetail(null)}>
   <div className="text-sm space-y-3">
    <div className="text-xs text-slate-500">Équipement parent : <span className="text-sky-400">{parent.code}</span> — {parent.nom}</div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
     <div><span className="text-slate-500">Code :</span> {se.code}</div>
     <div><span className="text-slate-500">Nom :</span> {se.nom}</div>
    </div>
    <div className="border-t border-slate-700 pt-2 text-xs text-slate-300">
     <div className="text-slate-400 font-medium mb-1">Fournisseur(s)</div>
     {se.fournisseurs.map((f,idx)=><div key={idx} className="py-0.5">{idx+1}. {f.nom} — {f.tel} — {f.email}</div>)}
    </div>
    <div className="flex justify-end gap-2">
     <Btn cls="bg-slate-700 hover:bg-slate-600" onClick={()=>setSousEquipDetail(null)}>Fermer</Btn>
     <Btn cls="bg-rose-700 hover:bg-rose-600" onClick={()=>{removeSousEquip(parent.code,se.code);setSousEquipDetail(null);}}>Supprimer</Btn>
     <Btn cls="bg-amber-600 hover:bg-amber-500" onClick={()=>{setSousEquipModal({mode:"edit",equip:parent,se});setSousEquipDetail(null);}}>Modifier</Btn>
     <Btn onClick={()=>{setDiModal({prefill:{eq:parent.code,nom:parent.nom+" — "+se.code+" "+se.nom,se:se.code}});setSousEquipDetail(null);}}>Créer une DI</Btn>
    </div>
   </div>
  </Modal>;})()}

  {systemModal && <Modal title={systemModal.mode==="edit"?"Modifier le système":"Ajouter un système"} onClose={()=>setSystemModal(null)}>
   <SystemForm modal={systemModal} onSubmit={saveSystem}/>
  </Modal>}

  {subSystemModal && <Modal title={subSystemModal.mode==="edit"?"Modifier le sous-système":"Ajouter un sous-système"} onClose={()=>setSubSystemModal(null)}>
   <SubSystemForm modal={subSystemModal} onSubmit={saveSubSystem}/>
  </Modal>}

  {orgModal && <Modal title={orgModal.mode==="edit"?"Modifier l'organisme — "+orgModal.item.nom:"Ajouter un organisme"} onClose={()=>setOrgModal(null)}>
   <OrgForm modal={orgModal} list={organismes} onSubmit={saveOrg}/>
  </Modal>}

  {prestaModal && <Modal wide title={prestaModal.mode==="edit"?"Modifier le prestataire — "+prestaModal.item.nom:"Ajouter un prestataire externe"} onClose={()=>setPrestaModal(null)}>
   <PrestaForm mode={prestaModal.mode} item={prestaModal.item} existing={prestataires} systemsList={systemsList} onSubmit={savePresta}/>
  </Modal>}

  {ctrlModal && <Modal title={ctrlModal.mode==="edit"?"Modifier le contrôle — "+ctrlModal.item.code:"Ajouter un équipement au contrôle réglementaire"} onClose={()=>setCtrlModal(null)}>
   <CtrlForm modal={ctrlModal} list={ctrlList} organismes={organismes} equipements={equipements.filter(e=>e.unit===unit&&sysOk(e.system))} onSubmit={saveCtrl}/>
  </Modal>}

  {mesureModal && <Modal title={mesureModal.mode==="edit"?"Modifier l'appareil — "+mesureModal.item.code:"Ajouter un appareil de mesure"} onClose={()=>setMesureModal(null)}>
   <MesureForm modal={mesureModal} count={mesureList.length} organismes={organismes} onSubmit={saveMesure}/>
  </Modal>}

  {motifModal && <Modal title="Annuler la DS — motif" onClose={()=>setMotifModal(null)}>
   <MotifForm onSubmit={(motif)=>annulerDS(motifModal.ds,motif)}/>
  </Modal>}

  {dsModal && <Modal title="Nouvelle Demande de Sortie (DS) — Pièces" onClose={()=>setDsModal(null)}>
   <DSForm pieces={pieces.filter(p=>p.categorie==="Pièce")} bts={bts} prefill={dsModal.prefill} onSubmit={unSeul(addDS)}/>
  </Modal>}

  {brModal && <Modal title="Nouveau Bon de Retour (BR)" onClose={()=>setBrModal(false)}>
   <BRForm pieces={pieces} onSubmit={unSeul(addBR)}/>
  </Modal>}

  {planModal && <Modal wide title={planModal.mode==="edit"?"Plan préventif — "+planModal.item.code:"Nouveau plan préventif"} onClose={()=>setPlanModal(null)}>
   <PlanForm mode={planModal.mode} item={planModal.item} systemsList={systemsList} equipements={equipements.filter(e=>e.unit===unit&&sysOk(e.system))} inter={interAll} pieces={pieces} onSubmit={unSeul(savePlan)}/>
  </Modal>}

  {interModal && <Modal wide title={interModal.mode==="edit"?"Modifier l'intervenant — "+interModal.item.nom:"Ajouter un intervenant"} onClose={()=>setInterModal(null)}>
   <InterForm mode={interModal.mode} item={interModal.item} existing={inter} systemsList={systemsList} onSubmit={saveInter}/>
  </Modal>}

  {achatModal && <Modal title="Nouvel achat / réapprovisionnement" onClose={()=>setAchatModal(null)}>
   <AchatForm pieces={pieces} prefill={achatModal.prefill} onSubmit={addAchat}/>
  </Modal>}

  {dechargeModal && <Modal title="Décharge — Outillage / Consommable" onClose={()=>setDechargeModal(null)}>
   <DechargeForm pieces={pieces.filter(p=>p.categorie!=="Pièce")} inter={inter} bts={bts.filter(b=>b.etat!=="Clôturé")} prefill={dechargeModal.prefill} onSubmit={unSeul(addDecharge)}/>
  </Modal>}

  {pieceForm && <Modal wide title={pieceForm.mode==="edit"?"Modifier — "+pieceForm.piece.code+" "+pieceForm.piece.nom:"Ajouter — "+pieceForm.categorie} onClose={()=>setPieceForm(null)}>
   <ArticleForm mode={pieceForm.mode} piece={pieceForm.piece} categorie={pieceForm.categorie} onSubmit={unSeul(savePiece)}/>
  </Modal>}

  {pieceModal && <Modal title={"Fiche "+pieceModal.categorie+" — "+pieceModal.code} onClose={()=>setPieceModal(null)}>
   <div className="text-sm space-y-3">
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
     <div><span className="text-slate-500">Nom :</span> {pieceModal.nom}</div>
     <div><span className="text-slate-500">Catégorie :</span> {pieceModal.categorie}</div>
     <div><span className="text-slate-500">Code :</span> {pieceModal.code}</div>
     <div><span className="text-slate-500">Référence :</span> {pieceModal.ref}</div>
     <div><span className="text-slate-500">N° Série :</span> {pieceModal.serie}</div>
     <div><span className="text-slate-500">Prix unitaire :</span> {pieceModal.prix.toLocaleString()} DA</div>
     <div><span className="text-slate-500">Stock actuel :</span> {pieceModal.stock}</div>
     <div><span className="text-slate-500">Seuils :</span> min {pieceModal.min} / max {pieceModal.max}</div>
    </div>
    <div className="border-t border-slate-700 pt-2">
     <div className="text-xs text-slate-400 font-medium mb-1">Constructeur</div>
     <div className="text-xs text-slate-300">{pieceModal.constructeur.nom} — {pieceModal.constructeur.contact}<br/>{pieceModal.constructeur.tel} — {pieceModal.constructeur.email}</div>
    </div>
    <div className="border-t border-slate-700 pt-2">
     <div className="text-xs text-slate-400 font-medium mb-1">Fournisseur 1</div>
     <div className="text-xs text-slate-300">{pieceModal.fourn1.nom} — {pieceModal.fourn1.tel} — {pieceModal.fourn1.email}</div>
    </div>
    {pieceModal.fourn2.nom && <div className="border-t border-slate-700 pt-2">
     <div className="text-xs text-slate-400 font-medium mb-1">Fournisseur 2</div>
     <div className="text-xs text-slate-300">{pieceModal.fourn2.nom} — {pieceModal.fourn2.tel} — {pieceModal.fourn2.email}</div>
    </div>}
    <div className="border-t border-slate-700 pt-2">
     {(()=>{const mv=pieceModal.mouvements||[];const isSortie=m=>m.type==="Sortie"||m.type==="Décharge";
      const Ligne=({m})=><div className="text-xs text-slate-300 flex justify-between gap-2"><span>{m.date} — {m.type}{m.ref?" ("+m.ref+")":""}{m.detail?" — "+m.detail:""}</span><span>Qté {m.qte}</span></div>;
      const ent=mv.filter(m=>!isSortie(m)),sor=mv.filter(isSortie);
      return <><div className="text-xs text-emerald-400 font-medium mb-1">Entrées (achats / retours)</div>
       {ent.length===0?<div className="text-xs text-slate-500">Aucune entrée.</div>:ent.map((m,i)=><Ligne key={i} m={m}/>)}
       <div className="text-xs text-rose-400 font-medium mt-3 mb-1">Sorties ({pieceModal.categorie==="Pièce"?"bons de sortie":"décharges"})</div>
       {sor.length===0?<div className="text-xs text-slate-500">Aucune sortie.</div>:sor.map((m,i)=><Ligne key={i} m={m}/>)}</>;})()}
    </div>
    <div className="flex justify-end gap-2 flex-wrap"><Btn cls="bg-emerald-700 hover:bg-emerald-600" onClick={()=>{setAchatModal({prefill:pieceModal.code});setPieceModal(null);}}>Nouvel achat</Btn>{pieceModal.categorie!=="Pièce" && <Btn cls="bg-amber-700 hover:bg-amber-600" onClick={()=>{setDechargeModal({prefill:pieceModal.code});setPieceModal(null);}}>Décharge</Btn>}<Btn cls="bg-sky-700 hover:bg-sky-600" onClick={()=>{setPieceForm({mode:"edit",piece:pieceModal});setPieceModal(null);}}>Modifier</Btn><Btn cls="bg-slate-700 hover:bg-slate-600" onClick={()=>setPieceModal(null)}>Fermer</Btn></div>
   </div>
  </Modal>}
 </div>);
}

function GraviteBar({g}){
 const cls=g>=4?"bg-rose-500":g===3?"bg-orange-500":g===2?"bg-amber-500":"bg-slate-400";
 return (<div className="flex items-center gap-1"><div className="flex gap-0.5">{[1,2,3,4].map(i=><div key={i} className={"w-2 h-4 rounded-sm "+(i<=g?cls:"bg-slate-700")}></div>)}</div><span className="text-xs text-slate-400 ml-1">{g}/4</span></div>);
}

/* ===== Congés des intervenants ===== */
function MultiInter({inter,value,onChange,sys,date,extraDates}){
 const filtres=interDuSysteme(inter,sys);
 const toggle=(n)=>onChange(value.includes(n)?value.filter(x=>x!==n):[...value,n]);
 // Intervenants sélectionnés qui sont pourtant en congé à la date de l'intervention
 const aRemplacer=date?value.map(n=>{const t=inter.find(x=>x.nom===n);const c=congeAt(t,date);return c?{n,c}:null;}).filter(Boolean):[];
 // Congés qui tombent sur d'autres occurrences (plan récurrent) : simple avertissement
 const autres=(extraDates||[]).length?value.map(n=>{const t=inter.find(x=>x.nom===n);const ds=(extraDates||[]).filter(d=>d!==date&&congeAt(t,d));return ds.length?{n,ds}:null;}).filter(Boolean):[];
 return <div>
  {sys && filtres.length<inter.length && <div className="text-[11px] text-slate-500 mb-1">Liste limitée aux intervenants (technicien, chargé de maintenance, responsable...) du système {sys}.</div>}
  {date && nonOuvre(date) && <div className="mb-1 rounded-lg border border-amber-700 bg-amber-900/20 px-2 py-1.5 text-xs text-amber-400">🎌 {frDate(date)} : {nonOuvre(date).nom}. Assignez uniquement pour un travail exceptionnel.</div>}
  {aRemplacer.length>0 && <div className="mb-1 rounded-lg border border-rose-700 bg-rose-900/30 px-2 py-1.5 text-xs text-rose-300">⚠ {aRemplacer.map(x=>x.n+" est en congé "+libConge(x.c)).join(" ; ")}. Retirez-le et choisissez un autre intervenant.</div>}
  {autres.length>0 && <div className="mb-1 rounded-lg border border-amber-700 bg-amber-900/20 px-2 py-1.5 text-xs text-amber-400">⚠ {autres.map(x=>x.n+" sera en congé le "+x.ds.slice(0,3).map(frDate).join(", ")+(x.ds.length>3?"…":"")).join(" ; ")} : prévoyez un remplaçant pour ces dates.</div>}
  <div className="flex flex-wrap gap-1 mt-1">{filtres.map(i=>{
   const cg=date?congeAt(i,date):null, sel=value.includes(i.nom);
   if(cg && !sel) return <button type="button" key={i.mat} disabled title={"En congé "+libConge(cg)} className="px-2 py-1 rounded-lg text-xs border border-slate-700 bg-slate-900 text-slate-500 opacity-60 cursor-not-allowed">⛔ {i.nom} <span className="text-slate-500">— en congé {libConge(cg)}</span></button>;
   return <button type="button" key={i.mat} onClick={()=>toggle(i.nom)} className={"px-2 py-1 rounded-lg text-xs border "+(cg?"bg-rose-700 border-rose-500 text-white":sel?"bg-sky-600 border-sky-500 text-white":"bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-700")}>{sel?"✓ ":"+ "}{i.nom} <span className="opacity-70">{i.poste}</span>{i.externe && <span className="ml-1 px-1 rounded bg-amber-600 text-amber-50">Externe</span>}{cg && <span> — en congé</span>}</button>;
  })}</div>
 </div>;
}
const ProgressBar=({pct})=>(<div className="flex items-center gap-2 min-w-[110px]"><div className="flex-1 bg-slate-700 rounded-full h-2 overflow-hidden"><div className={"h-2 rounded-full "+(pct>=100?"bg-emerald-500":"bg-amber-500")} style={{width:pct+"%"}}></div></div><span className="text-xs text-slate-300 w-9 text-right">{pct}%</span></div>);
const KPI=({items})=>(<div className="grid grid-cols-2 md:grid-cols-4 gap-3">
 {items.map(([l,v,c])=><Card key={l}><div className="text-xs text-slate-400">{l}</div><div className={"text-2xl font-bold "+c}>{v}</div></Card>)}
</div>);
const Segment=({value,options,onChange})=><div className="flex gap-1 mt-1">{options.map(o=><button type="button" key={o} onClick={()=>onChange(o)} className={"px-3 py-1.5 rounded-lg text-sm border "+(value===o?"bg-sky-600 border-sky-500 text-white":"bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-700")}>{o==="Jour"?"☀️ Jour":o==="Nuit"?"🌙 Nuit":o}</button>)}</div>;
const HoraireConsignation=({v,onChange})=><div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
 <div><div className="text-xs text-slate-400">Durée de travail (Jour / Nuit)</div><Segment value={v.horaire||"Jour"} options={["Jour","Nuit"]} onChange={x=>onChange({horaire:x})}/></div>
 <div><div className="text-xs text-slate-400">Consignation nécessaire ?</div><Segment value={v.consignation||"Non"} options={["Oui","Non"]} onChange={x=>onChange({consignation:x})}/></div>
</div>;
const Info=({l,children})=><div><div className="text-xs text-slate-500">{l}</div><div className="text-sm text-slate-200">{children}</div></div>;

/* ===== Page 1 : Demandes d'Intervention (créées par l'Exploitation) ===== */
function DIPage({dis,bts,onNewDI,onOpenDI,onGenererBT}){
 const exportDI=()=>exporterXlsx({fichier:"Demandes_Intervention_DI",feuilles:[{nom:"DI",titre:"Demandes d'Intervention (DI)",
  colonnes:[{h:"Code DI"},{h:"Code équipement"},{h:"Équipement"},{h:"Demandeur"},{h:"Désignation",max:50},{h:"Type de maintenance"},{h:"Emplacement"},{h:"Date événement",t:"datetime"},{h:"Date création",t:"datetime"},{h:"Perturbation"},{h:"BT lié"},{h:"État"}],
  lignes:dis.map(d=>{const bt=bts.find(b=>b.di===d.code);return [d.code,d.eq,d.nom,d.demandeur,d.designation,typeLabel(d),d.emplacement,d.dateEvt,d.dateCreation,ouiNon(d.perturb),bt?bt.code:"",d.etat];})}]});
 return (<div className="space-y-5">
  <KPI items={[
   ["DI ouvertes",dis.filter(d=>d.etat!=="Traité").length,"text-sky-400"],
   ["À transmettre",dis.filter(d=>d.etat==="À Transmettre").length,"text-slate-300"],
   ["Transmises (BT généré)",dis.filter(d=>d.etat==="Transmis").length,"text-amber-400"],
   ["Traitées",dis.filter(d=>d.etat==="Traité").length,"text-emerald-400"],
  ]}/>
  <Card>
   <div className="flex justify-between items-center mb-1 flex-wrap gap-2">
    <div><h2 className="font-semibold text-slate-100">Demandes d'Intervention (DI)</h2><div className="text-xs text-slate-500">Créées par le service Exploitation — cliquez sur une ligne pour ouvrir la DI</div></div>
    <div className="flex gap-2"><ExportBtn onClick={exportDI}/><Btn onClick={onNewDI}><span className="flex items-center gap-1">{I.plus} Nouvelle DI</span></Btn></div>
   </div>
   <div className="md:hidden mt-3 space-y-2" data-testid="di-cartes">
    {dis.map(d=>{const bt=bts.find(b=>b.di===d.code);return <div key={d.code} onClick={()=>onOpenDI(d)} className="rounded-lg border border-slate-700 bg-slate-900/40 p-3 cursor-pointer active:bg-slate-700/40">
     <div className="flex items-start justify-between gap-2"><span className="text-sky-400 font-medium">{d.code}</span><Badge t={d.etat}/></div>
     <div className="text-sm mt-1">{d.eq}</div><div className="text-xs text-slate-400">{d.nom}</div>
     <div className="text-sm text-slate-300 mt-1 break-words">{d.designation}</div>
     <div className="text-xs text-slate-400 mt-1">{typeLabel(d)}{d.dateEvt?" · "+d.dateEvt:""}{d.perturb?<span className="text-rose-400"> · Perturbation</span>:null}</div>
     {bt && <div className="text-xs text-slate-400">BT lié : {bt.code}</div>}
     {d.etat==="À Transmettre" && <div className="mt-2"><Btn cls="bg-sky-600 hover:bg-sky-500 text-white w-full" onClick={(e)=>{e.stopPropagation();onGenererBT(d);}}>Générer BT</Btn></div>}
    </div>;})}
    {dis.length===0 && <div className="text-center text-slate-500 py-4 text-xs">Aucune DI.</div>}
   </div>
   <div className="hidden md:block overflow-x-auto mt-2"><table className="w-full text-sm">
    <thead><tr className="text-slate-400 text-left"><th className="py-1">Code DI</th><th>Équipement</th><th>Demandeur</th><th>Désignation</th><th>Type</th><th>Emplacement</th><th>Date événement</th><th>Perturb.</th><th>BT lié</th><th>État</th><th></th></tr></thead>
    <tbody>{dis.map(d=>{const bt=bts.find(b=>b.di===d.code);return <tr key={d.code} onClick={()=>onOpenDI(d)} className="border-t border-slate-700 align-top cursor-pointer hover:bg-slate-700/40">
     <td className="py-1.5 text-sky-400">{d.code}</td><td>{d.eq}<br/><span className="text-xs text-slate-400">{d.nom}</span></td>
     <td className="text-xs text-slate-400">{d.demandeur||"—"}</td>
     <td className="text-xs text-slate-400 max-w-xs">{d.designation}</td><td className="text-xs text-slate-400">{typeLabel(d)}</td><td className="text-xs text-slate-400">{d.emplacement}</td>
     <td className="text-xs text-slate-400">{d.dateEvt}</td>
     <td>{d.perturb?<span className="text-rose-400">Oui</span>:"Non"}</td>
     <td className="text-xs text-slate-400">{bt?bt.code:"—"}</td>
     <td><Badge t={d.etat}/></td>
     <td>{d.etat==="À Transmettre" && <Btn cls="bg-sky-600 hover:bg-sky-500 text-xs" onClick={(e)=>{e.stopPropagation();onGenererBT(d);}}>Générer BT</Btn>}</td>
    </tr>;})}</tbody>
   </table></div>
  </Card>
 </div>);
}

/* ===== Page 2 : Bons de Travail (générés par la Maintenance, remplis puis clôturés par un autre intervenant) ===== */
function BTPage({bts,pieces,onNouveauBT,onOpenBT}){
 const [filtre,setFiltre]=useState("Tous");
 const liste=bts.filter(b=>filtre==="Tous"||b.etat===filtre);
 const exportBT=()=>exporterXlsx({fichier:"Bons_de_Travail_BT",feuilles:[{nom:"BT",titre:"Bons de Travail (BT)"+(filtre!=="Tous"?" — "+filtre:""),
  colonnes:[{h:"Code BT"},{h:"DI liée"},{h:"Plan préventif"},{h:"Code équipement"},{h:"Équipement"},{h:"Type"},{h:"Assigné à"},{h:"Durée de travail"},{h:"Consignation"},{h:"Travail exceptionnel"},{h:"Consigne / Panne",max:50},{h:"Avancement",t:"pct"},{h:"Coût total (DA)",t:"num"},{h:"État"},{h:"Généré le",t:"datetime"},{h:"Clôturé le",t:"datetime"}],
  lignes:liste.map(b=>[b.code,b.di||"",b.plan||"",b.eq,b.nom,b.type,b.assigne||((b.intervenants||[])[0]?.nom)||"",b.horaire||"Jour",b.consignation||"Non",b.exc?(b.motifExc||"Oui"):"",(b.consigne&&b.consigne!=="-")?b.consigne:((b.panne&&b.panne!=="-")?b.panne:""),avancement(b)===null?"":avancement(b),coutBT(b,pieces).total,b.etat,b.dateGeneration||"",b.dateCloture||""])}]});
 return (<div className="space-y-5">
  <KPI items={[
   ["BT en cours",bts.filter(b=>b.etat==="En cours").length,"text-amber-400"],
   ["En attente pièce",bts.filter(b=>b.etat==="En attente pièce").length,"text-rose-400"],
   ["BT clôturés",bts.filter(b=>b.etat==="Clôturé").length,"text-emerald-400"],
   ["Coût total clôturés (DA)",bts.filter(b=>b.etat==="Clôturé").reduce((s,b)=>s+coutBT(b,pieces).total,0).toLocaleString(),"text-sky-400"],
  ]}/>
  <Card>
   <div className="flex justify-between items-center mb-1 flex-wrap gap-2">
    <div><h2 className="font-semibold text-slate-100">Bons de Travail (BT)</h2><div className="text-xs text-slate-500">Générés par la Maintenance (état « En cours ») — cliquez sur une ligne pour saisir le compte-rendu puis clôturer</div></div>
    <div className="flex gap-2"><ExportBtn onClick={exportBT}/><Btn onClick={onNouveauBT}><span className="flex items-center gap-1">{I.plus} Nouveau BT</span></Btn></div>
   </div>
   <div className="flex flex-wrap gap-1 mt-2">{["Tous","En cours","En attente pièce","Clôturé"].map(f=><Btn key={f} cls={"text-xs "+(filtre===f?"bg-sky-600 text-white":"bg-slate-700 hover:bg-slate-600 text-slate-200")} onClick={()=>setFiltre(f)}>{f}</Btn>)}</div>
   <div className="md:hidden mt-3 space-y-2" data-testid="bt-cartes">
    {liste.map(b=><div key={b.code} onClick={()=>onOpenBT(b)} className="rounded-lg border border-slate-700 bg-slate-900/40 p-3 cursor-pointer active:bg-slate-700/40">
     <div className="flex items-start justify-between gap-2"><span className="text-sky-400 font-medium">{b.code}</span><Badge t={b.etat}/></div>
     <div className="text-sm mt-1">{b.eq}</div><div className="text-xs text-slate-400">{b.nom}</div>
     <div className="flex flex-wrap gap-1 mt-1">{b.horaire==="Nuit" && <span className="px-1.5 rounded bg-indigo-700 text-indigo-50 text-[10px]">🌙 Nuit</span>}{b.consignation==="Oui" && <span className="px-1.5 rounded bg-rose-600 text-rose-50 text-[10px]">Consignation</span>}</div>
     <div className="text-xs text-slate-400 mt-1">{b.type} · {b.assigne||((b.intervenants||[])[0]?.nom)||"non assigné"}{b.di?" · "+b.di:""}</div>
     <div className="text-sm text-slate-300 mt-1 break-words">{b.consigne&&b.consigne!=="-"?b.consigne:(b.panne&&b.panne!=="-"?b.panne:"—")}</div>
     {avancement(b)!==null && <div className="mt-2"><ProgressBar pct={avancement(b)}/></div>}
     <div className="text-xs text-slate-400 mt-1">{coutBT(b,pieces).total.toLocaleString()} DA</div>
    </div>)}
    {liste.length===0 && <div className="text-center text-slate-500 py-4 text-xs">Aucun BT.</div>}
   </div>
   <div className="hidden md:block overflow-x-auto mt-2"><table className="w-full text-sm">
    <thead><tr className="text-slate-400 text-left"><th className="py-1">Code BT</th><th>DI liée</th><th>Équipement</th><th>Type</th><th>Assigné à</th><th>Consigne / Panne</th><th>Avancement</th><th>Coût total</th><th>État</th></tr></thead>
    <tbody>{liste.map(b=><tr key={b.code} onClick={()=>onOpenBT(b)} className="border-t border-slate-700 align-top cursor-pointer hover:bg-slate-700/40">
     <td className="py-1.5 text-sky-400">{b.code}</td><td className="text-xs text-slate-400">{b.di||"—"}</td>
     <td>{b.eq}<br/><span className="text-xs text-slate-400">{b.nom}</span>
      <div className="flex flex-wrap gap-1 mt-0.5">{b.horaire==="Nuit" && <span className="px-1.5 rounded bg-indigo-700 text-indigo-50 text-[10px]">🌙 Nuit</span>}{b.consignation==="Oui" && <span className="px-1.5 rounded bg-rose-600 text-rose-50 text-[10px]">Consignation</span>}</div></td>
     <td>{b.type}</td>
     <td className="text-xs text-slate-400">{b.assigne||((b.intervenants||[])[0]?.nom)||"—"}</td>
     <td className="text-xs text-slate-400 max-w-xs">{b.consigne&&b.consigne!=="-"?b.consigne:(b.panne&&b.panne!=="-"?b.panne:"—")}</td>
     <td>{avancement(b)===null?<span className="text-xs text-slate-600">—</span>:<ProgressBar pct={avancement(b)}/>}</td>
     <td>{coutBT(b,pieces).total.toLocaleString()} DA</td>
     <td><Badge t={b.etat}/></td>
    </tr>)}
    {liste.length===0 && <tr><td colSpan="9" className="text-center text-slate-500 py-4 text-xs">Aucun BT.</td></tr>}</tbody>
   </table></div>
  </Card>
 </div>);
}

function DIDetail({di,bt,onGenererBT,onOpenBT}){
 return (<div className="space-y-3">
  <div className="flex items-center gap-2"><Badge t={di.etat}/>{di.perturb && <span className="text-xs text-rose-400">Perturbation exploitation</span>}</div>
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
   <Info l="Code DI">{di.code}</Info>
   <Info l="Équipement">{di.eq} — {di.nom}</Info>
   <Info l="Demandeur">{di.demandeur||"—"}</Info>
   <Info l="Type de maintenance">{typeLabel(di)}</Info>
   <Info l="Emplacement">{di.emplacement||"—"}</Info>
   <Info l="Date de l'événement">{di.dateEvt}</Info>
   <Info l="Date de création">{di.dateCreation}</Info>
   <Info l="Perturbation exploitation">{di.perturb?"Oui":"Non"}</Info>
  </div>
  <Info l="Désignation (constat)">{di.designation}</Info>
  <div className="border-t border-slate-700 pt-3">
   <div className="text-xs text-slate-500 mb-1">Bon de Travail lié</div>
   {bt ? <div className="flex items-center gap-2 text-sm"><button className="text-sky-400 hover:underline" onClick={onOpenBT}>{bt.code}</button><Badge t={bt.etat}/></div>
       : <div className="text-sm text-slate-400">Aucun BT généré pour cette DI.</div>}
  </div>
  <PiecesJointes collection="dis" recordId={di.code}/>
  {di.etat==="À Transmettre" && <div className="flex justify-end"><Btn onClick={onGenererBT}>Générer le BT</Btn></div>}
 </div>);
}

/* Lecture seule d'un BT clôturé */
function BTReadOnly({bt,pieces}){
 const c=coutBT(bt,pieces);
 const tch=bt.taches||[];
 const lotLabel={pieces:"Pièce",outillage:"Outillage",consommables:"Consommable"};
 return (<div className="space-y-3">
  {tch.length>0 && <div><div className="text-xs text-slate-500 mb-1">Tâches contrôlées ({tch.filter(t=>tRes(t)).length}/{tch.length}) — {tch.filter(t=>tRes(t)==="NOK").length} Non OK</div>
   <ProgressBar pct={avancement(bt)}/>
   {tch.map((t,i)=>{const r=tRes(t);return <div key={i} className="text-xs bg-slate-900 rounded px-2 py-1 mt-1"><div className="flex items-center gap-2"><span className={r==="OK"?"text-emerald-400":r==="NOK"?"text-rose-400":"text-slate-600"}>{r==="OK"?"✓ OK":r==="NOK"?"✗ Non OK":"○"}</span><span>{t.lib}</span></div>{r==="NOK" && <div className="text-slate-400 mt-0.5 pl-1">Commentaire : {t.com||"—"}{t.di ? <span className="text-sky-400"> — DI créée : {t.di}</span> : <span className="text-amber-400"> — Aucune DI créée</span>}</div>}</div>;})}</div>}
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
   {!(bt.type==="Préventive"||bt.plan) && <><Info l="Panne">{bt.panne}</Info><Info l="Cause">{bt.cause}</Info>
   <Info l="Solution">{bt.effet}</Info><Info l="Détection / Gravité">{bt.detection}/4 — {bt.gravite}/4</Info></>}
   <Info l="Durée d'intervention">{bt.dureeIntervention} h</Info><Info l="Temps logistique">{bt.tempsLogistique} h</Info>
  </div>
  <div><div className="text-xs text-slate-500 mb-1">Intervenants</div>
   {(bt.intervenants||[]).length===0 ? <div className="text-xs text-slate-500">—</div> :
    (bt.intervenants||[]).map((it,i)=><div key={i} className="text-xs flex justify-between bg-slate-900 rounded px-2 py-1 mt-1"><span>{it.nom} — {it.fonction} — {it.temps}h × {it.taux} DA/h</span><span>{(it.temps*it.taux).toLocaleString()} DA</span></div>)}
  </div>
  <div><div className="text-xs text-slate-500 mb-1">Matières utilisées</div>
   {["pieces","outillage","consommables"].flatMap(cat=>(bt[cat]||[]).map((it,i)=>{const pc=pieces.find(p=>p.code===it.code);
    return <div key={cat+i} className="text-xs flex justify-between bg-slate-900 rounded px-2 py-1 mt-1"><span>{lotLabel[cat]} {it.code} — {pc?.nom} × {it.qte}</span><span>{(pc?pc.prix*it.qte:0).toLocaleString()} DA</span></div>;}))}
   {["pieces","outillage","consommables"].every(c=>(bt[c]||[]).length===0) && <div className="text-xs text-slate-500">—</div>}
  </div>
  <div className="text-right text-sm text-slate-300">Coût MO: {c.mo.toLocaleString()} DA — Coût Matières: {c.mat.toLocaleString()} DA — <b>Total: {c.total.toLocaleString()} DA</b></div>
 </div>);
}

function BTDetail({bt,pieces,inter,equipements,onSave,onCloturer,onCreateDS}){
 const clos=bt.etat==="Clôturé";
 return (<div>
  <div className="flex items-center flex-wrap gap-x-4 gap-y-2 mb-3">
   <Badge t={bt.etat}/>
   <button onClick={()=>imprimerHtml(btImprimableHtml(bt,{pieces,equipements}))} className="px-3 py-2 md:py-1.5 rounded-lg text-sm font-medium bg-slate-700 hover:bg-slate-600 text-slate-100" data-testid="bt-imprimer">🖨 Imprimer / PDF</button>
   <Info l="Équipement">{bt.eq} — {bt.nom}</Info>
   <Info l="Type">{bt.type}</Info>
   <Info l="DI liée">{bt.di||"—"}</Info>
   {bt.plan && <Info l="Plan préventif">{bt.plan}</Info>}
   <Info l="Assigné à">{bt.assigne||"—"}</Info>
   <Info l="Durée de travail">{(bt.horaire||"Jour")==="Nuit"?"🌙 Nuit":"☀️ Jour"}</Info>
   <Info l="Consignation">{(bt.consignation||"Non")==="Oui"?<span className="px-2 py-0.5 rounded-full text-xs bg-rose-600 text-rose-50">Oui — nécessaire</span>:"Non"}</Info>
   {bt.exc && <Info l="Travail exceptionnel"><span className="text-amber-400">{bt.motifExc||"Oui"}</span></Info>}
   {bt.dateGeneration && <Info l="Généré le">{bt.dateGeneration}</Info>}
   {bt.dateCloture && <Info l="Clôturé le">{bt.dateCloture}</Info>}
  </div>
  {bt.consigne && bt.consigne!=="-" && <div className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-300 mb-2"><span className="text-slate-500">Consigne de la Maintenance : </span>{bt.consigne}</div>}
  {clos ? <BTReadOnly bt={bt} pieces={pieces}/> : <BTFillForm bt={bt} pieces={pieces} inter={inter} equipements={equipements} onSave={onSave} onCloturer={onCloturer} onCreateDS={onCreateDS}/>}
  <PiecesJointes collection="bts" recordId={bt.code}/>
 </div>);
}

function seedEquipements(){
 const data={
  CFO:{SST:["Transformateur HT/BT","Redresseur & Disjoncteur","Jeu de barres & Cellules HTA"],LAC:["Fil de contact & Câble porteur","Isolateur & Console"],ECL:["Armoire BT Station"]},
  CFA:{VDO:["Caméra dôme quai","Enregistreur NVR"],SON:["Haut-parleur quai","Poste d'interphonie"],HOR:["Horloge mère station"]},
  VOIE:{RVB:["Rail UIC60 PK4","Traverse béton"],AIG:["Moteur d'aiguille AIG-12","Aiguillage Voie 3"]},
  BILLETTIQUE:{VAL:["Valideur quai Centrale","Valideur bord Rame 02"],DAT:["DAT station Émir"],PTL:["Portillon accès Gare"]},
  MR:{BOG:["Bogie Rame 02","Disque de frein Rame 04"],TRC:["Onduleur Rame 04"],PRT:["Porte passager Rame 01"],CLM:["Groupe HVAC Rame 03"]},
  ELM:{GRP:["Groupe électrogène Dépôt","TGBT Atelier Central"]},
  BO:{STA:["Abri quai Station Centrale"],DEP:["Bâtiment Atelier Central"],HVI:["Extincteur Atelier"]},
  EQI:{PNT:["Pont roulant 10T"],TOR:["Torus Dépôt Alger"],TRF:["Tour en fosse Atelier"]},
 };
 const out=[];
 Object.entries(data).forEach(([sys,subs])=>Object.entries(subs).forEach(([subCode,noms])=>noms.forEach((nom,i)=>{
  out.push({code:sys+".ALG."+subCode+"."+String(i+1).padStart(2,"0"),system:sys,subCode,unit:"Alger",nom,emplacement:"",sousEquip:[],
   constructeur:{nom:"À définir",contact:"",tel:"",email:""},
   fournisseurs:[{nom:"À définir",tel:"",email:""}],prix:0});
 })));
 return out;
}
const MESURE_SEED=[{code:"M-01",nom:"Multimètre Fluke 117",etalonnage:"2026-03-10",peremption:"2027-03-10",organisme:"ALGERAC"},
 {code:"M-02",nom:"Clé dynamométrique 40Nm",etalonnage:"2025-11-05",peremption:"2026-11-05",organisme:"VERITAS"},
 {code:"M-03",nom:"Mesureur usure caténaire",etalonnage:"2026-01-20",peremption:"2027-01-20",organisme:"APAVE"}];
const ORG_DOM=["Contrôle réglementaire","Étalonnage"];
const ORG_SEED=[
 {code:"ORG-01",nom:"VERITAS",domaines:["Contrôle réglementaire","Étalonnage"],contact:"",tel:"",email:""},
 {code:"ORG-02",nom:"APAVE",domaines:["Contrôle réglementaire","Étalonnage"],contact:"",tel:"",email:""},
 {code:"ORG-03",nom:"ALGERAC",domaines:["Étalonnage","Contrôle réglementaire"],contact:"",tel:"",email:""}];
const PRESTA_SEED=[
 {nom:"SOTEMA Services",mat:"EXT-01",poste:"Prestataire — Matériel roulant",role:"Prestataire",externe:true,systemes:["MR"],taux:2200,contact:"Service maintenance",tel:"",email:"",contrat:"MP-2025-014",dateDebut:"2025-02-01",dateFin:"2027-01-31",cdc:"À préparer",habs:[],conges:[]}];
const CTRL=[{code:"R-01",nom:"Pont roulant 10T Dépôt",organisme:"VERITAS",periodicite:"Annuelle",statut:"Conforme"},
 {code:"R-02",nom:"Réservoir air comprimé Atelier",organisme:"APAVE",periodicite:"Trimestrielle",statut:"Réserves levées"},
 {code:"R-03",nom:"Extincteur Atelier Central",organisme:"ALGERAC",periodicite:"Semestrielle",statut:"À contrôler"}];


function Arbo({unit,equipements,systemsList,treeStruct,onAddEquip,onCreateDI,onOpenEquip,onEditSystem,onEditSubSystem,onAddSystem,onAddSubSystem,onAddSousEquip,onOpenSousEquip,onRemoveSousEquip,mesureList,onAddMesure,onEditMesure,ctrlList,onAddCtrl,onEditCtrl,organismes,onAddOrg,onEditOrg}){
 const [openSys,setOpenSys]=useState(null);
 const [openSub,setOpenSub]=useState(null);
 const [openEq,setOpenEq]=useState(null);
 const [tab,setTab]=useState("arbo");
 const [ctx,setCtx]=useState(null);
 const etiquettes=()=>{
  const si=openSub?parseInt(String(openSub).split("-").pop(),10):-1;
  const sub=openSys&&si>=0?((treeStruct[openSys]||[])[si]||null):null;
  const l=equipements.filter(e=>e.unit===unit&&(!openSys||e.system===openSys)&&(!sub||e.subCode===sub.code)).sort((a,b)=>a.code.localeCompare(b.code));
  if(!l.length) return;
  if(l.length>MAX_ETIQUETTES && !window.confirm(l.length+" équipements : seules les "+MAX_ETIQUETTES+" premières étiquettes seront imprimées. Ouvrez un système ou un sous-système pour réduire la liste. Continuer ?")) return;
  imprimerEtiquettes(l);
 };
 const exportArbo=()=>{
  if(tab==="mesure") return exporterXlsx({fichier:"Appareils_de_Mesure",feuilles:[{nom:"Appareils de mesure",titre:"Appareils de Mesure & Métrologie",
   colonnes:[{h:"Code"},{h:"Désignation"},{h:"Date étalonnage",t:"date"},{h:"Date péremption",t:"date"},{h:"Organisme vérificateur"},{h:"État"}],
   lignes:mesureList.map(m=>[m.code,m.nom,m.etalonnage,m.peremption,m.organisme,expStatus(m.peremption).c])}]});
  if(tab==="org") return exporterXlsx({fichier:"Organismes",feuilles:[{nom:"Organismes",titre:"Organismes de contrôle et d'étalonnage",
   colonnes:[{h:"Code"},{h:"Organisme"},{h:"Domaines"},{h:"Contact"},{h:"Téléphone"},{h:"Email"}],
   lignes:organismes.map(o=>[o.code,o.nom,(o.domaines||[]).join(" / "),o.contact||"",o.tel||"",o.email||""])}]});
  if(tab==="ctrl") return exporterXlsx({fichier:"Controles_Reglementaires",feuilles:[{nom:"Contrôles réglementaires",titre:"Équipements soumis au Contrôle Réglementaire",
   colonnes:[{h:"Code"},{h:"Équipement"},{h:"Organisme de contrôle"},{h:"Périodicité légale"},{h:"Statut / Registre sécurité"}],
   lignes:ctrlList.map(c=>[c.code,c.nom,c.organisme,c.periodicite,c.statut])}]});
  const eqs=equipements.filter(e=>e.unit===unit&&e.system!=="MESURE"&&e.system!=="CTRL");
  const nomSys=(c)=>{const x=systemsList.find(y=>y[0]===c);return c+(x?" — "+x[1]:"");};
  const nomSub=(sys,c)=>{const x=(treeStruct[sys]||[]).find(y=>y.code===c);return c+(x?" — "+x.sub:"");};
  return exporterXlsx({fichier:"Arborescence_Technique_"+unit,feuilles:[
   {nom:"Équipements",titre:"Arborescence Technique — Équipements (Unité "+unit+")",
    colonnes:[{h:"Système"},{h:"Sous-système"},{h:"Code équipement"},{h:"Désignation"},{h:"Emplacement"},{h:"Constructeur"},{h:"Contact constructeur"},{h:"Fournisseur(s)"},{h:"Prix (DA)",t:"num"},{h:"Sous-équipements",t:"num"}],
    lignes:eqs.map(e=>[nomSys(e.system),nomSub(e.system,e.subCode),e.code,e.nom,e.emplacement||"",(e.constructeur||{}).nom||"",[(e.constructeur||{}).contact,(e.constructeur||{}).tel,(e.constructeur||{}).email].filter(Boolean).join("\n"),fmtFourn(e.fournisseurs),e.prix||0,(e.sousEquip||[]).length])},
   {nom:"Sous-équipements",titre:"Arborescence Technique — Sous-équipements (Unité "+unit+")",
    colonnes:[{h:"Code équipement"},{h:"Équipement"},{h:"Code sous-équipement"},{h:"Désignation"},{h:"Fournisseur(s)"}],
    lignes:eqs.flatMap(e=>(e.sousEquip||[]).map(se=>[e.code,e.nom,se.code,se.nom,fmtFourn(se.fournisseurs)]))}]});
 };
 return (<div className="space-y-4">
  <div className="flex flex-wrap gap-2">
   <Btn cls={tab==="arbo"?"bg-sky-600 hover:bg-sky-500":"bg-slate-700 hover:bg-slate-600"} onClick={()=>setTab("arbo")}>Arborescence Technique</Btn>
   <Btn cls={tab==="mesure"?"bg-sky-600 hover:bg-sky-500":"bg-slate-700 hover:bg-slate-600"} onClick={()=>setTab("mesure")}>Appareils de Mesure</Btn>
   <Btn cls={tab==="ctrl"?"bg-sky-600 hover:bg-sky-500":"bg-slate-700 hover:bg-slate-600"} onClick={()=>setTab("ctrl")}>Contrôles Réglementaires</Btn>
   <Btn cls={tab==="org"?"bg-sky-600 hover:bg-sky-500":"bg-slate-700 hover:bg-slate-600"} onClick={()=>setTab("org")}>Organismes</Btn>
   {tab==="arbo" && <Btn cls="bg-emerald-700 hover:bg-emerald-600" onClick={onAddSystem}><span className="flex items-center gap-1">{I.plus} Ajouter un système</span></Btn>}
   {tab==="mesure" && <Btn cls="bg-emerald-700 hover:bg-emerald-600" onClick={onAddMesure}><span className="flex items-center gap-1">{I.plus} Ajouter un appareil</span></Btn>}
   {tab==="org" && <Btn cls="bg-emerald-700 hover:bg-emerald-600" onClick={onAddOrg}><span className="flex items-center gap-1">{I.plus} Ajouter un organisme</span></Btn>}
   {tab==="ctrl" && <Btn cls="bg-emerald-700 hover:bg-emerald-600" onClick={onAddCtrl}><span className="flex items-center gap-1">{I.plus} Ajouter un contrôle</span></Btn>}
   {tab==="arbo" && <Btn cls="bg-slate-700 hover:bg-slate-600 text-slate-100" onClick={etiquettes}>🏷 Étiquettes QR</Btn>}
   <ExportBtn onClick={exportArbo}/>
  </div>

  {tab==="arbo" && <Card>
   <div className="text-xs text-slate-500 mb-2">Code = SYSTÈME.UNITÉ.SOUS-SYSTÈME.N° — ex : CFA.{UNIT_ABBR[unit]}.SLT.01 — clic gauche sur un équipement = fiche (voir/modifier), clic droit = créer une DI</div>
   <div className="space-y-1">
    {systemsList.filter(([c])=>c!=="MESURE"&&c!=="CTRL").map(([code,nom])=>{
     const subs=treeStruct[code]||[];
     const isOpen=openSys===code;
     return (<div key={code}>
      <div className="w-full flex justify-between items-center py-2 px-2 hover:bg-slate-700/40 rounded-lg">
       <button onClick={()=>setOpenSys(isOpen?null:code)} className="flex-1 text-left">
        <span className="font-medium text-slate-100">{code} <span className="text-xs text-slate-400 font-normal">— {nom}</span></span>
       </button>
       <span className="text-xs text-slate-500 mr-2">{subs.length} sous-systèmes</span>
       <button className="text-xs text-slate-400 hover:text-sky-400 mr-2" onClick={()=>onEditSystem(code,nom)} title="Modifier le nom du système">✎</button>
       <Btn cls="bg-slate-700 hover:bg-slate-600 text-xs" onClick={()=>onAddSubSystem(code)}>+ Sous-système</Btn>
       <button onClick={()=>setOpenSys(isOpen?null:code)} className="ml-2 text-xs text-slate-500">{isOpen?"▲":"▼"}</button>
      </div>
      {isOpen && <div className="pl-4 border-l border-slate-700 ml-2 space-y-1">
       {subs.length===0 && <div className="text-xs text-slate-600 py-1">Aucun sous-système. Utilisez "+ Sous-système" ci-dessus.</div>}
       {subs.map((s,si)=>{
        const subKey=code+"-"+si; const subOpen=openSub===subKey;
        const eqs=equipements.filter(e=>e.system===code && e.subCode===s.code && e.unit===unit);
        return (<div key={subKey}>
         <div className="w-full flex justify-between items-center py-1.5 px-2 hover:bg-slate-700/30 rounded text-sm">
          <button onClick={()=>setOpenSub(subOpen?null:subKey)} className="flex-1 text-left">
           <span className="text-slate-200">{s.sub} <span className="text-xs text-slate-500">({code}.{UNIT_ABBR[unit]}.{s.code})</span></span>
          </button>
          <span className="text-xs text-slate-500 mr-2">{eqs.length} équip.</span>
          <button className="text-xs text-slate-400 hover:text-sky-400 mr-2" onClick={()=>onEditSubSystem(code,s.code,s.sub)} title="Modifier le nom du sous-système">✎</button>
          <button onClick={()=>setOpenSub(subOpen?null:subKey)} className="text-xs text-slate-500">{subOpen?"▲":"▼"}</button>
         </div>
         {subOpen && <div className="pl-4 border-l border-slate-800 ml-2">
          <ul>{eqs.map(e=>{
           const eqOpen=openEq===e.code; const sousList=e.sousEquip||[];
           return <li key={e.code} className="py-0.5">
            <div className="flex items-center text-xs text-slate-400">
             <span onClick={()=>onOpenEquip(e)} onContextMenu={ev=>{ev.preventDefault();setCtx({x:ev.clientX,y:ev.clientY,equip:e});}} className="flex-1 py-1 cursor-pointer hover:text-sky-400">• <span className="text-slate-300">{e.code}</span> — {e.nom}</span>
             {sousList.length>0 && <span className="text-slate-600 mr-1">{sousList.length} sous-équip.</span>}
             <button className="text-slate-500 hover:text-sky-400 px-1" title="Sous-équipements" onClick={()=>setOpenEq(eqOpen?null:e.code)}>{eqOpen?"▲":"▼"}</button>
            </div>
            {eqOpen && <div className="pl-4 border-l border-slate-800 ml-2">
             <ul>{sousList.map(se=><li key={se.code} onClick={()=>onOpenSousEquip(e,se)} onContextMenu={ev=>{ev.preventDefault();setCtx({x:ev.clientX,y:ev.clientY,equip:e,sous:se});}} className="text-xs text-slate-500 py-0.5 flex justify-between items-center group cursor-pointer hover:text-sky-400">
              <span>◦ <span className="text-slate-400">{se.code}</span> — {se.nom}</span>
              <button className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-rose-400 px-1" title="Retirer" onClick={ev=>{ev.stopPropagation();onRemoveSousEquip(e.code,se.code);}}>{I.x}</button>
             </li>)}
             {sousList.length===0 && <li className="text-xs text-slate-700 py-0.5">Aucun sous-équipement.</li>}
             </ul>
             <Btn cls="bg-slate-700 hover:bg-slate-600 text-xs mt-1" onClick={()=>onAddSousEquip(e)}>+ Ajouter un sous-équipement</Btn>
            </div>}
           </li>;})}
          {eqs.length===0 && <li className="text-xs text-slate-600 py-1">Aucun équipement pour cette unité.</li>}
          </ul>
          <Btn cls="bg-slate-700 hover:bg-slate-600 text-xs mt-1" onClick={()=>onAddEquip(code,s.code,s.sub)}>+ Ajouter un équipement</Btn>
         </div>}
        </div>);
       })}
      </div>}
     </div>);
    })}
   </div>
  </Card>}

  {tab==="mesure" && <Card>
   <h2 className="font-semibold text-slate-100 mb-2">Appareils de Mesure & Métrologie</h2>
   <div className="text-xs text-slate-500 mb-2">Cliquez sur une ligne pour voir/modifier sa fiche.</div>
   <div className="overflow-x-auto"><table className="w-full text-sm">
    <thead><tr className="text-slate-400 text-left"><th className="py-1">Code</th><th>Désignation</th><th>Date étalonnage</th><th>Date péremption</th><th>Organisme vérificateur</th><th>État</th></tr></thead>
    <tbody>{mesureList.map(m=>{const s=expStatus(m.peremption);return(<tr key={m.code} onClick={()=>onEditMesure(m)} className="border-t border-slate-700 cursor-pointer hover:bg-slate-700/30">
     <td className="py-1.5">{m.code}</td><td>{m.nom}</td><td className="text-xs text-slate-400">{m.etalonnage}</td>
     <td className="text-xs text-slate-400">{m.peremption}</td><td className="text-xs text-slate-400">{m.organisme}</td>
     <td><span className={"px-2 py-0.5 rounded-full text-xs "+s.cl}>{s.c}</span></td>
    </tr>);})}</tbody>
   </table></div>
  </Card>}

  {tab==="ctrl" && <Card>
   <h2 className="font-semibold text-slate-100 mb-2">Équipements soumis au Contrôle Réglementaire</h2>
   <div className="text-xs text-slate-500 mb-2">Cliquez sur une ligne pour voir/modifier sa fiche.</div>
   <div className="overflow-x-auto"><table className="w-full text-sm">
    <thead><tr className="text-slate-400 text-left"><th className="py-1">Code</th><th>Équipement</th><th>Organisme de contrôle</th><th>Périodicité légale</th><th>Statut / Registre sécurité</th></tr></thead>
    <tbody>{ctrlList.map(c=><tr key={c.code} onClick={()=>onEditCtrl(c)} className="border-t border-slate-700 cursor-pointer hover:bg-slate-700/30">
     <td className="py-1.5">{c.code}</td><td>{c.nom}</td><td className="text-xs text-slate-400">{c.organisme}</td>
     <td className="text-xs text-slate-400">{c.periodicite}</td>
     <td><span className={"px-2 py-0.5 rounded-full text-xs "+(c.statut==="Conforme"||c.statut==="Réserves levées"?"bg-emerald-600 text-emerald-50":c.statut==="Non conforme"?"bg-rose-600 text-rose-50":"bg-amber-600 text-amber-50")}>{c.statut}</span></td>
    </tr>)}</tbody>
   </table></div>
  </Card>}

  {tab==="org" && <Card>
   <h2 className="font-semibold text-slate-100 mb-2">Organismes de contrôle et d'étalonnage</h2>
   <div className="text-xs text-slate-500 mb-2">Ces organismes sont proposés dans les fiches « Appareils de Mesure » (étalonnage) et « Contrôles Réglementaires ». Cliquez sur une ligne pour la modifier.</div>
   <div className="overflow-x-auto"><table className="w-full text-sm">
    <thead><tr className="text-slate-400 text-left"><th className="py-1">Code</th><th>Organisme</th><th>Domaines</th><th>Contact</th><th>Téléphone</th><th>Email</th></tr></thead>
    <tbody>{organismes.map(o=><tr key={o.code} onClick={()=>onEditOrg(o)} className="border-t border-slate-700 cursor-pointer hover:bg-slate-700/30">
     <td className="py-1.5">{o.code}</td><td className="font-medium">{o.nom}</td>
     <td>{(o.domaines||[]).map(d=><span key={d} className="mr-1 px-2 py-0.5 rounded-full text-xs bg-slate-700 text-slate-200">{d}</span>)}</td>
     <td className="text-xs text-slate-400">{o.contact||"—"}</td><td className="text-xs text-slate-400">{o.tel||"—"}</td><td className="text-xs text-slate-400">{o.email||"—"}</td>
    </tr>)}</tbody>
   </table></div>
  </Card>}

  {ctx && <>
   <div className="fixed inset-0 z-40" onClick={()=>setCtx(null)}></div>
   <div className="fixed z-50 bg-slate-800 border border-slate-600 rounded-lg shadow-xl text-xs overflow-hidden" style={{left:ctx.x,top:ctx.y}}>
    <button className="block w-full text-left px-3 py-2 hover:bg-slate-700 text-slate-100" onClick={()=>{onCreateDI(ctx.sous?{code:ctx.equip.code,nom:ctx.equip.nom+" — "+ctx.sous.code+" "+ctx.sous.nom}:ctx.equip);setCtx(null);}}>Créer une DI pour {ctx.sous?ctx.sous.code+" — "+ctx.sous.nom:ctx.equip.code}</button>
    {ctx.sous && <button className="block w-full text-left px-3 py-2 hover:bg-slate-700 text-slate-100 border-t border-slate-700" onClick={()=>{onOpenSousEquip(ctx.equip,ctx.sous);setCtx(null);}}>Voir la fiche {ctx.sous.code}</button>}
   </div>
  </>}
 </div>);
}

function Planning({planning,bts,systemsList,unit,onAdd,onEdit,onDeclencher,onDeclencherLot,onOpenBT}){
 const [fsys,setFsys]=useState("Tous");
 const [cal,setCal]=useState(false);
 const today=todayStr();
 const rows=planning.filter(p=>p.unit===unit&&(fsys==="Tous"||p.sys===fsys)).map(p=>{
  const bt=bts.find(b=>b.plan===p.code&&b.etat!=="Clôturé");
  return {p,bt,etat:bt?"En cours":(p.termine?"Terminé":(p.date<today?"En retard":"Planifié"))};
 });
 const cnt=(e)=>rows.filter(r=>r.etat===e).length;
 const exportPlanning=()=>exporterXlsx({fichier:"Planning_Preventif",feuilles:[{nom:"Planning préventif",titre:"Planning Préventif — Unité "+unit,
  colonnes:[{h:"Plan"},{h:"Système"},{h:"Code équipement"},{h:"Équipement"},{h:"Périodicité"},{h:"Échéance",t:"date"},{h:"Dernier passage",t:"date"},{h:"Nb tâches",t:"num"},{h:"Assigné(s)"},{h:"Durée de travail"},{h:"Consignation"},{h:"Travail exceptionnel"},{h:"BT ouvert"},{h:"Avancement du BT",t:"pct"},{h:"État"}],
  lignes:rows.map(({p,bt,etat})=>[p.code,p.sys,p.eq,p.nom,p.periode+(isPeriodePlan(p)?" (du "+p.debut.split("-").reverse().join("/")+" au "+p.fin.split("-").reverse().join("/")+")":""),p.date,p.dernier||"",p.taches.length,(p.assignes||[]).join(", "),p.horaire||"Jour",p.consignation||"Non",p.exc?(p.motifExc||"Oui"):"",bt?bt.code:"",bt?(avancement(bt)||0):"",etat])}]});
 return (<div className="space-y-4">
  <KPI items={[["Plans préventifs",rows.length,"text-sky-400"],["Planifiés",cnt("Planifié"),"text-slate-300"],["En cours (BT ouvert)",cnt("En cours"),"text-amber-400"],["En retard",cnt("En retard"),"text-rose-400"]]}/>
  <PlageDeclenchement rows={rows} bts={bts} onDeclencherLot={onDeclencherLot}/>
  <Card>
   <div className="flex flex-wrap justify-between items-end gap-3 mb-2">
    <div>
     <h2 className="font-semibold text-slate-100">Planning Préventif</h2>
     <div className="text-xs text-slate-500">Cliquez sur « Déclencher » pour générer le BT préventif d'un plan. Le BT ne pourra être clôturé qu'à 100 % des tâches réalisées.</div>
    </div>
    <div className="flex gap-2 items-end">
     <div><div className="text-xs text-slate-400 mb-1">Système</div>
      <select value={fsys} onChange={e=>setFsys(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm">
       <option value="Tous">Tous</option>{systemsList.map(([c,n])=><option key={c} value={c}>{c} — {n}</option>)}
      </select></div>
     <ExportBtn onClick={exportPlanning}/>
     <Btn cls="bg-violet-700 hover:bg-violet-600" onClick={()=>setCal(true)}><span className="flex items-center gap-1">{I.cal} Calendrier / Agenda</span></Btn>
     <Btn cls="bg-emerald-700 hover:bg-emerald-600" onClick={onAdd}><span className="flex items-center gap-1">{I.plus} Nouveau plan</span></Btn>
    </div>
   </div>
   <div className="overflow-x-auto"><table className="w-full text-sm">
    <thead><tr className="text-slate-400 text-left"><th className="py-1">Plan</th><th>Système</th><th>Équipement</th><th>Périodicité</th><th>Échéance</th><th>Tâches</th><th>Assigné</th><th>Avancement du BT</th><th>État</th><th></th></tr></thead>
    <tbody>{rows.length===0 && <tr><td colSpan="10" className="text-xs text-slate-500 py-3 text-center">Aucun plan préventif pour cette unité.</td></tr>}
    {rows.map(({p,bt,etat})=><tr key={p.code} onClick={()=>onEdit(p)} className="border-t border-slate-700 align-top cursor-pointer hover:bg-slate-700/40">
     <td className="py-1.5 text-sky-400">{p.code}</td><td className="text-xs">{p.sys}</td>
     <td>{p.eq}<br/><span className="text-xs text-slate-400">{p.nom}</span></td>
     <td className="text-xs text-slate-400">{p.periode}{isPeriodePlan(p) && <div className="text-slate-500">du {p.debut.split("-").reverse().join("/")} au {p.fin.split("-").reverse().join("/")}</div>}</td><td className="text-xs text-slate-400">{p.date}{p.exc && <div className="text-amber-400" title={p.motifExc}>Exceptionnel</div>}{p.dernier && <div className="text-slate-500">Dernier : {p.dernier}</div>}</td>
     <td className="text-xs text-slate-400">{p.taches.length}</td><td className="text-xs text-sky-400">{(p.assignes||[]).join(", ")||"—"}</td>
     <td>{bt?<div><div className="text-xs text-slate-400 mb-0.5">{bt.code}</div><ProgressBar pct={avancement(bt)||0}/></div>:<span className="text-xs text-slate-600">—</span>}</td>
     <td><Badge t={etat}/></td>
     <td>{!bt && !p.termine && <Btn cls="bg-sky-600 hover:bg-sky-500 text-xs" onClick={(e)=>{e.stopPropagation();onDeclencher(p);}}>Déclencher</Btn>}</td>
    </tr>)}</tbody>
   </table></div>
  </Card>
  {cal && <Modal wide="xl" title="Agenda des BT préventifs à réaliser" onClose={()=>setCal(false)}>
   <CalendrierBT rows={rows} bts={bts} onDeclencher={onDeclencher} onOpenBT={(c)=>{setCal(false);onOpenBT(c);}}/>
  </Modal>}
 </div>);
}

// Dates de déclenchement prévues d'un plan dans la plage [deb, fin] (à partir de sa prochaine échéance, selon sa périodicité)

function PlageDeclenchement({rows,bts,onDeclencherLot}){
 const y=new Date().getFullYear();
 const [deb,setDeb]=useState(y+"-01-01");
 const [fin,setFin]=useState(y+"-12-31");
 const frD=(s)=>s.split("-").reverse().join("/");
 const valide=!!deb&&!!fin&&fin>=deb;
 const preset=(mois)=>{const a=parseD(todayStr());const b=addMonths(a,mois);b.setDate(b.getDate()-1);setDeb(fmtD(a));setFin(fmtD(b));};
 const lignes=valide?rows.map(({p,bt})=>({p,bt,dates:datesPlanDansPlage(p,deb,fin)})):[];
 const total=lignes.reduce((n,l)=>n+l.dates.length,0);
 const eligibles=lignes.filter(l=>l.dates.length>0 && !l.bt);
 const [confirm,setConfirm]=useState(false);
 function lancer(){ onDeclencherLot(eligibles.map(l=>l.p.code)); setConfirm(false); }
 const declenches=lignes.filter(l=>l.bt&&l.dates[0]===l.p.date).length;
 const realises=valide?bts.filter(b=>b.plan&&b.etat==="Clôturé"&&rows.some(r=>r.p.code===b.plan)&&(b.dateCloture||"").slice(0,10)>=deb&&(b.dateCloture||"").slice(0,10)<=fin).length:0;
 const parMois={}; lignes.forEach(l=>l.dates.forEach(d=>{const k=d.slice(0,7);parMois[k]=(parMois[k]||0)+1;}));
 const moisCles=Object.keys(parMois).sort();
 const iCls="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-100";
 return (<Card>
  <div className="flex flex-wrap items-end justify-between gap-3">
   <div>
    <h2 className="font-semibold text-slate-100">Plage de déclenchement — total des BT prévus</h2>
    <div className="text-xs text-slate-500">Choisissez une période : le total des BT préventifs à déclencher est calculé à partir de l'échéance et de la périodicité de chaque plan (filtre Système appliqué).</div>
   </div>
   <div className="flex flex-wrap items-end gap-2">
    <div><div className="text-xs text-slate-400 mb-1">Du</div><input type="date" value={deb} onChange={e=>setDeb(e.target.value)} className={iCls}/></div>
    <div><div className="text-xs text-slate-400 mb-1">Au</div><input type="date" value={fin} onChange={e=>setFin(e.target.value)} className={iCls}/></div>
    {[[3,"3 mois"],[6,"6 mois"],[12,"12 mois"]].map(([m,l])=><Btn key={m} cls="bg-slate-700 hover:bg-slate-600 text-xs" onClick={()=>preset(m)}>{l}</Btn>)}
    <Btn cls="bg-slate-700 hover:bg-slate-600 text-xs" onClick={()=>{setDeb(y+"-01-01");setFin(y+"-12-31");}}>Année {y}</Btn>
   </div>
  </div>
  {valide && eligibles.length>0 && <div className="flex justify-end mt-3">
   {!confirm ? <Btn cls="bg-emerald-600 hover:bg-emerald-500" onClick={()=>setConfirm(true)}>{"Déclencher toutes les visites prévues ("+eligibles.length+")"}</Btn>
    : <div className="flex items-center gap-2 text-sm">
       <span className="text-slate-300">Générer {eligibles.length} BT préventif{eligibles.length>1?"s":""} pour la plage {frD(deb)} → {frD(fin)} ?</span>
       <Btn cls="bg-emerald-600 hover:bg-emerald-500 text-xs" onClick={lancer}>Confirmer</Btn>
       <Btn cls="bg-slate-700 hover:bg-slate-600 text-xs" onClick={()=>setConfirm(false)}>Annuler</Btn>
      </div>}
  </div>}
  {valide && eligibles.length===0 && total>0 && <div className="text-xs text-slate-500 mt-3 text-right">Toutes les visites prévues sur cette plage ont déjà un BT en cours.</div>}
  {!valide ? <div className="text-xs text-rose-400 mt-3">La date de fin doit être postérieure ou égale à la date de début.</div> : <>
   <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-3"><div className="text-xs text-slate-400">BT prévus sur la plage</div><div className="text-2xl font-bold text-sky-400">{total}</div><div className="text-xs text-slate-500">du {frD(deb)} au {frD(fin)}</div></div>
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-3"><div className="text-xs text-slate-400">Dont déjà déclenchés (BT ouvert)</div><div className="text-2xl font-bold text-amber-400">{declenches}</div></div>
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-3"><div className="text-xs text-slate-400">BT préventifs clôturés sur la plage</div><div className="text-2xl font-bold text-emerald-400">{realises}</div></div>
   </div>
   {moisCles.length>0 && <div className="flex flex-wrap gap-1.5 mt-3">{moisCles.map(k=><span key={k} className="text-xs bg-slate-900 border border-slate-700 rounded-full px-2.5 py-1 text-slate-300">{MOIS[Number(k.slice(5))-1].slice(0,4)}. {k.slice(0,4)} : <b className="text-sky-400">{parMois[k]}</b></span>)}</div>}
   <div className="overflow-x-auto mt-3"><table className="w-full text-sm">
    <thead><tr className="text-slate-400 text-left"><th className="py-1">Plan</th><th>Équipement</th><th>Périodicité</th><th>BT prévus</th><th>Dates de déclenchement</th></tr></thead>
    <tbody>{lignes.filter(l=>l.dates.length>0).length===0 && <tr><td colSpan="5" className="text-xs text-slate-500 py-2 text-center">Aucun déclenchement prévu sur cette plage.</td></tr>}
    {lignes.filter(l=>l.dates.length>0).map(({p,dates})=><tr key={p.code} className="border-t border-slate-700 align-top">
     <td className="py-1.5 text-sky-400">{p.code}</td><td>{p.eq}<br/><span className="text-xs text-slate-400">{p.nom}</span></td>
     <td className="text-xs text-slate-400">{p.periode}</td><td className="font-semibold">{dates.length}</td>
     <td className="text-xs text-slate-400">{dates.slice(0,8).map(frD).join(", ")}{dates.length>8 && " … "+frD(dates[dates.length-1])}</td>
    </tr>)}
    {total>0 && <tr className="border-t border-slate-600"><td colSpan="3" className="py-1.5 text-right text-xs text-slate-400">Total</td><td className="font-bold text-sky-400">{total}</td><td></td></tr>}
    </tbody>
   </table></div>
  </>}
 </Card>);
}

const DOT={"Planifié":"bg-sky-500","En cours":"bg-amber-500","En retard":"bg-rose-500","Réalisé":"bg-emerald-500"};

function CalendrierBT({rows,bts,onDeclencher,onOpenBT}){
 const now=new Date(); const today=fmtD(now);
 const [cur,setCur]=useState(new Date(now.getFullYear(),now.getMonth(),1));
 const [sel,setSel]=useState(today);
 const y=cur.getFullYear(), m=cur.getMonth();
 const limit=new Date(y,m+1,0);
 // Occurrences : prochaine échéance de chaque plan puis projection selon la périodicité + BT réalisés
 const events=[];
 rows.forEach(({p,bt,etat})=>{
  if(isPeriodePlan(p)){
   if(p.termine && !bt) return;
   occurrencesPlan(p).filter(x=>x>=p.date && parseD(x)<=limit).forEach((x,i)=>events.push({key:p.code+"-"+x,date:x,p,bt:i===0?bt:null,etat:i===0?etat:"Planifié",first:i===0}));
   return;
  }
  const base=parseD(p.date);
  for(let i=0;i<300;i++){
   const d=occurrence(base,p.periode,i); if(d>limit) break;
   events.push({key:p.code+"-"+fmtD(d),date:fmtD(d),p,bt:i===0?bt:null,etat:i===0?etat:"Planifié",first:i===0});
  }
 });
 bts.filter(b=>b.plan && b.etat==="Clôturé").forEach(b=>{
  const r=rows.find(x=>x.p.code===b.plan); if(!r) return;
  const dt=(b.dateCloture||b.dateGeneration||"").slice(0,10); if(!dt) return;
  events.push({key:b.code,date:dt,p:r.p,bt:b,etat:"Réalisé",first:false});
 });
 const byDay={}; events.forEach(e=>{(byDay[e.date]=byDay[e.date]||[]).push(e);});
 const prefix=y+"-"+padN(m+1);
 const monthEvents=events.filter(e=>e.date.startsWith(prefix)).sort((a,b)=>a.date.localeCompare(b.date));
 const offset=(new Date(y,m,1).getDay()+6)%7;
 const nbJours=new Date(y,m+1,0).getDate();
 const cells=[]; for(let i=0;i<offset;i++) cells.push(null); for(let d=1;d<=nbJours;d++) cells.push(d);
 const selEvents=byDay[sel]||[];
 const go=(n)=>setCur(new Date(y,m+n,1));
 return (<div>
  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
   <div className="flex items-center gap-1">
    <Btn cls="bg-slate-700 hover:bg-slate-600" onClick={()=>go(-1)}>‹</Btn>
    <div className="text-slate-100 font-semibold w-44 text-center">{MOIS[m]} {y}</div>
    <Btn cls="bg-slate-700 hover:bg-slate-600" onClick={()=>go(1)}>›</Btn>
    <Btn cls="bg-slate-700 hover:bg-slate-600 text-xs ml-2" onClick={()=>{setCur(new Date(now.getFullYear(),now.getMonth(),1));setSel(today);}}>Aujourd'hui</Btn>
   </div>
   <div className="flex flex-wrap gap-3 text-xs text-slate-400">{Object.keys(DOT).map(k=><span key={k} className="flex items-center gap-1"><span className={"w-2.5 h-2.5 rounded-full "+DOT[k]}></span>{k}</span>)}</div>
  </div>
  <div className="grid md:grid-cols-3 gap-4">
   <div className="md:col-span-2">
    <div className="grid grid-cols-7 gap-1 text-xs text-slate-500 text-center mb-1">{JOURS.map(j=><div key={j}>{j}</div>)}</div>
    <div className="grid grid-cols-7 gap-1">{cells.map((d,i)=>{
     if(d===null) return <div key={"b"+i}></div>;
     const ds=prefix+"-"+padN(d); const ev=byDay[ds]||[];
     const fe=ferieAt(ds), we=!fe&&JOURS_WEEKEND.includes(parseD(ds).getDay());
     return <button key={ds} type="button" onClick={()=>setSel(ds)} title={fe?fe.nom:undefined} className={"min-h-[64px] text-left rounded-lg border p-1 flex flex-col gap-0.5 "+(sel===ds?"border-sky-500 bg-sky-900/30":fe?"border-rose-700 bg-rose-900/30 hover:bg-rose-900/40":we?"border-slate-800 bg-slate-800/60 opacity-80 hover:bg-slate-700/40":"border-slate-700 bg-slate-900 hover:bg-slate-700/40")}>
      <span className={"text-xs "+(ds===today?"bg-sky-600 text-white rounded-full w-5 h-5 flex items-center justify-center":fe?"text-rose-300":"text-slate-400")}>{d}</span>
      {fe && <span className="text-[10px] text-rose-300 truncate">🎌 {fe.nom}</span>}
      {ev.slice(0,2).map(e=><span key={e.key} className="flex items-center gap-1 text-[10px] text-slate-300 truncate"><span className={"w-1.5 h-1.5 rounded-full shrink-0 "+DOT[e.etat]}></span><span className="truncate">{e.p.nom}</span></span>)}
      {ev.length>2 && <span className="text-[10px] text-slate-500">+{ev.length-2} autre(s)</span>}
     </button>;})}</div>
   </div>
   <div className="space-y-3">
    <div>
     <div className="text-sm text-slate-100 font-medium">Agenda du {parseD(sel).toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long"})}</div>
     {nonOuvre(sel) && <div className="mt-1 rounded-lg border border-rose-700 bg-rose-900/30 px-2 py-1 text-xs text-rose-300">🎌 {nonOuvre(sel).type==="ferie"?"Jour férié : ":""}{nonOuvre(sel).nom} — travail possible uniquement à titre exceptionnel</div>}
     {selEvents.length===0 && <div className="text-xs text-slate-500 mt-1">Aucun BT prévu ce jour.</div>}
     {selEvents.map(e=><div key={e.key} className="bg-slate-900 border border-slate-700 rounded-lg p-2 mt-2">
      <div className="flex justify-between items-start gap-2">
       <div><div className="text-sm text-sky-400">{e.p.code} <span className="text-slate-300">— {e.p.nom}</span></div><div className="text-xs text-slate-500">{e.p.eq} · {e.p.periode}</div></div>
       <Badge t={e.etat}/>
      </div>
      <div className="text-xs text-slate-400 mt-1">{e.p.taches.length} tâche(s) · Intervenants : {(e.p.assignes||[]).join(", ")||"à définir"}</div>
      {((e.p.outillage||[]).length>0||(e.p.consommables||[]).length>0) && <div className="text-xs text-slate-500">Outillage : {(e.p.outillage||[]).length} · Consommables : {(e.p.consommables||[]).length}</div>}
      <div className="flex gap-1 mt-2">
       {e.bt && <Btn cls="bg-slate-700 hover:bg-slate-600 text-xs" onClick={()=>onOpenBT(e.bt.code)}>Ouvrir {e.bt.code}</Btn>}
       {e.first && !e.bt && e.etat!=="Réalisé" && <Btn cls="bg-sky-600 hover:bg-sky-500 text-xs" onClick={()=>onDeclencher(e.p)}>Déclencher le BT</Btn>}
      </div>
     </div>)}
    </div>
    <div className="border-t border-slate-700 pt-2">
     <div className="text-xs text-slate-400 font-medium">BT du mois ({monthEvents.length})</div>
     {monthEvents.length===0 && <div className="text-xs text-slate-600 mt-1">Aucun BT ce mois-ci.</div>}
     {monthEvents.map(e=><button type="button" key={e.key} onClick={()=>setSel(e.date)} className="w-full flex items-center gap-2 text-xs text-left hover:bg-slate-700/40 rounded px-1 py-1"><span className={"w-2 h-2 rounded-full shrink-0 "+DOT[e.etat]}></span><span className="text-slate-500 w-14 shrink-0">{e.date.slice(8)}/{e.date.slice(5,7)}</span><span className="text-slate-300 truncate">{e.p.nom}</span></button>)}
    </div>
   </div>
  </div>
 </div>);
}

// Prochaines échéances d'un plan (12 mois) pour prévenir d'un congé sur une occurrence ultérieure
function PlanForm({mode,item,systemsList,equipements,inter,pieces,onSubmit}){
 const isEdit=mode==="edit";
 const [f,setF]=useState(isEdit?{code:item.code,sys:item.sys,eq:item.eq,nom:item.nom,periode:item.periode,date:item.date,assignes:item.assignes||(item.assigne?[item.assigne]:[]),exc:!!item.exc,motifExc:item.motifExc||"",horaire:item.horaire||"Jour",consignation:item.consignation||"Non"}
  :{code:null,sys:"",eq:"",nom:"",periode:"Mensuel",date:todayStr(),assignes:[],exc:false,motifExc:"",horaire:"Jour",consignation:"Non"});
 const [taches,setTaches]=useState(isEdit?[...item.taches]:[]);
 const [outil,setOutil]=useState(isEdit?[...(item.outillage||[])]:[]);
 const [conso,setConso]=useState(isEdit?[...(item.consommables||[])]:[]);
 const [nt,setNt]=useState("");
 const [err,setErr]=useState("");
 const selCls="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm mt-1";
 const liste=equipements.filter(e=>e.system===f.sys);
 function addT(){ if(!nt.trim()) return; setTaches(l=>[...l,nt.trim()]); setNt(""); }
 function valider(){
  if(!f.sys){setErr("Choisissez un système.");return;}
  if(!f.eq){setErr("Choisissez un équipement.");return;}
  if(taches.length===0){setErr("Ajoutez au moins une tâche à réaliser.");return;}
  if(nonOuvre(f.date)&&!f.exc){setErr("La date tombe un jour non ouvré ("+nonOuvre(f.date).nom+") : changez la date ou cochez « Travail exceptionnel confirmé ».");return;}
  if(nonOuvre(f.date)&&!f.motifExc.trim()){setErr("Indiquez le motif du travail exceptionnel.");return;}
  const enConge=f.assignes.map(n=>({n,c:congeAt(inter.find(x=>x.nom===n),f.date)})).filter(x=>x.c);
  if(enConge.length){setErr("Changez l'intervenant : "+enConge.map(x=>x.n+" est en congé "+libConge(x.c)).join(" ; ")+".");return;}
  onSubmit({mode,data:{...f,exc:!!nonOuvre(f.date)&&f.exc,motifExc:nonOuvre(f.date)&&f.exc?f.motifExc.trim():"",debut:undefined,fin:undefined,intervalle:undefined,auto:undefined,avance:undefined,termine:false,taches,outillage:outil,consommables:conso}});
 }
 return (<div>
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
   <Field label="Système">
    <select value={f.sys} onChange={e=>setF({...f,sys:e.target.value,eq:"",nom:""})} className={selCls}>
     <option value="">— Choisir un système —</option>{systemsList.map(([c,n])=><option key={c} value={c}>{c} — {n}</option>)}
    </select>
   </Field>
   <Field label="Équipement">
    <select value={f.eq} disabled={!f.sys} onChange={e=>{const q=liste.find(x=>x.code===e.target.value);setF({...f,eq:q?q.code:"",nom:q?q.nom:""});}} className={selCls}>
     <option value="">{f.sys?"— Choisir un équipement —":"Choisissez d'abord le système"}</option>{liste.map(e=><option key={e.code} value={e.code}>{e.code} — {e.nom}</option>)}
    </select>
   </Field>
   <Field label="Périodicité"><select value={f.periode} onChange={e=>setF({...f,periode:e.target.value})} className={selCls}>{PERIODES.map(x=><option key={x}>{x}</option>)}</select></Field>
   <Field label="Prochaine échéance"><input type="date" value={f.date} onChange={e=>setF({...f,date:e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-100 mt-1"/></Field>
  </div>
  {nonOuvre(f.date) && <div className="mt-2 rounded-lg border border-amber-700 bg-amber-900/20 px-2 py-2 text-xs text-amber-400">
   🎌 Cette échéance tombe un jour non ouvré : <b>{nonOuvre(f.date).nom}</b>. Changez la date, ou confirmez un travail exceptionnel.
   <label className="flex items-center gap-1 mt-1 text-slate-200"><input type="checkbox" checked={f.exc} onChange={e=>setF({...f,exc:e.target.checked})}/> Travail exceptionnel confirmé</label>
   {f.exc && <input value={f.motifExc} onChange={e=>setF({...f,motifExc:e.target.value})} placeholder="Motif (ex: arrêt de nuit, intervention urgente...)" className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-100 mt-1"/>}
  </div>}
  <HoraireConsignation v={f} onChange={o=>setF({...f,...o})}/>
  <div className="text-xs text-slate-400 mb-1 mt-2">Intervenants assignés (plusieurs possibles, optionnel) — {f.assignes.length} sélectionné(s)</div>
  <MultiInter inter={interPourSys(inter,f.sys)} value={f.assignes} onChange={v=>setF({...f,assignes:v})} sys={f.sys} date={f.date} extraDates={datesFuturesPlan(f)}/>
  <div className="text-xs text-slate-400 mt-3 font-medium">Tâches à réaliser à chaque déclenchement ({taches.length})</div>
  {taches.map((t,i)=><div key={i} className="text-xs flex justify-between items-center bg-slate-900 rounded px-2 py-1 mt-1"><span>{i+1}. {t}</span><button className="text-slate-500 hover:text-rose-400" onClick={()=>setTaches(l=>l.filter((_,j)=>j!==i))}>{I.x}</button></div>)}
  <div className="flex gap-1 mt-2">
   <input value={nt} onChange={e=>setNt(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();addT();}}} placeholder="ex: Contrôler le serrage des fixations" className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm"/>
   <Btn cls="bg-slate-700 hover:bg-slate-600 text-xs" onClick={addT}>+ Ajouter</Btn>
  </div>
  <MateriauxSection label="Outillage à utiliser" categorie="Outillage" pieces={pieces} list={outil} setList={setOutil}/>
  <MateriauxSection label="Consommables à utiliser" categorie="Consommable" pieces={pieces} list={conso} setList={setConso}/>
  {err && <div className="text-xs text-rose-400 text-right mt-2">{err}</div>}
  <div className="flex justify-end mt-3"><Btn onClick={valider}>{isEdit?"Enregistrer les modifications":"Créer le plan"}</Btn></div>
 </div>);
}

function Magasin({pieces,dss,bsList,brs,decharges,onNewDS,onNewBR,onNewDecharge,onNewAchat,onTraiterBS,onGenererBS,onAnnulerDS,onOpenPiece,onAddPiece,onEditPiece}){
 const SECTIONS=[
  ["pieces","Pièces"],["consommables","Consommables"],["outillage","Outillage"],
  ["decharges","Décharges (Outillage / Consommables)"],["ds","Demandes de Sortie (DS) — Pièces"],["bs","Bons de Sortie (BS)"],["br","Bons de Retour (BR)"],
 ];
 const [section,setSection]=useState("pieces");
 const CAT={pieces:"Pièce",consommables:"Consommable",outillage:"Outillage"};
 const titre=SECTIONS.find(x=>x[0]===section)[1];
 const exportSection=()=>{
  const F={fichier:"Magasin_"+titre.split(" (")[0].split(" — ")[0]};
  if(CAT[section]) return exporterXlsx({...F,feuilles:[{nom:titre,titre:titre+" — Magasin & Achats",
   colonnes:[{h:"Code"},{h:"Désignation"},{h:"Référence"},{h:"N° de série"},{h:"Prix unitaire (DA)",t:"num"},{h:"Stock",t:"num"},{h:"Seuil min",t:"num"},{h:"Seuil max",t:"num"},{h:"Sous le seuil min"},{h:"Valeur du stock (DA)",t:"num"},{h:"Constructeur"},{h:"Fournisseur 1"},{h:"Fournisseur 2"}],
   lignes:pieces.filter(p=>p.categorie===CAT[section]).map(p=>[p.code,p.nom,p.ref||"",p.serie||"",p.prix,p.stock,p.min,p.max,ouiNon(p.stock<p.min),p.prix*p.stock,(p.constructeur||{}).nom||"",fmtFourn([p.fourn1]),fmtFourn([p.fourn2])])}]});
  if(section==="decharges") return exporterXlsx({...F,feuilles:[{nom:"Décharges",titre:"Décharges (Outillage / Consommables)",
   colonnes:[{h:"Code"},{h:"Date",t:"date"},{h:"Code article"},{h:"Article"},{h:"Catégorie"},{h:"Quantité",t:"num"},{h:"Valeur (DA)",t:"num"},{h:"Reçu par"},{h:"BT lié"}],
   lignes:decharges.map(d=>[d.code,d.date,d.piece,d.pieceNom,d.categorie,d.qte,d.prix*d.qte,d.recu,d.bt||""])}]});
  if(section==="ds") return exporterXlsx({...F,feuilles:[{nom:"DS",titre:"Demandes de Sortie (DS) — Pièces",
   colonnes:[{h:"Code DS"},{h:"Code équipement"},{h:"Équipement"},{h:"Désignation",max:50},{h:"Article"},{h:"Quantité",t:"num"},{h:"Montant (DA)",t:"num"},{h:"BT lié"},{h:"État"},{h:"Motif d'annulation"}],
   lignes:dss.map(d=>[d.code,d.eq,d.nom,d.designation,d.pieceNom,d.qte,d.prix*d.qte,d.bt||"",d.etat,d.motif||""])}]});
  if(section==="bs") return exporterXlsx({...F,feuilles:[{nom:"BS",titre:"Bons de Sortie (BS)",
   colonnes:[{h:"Code BS"},{h:"DS liée"},{h:"Article"},{h:"Quantité",t:"num"},{h:"Montant (DA)",t:"num"},{h:"État"}],
   lignes:bsList.map(b=>[b.code,b.ds,b.pieceNom,b.qte,b.prix*b.qte,b.etat])}]});
  return exporterXlsx({...F,feuilles:[{nom:"BR",titre:"Bons de Retour (BR)",
   colonnes:[{h:"Code BR"},{h:"Article"},{h:"Quantité",t:"num"},{h:"Montant (DA)",t:"num"}],
   lignes:brs.map(b=>[b.code,b.pieceNom,b.qte,b.prix*b.qte])}]});
 };

 const Articles=({categorie})=>{
  const liste=pieces.filter(p=>p.categorie===categorie);
  return (<div className="overflow-x-auto"><table className="w-full text-sm">
   <thead><tr className="text-slate-400 text-left"><th className="py-1">Code</th><th>Désignation</th><th>Fournisseur 1</th><th>PU</th><th>Stock</th><th>Seuils</th></tr></thead>
   <tbody>{liste.length===0 && <tr><td colSpan="6" className="text-xs text-slate-500 py-2">Aucun article dans cette catégorie.</td></tr>}
   {liste.map(p=>{
    const under=p.stock<p.min;
    return (<tr key={p.code} onClick={()=>onOpenPiece(p)} className="border-t border-slate-700 cursor-pointer hover:bg-slate-700/40">
     <td className="py-1.5 text-sky-400">{p.code}</td><td>{p.nom}</td>
     <td className="text-xs text-slate-400">{p.fourn1.nom}<br/>{p.fourn1.tel}</td>
     <td>{p.prix.toLocaleString()} DA</td>
     <td className={under?"text-rose-400 font-semibold":""}>{p.stock}{under && <div className="flex items-center gap-1 text-rose-400 text-xs font-normal">{I.alert} Sous le seuil min</div>}</td>
     <td className="text-xs text-slate-400">min {p.min} / max {p.max}</td>
    </tr>);
   })}</tbody>
  </table></div>);
 };

 return (<div className="space-y-4">
  <Card>
   <div className="flex flex-wrap items-end justify-between gap-3">
    <div className="flex-1 min-w-[220px] max-w-sm">
     <div className="text-xs text-slate-400 mb-1">Rubrique</div>
     <select value={section} onChange={e=>setSection(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100">
      {SECTIONS.map(([k,l])=><option key={k} value={k}>{l}</option>)}
     </select>
    </div>
    <div className="flex gap-2">
     <ExportBtn onClick={exportSection}/>
     {CAT[section] && <Btn cls="bg-emerald-700 hover:bg-emerald-600" onClick={()=>onAddPiece(CAT[section])}><span className="flex items-center gap-1">{I.plus} Ajouter {section==="pieces"?"une pièce":section==="outillage"?"un outillage":"un consommable"}</span></Btn>}
     {CAT[section] && <Btn cls="bg-slate-700 hover:bg-slate-600" onClick={()=>onNewAchat("")}><span className="flex items-center gap-1">{I.plus} Nouvel achat</span></Btn>}
     {(section==="outillage"||section==="consommables"||section==="decharges") && <Btn cls="bg-amber-700 hover:bg-amber-600" onClick={()=>onNewDecharge("")}><span className="flex items-center gap-1">{I.plus} Nouvelle décharge</span></Btn>}
     {section==="ds" && <Btn onClick={onNewDS}><span className="flex items-center gap-1">{I.plus} Nouvelle DS</span></Btn>}
     {section==="br" && <Btn onClick={onNewBR}><span className="flex items-center gap-1">{I.plus} Nouveau BR</span></Btn>}
    </div>
   </div>
  </Card>

  <Card>
   <h2 className="font-semibold text-slate-100 mb-2">{titre}</h2>

   {CAT[section] && <Articles categorie={CAT[section]}/>}

   {section==="decharges" && <div className="overflow-x-auto"><table className="w-full text-sm">
    <thead><tr className="text-slate-400 text-left"><th className="py-1">Code</th><th>Date</th><th>Article</th><th>Catégorie</th><th>Qté</th><th>Valeur</th><th>Reçu par</th><th>BT lié</th></tr></thead>
    <tbody>{decharges.length===0 && <tr><td colSpan="8" className="text-xs text-slate-500 py-2">Aucune décharge pour le moment.</td></tr>}
    {decharges.map(d=><tr key={d.code} className="border-t border-slate-700">
     <td className="py-1.5">{d.code}</td><td className="text-xs text-slate-400">{d.date}</td><td>{d.pieceNom}</td><td className="text-xs text-slate-400">{d.categorie}</td>
     <td>{d.qte}</td><td>{(d.prix*d.qte).toLocaleString()} DA</td><td>{d.recu}</td><td className="text-xs text-slate-400">{d.bt||"—"}</td>
    </tr>)}</tbody>
   </table></div>}

   {section==="ds" && <div className="overflow-x-auto"><table className="w-full text-sm">
    <thead><tr className="text-slate-400 text-left"><th className="py-1">Code DS</th><th>Équipement</th><th>Désignation</th><th>Article</th><th>Qté</th><th>Prix</th><th>BT lié</th><th>État</th><th></th></tr></thead>
    <tbody>{dss.length===0 && <tr><td colSpan="9" className="text-xs text-slate-500 py-2">Aucune DS pour le moment.</td></tr>}
    {dss.map(d=><tr key={d.code} className="border-t border-slate-700 align-top">
     <td className="py-1.5">{d.code}</td><td>{d.eq}<br/><span className="text-xs text-slate-400">{d.nom}</span></td>
     <td className="text-xs text-slate-400 max-w-xs">{d.designation}</td><td>{d.pieceNom}</td>
     <td>{d.qte}</td><td>{(d.prix*d.qte).toLocaleString()} DA</td><td className="text-xs text-slate-400">{d.bt||"—"}</td>
     <td><Badge t={d.etat}/>{d.motif && <div className="text-xs text-slate-500 mt-0.5">Motif: {d.motif}</div>}</td>
     <td>{d.etat==="Transmis au Magasinier" && <div className="flex gap-1">
      <Btn cls="bg-emerald-600 hover:bg-emerald-500 text-xs" onClick={()=>onGenererBS(d.code)}>Générer BS</Btn>
      <Btn cls="bg-rose-700 hover:bg-rose-600 text-xs" onClick={()=>onAnnulerDS(d.code)}>Annuler</Btn>
     </div>}{d.bs && <div className="text-xs text-slate-500 mt-0.5">{d.bs}</div>}</td>
    </tr>)}</tbody>
   </table></div>}

   {section==="bs" && <div className="overflow-x-auto"><table className="w-full text-sm">
    <thead><tr className="text-slate-400 text-left"><th className="py-1">Code BS</th><th>DS liée</th><th>Article</th><th>Qté</th><th>Prix</th><th>État</th><th></th></tr></thead>
    <tbody>{bsList.length===0 && <tr><td colSpan="7" className="text-xs text-slate-500 py-2">Aucun BS pour le moment.</td></tr>}
    {bsList.map(b=><tr key={b.code} className="border-t border-slate-700">
     <td className="py-1.5">{b.code}</td><td className="text-xs text-slate-400">{b.ds}</td><td>{b.pieceNom}</td>
     <td>{b.qte}</td><td>{(b.prix*b.qte).toLocaleString()} DA</td><td><Badge t={b.etat}/></td>
     <td>{b.etat==="À traiter" && <Btn cls="bg-emerald-600 hover:bg-emerald-500 text-xs" onClick={()=>onTraiterBS(b.code)}>Traiter / Délivrer</Btn>}</td>
    </tr>)}</tbody>
   </table></div>}

   {section==="br" && <div className="overflow-x-auto"><table className="w-full text-sm">
    <thead><tr className="text-slate-400 text-left"><th className="py-1">Code BR</th><th>Article</th><th>Qté</th><th>Prix</th></tr></thead>
    <tbody>{brs.length===0 && <tr><td colSpan="4" className="text-xs text-slate-500 py-2">Aucun BR pour le moment.</td></tr>}
    {brs.map(b=><tr key={b.code} className="border-t border-slate-700">
     <td className="py-1.5">{b.code}</td><td>{b.pieceNom}</td><td>{b.qte}</td><td>{(b.prix*b.qte).toLocaleString()} DA</td>
    </tr>)}</tbody>
   </table></div>}

  </Card>
 </div>);
}

function ArticleForm({mode,piece,categorie,onSubmit}){
 const isEdit=mode==="edit";
 const cat=isEdit?piece.categorie:categorie;
 const e0={nom:"",tel:"",email:""};
 const [f,setF]=useState(isEdit?{nom:piece.nom,ref:piece.ref,serie:piece.serie,prix:piece.prix,stock:piece.stock,min:piece.min,max:piece.max,constructeur:{...piece.constructeur},fourn1:{...piece.fourn1},fourn2:{...piece.fourn2}}
  :{nom:"",ref:"",serie:"",prix:0,stock:0,min:0,max:0,constructeur:{nom:"",contact:"",tel:"",email:""},fourn1:{...e0},fourn2:{...e0}});
 const [err,setErr]=useState("");
 const set=(k,v)=>setF(x=>({...x,[k]:v}));
 const setSub=(k,sk,v)=>setF(x=>({...x,[k]:{...x[k],[sk]:v}}));
 const num=(k)=><Inp type="number" min="0" value={f[k]} onChange={e=>set(k,Number(e.target.value))}/>;
 function valider(){
  if(!f.nom.trim()){setErr("Le nom / la désignation est obligatoire.");return;}
  if(f.max<f.min){setErr("Le seuil max doit être supérieur ou égal au seuil min.");return;}
  onSubmit({mode,code:isEdit?piece.code:null,data:{...f,nom:f.nom.trim(),categorie:cat}});
 }
 return (<div>
  <div className="text-xs text-slate-400">Catégorie : {cat}{isEdit && " — Code : "+piece.code}{!isEdit && " — le code sera généré automatiquement"}</div>
  <Field label="Nom / Désignation"><Inp value={f.nom} onChange={e=>set("nom",e.target.value)}/></Field>
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
   <Field label="Référence"><Inp value={f.ref} onChange={e=>set("ref",e.target.value)}/></Field>
   <Field label="N° de série"><Inp value={f.serie} onChange={e=>set("serie",e.target.value)}/></Field>
   <Field label="Prix unitaire (DA)">{num("prix")}</Field>
   <Field label="Stock actuel">{num("stock")}</Field>
   <Field label="Seuil min">{num("min")}</Field>
   <Field label="Seuil max">{num("max")}</Field>
  </div>
  <div className="text-xs text-slate-400 mt-3 font-medium">Constructeur</div>
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
   <Field label="Nom"><Inp value={f.constructeur.nom} onChange={e=>setSub("constructeur","nom",e.target.value)}/></Field>
   <Field label="Contact"><Inp value={f.constructeur.contact} onChange={e=>setSub("constructeur","contact",e.target.value)}/></Field>
   <Field label="Téléphone"><Inp value={f.constructeur.tel} onChange={e=>setSub("constructeur","tel",e.target.value)}/></Field>
   <Field label="Email"><Inp value={f.constructeur.email} onChange={e=>setSub("constructeur","email",e.target.value)}/></Field>
  </div>
  {["fourn1","fourn2"].map((k,i)=><div key={k}>
   <div className="text-xs text-slate-400 mt-3 font-medium">Fournisseur {i+1}{i===1&&" (optionnel)"}</div>
   <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
    <Field label="Nom"><Inp value={f[k].nom} onChange={e=>setSub(k,"nom",e.target.value)}/></Field>
    <Field label="Téléphone"><Inp value={f[k].tel} onChange={e=>setSub(k,"tel",e.target.value)}/></Field>
    <Field label="Email"><Inp value={f[k].email} onChange={e=>setSub(k,"email",e.target.value)}/></Field>
   </div>
  </div>)}
  {err && <div className="text-xs text-rose-400 text-right mt-2">{err}</div>}
  <div className="flex justify-end mt-3"><Btn onClick={valider}>{isEdit?"Enregistrer les modifications":"Ajouter"}</Btn></div>
 </div>);
}

function AchatForm({pieces,prefill,onSubmit}){
 const [f,setF]=useState({piece:prefill||"",qte:1,prix:(pieces.find(x=>x.code===prefill)||{}).prix||0,date:new Date().toISOString().slice(0,10),ref:""});
 const [err,setErr]=useState("");
 const art=pieces.find(p=>p.code===f.piece);
 const selCls="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm mt-1";
 function choisir(code){const a=pieces.find(p=>p.code===code);setF({...f,piece:code,prix:a?a.prix:0});}
 return (<div>
  <Field label="Article (pièce / consommable / outillage)">
   <select value={f.piece} onChange={e=>choisir(e.target.value)} className={selCls}>
    <option value="">— Choisir un article —</option>
    {pieces.map(p=><option key={p.code} value={p.code}>{p.code} — {p.nom} ({p.categorie}, stock: {p.stock})</option>)}
   </select>
  </Field>
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
   <Field label="Quantité achetée"><Inp type="number" min="1" value={f.qte} onChange={e=>setF({...f,qte:Number(e.target.value)})}/></Field>
   <Field label="Prix unitaire (DA)"><Inp type="number" min="0" value={f.prix} onChange={e=>setF({...f,prix:Number(e.target.value)})}/></Field>
   <Field label="Date de l'achat"><input type="date" value={f.date} onChange={e=>setF({...f,date:e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-100 mt-1"/></Field>
   <Field label="N° facture / BL (optionnel)"><Inp value={f.ref} onChange={e=>setF({...f,ref:e.target.value})}/></Field>
  </div>
  <div className="text-xs text-slate-500 mt-2">La quantité est ajoutée au stock et un mouvement « Achat » est enregistré. Le prix unitaire de la fiche est mis à jour avec le prix saisi.</div>
  {err && <div className="text-xs text-rose-400 text-right mt-1">{err}</div>}
  <div className="flex justify-end mt-3"><Btn onClick={()=>{
   if(!f.piece){setErr("Choisissez un article.");return;}
   if(!(f.qte>0)){setErr("La quantité doit être supérieure à 0.");return;}
   onSubmit({...f,prix:f.prix||art.prix});
  }}>Enregistrer l'achat</Btn></div>
 </div>);
}

function DechargeForm({pieces,inter,bts,prefill,onSubmit}){
 const [f,setF]=useState({piece:prefill||"",qte:1,recu:"",bt:"",date:new Date().toISOString().slice(0,10)});
 const [err,setErr]=useState("");
 const art=pieces.find(p=>p.code===f.piece);
 const selCls="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm mt-1";
 return (<div>
  <Field label="Article (outillage / consommable)">
   <select value={f.piece} onChange={e=>setF({...f,piece:e.target.value})} className={selCls}>
    <option value="">— Choisir un article —</option>
    {pieces.map(p=><option key={p.code} value={p.code}>{p.code} — {p.nom} ({p.categorie}, stock: {p.stock})</option>)}
   </select>
  </Field>
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
   <Field label={"Quantité"+(art?" (stock : "+art.stock+")":"")}><Inp type="number" min="1" value={f.qte} onChange={e=>setF({...f,qte:Number(e.target.value)})}/></Field>
   <Field label="Date"><input type="date" value={f.date} onChange={e=>setF({...f,date:e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-100 mt-1"/></Field>
  </div>
  <Field label="Reçu par (décharge signée)">
   <select value={f.recu} onChange={e=>setF({...f,recu:e.target.value})} className={selCls}>
    <option value="">— Choisir un intervenant —</option>
    {inter.map(i=><option key={i.mat} value={i.nom}>{i.nom} — {i.poste}</option>)}
   </select>
  </Field>
  <Field label="BT associé (optionnel)">
   <select value={f.bt} onChange={e=>setF({...f,bt:e.target.value})} className={selCls}>
    <option value="">—</option>{bts.map(b=><option key={b.code} value={b.code}>{b.code} — {b.nom}</option>)}
   </select>
  </Field>
  <div className="text-xs text-slate-500 mt-2">L'outillage et les consommables sortent par décharge : le stock est diminué immédiatement et un mouvement de sortie est enregistré (sans demande de sortie).</div>
  {err && <div className="text-xs text-rose-400 text-right mt-1">{err}</div>}
  <div className="flex justify-end mt-3"><Btn onClick={()=>{
   if(!f.piece){setErr("Choisissez un article.");return;}
   if(!f.recu){setErr("Choisissez la personne qui reçoit.");return;}
   if(!(f.qte>0)){setErr("La quantité doit être supérieure à 0.");return;}
   if(f.qte>art.stock){setErr("Stock insuffisant (disponible : "+art.stock+").");return;}
   onSubmit(f);
  }}>Enregistrer la décharge</Btn></div>
 </div>);
}

const ROLES=["Technicien","Exploitation","Chargé de Maintenance","Responsable","Magasinier","Directeur"];
function SuiviHabilitations({inter,onEdit}){
 const [flt,setFlt]=useState("À traiter");
 const liste=habListe(inter);
 const nb={rouge:liste.filter(x=>x.niveau==="rouge").length,orange:liste.filter(x=>x.niveau==="orange").length,vert:liste.filter(x=>x.niveau==="vert").length};
 const aTraiter=liste.filter(x=>x.niveau==="rouge"||x.niveau==="orange");
 const vue=flt==="Toutes"?liste:flt==="Expirées"?liste.filter(x=>x.niveau==="rouge"):flt==="≤ 2 mois"?liste.filter(x=>x.niveau==="orange"):flt==="Valides"?liste.filter(x=>x.niveau==="vert"):aTraiter;
 // Plan de formation : une ligne par habilitation à renouveler, avec les personnes concernées
 const plan=Object.values(aTraiter.reduce((m,x)=>{const k=x.h.i; const g=m[k]||(m[k]={hab:k,pers:[],rouge:0,orange:0,minDays:1e9,fin:""}); g.pers.push(x); x.niveau==="rouge"?g.rouge++:g.orange++; if(x.days<g.minDays){g.minDays=x.days;g.fin=x.fin;} return m;},{})).sort((a,b)=>a.minDays-b.minDays);
 const exportHab=()=>exporterXlsx({fichier:"Suivi_habilitations",feuilles:[
  {nom:"Suivi habilitations",titre:"Suivi des habilitations — rouge : date de fin atteinte · orange : fin dans "+HAB_SEUIL_MOIS+" mois ou moins",
   colonnes:[{h:"Intervenant"},{h:"Matricule"},{h:"Poste"},{h:"Habilitation"},{h:"Dernière habilitation",t:"date"},{h:"Validité (mois)",t:"num"},{h:"Date de fin",t:"date"},{h:"Jours restants",t:"num"},{h:"Statut"}],
   lignes:liste.map(x=>[x.p.nom,x.p.mat,x.p.poste,x.h.i,x.h.date,Number(x.h.m)||0,x.fin,x.days,x.niveau==="rouge"?"Expirée":x.niveau==="orange"?"À renouveler":"Valide"])},
  {nom:"Plan de formation",titre:"Plan de formation — habilitations expirées ou à renouveler sous "+HAB_SEUIL_MOIS+" mois",
   colonnes:[{h:"Habilitation"},{h:"Intervenant"},{h:"Matricule"},{h:"Date de fin",t:"date"},{h:"Jours restants",t:"num"},{h:"Priorité"}],
   lignes:plan.flatMap(g=>g.pers.map(x=>[g.hab,x.p.nom,x.p.mat,x.fin,x.days,x.niveau==="rouge"?"Urgente — expirée":"À planifier"]))}]});
 const Kc=({label,n,cls,sub})=><div className={"rounded-lg border px-3 py-2 "+cls}><div className="text-xs opacity-80">{label}</div><div className="text-2xl font-bold">{n}</div><div className="text-xs opacity-70">{sub}</div></div>;
 return (<Card>
  <div className="flex flex-wrap justify-between items-start gap-2 mb-3">
   <div><h3 className="text-sm font-semibold text-slate-200">Suivi des habilitations</h3>
    <div className="text-xs text-slate-500">🔴 Rouge : date de fin atteinte · 🟠 Orange : il reste {HAB_SEUIL_MOIS} mois ou moins avant la fin → préparer la formation · 🟢 Vert : valide</div></div>
   <ExportBtn onClick={exportHab}/>
  </div>
  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
   <Kc label="Expirées" n={nb.rouge} sub="formation urgente" cls="border-rose-700 bg-rose-900/30 text-rose-300"/>
   <Kc label={"À renouveler (≤ "+HAB_SEUIL_MOIS+" mois)"} n={nb.orange} sub="à planifier" cls="border-amber-700 bg-amber-900/30 text-amber-300"/>
   <Kc label="Valides" n={nb.vert} sub="rien à faire" cls="border-emerald-700 bg-emerald-900/20 text-emerald-300"/>
   <Kc label="Total suivi" n={liste.length} sub={inter.filter(p=>!p.externe&&(p.habs||[]).length>0).length+" intervenant(s) habilité(s)"} cls="border-slate-700 bg-slate-900 text-slate-200"/>
  </div>
  {plan.length>0 && <div className="mt-4">
   <div className="text-xs text-slate-400 font-medium mb-1">Plan de formation à préparer</div>
   <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-slate-400 text-left"><th className="py-1">Habilitation</th><th>Personnes à former</th><th>Échéance la plus proche</th><th>Priorité</th></tr></thead>
   <tbody>{plan.map(g=><tr key={g.hab} className="border-t border-slate-700 align-top">
    <td className="py-1.5 font-medium">{g.hab}<div className="text-xs text-slate-500">{g.pers.length} personne(s)</div></td>
    <td className="text-xs text-slate-300">{g.pers.map(x=><span key={x.p.mat} onClick={()=>onEdit(x.p)} className={"inline-block mr-1 mb-1 px-2 py-0.5 rounded-full cursor-pointer "+(x.niveau==="rouge"?"bg-rose-700 text-rose-50":"bg-amber-700 text-amber-50")}>{x.p.nom}</span>)}</td>
    <td className="text-xs text-slate-400">{frDate(g.fin)} <span className="text-slate-500">({g.minDays<=0?"dépassée":"dans "+g.minDays+" j"})</span></td>
    <td><span className={"px-2 py-0.5 rounded-full text-xs "+(g.rouge>0?"bg-rose-600 text-rose-50":"bg-amber-600 text-amber-50")}>{g.rouge>0?"Urgente ("+g.rouge+" expirée"+(g.rouge>1?"s":"")+")":"À planifier"}</span></td></tr>)}</tbody></table></div>
  </div>}
  {plan.length===0 && <div className="mt-3 text-xs text-emerald-400">Aucune habilitation expirée ni proche de l'échéance : aucune formation à préparer.</div>}
  <div className="mt-4 flex flex-wrap items-center gap-1"><span className="text-xs text-slate-400 mr-1">Détail :</span>
   {["À traiter","Expirées","≤ 2 mois","Valides","Toutes"].map(o=><button type="button" key={o} onClick={()=>setFlt(o)} className={"px-2.5 py-1 rounded-lg text-xs border "+(flt===o?"bg-sky-600 border-sky-500 text-white":"bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-700")}>{o}</button>)}</div>
  {vue.length===0?<div className="text-xs text-slate-500 mt-2">Aucune habilitation dans cette catégorie.</div>:
  <div className="overflow-x-auto mt-2"><table className="w-full text-sm"><thead><tr className="text-slate-400 text-left"><th className="py-1">Intervenant</th><th>Habilitation</th><th>Dernière</th><th>Validité</th><th>Date de fin</th><th>Statut</th></tr></thead>
   <tbody>{vue.map((x,i)=><tr key={x.p.mat+x.h.i+i} onClick={()=>onEdit(x.p)} className="border-t border-slate-700 cursor-pointer hover:bg-slate-700/30">
    <td className="py-1.5">{x.p.nom}<div className="text-xs text-slate-500">{x.p.poste} — {x.p.mat}</div></td><td>{x.h.i}</td>
    <td className="text-xs text-slate-400">{frDate(x.h.date)}</td><td className="text-xs text-slate-400">{x.h.m} mois</td><td className="text-xs text-slate-300">{frDate(x.fin)}</td>
    <td><span className={"px-2 py-0.5 rounded-full text-xs whitespace-nowrap "+x.cl}>{x.c}</span></td></tr>)}</tbody></table></div>}
 </Card>);
}

function JoursFeries({feries,onChange}){
 const [nom,setNom]=useState(""); const [date,setDate]=useState(todayStr()); const [annuel,setAnnuel]=useState(false); const [err,setErr]=useState("");
 const [ouvert,setOuvert]=useState(false);
 const an=new Date().getFullYear();
 const cle=(f)=>f.md?"md:"+f.md:"d:"+f.date;
 const tri=[...feries].sort((a,b)=>(a.md?an+"-"+a.md:a.date).localeCompare(b.md?an+"-"+b.md:b.date));
 const auj=todayStr();
 const prochain=tri.map(f=>({f,d:f.md?(an+"-"+f.md>=auj?an+"-"+f.md:(an+1)+"-"+f.md):f.date})).filter(x=>x.d>=auj).sort((a,b)=>a.d.localeCompare(b.d))[0];
 function ajouter(){
  if(!nom.trim()){setErr("Saisissez le nom du jour férié.");return;}
  if(!date){setErr("Choisissez la date.");return;}
  const nv=annuel?{nom:nom.trim(),md:date.slice(5)}:{nom:nom.trim(),date};
  if(feries.some(f=>cle(f)===cle(nv))){setErr("Ce jour férié existe déjà.");return;}
  onChange([...feries,nv]); setNom(""); setErr("");
 }
 return (<Card>
  <div className="flex flex-wrap justify-between items-center gap-2">
   <div>
    <h2 className="font-semibold text-slate-100">Jours fériés</h2>
    <div className="text-xs text-slate-500">{prochain?"Prochain : "+prochain.f.nom+" — "+frDate(prochain.d):"Aucun jour férié à venir."} · Signalés dans les plannings et le calendrier.</div>
   </div>
   <Btn cls="bg-slate-700 hover:bg-slate-600 text-xs" onClick={()=>setOuvert(o=>!o)}>{ouvert?"Masquer la liste":"Gérer les jours fériés ("+feries.length+")"}</Btn>
  </div>
  {ouvert && <div className="mt-3">
   <div className="text-[11px] text-slate-500 mb-2">Les fêtes religieuses varient chaque année selon l'observation de la lune : les dates prévues sont à confirmer et à corriger ici si besoin.</div>
   <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1">{tri.map(f=><div key={cle(f)} className="flex items-center justify-between text-sm bg-slate-900 rounded-lg px-2 py-1">
    <span>{f.nom} <span className="text-xs text-slate-500">— {f.md?f.md.split("-").reverse().join("/")+" (chaque année)":frDate(f.date)}</span></span>
    <button className="text-slate-500 hover:text-rose-400" onClick={()=>onChange(feries.filter(x=>cle(x)!==cle(f)))} title="Supprimer">{I.x}</button>
   </div>)}</div>
   <div className="flex flex-wrap items-end gap-2 mt-3">
    <div className="flex-1 min-w-[160px]"><div className="text-xs text-slate-400">Nom</div><input value={nom} onChange={e=>setNom(e.target.value)} placeholder="ex: Aïd el-Adha" className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm mt-1"/></div>
    <div><div className="text-xs text-slate-400">Date</div><input type="date" value={date} onChange={e=>setDate(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-100 mt-1"/></div>
    <label className="flex items-center gap-1 text-xs text-slate-300 pb-2"><input type="checkbox" checked={annuel} onChange={e=>setAnnuel(e.target.checked)}/> Chaque année</label>
    <Btn cls="bg-emerald-700 hover:bg-emerald-600" onClick={ajouter}>+ Ajouter</Btn>
   </div>
   {err && <div className="text-xs text-rose-400 mt-1">{err}</div>}
  </div>}
 </Card>);
}
function Equipe({inter,prestataires,equipements,onAddPresta,onEditPresta,feries,onChangeFeries,onAdd,onEdit}){
 const roles=ROLES;
 const exportEquipe=()=>{
  const finHab=(h)=>habFin(h.date,h.m);
  const jours=(c)=>Math.round((xlToDate(c.au)-xlToDate(c.du))/86400000)+1;
  const an=new Date().getFullYear();
  return exporterXlsx({fichier:"Intervenants",feuilles:[
   {nom:"Intervenants",titre:"Intervenants",
    colonnes:[{h:"Nom"},{h:"Matricule"},{h:"Poste / Fonction"},{h:"Rôle"},{h:"Taux horaire (DA/h)",t:"num"},{h:"Habilitations",t:"num"},{h:"Congés",t:"num"}],
    lignes:inter.map(p=>[p.nom,p.mat,p.poste,p.role,p.taux,(p.habs||[]).length,(p.conges||[]).length])},
   {nom:"Habilitations",titre:"Habilitations des intervenants",
    colonnes:[{h:"Intervenant"},{h:"Matricule"},{h:"Habilitation"},{h:"Dernière habilitation",t:"date"},{h:"Validité (mois)",t:"num"},{h:"Expiration",t:"date"},{h:"Statut"}],
    lignes:inter.flatMap(p=>(p.habs||[]).map(h=>[p.nom,p.mat,h.i,h.date,h.m,finHab(h),habStatus(h.date,h.m).c]))},
   {nom:"Prestataires",titre:"Prestataires externes",
    colonnes:[{h:"Prestataire"},{h:"Réf."},{h:"Domaine"},{h:"Contact"},{h:"Téléphone"},{h:"Email"},{h:"Taux horaire (DA/h)",t:"num"},{h:"Systèmes d'intervention"},{h:"N° contrat"},{h:"Début contrat",t:"date"},{h:"Fin contrat",t:"date"},{h:"État du contrat"},{h:"Cahier des charges"}],
    lignes:(prestataires||[]).map(x=>[x.nom,x.mat,x.poste,x.contact||"",x.tel||"",x.email||"",x.taux,(x.systemes||[]).join(", "),x.contrat||"",x.dateDebut||"",x.dateFin||"",contratInfo(x).c,x.cdc||""])},
   {nom:"Congés",titre:"Périodes de congé des intervenants",
    colonnes:[{h:"Intervenant"},{h:"Matricule"},{h:"Du",t:"date"},{h:"Au",t:"date"},{h:"Nombre de jours",t:"num"}],
    lignes:inter.flatMap(p=>(p.conges||[]).map(c=>[p.nom,p.mat,c.du,c.au,jours(c)]))},
   {nom:"Jours fériés",titre:"Jours fériés",
    colonnes:[{h:"Jour férié"},{h:"Date",t:"date"},{h:"Récurrence"}],
    lignes:[...feries].map(f=>[f.nom,f.md?an+"-"+f.md:f.date,f.md?"Chaque année":"Ponctuel"]).sort((a,b)=>String(a[1]).localeCompare(String(b[1])))}]});
 };
 return (<div className="space-y-4">
  <div className="flex justify-between items-center">
   <div className="text-xs text-slate-500">Cliquez sur un intervenant pour le modifier</div>
   <div className="flex gap-2"><ExportBtn onClick={exportEquipe}/><Btn cls="bg-emerald-700 hover:bg-emerald-600" onClick={onAdd}><span className="flex items-center gap-1">{I.plus} Ajouter un intervenant</span></Btn></div>
  </div>
  <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
   {roles.map(r=><Card key={r}><div className="text-xs text-slate-400">{r}</div><div className="text-2xl font-bold text-sky-400">{inter.filter(p=>p.role===r).length}</div></Card>)}
  </div>
  <Card>
   <div className="flex justify-between items-center mb-2">
    <div><h3 className="text-sm font-semibold text-slate-200">Prestataires externes</h3><div className="text-xs text-slate-500">Proposés comme intervenants à l'assignation des BT et plans uniquement pour les systèmes sur lesquels ils interviennent.</div></div>
    <Btn cls="bg-emerald-700 hover:bg-emerald-600" onClick={onAddPresta}><span className="flex items-center gap-1">{I.plus} Ajouter un prestataire</span></Btn>
   </div>
   {(()=>{const al=(prestataires||[]).map(x=>({x,ci:contratInfo(x)})).filter(y=>y.ci.alerte); return al.length>0&&<div className={"mb-3 rounded-lg border px-3 py-2 text-xs "+(al.some(y=>y.ci.niveau==="rouge")?"border-rose-700 bg-rose-900/30 text-rose-300":"border-amber-700 bg-amber-900/20 text-amber-300")}>
    <div className="font-semibold mb-0.5">⚠ Contrats à renouveler — préparer le nouveau cahier des charges ({al.length})</div>
    {al.map(y=><div key={y.x.mat}>• {y.x.nom} — fin le {frDate(y.ci.fin)} : {y.ci.c}{y.x.cdc?" · cahier des charges : "+y.x.cdc:""}</div>)}</div>;})()}
   {(prestataires||[]).length===0?<div className="text-xs text-slate-500">Aucun prestataire externe.</div>:
   <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{prestataires.map(x=>{return <div key={x.mat} onClick={()=>onEditPresta(x)} className="cursor-pointer rounded-lg border border-slate-700 hover:border-amber-500 p-3 transition">
    <div className="flex justify-between"><div><div className="font-semibold text-slate-100">{x.nom} <span className="ml-1 px-1.5 py-0.5 rounded text-xs bg-amber-600 text-amber-50">Externe</span></div><div className="text-xs text-slate-400">{x.poste} — Réf. {x.mat}</div><div className="text-xs text-slate-500">{[x.contact,x.tel,x.email].filter(Boolean).join(" — ")||"Contact non renseigné"}</div></div><div className="text-sm text-sky-400">{x.taux} DA/h</div></div>
    <div className="flex flex-wrap gap-1 mt-2">{(x.systemes||[]).length===0?<span className="text-xs text-slate-500">Aucun système rattaché.</span>:x.systemes.map(c=><span key={c} className="px-2 py-0.5 rounded-full text-xs bg-slate-700 text-slate-200">{c}</span>)}</div>
    {(()=>{const ci=contratInfo(x); return <div className="mt-2 flex flex-wrap items-center gap-1 text-xs"><span className="text-slate-400">Contrat{x.contrat?" "+x.contrat:""} : {x.dateDebut?frDate(x.dateDebut):"?"} → {x.dateFin?frDate(x.dateFin):"?"}</span><span className={"px-2 py-0.5 rounded-full "+ci.cl}>{ci.c}</span>{ci.alerte&&<span className="text-slate-400">· CDC : {x.cdc||"À préparer"}</span>}</div>;})()}
   </div>;})}</div>}
  </Card>
  <SuiviHabilitations inter={inter} onEdit={onEdit}/>
  <JoursFeries feries={feries} onChange={onChangeFeries}/>
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
   {inter.map(p=>(<Card key={p.mat} cls="cursor-pointer hover:border-sky-600 transition">
    <div className="flex justify-between" onClick={()=>onEdit(p)}>
     <div>
      <div className="font-semibold text-slate-100">{p.nom}</div>
      <div className="text-xs text-slate-400">{p.poste} — Mat. {p.mat}</div>
      <span className="inline-block mt-1 text-xs bg-slate-700 px-2 py-0.5 rounded-full">{p.role}</span>
     </div>
     <div className="text-sm text-sky-400">{p.taux} DA/h</div>
    </div>
    <div className="mt-3 space-y-1.5" onClick={()=>onEdit(p)}>
     {p.habs.length===0 && <div className="text-xs text-slate-500">Aucune habilitation requise pour ce poste.</div>}
     {(p.conges||[]).filter(c=>c.au>=todayStr()).map((c,i)=><div key={"c"+i} className="flex items-center justify-between text-sm">
      <span>Congé <span className="text-xs text-slate-500">{libConge(c)}</span></span>
      <span className={"px-2 py-0.5 rounded-full text-xs "+(c.du<=todayStr()?"bg-amber-600 text-amber-50":"bg-slate-600 text-slate-100")}>{c.du<=todayStr()?"En congé":"À venir"}</span>
     </div>)}
     {p.habs.map(h=>{const s=habStatus(h.date,h.m);return(
      <div key={h.i} className="flex items-center justify-between text-sm">
       <span>{h.i} <span className="text-xs text-slate-500">(dernière : {h.date} · fin : {frDate(habFin(h.date,h.m))})</span></span><span className={"px-2 py-0.5 rounded-full text-xs "+s.cl}>{s.c}</span>
      </div>);})}
    </div>
   </Card>))}
  </div>
 </div>);
}

const POSTE_GENERIQUES=["Responsable Maintenance","Magasinier","Agent Exploitation","Directeur"];
function posteOptions(systemsList){
 const sys=(systemsList||[]).filter(([c])=>c!=="MESURE"&&c!=="CTRL");
 return [...sys.flatMap(([c])=>["Technicien "+c,"Chargé de Maintenance "+c,"Responsable "+c]),...POSTE_GENERIQUES];
}
function InterForm({mode,item,existing,systemsList,onSubmit}){
 const isEdit=mode==="edit";
 const roles=ROLES;
 const posteOpts=posteOptions(systemsList);
 const [autrePoste,setAutrePoste]=useState(isEdit && item.poste && !posteOpts.includes(item.poste));
 const [f,setF]=useState(isEdit?{nom:item.nom,mat:item.mat,poste:item.poste,role:item.role,taux:item.taux}:{nom:"",mat:"",poste:"",role:"Technicien",taux:""});
 const [habs,setHabs]=useState(isEdit?item.habs.map(h=>({...h})):[]);
 const [conges,setConges]=useState(isEdit?(item.conges||[]).map(c=>({...c})):[]);
 const setC=(i,k,v)=>setConges(l=>l.map((c,j)=>j===i?{...c,[k]:v}:c));
 const [err,setErr]=useState("");
 const selCls="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm mt-1";
 const setH=(i,k,v)=>setHabs(l=>l.map((h,j)=>j===i?{...h,[k]:v}:h));
 function valider(){
  if(!f.nom.trim()){setErr("Le nom est obligatoire.");return;}
  if(!f.mat.trim()){setErr("Le matricule est obligatoire.");return;}
  if(!isEdit && existing.some(x=>x.mat.toLowerCase()===f.mat.trim().toLowerCase())){setErr("Ce matricule existe déjà.");return;}
  if(!(Number(f.taux)>0)){setErr("Saisissez le taux horaire (DA/h).");return;}
  if(habs.some(h=>!h.i.trim()||!h.date)){setErr("Complétez ou supprimez les habilitations incomplètes.");return;}
  if(conges.some(c=>!c.du||!c.au)){setErr("Complétez (dates de début et de fin) ou supprimez les congés incomplets.");return;}
  if(conges.some(c=>c.au<c.du)){setErr("Dans un congé, la date de fin doit être postérieure ou égale à la date de début.");return;}
  onSubmit({mode,data:{...f,conges:[...conges].sort((a,b)=>a.du.localeCompare(b.du)),taux:Number(f.taux),nom:f.nom.trim(),mat:f.mat.trim(),poste:f.poste.trim(),habs:habs.map(h=>({...h,i:h.i.trim(),m:Number(h.m)||12}))}});
 }
 return (<div>
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
   <Field label="Nom"><Inp value={f.nom} onChange={e=>setF({...f,nom:e.target.value})} placeholder="ex: K. Belaïd"/></Field>
   <Field label="Matricule"><Inp value={f.mat} disabled={isEdit} className={isEdit?"opacity-60":""} onChange={e=>setF({...f,mat:e.target.value})} placeholder="ex: MT-1200"/></Field>
   <Field label="Poste / Fonction">
    <select value={autrePoste?"Autre":f.poste} onChange={e=>{if(e.target.value==="Autre"){setAutrePoste(true);setF({...f,poste:""});}else{setAutrePoste(false);setF({...f,poste:e.target.value});}}} className={selCls}>
     <option value="">— Choisir un poste —</option>
     {posteOpts.map(o=><option key={o} value={o}>{o}</option>)}
     <option value="Autre">Autre (saisie libre)</option>
    </select>
    {autrePoste && <Inp value={f.poste} onChange={e=>setF({...f,poste:e.target.value})} placeholder="ex: Agent Billettique" className="mt-1"/>}
   </Field>
   <Field label="Rôle"><select value={f.role} onChange={e=>setF({...f,role:e.target.value})} className={selCls}>{roles.map(r=><option key={r}>{r}</option>)}</select></Field>
   <Field label="Taux horaire (DA/h)"><Inp type="number" min="0" step="any" inputMode="decimal" value={f.taux} placeholder="ex: 1000" onChange={e=>setF({...f,taux:e.target.value})}/></Field>
  </div>
  <div className="text-xs text-slate-400 mt-3 font-medium">Habilitations</div>
  {habs.length===0 && <div className="text-xs text-slate-500 mt-1">Aucune habilitation.</div>}
  {habs.map((h,i)=><div key={i} className="grid grid-cols-[1fr_auto_5rem_auto] gap-1 mt-1 items-center">
   <input value={h.i} onChange={e=>setH(i,"i",e.target.value)} placeholder="Intitulé (ex: H2V)" className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm"/>
   <input type="date" value={h.date} onChange={e=>setH(i,"date",e.target.value)} className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-100"/>
   <input type="number" min="1" value={h.m} onChange={e=>setH(i,"m",Number(e.target.value))} title="Validité (mois)" className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm"/>
   <button className="text-slate-500 hover:text-rose-400" onClick={()=>setHabs(l=>l.filter((_,j)=>j!==i))}>{I.x}</button>
  </div>)}
  <div className="flex items-center justify-between mt-2">
   <div className="text-xs text-slate-500">Colonnes : intitulé — date de la dernière habilitation — validité en mois</div>
   <Btn cls="bg-slate-700 hover:bg-slate-600 text-xs" onClick={()=>setHabs(l=>[...l,{i:"",date:new Date().toISOString().slice(0,10),m:12}])}>+ Habilitation</Btn>
  </div>
  <div className="text-xs text-slate-400 mt-4 font-medium">Périodes de congé</div>
  {conges.length===0 && <div className="text-xs text-slate-500 mt-1">Aucun congé enregistré.</div>}
  {conges.map((c,i)=><div key={i} className="grid grid-cols-[auto_1fr_auto_1fr_auto] gap-1 mt-1 items-center">
   <span className="text-xs text-slate-500">Du</span>
   <input type="date" value={c.du} onChange={e=>setC(i,"du",e.target.value)} className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-100"/>
   <span className="text-xs text-slate-500">au</span>
   <input type="date" value={c.au} min={c.du||undefined} onChange={e=>setC(i,"au",e.target.value)} className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-100"/>
   <button className="text-slate-500 hover:text-rose-400" onClick={()=>setConges(l=>l.filter((_,j)=>j!==i))}>{I.x}</button>
  </div>)}
  <div className="flex items-center justify-between mt-2">
   <div className="text-xs text-slate-500">L'intervenant ne pourra pas être assigné pendant ces périodes.</div>
   <Btn cls="bg-slate-700 hover:bg-slate-600 text-xs" onClick={()=>setConges(l=>[...l,{du:todayStr(),au:todayStr()}])}>+ Congé</Btn>
  </div>
  {err && <div className="text-xs text-rose-400 text-right mt-2">{err}</div>}
  <div className="flex justify-end mt-3"><Btn onClick={valider}>{isEdit?"Enregistrer les modifications":"Ajouter l'intervenant"}</Btn></div>
 </div>);
}

const EquipSelect=({equipements,value,onPick})=>(
 <select value={value} onChange={e=>{const eq=equipements.find(x=>x.code===e.target.value);onPick(eq||null);}} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm mt-1">
  <option value="">— Choisir un équipement —</option>
  {equipements.map(e=><option key={e.code} value={e.code}>{e.code} — {e.nom}</option>)}
 </select>);

function DIForm({prefill,equipements,demandeur,onSubmit}){
 const dateCreation=useMemo(()=>new Date().toISOString().slice(0,16).replace("T"," "),[]);
 const pre=prefill?.eq?equipements.find(e=>e.code===prefill.eq):null;
 const [f,setF]=useState({eq:pre?pre.code:"",nom:pre?(prefill.se?prefill.nom:pre.nom):"",se:prefill?.se||"",emplacement:pre?pre.emplacement:"",designation:"",dateEvt:new Date().toISOString().slice(0,16).replace("T"," ")});
 const [fromFiche,setFromFiche]=useState(!!(pre&&pre.emplacement));
 const [perturb,setPerturb]=useState("Non");
 const [typeM,setTypeM]=useState("Corrective");
 const [sousType,setSousType]=useState("Curative");
 const [err,setErr]=useState("");
 function pick(eq){
  if(!eq){setF({...f,eq:"",nom:"",se:"",emplacement:""});setFromFiche(false);return;}
  setF({...f,eq:eq.code,nom:eq.nom,se:"",emplacement:eq.emplacement||""});
  setFromFiche(!!eq.emplacement);
 }
 const sel="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm mt-1";
 return (<div>
  {pre && <div className="text-xs text-sky-400 mb-2">Équipement préchargé depuis l'arborescence</div>}
  <Field label="Demandeur (automatique)"><Inp value={demandeur} disabled className="opacity-60"/></Field>
  <Field label="Équipement"><EquipSelect equipements={equipements} value={f.eq} onPick={pick}/></Field>
  {(()=>{const cur=equipements.find(e=>e.code===f.eq); const sl=(cur&&cur.sousEquip)||[]; return sl.length>0&&<Field label="Sous-équipement concerné (optionnel)"><select value={f.se||""} onChange={e=>{const x=sl.find(y=>y.code===e.target.value); setF({...f,se:e.target.value,nom:cur.nom+(x?" — "+x.code+" "+x.nom:"")});}} className={sel}><option value="">— Équipement entier —</option>{sl.map(x=><option key={x.code} value={x.code}>{x.code} — {x.nom}</option>)}</select></Field>;})()}
  <Field label={fromFiche?"Emplacement (repris automatiquement de la fiche équipement)":"Emplacement de l'équipement"}>
   <Inp value={f.emplacement} disabled={fromFiche} className={fromFiche?"opacity-60":""} onChange={e=>setF({...f,emplacement:e.target.value})} placeholder={f.eq?"Non renseigné dans la fiche équipement — à saisir":"Choisissez d'abord l'équipement"}/>
  </Field>
  <Field label="Désignation (description du constat)"><Inp value={f.designation} onChange={e=>setF({...f,designation:e.target.value})}/></Field>
  <Field label="Type de maintenance">
   <select value={typeM} onChange={e=>setTypeM(e.target.value)} className={sel}><option>Corrective</option><option>Préventive</option></select>
  </Field>
  {typeM==="Corrective" && <Field label="Nature de la maintenance corrective">
   <select value={sousType} onChange={e=>setSousType(e.target.value)} className={sel}><option>Palliative</option><option>Curative</option></select>
  </Field>}
  <Field label="Date et heure de l'événement"><input type="datetime-local" value={f.dateEvt.replace(" ","T")} onChange={e=>setF({...f,dateEvt:e.target.value.replace("T"," ")})} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-100 mt-1"/></Field>
  <Field label="Date et heure de création (automatique)"><Inp value={dateCreation} disabled className="opacity-60"/></Field>
  <Field label="Perturbation exploitation">
   <select value={perturb} onChange={e=>setPerturb(e.target.value)} className={sel}><option>Non</option><option>Oui</option></select>
  </Field>
  <div className="text-xs text-slate-500 mt-2">État initial : "À Transmettre".</div>
  {err && <div className="text-xs text-rose-400 text-right mt-1">{err}</div>}
  <div className="flex justify-end mt-3"><Btn onClick={()=>{ if(!f.eq){setErr("Choisissez un équipement.");return;} onSubmit({...f,dateCreation,perturb,demandeur,typeMaintenance:typeM,sousType}); }}>Créer la DI</Btn></div>
 </div>);
}

function EquipForm({modal,count,onSubmit}){
 const isEdit=modal.mode==="edit";
 const eq=isEdit?modal.equip:null;
 const ctx=isEdit?{system:eq.system,subCode:eq.subCode,unit:eq.unit}:modal;
 const code=isEdit?eq.code:(ctx.system+"."+UNIT_ABBR[ctx.unit]+"."+ctx.subCode+"."+String(count+1).padStart(2,"0"));
 const [f,setF]=useState({nom:eq?eq.nom:"",emplacement:eq?eq.emplacement:"",constructeur:eq?eq.constructeur:{nom:"",contact:"",tel:"",email:""},prix:eq?eq.prix:0});
 const [fournisseurs,setFournisseurs]=useState(eq?eq.fournisseurs:[]);
 const [fNom,setFNom]=useState(""); const [fTel,setFTel]=useState(""); const [fEmail,setFEmail]=useState("");
 function ajouterFournisseur(){
  if(!fNom) return;
  setFournisseurs(l=>[...l,{nom:fNom,tel:fTel,email:fEmail}]);
  setFNom("");setFTel("");setFEmail("");
 }
 return (<div>
  {!isEdit && <div className="text-xs text-slate-400 mb-1">Sous-système : {modal.subNom}</div>}
  <Field label="Code"><Inp value={code} disabled className="opacity-60"/></Field>
  <Field label="Nom de l'équipement"><Inp value={f.nom} onChange={e=>setF({...f,nom:e.target.value})} placeholder="ex: Transformateur HT/BT"/></Field>
  <Field label="Emplacement"><Inp value={f.emplacement} onChange={e=>setF({...f,emplacement:e.target.value})} placeholder="ex: Dépôt Alger — Atelier B, Voie 2"/></Field>
  <Field label="Prix de l'équipement (DA)"><Inp type="number" value={f.prix} onChange={e=>setF({...f,prix:Number(e.target.value)})}/></Field>

  <div className="text-xs text-slate-400 mt-3 font-medium">Constructeur</div>
  <Field label="Nom du constructeur"><Inp value={f.constructeur.nom} onChange={e=>setF({...f,constructeur:{...f.constructeur,nom:e.target.value}})}/></Field>
  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
   <Field label="Contact"><Inp value={f.constructeur.contact} onChange={e=>setF({...f,constructeur:{...f.constructeur,contact:e.target.value}})}/></Field>
   <Field label="Téléphone"><Inp value={f.constructeur.tel} onChange={e=>setF({...f,constructeur:{...f.constructeur,tel:e.target.value}})}/></Field>
   <Field label="Email"><Inp value={f.constructeur.email} onChange={e=>setF({...f,constructeur:{...f.constructeur,email:e.target.value}})}/></Field>
  </div>

  <div className="text-xs text-slate-400 mt-3 font-medium">Fournisseur(s) — un ou plusieurs</div>
  {fournisseurs.map((fr,idx)=><div key={idx} className="text-xs flex justify-between bg-slate-900 rounded px-2 py-1 mt-1"><span>{fr.nom} — {fr.tel} — {fr.email}</span><button className="text-rose-400" onClick={()=>setFournisseurs(l=>l.filter((_,i)=>i!==idx))}>✕</button></div>)}
  <div className="flex gap-1 mt-2">
   <input value={fNom} onChange={e=>setFNom(e.target.value)} placeholder="Nom fournisseur" className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm"/>
   <input value={fTel} onChange={e=>setFTel(e.target.value)} placeholder="Téléphone" className="w-28 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm"/>
   <input value={fEmail} onChange={e=>setFEmail(e.target.value)} placeholder="Email" className="w-32 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm"/>
   <Btn cls="bg-slate-700 hover:bg-slate-600 text-xs" onClick={ajouterFournisseur}>+ Ajouter</Btn>
  </div>

  <div className="flex justify-end mt-3"><Btn onClick={()=>onSubmit({...ctx,code,nom:f.nom,emplacement:f.emplacement,prix:f.prix,constructeur:f.constructeur,fournisseurs:fournisseurs.length?fournisseurs:[{nom:"Non renseigné",tel:"",email:""}]})}>{isEdit?"Enregistrer les modifications":"Créer l'équipement"}</Btn></div>
 </div>);
}

function SousEquipForm({modal,count,onSubmit}){
 const isEdit=modal.mode==="edit";
 const equip=modal.equip;
 const se=isEdit?modal.se:null;
 const code=isEdit?se.code:(equip.code+"."+String(count+1).padStart(2,"0"));
 const [f,setF]=useState({nom:se?se.nom:""});
 const [fournisseurs,setFournisseurs]=useState(se?se.fournisseurs:[]);
 const [fNom,setFNom]=useState(""); const [fTel,setFTel]=useState(""); const [fEmail,setFEmail]=useState("");
 function ajouterFournisseur(){
  if(!fNom) return;
  setFournisseurs(l=>[...l,{nom:fNom,tel:fTel,email:fEmail}]);
  setFNom("");setFTel("");setFEmail("");
 }
 return (<div>
  <div className="text-xs text-slate-400 mb-1">Équipement parent : {equip.code} — {equip.nom}</div>
  <Field label="Code GMAO"><Inp value={code} disabled className="opacity-60"/></Field>
  <Field label="Nom du sous-équipement"><Inp value={f.nom} onChange={e=>setF({...f,nom:e.target.value})} placeholder="ex: Moteur de traction"/></Field>

  <div className="text-xs text-slate-400 mt-3 font-medium">Fournisseur(s) — un ou plusieurs</div>
  {fournisseurs.map((fr,idx)=><div key={idx} className="text-xs flex justify-between bg-slate-900 rounded px-2 py-1 mt-1"><span>{fr.nom} — {fr.tel} — {fr.email}</span><button className="text-rose-400" onClick={()=>setFournisseurs(l=>l.filter((_,i)=>i!==idx))}>✕</button></div>)}
  <div className="flex gap-1 mt-2">
   <input value={fNom} onChange={e=>setFNom(e.target.value)} placeholder="Nom fournisseur" className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm"/>
   <input value={fTel} onChange={e=>setFTel(e.target.value)} placeholder="Téléphone" className="w-28 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm"/>
   <input value={fEmail} onChange={e=>setFEmail(e.target.value)} placeholder="Email" className="w-32 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm"/>
   <Btn cls="bg-slate-700 hover:bg-slate-600 text-xs" onClick={ajouterFournisseur}>+ Ajouter</Btn>
  </div>

  <div className="flex justify-end mt-3"><Btn onClick={()=>onSubmit({parentCode:equip.code,code,nom:f.nom,fournisseurs:fournisseurs.length?fournisseurs:[{nom:"Non renseigné",tel:"",email:""}]})}>{isEdit?"Enregistrer les modifications":"Créer le sous-équipement"}</Btn></div>
 </div>);
}

function SystemForm({modal,onSubmit}){
 const [code,setCode]=useState(modal.code||"");
 const [nom,setNom]=useState(modal.nom||"");
 return (<div>
  <Field label="Code du système"><Inp value={code} onChange={e=>setCode(e.target.value)} disabled={modal.mode==="edit"} className={modal.mode==="edit"?"opacity-60":""} placeholder="ex: PSY"/></Field>
  <Field label="Nom du système"><Inp value={nom} onChange={e=>setNom(e.target.value)} placeholder="ex: Portes Sécurisées"/></Field>
  <div className="flex justify-end mt-3"><Btn onClick={()=>onSubmit({mode:modal.mode,code,nom})}>{modal.mode==="edit"?"Enregistrer":"Créer le système"}</Btn></div>
 </div>);
}

function SubSystemForm({modal,onSubmit}){
 const [code,setCode]=useState(modal.code||"");
 const [nom,setNom]=useState(modal.nom||"");
 return (<div>
  <Field label="Code du sous-système"><Inp value={code} onChange={e=>setCode(e.target.value)} disabled={modal.mode==="edit"} className={modal.mode==="edit"?"opacity-60":""} placeholder="ex: SLT"/></Field>
  <Field label="Nom du sous-système"><Inp value={nom} onChange={e=>setNom(e.target.value)} placeholder="ex: Salle Technique"/></Field>
  <div className="flex justify-end mt-3"><Btn onClick={()=>onSubmit({mode:modal.mode,systemCode:modal.systemCode,code,nom})}>{modal.mode==="edit"?"Enregistrer":"Créer le sous-système"}</Btn></div>
 </div>);
}

function MesureForm({modal,count,organismes,onSubmit}){
 const isEdit=modal.mode==="edit"; const it=isEdit?modal.item:null;
 const code=isEdit?it.code:"M-"+String(count+1).padStart(2,"0");
 const [f,setF]=useState({nom:it?it.nom:"",etalonnage:it?it.etalonnage:new Date().toISOString().slice(0,10),peremption:it?it.peremption:"",organisme:it?it.organisme:""});
 return (<div>
  <Field label="Code"><Inp value={code} disabled className="opacity-60"/></Field>
  <Field label="Désignation"><Inp value={f.nom} onChange={e=>setF({...f,nom:e.target.value})} placeholder="ex: Multimètre Fluke 117"/></Field>
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
   <Field label="Date étalonnage"><input type="date" value={f.etalonnage} onChange={e=>setF({...f,etalonnage:e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-100 mt-1"/></Field>
   <Field label="Date péremption"><input type="date" value={f.peremption} onChange={e=>setF({...f,peremption:e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-100 mt-1"/></Field>
  </div>
  {(()=>{const opts=(organismes||[]).filter(o=>(o.domaines||[]).includes("Étalonnage")).map(o=>o.nom); if(f.organisme&&!opts.includes(f.organisme)) opts.push(f.organisme);
   return <Field label="Organisme d'étalonnage (vérificateur)"><select value={f.organisme} onChange={e=>setF({...f,organisme:e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm mt-1"><option value="">— Choisir un organisme —</option>{opts.map(x=><option key={x}>{x}</option>)}</select>{opts.length===0&&<div className="text-xs text-slate-500 mt-1">Aucun organisme d'étalonnage : ajoutez-en dans l'onglet « Organismes ».</div>}</Field>;})()}
  <div className="flex justify-end mt-3"><Btn onClick={()=>onSubmit({code,...f})}>{isEdit?"Enregistrer":"Ajouter l'appareil"}</Btn></div>
 </div>);
}

function CtrlForm({modal,list,organismes,equipements,onSubmit}){
 const isEdit=modal.mode==="edit"; const it=isEdit?modal.item:null;
 const code=isEdit?it.code:"R-"+String((list.reduce((m,c)=>Math.max(m,parseInt(String(c.code).slice(2),10)||0),0))+1).padStart(2,"0");
 const [f,setF]=useState({nom:it?it.nom:"",organisme:it?it.organisme:"",periodicite:it?it.periodicite:"Annuelle",statut:it?it.statut:"À contrôler"});
 const [err,setErr]=useState("");
 const sel="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm mt-1";
 const PER=["Mensuelle","Trimestrielle","Semestrielle","Annuelle","Biennale"]; if(f.periodicite&&!PER.includes(f.periodicite)) PER.push(f.periodicite);
 const STA=["Conforme","Réserves levées","À contrôler","Non conforme"]; if(f.statut&&!STA.includes(f.statut)) STA.push(f.statut);
 return (<div>
  <Field label="Code"><Inp value={code} disabled className="opacity-60"/></Field>
  <Field label="Équipement"><Inp list="ctrl-eq-list" value={f.nom} onChange={e=>setF({...f,nom:e.target.value})} placeholder="ex: Pont roulant 10T Dépôt (saisie libre ou choix dans l'arborescence)"/></Field>
  <datalist id="ctrl-eq-list">{equipements.filter(e=>e.system!=="MESURE"&&e.system!=="CTRL").map(e=><option key={e.code} value={e.nom}>{e.code}</option>)}</datalist>
  {(()=>{const opts=(organismes||[]).filter(o=>(o.domaines||[]).includes("Contrôle réglementaire")).map(o=>o.nom); if(f.organisme&&!opts.includes(f.organisme)) opts.push(f.organisme);
   return <Field label="Organisme de contrôle"><select value={f.organisme} onChange={e=>setF({...f,organisme:e.target.value})} className={sel}><option value="">— Choisir un organisme —</option>{opts.map(x=><option key={x}>{x}</option>)}</select>{opts.length===0&&<div className="text-xs text-slate-500 mt-1">Aucun organisme de contrôle : ajoutez-en dans l'onglet « Organismes ».</div>}</Field>;})()}
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
   <Field label="Périodicité légale"><select value={f.periodicite} onChange={e=>setF({...f,periodicite:e.target.value})} className={sel}>{PER.map(x=><option key={x}>{x}</option>)}</select></Field>
   <Field label="Statut / Registre sécurité"><select value={f.statut} onChange={e=>setF({...f,statut:e.target.value})} className={sel}>{STA.map(x=><option key={x}>{x}</option>)}</select></Field>
  </div>
  {err && <div className="text-xs text-rose-400 text-right mt-1">{err}</div>}
  <div className="flex justify-end mt-3"><Btn onClick={()=>{ if(!f.nom.trim()){setErr("Renseignez l'équipement.");return;} onSubmit({code,...f,nom:f.nom.trim()}); }}>{isEdit?"Enregistrer":"Ajouter le contrôle"}</Btn></div>
 </div>);
}

function OrgForm({modal,list,onSubmit}){
 const isEdit=modal.mode==="edit"; const it=isEdit?modal.item:null;
 const code=isEdit?it.code:"ORG-"+String(list.reduce((m,o)=>Math.max(m,parseInt(String(o.code).slice(4),10)||0),0)+1).padStart(2,"0");
 const [f,setF]=useState({nom:it?it.nom:"",domaines:it?[...(it.domaines||[])]:["Contrôle réglementaire","Étalonnage"],contact:it?it.contact||"":"",tel:it?it.tel||"":"",email:it?it.email||"":""});
 const [err,setErr]=useState("");
 const tog=(d)=>setF(x=>({...x,domaines:x.domaines.includes(d)?x.domaines.filter(y=>y!==d):[...x.domaines,d]}));
 return (<div>
  <Field label="Code"><Inp value={code} disabled className="opacity-60"/></Field>
  <Field label="Nom de l'organisme"><Inp value={f.nom} onChange={e=>setF({...f,nom:e.target.value})} placeholder="ex: VERITAS"/></Field>
  <div className="text-xs text-slate-400 mt-2">Intervient pour</div>
  <div className="flex gap-1 mt-1">{ORG_DOM.map(d=><button type="button" key={d} onClick={()=>tog(d)} className={"px-3 py-1.5 rounded-lg text-sm border "+(f.domaines.includes(d)?"bg-sky-600 border-sky-500 text-white":"bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-700")}>{f.domaines.includes(d)?"✓ ":""}{d}</button>)}</div>
  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
   <Field label="Contact"><Inp value={f.contact} onChange={e=>setF({...f,contact:e.target.value})}/></Field>
   <Field label="Téléphone"><Inp value={f.tel} onChange={e=>setF({...f,tel:e.target.value})}/></Field>
   <Field label="Email"><Inp value={f.email} onChange={e=>setF({...f,email:e.target.value})}/></Field>
  </div>
  {err && <div className="text-xs text-rose-400 text-right mt-1">{err}</div>}
  <div className="flex justify-end mt-3"><Btn onClick={()=>{ if(!f.nom.trim()){setErr("Le nom est obligatoire.");return;} if(f.domaines.length===0){setErr("Choisissez au moins un domaine.");return;} onSubmit({code,...f,nom:f.nom.trim()}); }}>{isEdit?"Enregistrer":"Ajouter l'organisme"}</Btn></div>
 </div>);
}

function PrestaForm({mode,item,existing,systemsList,onSubmit}){
 const isEdit=mode==="edit"; const it=isEdit?item:null;
 const mat=isEdit?it.mat:"EXT-"+String(existing.reduce((m,x)=>Math.max(m,parseInt(String(x.mat).slice(4),10)||0),0)+1).padStart(2,"0");
 const [f,setF]=useState({nom:it?it.nom:"",poste:it?it.poste:"",contrat:it?it.contrat||"":"",dateDebut:it?it.dateDebut||"":"",dateFin:it?it.dateFin||"":"",cdc:it?it.cdc||"À préparer":"À préparer",contact:it?it.contact||"":"",tel:it?it.tel||"":"",email:it?it.email||"":"",taux:it?it.taux:""});
 const [conges,setConges]=useState(it?(it.conges||[]).map(c=>({...c})):[]);
 const [err,setErr]=useState("");
 const [syst,setSyst]=useState(it?[...(it.systemes||[])]:[]);
 const sysOpts=(systemsList||[]).filter(x=>x[0]!=="MESURE"&&x[0]!=="CTRL");
 return (<div>
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
   <Field label="Prestataire (société ou nom)"><Inp value={f.nom} onChange={e=>setF({...f,nom:e.target.value})} placeholder="ex: SOTEMA Services"/></Field>
   <Field label="Référence"><Inp value={mat} disabled className="opacity-60"/></Field>
   <Field label="Domaine / spécialité"><Inp value={f.poste} onChange={e=>setF({...f,poste:e.target.value})} placeholder="ex: Prestataire — Matériel roulant"/></Field>
   <Field label="N° de contrat / marché"><Inp value={f.contrat} onChange={e=>setF({...f,contrat:e.target.value})}/></Field>
   <Field label="Contact"><Inp value={f.contact} onChange={e=>setF({...f,contact:e.target.value})}/></Field>
   <Field label="Téléphone"><Inp value={f.tel} onChange={e=>setF({...f,tel:e.target.value})}/></Field>
   <Field label="Email"><Inp value={f.email} onChange={e=>setF({...f,email:e.target.value})}/></Field>
   <Field label="Taux horaire (DA/h)"><Inp type="number" min="0" step="any" value={f.taux} onChange={e=>setF({...f,taux:e.target.value})} placeholder="ex: 2000"/></Field>
  </div>
  <div className="text-xs text-slate-400 mt-3 font-medium">Contrat</div>
  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
   <Field label="Début du contrat"><input type="date" value={f.dateDebut} onChange={e=>setF({...f,dateDebut:e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-100 mt-1"/></Field>
   <Field label="Fin du contrat"><input type="date" value={f.dateFin} min={f.dateDebut||undefined} onChange={e=>setF({...f,dateFin:e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-100 mt-1"/></Field>
   <Field label="Nouveau cahier des charges"><select value={f.cdc} onChange={e=>setF({...f,cdc:e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm mt-1">{CDC_ETATS.map(x=><option key={x}>{x}</option>)}</select></Field>
  </div>
  {(()=>{const ci=contratInfo({dateFin:f.dateFin,cdc:f.cdc}); if(ci.niveau==="na") return <div className="text-xs text-slate-500 mt-1">Renseignez la date de fin : une alerte est déclenchée {CONTRAT_SEUIL_MOIS} mois avant pour préparer le nouveau cahier des charges.</div>;
   return <div className={"mt-1 rounded-lg border px-2 py-1.5 text-xs "+(ci.niveau==="rouge"?"border-rose-700 bg-rose-900/30 text-rose-300":ci.alerte?"border-amber-700 bg-amber-900/20 text-amber-300":"border-emerald-700 bg-emerald-900/20 text-emerald-300")}>{ci.niveau==="rouge"?"⛔ ":ci.alerte?"⚠ ":"✓ "}{ci.c}{ci.alerte&&ci.niveau==="orange"?" — préparez le nouveau cahier des charges.":""}{ci.niveau==="vert"&&ci.days<=CONTRAT_SEUIL_MOIS*31&&(f.cdc==="Validé"||f.cdc==="Consultation lancée")?" — cahier des charges "+f.cdc.toLowerCase()+".":""}</div>;})()}
  <div className="text-xs text-slate-400 mt-3 font-medium">Systèmes sur lesquels il intervient</div>
  <div className="text-xs text-slate-500">Il sera proposé comme intervenant (badge « Externe ») pour les BT et plans de ces systèmes uniquement.</div>
  <div className="flex flex-wrap gap-1 mt-2">{sysOpts.map(([c,n])=>{const on=syst.includes(c);return <button type="button" key={c} onClick={()=>setSyst(l=>on?l.filter(x=>x!==c):[...l,c])} className={"px-2 py-1 rounded-lg text-xs border "+(on?"bg-amber-600 border-amber-500 text-white":"bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-700")}>{on?"✓ ":"+ "}{c} — {n}</button>;})}</div>
  <div className="text-xs text-slate-400 mt-3 font-medium">Périodes d'indisponibilité</div>
  {conges.length===0 && <div className="text-xs text-slate-500 mt-1">Aucune période enregistrée.</div>}
  {conges.map((c,i)=><div key={i} className="grid grid-cols-[auto_1fr_auto_1fr_auto] gap-1 mt-1 items-center">
   <span className="text-xs text-slate-500">Du</span>
   <input type="date" value={c.du} onChange={e=>setConges(l=>l.map((x,j)=>j===i?{...x,du:e.target.value}:x))} className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-100"/>
   <span className="text-xs text-slate-500">au</span>
   <input type="date" value={c.au} min={c.du||undefined} onChange={e=>setConges(l=>l.map((x,j)=>j===i?{...x,au:e.target.value}:x))} className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-100"/>
   <button className="text-slate-500 hover:text-rose-400" onClick={()=>setConges(l=>l.filter((_,j)=>j!==i))}>{I.x}</button>
  </div>)}
  <div className="flex justify-end mt-2"><Btn cls="bg-slate-700 hover:bg-slate-600 text-xs" onClick={()=>setConges(l=>[...l,{du:todayStr(),au:todayStr()}])}>+ Période</Btn></div>
  {err && <div className="text-xs text-rose-400 text-right mt-2">{err}</div>}
  <div className="flex justify-end mt-3"><Btn onClick={()=>{
   if(!f.nom.trim()){setErr("Le nom du prestataire est obligatoire.");return;}
   if(syst.length===0){setErr("Choisissez au moins un système d'intervention.");return;}
   if(f.dateDebut&&f.dateFin&&f.dateFin<f.dateDebut){setErr("La fin du contrat doit être postérieure à son début.");return;}
   if(!(Number(f.taux)>0)){setErr("Saisissez le taux horaire (DA/h).");return;}
   if(conges.some(c=>!c.du||!c.au||c.au<c.du)){setErr("Vérifiez les périodes d'indisponibilité (dates complètes, fin ≥ début).");return;}
   onSubmit({mode,data:{...(it||{}),nom:f.nom.trim(),mat,poste:f.poste.trim()||"Prestataire externe",role:"Prestataire",externe:true,systemes:syst,taux:Number(f.taux),contrat:f.contrat,dateDebut:f.dateDebut,dateFin:f.dateFin,cdc:f.cdc,contact:f.contact,tel:f.tel,email:f.email,habs:(it&&it.habs)||[],conges}});
  }}>{isEdit?"Enregistrer les modifications":"Ajouter le prestataire"}</Btn></div>
 </div>);
}

function MotifForm({onSubmit}){
 const [motif,setMotif]=useState("");
 return (<div>
  <Field label="Motif d'annulation"><textarea value={motif} onChange={e=>setMotif(e.target.value)} rows="3" className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-100 mt-1"/></Field>
  <div className="flex justify-end mt-3"><Btn cls="bg-rose-700 hover:bg-rose-600" onClick={()=>onSubmit(motif)}>Confirmer l'annulation</Btn></div>
 </div>);
}

function MateriauxSection({label,categorie,pieces,list,setList}){
 const options=pieces.filter(p=>p.categorie===categorie);
 const [sel,setSel]=useState("");
 const [qte,setQte]=useState(1);
 const [ouvert,setOuvert]=useState(false);
 function ajouter(){ if(!sel) return; setList(l=>[...l,{code:sel,qte}]); setSel(""); setQte(1); setOuvert(false); }
 return (<div>
  <div className="text-xs text-slate-400 mt-3 font-medium">{label} (prix hérité de la fiche magasin) — modifiable</div>
  {list.length===0 && <div className="text-xs text-slate-500 mt-1">Aucun{categorie==="Pièce"?"e":""} {categorie.toLowerCase()} pour le moment.</div>}
  {list.map((it,idx)=>{const pc=pieces.find(p=>p.code===it.code);return <div key={idx} className="text-xs flex justify-between bg-slate-900 rounded px-2 py-1 mt-1"><span>{it.code} — {pc?.nom} × {it.qte}</span><span className="flex items-center gap-2">{(pc?pc.prix*it.qte:0).toLocaleString()} DA<button type="button" className="text-slate-500 hover:text-rose-400" onClick={()=>setList(l=>l.filter((_,i)=>i!==idx))}>{I.x}</button></span></div>;})}
  {options.length===0 ? <div className="text-xs text-slate-600 mt-1">Aucun article de catégorie "{categorie}" dans le magasin.</div> : <>
  {!ouvert && <button type="button" onClick={()=>setOuvert(true)} className="text-xs text-sky-400 hover:underline mt-2">+ Ajouter / modifier {categorie==="Pièce"?"une pièce":categorie==="Outillage"?"un outillage":"un consommable"}</button>}
  {ouvert && <div className="flex gap-1 mt-2">
   <select value={sel} onChange={e=>setSel(e.target.value)} className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm"><option value="">— Choisir —</option>{options.map(p=><option key={p.code} value={p.code}>{p.code} — {p.nom} (PU {p.prix} DA)</option>)}</select>
   <input type="number" min="1" value={qte} onChange={e=>setQte(Number(e.target.value))} className="w-16 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm"/>
   <Btn cls="bg-slate-700 hover:bg-slate-600 text-xs" onClick={ajouter}>+ Ajouter</Btn>
  </div>}
  </>}
 </div>);
}

/* Étape 1 — Génération du BT par la Maintenance (aucun compte-rendu : il sera saisi par un autre intervenant) */
function BTCreateForm({di,inter,equipements,pieces,onSubmit}){
 const [f,setF]=useState({di:di?di.code:null,eq:di?di.eq:"",nom:di?di.nom:"",type:di?typeLabel(di):"Préventive",consigne:di?di.designation:"",assignes:[],pieces:[],outillage:[],consommables:[],exc:false,motifExc:"",horaire:"Jour",consignation:"Non"});
 const [errExc,setErrExc]=useState("");
 const sys=systemeDe(f.eq,f.nom,equipements);
 return (<div>
  {di && <div className="text-xs text-sky-400 mb-2">Rattaché à la DI {di.code} — {di.designation}</div>}
  {!di && <div className="text-xs text-amber-400 mb-2">BT Préventif généré directement par la Maintenance (aucune DI)</div>}
  {di ? <><Field label="Équipement"><Inp value={f.eq+" — "+f.nom} disabled className="opacity-60"/></Field>
   <Field label="Type de maintenance"><Inp value={f.type} disabled className="opacity-60"/></Field></>
  : <Field label="Équipement"><EquipSelect equipements={equipements} value={f.eq} onPick={eq=>setF({...f,eq:eq?eq.code:"",nom:eq?eq.nom:""})}/></Field>}
  <Field label="Consigne / travaux à réaliser"><Inp value={f.consigne} onChange={e=>setF({...f,consigne:e.target.value})} placeholder="ex: Contrôler le palier moteur"/></Field>
  <HoraireConsignation v={f} onChange={o=>setF({...f,...o})}/>
  <div className="text-xs text-slate-400 mb-1 mt-2">Intervenants assignés (plusieurs possibles) — {f.assignes.length} sélectionné(s)</div>
  <MultiInter inter={interPourSys(inter,sys)} value={f.assignes} onChange={v=>setF({...f,assignes:v})} sys={sys} date={todayStr()}/>
  {nonOuvre(todayStr()) && <div className="mt-2 rounded-lg border border-amber-700 bg-amber-900/20 px-2 py-2 text-xs text-amber-400">
   🎌 Aujourd'hui est un jour non ouvré : <b>{nonOuvre(todayStr()).nom}</b>. Le BT ne peut être généré que pour un travail exceptionnel.
   <label className="flex items-center gap-1 mt-1 text-slate-200"><input type="checkbox" checked={f.exc} onChange={e=>setF({...f,exc:e.target.checked})}/> Travail exceptionnel confirmé</label>
   {f.exc && <input value={f.motifExc} onChange={e=>setF({...f,motifExc:e.target.value})} placeholder="Motif (ex: intervention urgente)" className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-100 mt-1"/>}
  </div>}
  <MateriauxSection label="Pièces à utiliser" categorie="Pièce" pieces={pieces} list={f.pieces} setList={fn=>setF(st=>({...st,pieces:fn(st.pieces)}))}/>
  <MateriauxSection label="Outillage à utiliser" categorie="Outillage" pieces={pieces} list={f.outillage} setList={fn=>setF(st=>({...st,outillage:fn(st.outillage)}))}/>
  <MateriauxSection label="Consommables à utiliser" categorie="Consommable" pieces={pieces} list={f.consommables} setList={fn=>setF(st=>({...st,consommables:fn(st.consommables)}))}/>
  <div className="text-xs text-slate-500 mt-2">Les intervenants, pièces, outillage et consommables choisis ici seront déjà remplis dans le BT (prêt pour impression). Le BT sera créé à l'état « En cours ». L'intervenant assigné ouvrira ensuite le BT pour saisir le compte-rendu, le temps passé et les matières, puis cliquera sur « Clôturer ».</div>
  <div>{errExc && <div className="text-xs text-rose-400 text-right mt-2">{errExc}</div>}
  <div className="flex justify-end mt-3"><Btn onClick={()=>{ if(!f.eq) return; if(f.assignes.some(n=>congeAt(inter.find(x=>x.nom===n),todayStr()))) return;
   if(nonOuvre(todayStr())){ if(!f.exc){setErrExc("Jour non ouvré : cochez « Travail exceptionnel confirmé ».");return;} if(!f.motifExc.trim()){setErrExc("Indiquez le motif du travail exceptionnel.");return;} }
   setErrExc(""); onSubmit(f); }}>Générer le BT</Btn></div></div>
 </div>);
}

/* Étape 2 — Saisie par l'intervenant puis clôture */
function BTFillForm({bt,pieces,inter,equipements,onSave,onCloturer,onCreateDS}){
 const sysBT=systemeDe(bt.eq,bt.nom,equipements);
 const interEq=interPourSys(inter,sysBT);
 const interSys=interDuSysteme(interEq,sysBT);
 const [ajoutInter,setAjoutInter]=useState(false);
 const clean=(v)=>v==="-"?"":(v||"");
 const [f,setF]=useState({panne:clean(bt.panne),cause:clean(bt.cause),effet:clean(bt.effet),detection:bt.detection||(bt.type==="Préventive"||bt.plan?0:1),gravite:bt.gravite||(bt.type==="Préventive"||bt.plan?0:1),dureeIntervention:bt.dureeIntervention||1,tempsLogistique:bt.tempsLogistique||0});
 const [intervenants,setIntervenants]=useState(bt.intervenants||[]);
 const [piecesBT,setPiecesBT]=useState(bt.pieces||[]);
 const [outillageBT,setOutillageBT]=useState(bt.outillage||[]);
 const [consommablesBT,setConsommablesBT]=useState(bt.consommables||[]);
 const [selInt,setSelInt]=useState("");
 const [tempsInt,setTempsInt]=useState(1);
 const [err,setErr]=useState("");
 const [taches,setTaches]=useState(bt.taches||[]);
 const pct=taches.length?Math.round(taches.filter(t=>tRes(t)).length/taches.length*100):100;
 const nokSansCom=()=>taches.some(t=>tRes(t)==="NOK" && !(t.com||"").trim());
 const nbNok=taches.filter(t=>tRes(t)==="NOK" && !t.di && t.creerDI===true).length;
 const nokSansChoix=()=>taches.some(t=>tRes(t)==="NOK" && !t.di && typeof t.creerDI!=="boolean");
 const setRes=(i,v)=>setTaches(l=>l.map((x,j)=>j===i?{...x,res:v,com:v==="OK"?"":x.com,creerDI:v==="OK"?undefined:x.creerDI}:x));
 const attente=bt.etat==="En attente pièce";
 const isPrev=bt.type==="Préventive"||!!bt.plan;

 function ajouterInt(){
  const t=inter.find(i=>i.nom===selInt);
  if(!t) return;
  setIntervenants(l=>[...l,{nom:t.nom,fonction:t.poste,temps:tempsInt,taux:t.taux}]);
  setSelInt("");setTempsInt(1);setAjoutInter(false);
 }
 const coutMO=intervenants.reduce((s,i)=>s+i.temps*i.taux,0);
 const coutLot=(lot)=>lot.reduce((s,it)=>{const pc=pieces.find(p=>p.code===it.code);return s+(pc?pc.prix*it.qte:0);},0);
 const coutMat=coutLot(piecesBT)+coutLot(outillageBT)+coutLot(consommablesBT);
 const data=()=>({...f,assignes:intervenants.length?intervenants.map(x=>x.nom):(bt.assignes||[]),taches,panne:f.panne||"-",cause:f.cause||"-",effet:f.effet||"-",intervenants,pieces:piecesBT,outillage:outillageBT,consommables:consommablesBT});
 function cloturer(){
  if(taches.length>0 && pct<100){setErr("Clôture impossible : "+taches.filter(t=>tRes(t)).length+"/"+taches.length+" tâches contrôlées ("+pct+" %). Chaque tâche doit être cochée OK ou Non OK.");return;}
  if(nokSansCom()){setErr("Commentaire obligatoire pour chaque tâche « Non OK ».");return;}
  if(nokSansChoix()){setErr("Pour chaque tâche « Non OK », indiquez si une DI doit être créée ou non.");return;}
  if(!isPrev && taches.length===0 && !f.panne.trim()){setErr("Renseignez la panne / le constat avant de clôturer.");return;}
  if(intervenants.length===0){setErr("Ajoutez au moins un intervenant avant de clôturer.");return;}
  onCloturer(data());
 }
 const allItems=piecesBT;

 return (<div>
  {attente && <div className="text-xs text-rose-300 bg-rose-900/30 border border-rose-700 rounded-lg px-3 py-2 mb-2">BT en attente de pièce : la clôture est bloquée jusqu'à la sortie magasin de la pièce demandée.</div>}
  {taches.length>0 && <div className="mb-3 bg-slate-900/60 border border-slate-700 rounded-lg p-3">
   <div className="flex justify-between text-xs text-slate-300 mb-1"><span className="font-medium">Tâches à contrôler — {taches.filter(t=>tRes(t)).length}/{taches.length}</span><span>{pct} % contrôlé</span></div>
   <ProgressBar pct={pct}/>
   {taches.map((t,i)=>{const r=tRes(t);return <div key={i} className={"rounded-lg px-2 py-1.5 mt-1 border "+(r==="NOK"?"bg-rose-950/40 border-rose-800":r==="OK"?"bg-emerald-950/30 border-emerald-900":"bg-slate-900 border-slate-800")}>
    <div className="flex items-center justify-between gap-2 flex-wrap">
     <span className="text-sm">{i+1}. {t.lib}</span>
     <div className="flex gap-1 shrink-0">
      <button type="button" disabled={!!t.di} onClick={()=>setRes(i,"OK")} className={"px-3 py-1 rounded-lg text-xs font-medium "+(r==="OK"?"bg-emerald-600 text-white":"bg-slate-700 text-slate-300 hover:bg-slate-600")}>✓ OK</button>
      <button type="button" disabled={!!t.di} onClick={()=>setRes(i,"NOK")} className={"px-3 py-1 rounded-lg text-xs font-medium "+(r==="NOK"?"bg-rose-600 text-white":"bg-slate-700 text-slate-300 hover:bg-slate-600")}>✗ Non OK</button>
     </div>
    </div>
    {r==="NOK" && <div className="mt-1.5">
     <input value={t.com||""} disabled={!!t.di} onChange={e=>setTaches(l=>l.map((x,j)=>j===i?{...x,com:e.target.value}:x))} placeholder="Commentaire obligatoire : décrire le défaut constaté" className="w-full bg-slate-900 border border-rose-800 rounded-lg px-2 py-1.5 text-sm text-slate-100"/>
     {t.di ? <div className="text-xs text-sky-400 mt-1">DI créée : {t.di}</div> : <div className="mt-1.5">
      <div className="text-xs text-slate-400 mb-1">Ce Non OK nécessite-t-il une intervention corrective ? (ce n'est pas forcément une panne : ex. manque de pièce de rechange)</div>
      <div className="flex gap-1 flex-wrap">
       <button type="button" onClick={()=>setTaches(l=>l.map((x,j)=>j===i?{...x,creerDI:true}:x))} className={"px-3 py-1 rounded-lg text-xs font-medium "+(t.creerDI===true?"bg-sky-600 text-white":"bg-slate-700 text-slate-300 hover:bg-slate-600")}>Créer une DI</button>
       <button type="button" onClick={()=>setTaches(l=>l.map((x,j)=>j===i?{...x,creerDI:false}:x))} className={"px-3 py-1 rounded-lg text-xs font-medium "+(t.creerDI===false?"bg-amber-600 text-white":"bg-slate-700 text-slate-300 hover:bg-slate-600")}>Ne pas créer de DI</button>
      </div>
      {t.creerDI===true && <div className="text-xs text-sky-300 mt-1">Une DI corrective sera créée depuis ce BT à l'enregistrement.</div>}
      {t.creerDI===false && <div className="text-xs text-slate-500 mt-1">Aucune DI ne sera créée : le commentaire ci-dessus garde la raison.</div>}
     </div>}
    </div>}
   </div>;})}
   <div className="text-xs text-slate-500 mt-2">Chaque tâche doit être cochée OK ou Non OK (commentaire obligatoire si Non OK) pour pouvoir clôturer. « Enregistrer » sauvegarde l'avancement{nbNok>0?" et crée "+nbNok+" DI (selon votre choix)":""}.</div>
  </div>}
  {!isPrev && <>
  <div className="text-xs text-slate-400 mt-1 font-medium">Compte-rendu</div>
  <Field label="Panne / constat"><Inp value={f.panne} onChange={e=>setF({...f,panne:e.target.value})}/></Field>
  <Field label="Cause"><Inp value={f.cause} onChange={e=>setF({...f,cause:e.target.value})}/></Field>
  <Field label="Solution"><Inp value={f.effet} onChange={e=>setF({...f,effet:e.target.value})}/></Field>
  <Field label="Détection (1 à 4) — capacité à détecter la panne avant occurrence">
   <div className="flex gap-2 mt-1">{[1,2,3,4].map(g=><button key={g} onClick={()=>setF({...f,detection:g})} className={"w-9 h-9 rounded-lg text-sm font-medium "+(f.detection===g?"bg-sky-600 text-white":"bg-slate-700 text-slate-300")}>{g}</button>)}</div>
  </Field>
  <Field label="Gravité (1 à 4)">
   <div className="flex gap-2 mt-1">{[1,2,3,4].map(g=><button key={g} onClick={()=>setF({...f,gravite:g})} className={"w-9 h-9 rounded-lg text-sm font-medium "+(f.gravite===g?"bg-sky-600 text-white":"bg-slate-700 text-slate-300")}>{g}</button>)}</div>
  </Field>
  </>}
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
   <Field label="Durée d'intervention (h)"><Inp type="number" step="0.5" value={f.dureeIntervention} onChange={e=>setF({...f,dureeIntervention:Number(e.target.value)})}/></Field>
   <Field label="Temps logistique (h)"><Inp type="number" step="0.5" value={f.tempsLogistique} onChange={e=>setF({...f,tempsLogistique:Number(e.target.value)})}/></Field>
  </div>

  <div className="text-xs text-slate-400 mt-3 font-medium">Intervenants assignés — saisissez la durée d'intervention de chacun (h)</div>
  {intervenants.length===0 && <div className="text-xs text-slate-500 mt-1">Aucun intervenant assigné à ce BT.</div>}
  {intervenants.map((it,idx)=><div key={idx} className="text-xs flex justify-between items-center gap-2 bg-slate-900 rounded px-2 py-1.5 mt-1">
   <span className="flex-1">{it.nom} — {it.fonction} <span className="text-slate-500">({it.taux} DA/h)</span></span>
   <input type="number" step="0.5" min="0" value={it.temps} onChange={e=>setIntervenants(l=>l.map((x,j)=>j===idx?{...x,temps:Number(e.target.value)}:x))} className="w-16 bg-slate-950 border border-slate-700 rounded px-1.5 py-1 text-sm text-center"/>
   <span className="text-slate-500">h</span>
   <span className="w-20 text-right">{(it.temps*it.taux).toLocaleString()} DA</span>
   <button className="text-slate-500 hover:text-rose-400" onClick={()=>setIntervenants(l=>l.filter((_,i)=>i!==idx))} title="Retirer cet intervenant">{I.x}</button>
  </div>)}
  {!ajoutInter && <button type="button" onClick={()=>setAjoutInter(true)} className="text-xs text-sky-400 hover:underline mt-2">+ Ajouter / modifier un intervenant</button>}
  {ajoutInter && <>
  {(bt.assignes||[]).filter(n=>!intervenants.some(x=>x.nom===n)).length>0 && <div className="flex flex-wrap gap-1 mt-2 items-center"><span className="text-xs text-slate-500">Prévus :</span>{(bt.assignes||[]).filter(n=>!intervenants.some(x=>x.nom===n)).map(n=><button type="button" key={n} className="text-xs text-sky-400 border border-slate-700 rounded px-2 py-1 hover:bg-slate-700" onClick={()=>{const t=inter.find(i=>i.nom===n);if(t)setIntervenants(l=>[...l,{nom:t.nom,fonction:t.poste,temps:1,taux:t.taux}]);setAjoutInter(false);}}>+ {n}</button>)}</div>}
  {sysBT && interSys.length<interEq.length && <div className="text-[11px] text-slate-500 mt-2">Liste limitée aux intervenants du système {sysBT}.</div>}
  <div className="flex gap-1 mt-2">
   <select value={selInt} onChange={e=>setSelInt(e.target.value)} className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm"><option value="">— Choisir un intervenant —</option>{interSys.map(i=>{const cg=congeAt(i,todayStr());return <option key={i.mat} value={i.nom} disabled={!!cg}>{i.nom} — {i.poste}{cg?" (en congé "+libConge(cg)+")":""}</option>;})}</select>
   <input type="number" step="0.5" value={tempsInt} onChange={e=>setTempsInt(Number(e.target.value))} className="w-20 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm" placeholder="h"/>
   <Btn cls="bg-slate-700 hover:bg-slate-600 text-xs" onClick={ajouterInt}>+ Ajouter</Btn>
  </div>
  </>}

  <MateriauxSection label="Pièces utilisées" categorie="Pièce" pieces={pieces} list={piecesBT} setList={setPiecesBT}/>
  <MateriauxSection label="Outillage utilisé" categorie="Outillage" pieces={pieces} list={outillageBT} setList={setOutillageBT}/>
  <MateriauxSection label="Consommable utilisé" categorie="Consommable" pieces={pieces} list={consommablesBT} setList={setConsommablesBT}/>

  {allItems.length>0 && <div className="mt-3"><div className="text-xs text-slate-400 font-medium">Demande de sortie magasin (DS) — pièces uniquement <span className="text-slate-500">(outillage et consommables : sortie par décharge)</span></div>
   <div className="flex flex-wrap gap-1 mt-1">{allItems.map((it,i)=><button key={i} className="text-xs text-sky-400 border border-slate-700 rounded px-2 py-1 hover:bg-slate-700" onClick={()=>onCreateDS(it)}>Créer DS — {it.code} × {it.qte}</button>)}</div></div>}

  <div className="text-right text-sm text-slate-300 mt-3">Coût MO: {coutMO.toLocaleString()} DA — Coût Matières: {coutMat.toLocaleString()} DA — <b>Total: {(coutMO+coutMat).toLocaleString()} DA</b></div>
  {err && <div className="text-xs text-rose-400 text-right mt-1">{err}</div>}
  <div className="flex justify-end gap-2 mt-3">
   <Btn cls="bg-slate-700 hover:bg-slate-600" onClick={()=>{if(nokSansCom()){setErr("Commentaire obligatoire pour chaque tâche « Non OK ».");return;}setErr("");onSave(data());}}>Enregistrer</Btn>
   <Btn cls={(attente||pct<100)?"bg-slate-700 text-slate-500":"bg-emerald-600 hover:bg-emerald-500 text-white"} onClick={()=>{ if(!attente) cloturer(); }}>Clôturer le BT</Btn>
  </div>
 </div>);
}

function DSForm({pieces,bts,prefill,onSubmit}){
 const [f,setF]=useState({eq:prefill?.eq||"",nom:prefill?.nom||"",designation:"",piece:prefill?.piece||(pieces[0]||{}).code||"",qte:prefill?.qte||1,bt:prefill?.bt||""});
 return (<div>
  {prefill && <div className="text-xs text-sky-400 mb-2">Préremplie depuis le BT {prefill.bt}</div>}
  <Field label="Code équipement"><Inp value={f.eq} onChange={e=>setF({...f,eq:e.target.value})} placeholder="ex: TRAM-004"/></Field>
  <Field label="Nom de l'équipement"><Inp value={f.nom} onChange={e=>setF({...f,nom:e.target.value})}/></Field>
  <Field label="Désignation équipement"><Inp value={f.designation} onChange={e=>setF({...f,designation:e.target.value})}/></Field>
  <Field label="Pièce / Outillage / Consommable">
   <select value={f.piece} onChange={e=>setF({...f,piece:e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm mt-1">
    {pieces.map(p=><option key={p.code} value={p.code}>{p.code} — {p.nom} (stock: {p.stock})</option>)}
   </select>
  </Field>
  <Field label="Quantité"><Inp type="number" min="1" value={f.qte} onChange={e=>setF({...f,qte:Number(e.target.value)})}/></Field>
  <Field label="BT associé (optionnel)">
   <select value={f.bt} onChange={e=>setF({...f,bt:e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm mt-1">
    <option value="">—</option>{bts.map(b=><option key={b.code} value={b.code}>{b.code}</option>)}
   </select>
  </Field>
  <div className="text-xs text-slate-500 mt-2">État initial : "Transmis au Magasinier" (ou "En attente pièce" si le stock est insuffisant — le BT lié bascule alors aussi en "En attente pièce"). Le magasinier génère ensuite le BS ou annule la DS avec un motif.</div>
  <div className="flex justify-end mt-3"><Btn onClick={()=>onSubmit(f)}>Créer la Demande de Sortie (DS)</Btn></div>
 </div>);
}

function BRForm({pieces,onSubmit}){
 const [f,setF]=useState({piece:(pieces[0]||{}).code||"",qte:1});
 return (<div>
  <Field label="Pièce / Outillage / Consommable">
   <select value={f.piece} onChange={e=>setF({...f,piece:e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm mt-1">
    {pieces.map(p=><option key={p.code} value={p.code}>{p.code} — {p.nom}</option>)}
   </select>
  </Field>
  <Field label="Quantité retournée"><Inp type="number" min="1" value={f.qte} onChange={e=>setF({...f,qte:Number(e.target.value)})}/></Field>
  <div className="text-xs text-slate-500 mt-2">La quantité sera recréditée automatiquement sur le stock de la pièce.</div>
  <div className="flex justify-end mt-3"><Btn onClick={()=>onSubmit(f)}>Créer le Bon de Retour (BR)</Btn></div>
 </div>);
}


/* =====================================================================
   INDICATEURS DE PERFORMANCE — méthodes de calcul reprises de l'ancienne GMAO
   (Suivi des performances, Équipements, RH, Stock, AMDEC/MBF) et adaptées au
   modèle de données de cette GMAO : DI + BT liés, durées saisies sur le BT,
   arborescence technique, intervenants (temps individuel), magasin.
   ===================================================================== */


/* ===== Page : Indicateurs de performance ===== */
const KPI_ST={ok:{bg:"#ecfdf5",fg:"#047857",bd:"#a7f3d0",t:"Atteint"},warn:{bg:"#fffbeb",fg:"#b45309",bd:"#fde68a",t:"Proche"},bad:{bg:"#fff1f2",fg:"#be123c",bd:"#fecdd3",t:"Non atteint"},na:{bg:"#eef2f8",fg:"#64748b",bd:"#dde4ee",t:"Sans donnée"}};
const StChip=({st,txt})=>{const c=KPI_ST[st]||KPI_ST.na;return <span style={{background:c.bg,color:c.fg,border:"1px solid "+c.bd}} className="px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap">{txt||c.t}</span>;};
const fPct=(v,d=1)=>(v*100).toFixed(d).replace(".",",")+" %";
const fH=(v,d=2)=>Number(v).toFixed(d).replace(".",",")+" h";
const fDA=(v)=>Math.round(v).toLocaleString("fr-FR")+" DA";
const fNum=(v,d=1)=>Number(v).toFixed(d).replace(".",",");
const kpiSup=(s)=>s.replace(/[0-9]/g,(d)=>"⁰¹²³⁴⁵⁶⁷⁸⁹"[d]);
const fSci=(v)=>{if(!(v>0)) return "0"; const m=v.toExponential(2).split("e"); const ex=parseInt(m[1],10); return m[0].replace(".",",")+"×10"+(ex<0?"⁻":"")+kpiSup(String(Math.abs(ex)));};
const KpiCard=({label,value,sub,st,cible,stTxt})=>{const c=st&&KPI_ST[st];return <Card>
 <div className="flex justify-between items-start gap-2"><div className="text-xs text-slate-400">{label}</div>{st&&<StChip st={st} txt={stTxt}/>}</div>
 <div className="text-2xl font-bold mt-1" style={{color:c&&st!=="na"?c.fg:undefined}}>{value}</div>
 {cible&&<div className="text-xs text-slate-400 mt-1">Cible : {cible}</div>}
 {sub&&<div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
</Card>;};
const KpiTitle=({children,sub})=><div className="mb-2 mt-1"><h3 className="text-sm font-semibold text-slate-200">{children}</h3>{sub&&<div className="text-xs text-slate-500">{sub}</div>}</div>;
const KpiEmpty=({children})=><div className="text-sm text-slate-500 py-3">{children}</div>;
const KpiSelect=({value,onChange,options})=><select value={value} onChange={e=>onChange(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm">{options.map(o=><option key={o}>{o}</option>)}</select>;

const KPI_REFERENTIEL=[
 ["Ingénierie","MTTR","Σ durée d'intervention (BT) des pannes réparées ÷ nombre de pannes réparées","Pas de cible directe (suivi via μ = 1/MTTR)","DI « Traité » + durée d'intervention saisie sur le BT lié","La durée vient du compte-rendu du BT (en heures), plus d'import de fichier en minutes."],
 ["Ingénierie","MTBF","(Temps théorique du parc − Indisponibilité cumulée) ÷ nombre de pannes","Pas de cible directe (suivi via λ = 1/MTBF)","DI correctives « Traité », « Transmis », « À Transmettre » (annulées exclues)","Parc = équipements distincts ayant une DI/BT sur la période (méthode d'origine) ; option : tous les équipements de l'arborescence de l'unité."],
 ["Ingénierie","Disponibilité","(Temps théorique du parc − Indisponibilité) ÷ Temps théorique du parc. Temps théorique = heures de la période × nombre d'équipements","> 97 % (nouvelles unités) · > 95 % (anciennes unités)","Date événement de la DI → clôture du BT","Indisponibilité = clôture BT − date événement DI, bornée à la période ; à défaut de date de fin ou si écart négatif : durée d'intervention + temps logistique ; panne > 1,5 × période ignorée."],
 ["Ingénierie","λ — Taux de panne (1/MTBF)","1 ÷ MTBF","≤ 5×10⁻⁴ /h (nouvelles) · ≤ 3×10⁻⁴ /h (anciennes)","Idem MTBF","—"],
 ["Ingénierie","μ — Taux de réparation (1/MTTR)","1 ÷ MTTR","≥ 4×10⁻¹ /h (nouvelles) · ≥ 2,5×10⁻¹ /h (anciennes)","Idem MTTR","—"],
 ["Réalisation","TCP — Taux de charge préventive","Heures préventives ÷ (heures préventives + correctives), heures = durée d'intervention + temps logistique","> 80 % (nouvelles) · > 70 % (anciennes)","BT préventifs (plan) / BT correctifs (DI)","Les BT préventifs sont datés par leur date de génération (à défaut clôture, ou date du plan)."],
 ["Réalisation","TCC — Taux de charge corrective","Heures correctives ÷ (heures préventives + correctives)","< 20 % (nouvelles) · < 30 % (anciennes)","Idem TCP","—"],
 ["Réalisation","TMP — Taux de maintenance préventive","BT préventifs clôturés ÷ BT préventifs générés (hors annulés)","100 %","BT préventifs : état « Clôturé » / « En cours » / « En attente pièce »","Seuls les BT déjà générés comptent (comme dans l'ancienne appli)."],
 ["Réalisation","TMC — Taux de maintenance corrective","DI correctives traitées ÷ (traitées + transmises + à transmettre)","> 90 % (nouvelles) · > 85 % (anciennes)","DI : état « Traité » / « Transmis » / « À Transmettre »","Le cas « travaux divers » n'existe plus dans cette GMAO."],
 ["Taux","Taux de panne théorique","Heures correctives ÷ temps théorique du parc","Bon < 0,5 % · alerte 0,5–1 % · critique ≥ 1 %","BT correctifs","—"],
 ["Taux","Taux d'intervention (indisponibilité)","Indisponibilité cumulée ÷ temps théorique du parc","Bon < 1 % · alerte 1–5 % · critique ≥ 5 %","DI + BT","—"],
 ["Taux","Taux de récurrence","Pannes ayant un même équipement + même motif (≥ 2 fois) ÷ pannes totales","Bon < 15 % · alerte 15–30 % · critique ≥ 30 %","Motif = champ « Panne » du BT (à défaut : désignation de la DI)","Le motif est un champ saisi, plus de détection par analyse de texte."],
 ["Équipements","Catégories d'équipement","Cat. 1 = préventif ET correctif · Cat. 2 = préventif seul · Cat. 3 = correctif seul","—","BT / DI par équipement","Seuil « BT total » réglable pour surligner les équipements très sollicités."],
 ["Équipements","Taux logistique / d'intervention (correctif)","Logistique ÷ (durée + logistique) · Durée ÷ (durée + logistique)","—","BT correctifs","—"],
 ["RH","Taux d'occupation d'un technicien","Charge réelle ÷ Norme. Norme = 108 h/mois × (jours de la période ÷ 30)","Surcharge > 105 % · équilibre 75–105 % · sous-charge < 75 %","Temps saisi par intervenant sur chaque BT","On utilise le temps réel de chaque intervenant (et non la durée globale de l'intervention répartie)."],
 ["RH","Besoin en effectif","Théorique = Charge totale ÷ Norme · Essentiel = arrondi supérieur · Écart = Essentiel − nb techniciens","—","Intervenants ayant des heures sur la période","—"],
 ["RH","Taux d'efficience","Charge totale calculée GMAO ÷ Charge RAM déclarée","≈ 100 %","Charge RAM saisie manuellement","Saisie sur la période affichée."],
 ["Stock","Coût de consommation","Σ (quantité sortie × prix) ; coût moyen/mois = coût total ÷ nombre de mois de la période","—","Mouvements « Sortie » du magasin","Prix = prix actuel de l'article (pas d'historique de prix dans cette GMAO)."],
 ["Stock","Stock de sécurité","Conso. moyenne mensuelle × délai fournisseur (3 mois par défaut) ; alerte si stock < stock de sécurité","Stock ≥ stock de sécurité","Sorties de la période + stock actuel","Comparé aussi au seuil minimum saisi sur l'article."],
 ["Stock","Stock dormant / rotation","Dormant = aucune sortie depuis ≥ 365 jours et valeur de stock > 0 ; rotation = conso. des 12 derniers mois","Aucun article dormant","Mouvements + stock × prix","—"],
 ["Fiabilité","Criticité AMDEC","C = G × P × ND. P : occurrences/an extrapolées (<1 : 1 · <4 : 2 · <52 : 3 · ≥52 : 4) · G : arrêt moyen en min (<2 : 1 · <20 : 2 · <120 : 3 · ≥120 : 4) · ND : détection","Majeure ≥ 16 · Modérée ≥ 10 · Acceptable < 10","DI correctives + gravité / détection saisies sur le BT","ND = moyenne saisie sur les BT (2 par défaut si absente) ; G au choix : durée d'arrêt ou gravité saisie."],
 ["Fiabilité","Stratégie recommandée","Arbre de décision : C ≥ 16 ou G = 4 → MBF/RCM · G = 1 et C < 10 → Corrective · ND = 1 → Basée sur l'état · P ≥ 3 → Proactive · ND ≤ 2 → TPM · sinon Préventive","—","Résultat de l'AMDEC","—"],
];

function IndicateursPage({unit,dis,bts,planning,equipements,pieces,systemsList,treeStruct,kpiOk=()=>true}){
 const pad=(n)=>String(n).padStart(2,"0");
 const ymd=(d)=>d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
 const now=new Date(); const d30=new Date(now); d30.setDate(d30.getDate()-29);
 const [subRaw,setSub]=useState("Synthèse");
 const [start,setStart]=useState(ymd(d30));
 const [end,setEnd]=useState(ymd(now));
 const [normeBase,setNormeBase]=useState(KPI_NORME_DEFAUT);
 const [chargeRAM,setChargeRAM]=useState("");
 const [delai,setDelai]=useState(3);
 const [seuilBT,setSeuilBT]=useState(0);
 const [parcMode,setParcMode]=useState("Équipements avec DI/BT");
 const [groupBy,setGroupBy]=useState("Équipement");
 const [gravBase,setGravBase]=useState("Gravité saisie (BT)");
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
  colonnes:[{h:"Code"},{h:"Équipement"},{h:"Catégorie"},{h:"BT préventifs",t:"num"},{h:"DI correctives",t:"num"},{h:"Pannes",t:"num"},{h:"MTTR (h)",t:"num"},{h:"MTBF (h)",t:"num"},{h:"Disponibilité (%)",t:"num"},{h:"Taux logistique corr. (%)",t:"num"}],
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
 const SUBS=["Synthèse","Équipements","Ressources humaines","Stock","Criticité (AMDEC)","Référentiel"].filter(x=>kpiOk(x));
 const sub=SUBS.includes(subRaw)?subRaw:(SUBS[0]||"");
 const eqSeuil=Number(seuilBT)||0;
 const cats=[1,2,3].map(c=>eqRows.filter(e=>e.cat===c));

 return (<div className="space-y-4">
  <Card>
   <div className="flex flex-wrap items-end gap-3">
    <div><div className="text-xs text-slate-400">Du</div><Inp type="date" value={start} onChange={e=>setStart(e.target.value)}/></div>
    <div><div className="text-xs text-slate-400">Au</div><Inp type="date" value={end} onChange={e=>setEnd(e.target.value)}/></div>
    <div className="flex gap-1 flex-wrap">{["30 j","Mois en cours","Mois précédent","Année"].map(k=><Btn key={k} cls="bg-slate-700 hover:bg-slate-600 text-xs" onClick={()=>preset(k)}>{k}</Btn>)}</div>
    <div><div className="text-xs text-slate-400">Parc de référence (disponibilité, MTBF)</div><Segment value={parcMode} options={["Équipements avec DI/BT","Arborescence complète"]} onChange={setParcMode}/></div>
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
   {fltActif && <div className="text-xs text-sky-400 mt-2">Indicateurs calculés uniquement sur : {fltLabel}. {ctx.corr.length+ctx.prev.length===0?"Aucune DI ni BT sur la période pour ce périmètre.":""}</div>}
  </Card>
  <div className="flex flex-wrap gap-1">{SUBS.map(s=><button key={s} onClick={()=>setSub(s)} className={"px-3 py-1.5 rounded-lg text-sm border "+(sub===s?"bg-sky-600 border-sky-500 text-white":"bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-700")}>{s}</button>)}</div>

  {sub==="Synthèse" && <div className="space-y-4">
   <div className="flex justify-between items-center"><div className="text-xs text-slate-500">{K.nbDI} DI correctives · {K.nbBTPrev} BT préventifs sur la période{K.nbPerturb>0?" · "+K.nbPerturb+" avec perturbation d'exploitation":""}</div><ExportBtn onClick={exportSynthese}/></div>
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
     <KpiCard label="TMP — maintenance préventive" value={hasPrev?fPct(K.tmp):"—"} st={kpiStatus(O.tmp,K.tmp,hasPrev)} cible={O.tmp.label} sub={K.btClosed+" BT clôturé(s) / "+K.btDenom}/>
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
    {K.nbSansFin>0 && <div>• {K.nbSansFin} panne(s) sans clôture de BT : l'indisponibilité est estimée par durée d'intervention + temps logistique.</div>}
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
    <div className="flex items-end gap-3"><div><div className="text-xs text-slate-400">Seuil « BT total » (0 = désactivé)</div><Inp type="number" min="0" value={seuilBT} onChange={e=>setSeuilBT(e.target.value)}/></div><div className="text-xs text-slate-500 pb-2">Surligne les équipements dont les BT (préventifs + correctifs) atteignent le seuil.</div></div>
    <ExportBtn onClick={exportEquip}/>
   </div>
   <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
    <KpiCard label="Catégorie 1 — Préventif ET correctif" value={cats[0].length} sub="équipements suivis et en panne"/>
    <KpiCard label="Catégorie 2 — Préventif seulement" value={cats[1].length} sub="équipements sans panne"/>
    <KpiCard label="Catégorie 3 — Correctif seulement" value={cats[2].length} sub="équipements en panne sans préventif — à planifier"/>
   </div>
   <Card>
    {eqRows.length===0?<KpiEmpty>Aucun équipement avec DI ou BT sur la période.</KpiEmpty>:
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-slate-400 text-left"><Th>Équipement</Th><Th>Cat.</Th><Th>BT prév.</Th><Th>DI corr.</Th><Th>Pannes</Th><Th>MTTR</Th><Th>MTBF</Th><Th>Disponibilité</Th><Th>Taux logistique</Th><Th>Taux intervention</Th></tr></thead>
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
    {rh.techs.length===0?<KpiEmpty>Aucune heure d'intervenant saisie sur la période (le temps se renseigne à la clôture du BT).</KpiEmpty>:
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-slate-400 text-left"><Th>Technicien</Th><Th>Interventions</Th><Th>Charge réelle</Th><Th>Norme</Th><Th>Taux d'occupation</Th><Th>Écart</Th><Th>Statut</Th></tr></thead>
    <tbody>{rh.techs.map(t=><tr key={t.technicien} className="border-t border-slate-700"><td className="py-1.5">{t.technicien}<br/><span className="text-xs text-slate-400">{t.fonction}</span></td><td>{t.nbInterventions}</td><td>{fH(t.chargeReelle,1)}</td><td>{fH(t.norme,1)}</td>
     <td><div className="flex items-center gap-2"><div className="w-24 h-2 rounded bg-slate-700 overflow-hidden"><div style={{width:Math.min(100,t.taux*100)+"%",background:t.statut==="surcharge"?"#be123c":t.statut==="sous-charge"?"#b45309":"#047857"}} className="h-2"/></div>{fPct(t.taux)}</div></td>
     <td>{(t.delta>0?"+":"")+fNum(t.delta)} h</td><td><StChip st={t.statut==="surcharge"?"bad":t.statut==="sous-charge"?"warn":"ok"} txt={t.statut}/></td></tr>)}</tbody></table></div>}
   </Card>
   <div className="text-xs text-slate-500">Statuts : surcharge &gt; 105 % · équilibre 75–105 % · sous-charge &lt; 75 %. La charge est le temps saisi par chaque intervenant sur les BT de l'unité.</div>
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
     <div><div className="text-xs text-slate-400">Base de la gravité (G)</div><Segment value={gravBase} options={["Gravité saisie (BT)","Durée d'arrêt moyenne"]} onChange={setGravBase}/></div>
    </div><ExportBtn onClick={exportAmdec}/>
   </div>
   <Card>
    {amdec.length===0?<KpiEmpty>Aucune panne corrective sur la période.</KpiEmpty>:
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-slate-400 text-left"><Th>{groupBy}</Th><Th>Pannes</Th><Th>Occ./an</Th><Th>Arrêt moy.</Th><Th>P</Th><Th>G</Th><Th>ND</Th><Th>Criticité C</Th><Th>Stratégie recommandée</Th></tr></thead>
    <tbody>{amdec.map(g=><tr key={g.key} className="border-t border-slate-700 align-top"><td className="py-1.5">{g.label}<br/><span className="text-xs text-slate-400">{g.sub||g.exemples[0]}</span></td><td>{g.count}</td><td>{fNum(g.annual,1)}</td><td>{g.avgMin} min</td><td>{g.f}</td><td title={gravBase==="Gravité saisie (BT)"?(g.gDefaut?"Aucune gravité saisie sur les BT : repli sur la durée d'arrêt":"Moyenne arrondie de "+g.nbGrav+" gravité(s) saisie(s) sur les BT (min "+g.gMin+" · max "+g.gMax+")"):"Calculée d'après la durée d'arrêt moyenne"}>{g.g}{g.gDefaut?"*":""}{gravBase==="Gravité saisie (BT)"&&!g.gDefaut&&<span className="text-xs text-slate-500"> ({g.nbGrav}/{g.count} BT)</span>}</td><td title={g.dDefaut?"Non saisie sur les BT : valeur par défaut 2":"Moyenne des détections saisies"}>{g.d}{g.dDefaut?"*":""}</td>
     <td><StChip st={g.band.cls} txt={g.crit+" — "+g.band.label}/></td><td title={g.strat.why}><span className="px-2 py-0.5 rounded-full text-xs bg-slate-700">{g.strat.id}</span><div className="text-xs text-slate-500 max-w-xs mt-0.5">{g.strat.why}</div></td></tr>)}</tbody></table></div>}
   </Card>
   <div className="text-xs text-slate-500">C = G × P × ND · Majeure ≥ 16 · Modérée ≥ 10 · Acceptable &lt; 10. P est extrapolée sur 365 jours à partir de la période affichée. G « Gravité saisie (BT) » = moyenne arrondie des gravités 1 à 4 saisies dans le compte-rendu des BT ; * G = durée d'arrêt quand aucune gravité n'est saisie ; * ND = 2 par défaut quand la détection n'est pas saisie sur les BT.</div>
  </div>}

  {sub==="Référentiel" && <div className="space-y-3">
   <div className="flex justify-between items-center"><div className="text-xs text-slate-500">Formules, cibles et correspondance avec les données de cette GMAO.</div><ExportBtn onClick={exportRef}/></div>
   <Card><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-slate-400 text-left"><Th>Famille</Th><Th>Indicateur</Th><Th>Formule</Th><Th>Cible</Th><Th>Source dans la GMAO</Th><Th>Adaptation</Th></tr></thead>
   <tbody>{KPI_REFERENTIEL.map((r,i)=><tr key={i} className="border-t border-slate-700 align-top"><td className="py-1.5 text-xs text-slate-400">{r[0]}</td><td className="font-medium text-slate-200">{r[1]}</td><td className="text-xs text-slate-400 max-w-sm">{r[2]}</td><td className="text-xs text-slate-400 max-w-[200px]">{r[3]}</td><td className="text-xs text-slate-400 max-w-[220px]">{r[4]}</td><td className="text-xs text-slate-500 max-w-xs">{r[5]}</td></tr>)}</tbody></table></div></Card>
  </div>}
 </div>);
}

/* ================= ACCÈS : connexion + droits par unité / système / volet ================= */
const KPI_VUES=[["Synthèse","Synthèse"],["Équipements","Équipements"],["Ressources humaines","Ressources humaines"],["Stock","Stock"],["Criticité (AMDEC)","Criticité (AMDEC)"],["Référentiel","Référentiel"]];
const KPI_BLOCS=[["syn:ing","Synthèse › Indicateurs d'ingénierie (MTTR, MTBF, disponibilité…)"],["syn:real","Synthèse › Indicateurs de réalisation (TCP, TCC, TMP, TMC)"],["syn:taux","Synthèse › Taux de panne, d'intervention, récurrence"],["syn:comp","Synthèse › Comparatif des unités"]];
const KPI_ALL=[...KPI_VUES,...KPI_BLOCS].map(x=>x[0]);
const VOLETS=["Arborescence Technique","Demandes d'Intervention (DI)","Bons de Travail (BT)","Planning Préventif","Magasin & Achats","Intervenants","Indicateurs de performance"];
const Chk=({checked,onChange,children})=><label className="flex items-center gap-1.5 text-sm cursor-pointer"><input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)}/>{children}</label>;

function Splash({msg,action,actionLabel}){
 return <div style={{minHeight:"100vh",display:"grid",placeItems:"center",background:"#f3f6fb",fontFamily:"'Segoe UI',system-ui,sans-serif"}}>
  <div style={{textAlign:"center",color:"#334155"}}><img src={XL_LOGO} alt="SETRAM" style={{width:180,height:"auto",marginBottom:14}}/>
   <div style={{fontSize:15}}>{msg}</div>
   {action&&<button onClick={action} style={{marginTop:16,height:42,padding:"0 22px",border:0,borderRadius:8,background:"#0b4ea2",color:"#fff",fontSize:14,cursor:"pointer"}}>{actionLabel}</button>}
  </div></div>;
}

function LoginPage({onLogin}){
  const [id,setId]=useState(""); const [pw,setPw]=useState(""); const [err,setErr]=useState(""); const [rem,setRem]=useState(false); const [busy,setBusy]=useState(false);
  const [demo,setDemo]=useState(null);
  useEffect(()=>{ let vivant=true; Promise.resolve(api.demo?api.demo():null).then(d=>{ if(vivant&&d&&d.demo) setDemo(d); }); return ()=>{vivant=false;}; },[]);
  const submit=async()=>{
   if(busy) return; setBusy(true); setErr("");
   try{ const r=await api.login(id.trim(),pw,rem); onLogin(r.user); }
   catch(e){ setErr(e.message); }
   finally{ setBusy(false); }
  };
 const kd=(e)=>{if(e.key==="Enter")submit();};
 const inp={width:"100%",height:50,border:"1px solid #e5e7eb",borderRadius:8,padding:"0 14px",fontSize:15,color:"#374151",background:"#fff",boxSizing:"border-box",outline:"none",marginTop:8};
 const lab={display:"block",fontSize:15,color:"#374151",fontWeight:500};
 return <div style={{minHeight:"100vh",background:"#f3f6fb",fontFamily:"Inter,'Segoe UI',system-ui,sans-serif"}}>
  <div style={{textAlign:"center",paddingTop:30}}><img src={XL_LOGO} alt="SETRAM" style={{width:220,height:"auto",display:"inline-block"}}/>
   <div style={{fontSize:22,fontWeight:700,color:"#0f2447",letterSpacing:1,marginTop:2}}>GMAO</div></div>
  {demo && <div data-testid="bandeau-demo" style={{maxWidth:1120,margin:"16px auto 0",background:"#fff7ed",border:"1px solid #fdba74",borderRadius:10,padding:"12px 18px",color:"#7c2d12",fontSize:14}}>
   <b>Version de démonstration</b> — {demo.statique?"toutes les données sont fictives et restent dans votre navigateur : elles disparaissent quand vous fermez l'onglet.":"toutes les données sont fictives et remises à zéro"+(demo.resetHeures>0?" toutes les "+demo.resetHeures+" h":" régulièrement")+"."} Choisissez un profil pour essayer l'application :
   <div style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:10}}>{demo.comptes.map(c=><button key={c.id} onClick={()=>{setId(c.id);setPw(c.motDePasse);setErr("");}} title={c.description} style={{border:"1px solid #fdba74",background:id===c.id?"#fed7aa":"#fff",borderRadius:8,padding:"6px 12px",fontSize:13,cursor:"pointer",color:"#7c2d12"}}>{c.nom.replace("Démo — ","")}</button>)}</div>
   {(demo.comptes.find(c=>c.id===id)||{}).description && <div style={{marginTop:8,fontSize:13}}>{demo.comptes.find(c=>c.id===id).description}</div>}
  </div>}
  <div style={{maxWidth:1120,margin:"20px auto 0",background:"#fff",border:"1px solid #e5e7eb",borderRadius:12,borderTop:"4px solid #e30613",padding:"56px 20px 52px",boxShadow:"0 4px 14px rgba(15,36,71,.06)"}}>
   <div style={{maxWidth:430,margin:"0 auto"}}>
    <h2 style={{textAlign:"center",fontSize:22,fontWeight:600,color:"#0f2447",margin:0,paddingBottom:30,borderBottom:"1px solid #e5e7eb"}}>Connexion à votre compte</h2>
    <div style={{marginTop:30}}>
     <label style={lab}>Identifiant<input style={inp} value={id} onChange={e=>{setId(e.target.value);setErr("");}} onKeyDown={kd} autoFocus autoComplete="username"/></label>
    </div>
    <div style={{marginTop:22}}>
     <label style={lab}>Mot de passe<input style={inp} type="password" value={pw} onChange={e=>{setPw(e.target.value);setErr("");}} onKeyDown={kd} autoComplete="current-password"/></label>
    </div>
    <label style={{display:"flex",alignItems:"center",gap:12,marginTop:26,fontSize:15,color:"#374151",cursor:"pointer"}}>
     <input type="checkbox" checked={rem} onChange={e=>setRem(e.target.checked)} style={{width:24,height:24,accentColor:"#0b4ea2",borderRadius:6,cursor:"pointer"}}/>Se souvenir de moi</label>
    {err&&<div style={{marginTop:16,fontSize:13,color:"#be123c",background:"#fff1f2",border:"1px solid #fecdd3",borderRadius:8,padding:"8px 12px"}}>{err}</div>}
    <button onClick={submit} disabled={busy} style={{marginTop:28,width:"100%",height:50,border:0,borderRadius:8,background:"#0b4ea2",color:"#fff",fontSize:15,fontWeight:500,cursor:"pointer",opacity:busy?.7:1}}>{busy?"Connexion…":"Se connecter"}</button>
   </div>
  </div></div>;
}


function ChangePwPage({me,onDone,onLogout}){
  const [cur,setCur]=useState(""); const [n1,setN1]=useState(""); const [n2,setN2]=useState(""); const [err,setErr]=useState(""); const [busy,setBusy]=useState(false);
  const submit=async()=>{
   if(n1!==n2) return setErr("Les deux nouveaux mots de passe ne correspondent pas.");
   setBusy(true); setErr("");
   try{ const r=await api.changePassword(cur,n1); onDone(r.user); }
   catch(e){ setErr(e.message); } finally{ setBusy(false); }
  };
  const inp={width:"100%",height:46,border:"1px solid #e5e7eb",borderRadius:8,padding:"0 14px",fontSize:15,color:"#374151",background:"#fff",boxSizing:"border-box",outline:"none",marginTop:6};
  const lab={display:"block",fontSize:14,color:"#374151",fontWeight:500,marginTop:16};
  return <div style={{minHeight:"100vh",background:"#f3f6fb",fontFamily:"'Segoe UI',system-ui,sans-serif",display:"grid",placeItems:"center",padding:16}}>
   <div style={{width:"100%",maxWidth:460,background:"#fff",border:"1px solid #e5e7eb",borderTop:"4px solid #e30613",borderRadius:12,padding:"32px 30px",boxShadow:"0 4px 14px rgba(15,36,71,.06)"}}>
    <h2 style={{margin:0,fontSize:20,color:"#0f2447"}}>Choisissez un nouveau mot de passe</h2>
    <p style={{fontSize:13,color:"#64748b",margin:"8px 0 0"}}>Bonjour {me.nom}. Pour votre sécurité, vous devez remplacer le mot de passe provisoire avant de continuer. Minimum 10 caractères, avec au moins une lettre et un chiffre.</p>
    <label style={lab}>Mot de passe actuel<input style={inp} type="password" value={cur} onChange={e=>setCur(e.target.value)} autoComplete="current-password" autoFocus/></label>
    <label style={lab}>Nouveau mot de passe<input style={inp} type="password" value={n1} onChange={e=>setN1(e.target.value)} autoComplete="new-password"/></label>
    <label style={lab}>Confirmer le nouveau mot de passe<input style={inp} type="password" value={n2} onChange={e=>setN2(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")submit();}} autoComplete="new-password"/></label>
    {err&&<div style={{marginTop:14,fontSize:13,color:"#be123c",background:"#fff1f2",border:"1px solid #fecdd3",borderRadius:8,padding:"8px 12px"}}>{err}</div>}
    <button onClick={submit} disabled={busy} style={{marginTop:22,width:"100%",height:46,border:0,borderRadius:8,background:"#0b4ea2",color:"#fff",fontSize:15,fontWeight:500,cursor:"pointer",opacity:busy?.7:1}}>{busy?"Enregistrement…":"Enregistrer et continuer"}</button>
    <button onClick={onLogout} style={{marginTop:10,width:"100%",height:40,border:0,background:"none",color:"#64748b",fontSize:13,cursor:"pointer",textDecoration:"underline"}}>Se déconnecter</button>
   </div></div>;
}

function AdminPage({systemsList,me,importRefs}){
 const [vue,setVue]=useState("acces");
 const onglet=(k,t)=><button onClick={()=>setVue(k)} className={"px-3 py-1.5 rounded-lg text-sm font-medium transition "+(vue===k?"bg-sky-600 text-white":"bg-slate-800 text-slate-300 hover:bg-slate-700")}>{t}</button>;
 return (<div>
  <div className="flex gap-2 mb-3">{onglet("acces","Comptes et droits d'accès")}{onglet("import","Import de données (Excel)")}</div>
  {vue==="acces" ? <AdminAcces systemsList={systemsList} me={me}/> : <ImportDonnees refs={importRefs}/>}
 </div>);
}

function AdminAcces({systemsList,me}){
 const [users,setUsers]=useState([]); const [loadErr,setLoadErr]=useState(""); const msgRef=useRef(null);
 const reload=()=>api.users().then(r=>{setUsers(r.users);setLoadErr("");}).catch(e=>setLoadErr(e.message));
 useEffect(()=>{reload();},[]);
 const normId=(s)=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim().replace(/\s+/g,".").replace(/[^a-z0-9._-]/g,"");
 const pwProblem=(p)=>p.length<10?"Mot de passe : 10 caractères minimum.":(!/[A-Za-z]/.test(p)||!/[0-9]/.test(p))?"Le mot de passe doit contenir au moins une lettre ET un chiffre.":"";
 const [sel,setSel]=useState(null); const [open,setOpen]=useState({}); const [msg,setMsg]=useState("");
 const allSys=systemsList.map(s=>s[0]);
 const edit=(u)=>{setSel({...u,id0:u.id,pw:"",_new:false,droits:JSON.parse(JSON.stringify(u.droits||{}))});setMsg("");};
 const add=()=>{setSel({id:"",nom:"",role:"Technicien",pw:"",actif:true,superAdmin:false,droits:{},_new:true});setMsg("");};
 const setD=(u,patch)=>setSel(s=>({...s,droits:{...s.droits,[u]:{...(s.droits[u]||{systems:[],volets:[]}),...patch}}}));
 const toggleUnit=(u,on)=>{setSel(s=>{const d={...s.droits}; if(on) d[u]=d[u]||{systems:[],volets:[]}; else delete d[u]; return {...s,droits:d};}); if(on) setOpen(o=>({...o,[u]:true}));};
 const toggleIn=(u,key,v)=>{const cur=(sel.droits[u]||{})[key]||(key==="kpi"?KPI_ALL:[]); setD(u,{[key]:cur.includes(v)?cur.filter(x=>x!==v):[...cur,v]});};
 const copyAll=(u)=>setSel(s=>{const src=s.droits[u]; const d={}; UNITS.forEach(x=>{d[x]={...src,systems:[...src.systems],volets:[...src.volets],...(src.kpi?{kpi:[...src.kpi]}:{})};}); return {...s,droits:d};});
 const save=async()=>{
   const id=sel._new?normId(sel.id):sel.id0, nom=sel.nom.trim();
   if(!nom) return setMsg("Le nom complet est obligatoire.");
   if(id.length<3) return setMsg("Identifiant : 3 caractères minimum (lettres, chiffres, point, tiret). Exemple : karim.belaid");
   if(sel._new&&!sel.pw) return setMsg("Mot de passe provisoire obligatoire pour un nouveau compte.");
   if(sel.pw){const pb=pwProblem(sel.pw); if(pb) return setMsg(pb);}
   const isMe=!sel._new&&sel.id0===me;
   const body={nom,role:sel.superAdmin?"Super Admin":sel.role,actif:isMe?true:sel.actif,superAdmin:isMe?true:sel.superAdmin,droits:sel.droits,...(sel.pw?{password:sel.pw}:{})};
   try{
    if(sel._new) await api.createUser({id,...body}); else await api.updateUser(sel.id0,body);
    await reload(); setSel(null); setMsg("");
   }catch(e){ setMsg(e.message); }
  };
  useEffect(()=>{if(msg&&msgRef.current) msgRef.current.scrollIntoView({block:"center",behavior:"smooth"});},[msg]);
  const del=async()=>{ if(sel.id0===me) return; if(window.confirm("Supprimer le compte « "+sel.nom+" » ?")){ try{await api.deleteUser(sel.id0); await reload(); setSel(null);}catch(e){setMsg(e.message);} } };
 const resume=(u)=>u.superAdmin?"Accès total":(Object.keys(u.droits||{}).length?Object.entries(u.droits).map(([un,d])=>un+" ("+d.systems.length+" sys. · "+d.volets.length+" volets)").join(" · "):"Aucun accès");
 return <div className="grid md:grid-cols-3 gap-4">
  <div className="space-y-2">
   <Btn onClick={add}>+ Nouvel utilisateur</Btn>
    {loadErr&&<div className="text-xs text-rose-400">{loadErr}</div>}
   {users.map(u=><Card key={u.id} cls={"cursor-pointer "+(sel&&sel.id0===u.id?"border-sky-500":"")}>
    <div onClick={()=>edit(u)}>
     <div className="flex justify-between items-center"><b className="text-slate-100 text-sm">{u.nom}</b>{!u.actif&&<span className="text-xs text-rose-400">Désactivé</span>}</div>
     <div className="text-xs text-slate-500">{u.id} · {u.superAdmin?"Super admin":u.role}</div>
     <div className="text-xs text-slate-400 mt-1">{resume(u)}</div>
    </div></Card>)}
  </div>
  <div className="md:col-span-2">
   {!sel?<Card><div className="text-sm text-slate-400">Sélectionnez un utilisateur ou créez-en un pour définir ses droits en détail : par unité, par système et par volet.</div></Card>:
   <Card cls="space-y-3">
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
     <Field label="Nom complet"><Inp value={sel.nom} onChange={e=>setSel({...sel,nom:e.target.value})}/></Field>
     <Field label="Identifiant"><Inp value={sel.id} disabled={!sel._new} onChange={e=>setSel({...sel,id:e.target.value})}/>{sel._new&&<div className="text-[11px] text-slate-500 mt-1">{sel.id&&normId(sel.id)!==sel.id.trim()?<>Sera enregistré : <b className="text-slate-300">{normId(sel.id)}</b></>:"Minuscules, chiffres, point ou tiret. Ex. : karim.belaid"}</div>}</Field>
     <Field label={sel._new?"Mot de passe":"Nouveau mot de passe (vide = inchangé)"}><Inp type="password" value={sel.pw} onChange={e=>setSel({...sel,pw:e.target.value})} autoComplete="new-password"/><div className="text-[11px] text-slate-500 mt-1">10 caractères minimum, avec au moins une lettre et un chiffre.{sel._new?" L’utilisateur devra le changer à sa première connexion.":""}</div></Field>
     <Field label="Fonction"><select value={sel.role} disabled={sel.superAdmin} onChange={e=>setSel({...sel,role:e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm mt-1">{ROLES.map(r=><option key={r}>{r}</option>)}</select></Field>
    </div>
    <div className="flex gap-5 flex-wrap">
     <Chk checked={sel.actif} onChange={v=>setSel({...sel,actif:v})}>Compte actif</Chk>
     <Chk checked={sel.superAdmin} onChange={v=>setSel({...sel,superAdmin:v})}>Super administrateur (accès total + gestion des droits)</Chk>
    </div>
    {!sel.superAdmin&&<div>
     <div className="text-sm font-semibold text-slate-200 mb-1">Droits détaillés par unité</div>
     <div className="text-xs text-slate-500 mb-2">Cochez les unités visibles, puis pour chacune les systèmes et les volets autorisés.</div>
     <div className="space-y-2">{UNITS.map(u=>{const d=sel.droits[u]; return <div key={u} className="border border-slate-700 rounded-lg p-2">
      <div className="flex items-center justify-between gap-2">
       <Chk checked={!!d} onChange={v=>toggleUnit(u,v)}><b className="text-slate-100">{u}</b></Chk>
       {d&&<div className="flex items-center gap-2 text-xs text-slate-400">{d.systems.length}/{allSys.length} systèmes · {d.volets.length}/{VOLETS.length} volets
        <button className="underline" onClick={()=>setOpen(o=>({...o,[u]:!o[u]}))}>{open[u]?"Réduire":"Détail"}</button></div>}
      </div>
      {d&&open[u]&&<div className="mt-2 space-y-2">
       <div><div className="flex gap-3 text-xs text-slate-400 mb-1">Systèmes <button className="underline" onClick={()=>setD(u,{systems:[...allSys]})}>Tous</button><button className="underline" onClick={()=>setD(u,{systems:[]})}>Aucun</button></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1">{systemsList.map(([c,n])=><Chk key={c} checked={d.systems.includes(c)} onChange={()=>toggleIn(u,"systems",c)}>{c} <span className="text-xs text-slate-500">{n}</span></Chk>)}</div></div>
       <div><div className="flex gap-3 text-xs text-slate-400 mb-1">Volets <button className="underline" onClick={()=>setD(u,{volets:VOLETS.map((_,i)=>i)})}>Tous</button><button className="underline" onClick={()=>setD(u,{volets:[]})}>Aucun</button></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1">{VOLETS.map((v,i)=><Chk key={i} checked={d.volets.includes(i)} onChange={()=>toggleIn(u,"volets",i)}>{v}</Chk>)}</div></div>
       {d.volets.includes(6)&&<div className="border border-slate-700 rounded-lg p-2"><div className="flex gap-3 text-xs text-slate-400 mb-1">Indicateurs de performance — détail de visualisation <button className="underline" onClick={()=>setD(u,{kpi:[...KPI_ALL]})}>Tout</button><button className="underline" onClick={()=>setD(u,{kpi:[]})}>Aucun</button></div>
        <div className="text-xs text-slate-500 mb-1">Vues</div><div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1">{KPI_VUES.map(([k,l])=><Chk key={k} checked={(d.kpi||KPI_ALL).includes(k)} onChange={()=>toggleIn(u,"kpi",k)}>{l}</Chk>)}</div>
        <div className="text-xs text-slate-500 mt-2 mb-1">Blocs de la synthèse</div><div className="space-y-1">{KPI_BLOCS.map(([k,l])=><Chk key={k} checked={(d.kpi||KPI_ALL).includes(k)} onChange={()=>toggleIn(u,"kpi",k)}>{l}</Chk>)}</div></div>}
       <button className="text-xs underline text-slate-400" onClick={()=>window.confirm("Appliquer ces droits à toutes les unités ?")&&copyAll(u)}>Copier ces droits sur toutes les unités</button>
      </div>}
     </div>;})}</div>
    </div>}
    {msg&&<div ref={msgRef} className="text-sm text-rose-100 bg-rose-900/60 border border-rose-500 rounded-lg px-3 py-2">⚠ {msg}</div>}
    <div className="flex gap-2 justify-end">
     {!sel._new&&sel.id0!==me&&<Btn cls="bg-rose-700 hover:bg-rose-600 text-white" onClick={del}>Supprimer</Btn>}
     <Btn cls="bg-slate-700 hover:bg-slate-600" onClick={()=>{setSel(null);setMsg("");}}>Annuler</Btn>
     <Btn onClick={save}>Enregistrer</Btn>
    </div>
   </Card>}
  </div></div>;
}

export default function App(){
 const [me,setMe]=useState(undefined);
 useEffect(()=>{api.me().then(r=>setMe(r.user)).catch(()=>setMe(null));},[]);
 useEffect(()=>{const h=()=>setMe(null);window.addEventListener("gmao:unauth",h);return()=>window.removeEventListener("gmao:unauth",h);},[]);
 useEffect(()=>{const h=(e)=>{if(hasPending()){e.preventDefault();e.returnValue="";}};window.addEventListener("beforeunload",h);return()=>window.removeEventListener("beforeunload",h);},[]);
 const logout=async()=>{try{await flushAll();await api.logout();}catch(e){} setMe(null);};
 if(me===undefined) return <Splash msg="Chargement…"/>;
 if(!me) return <LoginPage onLogin={setMe}/>;
 if(me.mustChangePw) return <ChangePwPage me={me} onDone={setMe} onLogout={logout}/>;
 return <GmaoApp key={me.id} session={{id:me.id,nom:me.nom,role:me.role,superAdmin:!!me.superAdmin,droits:me.droits||{}}} onLogout={logout}/>;
}
