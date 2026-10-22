// Rattachement d'un équipement / d'un intervenant à un système.
export const SYN_SYS=[["BIL",["billet","valideur","dat ","portillon"]],
 ["LAC",["fil de contact","câble porteur","cable porteur","isolateur","console","caténaire","catenaire"]],
 ["VOIE",["voie","rail","traverse","aiguill"]],
 ["MR",["rame","bogie","disque de frein","onduleur","hvac","traction","porte passager","tram"]],
 ["CFO",["transformateur","redresseur","jeu de barres"]],
 ["CFA",["caméra","camera","enregistreur","haut-parleur","interphon","horloge"]],
 ["ELM",["groupe électrogène","groupe electrogene","tgbt"]],
 ["BO",["abri quai","bâtiment","batiment","extincteur"]],
 ["ED",["pont roulant","torus","tour en fosse"]]];
export function systemeDe(eqCode,nom,equipements){
 const e=equipements.find(x=>x.code===eqCode)||equipements.find(x=>(x.nom||"").toLowerCase()===(nom||"").toLowerCase());
 if(e) return e.system;
 const txt=((eqCode||"")+" "+(nom||"")).toLowerCase();
 for(const [sys,kws] of SYN_SYS) if(kws.some(k=>txt.includes(k))) return sys;
 return "";
}
// Un prestataire externe n'est proposé que pour les systèmes sur lesquels il intervient (fiche prestataire)
export function interPourSys(inter,sys){
 return inter.filter(p=>!p.externe||(!!sys&&(p.systemes||[]).includes(sys)));
}
// Le poste d'un intervenant (« Technicien Billettique », « Technicien LAC ») couvre-t-il le système ? Code ou libellé.
const LIBELLES_SYS={BIL:["billettique"],LAC:["caténaire","catenaire","ligne aérienne"],CFO:["courants forts"],CFA:["courants faibles"],MR:["matériel roulant","materiel roulant"],ELM:["électromécanique","electromecanique"],VOIE:["voie"],ED:["équipement dépôt","equipement depot"],BO:["bâtiment","batiment"]};
export function posteCouvre(poste,sys){
 const p=String(poste||"");
 if(new RegExp("\\b"+String(sys).replace(/[^A-Za-z0-9_]/g,"")+"\\b","i").test(p)) return true;
 const l=p.toLowerCase();
 return (LIBELLES_SYS[sys]||[]).some(x=>l.includes(x));
}
export function interDuSysteme(inter,sys){
 if(!sys) return inter;
 const ext=inter.filter(i=>i.externe), internes=inter.filter(i=>!i.externe);
 const filtres=internes.filter(i=>posteCouvre(i.poste,sys));
 if(!filtres.length) return inter;
 return [...filtres,...ext]; // aucun intervenant rattaché à ce système précis : on n'exclut personne plutôt que de vider la liste
}
