import { describe, it, expect } from 'vitest';
import { lignesDS, totalDS, quantiteDS, libelleArticlesDS, construireLignes, lignesEnRupture, etatSelonStock, retirerLigneDS, piecesRestantAdemander } from '../lib/ds.js';
import { preparerReinitialisation, COLLECTIONS_METIER } from '../../../server/src/reinitialisation-core.js';

const PIECES = [
  { code: 'P-001', nom: 'Fusible', prix: 100, stock: 10, categorie: 'Pièce' },
  { code: 'P-002', nom: 'Contacteur', prix: 3000, stock: 1, categorie: 'Pièce' },
];

describe('DS globale (plusieurs pièces)', () => {
  it('lit les anciennes DS à une pièce et les nouvelles à plusieurs lignes', () => {
    const ancienne = { code: 'DS-1', piece: 'P-001', pieceNom: 'Fusible', qte: 3, prix: 100 };
    expect(lignesDS(ancienne)).toEqual([{ piece: 'P-001', pieceNom: 'Fusible', qte: 3, prix: 100 }]);
    const globale = { code: 'DS-2', lignes: [{ piece: 'P-001', pieceNom: 'Fusible', qte: 2, prix: 100 }, { piece: 'P-002', pieceNom: 'Contacteur', qte: 1, prix: 3000 }] };
    expect(totalDS(globale)).toBe(3200); expect(quantiteDS(globale)).toBe(3);
    expect(libelleArticlesDS(globale)).toBe('Fusible × 2, Contacteur × 1');
    expect(lignesDS(null)).toEqual([]); expect(lignesDS({})).toEqual([]);
  });

  it('construit les lignes : doublons additionnés, quantités nulles ignorées, article inconnu ou liste vide refusés', () => {
    const l = construireLignes([{ piece: 'P-001', qte: 2 }, { piece: 'P-002', qte: 0 }, { piece: 'P-001', qte: '3' }], PIECES);
    expect(l).toEqual([{ piece: 'P-001', pieceNom: 'Fusible', qte: 5, prix: 100 }]);
    expect(() => construireLignes([{ piece: 'X', qte: 1 }], PIECES)).toThrow(/inconnu/);
    expect(() => construireLignes([], PIECES)).toThrow(/au moins une pièce/);
  });

  it('état initial : « En attente pièce » dès qu’une seule pièce manque', () => {
    const ok = construireLignes([{ piece: 'P-001', qte: 2 }, { piece: 'P-002', qte: 1 }], PIECES);
    expect(etatSelonStock(ok, PIECES)).toBe('Transmis au Magasinier');
    const manque = construireLignes([{ piece: 'P-001', qte: 2 }, { piece: 'P-002', qte: 4 }], PIECES);
    expect(lignesEnRupture(manque, PIECES).map((x) => x.piece)).toEqual(['P-002']);
    expect(etatSelonStock(manque, PIECES)).toBe('En attente pièce');
  });

  it('retrait d’une pièce : recalcul de l’état, dernière pièce = DS à annuler, interdit après le bon de sortie', () => {
    const ds = { code: 'DS-3', bt: 'OT-1', etat: 'En attente pièce', lignes: construireLignes([{ piece: 'P-001', qte: 2 }, { piece: 'P-002', qte: 4 }], PIECES) };
    const maj = retirerLigneDS(ds, 1, PIECES);
    expect(maj.lignes.map((x) => x.piece)).toEqual(['P-001']);
    expect(maj.etat).toBe('Transmis au Magasinier');
    expect(maj.bt).toBe('OT-1');
    expect(retirerLigneDS(maj, 0, PIECES)).toBeNull();
    const ancienne = { code: 'DS-4', etat: 'Transmis au Magasinier', piece: 'P-001', pieceNom: 'Fusible', qte: 1, prix: 100 };
    expect(retirerLigneDS(ancienne, 0, PIECES)).toBeNull();
    expect(() => retirerLigneDS({ ...ds, etat: 'BS généré' }, 0, PIECES)).toThrow(/ne peut plus être modifiée/);
    expect(() => retirerLigneDS(ds, 5, PIECES)).toThrow(/introuvable/);
  });

  it('DS globale depuis un OT : seules les quantités pas encore demandées sont proposées (DS annulées ignorées)', () => {
    const items = [{ code: 'P-001', qte: 3 }, { code: 'P-002', qte: 1 }, { code: 'P-001', qte: 1 }];
    expect(piecesRestantAdemander(items, [])).toEqual([{ code: 'P-001', qte: 4 }, { code: 'P-002', qte: 1 }]);
    const dss = [
      { etat: 'Traité', lignes: [{ piece: 'P-001', qte: 2 }] },
      { etat: 'Annulé', lignes: [{ piece: 'P-002', qte: 1 }] },
      { etat: 'Transmis au Magasinier', piece: 'P-001', qte: 2 },
    ];
    expect(piecesRestantAdemander(items, dss)).toEqual([{ code: 'P-002', qte: 1 }]);
  });
});

describe('repartir de zéro : règles communes serveur / démonstration', () => {
  it('phrase exacte (casse et espaces tolérés) et sauvegarde déclarée exigées', () => {
    expect(() => preparerReinitialisation({ confirmation: 'oui', sauvegardeFaite: true })).toThrow(/REPARTIR DE ZERO/);
    expect(() => preparerReinitialisation({ confirmation: 'REPARTIR DE ZERO' })).toThrow(/sauvegarde/);
    expect(() => preparerReinitialisation(null)).toThrow();
    const p = preparerReinitialisation({ confirmation: '  repartir de zero ', sauvegardeFaite: true });
    expect(p.collections).toEqual(COLLECTIONS_METIER);
    expect(p.numerotation).toBe(true);
    expect(p.sequences).toEqual(expect.arrayContaining(['dis', 'bts', 'bts:prev', 'planning', 'dss', 'pieces:P']));
  });
  it('référentiels sur demande, numérotation conservée sur demande, comptes jamais concernés', () => {
    const p = preparerReinitialisation({ confirmation: 'REPARTIR DE ZERO', sauvegardeFaite: true, referentiels: true, numerotation: false });
    expect(p.collections).toEqual(expect.arrayContaining(['systemes', 'arborescence', 'feries', 'equipements']));
    expect(p.collections).not.toContain('users');
    expect(p.sequences).toEqual([]);
  });
});
