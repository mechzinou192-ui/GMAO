// Gestion de la maintenance corrective : demandes d'intervention (DI) et OT correctifs.
import React,{useState} from "react";
import {SubTabs} from "../ui/base.jsx";
import {DIPage} from "./DemandesIntervention.jsx";
import {BTPage} from "./OrdresTravail.jsx";

export function MaintenanceCorrective({voirDI,voirOT,dis,bts,pieces,onNewDI,onOpenDI,onGenererBT,onOpenBT}){
 const vues=[voirDI&&["di","Demandes d'intervention (DI)"],voirOT&&["ot","OT correctifs"]].filter(Boolean);
 const [vueRaw,setVue]=useState(vues[0]?vues[0][0]:"di");
 const vue=vues.some(v=>v[0]===vueRaw)?vueRaw:(vues[0]||["di"])[0];
 return (<div className="space-y-4">
  {vues.length>1 && <SubTabs value={vue} onChange={setVue} items={vues}/>}
  {vue==="di" && <DIPage dis={dis} bts={bts} onNewDI={onNewDI} onOpenDI={onOpenDI} onGenererBT={onGenererBT}/>}
  {vue==="ot" && <BTPage bts={bts} pieces={pieces} titre="OT correctifs" sousTitre="Générés depuis les DI — cliquez sur une ligne pour saisir le compte-rendu puis clôturer" onOpenBT={onOpenBT}/>}
 </div>);
}
