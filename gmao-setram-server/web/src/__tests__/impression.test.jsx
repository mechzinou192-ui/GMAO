import { describe, it, expect, vi, beforeEach } from 'vitest';
import { btImprimableHtml, esc } from '../lib/impression.js';
import { imprimerHtml } from '../imprimer.js';

const PIECES = [{ code: 'P-001', nom: 'Fusible 10A', prix: 120 }, { code: 'O-001', nom: 'Clé dynamométrique', prix: 5000 }];
const EQ = [{ code: 'CFO.ALG.SST.01', nom: 'Transformateur T1', emplacement: 'Poste HT — Alger' }];
const QUAND = new Date(2026, 9, 6, 14, 5);
const CORR = {
  code: 'OT-ALG-2026-0007', etat: 'Clôturé', type: 'Corrective', di: 'DI-ALG-2026-0042', eq: 'CFO.ALG.SST.01', nom: 'Transformateur T1',
  assigne: 'K. Belaïd', horaire: 'Nuit', consignation: 'Oui', consigne: 'Consigner la cellule HTA avant intervention',
  panne: 'Surchauffe', cause: 'Ventilation obstruée', effet: 'Nettoyage et remplacement du ventilateur', detection: 2, gravite: 3,
  dureeIntervention: 3, tempsLogistique: 1, dateGeneration: '2026-10-05 08:00', dateCloture: '2026-10-05 14:00',
  taches: [{ lib: 'Contrôler la température', res: 'OK', com: '' }, { lib: 'Vérifier le serrage', res: 'NOK', com: 'Borne desserrée' }, { lib: 'Test final' }],
  intervenants: [{ nom: 'K. Belaïd', fonction: 'Technicien CFO', temps: 3, taux: 1000 }],
  pieces: [{ code: 'P-001', qte: 3 }], outillage: [{ code: 'O-001', qte: 1 }], consommables: [],
};

describe('fiche de travail imprimable', () => {
  it('reprend les informations saisies mais AUCUN prix ni coût', () => {
    const h = btImprimableHtml(CORR, { pieces: PIECES, equipements: EQ, imprimeLe: QUAND });
    for (const t of ['OT-ALG-2026-0007', 'FICHE DE TRAVAIL CORRECTIVE', 'Transformateur T1', 'Poste HT — Alger', 'DI-ALG-2026-0042', 'K. Belaïd', 'Nuit', '<b>OUI — nécessaire</b>',
      'Consigner la cellule HTA', 'Contrôler la température', 'Borne desserrée', 'Surchauffe', 'Ventilation obstruée', '3 h', '1 h',
      'Technicien CFO', 'Fusible 10A', 'Clé dynamométrique', 'imprimée le 06/10/2026 14:05', 'Exploitation — consignation'])
      expect(h, t).toContain(t);
    expect(h).not.toMatch(/DA|Total|Montant|Taux|3 000|5 000|360/);
  });
  it('OT préventif : plan affiché, tâches à cocher à la main, pas de rubrique « Constat »', () => {
    const h = btImprimableHtml({ code: 'OT-PREV-ALG-2026-0001', etat: 'En cours', type: 'Préventive', plan: 'PREV-ALG-0003', eq: 'CFO.ALG.SST.01', taches: [{ lib: 'Graissage' }] }, { pieces: PIECES, equipements: EQ });
    expect(h).toContain('FICHE DE TRAVAIL PRÉVENTIVE'); expect(h).toContain('Plan préventif'); expect(h).toContain('PREV-ALG-0003'); expect(h).not.toContain('<h2>Constat</h2>'); expect(h).not.toContain('DI liée');
    expect(h).toContain('Graissage'); expect(h).not.toContain('✓'); expect(h).not.toContain('✗');   // rien de coché avant le terrain
  });
  it('OT vierge à remplir sur le terrain : lignes vides et durées à compléter', () => {
    const h = btImprimableHtml({ code: 'OT-1', etat: 'En cours', type: 'Corrective', eq: 'X', taches: [] }, { pieces: [], equipements: [] });
    expect(h).toContain('Aucune tâche définie.'); expect(h).toContain('……… h'); expect((h.match(/class="vide"/g) || []).length).toBe(9);
    expect(h).not.toContain('DA');
  });
  it('les intervenants assignés et les pièces prévues sont pré-remplis, les champs de constat vides restent à écrire', () => {
    const h = btImprimableHtml({ code: 'OT-2', etat: 'En cours', type: 'Corrective', eq: 'X', assigne: 'A. Haddad, M. Rahmani', panne: '-', cause: '-', effet: '-', detection: 0, gravite: 0,
      piecesPrevues: [{ code: 'P-001', qte: 2 }], taches: [{ lib: 'Remplacer' }] }, { pieces: PIECES, equipements: EQ });
    expect(h).toContain('A. Haddad'); expect(h).toContain('M. Rahmani'); expect(h).toContain('Fusible 10A'); expect(h).toContain('Pièce prévue');
    expect(h).not.toContain('>-<'); expect(h).not.toMatch(/class="cer on"/);
  });
  it('échappe tout texte saisi par un utilisateur (aucune injection HTML ou script)', () => {
    const h = btImprimableHtml({ ...CORR, nom: '<img src=x onerror=alert(1)>', consigne: '<script>alert("x")</script>', taches: [{ lib: '"><svg onload=1>', com: '<b>&' }],
      intervenants: [{ nom: "</td><script>1</script>", temps: 1, taux: 1 }], assigne: "O'Brien <i>" }, { pieces: PIECES, equipements: EQ });
    expect(h).not.toMatch(/<script>alert|<img src=x|<svg onload|<script>1/);
    expect(h).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;'); expect(h).toContain('O&#39;Brien &lt;i&gt;');
    expect(esc(null)).toBe(''); expect(esc(5)).toBe('5');
  });
  it('un code d\'article inconnu ne fait pas échouer l\'impression', () => {
    expect(() => btImprimableHtml({ ...CORR, pieces: [{ code: 'P-999', qte: 2 }] }, { pieces: PIECES, equipements: EQ })).not.toThrow();
  });
});

describe('ouverture de la fenêtre d\'impression', () => {
  beforeEach(() => vi.restoreAllMocks());
  it('écrit le document et lance l\'impression', () => {
    vi.useFakeTimers();
    const w = { document: { open: vi.fn(), write: vi.fn(), close: vi.fn() }, focus: vi.fn(), print: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(w);
    expect(imprimerHtml('<p>x</p>')).toBe(true);
    expect(w.document.write).toHaveBeenCalledWith('<p>x</p>'); expect(w.print).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500); expect(w.print).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
  it('fenêtre bloquée : message clair pour l\'utilisateur', () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    const msgs = []; window.addEventListener('gmao:error', (e) => msgs.push(e.detail), { once: true });
    expect(imprimerHtml('x')).toBe(false); expect(msgs[0]).toContain('pop-up');
  });
});
