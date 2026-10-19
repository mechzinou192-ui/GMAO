// Administration : comptes, droits d'accès, import de données.
import React,{useState,useEffect,useRef} from "react";
import ImportDonnees from "../ImportDonnees.jsx";
import {api} from "../api.js";
import {KPI_ALL,KPI_BLOCS,KPI_VUES,ROLES,VOLETS} from "../constantes.js";
import {UNITS} from "../lib/unites.js";
import {Btn,Card,Chk,Field,Inp,SubTabs} from "../ui/base.jsx";

export function AdminPage({systemsList,me,importRefs}){
 const [vue,setVue]=useState("acces");
 return (<div>
  <div className="mb-4"><SubTabs value={vue} onChange={setVue} items={[["acces","Comptes et droits d'accès"],["import","Import de données (Excel)"]]}/></div>
  {vue==="acces" ? <AdminAcces systemsList={systemsList} me={me}/> : <ImportDonnees refs={importRefs}/>}
 </div>);
}

export function AdminAcces({systemsList,me}){
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
