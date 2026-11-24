// Demandes d'Intervention (DI) : liste, détail, création.
import React,{useState,useMemo} from "react";
import PiecesJointes from "../PiecesJointes.jsx";
import {exporterXlsx} from "../excel.js";
import {Badge,Btn,Card,ExportBtn,Field,Info,Inp,KPI,ouiNon,typeLabel,ETATS_MANUELS,StatutManuel} from "../ui/base.jsx";
import {I} from "../ui/icones.jsx";
import {cheminTexte,codeSysteme,codeSousSysteme,noeudDI,noeudTexte,noeudsSelectionnables,champsNoeud,nomComposeNoeud} from "../lib/arbre.js";
import {cleNiveauProfondeur,profondeur} from "../../../server/src/arbre-core.js";
import SelecteurNoeud from "../ui/SelecteurNoeud.jsx";
import {CLES_NIVEAUX_DI,libelleNiveau} from "../../../server/src/profils-core.js";

// Chemin du nœud (système → … → nœud visé), affiché code par code
export function Chemin({chemin,compact=false}){
 if(!chemin||!chemin.length) return null;
 if(compact) return <div className="text-[11px] text-slate-500 break-all" title={cheminTexte(chemin,true)}>{cheminTexte(chemin)}</div>;
 return <ol className="text-sm space-y-0.5" data-testid="chemin-di">{chemin.map((n,i)=><li key={n.niveau} style={{paddingLeft:i*14}}>
  <span className="text-slate-500 text-xs">{i>0?"└ ":""}{libelleNiveau(n.niveau)} :</span> <span className={i===chemin.length-1?"text-sky-400 font-medium":"text-slate-300"}>{n.code}</span>{n.nom?<span className="text-slate-400"> — {n.nom}</span>:null}
 </li>)}</ol>;
}

