// Administration : comptes, droits d'accès, import de données.
import React,{useState,useEffect,useRef} from "react";
import ImportDonnees from "../ImportDonnees.jsx";
import {api} from "../api.js";
import {KPI_ALL,KPI_BLOCS,KPI_VUES,VOLETS} from "../constantes.js";
import {UNITS} from "../lib/unites.js";
import {Btn,Card,Chk,Field,Inp,SubTabs} from "../ui/base.jsx";
import {PROFILS,catalogue,nomsProfils,profilsDelegables,nomProfil,NIVEAUX_DI,CLES_NIVEAUX_DI,ACTIONS,CLES_ACTIONS,VOLETS_ACTIONS,normaliserActions} from "../../../server/src/profils-core.js";
import {PHRASE_REINITIALISATION,COLLECTIONS_METIER,COLLECTIONS_REFERENTIELS,REFERENTIELS_PAR_SYSTEME,phraseCorrecte} from "../../../server/src/reinitialisation-core.js";

export function AdminPage({systemsList,me,importRefs,superAdmin=true,unitesAdmin=UNITS,profilsPerso=[],setProfilsPerso}){
 const [vue,setVue]=useState("acces");
 // administrateur UO à qui le super admin a donné la main : comptes de ses unités seulement (pas d'import, pas de remise à zéro)
 if(!superAdmin) return <div><div className="text-xs text-slate-400 mb-3">Gestion déléguée par le super administrateur : comptes de vos unités ({unitesAdmin.join(", ")}), profils d'unité uniquement. Il peut vous retirer cette délégation à tout moment.</div>
  <AdminAcces systemsList={systemsList} me={me} superAdmin={false} unites={unitesAdmin}/></div>;
 return (<div>
  <div className="mb-4"><SubTabs value={vue} onChange={setVue} items={[["acces","Comptes et droits d'accès"],["profils","Profils (organigramme)"],["import","Import de données (Excel)"],["zero","Repartir de zéro"]]}/></div>
  {vue==="profils" && <EditeurProfils profilsPerso={profilsPerso} setProfilsPerso={setProfilsPerso}/>}
  {vue==="acces" && <AdminAcces systemsList={systemsList} me={me}/>}
  {vue==="import" && <ImportDonnees refs={importRefs}/>}
  {vue==="zero" && <RepartirDeZero systemsList={systemsList}/>}   {/* l'onglet Administration n'est ouvert qu'au super administrateur ; le serveur le revérifie */}
 </div>);
}

