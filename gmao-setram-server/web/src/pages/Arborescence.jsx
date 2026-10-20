// Arborescence technique, appareils de mesure, contrôles réglementaires, organismes.
import React,{useState} from "react";
import {ORG_DOM} from "../constantes.js";
import {MAX_ETIQUETTES,imprimerEtiquettes} from "../etiquettes.js";
import {exporterXlsx} from "../excel.js";
import {expStatus} from "../lib/echeances.js";
import {UNIT_ABBR} from "../lib/unites.js";
import {Btn,Card,ExportBtn,Field,Inp,SubTabs,fmtFourn} from "../ui/base.jsx";
import {I} from "../ui/icones.jsx";

export function Arbo({mode="arbo",unit,equipements,systemsList,treeStruct,onAddEquip,onCreateDI,onOpenEquip,onEditSystem,onEditSubSystem,onAddSystem,onAddSubSystem,onAddSousEquip,onOpenSousEquip,onRemoveSousEquip,mesureList,onAddMesure,onEditMesure,ctrlList,onAddCtrl,onEditCtrl,organismes,onAddOrg,onEditOrg}){
 const [openSys,setOpenSys]=useState(null);
 const [openSub,setOpenSub]=useState(null);
 const [openEq,setOpenEq]=useState(null);
 const [tab,setTab]=useState(mode==="arbo"?"arbo":"mesure");
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
  {mode!=="arbo" && <SubTabs value={tab} onChange={setTab} items={[["mesure","Appareils de mesure"],["ctrl","Contrôles réglementaires"],["org","Organismes"]]}/>}
  <div className="flex flex-wrap gap-2 justify-end">
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

export function EquipForm({modal,count,onSubmit}){
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

export function SousEquipForm({modal,count,onSubmit}){
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

export function SystemForm({modal,onSubmit}){
 const [code,setCode]=useState(modal.code||"");
 const [nom,setNom]=useState(modal.nom||"");
 return (<div>
  <Field label="Code du système"><Inp value={code} onChange={e=>setCode(e.target.value)} disabled={modal.mode==="edit"} className={modal.mode==="edit"?"opacity-60":""} placeholder="ex: PSY"/></Field>
  <Field label="Nom du système"><Inp value={nom} onChange={e=>setNom(e.target.value)} placeholder="ex: Portes Sécurisées"/></Field>
  <div className="flex justify-end mt-3"><Btn onClick={()=>onSubmit({mode:modal.mode,code,nom})}>{modal.mode==="edit"?"Enregistrer":"Créer le système"}</Btn></div>
 </div>);
}

export function SubSystemForm({modal,onSubmit}){
 const [code,setCode]=useState(modal.code||"");
 const [nom,setNom]=useState(modal.nom||"");
 return (<div>
  <Field label="Code du sous-système"><Inp value={code} onChange={e=>setCode(e.target.value)} disabled={modal.mode==="edit"} className={modal.mode==="edit"?"opacity-60":""} placeholder="ex: SLT"/></Field>
  <Field label="Nom du sous-système"><Inp value={nom} onChange={e=>setNom(e.target.value)} placeholder="ex: Salle Technique"/></Field>
  <div className="flex justify-end mt-3"><Btn onClick={()=>onSubmit({mode:modal.mode,systemCode:modal.systemCode,code,nom})}>{modal.mode==="edit"?"Enregistrer":"Créer le sous-système"}</Btn></div>
 </div>);
}

export function MesureForm({modal,count,organismes,onSubmit}){
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

export function CtrlForm({modal,list,organismes,equipements,onSubmit}){
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

export function OrgForm({modal,list,onSubmit}){
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
