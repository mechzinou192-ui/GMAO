// Coût d'un ordre de travail (main-d'œuvre + matériaux).
export const coutLotFn=(pieces,lot)=>(lot||[]).reduce((s,it)=>{const pc=pieces.find(p=>p.code===it.code);return s+(pc?pc.prix*it.qte:0);},0);
// Heures payées d'un intervenant : durée d'intervention + temps logistique (déplacement, préparation, attente…)
export const heuresIntervenant=(it)=>(Number(it?.temps)||0)+(Number(it?.logistique)||0);
export const coutIntervenant=(it)=>heuresIntervenant(it)*(Number(it?.taux)||0);
export const coutBT=(b,pieces)=>{
 const mo=(b.intervenants||[]).reduce((s,i)=>s+coutIntervenant(i),0);
 const mat=coutLotFn(pieces,b.pieces)+coutLotFn(pieces,b.outillage)+coutLotFn(pieces,b.consommables);
 return {mo,mat,total:mo+mat};
};
