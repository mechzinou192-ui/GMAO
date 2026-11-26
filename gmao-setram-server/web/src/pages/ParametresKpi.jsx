// Seuils paramétrables des indicateurs et de l'AMDEC (Indicateurs › Référentiel) : visibles par tous, modifiables par le super administrateur.
import React,{useState,useEffect} from "react";
import {Btn,Card,Inp} from "../ui/base.jsx";
import {KPI_PARAMS_DEFAUT,kpiPctTxt,kpiSciTxt} from "../lib/kpi.js";
import {KPI_CIBLES_UNITE,KPI_PARAMS_CHAMPS,KPI_PARAMS_PROPOSES,KPI_UNITES,unitesGroupe,paramDepuisSaisie,paramEcrire,paramLireValeur,paramVersSaisie,paramsClone,paramsValider} from "../lib/parametres.js";

const fmt=(c,v)=>c.type==="pct"?kpiPctTxt(v):c.type==="taux"?kpiSciTxt(v)+" /h":c.type==="pctSeuil"?String(v).replace(".",",")+" %":c.type==="min"?v+" min":String(v).replace(".",",");
const egal=(a,b)=>Math.abs(a-b)<1e-12;
const Th=({children})=><th className="py-1.5 pr-3 font-medium">{children}</th>;