/* ===== Page 1 : Demandes d'Intervention (créées par l'Exploitation) ===== */
export function DIPage({dis,bts,onNewDI,onOpenDI,onGenererBT,chemin=()=>[]}){
 const exportDI=()=>exporterXlsx({fichier:"Demandes_Intervention_DI",feuilles:[{nom:"DI",titre:"Demandes d'Intervention (DI)",
  colonnes:[{h:"Code DI"},{h:"Code du nœud"},{h:"Chemin (système → nœud)",max:60},{h:"Désignation du nœud"},{h:"Demandeur"},{h:"Désignation",max:50},{h:"Type de maintenance"},{h:"Emplacement"},{h:"Date événement",t:"datetime"},{h:"Date création",t:"datetime"},{h:"Perturbation"},{h:"OT lié"},{h:"État"}],
  lignes:dis.map(d=>{const bt=bts.find(b=>b.di===d.code);return [d.code,noeudDI(d,chemin(d)).code,cheminTexte(chemin(d)),noeudDI(d,chemin(d)).nom,d.demandeur,d.designation,typeLabel(d),d.emplacement,d.dateEvt,d.dateCreation,ouiNon(d.perturb),bt?bt.code:"",d.etat];})}]});
 return (<div className="space-y-5">
  <KPI items={[
   ["DI ouvertes",dis.filter(d=>d.etat!=="Traité").length,"text-sky-400"],
   ["À transmettre",dis.filter(d=>d.etat==="À Transmettre").length,"text-slate-300"],
   ["Transmises (OT généré)",dis.filter(d=>d.etat==="Transmis").length,"text-amber-400"],
   ["Traitées",dis.filter(d=>d.etat==="Traité").length,"text-emerald-400"],
  ]}/>
  <Card>
   <div className="flex justify-between items-center mb-1 flex-wrap gap-2">
    <div><h2 className="font-semibold text-slate-100">Demandes d'Intervention (DI)</h2><div className="text-xs text-slate-500">Créées par le service Exploitation — cliquez sur une ligne pour ouvrir la DI</div></div>
    <div className="flex gap-2"><ExportBtn onClick={exportDI}/>{onNewDI&&<Btn onClick={onNewDI}><span className="flex items-center gap-1">{I.plus} Nouvelle DI</span></Btn>}</div>
   </div>
   <div className="md:hidden mt-3 space-y-2" data-testid="di-cartes">
    {dis.map(d=>{const bt=bts.find(b=>b.di===d.code);return <div key={d.code} onClick={()=>onOpenDI(d)} className="rounded-lg border border-slate-700 bg-slate-900/40 p-3 cursor-pointer active:bg-slate-700/40">
     <div className="flex items-start justify-between gap-2"><span className="text-sky-400 font-medium">{d.code}</span><Badge t={d.etat}/></div>
     <div className="text-sm mt-1">{noeudDI(d,chemin(d)).code}</div><div className="text-xs text-slate-400">{noeudDI(d,chemin(d)).nom}</div><Chemin compact chemin={chemin(d)}/>
     <div className="text-sm text-slate-300 mt-1 break-words">{d.designation}</div>
     <div className="text-xs text-slate-400 mt-1">{typeLabel(d)}{d.dateEvt?" · "+d.dateEvt:""}{d.perturb?<span className="text-rose-400"> · Perturbation</span>:null}</div>
     {bt && <div className="text-xs text-slate-400">OT lié : {bt.code}</div>}
     {onGenererBT && d.etat==="À Transmettre" && <div className="mt-2"><Btn cls="bg-sky-600 hover:bg-sky-500 text-white w-full" onClick={(e)=>{e.stopPropagation();onGenererBT(d);}}>Générer OT</Btn></div>}
    </div>;})}
    {dis.length===0 && <div className="text-center text-slate-500 py-4 text-xs">Aucune DI.</div>}
   </div>
   <div className="hidden md:block overflow-x-auto mt-2"><table className="w-full text-sm">
    <thead><tr className="text-slate-400 text-left"><th className="py-1">Code DI</th><th>Nœud (système → …)</th><th>Demandeur</th><th>Désignation</th><th>Type</th><th>Emplacement</th><th>Date événement</th><th>Perturb.</th><th>OT lié</th><th>État</th><th></th></tr></thead>
    <tbody>{dis.map(d=>{const bt=bts.find(b=>b.di===d.code);return <tr key={d.code} onClick={()=>onOpenDI(d)} className="border-t border-slate-700 align-top cursor-pointer hover:bg-slate-700/40">
     <td className="py-1.5 text-sky-400">{d.code}</td><td>{noeudDI(d,chemin(d)).code}<br/><span className="text-xs text-slate-400">{noeudDI(d,chemin(d)).nom}</span><Chemin compact chemin={chemin(d)}/></td>
     <td className="text-xs text-slate-400">{d.demandeur||"—"}</td>
     <td className="text-xs text-slate-400 max-w-xs">{d.designation}</td><td className="text-xs text-slate-400">{typeLabel(d)}</td><td className="text-xs text-slate-400">{d.emplacement}</td>
     <td className="text-xs text-slate-400">{d.dateEvt}</td>
     <td>{d.perturb?<span className="text-rose-400">Oui</span>:"Non"}</td>
     <td className="text-xs text-slate-400">{bt?bt.code:"—"}</td>
     <td><Badge t={d.etat}/></td>
     <td>{onGenererBT && d.etat==="À Transmettre" && <Btn cls="bg-sky-600 hover:bg-sky-500 text-xs" onClick={(e)=>{e.stopPropagation();onGenererBT(d);}}>Générer OT</Btn>}</td>
    </tr>;})}</tbody>
   </table></div>
  </Card>
 </div>);
}