export function AdminAcces({systemsList,me,superAdmin=true,unites=UNITS}){
 const profilsProposes=superAdmin?nomsProfils():profilsDelegables();
 const [users,setUsers]=useState([]); const [loadErr,setLoadErr]=useState(""); const msgRef=useRef(null);
 const reload=()=>api.users().then(r=>{setUsers(r.users);setLoadErr("");}).catch(e=>setLoadErr(e.message));
 useEffect(()=>{reload();},[]);
 const normId=(s)=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim().replace(/\s+/g,".").replace(/[^a-z0-9._-]/g,"");
 const pwProblem=(p)=>p.length<10?"Mot de passe : 10 caractères minimum.":(!/[A-Za-z]/.test(p)||!/[0-9]/.test(p))?"Le mot de passe doit contenir au moins une lettre ET un chiffre.":"";
 const [sel,setSel]=useState(null); const [open,setOpen]=useState({}); const [msg,setMsg]=useState("");
 const allSys=systemsList.map(s=>s[0]);
 const edit=(u)=>{setSel({...u,role:nomProfil(u.role),id0:u.id,pw:"",_new:false,email:u.email||"",gestionComptes:!!u.gestionComptes,droits:JSON.parse(JSON.stringify(u.droits||{}))});setMsg("");};
 const add=()=>{setSel({id:"",nom:"",role:"Technicien",pw:"",email:"",actif:true,superAdmin:false,gestionComptes:false,droits:{},_new:true});setMsg("");};
 // profil choisi : volets du profil appliqués aux unités cochées ; « tous systèmes » pour l'administrateur UO ;
 // toutes les unités pour l'expert DG (il garde ses systèmes)
 const appliquerProfil=(role)=>setSel(s=>{
  const p=catalogue()[role]; if(!p) return {...s,role};
  const base=p.toutesUnites?Object.fromEntries(unites.map(u=>[u,s.droits[u]||Object.values(s.droits)[0]||{systems:[],volets:[]}])):s.droits;
  const d=Object.fromEntries(Object.entries(base).map(([u,g])=>[u,{...g,volets:[...p.volets],systems:p.tousSystemes?["*"]:(g.systems||[]).filter(x=>x!=="*")}]));
  return {...s,role,droits:d,gestionComptes:role==="Administrateur UO"?s.gestionComptes:false};
 });
 const profilSel=sel&&!sel.superAdmin?catalogue()[sel.role]:null;
 const setD=(u,patch)=>setSel(s=>({...s,droits:{...s.droits,[u]:{...(s.droits[u]||{systems:[],volets:[]}),...patch}}}));
 const toggleUnit=(u,on)=>{setSel(s=>{const d={...s.droits}; const p=catalogue()[s.role]; if(on) d[u]=d[u]||{systems:p&&p.tousSystemes?["*"]:[],volets:p?[...p.volets]:[]}; else delete d[u]; return {...s,droits:d};}); if(on) setOpen(o=>({...o,[u]:true}));};
 const toggleIn=(u,key,v)=>{const cur=(sel.droits[u]||{})[key]||(key==="kpi"?KPI_ALL:[]); setD(u,{[key]:cur.includes(v)?cur.filter(x=>x!==v):[...cur,v]});};
 const copyAll=(u)=>setSel(s=>{const src=s.droits[u]; const d={}; UNITS.forEach(x=>{d[x]={...src,systems:[...src.systems],volets:[...src.volets],...(src.kpi?{kpi:[...src.kpi]}:{})};}); return {...s,droits:d};});
 const save=async()=>{
   const id=sel._new?normId(sel.id):sel.id0, nom=sel.nom.trim();
   if(!nom) return setMsg("Le nom complet est obligatoire.");
   if(id.length<3) return setMsg("Identifiant : 3 caractères minimum (lettres, chiffres, point, tiret). Exemple : karim.belaid");
   if(sel._new&&!sel.pw) return setMsg("Mot de passe provisoire obligatoire pour un nouveau compte.");
   if(sel.pw){const pb=pwProblem(sel.pw); if(pb) return setMsg(pb);}
   const isMe=!sel._new&&sel.id0===me;
 const body={nom,role:sel.superAdmin?"Super Admin":sel.role,actif:isMe?true:sel.actif,droits:sel.droits,email:(sel.email||"").trim(),...(sel.pw?{password:sel.pw}:{}),
    ...(superAdmin?{superAdmin:isMe?true:sel.superAdmin,gestionComptes:!!sel.gestionComptes}:{})};
   try{
    if(sel._new) await api.createUser({id,...body}); else await api.updateUser(sel.id0,body);
    await reload(); setSel(null); setMsg("");
   }catch(e){ setMsg(e.message); }
  };
  useEffect(()=>{if(msg&&msgRef.current) msgRef.current.scrollIntoView({block:"center",behavior:"smooth"});},[msg]);
  const del=async()=>{ if(sel.id0===me) return; if(window.confirm("Supprimer le compte « "+sel.nom+" » ?")){ try{await api.deleteUser(sel.id0); await reload(); setSel(null);}catch(e){setMsg(e.message);} } };
 const resume=(u)=>u.superAdmin?"Accès total":(Object.keys(u.droits||{}).length?Object.entries(u.droits).map(([un,d])=>un+" ("+(d.systems.includes("*")?"tous sys.":d.systems.join(", ")||"0 sys.")+")").join(" · "):"Aucun accès");
 return <div className="grid md:grid-cols-3 gap-4">
  <div className="space-y-2">
   <Btn onClick={add}>+ Nouvel utilisateur</Btn>
    {loadErr&&<div className="text-xs text-rose-400">{loadErr}</div>}
   {users.map(u=><Card key={u.id} cls={"cursor-pointer "+(sel&&sel.id0===u.id?"border-sky-500":"")}>
    <div onClick={()=>edit(u)}>
     <div className="flex justify-between items-center"><b className="text-slate-100 text-sm">{u.nom}</b>{!u.actif&&<span className="text-xs text-rose-400">Désactivé</span>}</div>
     <div className="text-xs text-slate-500">{u.id} · {u.superAdmin?"Super admin":nomProfil(u.role)}{u.gestionComptes?" · gère les comptes":""}</div>
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
     <Field label="Profil"><select aria-label="Profil" value={sel.role} disabled={sel.superAdmin} onChange={e=>appliquerProfil(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm mt-1">{(profilsProposes.includes(sel.role)?profilsProposes:[sel.role,...profilsProposes]).map(r=><option key={r}>{r}</option>)}</select>
      {profilSel&&<div className="text-[11px] text-slate-500 mt-1">{profilSel.libelle}</div>}</Field>
     <Field label="E-mail (notifications, facultatif)"><Inp type="email" value={sel.email||""} onChange={e=>setSel({...sel,email:e.target.value})} placeholder="prenom.nom@setram.dz"/></Field>
    </div>
    <div className="flex gap-5 flex-wrap">
     <Chk checked={sel.actif} onChange={v=>setSel({...sel,actif:v})}>Compte actif</Chk>
     {superAdmin&&<Chk checked={sel.superAdmin} onChange={v=>setSel({...sel,superAdmin:v})}>Super administrateur (accès total + gestion des droits)</Chk>}
     {superAdmin&&!sel.superAdmin&&catalogue()[sel.role]?.delegationComptes&&<Chk checked={!!sel.gestionComptes} onChange={v=>setSel({...sel,gestionComptes:v})}><span data-testid="donner-la-main">Lui donner la main sur les comptes de son unité <span className="text-xs text-slate-500">(vous pouvez la retirer à tout moment)</span></span></Chk>}
    </div>
    {!sel.superAdmin&&<div>
     <div className="text-sm font-semibold text-slate-200 mb-1">Droits détaillés par unité</div>
     <div className="text-xs text-slate-500 mb-2">Cochez les unités visibles, puis pour chacune les systèmes et les volets autorisés.</div>
     <div className="space-y-2">{unites.map(u=>{const d=sel.droits[u]; return <div key={u} className="border border-slate-700 rounded-lg p-2">
      <div className="flex items-center justify-between gap-2">
       <Chk checked={!!d} onChange={v=>toggleUnit(u,v)}><b className="text-slate-100">{u}</b></Chk>
       {d&&<div className="flex items-center gap-2 text-xs text-slate-400">{d.systems.includes("*")?"tous les systèmes":d.systems.length+"/"+allSys.length+" systèmes"} · {d.volets.length}/{VOLETS.length} volets
        <button className="underline" onClick={()=>setOpen(o=>({...o,[u]:!o[u]}))}>{open[u]?"Réduire":"Détail"}</button></div>}
      </div>
      {d&&open[u]&&<div className="mt-2 space-y-2">
       {d.systems.includes("*")?<div className="text-xs text-slate-400">Systèmes : <b>tous les systèmes de l'unité</b> (administrateur UO), y compris ceux créés plus tard.</div>:
       <div><div className="flex gap-3 text-xs text-slate-400 mb-1">Systèmes <button className="underline" onClick={()=>setD(u,{systems:[...allSys]})}>Tous</button><button className="underline" onClick={()=>setD(u,{systems:[]})}>Aucun</button></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1">{systemsList.map(([c,n])=><Chk key={c} checked={d.systems.includes(c)} onChange={()=>toggleIn(u,"systems",c)}>{c} <span className="text-xs text-slate-500">{n}</span></Chk>)}</div></div>}
       <div><div className="flex gap-3 text-xs text-slate-400 mb-1">Volets <button className="underline" onClick={()=>setD(u,{volets:VOLETS.map((_,i)=>i)})}>Tous</button><button className="underline" onClick={()=>setD(u,{volets:[]})}>Aucun</button></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1">{VOLETS.map((v,i)=>profilSel&&!profilSel.volets.includes(i)?<div key={i} className="text-sm text-slate-500" title="Hors du profil">— {v}</div>:<Chk key={i} checked={d.volets.includes(i)} onChange={()=>toggleIn(u,"volets",i)}>{v}</Chk>)}</div></div>
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

// Mise en service : vider les données de démonstration / de test avant d'importer les vraies données.
// Garde-fous : super administrateur, sauvegarde déclarée, phrase à recopier ; côté serveur, archivage + suppression logique.
const NOMS_COLLECTIONS={equipements:"Équipements",dis:"Demandes d'intervention",bts:"Ordres de travail",planning:"Plans préventifs",compteurs_eq:"Compteurs",
 pieces:"Articles (pièces, outillage, consommables)",dss:"Demandes de sortie",bs:"Bons de sortie",brs:"Bons de retour",decharges:"Décharges",
 intervenants:"Intervenants",prestataires:"Prestataires",mesures:"Appareils de mesure",controles:"Contrôles réglementaires",organismes:"Organismes",
 systemes:"Systèmes",arborescence:"Sous-systèmes (arborescence)",feries:"Jours fériés"};
export function RepartirDeZero({systemsList=[]}){
 const [cats,setCats]=useState(COLLECTIONS_METIER);      // catégories cochées
 const [unit,setUnit]=useState("");                       // "" = toutes les unités
 const [system,setSystem]=useState("");                   // "" = tous les systèmes
 const [numerotation,setNumerotation]=useState(true);
 const [sauvegarde,setSauvegarde]=useState(false);
 const [phrase,setPhrase]=useState("");
 const [etat,setEtat]=useState({envoi:false,err:"",res:null});
 // Règles du périmètre (les mêmes que le serveur) : une unité exclut les référentiels (communs à toutes les unités) ;
 // un système exclut les jours fériés ; un système interdit la remise à 1 de la numérotation (des éléments restent).
 const refVisibles=COLLECTIONS_REFERENTIELS.filter(c=>!unit && !(system && c==="feries"));
 const effectives=cats.filter(c=>COLLECTIONS_METIER.includes(c)||refVisibles.includes(c));
 const numerotationActive=numerotation && !system;
 const phraseOk=phraseCorrecte(phrase);
 const pret=sauvegarde && effectives.length>0 && phraseOk && !etat.envoi;
 const bascule=(c)=>setCats(l=>l.includes(c)?l.filter(x=>x!==c):[...l,c]);
 const perimetre=(u,sy)=>(u?"unité "+u:"toutes les unités")+" · "+(sy?"système "+sy:"tous les systèmes");
 const lancer=async()=>{
  if(!pret) return;
  setEtat({envoi:true,err:"",res:null});
  try{ const res=await api.reinitialiser({confirmation:phrase,sauvegardeFaite:true,collections:effectives,unit,system,numerotation:numerotationActive}); setEtat({envoi:false,err:"",res}); }
  catch(e){ setEtat({envoi:false,err:e.message+(e.requestId?" (référence : "+e.requestId+")":""),res:null}); }
 };
 if(etat.res) return (<Card><div data-testid="reinit-ok">
  <div className="font-semibold text-emerald-400">Remise à zéro effectuée — {etat.res.total} élément(s) archivé(s) (opération n° {etat.res.reinitialisation}).</div>
  <div className="text-xs text-slate-400 mt-1">Périmètre : {perimetre(etat.res.unit,etat.res.system)}</div>
  <ul className="text-xs text-slate-400 mt-2 grid sm:grid-cols-2 gap-x-6">{Object.entries(etat.res.collections).filter(([,n])=>n>0).map(([c,n])=><li key={c}>{NOMS_COLLECTIONS[c]||c} : {n}</li>)}</ul>
  <div className="text-sm mt-3">Étape suivante : <b>Import de données (Excel)</b> pour charger vos équipements, articles, intervenants et planning.</div>
  <div className="flex justify-end mt-3"><Btn onClick={()=>window.location.reload()}>Recharger l'application</Btn></div>
 </div></Card>);
 const selectCls="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-100 mt-1";
 return (<Card>
  <div className="font-semibold text-rose-400">Repartir de zéro — vider les données avant la mise en service</div>
  <div className="text-sm text-slate-300 mt-1">Choisissez <b>ce qui sera vidé</b> : une ou plusieurs catégories, pour toutes les unités ou pour une seule, pour tous les systèmes ou pour un seul (par exemple uniquement l'arborescence de CFO).</div>
  <div className="grid md:grid-cols-2 gap-x-4 mt-2">
   <Field label="Unité"><select aria-label="Unité" className={selectCls} value={unit} onChange={e=>setUnit(e.target.value)}><option value="">Toutes les unités</option>{UNITS.map(u=><option key={u} value={u}>{u}</option>)}</select></Field>
   <Field label="Système"><select aria-label="Système" className={selectCls} value={system} onChange={e=>setSystem(e.target.value)}><option value="">Tous les systèmes</option>{systemsList.map(([c,n])=><option key={c} value={c}>{c} — {n}</option>)}</select></Field>
  </div>
  <div className="text-xs text-slate-500 mt-1">Avec une unité ou un système, seuls les éléments portant cette unité / ce système sont vidés ; les éléments communs (sans unité ou sans système) ne sont pas touchés.</div>
  <div className="grid md:grid-cols-2 gap-4 mt-3 text-sm">
   <div>
    <div className="flex items-center gap-3 text-xs text-slate-400 font-medium mb-1">Catégories à vider
     <button type="button" className="text-sky-400 hover:text-sky-300" onClick={()=>setCats([...COLLECTIONS_METIER,...refVisibles])}>Tout cocher</button>
     <button type="button" className="text-sky-400 hover:text-sky-300" onClick={()=>setCats([])}>Tout décocher</button></div>
    <div className="space-y-1">{COLLECTIONS_METIER.map(c=><Chk key={c} checked={cats.includes(c)} onChange={()=>bascule(c)}>{NOMS_COLLECTIONS[c]||c}</Chk>)}</div>
    <div className="text-xs text-slate-400 font-medium mt-3 mb-1">Référentiels (communs à toutes les unités)</div>
    {unit?<div className="text-xs text-slate-500">Non disponibles quand une unité est choisie.</div>
     :<div className="space-y-1">{refVisibles.map(c=><Chk key={c} checked={cats.includes(c)} onChange={()=>bascule(c)}>{NOMS_COLLECTIONS[c]||c}{system&&REFERENTIELS_PAR_SYSTEME.includes(c)?" (de "+system+" seulement)":""}</Chk>)}</div>}
   </div>
   <div><div className="text-xs text-slate-400 font-medium mb-1">Toujours conservé</div>
    <ul className="text-xs text-slate-300 list-disc pl-4"><li>Comptes utilisateurs et droits d'accès</li><li>Journal d'audit</li><li>Tout ce qui est hors du périmètre choisi</li></ul>
    <div className="text-xs text-slate-500 mt-2">Rien n'est effacé physiquement : les éléments sont archivés en base puis retirés de l'application. La DSI peut annuler l'opération (procédure dans le runbook).</div></div>
  </div>
  <div className="mt-3 space-y-1">
   <Chk checked={numerotationActive} onChange={v=>!system&&setNumerotation(v)}>Remettre la numérotation à 1{unit?" (pour l'unité "+unit+" seulement)":""} (DI-…-0001, OT-…-0001, DS-…-0001, P-001…){system?" — indisponible avec un système : des éléments restent":""}</Chk>
   <Chk checked={sauvegarde} onChange={setSauvegarde}>J'ai fait <b>et vérifié</b> une sauvegarde de la base (runbook § sauvegarde)</Chk>
  </div>
  <div className="text-xs text-slate-300 mt-2" data-testid="reinit-resume">Sera vidé : <b>{effectives.length?effectives.map(c=>NOMS_COLLECTIONS[c]||c).join(", "):"rien (cochez au moins une catégorie)"}</b> — {perimetre(unit,system)}.</div>
  <Field label={<>Pour confirmer, tapez dans le champ : <b className="text-rose-400 select-all">{PHRASE_REINITIALISATION}</b> (majuscules et accents sans importance)</>}>
   <Inp aria-label="Phrase de confirmation" value={phrase} onChange={e=>setPhrase(e.target.value)} autoComplete="off"/></Field>
  {etat.err && <div className="text-xs text-rose-400 mt-2">{etat.err}</div>}
  {!pret && !etat.envoi && <div className="text-xs mt-2 space-y-0.5" data-testid="reinit-manque">
   <div className="text-slate-400">Pour activer le bouton :</div>
   <div className={effectives.length?"text-emerald-400":"text-amber-300"}>{effectives.length?"✓":"○"} cocher au moins une catégorie à vider</div>
   <div className={sauvegarde?"text-emerald-400":"text-amber-300"}>{sauvegarde?"✓":"○"} cocher « J'ai fait et vérifié une sauvegarde »</div>
   <div className={phraseOk?"text-emerald-400":"text-amber-300"}>{phraseOk?"✓":"○"} taper {PHRASE_REINITIALISATION} dans le champ{phrase && !phraseOk?" (texte saisi incorrect)":""}</div>
  </div>}
  <div className="flex justify-end mt-3"><Btn cls={pret?"bg-rose-700 hover:bg-rose-600 text-white":"bg-slate-700 text-slate-500 cursor-not-allowed"} onClick={lancer}>{etat.envoi?"Remise à zéro en cours…":"Vider les données"}</Btn></div>
 </Card>);
}

// Profils (organigramme) : les profils de base sont fixes ; le super administrateur crée les siens en combinant des
// capacités. Le serveur applique les mêmes règles (profils-core.js) à chaque enregistrement.
const CAPACITES=[
 ["cloture","Clôture les OT"],["creerOT","Crée / génère des OT"],["diSeulement","DI seulement (modifiables tant qu'elles sont « À transmettre »)"],
 ["saisieSeule","Remplit les OT sans les créer ni les clôturer"],["valide","Validation DG (ne modifie que la validation)"],["lectureSeule","Consultation seulement"],
 ["toutesUnites","Toutes les unités (proposé à la création du compte)"],["tousSystemes","Tous les systèmes"],["delegationComptes","Peut recevoir la main sur les comptes de son unité"],["delegable","Attribuable par un administrateur UO"],
 ["supprimerRapports","Peut supprimer les rapports d'activité (main donnée par le super administrateur)"],
];
const ROLES_RAPPORTS=[["","Aucun"],["uo","Prépare et envoie (UO)"],["expert","Revoit (expert DG)"],["responsable","Valide et clôture (responsable DG)"],["lecture","Consulte"]];
const resumeNiveaux=(n)=>!Array.isArray(n)?"DI : tous niveaux":n.length===0?"DI : aucun niveau":"DI : "+NIVEAUX_DI.filter(([k])=>n.includes(k)).map(([,l])=>l.toLowerCase()).join(", ");
// Niveaux de l'arborescence (système → sous-sous-équipement) où le profil peut créer des DI
function ChoixNiveauxDI({valeur,onChange}){
 const tous=!Array.isArray(valeur); const n=tous?CLES_NIVEAUX_DI:valeur;
 return <div data-testid="niveaux-di"><div className="text-sm font-semibold text-slate-200 mb-1">Création des DI — niveaux de l'arborescence autorisés</div>
  <div className="text-[11px] text-slate-500 mb-1">Le profil ne pourra créer une DI que sur les nœuds de ces niveaux (le serveur refuse les autres).</div>
  <div className="space-y-1">{NIVEAUX_DI.map(([k,l],i)=><div key={k} style={{paddingLeft:i*14}}><Chk checked={n.includes(k)} onChange={()=>onChange(CLES_NIVEAUX_DI.filter(x=>x===k?!n.includes(k):n.includes(x)))}>{i>0?"└ ":""}{l}</Chk></div>)}</div>
  <div className="flex gap-3 mt-1 text-xs"><button type="button" className="underline text-slate-400" onClick={()=>onChange(undefined)}>Tous les niveaux</button><button type="button" className="underline text-slate-400" onClick={()=>onChange([])}>Aucun</button>{tous&&<span className="text-slate-500">(actuellement : tous)</span>}</div>
 </div>;
}
// Actions permises par module : le super administrateur décide, profil par profil, qui crée, modifie ou supprime.
// Absent (ou tout coché) = toutes les actions. Le serveur refuse les autres (profils-core.js, controleProfil).
function ChoixActions({volets,valeur,onChange}){
 const mods=VOLETS_ACTIONS.filter(v=>volets.includes(v));
 const a=(v)=>valeur&&valeur[v]?valeur[v]:CLES_ACTIONS;
 const basculer=(v,op)=>{const cur=a(v); const l=cur.includes(op)?cur.filter(x=>x!==op):[...cur,op]; onChange(normaliserActions({...(valeur||{}),[v]:l}));};
 const ligne=(v,l)=>onChange(normaliserActions({...(valeur||{}),[v]:l}));
 if(!mods.length) return null;
 return <div data-testid="actions-profil"><div className="text-sm font-semibold text-slate-200 mb-1">Droits par module — créer, modifier, supprimer</div>
  <div className="text-[11px] text-slate-500 mb-1">Décochez ce que ce profil ne doit pas faire. Le réglage s'applique tout de suite à tous les comptes de ce profil ; le serveur refuse l'action interdite.</div>
  <table className="w-full text-sm"><thead><tr className="text-xs text-slate-400 text-left"><th className="py-1 font-medium">Module</th>{ACTIONS.map(([k,l])=><th key={k} className="py-1 font-medium text-center w-24">{l}</th>)}<th/></tr></thead>
   <tbody>{mods.map(v=><tr key={v} className="border-t border-slate-800">
    <td className="py-1 text-slate-300">{VOLETS[v]}</td>
    {ACTIONS.map(([k,l])=><td key={k} className="text-center"><input type="checkbox" aria-label={l+" — "+VOLETS[v]} checked={a(v).includes(k)} onChange={()=>basculer(v,k)}/></td>)}
    <td className="text-right text-xs whitespace-nowrap"><button type="button" className="underline text-slate-400 mr-2" onClick={()=>ligne(v,CLES_ACTIONS)}>Tout</button><button type="button" className="underline text-slate-400" onClick={()=>ligne(v,[])}>Lecture seule</button></td>
   </tr>)}</tbody></table>
  <div className="text-[11px] text-slate-500 mt-1">Ajouter ou retirer un sous-équipement, un sous-système ou une ligne d'une fiche compte comme une modification de l'élément parent. Les règles propres au profil (DI seulement, technicien sans clôture, validation DG…) restent appliquées en plus.</div>
 </div>;
}
const resumeActions=(act)=>{const r=Object.entries(act||{}).map(([v,l])=>(VOLETS[v]||"").split(" (")[0]+(l.length?" : "+ACTIONS.filter(([k])=>l.includes(k)).map(([,x])=>x.toLowerCase()).join("/")+" seulement":" : lecture seule")); return r.length?"restrictions — "+r.join(", "):"";};
// Modules (volets) d'un profil de base : ceux d'origine sont fixes (cochés, grisés), on peut en ajouter
function ChoixModulesBase({base,valeur,onChange}){
 return <div data-testid="modules-base"><div className="text-sm font-semibold text-slate-200 mb-1">Modules accessibles</div>
  <div className="text-[11px] text-slate-500 mb-1">Les modules d'origine du profil restent toujours accessibles ; cochez ceux à ajouter (ex. Arborescence pour Exploitation). Le profil le voit alors en consultation seulement s'il ne peut pas modifier.</div>
  <div className="grid sm:grid-cols-2 gap-x-3 gap-y-1">{VOLETS.map((v,i)=>{const origine=base.volets.includes(i); return <Chk key={i} checked={origine||valeur.includes(i)} disabled={origine} onChange={()=>onChange(valeur.includes(i)?valeur.filter(x=>x!==i):[...valeur,i].sort())}>{v}{origine?" (d'origine)":""}</Chk>;})}</div>
  <div className="text-[11px] text-slate-500 mt-1">À l'enregistrement, les modules ajoutés sont donnés automatiquement à tous les comptes de ce profil, sur chacune de leurs unités (vous pouvez ensuite en retirer compte par compte).</div>
 </div>;
}
const resumeProfil=(p)=>[p.volets.map(v=>VOLETS[v]?.split(" (")[0]).filter(Boolean).join(", "),...CAPACITES.filter(([k])=>k==="creerOT"?p.creerOT===false:p[k]).map(([k,l])=>k==="creerOT"?"ne crée pas d'OT":l.split(" (")[0].toLowerCase()),p.rapports?"rapports : "+(ROLES_RAPPORTS.find(r=>r[0]===p.rapports)||[])[1]:"",(p.volets||[]).includes(1)||p.diSeulement?resumeNiveaux(p.niveauxDI):"",resumeActions(p.actions)].filter(Boolean).join(" · ");
export function EditeurProfils({profilsPerso,setProfilsPerso}){
 const [sel,setSel]=useState(null); const [msg,setMsg]=useState(""); const [comptes,setComptes]=useState([]);
 useEffect(()=>{api.users().then(r=>setComptes(r.users||[])).catch(()=>{});},[]);
 const base=Object.entries(PROFILS);
 // profils personnalisés ; les réglages des profils de base sont rangés dans la même collection (même nom, surcharge)
 const perso=profilsPerso.filter(p=>!PROFILS[p.nom]);
 const surcharge=(nom)=>profilsPerso.find(p=>p.nom===nom);
 const [baseSel,setBaseSel]=useState(null);
 const enregistrerBase=()=>{const {nom,niveauxDI,volets,supprimerRapports}=baseSel; const actions=normaliserActions(baseSel.actions); const origine=PROFILS[nom].volets; const plus=(volets||[]).filter(v=>!origine.includes(v)); setProfilsPerso(l=>{const r=l.filter(p=>p.nom!==nom); return Array.isArray(niveauxDI)||plus.length||actions||supprimerRapports?[...r,{nom,surcharge:true,...(supprimerRapports?{supprimerRapports:true}:{}),...(Array.isArray(niveauxDI)?{niveauxDI}:{}),...(plus.length?{volets:[...new Set([...origine,...plus])].sort()}:{}),...(actions?{actions}:{})}]:r;}); setBaseSel(null);};
  const modulesPlus=(nom)=>(surcharge(nom)?.volets||[]).filter(v=>!PROFILS[nom].volets.includes(v));
 const nouveau=()=>{setSel({_new:true,nom:"",libelle:"",volets:[],creerOT:true});setMsg("");};
 const enregistrer=()=>{
  const nom=String(sel.nom||"").trim();
  if(nom.length<3) return setMsg("Nom du profil : 3 caractères minimum.");
  if(sel._new&&catalogue()[nom]) return setMsg("Ce nom de profil existe déjà.");
  const {_new,...d}=sel; void _new;
  const data={...d,nom};
  setProfilsPerso(l=>sel._new?[...l,data]:l.map(p=>p.nom===nom?data:p)); setSel(null); setMsg("");
 };
 const utilisateurs=(nom)=>comptes.filter(u=>nomProfil(u.role)===nom).length;
 const supprimer=()=>{const n=utilisateurs(sel.nom); if(n){setMsg(n+" compte(s) utilisent ce profil : changez-leur d'abord de profil.");return;} if(window.confirm("Supprimer le profil « "+sel.nom+" » ?")){setProfilsPerso(l=>l.filter(p=>p.nom!==sel.nom));setSel(null);}};
 const bascule=(k)=>setSel(s=>({...s,[k]:k==="creerOT"?s.creerOT===false:!s[k]}));
 return <div className="grid md:grid-cols-3 gap-4" data-testid="editeur-profils">
  <div className="space-y-2">
   <Btn onClick={nouveau}>+ Nouveau profil</Btn>
   {perso.map(p=><Card key={p.nom} cls={"cursor-pointer "+(sel&&sel.nom===p.nom&&!sel._new?"border-sky-500":"")}><div onClick={()=>{setSel({...p,volets:[...(p.volets||[])]});setBaseSel(null);setMsg("");}}>
    <b className="text-slate-100 text-sm">{p.nom}</b> <span className="text-xs text-sky-400">personnalisé</span><div className="text-xs text-slate-400 mt-1">{resumeProfil({volets:[],...p})}</div><div className="text-xs text-slate-500">{utilisateurs(p.nom)} compte(s)</div></div></Card>)}
   <div className="text-xs text-slate-400 font-medium mt-3">Profils de base (fixes)</div>
   {base.map(([n,p])=><Card key={n} cls={"cursor-pointer "+(baseSel&&baseSel.nom===n?"border-sky-500":"")}><div onClick={()=>{setBaseSel({nom:n,niveauxDI:surcharge(n)?.niveauxDI,actions:surcharge(n)?.actions,supprimerRapports:!!surcharge(n)?.supprimerRapports,volets:[...new Set([...p.volets,...(surcharge(n)?.volets||[])])].sort()});setSel(null);setMsg("");}}><b className="text-slate-200 text-sm">{n}</b><div className="text-xs text-slate-500 mt-1">{p.libelle}</div>{(p.volets.includes(1)||p.diSeulement)&&<div className="text-xs text-sky-400/80 mt-1">{resumeNiveaux(surcharge(n)?.niveauxDI)}</div>}{modulesPlus(n).length>0&&<div className="text-xs text-emerald-400/80 mt-1">+ modules : {modulesPlus(n).map(v=>VOLETS[v].split(" (")[0]).join(", ")}</div>}{surcharge(n)?.actions&&<div className="text-xs text-amber-300/80 mt-1">{resumeActions(surcharge(n).actions)}</div>}</div></Card>)}
  </div>
  <div className="md:col-span-2">{baseSel&&!sel?<Card cls="space-y-3">
    <div className="text-sm text-slate-200"><b>{baseSel.nom}</b> <span className="text-xs text-slate-500">profil de base — vous pouvez lui ajouter des modules, régler les niveaux de DI et ce qu'il peut créer, modifier ou supprimer</span></div>
    <ChoixModulesBase base={PROFILS[baseSel.nom]} valeur={baseSel.volets||[]} onChange={v=>setBaseSel(b=>({...b,volets:v}))}/>
    <ChoixNiveauxDI valeur={baseSel.niveauxDI} onChange={v=>setBaseSel(b=>({...b,niveauxDI:v}))}/>
    <ChoixActions volets={baseSel.volets||[]} valeur={baseSel.actions} onChange={v=>setBaseSel(b=>({...b,actions:v}))}/>
    {(baseSel.volets||[]).includes(7)&&<Chk checked={!!baseSel.supprimerRapports} onChange={()=>setBaseSel(b=>({...b,supprimerRapports:!b.supprimerRapports}))}>Peut supprimer les rapports d'activité (main donnée par le super administrateur)</Chk>}
    <div className="flex gap-2 justify-end"><Btn cls="bg-slate-700 hover:bg-slate-600" onClick={()=>setBaseSel(null)}>Annuler</Btn><Btn onClick={enregistrerBase}>Enregistrer</Btn></div>
   </Card>:!sel?<Card><div className="text-sm text-slate-400">Créez un profil pour suivre l'organigramme de la société (ex. « Coordinateur méthodes », « Chef de district »). Il combine des modules et des capacités ; il apparaît ensuite dans la liste des profils des comptes.</div></Card>:
   <Card cls="space-y-3">
    <div className="grid sm:grid-cols-2 gap-3">
     <Field label="Nom du profil"><Inp aria-label="Nom du profil" value={sel.nom} disabled={!sel._new} onChange={e=>setSel({...sel,nom:e.target.value})}/></Field>
     <Field label="Description"><Inp aria-label="Description du profil" value={sel.libelle||""} onChange={e=>setSel({...sel,libelle:e.target.value})}/></Field>
    </div>
    <div><div className="text-sm font-semibold text-slate-200 mb-1">Modules</div>
     <div className="grid sm:grid-cols-2 gap-x-3 gap-y-1">{VOLETS.map((v,i)=><Chk key={i} checked={sel.volets.includes(i)} onChange={()=>setSel(s=>({...s,volets:s.volets.includes(i)?s.volets.filter(x=>x!==i):[...s.volets,i].sort()}))}>{v}</Chk>)}</div></div>
    <div><div className="text-sm font-semibold text-slate-200 mb-1">Capacités</div>
     <div className="space-y-1">{CAPACITES.map(([k,l])=><Chk key={k} checked={k==="creerOT"?sel.creerOT!==false:!!sel[k]} onChange={()=>bascule(k)}>{l}</Chk>)}</div></div>
    <ChoixActions volets={sel.volets} valeur={sel.actions} onChange={v=>setSel(s=>({...s,actions:v}))}/>
    <ChoixNiveauxDI valeur={sel.niveauxDI} onChange={v=>setSel(s=>({...s,niveauxDI:v}))}/>
    <Field label="Rôle dans les rapports d'activité"><select aria-label="Rôle rapports" value={sel.rapports||""} onChange={e=>setSel({...sel,rapports:e.target.value||undefined})} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm mt-1">{ROLES_RAPPORTS.map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></Field>
    {msg&&<div className="text-sm text-rose-100 bg-rose-900/60 border border-rose-500 rounded-lg px-3 py-2">⚠ {msg}</div>}
    <div className="flex gap-2 justify-end">
     {!sel._new&&<Btn cls="bg-rose-700 hover:bg-rose-600 text-white" onClick={supprimer}>Supprimer</Btn>}
     <Btn cls="bg-slate-700 hover:bg-slate-600" onClick={()=>{setSel(null);setMsg("");}}>Annuler</Btn>
     <Btn onClick={enregistrer}>Enregistrer le profil</Btn>
    </div>
   </Card>}</div>
 </div>;
}