export function ParametresKpi({valeurs,estSuper=false,onSave,meta}){
 const [draft,setDraft]=useState(()=>paramsClone(valeurs)), [txt,setTxt]=useState({}), [erreurs,setErreurs]=useState([]), [msg,setMsg]=useState("");
 const cle=JSON.stringify(valeurs);
 useEffect(()=>{setDraft(paramsClone(valeurs)); setTxt({}); setTxtU({});},[cle]);   // eslint-disable-line
 const [txtU,setTxtU]=useState({});
 const peutModifier=estSuper&&!!onSave;
 // cible propre à une unité : valeur vide = on retombe sur la cible du groupe
 const majUnite=(u,c,v)=>setDraft(d=>{const n=JSON.parse(JSON.stringify(d)); n.unites=n.unites||{}; const o={...(n.unites[u]||{})}; if(v===null) delete o[c.id]; else o[c.id]=v; if(Object.keys(o).length) n.unites[u]=o; else delete n.unites[u]; return n;});
 const saisirUnite=(u,c,v)=>{setTxtU(t=>({...t,[u+"|"+c.id]:v})); setMsg(""); if(v==="") majUnite(u,c,null); else if(!isNaN(Number(v))) majUnite(u,c,paramDepuisSaisie(c,v));};
 const effacerUnite=(u)=>{setDraft(d=>{const n=JSON.parse(JSON.stringify(d)); if(n.unites) delete n.unites[u]; return n;}); setTxtU(t=>Object.fromEntries(Object.entries(t).filter(([k])=>!k.startsWith(u+"|")))); setMsg("");};
 const valUnite=(d,u,c)=>{const o=(d.unites||{})[u]; return o&&o[c.id]!==undefined?o[c.id]:d.objectifs[unitesGroupe(u)][c.id];};
 const maj=(c,x)=>{setDraft(d=>paramEcrire(d,c,x)); setTxt(t=>{const n={...t}; delete n[c.id]; return n;}); setMsg("");};
 const saisir=(c,v)=>{setTxt(t=>({...t,[c.id]:v})); setMsg(""); if(v!==""&&!isNaN(Number(v))) setDraft(d=>paramEcrire(d,c,paramDepuisSaisie(c,v)));};
 const tousPropose=()=>{setDraft(paramsClone(KPI_PARAMS_PROPOSES)); setTxt({}); setTxtU({}); setErreurs([]); setMsg("");};
 const tousDefaut=()=>{setDraft(paramsClone(KPI_PARAMS_DEFAUT)); setTxt({}); setTxtU({}); setErreurs([]); setMsg("");};
 const enregistrer=()=>{ const e=paramsValider(draft); setErreurs(e); if(e.length) return; onSave(draft); setMsg("Seuils enregistrés : ils s'appliquent à toutes les unités."); };
 const groupes=[...new Set(KPI_PARAMS_CHAMPS.map(c=>c.groupe))];
 const modifie=JSON.stringify(draft)!==JSON.stringify(paramsClone(valeurs));
 return <div data-testid="parametres-kpi"><Card>
  <div className="flex flex-wrap justify-between items-start gap-3 mb-2">
   <div><div className="font-semibold text-slate-100">Seuils paramétrables</div>
    <div className="text-xs text-slate-400 max-w-3xl">Cibles des indicateurs, échelles qualitatives des taux et échelles de l'AMDEC (gravité, probabilité, détectabilité). Ils s'appliquent à toutes les unités et à tous les écrans. {peutModifier?"Vous pouvez les modifier en tant que super administrateur.":"Seul le super administrateur peut les modifier."}{meta&&meta.modifiePar?" Dernière modification : "+meta.modifiePar+(meta.modifieLe?", le "+new Date(meta.modifieLe).toLocaleDateString("fr-FR"):"")+".":""}</div></div>
   {peutModifier&&<div className="flex flex-wrap gap-2">
    <Btn onClick={tousPropose} cls="bg-slate-700 hover:bg-slate-600">Appliquer les seuils proposés</Btn>
    <Btn onClick={tousDefaut} cls="bg-slate-700 hover:bg-slate-600">Valeurs par défaut</Btn>
    <Btn onClick={enregistrer} cls="bg-sky-600 hover:bg-sky-500">Enregistrer</Btn></div>}
  </div>
  {erreurs.length>0&&<ul role="alert" className="mb-2 rounded-lg border border-rose-700 bg-rose-900/30 p-2 text-xs text-rose-300 list-disc list-inside">{erreurs.map((e,i)=><li key={i}>{e}</li>)}</ul>}
  {msg&&<div role="status" className="mb-2 text-xs text-emerald-400">{msg}</div>}
  {peutModifier&&modifie&&<div className="mb-2 text-xs text-amber-400">Modifications non enregistrées.</div>}
  <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-slate-400 text-left"><Th>Paramètre</Th><Th>Valeur en vigueur</Th><Th>Par défaut</Th><Th>Proposé</Th><Th>Pourquoi cette proposition</Th></tr></thead>
   <tbody>{groupes.map(g=><React.Fragment key={g}>
    <tr><td colSpan={5} className="pt-3 pb-1 text-xs font-semibold text-sky-300">{g}</td></tr>
    {KPI_PARAMS_CHAMPS.filter(c=>c.groupe===g).map(c=>{const v=paramLireValeur(draft,c), diffProp=!egal(v,c.propose), diffDef=!egal(v,c.defaut);
     return <tr key={c.id} className="border-t border-slate-700 align-top">
      <td className="py-1.5 pr-3 text-slate-200">{c.lib}</td>
      <td className="pr-3 whitespace-nowrap">{peutModifier
        ?<div className="flex items-center gap-1"><Inp type="number" step="any" aria-label={c.lib} value={txt[c.id]!==undefined?txt[c.id]:paramVersSaisie(c,v)} onChange={e=>saisir(c,e.target.value)} style={{maxWidth:110}}/><span className="text-xs text-slate-400">{c.type==="pct"||c.type==="pctSeuil"?"%":c.type==="taux"?"/h":""}</span></div>
        :<span className="font-medium text-slate-100">{fmt(c,v)}</span>}{diffDef&&<span className="ml-2 text-xs text-amber-400">modifié</span>}</td>
      <td className="pr-3 text-xs text-slate-400 whitespace-nowrap">{fmt(c,c.defaut)}</td>
      <td className="pr-3 text-xs whitespace-nowrap"><span className={egal(c.propose,c.defaut)?"text-slate-400":"text-emerald-400 font-semibold"}>{fmt(c,c.propose)}</span>{peutModifier&&diffProp&&<button type="button" className="ml-2 text-sky-400 hover:underline" aria-label={"Utiliser le seuil proposé : "+c.lib} onClick={()=>maj(c,c.propose)}>utiliser</button>}</td>
      <td className="text-xs text-slate-400 max-w-md">{c.why}</td></tr>;})}
   </React.Fragment>)}</tbody></table></div>
  <div className="mt-6" data-testid="cibles-unites">
   <div className="font-semibold text-slate-100">Cibles par unité (wilaya)</div>
   <div className="text-xs text-slate-400 max-w-3xl mb-2">Chaque unité peut avoir sa propre cible. {peutModifier?"Laissez une case vide pour appliquer la cible du groupe (existantes ou nouvelles unités, réglée ci-dessus) : elle s'affiche alors en grisé.":"Les valeurs en grisé sont celles du groupe de l'unité."}</div>
   <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-slate-400 text-left"><Th>Cible</Th>{KPI_UNITES.map(u=><Th key={u}>{u}<div className="text-[10px] font-normal text-slate-500">{unitesGroupe(u)==="nouvelles"?"nouvelle unité":"unité existante"}</div></Th>)}</tr></thead>
   <tbody>{KPI_CIBLES_UNITE.map(c=><tr key={c.id} className="border-t border-slate-700 align-top"><td className="py-1.5 pr-3 text-slate-200">{c.lib}</td>
    {KPI_UNITES.map(u=>{const propre=((draft.unites||{})[u]||{})[c.id]!==undefined, v=valUnite(draft,u,c);
     return <td key={u} className="pr-2">{peutModifier
      ?<Inp type="number" step="any" aria-label={c.lib+" — "+u} placeholder={String(paramVersSaisie(c,draft.objectifs[unitesGroupe(u)][c.id]))} value={txtU[u+"|"+c.id]!==undefined?txtU[u+"|"+c.id]:(propre?paramVersSaisie(c,v):"")} onChange={e=>saisirUnite(u,c,e.target.value)} style={{maxWidth:96}}/>
      :<span className={propre?"font-medium text-slate-100":"text-slate-500"}>{fmt(c,v)}</span>}</td>;})}</tr>)}
    {peutModifier&&<tr className="border-t border-slate-700"><td className="py-1.5 text-xs text-slate-500">Revenir à la cible du groupe</td>{KPI_UNITES.map(u=><td key={u}>{((draft.unites||{})[u])?<button type="button" className="text-xs text-sky-400 hover:underline" aria-label={"Effacer les cibles propres de "+u} onClick={()=>effacerUnite(u)}>effacer</button>:<span className="text-xs text-slate-600">—</span>}</td>)}</tr>}
   </tbody></table></div>
  </div>
 </Card></div>;
}
