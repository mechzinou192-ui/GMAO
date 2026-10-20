// Constantes et données de départ partagées par plusieurs écrans.


export const MATERIAUX=9;  // onglet « Gestion et suivi des matériaux » (appareils de mesure, contrôles réglementaires, organismes)
export const ACCUEIL=8;   // onglet « Accueil » (tableau de bord), indépendant des volets de droits 0 à 7

export function seedEquipements(){
 const data={
  CFO:{SST:["Transformateur HT/BT","Redresseur & Disjoncteur","Jeu de barres & Cellules HTA"],LAC:["Fil de contact & Câble porteur","Isolateur & Console"],ECL:["Armoire BT Station"]},
  CFA:{VDO:["Caméra dôme quai","Enregistreur NVR"],SON:["Haut-parleur quai","Poste d'interphonie"],HOR:["Horloge mère station"]},
  VOIE:{RVB:["Rail UIC60 PK4","Traverse béton"],AIG:["Moteur d'aiguille AIG-12","Aiguillage Voie 3"]},
  BILLETTIQUE:{VAL:["Valideur quai Centrale","Valideur bord Rame 02"],DAT:["DAT station Émir"],PTL:["Portillon accès Gare"]},
  MR:{BOG:["Bogie Rame 02","Disque de frein Rame 04"],TRC:["Onduleur Rame 04"],PRT:["Porte passager Rame 01"],CLM:["Groupe HVAC Rame 03"]},
  ELM:{GRP:["Groupe électrogène Dépôt","TGBT Atelier Central"]},
  BO:{STA:["Abri quai Station Centrale"],DEP:["Bâtiment Atelier Central"],HVI:["Extincteur Atelier"]},
  ED:{PNT:["Pont roulant 10T"],TOR:["Torus Dépôt Alger"],TRF:["Tour en fosse Atelier"]},
 };
 const out=[];
 Object.entries(data).forEach(([sys,subs])=>Object.entries(subs).forEach(([subCode,noms])=>noms.forEach((nom,i)=>{
  out.push({code:sys+".ALG."+subCode+"."+String(i+1).padStart(2,"0"),system:sys,subCode,unit:"Alger",nom,emplacement:"",sousEquip:[],
   constructeur:{nom:"À définir",contact:"",tel:"",email:""},
   fournisseurs:[{nom:"À définir",tel:"",email:""}],prix:0});
 })));
 return out;
}
export const MESURE_SEED=[{code:"M-01",nom:"Multimètre Fluke 117",etalonnage:"2026-03-10",peremption:"2027-03-10",organisme:"ALGERAC"},
 {code:"M-02",nom:"Clé dynamométrique 40Nm",etalonnage:"2025-11-05",peremption:"2026-11-05",organisme:"VERITAS"},
 {code:"M-03",nom:"Mesureur usure caténaire",etalonnage:"2026-01-20",peremption:"2027-01-20",organisme:"APAVE"}];
export const ORG_DOM=["Contrôle réglementaire","Étalonnage"];
export const ORG_SEED=[
 {code:"ORG-01",nom:"VERITAS",domaines:["Contrôle réglementaire","Étalonnage"],contact:"",tel:"",email:""},
 {code:"ORG-02",nom:"APAVE",domaines:["Contrôle réglementaire","Étalonnage"],contact:"",tel:"",email:""},
 {code:"ORG-03",nom:"ALGERAC",domaines:["Étalonnage","Contrôle réglementaire"],contact:"",tel:"",email:""}];
export const PRESTA_SEED=[
 {nom:"SOTEMA Services",mat:"EXT-01",poste:"Prestataire — Matériel roulant",role:"Prestataire",externe:true,systemes:["MR"],taux:2200,contact:"Service maintenance",tel:"",email:"",contrat:"MP-2025-014",dateDebut:"2025-02-01",dateFin:"2027-01-31",cdc:"À préparer",habs:[],conges:[]}];
export const CTRL=[{code:"R-01",nom:"Pont roulant 10T Dépôt",organisme:"VERITAS",periodicite:"Annuelle",statut:"Conforme"},
 {code:"R-02",nom:"Réservoir air comprimé Atelier",organisme:"APAVE",periodicite:"Trimestrielle",statut:"Réserves levées"},
 {code:"R-03",nom:"Extincteur Atelier Central",organisme:"ALGERAC",periodicite:"Semestrielle",statut:"À contrôler"}];

export const ROLES=["Technicien","Exploitation","Chargé de Maintenance","Responsable","Magasinier","Directeur"];

export const POSTE_GENERIQUES=["Responsable Maintenance","Magasinier","Agent Exploitation","Directeur"];
export function posteOptions(systemsList){
 const sys=(systemsList||[]).filter(([c])=>c!=="MESURE"&&c!=="CTRL");
 return [...sys.flatMap(([c])=>["Technicien "+c,"Chargé de Maintenance "+c,"Responsable "+c]),...POSTE_GENERIQUES];
}

/* ================= ACCÈS : connexion + droits par unité / système / volet ================= */
export const KPI_VUES=[["Synthèse","Synthèse"],["Équipements","Équipements"],["Ressources humaines","Ressources humaines"],["Stock","Stock"],["Criticité (AMDEC)","Criticité (AMDEC)"],["Référentiel","Référentiel"]];
export const KPI_BLOCS=[["syn:ing","Synthèse › Indicateurs d'ingénierie (MTTR, MTBF, disponibilité…)"],["syn:real","Synthèse › Indicateurs de réalisation (TCP, TCC, TMP, TMC)"],["syn:taux","Synthèse › Taux de panne, d'intervention, récurrence"],["syn:comp","Synthèse › Comparatif des unités"]];
export const KPI_ALL=[...KPI_VUES,...KPI_BLOCS].map(x=>x[0]);
export const VOLETS=["Arborescence technique et matériaux","Demandes d'Intervention (DI)","Ordres de Travail (OT)","Planning Préventif","Gestion de stock","Gestion du personnel","Indicateurs de performance"];
