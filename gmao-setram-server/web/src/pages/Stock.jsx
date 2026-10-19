// Gestion de stock : articles, achats, décharges, DS / BS / BR.
import React,{useState} from "react";
import {exporterXlsx} from "../excel.js";
import {Badge,Btn,Card,ExportBtn,Field,Inp,fmtFourn,ouiNon} from "../ui/base.jsx";
import {I} from "../ui/icones.jsx";

export function Magasin({pieces,dss,bsList,brs,decharges,onNewDS,onNewBR,onNewDecharge,onNewAchat,onTraiterBS,onGenererBS,onAnnulerDS,onOpenPiece,onAddPiece,onEditPiece}){
 const SECTIONS=[
  ["pieces","Pièces"],["consommables","Consommables"],["outillage","Outillage"],
  ["decharges","Décharges (Outillage / Consommables)"],["ds","Demandes de Sortie (DS) — Pièces"],["bs","Bons de Sortie (BS)"],["br","Bons de Retour (BR)"],
 ];
 const [section,setSection]=useState("pieces");
 const CAT={pieces:"Pièce",consommables:"Consommable",outillage:"Outillage"};
 const titre=SECTIONS.find(x=>x[0]===section)[1];
 const exportSection=()=>{
  const F={fichier:"Magasin_"+titre.split(" (")[0].split(" — ")[0]};
  if(CAT[section]) return exporterXlsx({...F,feuilles:[{nom:titre,titre:titre+" — Gestion de stock",
   colonnes:[{h:"Code"},{h:"Désignation"},{h:"Référence"},{h:"N° de série"},{h:"Prix unitaire (DA)",t:"num"},{h:"Stock",t:"num"},{h:"Seuil min",t:"num"},{h:"Seuil max",t:"num"},{h:"Sous le seuil min"},{h:"Valeur du stock (DA)",t:"num"},{h:"Constructeur"},{h:"Fournisseur 1"},{h:"Fournisseur 2"}],
   lignes:pieces.filter(p=>p.categorie===CAT[section]).map(p=>[p.code,p.nom,p.ref||"",p.serie||"",p.prix,p.stock,p.min,p.max,ouiNon(p.stock<p.min),p.prix*p.stock,(p.constructeur||{}).nom||"",fmtFourn([p.fourn1]),fmtFourn([p.fourn2])])}]});
  if(section==="decharges") return exporterXlsx({...F,feuilles:[{nom:"Décharges",titre:"Décharges (Outillage / Consommables)",
   colonnes:[{h:"Code"},{h:"Date",t:"date"},{h:"Code article"},{h:"Article"},{h:"Catégorie"},{h:"Quantité",t:"num"},{h:"Valeur (DA)",t:"num"},{h:"Reçu par"},{h:"OT lié"}],
   lignes:decharges.map(d=>[d.code,d.date,d.piece,d.pieceNom,d.categorie,d.qte,d.prix*d.qte,d.recu,d.bt||""])}]});
  if(section==="ds") return exporterXlsx({...F,feuilles:[{nom:"DS",titre:"Demandes de Sortie (DS) — Pièces",
   colonnes:[{h:"Code DS"},{h:"Code équipement"},{h:"Équipement"},{h:"Désignation",max:50},{h:"Article"},{h:"Quantité",t:"num"},{h:"Montant (DA)",t:"num"},{h:"OT lié"},{h:"État"},{h:"Motif d'annulation"}],
   lignes:dss.map(d=>[d.code,d.eq,d.nom,d.designation,d.pieceNom,d.qte,d.prix*d.qte,d.bt||"",d.etat,d.motif||""])}]});
  if(section==="bs") return exporterXlsx({...F,feuilles:[{nom:"BS",titre:"Bons de Sortie (BS)",
   colonnes:[{h:"Code BS"},{h:"DS liée"},{h:"Article"},{h:"Quantité",t:"num"},{h:"Montant (DA)",t:"num"},{h:"État"}],
   lignes:bsList.map(b=>[b.code,b.ds,b.pieceNom,b.qte,b.prix*b.qte,b.etat])}]});
  return exporterXlsx({...F,feuilles:[{nom:"BR",titre:"Bons de Retour (BR)",
   colonnes:[{h:"Code BR"},{h:"Article"},{h:"Quantité",t:"num"},{h:"Montant (DA)",t:"num"}],
   lignes:brs.map(b=>[b.code,b.pieceNom,b.qte,b.prix*b.qte])}]});
 };

 const Articles=({categorie})=>{
  const liste=pieces.filter(p=>p.categorie===categorie);
  return (<div className="overflow-x-auto"><table className="w-full text-sm">
   <thead><tr className="text-slate-400 text-left"><th className="py-1">Code</th><th>Désignation</th><th>Fournisseur 1</th><th>PU</th><th>Stock</th><th>Seuils</th></tr></thead>
   <tbody>{liste.length===0 && <tr><td colSpan="6" className="text-xs text-slate-500 py-2">Aucun article dans cette catégorie.</td></tr>}
   {liste.map(p=>{
    const under=p.stock<p.min;
    return (<tr key={p.code} onClick={()=>onOpenPiece(p)} className="border-t border-slate-700 cursor-pointer hover:bg-slate-700/40">
     <td className="py-1.5 text-sky-400">{p.code}</td><td>{p.nom}</td>
     <td className="text-xs text-slate-400">{p.fourn1.nom}<br/>{p.fourn1.tel}</td>
     <td>{p.prix.toLocaleString()} DA</td>
     <td className={under?"text-rose-400 font-semibold":""}>{p.stock}{under && <div className="flex items-center gap-1 text-rose-400 text-xs font-normal">{I.alert} Sous le seuil min</div>}</td>
     <td className="text-xs text-slate-400">min {p.min} / max {p.max}</td>
    </tr>);
   })}</tbody>
  </table></div>);
 };

 return (<div className="space-y-4">
  <Card>
   <div className="flex flex-wrap items-end justify-between gap-3">
    <div className="flex-1 min-w-[220px] max-w-sm">
     <div className="text-xs text-slate-400 mb-1">Rubrique</div>
     <select value={section} onChange={e=>setSection(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100">
      {SECTIONS.map(([k,l])=><option key={k} value={k}>{l}</option>)}
     </select>
    </div>
    <div className="flex gap-2">
     <ExportBtn onClick={exportSection}/>
     {CAT[section] && <Btn cls="bg-emerald-700 hover:bg-emerald-600" onClick={()=>onAddPiece(CAT[section])}><span className="flex items-center gap-1">{I.plus} Ajouter {section==="pieces"?"une pièce":section==="outillage"?"un outillage":"un consommable"}</span></Btn>}
     {CAT[section] && <Btn cls="bg-slate-700 hover:bg-slate-600" onClick={()=>onNewAchat("")}><span className="flex items-center gap-1">{I.plus} Nouvel achat</span></Btn>}
     {(section==="outillage"||section==="consommables"||section==="decharges") && <Btn cls="bg-amber-700 hover:bg-amber-600" onClick={()=>onNewDecharge("")}><span className="flex items-center gap-1">{I.plus} Nouvelle décharge</span></Btn>}
     {section==="ds" && <Btn onClick={onNewDS}><span className="flex items-center gap-1">{I.plus} Nouvelle DS</span></Btn>}
     {section==="br" && <Btn onClick={onNewBR}><span className="flex items-center gap-1">{I.plus} Nouveau BR</span></Btn>}
    </div>
   </div>
  </Card>

  <Card>
   <h2 className="font-semibold text-slate-100 mb-2">{titre}</h2>

   {CAT[section] && <Articles categorie={CAT[section]}/>}

   {section==="decharges" && <div className="overflow-x-auto"><table className="w-full text-sm">
    <thead><tr className="text-slate-400 text-left"><th className="py-1">Code</th><th>Date</th><th>Article</th><th>Catégorie</th><th>Qté</th><th>Valeur</th><th>Reçu par</th><th>OT lié</th></tr></thead>
    <tbody>{decharges.length===0 && <tr><td colSpan="8" className="text-xs text-slate-500 py-2">Aucune décharge pour le moment.</td></tr>}
    {decharges.map(d=><tr key={d.code} className="border-t border-slate-700">
     <td className="py-1.5">{d.code}</td><td className="text-xs text-slate-400">{d.date}</td><td>{d.pieceNom}</td><td className="text-xs text-slate-400">{d.categorie}</td>
     <td>{d.qte}</td><td>{(d.prix*d.qte).toLocaleString()} DA</td><td>{d.recu}</td><td className="text-xs text-slate-400">{d.bt||"—"}</td>
    </tr>)}</tbody>
   </table></div>}

   {section==="ds" && <div className="overflow-x-auto"><table className="w-full text-sm">
    <thead><tr className="text-slate-400 text-left"><th className="py-1">Code DS</th><th>Équipement</th><th>Désignation</th><th>Article</th><th>Qté</th><th>Prix</th><th>OT lié</th><th>État</th><th></th></tr></thead>
    <tbody>{dss.length===0 && <tr><td colSpan="9" className="text-xs text-slate-500 py-2">Aucune DS pour le moment.</td></tr>}
    {dss.map(d=><tr key={d.code} className="border-t border-slate-700 align-top">
     <td className="py-1.5">{d.code}</td><td>{d.eq}<br/><span className="text-xs text-slate-400">{d.nom}</span></td>
     <td className="text-xs text-slate-400 max-w-xs">{d.designation}</td><td>{d.pieceNom}</td>
     <td>{d.qte}</td><td>{(d.prix*d.qte).toLocaleString()} DA</td><td className="text-xs text-slate-400">{d.bt||"—"}</td>
     <td><Badge t={d.etat}/>{d.motif && <div className="text-xs text-slate-500 mt-0.5">Motif: {d.motif}</div>}</td>
     <td>{d.etat==="Transmis au Magasinier" && <div className="flex gap-1">
      <Btn cls="bg-emerald-600 hover:bg-emerald-500 text-xs" onClick={()=>onGenererBS(d.code)}>Générer BS</Btn>
      <Btn cls="bg-rose-700 hover:bg-rose-600 text-xs" onClick={()=>onAnnulerDS(d.code)}>Annuler</Btn>
     </div>}{d.bs && <div className="text-xs text-slate-500 mt-0.5">{d.bs}</div>}</td>
    </tr>)}</tbody>
   </table></div>}

   {section==="bs" && <div className="overflow-x-auto"><table className="w-full text-sm">
    <thead><tr className="text-slate-400 text-left"><th className="py-1">Code BS</th><th>DS liée</th><th>Article</th><th>Qté</th><th>Prix</th><th>État</th><th></th></tr></thead>
    <tbody>{bsList.length===0 && <tr><td colSpan="7" className="text-xs text-slate-500 py-2">Aucun BS pour le moment.</td></tr>}
    {bsList.map(b=><tr key={b.code} className="border-t border-slate-700">
     <td className="py-1.5">{b.code}</td><td className="text-xs text-slate-400">{b.ds}</td><td>{b.pieceNom}</td>
     <td>{b.qte}</td><td>{(b.prix*b.qte).toLocaleString()} DA</td><td><Badge t={b.etat}/></td>
     <td>{b.etat==="À traiter" && <Btn cls="bg-emerald-600 hover:bg-emerald-500 text-xs" onClick={()=>onTraiterBS(b.code)}>Traiter / Délivrer</Btn>}</td>
    </tr>)}</tbody>
   </table></div>}

   {section==="br" && <div className="overflow-x-auto"><table className="w-full text-sm">
    <thead><tr className="text-slate-400 text-left"><th className="py-1">Code BR</th><th>Article</th><th>Qté</th><th>Prix</th></tr></thead>
    <tbody>{brs.length===0 && <tr><td colSpan="4" className="text-xs text-slate-500 py-2">Aucun BR pour le moment.</td></tr>}
    {brs.map(b=><tr key={b.code} className="border-t border-slate-700">
     <td className="py-1.5">{b.code}</td><td>{b.pieceNom}</td><td>{b.qte}</td><td>{(b.prix*b.qte).toLocaleString()} DA</td>
    </tr>)}</tbody>
   </table></div>}

  </Card>
 </div>);
}

export function ArticleForm({mode,piece,categorie,onSubmit}){
 const isEdit=mode==="edit";
 const cat=isEdit?piece.categorie:categorie;
 const e0={nom:"",tel:"",email:""};
 const [f,setF]=useState(isEdit?{nom:piece.nom,ref:piece.ref,serie:piece.serie,prix:piece.prix,stock:piece.stock,min:piece.min,max:piece.max,constructeur:{...piece.constructeur},fourn1:{...piece.fourn1},fourn2:{...piece.fourn2}}
  :{nom:"",ref:"",serie:"",prix:0,stock:0,min:0,max:0,constructeur:{nom:"",contact:"",tel:"",email:""},fourn1:{...e0},fourn2:{...e0}});
 const [err,setErr]=useState("");
 const set=(k,v)=>setF(x=>({...x,[k]:v}));
 const setSub=(k,sk,v)=>setF(x=>({...x,[k]:{...x[k],[sk]:v}}));
 const num=(k)=><Inp type="number" min="0" value={f[k]} onChange={e=>set(k,Number(e.target.value))}/>;
 function valider(){
  if(!f.nom.trim()){setErr("Le nom / la désignation est obligatoire.");return;}
  if(f.max<f.min){setErr("Le seuil max doit être supérieur ou égal au seuil min.");return;}
  onSubmit({mode,code:isEdit?piece.code:null,data:{...f,nom:f.nom.trim(),categorie:cat}});
 }
 return (<div>
  <div className="text-xs text-slate-400">Catégorie : {cat}{isEdit && " — Code : "+piece.code}{!isEdit && " — le code sera généré automatiquement"}</div>
  <Field label="Nom / Désignation"><Inp value={f.nom} onChange={e=>set("nom",e.target.value)}/></Field>
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
   <Field label="Référence"><Inp value={f.ref} onChange={e=>set("ref",e.target.value)}/></Field>
   <Field label="N° de série"><Inp value={f.serie} onChange={e=>set("serie",e.target.value)}/></Field>
   <Field label="Prix unitaire (DA)">{num("prix")}</Field>
   <Field label="Stock actuel">{num("stock")}</Field>
   <Field label="Seuil min">{num("min")}</Field>
   <Field label="Seuil max">{num("max")}</Field>
  </div>
  <div className="text-xs text-slate-400 mt-3 font-medium">Constructeur</div>
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
   <Field label="Nom"><Inp value={f.constructeur.nom} onChange={e=>setSub("constructeur","nom",e.target.value)}/></Field>
   <Field label="Contact"><Inp value={f.constructeur.contact} onChange={e=>setSub("constructeur","contact",e.target.value)}/></Field>
   <Field label="Téléphone"><Inp value={f.constructeur.tel} onChange={e=>setSub("constructeur","tel",e.target.value)}/></Field>
   <Field label="Email"><Inp value={f.constructeur.email} onChange={e=>setSub("constructeur","email",e.target.value)}/></Field>
  </div>
  {["fourn1","fourn2"].map((k,i)=><div key={k}>
   <div className="text-xs text-slate-400 mt-3 font-medium">Fournisseur {i+1}{i===1&&" (optionnel)"}</div>
   <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
    <Field label="Nom"><Inp value={f[k].nom} onChange={e=>setSub(k,"nom",e.target.value)}/></Field>
    <Field label="Téléphone"><Inp value={f[k].tel} onChange={e=>setSub(k,"tel",e.target.value)}/></Field>
    <Field label="Email"><Inp value={f[k].email} onChange={e=>setSub(k,"email",e.target.value)}/></Field>
   </div>
  </div>)}
  {err && <div className="text-xs text-rose-400 text-right mt-2">{err}</div>}
  <div className="flex justify-end mt-3"><Btn onClick={valider}>{isEdit?"Enregistrer les modifications":"Ajouter"}</Btn></div>
 </div>);
}

export function AchatForm({pieces,prefill,onSubmit}){
 const [f,setF]=useState({piece:prefill||"",qte:1,prix:(pieces.find(x=>x.code===prefill)||{}).prix||0,date:new Date().toISOString().slice(0,10),ref:""});
 const [err,setErr]=useState("");
 const art=pieces.find(p=>p.code===f.piece);
 const selCls="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm mt-1";
 function choisir(code){const a=pieces.find(p=>p.code===code);setF({...f,piece:code,prix:a?a.prix:0});}
 return (<div>
  <Field label="Article (pièce / consommable / outillage)">
   <select value={f.piece} onChange={e=>choisir(e.target.value)} className={selCls}>
    <option value="">— Choisir un article —</option>
    {pieces.map(p=><option key={p.code} value={p.code}>{p.code} — {p.nom} ({p.categorie}, stock: {p.stock})</option>)}
   </select>
  </Field>
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
   <Field label="Quantité achetée"><Inp type="number" min="1" value={f.qte} onChange={e=>setF({...f,qte:Number(e.target.value)})}/></Field>
   <Field label="Prix unitaire (DA)"><Inp type="number" min="0" value={f.prix} onChange={e=>setF({...f,prix:Number(e.target.value)})}/></Field>
   <Field label="Date de l'achat"><input type="date" value={f.date} onChange={e=>setF({...f,date:e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-100 mt-1"/></Field>
   <Field label="N° facture / BL (optionnel)"><Inp value={f.ref} onChange={e=>setF({...f,ref:e.target.value})}/></Field>
  </div>
  <div className="text-xs text-slate-500 mt-2">La quantité est ajoutée au stock et un mouvement « Achat » est enregistré. Le prix unitaire de la fiche est mis à jour avec le prix saisi.</div>
  {err && <div className="text-xs text-rose-400 text-right mt-1">{err}</div>}
  <div className="flex justify-end mt-3"><Btn onClick={()=>{
   if(!f.piece){setErr("Choisissez un article.");return;}
   if(!(f.qte>0)){setErr("La quantité doit être supérieure à 0.");return;}
   onSubmit({...f,prix:f.prix||art.prix});
  }}>Enregistrer l'achat</Btn></div>
 </div>);
}

export function DechargeForm({pieces,inter,bts,prefill,onSubmit}){
 const [f,setF]=useState({piece:prefill||"",qte:1,recu:"",bt:"",date:new Date().toISOString().slice(0,10)});
 const [err,setErr]=useState("");
 const art=pieces.find(p=>p.code===f.piece);
 const selCls="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm mt-1";
 return (<div>
  <Field label="Article (outillage / consommable)">
   <select value={f.piece} onChange={e=>setF({...f,piece:e.target.value})} className={selCls}>
    <option value="">— Choisir un article —</option>
    {pieces.map(p=><option key={p.code} value={p.code}>{p.code} — {p.nom} ({p.categorie}, stock: {p.stock})</option>)}
   </select>
  </Field>
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
   <Field label={"Quantité"+(art?" (stock : "+art.stock+")":"")}><Inp type="number" min="1" value={f.qte} onChange={e=>setF({...f,qte:Number(e.target.value)})}/></Field>
   <Field label="Date"><input type="date" value={f.date} onChange={e=>setF({...f,date:e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-100 mt-1"/></Field>
  </div>
  <Field label="Reçu par (décharge signée)">
   <select value={f.recu} onChange={e=>setF({...f,recu:e.target.value})} className={selCls}>
    <option value="">— Choisir un intervenant —</option>
    {inter.map(i=><option key={i.mat} value={i.nom}>{i.nom} — {i.poste}</option>)}
   </select>
  </Field>
  <Field label="OT associé (optionnel)">
   <select value={f.bt} onChange={e=>setF({...f,bt:e.target.value})} className={selCls}>
    <option value="">—</option>{bts.map(b=><option key={b.code} value={b.code}>{b.code} — {b.nom}</option>)}
   </select>
  </Field>
  <div className="text-xs text-slate-500 mt-2">L'outillage et les consommables sortent par décharge : le stock est diminué immédiatement et un mouvement de sortie est enregistré (sans demande de sortie).</div>
  {err && <div className="text-xs text-rose-400 text-right mt-1">{err}</div>}
  <div className="flex justify-end mt-3"><Btn onClick={()=>{
   if(!f.piece){setErr("Choisissez un article.");return;}
   if(!f.recu){setErr("Choisissez la personne qui reçoit.");return;}
   if(!(f.qte>0)){setErr("La quantité doit être supérieure à 0.");return;}
   if(f.qte>art.stock){setErr("Stock insuffisant (disponible : "+art.stock+").");return;}
   onSubmit(f);
  }}>Enregistrer la décharge</Btn></div>
 </div>);
}

export function DSForm({pieces,bts,prefill,onSubmit}){
 const [f,setF]=useState({eq:prefill?.eq||"",nom:prefill?.nom||"",designation:"",piece:prefill?.piece||(pieces[0]||{}).code||"",qte:prefill?.qte||1,bt:prefill?.bt||""});
 return (<div>
  {prefill && <div className="text-xs text-sky-400 mb-2">Préremplie depuis l'OT {prefill.bt}</div>}
  <Field label="Code équipement"><Inp value={f.eq} onChange={e=>setF({...f,eq:e.target.value})} placeholder="ex: TRAM-004"/></Field>
  <Field label="Nom de l'équipement"><Inp value={f.nom} onChange={e=>setF({...f,nom:e.target.value})}/></Field>
  <Field label="Désignation équipement"><Inp value={f.designation} onChange={e=>setF({...f,designation:e.target.value})}/></Field>
  <Field label="Pièce / Outillage / Consommable">
   <select value={f.piece} onChange={e=>setF({...f,piece:e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm mt-1">
    {pieces.map(p=><option key={p.code} value={p.code}>{p.code} — {p.nom} (stock: {p.stock})</option>)}
   </select>
  </Field>
  <Field label="Quantité"><Inp type="number" min="1" value={f.qte} onChange={e=>setF({...f,qte:Number(e.target.value)})}/></Field>
  <Field label="OT associé (optionnel)">
   <select value={f.bt} onChange={e=>setF({...f,bt:e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm mt-1">
    <option value="">—</option>{bts.map(b=><option key={b.code} value={b.code}>{b.code}</option>)}
   </select>
  </Field>
  <div className="text-xs text-slate-500 mt-2">État initial : "Transmis au Magasinier" (ou "En attente pièce" si le stock est insuffisant — l'OT lié bascule alors aussi en "En attente pièce"). Le magasinier génère ensuite le BS ou annule la DS avec un motif.</div>
  <div className="flex justify-end mt-3"><Btn onClick={()=>onSubmit(f)}>Créer la Demande de Sortie (DS)</Btn></div>
 </div>);
}

export function BRForm({pieces,onSubmit}){
 const [f,setF]=useState({piece:(pieces[0]||{}).code||"",qte:1});
 return (<div>
  <Field label="Pièce / Outillage / Consommable">
   <select value={f.piece} onChange={e=>setF({...f,piece:e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm mt-1">
    {pieces.map(p=><option key={p.code} value={p.code}>{p.code} — {p.nom}</option>)}
   </select>
  </Field>
  <Field label="Quantité retournée"><Inp type="number" min="1" value={f.qte} onChange={e=>setF({...f,qte:Number(e.target.value)})}/></Field>
  <div className="text-xs text-slate-500 mt-2">La quantité sera recréditée automatiquement sur le stock de la pièce.</div>
  <div className="flex justify-end mt-3"><Btn onClick={()=>onSubmit(f)}>Créer le Bon de Retour (BR)</Btn></div>
 </div>);
}


/* =====================================================================
   INDICATEURS DE PERFORMANCE — méthodes de calcul reprises de l'ancienne GMAO
   (Suivi des performances, Équipements, RH, Stock, AMDEC/MBF) et adaptées au
   modèle de données de cette GMAO : DI + OT liés, durées saisies sur l'OT,
   arborescence technique, intervenants (temps individuel), magasin.
   ===================================================================== */
