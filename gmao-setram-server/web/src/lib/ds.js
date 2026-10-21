// Demandes de sortie magasin (DS) : une DS peut regrouper plusieurs pièces (« DS globale »).
// Forme actuelle : { code, eq, nom, designation, bt, etat, lignes:[{ piece, pieceNom, qte, prix }] }
// Les DS créées avant la v1.16 n'ont qu'une pièce, portée directement par { piece, pieceNom, qte, prix } :
// toutes les fonctions ci-dessous acceptent les deux formes (aucune reprise de données nécessaire).

export const DS_CLOSES = ['Traité', 'Annulé'];
// tant que le magasin n'a pas généré le bon de sortie, la DS peut encore être corrigée (retrait d'une pièce)
export const DS_MODIFIABLES = ['Transmis au Magasinier', 'En attente pièce'];

const nombre = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export function lignesDS(d) {
  if (!d) return [];
  if (Array.isArray(d.lignes)) return d.lignes;
  return d.piece ? [{ piece: d.piece, pieceNom: d.pieceNom, qte: nombre(d.qte), prix: nombre(d.prix) }] : [];
}

export const totalDS = (d) => lignesDS(d).reduce((s, l) => s + nombre(l.prix) * nombre(l.qte), 0);
export const quantiteDS = (d) => lignesDS(d).reduce((s, l) => s + nombre(l.qte), 0);
export const libelleArticlesDS = (d) => lignesDS(d).map((l) => `${l.pieceNom || l.piece} × ${l.qte}`).join(', ');

// Saisie du formulaire -> lignes propres : une ligne par article (quantités additionnées), quantité > 0, article connu.
export function construireLignes(saisie, pieces) {
  const parCode = new Map();
  for (const s of saisie || []) {
    const qte = Math.floor(nombre(s?.qte));
    if (!s?.piece || qte <= 0) continue;
    const p = pieces.find((x) => x.code === s.piece);
    if (!p) throw new Error(`Article inconnu : ${s.piece}.`);
    const l = parCode.get(p.code);
    if (l) l.qte += qte;
    else parCode.set(p.code, { piece: p.code, pieceNom: p.nom, qte, prix: nombre(p.prix) });
  }
  const lignes = [...parCode.values()];
  if (!lignes.length) throw new Error('Ajoutez au moins une pièce avec une quantité supérieure à 0.');
  return lignes;
}

// Lignes dont le stock actuel ne couvre pas la quantité demandée
export const lignesEnRupture = (lignes, pieces) =>
  lignes.filter((l) => { const p = pieces.find((x) => x.code === l.piece); return !p || nombre(p.stock) < nombre(l.qte); });

// État d'une DS non encore servie : « En attente pièce » si au moins une pièce manque, sinon « Transmis au Magasinier »
export const etatSelonStock = (lignes, pieces) => (lignesEnRupture(lignes, pieces).length ? 'En attente pièce' : 'Transmis au Magasinier');

// Retire la ligne `index` d'une DS encore modifiable. Renvoie la DS mise à jour, ou null s'il ne reste aucune pièce
// (l'appelant annule alors la DS). Les anciens champs « une pièce » sont retirés : la DS passe à la forme `lignes`.
export function retirerLigneDS(ds, index, pieces) {
  if (!ds || !DS_MODIFIABLES.includes(ds.etat)) throw new Error('Cette DS ne peut plus être modifiée (bon de sortie déjà généré, traitée ou annulée).');
  const lignes = lignesDS(ds);
  if (index < 0 || index >= lignes.length) throw new Error('Ligne introuvable.');
  const reste = lignes.filter((_, i) => i !== index);
  if (!reste.length) return null;
  const { piece, pieceNom, qte, prix, ...base } = ds; void piece; void pieceNom; void qte; void prix;
  return { ...base, lignes: reste, etat: etatSelonStock(reste, pieces) };
}

// Pièces d'un OT pas encore couvertes par une DS ouverte ou traitée (pour proposer la DS globale sans doublon)
export function piecesRestantAdemander(items, dssDeLOT) {
  const deja = new Map();
  for (const d of dssDeLOT) {
    if (d.etat === 'Annulé') continue;
    for (const l of lignesDS(d)) deja.set(l.piece, (deja.get(l.piece) || 0) + nombre(l.qte));
  }
  const voulu = new Map();
  for (const it of items) if (it?.code) voulu.set(it.code, (voulu.get(it.code) || 0) + nombre(it.qte));
  return [...voulu].map(([code, q]) => ({ code, qte: q - (deja.get(code) || 0) })).filter((x) => x.qte > 0);
}
