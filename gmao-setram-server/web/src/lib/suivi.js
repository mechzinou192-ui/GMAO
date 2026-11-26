// Suivi du traitement des recommandations de la Maintenance prédictive et de l'Optimisation de la maintenance.
// Une ligne par recommandation traitée (statut + commentaire facultatif + historique des changements). Logique pure et testée.
export const SUIVI_STATUTS=["À traiter","En cours","Traité","Non retenu"];
export const SUIVI_COUL={"À traiter":"#D32F2F","En cours":"#F59E0B","Traité":"#2E9E5B","Non retenu":"#64748B"};
const slug=(v)=>String(v==null?"":v).normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^A-Za-z0-9]+/g,"-").replace(/^-+|-+$/g,"");
// Identifiant stable d'une recommandation : prédictive = équipement + date de la dernière panne (une nouvelle panne ouvre un nouveau suivi) ;
// optimisation = année + équipement + plan.
export const suiviCode=(source,unit,cle)=>"SUIV-"+source+"-"+slug(unit)+"-"+slug(cle);
export const suiviStatut=(rec)=>rec&&SUIVI_STATUTS.includes(rec.statut)?rec.statut:"À traiter";
// Nouvelle version de l'enregistrement : le statut et le commentaire courants + une ligne d'historique par changement.
export function suiviAppliquer(existant,{code,unit,source,eq,nom,resume,statut,commentaire,par,le}){
 const com=String(commentaire||"").trim(), ancien=existant?suiviStatut(existant):"À traiter";
 const histo=[...((existant&&existant.historique)||[]),{de:ancien,a:statut,commentaire:com,par:par||"",le:le||new Date().toISOString()}];
 return {code,unit,source,eq,nom:nom||"",resume:resume||(existant&&existant.resume)||"",statut,commentaire:com,traitePar:par||"",traiteLe:le||new Date().toISOString(),historique:histo};
}
export function suiviCompter(codes,suivis){
 const m=new Map((suivis||[]).map(x=>[x.code,x])); const r={"À traiter":0,"En cours":0,"Traité":0,"Non retenu":0};
 codes.forEach(c=>{r[suiviStatut(m.get(c))]++;}); return r;
}
