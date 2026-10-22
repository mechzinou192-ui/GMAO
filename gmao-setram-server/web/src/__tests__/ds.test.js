import { describe, it, expect } from 'vitest';
import { lignesDS, totalDS, quantiteDS, libelleArticlesDS, construireLignes, lignesEnRupture, etatSelonStock, retirerLigneDS, piecesRestantAdemander } from '../lib/ds.js';
import { preparerReinitialisation, enregistrementConcerne, filtreSql, COLLECTIONS_METIER } from '../../../server/src/reinitialisation-core.js';

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
    expect(preparerReinitialisation({ confirmation: 'Repartir  de  Zéro', sauvegardeFaite: true }).numerotation).toBe(true);   // accents et espaces tolérés
    expect(() => preparerReinitialisation({ confirmation: 'REPARTIR A ZERO', sauvegardeFaite: true })).toThrow();
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

describe('repartir de zéro : périmètre par catégorie, unité et système', () => {
  const base = { confirmation: 'REPARTIR DE ZERO', sauvegardeFaite: true };
  it('catégories au choix : seules celles cochées (ordre stable, sans doublon), numérotation de ces catégories seulement', () => {
    const p = preparerReinitialisation({ ...base, collections: ['dis', 'dis', 'bts'] });
    expect(p.collections).toEqual(['dis', 'bts']);
    expect(p.sequences.sort()).toEqual(['bts', 'bts:prev', 'dis']);
    expect(p.scopes).toBeNull();
    expect(() => preparerReinitialisation({ ...base, collections: [] })).toThrow(/au moins une catégorie/);
    expect(() => preparerReinitialisation({ ...base, collections: ['users'] })).toThrow(/inconnue/);
  });
  it('une seule unité : compteurs de cette unité seulement, référentiels refusés, unité inconnue refusée', () => {
    const p = preparerReinitialisation({ ...base, unit: 'Oran', collections: ['dis', 'dss', 'equipements'] }, { units: ['Alger', 'Oran'] });
    expect(p.unit).toBe('Oran');
    expect(p.sequences).toEqual(['dis']);            // « dss » est commun à toutes les unités : son compteur n'est pas touché
    expect(p.scopes).toEqual(['ORN']);
    expect(() => preparerReinitialisation({ ...base, unit: 'Oran', collections: ['arborescence'] })).toThrow(/communs à toutes les unités/);
    expect(() => preparerReinitialisation({ ...base, unit: 'Mars', collections: ['dis'] }, { units: ['Alger', 'Oran'] })).toThrow(/Unité inconnue/);
  });
  it('un seul système (arborescence de CFO) : jamais de remise à 1, jours fériés refusés', () => {
    const p = preparerReinitialisation({ ...base, system: 'CFO', collections: ['arborescence'], numerotation: true });
    expect(p.system).toBe('CFO');
    expect(p.numerotation).toBe(false);
    expect(p.sequences).toEqual([]);
    expect(() => preparerReinitialisation({ ...base, system: 'CFO', collections: ['feries'] })).toThrow(/jours fériés/);
    expect(() => preparerReinitialisation({ ...base, system: "CFO' OR 1=1", collections: ['dis'] })).toThrow(/invalide/);
  });
  it('ancien format inchangé : sans « collections », tout le métier (+ référentiels sur demande)', () => {
    expect(preparerReinitialisation(base).collections).toEqual(COLLECTIONS_METIER);
    expect(preparerReinitialisation({ ...base, referentiels: true }).collections).toContain('arborescence');
  });
  it('filtre : unité et système sur les éléments ; sur l\'arborescence, l\'en-tête CFO et CFO.xxx mais pas CFA ni CFOX', () => {
    const p = preparerReinitialisation({ ...base, unit: 'Oran', system: 'CFO', collections: ['equipements'] });
    expect(enregistrementConcerne('equipements', { id: 'a', unit: 'Oran', system: 'CFO' }, p)).toBe(true);
    expect(enregistrementConcerne('equipements', { id: 'b', unit: 'Alger', system: 'CFO' }, p)).toBe(false);
    expect(enregistrementConcerne('equipements', { id: 'c', unit: 'Oran', system: 'CFA' }, p)).toBe(false);
    expect(enregistrementConcerne('equipements', { id: 'd', unit: 'Oran', system: 'CFO', deleted: true }, p)).toBe(false);
    const q = preparerReinitialisation({ ...base, system: 'CFO', collections: ['arborescence'] });
    const ids = ['CFO', 'CFO.SST', 'CFA', 'CFA.SST', 'CFOX', 'CFOX.A'];
    expect(ids.filter((id) => enregistrementConcerne('arborescence', { id, unit: '', system: null }, q))).toEqual(['CFO', 'CFO.SST']);
    const f = filtreSql('dis', p, 1);
    expect(f.where).toBe('collection=$2 AND NOT deleted AND unit=$3 AND system=$4');
    expect(f.params).toEqual(['dis', 'Oran', 'CFO']);
    expect(filtreSql('arborescence', q, 1).params).toEqual(['arborescence', 'CFO', 'CFO.']);
    expect(filtreSql('dis', preparerReinitialisation(base), 1)).toEqual({ where: 'collection=$2 AND NOT deleted', params: ['dis'] });
  });
});
