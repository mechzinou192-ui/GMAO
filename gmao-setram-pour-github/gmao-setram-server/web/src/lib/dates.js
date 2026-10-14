// Dates et calendrier : fonctions pures (aucune dépendance à l'interface).
export const todayStr=()=>new Date().toISOString().slice(0,10);
export const frDate=(s)=>s?s.split("-").reverse().join("/"):"";
export const MOIS=["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
export const JOURS=["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"];
export const padN=(n)=>String(n).padStart(2,"0");
export const fmtD=(d)=>d.getFullYear()+"-"+padN(d.getMonth()+1)+"-"+padN(d.getDate());
export const parseD=(s)=>{const [y,m,d]=s.slice(0,10).split("-").map(Number);return new Date(y,m-1,d);};
// Ajoute n mois en gardant le jour du mois, ramené au dernier jour si le mois d'arrivée est plus court
// (31 janvier + 1 mois = 28 février, et non 3 mars).
export function addMonths(d,n){
 const x=new Date(d); const jour=x.getDate(); x.setDate(1); x.setMonth(x.getMonth()+n);
 x.setDate(Math.min(jour,new Date(x.getFullYear(),x.getMonth()+1,0).getDate()));
 return x;
}
const MOIS_PAR_PERIODE={Mensuel:1,Trimestriel:3,Semestriel:6,Annuel:12};
export function stepDate(d,per){
 if(per==="Hebdomadaire"){const x=new Date(d); x.setDate(x.getDate()+7); return x;}
 return addMonths(d,MOIS_PAR_PERIODE[per]||1);
}
// k-ième échéance à partir de la date de départ : calculée depuis la date de départ (et non de proche en proche)
// pour qu'un plan démarré le 31 janvier retombe sur le 31 mars, pas sur le 28.
export function occurrence(base,per,k){
 if(per==="Hebdomadaire"){const x=new Date(base); x.setDate(x.getDate()+7*k); return x;}
 return addMonths(base,k*(MOIS_PAR_PERIODE[per]||1));
}
