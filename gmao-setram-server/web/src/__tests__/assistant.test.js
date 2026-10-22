import { describe, it, expect } from 'vitest';
import { repondre, motsCles, trouverIntervenant, trouverEquipement } from '../lib/assistant.js';
import { genererDemo } from '../../../server/src/demo/donnees.js';

const AUJ = '2026-10-22';
const eqs = [
  { code: 'BILLETTIQUE.ALG.PTL.01', nom: 'Portillon accès Gare', system: 'BILLETTIQUE', unit: 'Alger' },
  { code: 'CFO.ALG.SST.01', nom: 'Transformateur HT/BT', system: 'CFO', unit: 'Alger' },
];
const di = (code, eq, designation, date) => ({ code, eq, nom: '', designation, dateEvt: date + ' 08:00', dateCreation: date, etat: 'Traité' });
const ot = (code, d, eq, o) => ({ code, di: d, eq, type: 'Corrective — Curative', etat: 'Clôturé', dateGeneration: o.date + ' 09:00', dateCloture: o.date + ' 12:00',
  panne: o.panne || '-', cause: o.cause || '-', effet: o.effet || '-', dureeIntervention: o.duree || 2, intervenants: [{ nom: o.tech, temps: o.duree || 2 }], assignes: [o.tech], pieces: o.pieces || [] });
const prev = (code, eq, tech, etat, date) => ({ code, plan: 'PREV-1', eq, type: 'Préventive', etat, dateGeneration: date + ' 07:30', ...(etat === 'Clôturé' ? { dateCloture: date + ' 11:00' } : {}),
  intervenants: [{ nom: tech, temps: 3 }], assignes: [tech], taches: [{ lib: 'Contrôle', res: etat === 'Clôturé' ? 'OK' : null }] });

const CTX = {
  aujourdhui: AUJ, peutPersonnel: true, equipements: eqs,
  dis: [
    di('DI-1', 'BILLETTIQUE.ALG.PTL.01', 'Portillon bloqué', '2026-08-01'),
    di('DI-2', 'BILLETTIQUE.ALG.PTL.01', 'Portillon bloqué', '2026-09-01'),
    di('DI-3', 'BILLETTIQUE.ALG.PTL.01', 'Lecteur de carte hors service', '2026-10-01'),
    di('DI-4', 'CFO.ALG.SST.01', 'Surchauffe transformateur', '2026-10-10'),
  ],
  bts: [
    ot('OT-1', 'DI-1', 'BILLETTIQUE.ALG.PTL.01', { date: '2026-08-01', tech: 'Y. Merabet', cause: 'Capteur de passage encrassé', effet: 'Nettoyage du capteur', duree: 1, pieces: [{ code: 'P-008', qte: 1 }] }),
    ot('OT-2', 'DI-2', 'BILLETTIQUE.ALG.PTL.01', { date: '2026-09-01', tech: 'Y. Merabet', cause: 'Capteur de passage encrassé', effet: 'Nettoyage du capteur', duree: 1 }),
    ot('OT-3', 'DI-3', 'BILLETTIQUE.ALG.PTL.01', { date: '2026-10-01', tech: 'Y. Merabet', cause: 'Lecteur défaillant', effet: 'Remplacement du lecteur', duree: 1 }),
    ot('OT-4', 'DI-4', 'CFO.ALG.SST.01', { date: '2026-10-10', tech: 'K. Belaïd', cause: 'Ventilation obstruée', effet: 'Nettoyage ventilation', duree: 6 }),
    { ...ot('OT-5', null, 'BILLETTIQUE.ALG.PTL.01', { date: '2026-10-20', tech: 'A. Haddad', duree: 4 }), etat: 'En cours', dateCloture: undefined },
    { ...ot('OT-6', null, 'BILLETTIQUE.ALG.PTL.01', { date: '2026-09-20', tech: 'A. Haddad', duree: 5 }) },
    { ...ot('OT-7', null, 'BILLETTIQUE.ALG.PTL.01', { date: '2026-09-25', tech: 'A. Haddad', duree: 5 }) },
    { ...ot('OT-8', null, 'BILLETTIQUE.ALG.PTL.01', { date: '2026-09-26', tech: 'A. Haddad', duree: 5 }) },
    prev('OT-P1', 'BILLETTIQUE.ALG.PTL.01', 'Y. Merabet', 'Clôturé', '2026-07-01'),
    prev('OT-P2', 'BILLETTIQUE.ALG.PTL.01', 'Y. Merabet', 'Clôturé', '2026-08-01'),
    prev('OT-P3', 'BILLETTIQUE.ALG.PTL.01', 'Y. Merabet', 'Clôturé', '2026-09-01'),
    prev('OT-P4', 'BILLETTIQUE.ALG.PTL.01', 'Y. Merabet', 'En cours', '2026-10-21'),     // visite du jour : pas un retard
  ],
  planning: [{ code: 'PREV-1', eq: 'BILLETTIQUE.ALG.PTL.01', periode: 'Mensuel', date: '2026-11-01' }, { code: 'PREV-2', eq: 'CFO.ALG.SST.01', periode: 'Mensuel', date: '2026-10-01' }],
  pieces: [{ code: 'P-001', nom: 'Fusible 10A', stock: 140, min: 40 }, { code: 'P-008', nom: 'Capteur de proximité', stock: 3, min: 4 }],
  intervenants: [
    { mat: 'MT-1002', nom: 'Y. Merabet', poste: 'Technicien Billettique', habs: [{ i: 'B1', date: '2026-06-01', m: 24 }], conges: [] },
    { mat: 'MT-1001', nom: 'K. Belaïd', poste: 'Technicien CFO', habs: [{ i: 'H2V', date: '2025-09-01', m: 12 }], conges: [{ du: '2026-11-16', au: '2026-11-26' }] },
    { mat: 'MT-1004', nom: 'A. Haddad', poste: 'Technicien', habs: [], conges: [] },
  ],
};
const section = (r, t) => (r.sections || []).find((s) => s.titre.startsWith(t));

