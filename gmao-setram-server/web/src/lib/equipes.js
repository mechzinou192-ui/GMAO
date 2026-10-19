// Rattachement d'un équipement / d'un intervenant à un système.
export const SYN_SYS=[["BILLETTIQUE",["billet","valideur","dat ","portillon"]],
 ["VOIE",["voie","rail","traverse","aiguill"]],
 ["MR",["rame","bogie","disque de frein","onduleur","hvac","traction","porte passager","tram"]],
 ["CFO",["transformateur","redresseur","jeu de barres","fil de contact","câble porteur","cable porteur","isolateur","console"]],
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
export function interDuSysteme(inter,sys){
 if(!sys) return inter;
 const re=new RegExp("\\b"+sys+"\\b","i");
 const ext=inter.filter(i=>i.externe), internes=inter.filter(i=>!i.externe);
 const filtres=internes.filter(i=>re.test(i.poste));
 if(!filtres.length) return inter;
 return [...filtres,...ext]; // aucun intervenant rattaché à ce système précis : on n'exclut personne plutôt que de vider la liste
}
