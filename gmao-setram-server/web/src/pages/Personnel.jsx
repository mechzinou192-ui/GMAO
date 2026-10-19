// Gestion du personnel : intervenants, prestataires, habilitations, jours fériés.
import React,{useState} from "react";
import {ROLES,posteOptions} from "../constantes.js";
import {exporterXlsx,xlToDate} from "../excel.js";
import {frDate,todayStr} from "../lib/dates.js";
import {CDC_ETATS,CONTRAT_SEUIL_MOIS,HAB_SEUIL_MOIS,contratInfo,habFin,habListe,habStatus} from "../lib/echeances.js";
import {libConge} from "../lib/jours.js";
import {Btn,Card,ExportBtn,Field,Inp} from "../ui/base.jsx";
import {I} from "../ui/icones.jsx";

export function SuiviHabilitations({inter,onEdit}){
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

export function JoursFeries({feries,onChange}){
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
export function Equipe({inter,prestataires,equipements,onAddPresta,onEditPresta,feries,onChangeFeries,onAdd,onEdit}){
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
    <div><h3 className="text-sm font-semibold text-slate-200">Prestataires externes</h3><div className="text-xs text-slate-500">Proposés comme intervenants à l'assignation des OT et plans uniquement pour les systèmes sur lesquels ils interviennent.</div></div>
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
export function InterForm({mode,item,existing,systemsList,onSubmit}){
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

export function PrestaForm({mode,item,existing,systemsList,onSubmit}){
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
  <div className="text-xs text-slate-500">Il sera proposé comme intervenant (badge « Externe ») pour les OT et plans de ces systèmes uniquement.</div>
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