describe('assistant GMAO : réponses calculées sur les données saisies (aucune IA externe)', () => {
  it('mots-clés : accents, mots vides et ponctuation ignorés', () => {
    expect(motsCles('Le portillon est bloqué, pourquoi ?')).toEqual(['portillon', 'bloque']);
    expect(motsCles('Synthèse de K. Belaïd')).toEqual(['synthese', 'belaid']);
  });

  it('panne : interventions similaires, cause et action les plus fréquentes, pièces, durée, intervenants', () => {
    const r = repondre('portillon bloqué', CTX);
    expect(r.type).toBe('panne');
    expect(r.resume).toMatch(/^2 interventions similaires/);
    expect(r.resume).toContain('Capteur de passage encrassé (2 fois)');
    expect(r.resume).toContain('Nettoyage du capteur');
    expect(section(r, 'Pièces').items[0]).toMatchObject({ texte: 'Capteur de proximité', ref: { type: 'piece', code: 'P-008' } });
    expect(section(r, 'Intervenants').items[0].texte).toBe('Y. Merabet');
    const inter = section(r, 'Interventions').items;
    expect(inter.map((i) => i.ref.code)).toEqual(['OT-2', 'OT-1']);            // la plus récente d'abord à pertinence égale
    expect(r.chiffres.find(([l]) => l === 'Durée moyenne')[1]).toBe('1 h');
  });

  it('panne inconnue : réponse claire, pas d\'invention', () => {
    const r = repondre('fuite hydraulique vérin', CTX);
    expect(r.titre).toBe('Aucune intervention trouvée');
  });

  it('intervenant : correctif / préventif, heures, points forts et points d\'attention calculés', () => {
    const r = repondre('synthèse de Y. Merabet', CTX);
    expect(r.type).toBe('intervenant');
    expect(r.resume).toMatch(/^7 OT : 3 en correctif, 4 en préventif, 15 h pointées\. Système principal : BILLETTIQUE\./);
    const forts = section(r, 'Points forts').items.map((i) => i.texte).join(' | ');
    expect(forts).toContain('Dépannage rapide sur BILLETTIQUE : 1 h en moyenne contre 5 h pour les autres intervenants');
    expect(forts).toContain('Préventif tenu : 100 % des visites dues clôturées (3/3)');   // la visite du jour n'est pas comptée
    expect(forts).toContain('Habilitations à jour (B1)');
    expect(r.note).toMatch(/pas une évaluation/);
  });

  it('intervenant : habilitation expirée, OT ancien et congé signalés ; durée plus longue que l\'équipe', () => {
    const k = repondre('qui est Belaid ?', CTX);
    expect(section(k, 'Points d\'attention').items.map((i) => i.texte).join(' | ')).toMatch(/Habilitation H2V : Expirée/);
    expect(k.resume).toContain('En congé du 16/11/2026 au 26/11/2026');
    const h = repondre('bilan A. Haddad', CTX);
    expect(section(h, 'Points d\'attention').items.map((i) => i.texte).join(' | ')).toMatch(/Durée de dépannage sur BILLETTIQUE plus longue que l'équipe : 5 h contre 1 h/);
  });

  it('intervenant : synthèse refusée sans accès au personnel ni aux indicateurs', () => {
    const r = repondre('synthèse de Y. Merabet', { ...CTX, peutPersonnel: false });
    expect(r.resume).toMatch(/réservée/); expect(r.sections).toBeUndefined();
  });

  it('équipement : pannes récurrentes, MTBF, préventif en retard, dernières DI', () => {
    const r = repondre('historique BILLETTIQUE.ALG.PTL.01', CTX);
    expect(r.type).toBe('equipement');
    expect(r.chiffres.find(([l]) => l === 'MTBF (jours)')[1]).toBe(31);              // (31 + 30) / 2 arrondi
    expect(section(r, 'Pannes').items[0]).toMatchObject({ texte: 'Portillon bloqué', detail: '2 fois' });
    const c = repondre('Transformateur HT/BT', CTX);
    expect(section(c, 'Préventif').items[0].detail).toContain('(en retard)');
  });

  it('stock, situation, top des pannes, aide', () => {
    expect(section(repondre('stock fusible', CTX), 'Articles').items[0].texte).toBe('P-001 — Fusible 10A');
    expect(section(repondre('articles sous le seuil', CTX), 'À réapprovisionner').items.map((i) => i.ref.code)).toEqual(['P-008']);
    const s = repondre('situation des OT', CTX);
    expect(s.type).toBe('situation');
    expect(s.chiffres.find(([l]) => l === 'Préventifs en retard')[1]).toBe(1);
    expect(s.chiffres.find(([l]) => l === 'Habilitations expirées')[1]).toBe(1);
    expect(repondre('pannes les plus fréquentes', CTX).type).toBe('top');
    expect(repondre('aide', CTX).type).toBe('aide');
    expect(repondre('', CTX).type).toBe('aide');
  });

  it('recherche d\'un intervenant ou d\'un équipement : nom entier seulement, code le plus long', () => {
    expect(trouverIntervenant('panne du portillon', CTX.intervenants)).toBeNull();
    expect(trouverIntervenant('MT-1004 ?', CTX.intervenants).nom).toBe('A. Haddad');
    expect(trouverEquipement('cfo.alg.sst.01 surchauffe', eqs).code).toBe('CFO.ALG.SST.01');
  });

  it('sur le jeu de démonstration complet : chaque type de question répond sans erreur', () => {
    const j = genererDemo(new Date(AUJ + 'T12:00:00'));
    const d = (c) => (j.collections[c] || []).filter((r) => !r.unit || r.unit === 'Alger').map((r) => r.data);
    const ctx = { dis: d('dis'), bts: d('bts'), equipements: d('equipements'), planning: d('planning'), pieces: d('pieces'), intervenants: d('intervenants'), peutPersonnel: true, aujourdhui: AUJ };
    for (const q of ['portillon bloqué', 'synthèse de K. Belaïd', 'Historique de CFO.ALG.SST.01', 'pannes les plus fréquentes', 'stock fusible', 'situation des OT', 'aiguille']) {
      const r = repondre(q, ctx);
      expect(r.titre, q).toBeTruthy(); expect(r.resume, q).not.toMatch(/undefined|NaN/);
    }
  });
});
