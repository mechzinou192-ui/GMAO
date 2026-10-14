// Génère les QR codes (bibliothèque chargée à la demande) et ouvre la planche d'étiquettes à imprimer.
import {lienEquipement,planchetteEtiquettesHtml} from "./lib/qr.js";
import {imprimerHtml} from "./imprimer.js";

export const MAX_ETIQUETTES=300;

export async function svgQr(texte){
 const QRCode=(await import("qrcode")).default;
 return QRCode.toString(texte,{type:"svg",margin:0,errorCorrectionLevel:"M"});
}

export async function imprimerEtiquettes(equipements,origin=window.location.origin){
 const liste=equipements.slice(0,MAX_ETIQUETTES);
 const items=[];
 for(const e of liste) items.push({code:e.code,nom:e.nom,emplacement:e.emplacement,svg:await svgQr(lienEquipement(origin,e.code))});
 return imprimerHtml(planchetteEtiquettesHtml(items));
}
