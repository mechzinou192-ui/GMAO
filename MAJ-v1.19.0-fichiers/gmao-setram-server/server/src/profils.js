// Profils créés par le super administrateur : chargés depuis la base (collection « profils », un enregistrement par
// profil, id = nom du profil) et gardés en mémoire ; rechargés après chaque modification. Une seule instance du serveur
// (voir docs/decisions.md) : pas de cache partagé nécessaire.
import { q } from './db.js';
import { definirProfilsPersonnalises } from './profils-core.js';

let charge = null;
export function rechargerProfils() { charge = null; }
export async function profilsCharges() {
  if (!charge) {
    charge = q("SELECT id, data FROM records WHERE collection='profils' AND NOT deleted")
      .then(({ rows }) => definirProfilsPersonnalises(rows.map((r) => ({ ...r.data, nom: r.id }))))
      .catch((e) => { charge = null; throw e; });
  }
  return charge;
}