export function DIDetail({di,bt,onGenererBT,onOpenBT,onStatut,chemin=[]}){
 return (<div className="space-y-3">
  <div className="flex items-center gap-2"><Badge t={di.etat}/>{di.perturb && <span className="text-xs text-rose-400">Perturbation exploitation</span>}</div>
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
   <Info l="Code DI">{di.code}</Info>
   <Info l="Nœud visé">{noeudTexte(di,chemin)}</Info>
   <Info l="Demandeur">{di.demandeur||"—"}</Info>
   <Info l="Type de maintenance">{typeLabel(di)}</Info>
   <Info l="Emplacement">{di.emplacement||"—"}</Info>
   <Info l="Date de l'événement">{di.dateEvt}</Info>
   <Info l="Date de création">{di.dateCreation}</Info>
   <Info l="Perturbation exploitation">{di.perturb?"Oui":"Non"}</Info>
  </div>
  {chemin.length>0 && <div className="border border-slate-700 rounded-lg p-3"><div className="text-xs text-slate-500 mb-1">Arborescence — du système au nœud de la DI</div><Chemin chemin={chemin}/></div>}
  <Info l="Désignation (constat)">{di.designation}</Info>
  <div className="border-t border-slate-700 pt-3">
   <div className="text-xs text-slate-500 mb-1">Ordre de Travail lié</div>
   {bt ? <div className="flex items-center gap-2 text-sm"><button className="text-sky-400 hover:underline" onClick={onOpenBT}>{bt.code}</button><Badge t={bt.etat}/></div>
       : <div className="text-sm text-slate-400">Aucun OT généré pour cette DI.</div>}
  </div>
  <PiecesJointes collection="dis" recordId={di.code}/>
  {onGenererBT && di.etat==="À Transmettre" && <div className="flex justify-end"><Btn onClick={onGenererBT}>Générer l'OT</Btn></div>}
  {onStatut && <StatutManuel etats={ETATS_MANUELS.di} valeur={di.etat} quoi={di.code} onAppliquer={onStatut}/>}
 </div>);
}

/*
 * Choix de l'équipement : un seul champ « Équipement » qui affiche uniquement le code GMAO et le nom de l'équipement
 * (plus de cascade système → sous-système → sous-équipement…). La DI porte alors sur l'équipement entier.
 * Exception : une DI lancée depuis l'arborescence sur un système, un sous-système, un sous-équipement ou un
 * sous-sous-équipement garde ce nœud, affiché en lecture seule.
 * « niveaux » = niveaux où le profil peut créer une DI (réglés par le super administrateur dans Administration › Profils ;
 * le serveur revérifie).
 */
export function DIForm({prefill,equipements,demandeur,onSubmit,systemsList,treeStruct={},unit,niveaux=CLES_NIVEAUX_DI}){
 const dateCreation=useMemo(()=>new Date().toISOString().slice(0,16).replace("T"," "),[]);
 const pre=prefill?.eq?equipements.find(e=>e.code===prefill.eq):null;
 const unite=unit||(equipements[0]&&equipements[0].unit)||"";
 const systemes=systemsList?systemsList.filter(([c])=>c!=="MESURE"&&c!=="CTRL"):[...new Set(equipements.map(e=>e.system))].map(c=>[c,""]);
 const sousSystemes=(sys)=>{
  const l=(treeStruct[sys]||[]).map(x=>({code:x.code,nom:x.sub}));
  equipements.filter(e=>e.system===sys&&e.subCode&&!l.some(x=>x.code===e.subCode)).forEach(e=>l.push({code:e.subCode,nom:""}));
  return l;
 };
 const preSeg=String(prefill?.eq||"").split(".");
 // nœud imposé par l'arborescence (système, sous-système, sous-équipement, sous-sous-équipement) : affiché, non modifiable
 const depuisArbo=!!(prefill&&(prefill.niveau==="systeme"||prefill.niveau==="sousSysteme"||prefill.se||prefill.ss||prefill.noeud));
 const [n,setN]=useState({
  sys:pre?pre.system:(prefill?.niveau==="systeme"||prefill?.niveau==="sousSysteme"?preSeg[0]:""),
  sub:pre?pre.subCode:(prefill?.niveau==="sousSysteme"?preSeg[2]:""),
  eq:pre?pre.code:"",se:prefill?.se||"",ss:prefill?.ss||"",noeud:prefill?.noeud||prefill?.ss||prefill?.se||""});
 const [f,setF]=useState({emplacement:pre?pre.emplacement:"",designation:"",dateEvt:new Date().toISOString().slice(0,16).replace("T"," ")});
 const [fromFiche,setFromFiche]=useState(!!(pre&&pre.emplacement));
 const [perturb,setPerturb]=useState("Non");
 const [typeM,setTypeM]=useState("Corrective");
 const [sousType,setSousType]=useState("Curative");
 const [err,setErr]=useState("");
 const cur=equipements.find(e=>e.code===n.eq);
 const profN=n.noeud&&n.eq?profondeur(n.eq,n.noeud):0;   // profondeur du nœud visé sous l'équipement (illimitée)
 const niveau=n.noeud&&n.eq?cleNiveauProfondeur(profN):n.eq?"equipement":n.sub?"sousSysteme":n.sys?"systeme":null;
 const niveauOk=niveau&&niveaux.includes(niveau);
 // tous les nœuds de l'arborescence que le profil a le droit de viser (un seul champ, filtré par niveaux autorisés)
 const noeuds=useMemo(()=>noeudsSelectionnables({equipements,systemsList:systemes,treeStruct,unit:unite,niveaux}),[equipements,systemsList,treeStruct,unite,niveaux]);
 const cleCourante=niveau?(noeuds.find(x=>x.niveau===niveau&&x.sys===n.sys&&(x.sub||"")===(n.sub||"")&&x.eq===n.eq&&(x.noeud||"")===(n.noeud||""))||{}).cle||"":"";
 const choisirEquipement=(cle)=>{
  const x=noeuds.find(y=>y.cle===cle);
  setN(x?{sys:x.sys,sub:x.sub,eq:x.eq,se:x.se,ss:x.ss,noeud:x.noeud||""}:{sys:"",sub:"",eq:"",se:"",ss:"",noeud:""});
  setErr("");
  setF(v=>({...v,emplacement:x?x.emplacement||"":""})); setFromFiche(!!(x&&x.emplacement));
 };
 // code GMAO et désignation du nœud visé
 const noeud=()=>{
  if(niveau==="systeme") return {eq:codeSysteme(n.sys,unite),nom:(systemes.find(x=>x[0]===n.sys)||[])[1]||n.sys};
  if(niveau==="sousSysteme"){const s=sousSystemes(n.sys).find(x=>x.code===n.sub);return {eq:codeSousSysteme(n.sys,unite,n.sub),nom:((systemes.find(x=>x[0]===n.sys)||[])[1]||n.sys)+" — "+(s&&s.nom||n.sub)};}
  return {eq:cur.code,nom:n.noeud?nomComposeNoeud(cur,n.noeud):cur.nom};
 };
 const sel="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm mt-1";
 const valider=()=>{
  if(!niveau){setErr("Choisissez l'équipement concerné.");return;}
  if(!f.designation.trim()){setErr("La désignation (description du constat) est obligatoire : la DI ne peut pas être créée sans elle.");return;}
  if(!niveauOk){setErr("Votre profil ne permet pas de créer une DI au niveau « "+libelleNiveau(niveau)+" ». Niveaux permis : "+(niveaux.map(libelleNiveau).join(", ")||"aucun")+".");return;}
  const {eq,nom}=noeud();
  const sousEq=profN>0?champsNoeud(cur,n.noeud):{se:"",ss:"",noeud:""};   // se / ss = ancêtres de 1er et 2e niveau, noeud = nœud visé
  onSubmit({eq,nom,...sousEq,niveau,emplacement:f.emplacement,designation:f.designation.trim(),dateEvt:f.dateEvt,dateCreation,perturb,demandeur,typeMaintenance:typeM,sousType});
 };
 return (<div>
  <Field label="Demandeur (automatique)"><Inp value={demandeur} disabled className="opacity-60"/></Field>
  {depuisArbo
   ? <div className="border border-slate-700 rounded-lg p-2 mt-2" data-testid="noeud-precharge">
      <div className="text-xs text-sky-400">Nœud préchargé depuis l'arborescence</div>
      <div className="text-sm text-slate-100 mt-1">{niveau?noeud().eq+" — "+noeud().nom:"—"}</div>
     </div>
   : <Field label="Équipement / nœud de l'arborescence (code GMAO)"><SelecteurNoeud ariaLabel="Équipement" noeuds={noeuds} cle={cleCourante} onChange={choisirEquipement} msgVide="Aucun nœud accessible avec votre profil"/></Field>}
  {niveau && !niveauOk && <div className="text-xs mt-2 text-rose-300">✕ Votre profil ne permet pas de créer une DI au niveau « {libelleNiveau(niveau)} » (niveaux permis : {niveaux.map(libelleNiveau).join(", ")||"aucun"}).</div>}
  <Field label={fromFiche?"Emplacement (repris automatiquement de la fiche équipement)":"Emplacement"}>
   <Inp value={f.emplacement} disabled={fromFiche} className={fromFiche?"opacity-60":""} onChange={e=>setF({...f,emplacement:e.target.value})} placeholder={niveau?"À saisir":"Choisissez d'abord l'équipement"}/>
  </Field>
  <Field label="Désignation (description du constat) *"><Inp value={f.designation} onChange={e=>{setF({...f,designation:e.target.value});setErr("");}} placeholder="Obligatoire : décrire le constat"/></Field>
  <Field label="Type de maintenance">
   <select value={typeM} onChange={e=>setTypeM(e.target.value)} className={sel}><option>Corrective</option><option>Préventive</option></select>
  </Field>
  {typeM==="Corrective" && <Field label="Nature de la maintenance corrective">
   <select value={sousType} onChange={e=>setSousType(e.target.value)} className={sel}><option>Palliative</option><option>Curative</option></select>
  </Field>}
  <Field label="Date et heure de l'événement"><input type="datetime-local" value={f.dateEvt.replace(" ","T")} onChange={e=>setF({...f,dateEvt:e.target.value.replace(" ","T")})} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-100 mt-1"/></Field>
  <Field label="Date et heure de création (automatique)"><Inp value={dateCreation} disabled className="opacity-60"/></Field>
  <Field label="Perturbation exploitation">
   <select value={perturb} onChange={e=>setPerturb(e.target.value)} className={sel}><option>Non</option><option>Oui</option></select>
  </Field>
  <div className="text-xs text-slate-500 mt-2">État initial : "À Transmettre".</div>
  {err && <div className="text-xs text-rose-400 text-right mt-1">{err}</div>}
  <div className="flex justify-end mt-3"><Btn onClick={valider}>Créer la DI</Btn></div>
 </div>);
}
