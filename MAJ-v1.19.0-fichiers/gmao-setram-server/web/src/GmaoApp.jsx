// Application connectée : données synchronisées, actions métier, mise en page (menu, en-tête, onglets).
import React,{useState,useEffect,useRef} from "react";
import {ACCUEIL,MATERIAUX,ORG_DOM,ROLES,VALIDATION,RAPPORTS,VOLET_RAPPORTS} from "./constantes.js";
import {XL_LOGO} from "./excel.js";
import {ajouterReleve,dernier,etatPlanCompteur,isCompteurPlan} from "./lib/compteurs.js";
import {addMonths,fmtD,frDate,todayStr} from "./lib/dates.js";
import {CDC_ETATS,CONTRAT_SEUIL_MOIS,HAB_SEUIL_MOIS,contratInfo,habListe} from "./lib/echeances.js";
import {FERIES_DEFAUT,congeAt,libConge} from "./lib/jours.js";
import {kpiEqInfo,kpiUnitOf} from "./lib/kpi.js";
import {buildBTPrev,datesPlanDansPlage,estOTPreventif,isPeriodePlan,occurrencesPlan,prochaineEcheance,tRes} from "./lib/preventif.js";
import {codeDepuisAdresse} from "./lib/qr.js";
import {SYSTEMS_SEED,TREE_STRUCT_SEED} from "./lib/referentiels-defaut.js";
import {UNITS,UNIT_ABBR} from "./lib/unites.js";
import {reserverNumeros} from "./numbering.js";
import {Accueil} from "./pages/Accueil.jsx";
import {AdminPage} from "./pages/Administration.jsx";
import Assistant from "./pages/Assistant.jsx";
import {ValidationDG} from "./pages/ValidationDG.jsx";
import {api} from "./api.js";
import {peutCloturer,peutCreerOT,peutValider,nomProfil,enConsultation,roleRapports,definirProfilsPersonnalises,catalogue} from "../../server/src/profils-core.js";
import {RapportsPage} from "./pages/Rapports.jsx";
import {posteCouvre} from "./lib/equipes.js";
import {Arbo,CtrlForm,EquipForm,MesureForm,OrgForm,SousEquipForm,SubSystemForm,SystemForm} from "./pages/Arborescence.jsx";
import {Splash} from "./pages/Connexion.jsx";
import {DIDetail,DIForm} from "./pages/DemandesIntervention.jsx";
import {MaintenanceCorrective} from "./pages/MaintenanceCorrective.jsx";
import {IndicateursPage} from "./pages/Indicateurs.jsx";
import {BTCreateForm,BTDetail,BTPage,BandeauValidation} from "./pages/OrdresTravail.jsx";
import {Equipe,InterForm,PrestaForm} from "./pages/Personnel.jsx";
import {PlanForm,Planning} from "./pages/Preventif.jsx";
import {AchatForm,ArticleForm,BRForm,DSForm,DechargeForm,Magasin} from "./pages/Stock.jsx";
import {DS_CLOSES,DS_MODIFIABLES,construireLignes,etatSelonStock,lignesDS,lignesEnRupture,piecesRestantAdemander,retirerLigneDS as retirerLigneDS_} from "./lib/ds.js";
import {REG,useSynced} from "./sync.js";
import {Btn,Card,Modal,MotifForm,ZoneSuppression,avecStatut} from "./ui/base.jsx";
import {I} from "./ui/icones.jsx";

