// Systèmes et arborescence proposés par défaut sur un serveur vierge.
// Copie côté serveur : server/src/demo/referentiels.js (un test vérifie qu'elles restent identiques).
export const SYSTEMS_SEED=[["CFO","Courants Forts"],["CFA","Courants Faibles"],["VOIE","Voie ferrée"],["BILLETTIQUE","Billettique"],["MR","Matériel Roulant"],["ELM","Électromécanique"],["BO","Bâtiment/Ouvrages"],["ED","Équipement Dépôt"],["MESURE","Appareils de Mesure"],["CTRL","Contrôles Réglementaires"]];

export const TREE_STRUCT_SEED={
 CFO:[{code:"SST",sub:"Sous-Station Électrique (SST) / Redressement"},{code:"LAC",sub:"Ligne Aérienne de Contact (LAC) / Caténaire"},{code:"ECL",sub:"Éclairage & Distribution Basse Tension"}],
 CFA:[{code:"VDO",sub:"Vidéoprotection (CCTV)"},{code:"SON",sub:"Sonorisation (PA) & Interphonie"},{code:"HOR",sub:"Horlogerie Mère / Fille"}],
 VOIE:[{code:"RVB",sub:"Rails, Traverses & Ballast"},{code:"AIG",sub:"Aiguillages / Moteurs d'aiguille"}],
 BILLETTIQUE:[{code:"VAL",sub:"Validateurs de Titres"},{code:"DAT",sub:"Distributeurs Automatiques (DAT)"},{code:"PTL",sub:"Portillons"}],
 MR:[{code:"BOG",sub:"Bogies & Freinage"},{code:"TRC",sub:"Chaîne de Traction & Inverseurs"},{code:"PRT",sub:"Portes & Accès Passagers"},{code:"CLM",sub:"Climatisation Rame (HVAC)"}],
 ELM:[{code:"GRP",sub:"Groupes Électrogènes & TGBT"}],
 BO:[{code:"STA",sub:"Stations Passagers & Abris"},{code:"DEP",sub:"Dépôt / Atelier Central"},{code:"HVI",sub:"HVAC & Extinction Incendie"}],
 ED:[{code:"PNT",sub:"Pont Roulant & Vérins de Levage"},{code:"TOR",sub:"Machine à Laver (Torus)"},{code:"TRF",sub:"Tour en Fosse"}],
};
