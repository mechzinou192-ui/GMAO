// Échéances : habilitations, contrats prestataires, péremption des appareils de mesure.
export const HAB_SEUIL_MOIS=2; // seuil orange : il reste 2 mois (ou moins) avant la date de fin
export function habFin(dateStr,months){
 const m=String(dateStr||"").match(/^(\d{4})-(\d{2})-(\d{2})/); if(!m) return "";
 return new Date(Date.UTC(+m[1],+m[2]-1+(Number(months)||0),+m[3])).toISOString().slice(0,10);
}
export function habInfo(dateStr,months){
 const fin=habFin(dateStr,months); const today=new Date(); const t0=new Date(Date.UTC(today.getFullYear(),today.getMonth(),today.getDate()));
 if(!fin) return {fin:"",days:0,niveau:"na",c:"—",cl:"bg-slate-600 text-slate-100"};
 const f=new Date(fin+"T00:00:00Z"); const days=Math.round((f-t0)/86400000);
 const seuil=new Date(t0); seuil.setUTCMonth(seuil.getUTCMonth()+HAB_SEUIL_MOIS);
 if(days<=0) return {fin,days,niveau:"rouge",c:days===0?"Expire aujourd'hui":"Expirée depuis "+(-days)+" j",cl:"bg-rose-600 text-rose-50"};
 if(f<=seuil) return {fin,days,niveau:"orange",c:"À renouveler ("+days+" j)",cl:"bg-amber-600 text-amber-50"};
 return {fin,days,niveau:"vert",c:"Valide ("+days+" j)",cl:"bg-emerald-600 text-emerald-50"};
}
export const CONTRAT_SEUIL_MOIS=5; // alerte : 5 mois avant la fin du contrat pour préparer le nouveau cahier des charges
export const CDC_ETATS=["À préparer","En préparation","Validé","Consultation lancée"];
export function contratInfo(pr){
 const fin=(pr&&pr.dateFin)||""; if(!fin) return {fin:"",days:0,niveau:"na",c:"Date de fin non renseignée",cl:"bg-slate-600 text-slate-100",alerte:false};
 const today=new Date(); const t0=new Date(Date.UTC(today.getFullYear(),today.getMonth(),today.getDate()));
 const f=new Date(fin.slice(0,10)+"T00:00:00Z"); const days=Math.round((f-t0)/86400000);
 const seuil=new Date(t0); seuil.setUTCMonth(seuil.getUTCMonth()+CONTRAT_SEUIL_MOIS);
 const traite=(pr.cdc==="Validé"||pr.cdc==="Consultation lancée");
 if(days<0) return {fin,days,niveau:"rouge",c:"Contrat expiré depuis "+(-days)+" j",cl:"bg-rose-600 text-rose-50",alerte:true};
 if(f<=seuil){
  const m=Math.floor(days/30);
  return {fin,days,niveau:traite?"vert":"orange",c:"Fin du contrat dans "+days+" j"+(m>=1?" (~"+m+" mois)":""),cl:traite?"bg-emerald-600 text-emerald-50":"bg-amber-600 text-amber-50",alerte:!traite};
 }
 return {fin,days,niveau:"vert",c:"Contrat en cours ("+days+" j restants)",cl:"bg-emerald-600 text-emerald-50",alerte:false};
}
export function habStatus(dateStr,months){ const i=habInfo(dateStr,months); return {c:i.c,cl:i.cl,niveau:i.niveau,days:i.days,fin:i.fin}; }
// Toutes les habilitations (hors prestataires) avec leur statut, triées par date de fin
export function habListe(inter){
 return (inter||[]).filter(p=>!p.externe).flatMap(p=>(p.habs||[]).map(h=>({p,h,...habInfo(h.date,h.m)}))).sort((x,y)=>x.days-y.days);
}

export function expStatus(dateStr){
 const exp=new Date(dateStr); const now=new Date(); const days=Math.round((exp-now)/86400000);
 if(days<0) return {c:"Périmé",cl:"bg-rose-600 text-rose-50"};
 if(days<60) return {c:"Expire bientôt ("+days+"j)",cl:"bg-amber-600 text-amber-50"};
 return {c:"Valide ("+days+"j)",cl:"bg-emerald-600 text-emerald-50"};
}