export function GmaoApp({session,onLogout}){
 const sa=session.superAdmin; const user=session.nom;
 const unitsOk=sa?UNITS:UNITS.filter(u=>session.droits[u]);
 const [unit,setUnit]=useState(unitsOk[0]||"");
 const grant=sa?{systems:[],volets:[]}:(session.droits[unit]||{systems:[],volets:[]});
 const sysOk=(code)=>sa||grant.systems.includes("*")||grant.systems.includes(code);   // « * » : tous les systèmes (administrateur UO)
 const kpiOk=(k)=>sa||!grant.kpi||grant.kpi.includes(k); // kpi absent = tout autorisé (comptes existants)
 // profils créés par le super administrateur (organigramme) : connus avant de calculer les capacités
 const [profilsPerso,setProfilsPerso]=useSynced("profils");
 definirProfilsPersonnalises(profilsPerso);
 // administrateur UO (ou profil équivalent) à qui le super administrateur a donné la main sur les comptes de son unité
 const delegue=!sa&&!!catalogue()[nomProfil(session.role)]?.delegationComptes&&!!session.gestionComptes;
 const voletRapports=sa||Object.values(session.droits||{}).some(g=>(g.volets||[]).includes(VOLET_RAPPORTS));
 const tabOk=(i)=>i===ACCUEIL?true:i===7?(sa||delegue):i===VALIDATION?(sa||peutValider(session)):i===RAPPORTS?voletRapports:(sa||grant.volets.includes(i));   // l'accueil est toujours accessible (il ne montre que les volets autorisés)
 // capacités du profil (le serveur les revérifie à chaque enregistrement)
 const profil=sa?"Super administrateur":nomProfil(session.role);
 const capCloture=peutCloturer(session), capCreerOT=peutCreerOT(session)&&tabOk(2);
 const lecture=enConsultation(session);   // Directeur UO / DG, responsable DG : consultation (le serveur refuse toute modification)
 const [tabRaw,setTabRaw]=useState(ACCUEIL);
 // visibilité d'un module dans le menu : la maintenance corrective regroupe les volets DI et OT ; les matériaux relèvent du volet Arborescence
 const voir=(i)=>i===ACCUEIL?true:i===1?(tabOk(1)||tabOk(2)):i===MATERIAUX?tabOk(0):tabOk(i);
 const tab=voir(tabRaw)?tabRaw:ACCUEIL;
 const setTab=(i)=>{if(voir(i))setTabRaw(i);};
 // ouvre un OT dans le module qui le contient (OT préventifs : Gestion des OT ; correctifs : maintenance corrective)
 const ouvrirOT=(code)=>{const b=bts.find(x=>x.code===code); setTab(b&&estOTPreventif(b)?2:1); setBtDetail(code);};
 const mobile=()=>typeof window!=="undefined"&&window.innerWidth<768;
 const [sidebar,setSidebar]=useState(()=>!mobile());   // téléphone : menu fermé au démarrage
 const allerA=(i)=>{setTab(i); if(mobile()) setSidebar(false);};
 const [panneau,setPanneau]=useState(null);   // menu déroulant ouvert dans la barre du haut : "alertes" | "profil"
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
 const [assistant,setAssistant]=useState(false);   // panneau « Assistant GMAO »
 const [rapports,setRapports]=useSynced("rapports");
 const [rapportOuvert,setRapportOuvert]=useState(null);
 // notifications du serveur (OT à clôturer, clôtures, reprises demandées par la DG) : relevées toutes les 30 s
 const [notifs,setNotifs]=useState({items:[],nonLues:0});
 useEffect(()=>{
  let vivant=true;
  const lire=async()=>{ if(!api.notifications||document.hidden) return; try{ const r=await api.notifications(); if(vivant) setNotifs(r); }catch{ /* hors ligne : prochain cycle */ } };
  lire(); const iv=setInterval(lire,30000);
  return ()=>{vivant=false;clearInterval(iv);};
 },[]);
 const lireNotif=async(n)=>{
  setPanneau(null);
  try{ await api.marquerLues({ids:[n.id]}); }catch{ /* sans gravité */ }
  setNotifs(s=>({items:s.items.map(x=>x.id===n.id?{...x,lu:true}:x),nonLues:Math.max(0,s.nonLues-(n.lu?0:1))}));
  if(n.unit&&unitsOk.includes(n.unit)) setUnit(n.unit);
  if(n.collection==="bts") ouvrirOT(n.recordId);
  else if(n.collection==="equipements"){const e=equipements.find(x=>x.code===n.recordId); if(e) setEquipDetail(e);}
  else if(n.collection==="planning") setTab(3);
  else if(n.collection==="arborescence") setTab(0);
  else if(n.collection==="rapports"){ setTab(RAPPORTS); setRapportOuvert(n.recordId); }
 };
 const toutLu=async()=>{ try{ await api.marquerLues({tout:true}); }catch{ /* sans gravité */ } setNotifs(s=>({items:s.items.map(x=>({...x,lu:true})),nonLues:0})); };
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

 // Une DS est « ouverte » tant que sa sortie magasin n'est pas traitée (ni annulée) : l'OT lié reste « En attente pièce »
 const dsOuvertesDe=(btCode,sauf)=>dss.filter(d=>d.bt===btCode&&d.code!==sauf&&!DS_CLOSES.includes(d.etat));
 const debloquerOT=(btCode,sauf)=>{ if(btCode && dsOuvertesDe(btCode,sauf).length===0) setBts(b=>b.map(x=>x.code===btCode&&x.etat==="En attente pièce"?{...x,etat:"En cours"}:x)); };
 function annulerDS(dsCode,motif){
  const dsx=dss.find(x=>x.code===dsCode);
  setDss(d=>d.map(x=>x.code===dsCode?{...x,etat:"Annulé",motif:motif||"Non précisé"}:x));
  if(dsx) debloquerOT(dsx.bt,dsCode);
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
 const [compteursEq,setCompteursEq,sCpt]=useSynced("compteurs_eq");   // compteurs d'équipement (km, heures…)

 const [interModal,setInterModal]=useState(null);
 const [inter,setInter,sInt]=useSynced("intervenants");
 const interAll=[...inter,...prestataires]; // internes + prestataires externes (ces derniers ne sont proposés que sur leurs équipements)

 // DS créée par le Technicien/Chargé depuis un OT (ou seule) ; état initial "Transmis au Magasinier"
 // sauf rupture de stock -> "En attente pièce" (et l'OT lié passe alors aussi "En attente pièce")
 async function addDS(f){
  let lignes;
  try{ lignes=construireLignes(f.lignes||[{piece:f.piece,qte:f.qte}],pieces); }catch(e){ setSyncErr(e.message); return; }
  const nums=await numeros("dss"); if(!nums) return;
  const dsCode=nums[0];
  const ds={code:dsCode,eq:f.eq,nom:f.nom,designation:f.designation,lignes,bt:f.bt||null,etat:etatSelonStock(lignes,pieces)};
  setDss(d=>[ds,...d]);
  // toute DS rattachée à un OT le met « En attente pièce » jusqu'au traitement du BS par le magasin
  if(f.bt) setBts(bs=>bs.map(b=>b.code===f.bt&&b.etat!=="Clôturé"?{...b,etat:"En attente pièce"}:b));
  setDsModal(null);
 }

 // Retrait d'une pièce d'une DS pas encore servie ; la dernière pièce retirée annule la DS
 function retirerLigneDS(dsCode,index){
  const ds=dss.find(d=>d.code===dsCode); if(!ds) return;
  const l=lignesDS(ds)[index]; if(!l) return;
  if(!window.confirm("Retirer « "+(l.pieceNom||l.piece)+" × "+l.qte+" » de la DS "+dsCode+" ?")) return;
  let maj;
  try{ maj=retirerLigneDS_(ds,index,pieces); }catch(e){ setSyncErr(e.message); return; }
  if(maj===null){ annulerDS(dsCode,"Toutes les pièces ont été retirées"); return; }
  setDss(d=>d.map(x=>x.code===dsCode?maj:x));
 }

 // Le magasinier génère le BS à partir d'une DS "Transmis au Magasinier"
 async function genererBS(dsCode){
  const ds=dss.find(d=>d.code===dsCode);
  if(!ds || !DS_MODIFIABLES.includes(ds.etat)) return;
  const lignes=lignesDS(ds);
  const manque=lignesEnRupture(lignes,pieces);
  if(manque.length){
   if(ds.etat!=="En attente pièce") setDss(d=>d.map(x=>x.code===dsCode?{...x,etat:"En attente pièce"}:x));
   alert("Stock insuffisant pour générer le BS : "+manque.map(l=>l.pieceNom||l.piece).join(", ")+"."); return;
  }
  const nums=await numeros("bs"); if(!nums) return;
  const bsCode=nums[0];
  setBsList(b=>[{code:bsCode,ds:dsCode,lignes,etat:"À traiter"},...b]);
  setDss(d=>d.map(x=>x.code===dsCode?{...x,etat:"BS généré",bs:bsCode}:x));
 }

 // Traitement du BS par le Magasinier : décrémente le stock de chaque pièce, clôt le BS et la DS liée, débloque l'OT associé
 function traiterBS(bsCode){
  const bs=bsList.find(x=>x.code===bsCode); if(!bs) return;
  const lignes=lignesDS(bs);
  const jour=new Date().toISOString().slice(0,10);
  setPieces(ps=>ps.map(p=>{
   const ls=lignes.filter(l=>l.piece===p.code); if(!ls.length) return p;
   const qte=ls.reduce((s,l)=>s+l.qte,0);
   return {...p,stock:Math.max(p.stock-qte,0),mouvements:[...(p.mouvements||[]),{date:jour,qte,type:"Sortie",ref:bs.code}]};
  }));
  setBsList(b=>b.map(x=>x.code===bsCode?{...x,etat:"Traité"}:x));
  const ds=dss.find(d=>d.code===bs.ds);
  if(ds){
   setDss(d=>d.map(x=>x.code===ds.code?{...x,etat:"Traité"}:x));
   debloquerOT(ds.bt,ds.code);   // l'OT ne repasse « En cours » que si toutes ses DS sont traitées
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

 // L'OT est saisi par un autre intervenant (compte-rendu, temps, matières) puis clôturé.
 async function savePlan(f){
  if(f.mode==="edit") setPlanning(l=>l.map(x=>x.code===f.data.code?{...x,...f.data}:x));
  else {
   const nums=await numeros("planning",{unit}); if(!nums) return;
   const code=nums[0];
   setPlanning(l=>[...l,{...f.data,code,unit,dernier:""}]);
  }
  setPlanModal(null);
 }

 function saveCompteur(c){ setCompteursEq(l=>l.some(x=>x.code===c.code)?l.map(x=>x.code===c.code?c:x):[...l,c]); }

 // Déclenchement manuel d'un plan : génère un OT préventif « En cours » avec la liste des tâches du plan
async function declencherPlan(pl){
  if(bts.some(b=>b.plan===pl.code && b.etat!=="Clôturé")) return;
  const nums=await numeros("bts",{unit:pl.unit||unit,variant:"prev"}); if(!nums) return;
  const code=nums[0];
  const dateGeneration=new Date().toISOString().slice(0,16).replace("T"," ");
  setBts(bs=>[buildBTPrev(pl,code,dateGeneration),...bs]);
  setPlanning(l=>l.map(x=>x.code===pl.code?{...x,dernier:todayStr()}:x));
 }

 // Déclenche en une fois toutes les visites prévues (sur la plage choisie) qui n'ont pas déjà un OT ouvert
 async function declencherLot(codesPlan){
  const dateGeneration=new Date().toISOString().slice(0,16).replace("T"," ");
  const eligibles=codesPlan.filter(c=>!bts.some(b=>b.plan===c && b.etat!=="Clôturé"));
  if(eligibles.length){
   // un numéro d'OT préventif par plan, réservé auprès du serveur (par unité)
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
 // Alertes : intervenants assignés (plans / OT ouverts) alors qu'ils sont en congé → à remplacer
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
 // Tâche « Non OK » sur un OT préventif : une DI corrective n'est créée que si l'intervenant le décide (Non OK ≠ forcément une panne : ex. manque de pièce de rechange)
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
    nouvelles.push({code,eq:bt.eq,nom:bt.nom,designation:"Défaut constaté lors de l'OT préventif "+bt.code+" — Tâche : "+t.lib+" — "+(t.com||""),emplacement:eqObj.emplacement||"",dateEvt:now,dateCreation:now,perturb:false,demandeur:bt.assigne||"Maintenance",typeMaintenance:"Corrective",sousType:"Curative",etat:"À Transmettre",btOrigine:bt.code});
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
 // Technicien : « Terminer la saisie » -> OT « À clôturer » ; le serveur prévient le chargé et le responsable du système
 function terminerSaisie(code,data){
  setBts(bs=>bs.map(b=>b.code===code?{...b,...(data||{}),etat:"À clôturer",saisieTerminee:{par:user,le:new Date().toISOString().slice(0,16).replace("T"," ")}}:b));
  setBtDetail(null);
 }
 async function cloturerBT(code,data){
  const bloquantes=dsOuvertesDe(code);
  if(bloquantes.length){ setBts(b=>b.map(x=>x.code===code&&x.etat!=="Clôturé"?{...x,etat:"En attente pièce"}:x)); setSyncErr("Clôture impossible : DS non traitée(s) par le magasin ("+bloquantes.map(d=>d.code).join(", ")+"). L'OT reste en attente de pièce."); return; }
  const btx=bts.find(b=>b.code===code); if(data&&data.taches&&btx){ const t=await genererDIsDefauts(btx,data.taches); if(!t) return; data={...data,taches:t}; }
  setBts(bs=>bs.map(b=>b.code===code?{...b,...(data||{}),etat:"Clôturé",dateCloture:new Date().toISOString().slice(0,16).replace("T"," ")}:b));
  const bt=bts.find(b=>b.code===code);
  if(bt && bt.di) setDis(ds=>ds.map(d=>d.code===bt.di?{...d,etat:"Traité"}:d));
  // plan au compteur : le relevé saisi à la clôture est enregistré et remet le cycle du plan à zéro
  let cumulCpt=null;
  const plx=bt&&bt.plan?planning.find(x=>x.code===bt.plan):null;
  if(plx && isCompteurPlan(plx)){
   const c=compteursEq.find(x=>x.code===plx.compteur);
   if(c && data && data.releveCompteur!==undefined && String(data.releveCompteur).trim()!==""){ const c2=ajouterReleve(c,{date:todayStr(),valeur:data.releveCompteur,par:user}); saveCompteur(c2); cumulCpt=dernier(c2).cumul; }
   else if(c && dernier(c)) cumulCpt=dernier(c).cumul;
  }
  if(bt && bt.plan) setPlanning(l=>l.map(x=>{
   if(x.code!==bt.plan) return x;
   if(isCompteurPlan(x)) return {...x,valeurDernier:cumulCpt??x.valeurDernier,dernier:todayStr()};
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

 // L'OT est une entité indépendante générée par le service Maintenance :
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

 /* ===== Suppressions : refusées (avec la raison) tant que l'élément est utilisé ailleurs ; suppression logique côté serveur ===== */
 const nb=(n,mot)=>n+" "+mot+(n>1?"s":"");
 const raisons=(l)=>{const t=l.filter(Boolean);return t.length?t.join(", ")+".":null;};
 const OUVERT=(b)=>b.etat!=="Clôturé"&&b.etat!=="Annulé";
 const blocage={
  equipement:(code)=>{const d=dis.filter(x=>x.eq===code).length,o=bts.filter(x=>x.eq===code).length,p=planning.filter(x=>x.eq===code).length,c=compteursEq.filter(x=>x.eq===code).length;
   return raisons([d&&"utilisé par "+nb(d,"DI"),o&&nb(o,"OT"),p&&nb(p,"plan")+" préventif(s)",c&&nb(c,"compteur"),(d||o)&&"l'historique de maintenance doit être conservé (supprimez d'abord les plans et compteurs, les DI / OT restent)"]);},
  // un système (et ses sous-systèmes) se supprime tant qu'aucun équipement n'y est rattaché, dans aucune unité
  systeme:(code)=>{const e=equipements.filter(x=>x.system===code).length;return raisons([e&&nb(e,"équipement")+" rattaché(s) (toutes unités) : déplacez-les, supprimez-les ou videz ce système (Administration › Repartir de zéro, un seul système)"]);},
  sousSysteme:(sys,code)=>{const e=equipements.filter(x=>x.system===sys&&x.subCode===code).length;return raisons([e&&nb(e,"équipement")+" rattaché(s) (toutes unités)"]);},
   sousEquip:(eq,se)=>{const d=dis.filter(x=>x.eq===eq&&x.se===se).length,o=bts.filter(x=>x.eq===eq&&x.se===se).length;return raisons([d&&"utilisé par "+nb(d,"DI"),o&&nb(o,"OT"),(d||o)&&"l'historique de maintenance doit être conservé"]);},
 di:(d)=>bts.some(b=>b.di===d.code)?"un OT a été généré depuis cette DI : supprimez d'abord l'OT (s'il n'est pas clôturé).":d.etat!=="À Transmettre"?"seule une DI « À transmettre » peut être supprimée.":null,
  ot:(b)=>b.etat==="Clôturé"?"un OT clôturé fait partie de l'historique (indicateurs MTBF / MTTR, coûts).":dss.some(x=>x.bt===b.code&&x.etat!=="Annulé")?"des demandes de sortie (DS) sont rattachées à cet OT : annulez-les d'abord.":null,
  plan:(p)=>{const o=bts.filter(b=>b.plan===p.code&&OUVERT(b)).length;return o?"un OT ouvert est issu de ce plan ("+bts.filter(b=>b.plan===p.code&&OUVERT(b)).map(b=>b.code).join(", ")+") : clôturez-le ou supprimez-le d'abord.":null;},
  article:(a)=>{const ds=dss.filter(x=>lignesDS(x).some(l=>l.piece===a.code)&&!DS_CLOSES.includes(x.etat)).length;
   const pl=planning.filter(p=>[...(p.outillage||[]),...(p.consommables||[]),...(p.piecesPrevues||[])].some(x=>x.code===a.code)).length;
   const ot=bts.filter(b=>OUVERT(b)&&[...(b.pieces||[]),...(b.outillage||[]),...(b.consommables||[])].some(x=>x.code===a.code)).length;
   return raisons([ds&&nb(ds,"DS")+" en cours",pl&&"utilisé dans "+nb(pl,"plan")+" préventif(s)",ot&&"utilisé dans "+nb(ot,"OT")+" ouvert(s)"]);},
  personne:(nom)=>{const pl=planning.filter(p=>(p.assignes||[]).includes(nom)).length;
   const ot=bts.filter(b=>OUVERT(b)&&((b.assignes||[]).includes(nom)||(b.intervenants||[]).some(i=>i.nom===nom))).length;
   return raisons([pl&&"assigné(e) à "+nb(pl,"plan")+" préventif(s)",ot&&"à "+nb(ot,"OT")+" ouvert(s)",(pl||ot)&&"réaffectez-les d'abord"]);},
  organisme:(nom)=>{const m=mesureList.filter(x=>x.organisme===nom).length,c=ctrlList.filter(x=>x.organisme===nom).length;return raisons([m&&"organisme de "+nb(m,"appareil")+" de mesure",c&&"de "+nb(c,"contrôle")+" réglementaire(s)"]);},
  compteur:(c)=>{const p=planning.filter(x=>x.compteur===c.code).length;return p?"utilisé par "+nb(p,"plan")+" préventif(s) au compteur.":null;},
 };
 const supprimer={
  equipement:(code)=>{setEquipements(l=>l.filter(x=>x.code!==code));setEquipModal(null);setEquipDetail(null);},
  systeme:(code)=>{setSystemsList(l=>l.filter(([c])=>c!==code));setTreeStruct(t=>{const n={...t};delete n[code];return n;});setSystemModal(null);},
  sousSysteme:(sys,code)=>{setTreeStruct(t=>({...t,[sys]:(t[sys]||[]).filter(x=>x.code!==code)}));setSubSystemModal(null);},
  di:(code)=>{setDis(l=>l.filter(x=>x.code!==code));setDiDetail(null);},
  ot:(b)=>{setBts(l=>l.filter(x=>x.code!==b.code)); if(b.di) setDis(l=>l.map(d=>d.code===b.di?{...d,etat:"À Transmettre"}:d)); setBtDetail(null);},
  plan:(code)=>{setPlanning(l=>l.filter(x=>x.code!==code));setPlanModal(null);},
  article:(code)=>{setPieces(l=>l.filter(x=>x.code!==code));setPieceForm(null);setPieceModal(null);},
  intervenant:(mat)=>{setInter(l=>l.filter(x=>x.mat!==mat));setInterModal(null);},
  prestataire:(mat)=>{setPrestataires(l=>l.filter(x=>x.mat!==mat));setPrestaModal(null);},
  mesure:(code)=>{setMesureList(l=>l.filter(x=>x.code!==code));setMesureModal(null);},
  controle:(code)=>{setCtrlList(l=>l.filter(x=>x.code!==code));setCtrlModal(null);},
  organisme:(code)=>{setOrganismes(l=>l.filter(x=>x.code!==code));setOrgModal(null);},
  compteur:(code)=>setCompteursEq(l=>l.filter(x=>x.code!==code)),
 };

 const tabs=[
  {n:"Arborescence Technique",c:"Arborescence",ic:I.tree},
  {n:"Gestion de la maintenance corrective",c:"Maintenance corrective",ic:I.flag},
  {n:"Gestion des ordres de travail (OT)",c:"Ordres de travail",ic:I.wrench},
  {n:"Planning Préventif",c:"Préventif",ic:I.cal},
  {n:"Gestion de stock",c:"Gestion de stock",ic:I.store},
  {n:"Gestion du personnel",c:"Gestion du personnel",ic:I.team},
  {n:"Indicateurs de performance",c:"Indicateurs",ic:I.chart},
  {n:"Administration",c:"Administration",ic:I.gear},
  {n:"Accueil",c:"Accueil",ic:I.home},   // ACCUEIL = 8 : hors volets de droits (0 à 7)
  {n:"Gestion et suivi des matériaux",c:"Matériaux",ic:I.gauge},   // MATERIAUX = 9 : volet Arborescence
  {n:"Validation DG",c:"Validation DG",ic:I.check||I.flag},           // VALIDATION = 10 : expert DG, super administrateur
  {n:"Rapports d'activité maintenance",c:"Rapports d'activité",ic:I.file||I.chart},   // RAPPORTS = 11 : volet 7
 ];

 const inScope=(code)=>kpiUnitOf(code,equipements)===unit&&sysOk(kpiEqInfo(code,equipements).system);
 const visEquip=sa?equipements:equipements.filter(e=>e.unit===unit&&sysOk(e.system));
 const visSystems=sa?systemsList:systemsList.filter(([c])=>sysOk(c));
 const cptDe=(p)=>compteursEq.find(c=>c.code===p.compteur);
 // plan au compteur : sa « date » est l'échéance estimée d'après l'usage moyen (calculée, jamais saisie)
 const visPlanning=(sa?planning:planning.filter(p=>p.unit===unit&&sysOk(p.sys))).map(p=>isCompteurPlan(p)?{...p,date:etatPlanCompteur(p,cptDe(p)).dateEstimee}:p);
 const visCompteurs=sa?compteursEq:compteursEq.filter(c=>c.unit===unit&&sysOk(c.sys));
 const visDis=sa?dis:dis.filter(d=>inScope(d.eq));
 const visBts=sa?bts:bts.filter(b=>inScope(b.eq));
 const sysAll=sa||grant.systems.includes("*")||systemsList.every(([c])=>grant.systems.includes(c));
 const interOk=(p)=>sysAll||(p.externe?(p.systemes||[]).some(sysOk):grant.systems.some(c=>posteCouvre(p.poste,c)));
 const visInter=inter.filter(interOk), visPresta=prestataires.filter(interOk);
 const critStock = pieces.filter(p=>p.stock<p.min);
 const ctAl=visPresta.map(contratInfo).filter(c=>c.alerte); const ctRouge=ctAl.filter(c=>c.niveau==="rouge").length, ctOrange=ctAl.length-ctRouge;
 const habAl=habListe(visInter); const habRouge=habAl.filter(x=>x.niveau==="rouge").length, habOrange=habAl.filter(x=>x.niveau==="orange").length;
 const syncStates=[sEq,sSys,sTree,sMes,sCtrl,sOrg,sPre,sDch,sDss,sBs,sBrs,sFer,sDis,sBts,sPie,sPla,sInt,sCpt];
 if(syncStates.includes("error")) return <Splash msg="Impossible de joindre le serveur GMAO." action={()=>window.location.reload()} actionLabel="Réessayer"/>;
 if(!syncStates.every(s=>s==="ready")) return <Splash msg="Chargement des données…"/>;

 const ordreMenu=[ACCUEIL,0,MATERIAUX,1,2,3,4,5,6,RAPPORTS,VALIDATION,7];
 const nbAlertes=(tabOk(5)?ctAl.length+habRouge+habOrange:0)+(tabOk(4)&&critStock.length>0?1:0)+notifs.nonLues;
 const alerteRouge=(tabOk(5)&&(ctRouge+habRouge)>0)||(tabOk(4)&&critStock.length>0);
 const initiales=(user||"?").replace(/^Démo — /,"").split(/[\s-]+/).filter(Boolean).slice(0,2).map(w=>w[0].toUpperCase()).join("");
 const alertesItems=[
  tabOk(5)&&ctAl.length>0&&{k:"ct",rouge:ctRouge>0,titre:"Contrats prestataires",txt:(ctRouge>0?ctRouge+" expiré(s)":"")+(ctRouge>0&&ctOrange>0?" · ":"")+(ctOrange>0?ctOrange+" à renouveler sous "+CONTRAT_SEUIL_MOIS+" mois — préparer le cahier des charges":""),go:5},
  tabOk(5)&&(habRouge+habOrange)>0&&{k:"hab",rouge:habRouge>0,titre:"Habilitations",txt:(habRouge>0?habRouge+" expirée(s)":"")+(habRouge>0&&habOrange>0?" · ":"")+(habOrange>0?habOrange+" à renouveler sous "+HAB_SEUIL_MOIS+" mois":""),go:5},
  tabOk(4)&&critStock.length>0&&{k:"stk",rouge:true,titre:"Stock critique",txt:critStock.length+" pièce(s) sous le seuil min",go:4},
 ].filter(Boolean);
 return (
 <div className="gm-app min-h-screen flex flex-col" style={{paddingTop:"env(safe-area-inset-top,0px)",paddingBottom:"env(safe-area-inset-bottom,0px)"}}>
  <header className="gm-top">
   <button onClick={()=>setSidebar(s=>!s)} className="gm-icon-btn" aria-label="Menu" data-testid="menu-bouton">{I.menu}</button>
   <button className="gm-brand" onClick={()=>allerA(ACCUEIL)} title="Accueil"><img src={XL_LOGO} alt="SETRAM"/><span className="gm-brand-app hidden sm:flex">GMAO<small>Gestion de la maintenance</small></span></button>
   <div className="flex-1"/>
   <label className="gm-unit hidden md:flex" title="Unité opérationnelle">{I.pin}
    <select value={unit} onChange={e=>setUnit(e.target.value)} aria-label="Unité opérationnelle">{unitsOk.map(u=><option key={u}>{u}</option>)}</select>
   </label>
   <button className={"gm-icon-btn"+(assistant?" is-on":"")} onClick={()=>setAssistant(a=>!a)} aria-label="Assistant GMAO" title="Assistant GMAO : posez une question" data-testid="assistant-bouton">{I.chat}</button>
   <div className="relative">
    <button className="gm-icon-btn relative" onClick={()=>{setPanneau(p=>p==="alertes"?null:"alertes");}} aria-label="Alertes" title="Alertes">{I.bell}
     {nbAlertes>0&&<span className={"gm-dot "+(alerteRouge?"is-red":"is-amber")}>{nbAlertes}</span>}</button>
    {panneau==="alertes"&&<><div className="fixed inset-0 z-40" onClick={()=>setPanneau(null)}/>
     <div className="gm-pop right-0 w-80">
      {notifs.items.length>0&&<>
       <div className="gm-pop-head flex justify-between items-center">Notifications{notifs.nonLues>0&&<button type="button" className="text-[11px] normal-case tracking-normal font-medium text-sky-600" onClick={toutLu}>Tout marquer comme lu</button>}</div>
       <div className="max-h-72 overflow-y-auto" data-testid="notifications">{notifs.items.slice(0,15).map(n=><button key={n.id} className="gm-pop-item" onClick={()=>lireNotif(n)}>
        <span className={"gm-pop-ic "+(n.lu?"":"is-amber")}>{I.bell}</span><span><b className={n.lu?"font-normal":""}>{n.texte}</b><small>{String(n.at).slice(0,16).replace("T"," ")}{n.unit?" · "+n.unit:""}</small></span></button>)}</div>
      </>}
      <div className="gm-pop-head">Alertes à traiter</div>
      {alertesItems.length===0&&<div className="gm-pop-empty">Aucune alerte en cours.</div>}
      {alertesItems.map(a=><button key={a.k} className="gm-pop-item" onClick={()=>{setPanneau(null);setTab(a.go);}}>
       <span className={"gm-pop-ic "+(a.rouge?"is-red":"is-amber")}>{I.alert}</span><span><b>{a.titre}</b><small>{a.txt}</small></span></button>)}
     </div></>}
   </div>
   <div className="relative">
    <button className="gm-user" onClick={()=>setPanneau(p=>p==="profil"?null:"profil")} aria-label="Profil utilisateur">
     <span className="gm-avatar">{initiales}</span>
     <span className="gm-user-txt hidden lg:block"><b>{user}</b><small>{profil}</small></span>
     <span className="hidden lg:block gm-chev">{I.chev}</span>
    </button>
    {panneau==="profil"&&<><div className="fixed inset-0 z-40" onClick={()=>setPanneau(null)}/>
     <div className="gm-pop right-0 w-64">
      <div className="gm-pop-user"><span className="gm-avatar">{initiales}</span><span><b>{user}</b><small>{profil}{delegue?" · gestion des comptes":""}</small></span></div>
      <button className="gm-pop-item" onClick={()=>{setPanneau(null);onLogout();}}><span className="gm-pop-ic">{I.logout}</span><span><b>Se déconnecter</b></span></button>
     </div></>}
   </div>
  </header>
  {assistant && <Assistant unite={unit} onFermer={()=>setAssistant(false)}
   contexte={()=>({dis:dis.filter(d=>inScope(d.eq)),bts:bts.filter(b=>inScope(b.eq)),equipements:equipements.filter(e=>e.unit===unit&&sysOk(e.system)),
    planning:visPlanning.filter(p=>p.unit===unit),pieces:tabOk(4)||tabOk(6)?pieces:[],intervenants:[...visInter,...visPresta],
    peutPersonnel:sa||tabOk(5)||tabOk(6),aujourdhui:todayStr()})}
   onOuvrir={(ref)=>{
    if(ref.type==="ot") ouvrirOT(ref.code);
    else if(ref.type==="di"){setTab(1);setDiDetail(ref.code);}
    else if(ref.type==="eq"){const e=equipements.find(x=>x.code===ref.code); if(e) setEquipDetail(e);}
    else if(ref.type==="piece"){const p=pieces.find(x=>x.code===ref.code); if(p) setPieceModal(p);}
   }}/>}

  <div className="flex flex-1 min-h-0">
  {sidebar && <div className="fixed inset-0 bg-black/50 z-30 md:hidden" onClick={()=>setSidebar(false)} data-testid="menu-fond"/>}
  {sidebar && <aside className="gm-rail fixed inset-y-0 left-0 z-40 overflow-y-auto md:sticky md:top-[60px] md:h-[calc(100vh-60px)] md:z-auto shrink-0 flex flex-col" data-testid="menu-lateral">
   <div className="gm-rail-unit md:hidden">
    <div className="gm-rail-label">Unité</div>
    <select value={unit} onChange={e=>{setUnit(e.target.value); setSidebar(false);}} aria-label="Unité opérationnelle (menu)">{unitsOk.map(u=><option key={u}>{u}</option>)}</select>
   </div>
   <nav className="gm-rail-nav flex flex-col">
    {ordreMenu.map(i=>!voir(i)?null:(
     <button key={i} onClick={()=>allerA(i)} title={tabs[i].n} className={"gm-rail-item"+(tab===i?" is-active":"")} aria-current={tab===i?"page":undefined}>
      <span className="gm-rail-ic">{tabs[i].ic}
       {i===5&&(habRouge+habOrange+ctAl.length>0)&&<span className={"gm-count "+((habRouge+ctRouge)>0?"is-red":"is-amber")} title="Habilitations et contrats prestataires à traiter">{habRouge+habOrange+ctAl.length}</span>}
       {i===4&&critStock.length>0&&<span className="gm-count is-red" title="Articles sous le seuil minimum">{critStock.length}</span>}
      </span>{tabs[i].c}
     </button>))}
   </nav>
   <div className="gm-rail-foot mt-auto">v1.19.0</div>
  </aside>}

  <div className="flex-1 min-w-0 flex flex-col">
  <div className="gm-strip">
   {tab!==ACCUEIL&&<button className="gm-strip-tab" onClick={()=>allerA(ACCUEIL)}>{I.home}<span className="hidden sm:inline">Accueil</span></button>}
   <div className="gm-strip-tab is-active">{tabs[tab].ic}<h1 className="gm-title truncate">{tabs[tab].n}</h1></div>
   <div className="gm-strip-unit">Unité <b>{unit}</b></div>
  </div>
  <main className="gm-main flex-1 min-w-0 p-3 md:p-5">
   {tabOk(5)&&alertesVisibles.length>0 && <div className="mb-4 rounded-xl border border-rose-700 bg-rose-900/30 p-3">
    <div className="flex justify-between items-start gap-2">
     <div className="text-sm font-semibold text-rose-300">⚠ Intervenant en congé — changez l'intervenant ({alertesVisibles.length})</div>
     <button className="text-xs text-slate-400 hover:text-slate-200" onClick={()=>setAlertesMasquees(m=>m+alertesVisibles.map(a=>a.key).join("~"))}>Masquer</button>
    </div>
    <div className="mt-2 space-y-1.5">{alertesVisibles.slice(0,6).map(a=><div key={a.key} className="flex flex-wrap items-center justify-between gap-2 text-xs bg-slate-900 rounded-lg px-2 py-1.5">
     <span className="text-slate-300"><b className="text-rose-300">{a.nom}</b> est en congé {libConge(a.c)}, mais est assigné à <span className="text-sky-400">{a.label}</span> ({a.kind==="plan"?"prévu le "+a.dates.slice(0,3).map(frDate).join(", ")+(a.dates.length>3?"…":""):"OT en cours"}).</span>
     <Btn cls="bg-rose-700 hover:bg-rose-600 text-white text-xs" onClick={()=>{ if(a.kind==="plan"){const pl=planning.find(x=>x.code===a.code); setTab(3); setPlanModal({mode:"edit",item:pl});} else {ouvrirOT(a.code);} }}>Changer l'intervenant</Btn>
    </div>)}
    {alertesVisibles.length>6 && <div className="text-xs text-slate-400">… et {alertesVisibles.length-6} autre(s) alerte(s).</div>}</div>
   </div>}

   {tab===ACCUEIL && <Accueil tabOk={tabOk} unit={unit} dis={visDis} bts={visBts} planning={visPlanning} compteurs={visCompteurs} pieces={pieces} alertes={alertesItems} sa={sa}
     onGo={allerA} onNewDI={lecture?undefined:()=>setDiModal({})} onNewOT={capCreerOT?()=>setBtModal({di:null}):undefined} onOpenDI={(c)=>setDiDetail(c)} onOpenOT={ouvrirOT}/>}
   {tab===1 && <MaintenanceCorrective voirDI={tabOk(1)} voirOT={tabOk(2)} dis={visDis} bts={visBts.filter(b=>!estOTPreventif(b))} pieces={pieces} onNewDI={lecture?undefined:()=>setDiModal({})} onOpenDI={(d)=>setDiDetail(d.code)} onGenererBT={capCreerOT?(di)=>setBtModal({di}):undefined} onOpenBT={(b)=>setBtDetail(b.code)}/>}
   {tab===2 && <BTPage bts={visBts.filter(estOTPreventif)} pieces={pieces} titre="Ordres de travail préventifs" sousTitre="Générés depuis les plans préventifs ou créés par la Maintenance — cliquez sur une ligne pour saisir le compte-rendu puis clôturer" onNouveauBT={capCreerOT?()=>setBtModal({di:null}):undefined} onOpenBT={(b)=>setBtDetail(b.code)}/>}
   {(tab===0||tab===MATERIAUX) && <Arbo key={tab} mode={tab===0?"arbo":"materiaux"} unit={unit} equipements={equipements} systemsList={visSystems} treeStruct={treeStruct}
     onAddEquip={(system,subCode,subNom)=>setEquipModal({mode:"add",system,subCode,subNom,unit})}
     onOpenEquip={setEquipDetail}
     onSupprimerEquip={(e)=>setEquipModal({mode:"edit",equip:e,supprimer:true})} onSupprimerSousEquip={(equip,se)=>setSousEquipDetail({equip,se,supprimer:true})}
     onCreateDI={(equip)=>setDiModal({prefill:{eq:equip.code,nom:equip.nom}})}
     onAddSousEquip={(equip)=>setSousEquipModal({mode:"add",equip})}
     onOpenSousEquip={(equip,se)=>setSousEquipDetail({equip,se})}
     onRemoveSousEquip={removeSousEquip}
     onAddSystem={sa?()=>setSystemModal({mode:"add",code:"",nom:""}):undefined}
     onEditSystem={sa?(code,nom)=>setSystemModal({mode:"edit",code,nom}):undefined}
     onAddSubSystem={(systemCode)=>setSubSystemModal({mode:"add",systemCode,code:"",nom:""})}
     onEditSubSystem={(systemCode,code,nom)=>setSubSystemModal({mode:"edit",systemCode,code,nom})}
     mesureList={mesureList} ctrlList={ctrlList} onAddCtrl={()=>setCtrlModal({mode:"add"})} onEditCtrl={(c)=>setCtrlModal({mode:"edit",item:c})} organismes={organismes} onAddOrg={()=>setOrgModal({mode:"add"})} onEditOrg={(o)=>setOrgModal({mode:"edit",item:o})}
         onAddMesure={()=>setMesureModal({mode:"add"})}
     onEditMesure={(item)=>setMesureModal({mode:"edit",item})}
     onSupprimerMesure={(item)=>setMesureModal({mode:"edit",item,supprimer:true})} onSupprimerCtrl={(item)=>setCtrlModal({mode:"edit",item,supprimer:true})} onSupprimerOrg={(item)=>setOrgModal({mode:"edit",item,supprimer:true})}/>}
   {!voir(tab) && <Card><div className="text-sm text-slate-400">Aucun volet n'est accessible pour votre compte sur cette unité. Contactez le super administrateur.</div></Card>}
   {tab===RAPPORTS && <RapportsPage rapports={rapports} role={roleRapports(session)} userId={session.id} userNom={user} sa={sa}
     unitesUO={sa?UNITS:unitsOk.filter(u=>(session.droits[u]?.volets||[]).includes(VOLET_RAPPORTS)&&roleRapports(session)==="uo")}
     ouvert={rapportOuvert} setOuvert={setRapportOuvert}
     onSave={(r)=>setRapports(l=>l.map(x=>x.code===r.code?r:x))}
     onCreer={async(f)=>{const nums=await numeros("rapports",{unit:f.unit}); if(!nums) return null; const code=nums[0];
      setRapports(l=>[{code,unit:f.unit,titre:f.titre,periode:f.periode,fichiers:[],etat:"Brouillon"},...l]); return code;}}/>}
   {tab===VALIDATION && <ValidationDG user={user} bts={bts} equipements={equipements} planning={planning} treeStruct={treeStruct}
     uniteDe={(c)=>kpiUnitOf(c,equipements)} systemeDe={(c)=>kpiEqInfo(c,equipements).system}
     onSaveOT={(o)=>setBts(l=>l.map(x=>x.code===o.code?o:x))} onSaveEquip={(o)=>setEquipements(l=>l.map(x=>x.code===o.code?o:x))}
     onSavePlan={(o)=>setPlanning(l=>l.map(x=>x.code===o.code?o:x))} onSaveSous={(sys,o)=>setTreeStruct(t=>({...t,[sys]:(t[sys]||[]).map(x=>x.code===o.code?o:x)}))}
     onOuvrirOT={ouvrirOT} onOuvrirEquip={setEquipDetail}/>}
   {tab===7 && (sa||delegue) && <AdminPage superAdmin={sa} unitesAdmin={unitsOk} profilsPerso={profilsPerso} setProfilsPerso={setProfilsPerso} systemsList={systemsList} me={session.id} importRefs={{units:UNITS,unitAbbr:UNIT_ABBR,roles:ROLES,cdcEtats:CDC_ETATS,orgDom:ORG_DOM,systemsList,treeStruct,equipements,pieces,intervenants:inter,prestataires,planning,organismes,mesures:mesureList,controles:ctrlList}}/>}
   {tab===3 && <Planning planning={visPlanning} compteurs={visCompteurs} equipements={equipements.filter(e=>e.unit===unit&&sysOk(e.system))} user={user} onSaveCompteur={saveCompteur} blocageCompteur={blocage.compteur} onSupprimerCompteur={supprimer.compteur} bts={visBts} systemsList={visSystems} unit={unit} onAdd={()=>setPlanModal({mode:"add"})} onEdit={(pl)=>setPlanModal({mode:"edit",item:pl})} onDeclencher={unSeul(declencherPlan)} onDeclencherLot={unSeul(declencherLot)} onOpenBT={(c)=>setBtDetail(c)}/>}
   {tab===4 && <Magasin pieces={pieces} decharges={decharges} onNewAchat={(code)=>setAchatModal({prefill:code})} onNewDecharge={(code)=>setDechargeModal({prefill:code})} dss={dss} bsList={bsList} brs={brs} onNewDS={()=>setDsModal({})} onNewBR={()=>setBrModal(true)} onTraiterBS={traiterBS} onRetirerLigneDS={retirerLigneDS} onStatutDS={sa?(c,e,m)=>setDss(l=>l.map(x=>x.code===c?avecStatut(x,e,user,m):x)):undefined} onStatutBS={sa?(c,e,m)=>setBsList(l=>l.map(x=>x.code===c?avecStatut(x,e,user,m):x)):undefined} onGenererBS={unSeul(genererBS)} onAnnulerDS={(code)=>setMotifModal({ds:code})} onOpenPiece={setPieceModal} onAddPiece={(categorie)=>setPieceForm({mode:"add",categorie})} onEditPiece={(piece)=>setPieceForm({mode:"edit",piece})}/>}
   {tab===5 && <Equipe inter={visInter} prestataires={visPresta} equipements={equipements} onAddPresta={()=>setPrestaModal({mode:"add"})} onEditPresta={(p)=>setPrestaModal({mode:"edit",item:p})} feries={feries} onChangeFeries={setFeries} onAdd={()=>setInterModal({mode:"add"})} onEdit={(p)=>setInterModal({mode:"edit",item:p})}/>}
   {tab===6 && <IndicateursPage kpiOk={kpiOk} unit={unit} dis={visDis} bts={visBts} planning={visPlanning} equipements={visEquip} pieces={pieces} systemsList={visSystems} treeStruct={treeStruct}/>}
  </main>
  </div>
  </div>

  {diModal && <Modal title="Nouvelle Demande d'Intervention (DI) — Service Exploitation" onClose={()=>setDiModal(null)}>
   <DIForm prefill={diModal.prefill} equipements={equipements.filter(e=>e.unit===unit&&sysOk(e.system))} demandeur={user} onSubmit={unSeul(addDI)}/>
  </Modal>}

  {btModal && <Modal title={btModal.di? "Générer un OT depuis "+btModal.di.code+" — Service Maintenance" : "Nouvel OT (Préventif) — Service Maintenance"} onClose={()=>setBtModal(null)}>
   <BTCreateForm di={btModal.di} inter={interAll} pieces={pieces} equipements={equipements.filter(e=>e.unit===unit&&sysOk(e.system))} onSubmit={unSeul(addBT)}/>
  </Modal>}

  {diDetail && (()=>{const d=dis.find(x=>x.code===diDetail); if(!d) return null; const btLie=bts.find(b=>b.di===d.code);
   return <Modal wide title={"Demande d'Intervention — "+d.code} onClose={()=>setDiDetail(null)}>
    <DIDetail di={d} bt={btLie} onStatut={sa?(e,m)=>setDis(l=>l.map(x=>x.code===d.code?avecStatut(x,e,user,m):x)):undefined} onGenererBT={capCreerOT?()=>{setDiDetail(null);setBtModal({di:d});}:undefined} onOpenBT={()=>{setDiDetail(null);ouvrirOT(btLie.code);}}/>
    <ZoneSuppression quoi={"la DI "+d.code} bloque={blocage.di(d)} onSupprimer={()=>supprimer.di(d.code)}/>
   </Modal>;})()}

  {notice && <div className="fixed bottom-4 right-4 z-[60] max-w-sm bg-emerald-700 text-emerald-50 text-sm rounded-xl px-4 py-3 shadow-lg">✓ {notice}</div>}
  {syncErr && <div className="fixed bottom-4 left-4 z-[70] max-w-md bg-rose-700 text-rose-50 text-sm rounded-xl px-4 py-3 shadow-lg" onClick={()=>setSyncErr(null)}>⚠ {syncErr}</div>}

  {btDetail && (()=>{const b=bts.find(x=>x.code===btDetail); if(!b) return null;
   const plb=b.plan?planning.find(p=>p.code===b.plan):null; const cptB=plb&&isCompteurPlan(plb)?cptDe(plb)||null:null;
   return <Modal wide title={"Ordre de Travail — "+b.code} onClose={()=>setBtDetail(null)}>
    <BTDetail key={b.code} bt={b} dsOuvertes={dsOuvertesDe(b.code)} compteur={cptB} pieces={pieces} inter={interAll} equipements={equipements} onSave={(data)=>unSeul(saveBT)(b.code,data)} onCloturer={(data)=>unSeul(cloturerBT)(b.code,data)} onTerminer={(data)=>unSeul(terminerSaisie)(b.code,data)} peutCloturer={capCloture}
     onStatut={sa?(e,m)=>setBts(l=>l.map(x=>x.code===b.code?avecStatut(x,e,user,m):x)):undefined}
     dsDeLOT={dss.filter(d=>d.bt===b.code)}
     onCreateDS={(items)=>{const reste=piecesRestantAdemander(items,dss.filter(d=>d.bt===b.code));setBtDetail(null);setDsModal({prefill:{eq:b.eq,nom:b.nom,lignes:(reste.length?reste:items).map(x=>({piece:x.code,qte:x.qte})),bt:b.code}});}}/>
    {capCreerOT && <ZoneSuppression quoi={"l'OT "+b.code+(b.di?" (la DI "+b.di+" repassera « À transmettre »)":"")} bloque={blocage.ot(b)} onSupprimer={()=>supprimer.ot(b)}/>}
   </Modal>;})()}

  {equipModal && <Modal title={equipModal.mode==="edit"?"Modifier l'équipement — "+equipModal.equip.code:"Créer un équipement — "+equipModal.system+"."+UNIT_ABBR[equipModal.unit]+"."+equipModal.subCode} onClose={()=>setEquipModal(null)}>
   <EquipForm modal={equipModal} count={equipModal.mode==="add"?equipements.filter(e=>e.system===equipModal.system&&e.subCode===equipModal.subCode&&e.unit===equipModal.unit).length:0} onSubmit={saveEquipement}/>
   {equipModal.mode==="edit" && <ZoneSuppression ouverte={!!equipModal.supprimer} quoi={"l'équipement "+equipModal.equip.code+((equipModal.equip.sousEquip||[]).length?" et ses "+equipModal.equip.sousEquip.length+" sous-équipement(s)":"")} bloque={blocage.equipement(equipModal.equip.code)} onSupprimer={()=>supprimer.equipement(equipModal.equip.code)}/>}
  </Modal>}

  {equipDetail && (()=>{const ed=equipements.find(x=>x.code===equipDetail.code)||equipDetail; const sousL=ed.sousEquip||[];
   return <Modal title={"Fiche équipement — "+ed.code} onClose={()=>setEquipDetail(null)}>
   <div className="text-sm space-y-3">
    <BandeauValidation v={ed.validationDG}/>
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
     <Btn cls="bg-rose-700 hover:bg-rose-600" onClick={()=>{setEquipModal({mode:"edit",equip:ed,supprimer:true});setEquipDetail(null);}}>Supprimer</Btn>
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
     <Btn cls="bg-amber-600 hover:bg-amber-500" onClick={()=>{setSousEquipModal({mode:"edit",equip:parent,se});setSousEquipDetail(null);}}>Modifier</Btn>
     <Btn onClick={()=>{setDiModal({prefill:{eq:parent.code,nom:parent.nom+" — "+se.code+" "+se.nom,se:se.code}});setSousEquipDetail(null);}}>Créer une DI</Btn>
    </div>
    <ZoneSuppression ouverte={!!sousEquipDetail.supprimer} quoi={"le sous-équipement "+se.code} bloque={blocage.sousEquip(parent.code,se.code)} onSupprimer={()=>{removeSousEquip(parent.code,se.code);setSousEquipDetail(null);}}/>
   </div>
  </Modal>;})()}

  {systemModal && <Modal title={systemModal.mode==="edit"?"Modifier le système":"Ajouter un système"} onClose={()=>setSystemModal(null)}>
   <SystemForm modal={systemModal} onSubmit={saveSystem}/>
   {systemModal.mode==="edit" && <ZoneSuppression quoi={"le système "+systemModal.code+((treeStruct[systemModal.code]||[]).length?" et ses "+treeStruct[systemModal.code].length+" sous-système(s)":"")} bloque={blocage.systeme(systemModal.code)} onSupprimer={()=>supprimer.systeme(systemModal.code)}/>}
  </Modal>}

  {subSystemModal && <Modal title={subSystemModal.mode==="edit"?"Modifier le sous-système":"Ajouter un sous-système"} onClose={()=>setSubSystemModal(null)}>
   <SubSystemForm modal={subSystemModal} onSubmit={saveSubSystem}/>
   {subSystemModal.mode==="edit" && <ZoneSuppression quoi={"le sous-système "+subSystemModal.code} bloque={blocage.sousSysteme(subSystemModal.systemCode,subSystemModal.code)} onSupprimer={()=>supprimer.sousSysteme(subSystemModal.systemCode,subSystemModal.code)}/>}
  </Modal>}

  {orgModal && <Modal title={orgModal.mode==="edit"?"Modifier l'organisme — "+orgModal.item.nom:"Ajouter un organisme"} onClose={()=>setOrgModal(null)}>
   <OrgForm modal={orgModal} list={organismes} onSubmit={saveOrg}/>
   {orgModal.mode==="edit" && <ZoneSuppression ouverte={!!orgModal.supprimer} quoi={"l'organisme "+orgModal.item.nom} bloque={blocage.organisme(orgModal.item.nom)} onSupprimer={()=>supprimer.organisme(orgModal.item.code)}/>}
  </Modal>}

  {prestaModal && <Modal wide title={prestaModal.mode==="edit"?"Modifier le prestataire — "+prestaModal.item.nom:"Ajouter un prestataire externe"} onClose={()=>setPrestaModal(null)}>
   <PrestaForm mode={prestaModal.mode} item={prestaModal.item} existing={prestataires} systemsList={systemsList} onSubmit={savePresta}/>
   {prestaModal.mode==="edit" && <ZoneSuppression quoi={"le prestataire "+prestaModal.item.nom} bloque={blocage.personne(prestaModal.item.nom)} onSupprimer={()=>supprimer.prestataire(prestaModal.item.mat)}/>}
  </Modal>}

  {ctrlModal && <Modal title={ctrlModal.mode==="edit"?"Modifier le contrôle — "+ctrlModal.item.code:"Ajouter un équipement au contrôle réglementaire"} onClose={()=>setCtrlModal(null)}>
   <CtrlForm modal={ctrlModal} list={ctrlList} organismes={organismes} equipements={equipements.filter(e=>e.unit===unit&&sysOk(e.system))} onSubmit={saveCtrl}/>
   {ctrlModal.mode==="edit" && <ZoneSuppression ouverte={!!ctrlModal.supprimer} quoi={"le contrôle "+ctrlModal.item.code} bloque={null} onSupprimer={()=>supprimer.controle(ctrlModal.item.code)}/>}
  </Modal>}

  {mesureModal && <Modal title={mesureModal.mode==="edit"?"Modifier l'appareil — "+mesureModal.item.code:"Ajouter un appareil de mesure"} onClose={()=>setMesureModal(null)}>
   <MesureForm modal={mesureModal} count={mesureList.length} organismes={organismes} onSubmit={saveMesure}/>
   {mesureModal.mode==="edit" && <ZoneSuppression ouverte={!!mesureModal.supprimer} quoi={"l'appareil "+mesureModal.item.code} bloque={null} onSupprimer={()=>supprimer.mesure(mesureModal.item.code)}/>}
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
   <PlanForm mode={planModal.mode} item={planModal.item} compteurs={visCompteurs} systemsList={systemsList} equipements={equipements.filter(e=>e.unit===unit&&sysOk(e.system))} inter={interAll} pieces={pieces} onSubmit={unSeul(savePlan)}/>
   {planModal.mode==="edit" && <ZoneSuppression quoi={"le plan "+planModal.item.code} bloque={blocage.plan(planModal.item)} onSupprimer={()=>supprimer.plan(planModal.item.code)}/>}
  </Modal>}

  {interModal && <Modal wide title={interModal.mode==="edit"?"Modifier l'intervenant — "+interModal.item.nom:"Ajouter un intervenant"} onClose={()=>setInterModal(null)}>
   <InterForm mode={interModal.mode} item={interModal.item} existing={inter} systemsList={systemsList} onSubmit={saveInter}/>
   {interModal.mode==="edit" && <ZoneSuppression quoi={"l'intervenant "+interModal.item.nom} bloque={blocage.personne(interModal.item.nom)} onSupprimer={()=>supprimer.intervenant(interModal.item.mat)}/>}
  </Modal>}

  {achatModal && <Modal title="Nouvel achat / réapprovisionnement" onClose={()=>setAchatModal(null)}>
   <AchatForm pieces={pieces} prefill={achatModal.prefill} onSubmit={addAchat}/>
  </Modal>}

  {dechargeModal && <Modal title="Décharge — Outillage / Consommable" onClose={()=>setDechargeModal(null)}>
   <DechargeForm pieces={pieces.filter(p=>p.categorie!=="Pièce")} inter={inter} bts={bts.filter(b=>b.etat!=="Clôturé")} prefill={dechargeModal.prefill} onSubmit={unSeul(addDecharge)}/>
  </Modal>}

  {pieceForm && <Modal wide title={pieceForm.mode==="edit"?"Modifier — "+pieceForm.piece.code+" "+pieceForm.piece.nom:"Ajouter — "+pieceForm.categorie} onClose={()=>setPieceForm(null)}>
   <ArticleForm mode={pieceForm.mode} piece={pieceForm.piece} categorie={pieceForm.categorie} onSubmit={unSeul(savePiece)}/>
   {pieceForm.mode==="edit" && <ZoneSuppression quoi={"l'article "+pieceForm.piece.code+(pieceForm.piece.stock>0?" (stock actuel : "+pieceForm.piece.stock+")":"")} bloque={blocage.article(pieceForm.piece)} onSupprimer={()=>supprimer.article(pieceForm.piece.code)}/>}
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

/* ===== Accueil : tableau de bord (menus favoris, infos DI / OT, alertes, planning) =====
   N'affiche que les blocs des volets autorisés pour le compte connecté. */
