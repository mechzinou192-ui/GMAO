// Écrans de connexion, de chargement et de changement de mot de passe.
import React,{useState,useEffect} from "react";
import {api} from "../api.js";
import {XL_LOGO} from "../excel.js";

export function Splash({msg,action,actionLabel}){
 return <div style={{minHeight:"100vh",display:"grid",placeItems:"center",background:"#F4F6FA",fontFamily:"Montserrat,'Segoe UI',system-ui,sans-serif"}}>
  <div style={{textAlign:"center",color:"#334155"}}><img src={XL_LOGO} alt="SETRAM" style={{width:180,height:"auto",marginBottom:14}}/>
   <div style={{fontSize:15}}>{msg}</div>
   {action&&<button onClick={action} style={{marginTop:16,height:42,padding:"0 22px",border:0,borderRadius:8,background:"#2A3B90",color:"#fff",fontSize:14,cursor:"pointer"}}>{actionLabel}</button>}
  </div></div>;
}

export function LoginPage({onLogin}){
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
 const compte=demo?demo.comptes.find(c=>c.id===id):null;
 return <div className="gm-login">
  <section className="gm-login-hero">
   <div className="gm-login-brand"><img src={XL_LOGO} alt="SETRAM"/></div>
   <div className="gm-login-pitch">
    <div className="gm-login-kicker">GMAO · Réseau tramway</div>
    <h1>Gestion de la maintenance assistée par ordinateur</h1>
    <p>Patrimoine technique, demandes d'intervention, ordres de travail, préventif, magasin et indicateurs de fiabilité des 7 unités opérationnelles.</p>
    <ul><li>Arborescence technique par unité</li><li>DI → OT → clôture, traçabilité complète</li><li>MTBF · MTTR · disponibilité</li></ul>
   </div>
   <div className="gm-login-legal">© SETRAM SPA — usage interne</div>
  </section>
  <section className="gm-login-panel">
   <div className="gm-login-box">
    <img className="gm-login-logo-sm" src={XL_LOGO} alt="SETRAM"/>
    <h2>Connexion à votre compte</h2>
    <div className="gm-login-sub">Accédez à votre espace GMAO SETRAM</div>
    {demo && <div data-testid="bandeau-demo" className="gm-demo">
     <b>Version de démonstration</b> — {demo.statique?"toutes les données sont fictives et restent dans votre navigateur : elles disparaissent quand vous fermez l'onglet.":"toutes les données sont fictives et remises à zéro"+(demo.resetHeures>0?" toutes les "+demo.resetHeures+" h":" régulièrement")+"."} Choisissez un profil pour essayer l'application :
     <div className="gm-demo-list">{demo.comptes.map(c=><button key={c.id} onClick={()=>{setId(c.id);setPw(c.motDePasse);setErr("");}} title={c.description} className={id===c.id?"is-active":""}>{c.nom.replace("Démo — ","")}</button>)}</div>
     {compte&&compte.description && <div className="gm-demo-desc">{compte.description}</div>}
    </div>}
    <label className="gm-field">Identifiant<input value={id} onChange={e=>{setId(e.target.value);setErr("");}} onKeyDown={kd} autoFocus autoComplete="username"/></label>
    <label className="gm-field">Mot de passe<input type="password" value={pw} onChange={e=>{setPw(e.target.value);setErr("");}} onKeyDown={kd} autoComplete="current-password"/></label>
    <label className="gm-check"><input type="checkbox" checked={rem} onChange={e=>setRem(e.target.checked)}/>Se souvenir de moi</label>
    {err&&<div className="gm-err">{err}</div>}
    <button className="gm-btn-primary" onClick={submit} disabled={busy}>{busy?"Connexion…":"Se connecter"}</button>
   </div>
  </section>
 </div>;
}


export function ChangePwPage({me,onDone,onLogout}){
  const [cur,setCur]=useState(""); const [n1,setN1]=useState(""); const [n2,setN2]=useState(""); const [err,setErr]=useState(""); const [busy,setBusy]=useState(false);
  const submit=async()=>{
   if(n1!==n2) return setErr("Les deux nouveaux mots de passe ne correspondent pas.");
   setBusy(true); setErr("");
   try{ const r=await api.changePassword(cur,n1); onDone(r.user); }
   catch(e){ setErr(e.message); } finally{ setBusy(false); }
  };
  const inp={width:"100%",height:46,border:"1px solid #e5e7eb",borderRadius:8,padding:"0 14px",fontSize:15,color:"#374151",background:"#fff",boxSizing:"border-box",outline:"none",marginTop:6};
  const lab={display:"block",fontSize:14,color:"#374151",fontWeight:500,marginTop:16};
  return <div style={{minHeight:"100vh",background:"#F4F6FA",fontFamily:"Montserrat,'Segoe UI',system-ui,sans-serif",display:"grid",placeItems:"center",padding:16}}>
   <div style={{width:"100%",maxWidth:460,background:"#fff",border:"1px solid #e5e7eb",borderTop:"4px solid #2DC3EA",borderRadius:12,padding:"32px 30px",boxShadow:"0 4px 14px rgba(15,36,71,.06)"}}>
    <h2 style={{margin:0,fontSize:20,color:"#141B3D"}}>Choisissez un nouveau mot de passe</h2>
    <p style={{fontSize:13,color:"#64748b",margin:"8px 0 0"}}>Bonjour {me.nom}. Pour votre sécurité, vous devez remplacer le mot de passe provisoire avant de continuer. Minimum 10 caractères, avec au moins une lettre et un chiffre.</p>
    <label style={lab}>Mot de passe actuel<input style={inp} type="password" value={cur} onChange={e=>setCur(e.target.value)} autoComplete="current-password" autoFocus/></label>
    <label style={lab}>Nouveau mot de passe<input style={inp} type="password" value={n1} onChange={e=>setN1(e.target.value)} autoComplete="new-password"/></label>
    <label style={lab}>Confirmer le nouveau mot de passe<input style={inp} type="password" value={n2} onChange={e=>setN2(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")submit();}} autoComplete="new-password"/></label>
    {err&&<div style={{marginTop:14,fontSize:13,color:"#be123c",background:"#fff1f2",border:"1px solid #fecdd3",borderRadius:8,padding:"8px 12px"}}>{err}</div>}
    <button onClick={submit} disabled={busy} style={{marginTop:22,width:"100%",height:46,border:0,borderRadius:8,background:"#2A3B90",color:"#fff",fontSize:15,fontWeight:500,cursor:"pointer",opacity:busy?.7:1}}>{busy?"Enregistrement…":"Enregistrer et continuer"}</button>
    <button onClick={onLogout} style={{marginTop:10,width:"100%",height:40,border:0,background:"none",color:"#64748b",fontSize:13,cursor:"pointer",textDecoration:"underline"}}>Se déconnecter</button>
   </div></div>;
}
