// Point d'entrée : session, connexion, changement de mot de passe obligatoire.
import React,{useState,useEffect} from "react";
import {GmaoApp} from "./GmaoApp.jsx";
import {api} from "./api.js";
import {ChangePwPage,LoginPage,Splash} from "./pages/Connexion.jsx";
import {flushAll,hasPending} from "./sync.js";

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
