import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { padN, fmtD, parseD, frDate, addMonths, stepDate, occurrence } from '../lib/dates.js';
import { setFeries, ferieAt, nonOuvre, congeAt, libConge, FERIES_DEFAUT } from '../lib/jours.js';
import { habFin, habInfo, habStatus, habListe, contratInfo, expStatus } from '../lib/echeances.js';
import { prochaineEcheance, isPeriodePlan, libIntervalle, occurrencesPlan, datesPlanDansPlage, datesFuturesPlan, buildBTPrev, tRes, avancement } from '../lib/preventif.js';
import { systemeDe, interPourSys, interDuSysteme } from '../lib/equipes.js';
import { coutBT } from '../lib/couts.js';
import * as K from '../lib/kpi.js';

// « Aujourd'hui » = mardi 6 octobre 2026, midi (heure locale)
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 9, 6, 12, 0, 0)); });
afterEach(() => vi.useRealTimers());

describe('dates', () => {
  it('formats et lecture', () => {
    expect(padN(7)).toBe('07'); expect(fmtD(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(fmtD(parseD('2026-03-09T10:00'))).toBe('2026-03-09'); expect(frDate('2026-03-09')).toBe('09/03/2026'); expect(frDate('')).toBe('');
  });
  it('addMonths : fin de mois ramenée au dernier jour, jamais de débordement sur le mois suivant', () => {
    expect(fmtD(addMonths(new Date(2026, 0, 31), 1))).toBe('2026-02-28');
    expect(fmtD(addMonths(new Date(2028, 0, 31), 1))).toBe('2028-02-29');       // année bissextile
    expect(fmtD(addMonths(new Date(2026, 7, 31), 1))).toBe('2026-09-30');
    expect(fmtD(addMonths(new Date(2026, 10, 30), 3))).toBe('2027-02-28');
    expect(fmtD(addMonths(new Date(2026, 11, 15), 2))).toBe('2027-02-15');
    expect(fmtD(addMonths(new Date(2026, 2, 31), -1))).toBe('2026-02-28');
  });
  it('stepDate et occurrence : calculées depuis la date de départ, sans dérive', () => {
    expect(fmtD(stepDate(parseD('2026-01-31'), 'Mensuel'))).toBe('2026-02-28');
    expect(fmtD(stepDate(parseD('2026-01-01'), 'Hebdomadaire'))).toBe('2026-01-08');
    const base = parseD('2026-01-31');
    expect([0, 1, 2, 3, 4].map((k) => fmtD(occurrence(base, 'Mensuel', k)))).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31']);
    expect(fmtD(occurrence(base, 'Annuel', 1))).toBe('2027-01-31');
    expect(fmtD(occurrence(base, 'Semestriel', 1))).toBe('2026-07-31');
    expect(fmtD(occurrence(base, 'Hebdomadaire', 3))).toBe('2026-02-21');
  });
});

describe('jours non ouvrés', () => {
  beforeEach(() => setFeries(FERIES_DEFAUT));
  it('week-end algérien = vendredi et samedi', () => {
    expect(nonOuvre('2026-10-09')).toEqual({ type: 'weekend', nom: 'Week-end (vendredi)' });
    expect(nonOuvre('2026-10-10').nom).toBe('Week-end (samedi)');
    expect(nonOuvre('2026-10-11')).toBeNull();            // dimanche : ouvré
    expect(nonOuvre('2026-10-08')).toBeNull();            // jeudi
    expect(nonOuvre('')).toBeNull();
  });
  it('jours fériés fixes (chaque année) et datés', () => {
    expect(ferieAt('2027-07-05').nom).toBe("Fête de l'Indépendance");
    expect(ferieAt('2026-03-20').nom).toBe('Aïd el-Fitr');
    expect(ferieAt('2026-03-22')).toBeNull();
    expect(nonOuvre('2026-11-01')).toEqual({ type: 'ferie', nom: 'Anniversaire de la Révolution' });   // dimanche férié : le férié prime
  });
  it('la liste de fériés est remplaçable (référentiel modifié par l\'administrateur)', () => {
    setFeries([{ nom: 'Journée test', date: '2026-10-07' }]);
    expect(ferieAt('2026-10-07').nom).toBe('Journée test'); expect(ferieAt('2026-11-01')).toBeNull();
  });
  it('congés', () => {
    const p = { conges: [{ du: '2026-08-01', au: '2026-08-15' }] };
    expect(congeAt(p, '2026-08-10')).toEqual(p.conges[0]); expect(congeAt(p, '2026-08-16')).toBeNull(); expect(congeAt(null, '2026-08-10')).toBeNull();
    expect(libConge(p.conges[0])).toBe('du 01/08/2026 au 15/08/2026');
  });
});

describe('habilitations', () => {
  it('date de fin', () => {
    expect(habFin('2026-03-15', 24)).toBe('2028-03-15'); expect(habFin('2026-01-31', 1)).toBe('2026-03-03'); expect(habFin('', 12)).toBe(''); expect(habFin('n\'importe quoi', 12)).toBe('');
  });
  it('rouge : expirée ou expire aujourd\'hui', () => {
    expect(habInfo('2025-10-06', 12)).toMatchObject({ niveau: 'rouge', days: 0, c: "Expire aujourd'hui" });
    expect(habInfo('2025-09-01', 12)).toMatchObject({ niveau: 'rouge', days: -35, c: 'Expirée depuis 35 j' });
  });
  it('orange : il reste 2 mois ou moins ; vert au-delà', () => {
    expect(habInfo('2025-11-20', 12)).toMatchObject({ niveau: 'orange', days: 45, c: 'À renouveler (45 j)' });
    expect(habInfo('2025-12-06', 12)).toMatchObject({ niveau: 'orange', days: 61 });   // pile 2 mois : orange
    expect(habInfo('2025-12-07', 12)).toMatchObject({ niveau: 'vert', days: 62 });
  });
  it('sans date : « na »', () => { expect(habInfo('', 12)).toMatchObject({ niveau: 'na', c: '—' }); expect(habStatus('', 12).niveau).toBe('na'); });
  it('liste : prestataires exclus, triée par urgence', () => {
    const inter = [
      { nom: 'A', habs: [{ i: 'H2V', date: '2026-01-01', m: 24 }, { i: 'B2', date: '2025-09-01', m: 12 }] },
      { nom: 'EXT', externe: true, habs: [{ i: 'X', date: '2020-01-01', m: 12 }] },
      { nom: 'B', habs: [{ i: 'H1', date: '2025-11-20', m: 12 }] }, { nom: 'C' },
    ];
    const l = habListe(inter);
    expect(l.map((x) => x.p.nom + ':' + x.h.i)).toEqual(['A:B2', 'B:H1', 'A:H2V']);
    expect(habListe(null)).toEqual([]);
  });
});

describe('contrats prestataires', () => {
  it('pas de date de fin', () => { expect(contratInfo({})).toMatchObject({ niveau: 'na', alerte: false }); });
  it('expiré', () => { expect(contratInfo({ dateFin: '2026-09-01' })).toMatchObject({ niveau: 'rouge', days: -35, alerte: true, c: 'Contrat expiré depuis 35 j' }); });
  it('à moins de 5 mois : alerte tant que le cahier des charges n\'est pas validé', () => {
    const a = contratInfo({ dateFin: '2027-02-01', cdc: 'À préparer' });
    expect(a).toMatchObject({ niveau: 'orange', days: 118, alerte: true }); expect(a.c).toBe('Fin du contrat dans 118 j (~3 mois)');
    expect(contratInfo({ dateFin: '2027-02-01', cdc: 'Validé' })).toMatchObject({ niveau: 'vert', alerte: false });
    expect(contratInfo({ dateFin: '2027-02-01', cdc: 'Consultation lancée' }).niveau).toBe('vert');
  });
  it('contrat en cours', () => { expect(contratInfo({ dateFin: '2028-01-01' })).toMatchObject({ niveau: 'vert', alerte: false }); });
});

describe('péremption des appareils de mesure', () => {
  it('périmé / bientôt / valide', () => {
    expect(expStatus('2026-09-01').c).toBe('Périmé');
    expect(expStatus('2026-10-30').c).toMatch(/^Expire bientôt/);
    expect(expStatus('2027-03-01').c).toMatch(/^Valide/);
  });
});

describe('maintenance préventive', () => {
  it('prochaine échéance : jamais dans le passé', () => {
    expect(prochaineEcheance('2026-12-01', 'Hebdomadaire')).toBe('2026-12-08');
    expect(prochaineEcheance('2026-12-01', 'Mensuel')).toBe('2027-01-01');
    expect(prochaineEcheance('2026-01-01', 'Mensuel')).toBe('2026-11-06');        // échéance passée : on repart d'aujourd'hui
    expect(prochaineEcheance('2026-08-31', 'Mensuel')).toBe('2026-11-06');
    expect(prochaineEcheance('2026-12-31', 'Mensuel')).toBe('2027-01-31');
    expect(prochaineEcheance('2027-01-31', 'Mensuel')).toBe('2027-02-28');        // fin de mois
  });
  it('plan sur une période', () => {
    expect(isPeriodePlan({ debut: '2026-01-01', fin: '2026-02-01', intervalle: { n: 1, unite: 'jours' } })).toBe(true);
    expect(isPeriodePlan({ debut: '2026-01-01' })).toBe(false); expect(isPeriodePlan(null)).toBe(false);
    expect(libIntervalle({ n: 1, unite: 'semaines' })).toBe('Chaque semaine'); expect(libIntervalle({ n: 3, unite: 'mois' })).toBe('Tous les 3 mois');
  });
  it('occurrences : jours, semaines, mois', () => {
    const oc = (n, unite, debut = '2026-01-01', fin = '2026-01-31') => occurrencesPlan({ debut, fin, intervalle: { n, unite } });
    expect(oc(1, 'semaines')).toEqual(['2026-01-01', '2026-01-08', '2026-01-15', '2026-01-22', '2026-01-29']);
    expect(oc(10, 'jours')).toEqual(['2026-01-01', '2026-01-11', '2026-01-21', '2026-01-31']);
    expect(oc(2, 'mois', '2026-01-15', '2026-07-15')).toEqual(['2026-01-15', '2026-03-15', '2026-05-15', '2026-07-15']);
    expect(oc(1, 'mois', '2026-01-31', '2026-06-30')).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31', '2026-06-30']);
    expect(oc(1, 'jours', '2026-01-05', '2026-01-04')).toEqual([]);              // fin avant début
    expect(occurrencesPlan({ debut: '2026-01-01' })).toEqual([]);
    expect(oc(0, 'jours', '2026-01-01', '2026-01-03')).toEqual(['2026-01-01', '2026-01-02', '2026-01-03']);   // intervalle 0 => 1
  });
  it('occurrences d\'un plan périodique dans une plage', () => {
    const p = { date: '2026-01-31', periode: 'Mensuel' };
    expect(datesPlanDansPlage(p, '2026-02-01', '2026-05-31')).toEqual(['2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31']);
    expect(datesPlanDansPlage({ ...p, termine: true }, '2026-01-01', '2026-12-31')).toEqual([]);
    expect(datesPlanDansPlage({ periode: 'Mensuel' }, '2026-01-01', '2026-12-31')).toEqual([]);
    expect(datesPlanDansPlage({ date: '2026-03-02', periode: 'Hebdomadaire' }, '2026-03-10', '2026-03-31')).toEqual(['2026-03-16', '2026-03-23', '2026-03-30']);
    const sp = { date: '2026-01-10', debut: '2026-01-01', fin: '2026-01-31', intervalle: { n: 1, unite: 'semaines' } };
    expect(datesPlanDansPlage(sp, '2026-01-01', '2026-01-31')).toEqual(['2026-01-15', '2026-01-22', '2026-01-29']);   // pas avant la date du plan
  });
  it('échéances futures d\'un plan : 12 mois', () => {
    expect(datesFuturesPlan({ date: '2026-01-31', periode: 'Trimestriel' })).toEqual(['2026-01-31', '2026-04-30', '2026-07-31', '2026-10-31', '2027-01-31']);
    expect(datesFuturesPlan({ date: '2026-01-01', periode: 'Hebdomadaire' })).toHaveLength(53);
    expect(datesFuturesPlan({ periode: 'Mensuel' })).toEqual([]);
  });
  it('OT préventif généré depuis un plan', () => {
    const pl = { code: 'PREV-ALG-0001', eq: 'CFO.ALG.SST.01', nom: 'Transformateur', periode: 'Mensuel', taches: ['Contrôle visuel', 'Serrage'], outillage: [{ code: 'O-001', qte: 1 }] };
    const bt = buildBTPrev(pl, 'OT-PREV-ALG-2026-0001', '2026-10-06 12:00');
    expect(bt).toMatchObject({ code: 'OT-PREV-ALG-2026-0001', plan: 'PREV-ALG-0001', eq: 'CFO.ALG.SST.01', type: 'Préventive', di: null, dateGeneration: '2026-10-06 12:00' });
    expect(bt.taches).toEqual([{ lib: 'Contrôle visuel', res: null, com: '' }, { lib: 'Serrage', res: null, com: '' }]);
    expect(bt.consigne).toContain('2 tâches');
  });
  it('avancement d\'un OT', () => {
    expect(tRes({ res: 'NOK' })).toBe('NOK'); expect(tRes({ fait: true })).toBe('OK'); expect(tRes({})).toBeNull();
    expect(avancement({ taches: [{ res: 'OK' }, { fait: true }, {}, {}] })).toBe(50); expect(avancement({ taches: [] })).toBeNull(); expect(avancement({})).toBeNull();
  });
});

describe('rattachement aux systèmes', () => {
  const eqs = [{ code: 'CFO.ALG.SST.01', nom: 'Transformateur T1', system: 'CFO' }, { code: 'MR.ALG.BOG.01', nom: 'Bogie', system: 'MR' }];
  it('par code, par nom, par mot-clé, ou rien', () => {
    expect(systemeDe('MR.ALG.BOG.01', '', eqs)).toBe('MR');
    expect(systemeDe('', 'transformateur t1', eqs)).toBe('CFO');
    expect(systemeDe('X', 'Portillon d\'accès gare', eqs)).toBe('BILLETTIQUE');
    expect(systemeDe('X', 'Aiguillage de la voie 2', eqs)).toBe('VOIE');
    expect(systemeDe('X', 'Machin inconnu', eqs)).toBe('');
  });
  it('un prestataire n\'est proposé que pour ses systèmes', () => {
    const inter = [{ nom: 'A' }, { nom: 'P', externe: true, systemes: ['MR'] }, { nom: 'Q', externe: true, systemes: ['CFO'] }];
    expect(interPourSys(inter, 'MR').map((x) => x.nom)).toEqual(['A', 'P']);
    expect(interPourSys(inter, '').map((x) => x.nom)).toEqual(['A']);
  });
  it('intervenants d\'un système : repli sur tout le monde si personne n\'y est rattaché', () => {
    const inter = [{ nom: 'A', poste: 'Technicien CFO' }, { nom: 'B', poste: 'Technicien MR' }, { nom: 'E', poste: 'Presta', externe: true }];
    expect(interDuSysteme(inter, 'CFO').map((x) => x.nom)).toEqual(['A', 'E']);
    expect(interDuSysteme(inter, 'VOIE').map((x) => x.nom)).toEqual(['A', 'B', 'E']);
    expect(interDuSysteme(inter, '')).toEqual(inter);
  });
});

describe('coût d\'un ordre de travail', () => {
  it('main-d\'œuvre + pièces + outillage + consommables ; article inconnu = 0', () => {
    const pieces = [{ code: 'P-001', prix: 100 }, { code: 'O-001', prix: 5000 }, { code: 'C-001', prix: 10 }];
    const bt = { intervenants: [{ temps: 2, taux: 1000 }, { temps: 1.5, taux: 2000 }], pieces: [{ code: 'P-001', qte: 3 }, { code: 'P-999', qte: 9 }], outillage: [{ code: 'O-001', qte: 1 }], consommables: [{ code: 'C-001', qte: 4 }] };
    expect(coutBT(bt, pieces)).toEqual({ mo: 5000, mat: 5340, total: 10340 });
    expect(coutBT({}, pieces)).toEqual({ mo: 0, mat: 0, total: 0 });
  });
});

/* ───────────────────────── KPI ───────────────────────── */
const EQ = [
  { code: 'CFO.ALG.SST.01', unit: 'Alger', system: 'CFO', subCode: 'SST', nom: 'T1', sousEquip: [{ code: 'CFO.ALG.SST.01.01', nom: 'Bobine' }] },
  { code: 'CFO.ALG.SST.02', unit: 'Alger', system: 'CFO', subCode: 'SST', nom: 'T2', sousEquip: [] },
  { code: 'MR.ORN.BOG.01', unit: 'Oran', system: 'MR', subCode: 'BOG', nom: 'Bogie', sousEquip: [] },
];
const DIS = [
  { code: 'D1', eq: 'CFO.ALG.SST.01', etat: 'Traité', dateCreation: '2026-01-05', dateEvt: '2026-01-05 08:00', designation: 'Fuite' },
  { code: 'D2', eq: 'CFO.ALG.SST.01', etat: 'Traité', dateCreation: '2026-01-12', dateEvt: '2026-01-12 10:00', designation: 'Fuite' },
  { code: 'D3', eq: 'CFO.ALG.SST.02', etat: 'Transmis', dateCreation: '2026-01-20', designation: 'Bruit', perturb: true },
  { code: 'D4', eq: 'CFO.ALG.SST.02', etat: 'Annulé', dateCreation: '2026-01-21', designation: 'Doublon' },
  { code: 'D5', eq: 'MR.ORN.BOG.01', etat: 'Traité', dateCreation: '2026-01-06', designation: 'Autre unité' },
  { code: 'D6', eq: 'CFO.ALG.SST.01', etat: 'Traité', dateCreation: '2025-12-20', designation: 'Hors période' },
];
const BTS = [
  { code: 'B1', di: 'D1', dureeIntervention: 2, tempsLogistique: 1, dateCloture: '2026-01-05 12:00', panne: 'Fuite', detection: 2, gravite: 0, intervenants: [{ nom: 'A', temps: 20 }, { nom: 'B', temps: 50 }] },
  { code: 'B2', di: 'D2', dureeIntervention: 4, tempsLogistique: 0, dateCloture: '2026-01-12 14:00', panne: 'Fuite', detection: 3, intervenants: [{ nom: 'A', temps: 100 }] },
  { code: 'B3', plan: 'PREV-1', eq: 'CFO.ALG.SST.01', etat: 'Clôturé', dateGeneration: '2026-01-10 08:00', dureeIntervention: 3, tempsLogistique: 0, intervenants: [] },
  { code: 'B4', plan: 'PREV-2', eq: 'CFO.ALG.SST.02', etat: 'En cours', dateGeneration: '2026-01-15', dureeIntervention: 1, intervenants: [{ nom: 'C', temps: 100 }] },
  { code: 'B5', plan: 'PREV-3', eq: 'CFO.ALG.SST.02', etat: 'Planifié', dateGeneration: '2025-11-15', dureeIntervention: 9 },       // hors période
  { code: 'B6', plan: 'PREV-4', eq: 'MR.ORN.BOG.01', etat: 'Clôturé', dateGeneration: '2026-01-15', dureeIntervention: 9 },      // autre unité
];
const PER = K.kpiPeriode('2026-01-01', '2026-01-31');
const DATA = { dis: DIS, bts: BTS, planning: [], equipements: EQ };

describe('KPI — période, unités, filtres', () => {
  it('période', () => { expect(PER.days).toBe(31); expect(PER.hours).toBe(744); expect(PER.end.getHours()).toBe(23); expect(K.kpiPeriode('2026-01-05', '2026-01-05').days).toBe(1); expect(K.kpiPeriode('', '').days).toBeGreaterThan(30000); });
  it('dates : invalide => null', () => { expect(K.kpiDate('pas une date')).toBeNull(); expect(K.kpiDate('')).toBeNull(); expect(K.kpiDate('2026-01-05 08:30').getHours()).toBe(8); });
  it('unité d\'un équipement : liste, puis abréviations des codes (dont Ouargla / Sétif / Mostaganem), sinon Alger', () => {
    expect(K.kpiUnitOf('MR.ORN.BOG.01', EQ)).toBe('Oran');
    expect(K.kpiUnitOf('CFO.OUA.SST.09', [])).toBe('Ouargla'); expect(K.kpiUnitOf('CFO.ORG.SST.09', [])).toBe('Ouargla');
    expect(K.kpiUnitOf('BILLETTIQUE.SET.PTL.01', [])).toBe('Sétif'); expect(K.kpiUnitOf('BILLETTIQUE.STF.PTL.01', [])).toBe('Sétif');
    expect(K.kpiUnitOf('X.MST.Y.01', [])).toBe('Mostaganem'); expect(K.kpiUnitOf('INCONNU', [])).toBe('Alger'); expect(K.kpiUnitOf('', null)).toBe('Alger');
  });
  it('cibles : unités « nouvelles » plus exigeantes', () => {
    expect(K.kpiIsNew('Oran')).toBe(false); expect(K.kpiIsNew('Sétif')).toBe(true);
    expect(K.kpiObj('Alger').dispo.val).toBe(0.95); expect(K.kpiObj('Sétif').dispo.val).toBe(0.97); expect(K.kpiObj('Alger').tcp.label).toBe('> 70 %');
  });
  it('statut vs cible', () => {
    const up = { val: 0.7, dir: 'up' }, down = { val: 0.3, dir: 'down' };
    expect([K.kpiStatus(up, 0.7, true), K.kpiStatus(up, 0.6, true), K.kpiStatus(up, 0.5, true)]).toEqual(['ok', 'warn', 'bad']);
    expect([K.kpiStatus(down, 0.3, true), K.kpiStatus(down, 0.35, true), K.kpiStatus(down, 0.5, true)]).toEqual(['ok', 'warn', 'bad']);
    expect([K.kpiStatus(up, 1, false), K.kpiStatus(up, NaN, true), K.kpiStatus(null, 1, true), K.kpiStatus(up, null, true)]).toEqual(['na', 'na', 'na', 'na']);
    expect([K.kpiRating(0.2, 0.5, 1), K.kpiRating(0.7, 0.5, 1), K.kpiRating(2, 0.5, 1)]).toEqual(['ok', 'warn', 'bad']);
  });
  it('filtre arborescence', () => {
    expect(K.kpiMatch({ eq: 'CFO.ALG.SST.01' }, { sys: 'CFO' }, EQ)).toBe(true); expect(K.kpiMatch({ eq: 'CFO.ALG.SST.01' }, { sys: 'MR' }, EQ)).toBe(false);
    expect(K.kpiMatch({ eq: 'CFO.ALG.SST.01' }, { sys: 'CFO', sub: 'SST', eq: 'CFO.ALG.SST.01' }, EQ)).toBe(true);
    expect(K.kpiMatch({ eq: 'CFO.ALG.SST.01' }, { eq: 'CFO.ALG.SST.02' }, EQ)).toBe(false);
    expect(K.kpiMatch({ eq: 'CFO.ALG.SST.01', nom: 'Remplacement CFO.ALG.SST.01.01' }, { se: 'CFO.ALG.SST.01.01' }, EQ)).toBe(true);
    expect(K.kpiMatch({ eq: 'X' }, null, EQ)).toBe(true);
    expect(K.kpiEqInfo('FOO.ALG.BAR.01', [])).toEqual({ system: 'FOO', sub: 'BAR', eq: null });
  });
});

describe('KPI — collecte du périmètre', () => {
  const c = K.kpiCollect('Alger', DATA, PER, 'Méthode d\'origine', null);
  it('ne garde que l\'unité et la période demandées', () => {
    expect(c.corr.map((r) => r.di.code)).toEqual(['D1', 'D2', 'D3', 'D4']);
    expect(c.corr[0].bt.code).toBe('B1'); expect(c.corr[2].bt).toBeNull();
    expect(c.prev.map((b) => b.code)).toEqual(['B3', 'B4']);
    expect(c.nbEquip).toBe(2); expect(c.parc).toBe(2); expect(c.nbActifs).toBe(2);
  });
  it('parc de référence : « arborescence complète » compte tous les équipements de l\'unité', () => {
    const big = { ...DATA, equipements: [...EQ, { code: 'CFO.ALG.SST.03', unit: 'Alger', system: 'CFO', subCode: 'SST', nom: 'T3', sousEquip: [] }] };
    expect(K.kpiCollect('Alger', big, PER, 'Arborescence complète', null).nbEquip).toBe(3);
    expect(K.kpiCollect('Alger', big, PER, 'Méthode d\'origine', null).nbEquip).toBe(2);
    expect(K.kpiCollect('Constantine', DATA, PER, 'x', null)).toMatchObject({ nbEquip: 1, corr: [], prev: [] });
  });
  it('filtre par système', () => { expect(K.kpiCollect('Alger', DATA, PER, 'x', { sys: 'MR' }).corr).toEqual([]); });
});

describe('KPI — calcul principal (valeurs vérifiées à la main)', () => {
  const { corr, prev, nbEquip } = K.kpiCollect('Alger', DATA, PER, 'x', null);
  const k = K.kpiCalc(corr, prev, PER, nbEquip);
  it('répartition préventif / correctif', () => {
    expect(k.hPrev).toBe(4); expect(k.hCorr).toBe(7); expect(k.hTotal).toBe(11);
    expect(k.tcp).toBeCloseTo(4 / 11, 10); expect(k.tcc).toBeCloseTo(7 / 11, 10);
  });
  it('taux de réalisation du préventif (TMP) et de traitement du correctif (TMC) ; DI annulée exclue', () => {
    expect(k.btClosed).toBe(1); expect(k.btDenom).toBe(2); expect(k.tmp).toBe(0.5);
    expect(k.nbPannesRep).toBe(2); expect(k.nbPannesTot).toBe(3); expect(k.tmc).toBeCloseTo(2 / 3, 10);
  });
  it('MTTR, indisponibilité, MTBF, disponibilité', () => {
    expect(k.mttr).toBe(3);                                   // (2 + 4) / 2
    expect(k.indispoH).toBe(8);                               // 4 h + 4 h + 0
    expect(k.hoursFlotte).toBe(1488); expect(k.tbf).toBe(1480);
    expect(k.mtbf).toBeCloseTo(1480 / 3, 8); expect(k.dispo).toBeCloseTo(1480 / 1488, 10);
    expect(k.tauxPanne).toBeCloseTo(3 / 1480, 12); expect(k.tauxRep).toBeCloseTo(1 / 3, 10);
    expect(k.lambdaTheo).toBeCloseTo(7 / 1488, 10); expect(k.tauxInterv).toBeCloseTo(8 / 1488, 10);
  });
  it('récurrence : même équipement, même motif', () => {
    expect(k.recurrents).toHaveLength(1); expect(k.recurrents[0]).toMatchObject({ eq: 'CFO.ALG.SST.01', count: 2 });
    expect(k.nbRecurrentes).toBe(2); expect(k.tauxRecurrence).toBeCloseTo(2 / 3, 10);
  });
  it('compteurs', () => { expect(k).toMatchObject({ nbDI: 4, nbBTPrev: 2, nbPerturb: 1, nbSansFin: 0, nbNegatif: 0, nbAberrant: 0 }); });
  it('aucune donnée : pas de division par zéro', () => {
    const z = K.kpiCalc([], [], PER, 0);
    expect(z).toMatchObject({ tcp: 0, tcc: 0, tmp: 0, tmc: 0, mttr: 0, dispo: 1, tauxRep: 0, tauxRecurrence: 0 });
    expect(Number.isFinite(z.mtbf)).toBe(true);
  });
  it('durée de panne : repli sur la durée d\'intervention si l\'écart est négatif ou la clôture absente', () => {
    const neg = K.kpiPanneHeures({ di: { dateEvt: '2026-01-10 12:00' }, bt: { dateCloture: '2026-01-10 10:00', dureeIntervention: 3, tempsLogistique: 0 } }, PER, PER.hours);
    expect(neg).toMatchObject({ negatif: true, dh: 3 });
    const sf = K.kpiPanneHeures({ di: { dateEvt: '2026-01-10 12:00' }, bt: { dureeIntervention: 2, tempsLogistique: 1 } }, PER, PER.hours);
    expect(sf).toMatchObject({ sansFin: true, dh: 3 });
    expect(K.kpiPanneHeures({ di: { dateEvt: '2026-01-01 00:00' }, bt: { dateCloture: '2026-01-01 23:00' } }, PER, 10).aberrant).toBe(true);
    const clamp = K.kpiPanneHeures({ di: { dateEvt: '2025-12-01 00:00' }, bt: { dateCloture: '2026-01-02 00:00' } }, PER, PER.hours);
    expect(clamp.dh).toBeCloseTo(24 - 1 / 60, 6);            // début ramené au 1er janvier 00:01
  });
});

describe('KPI — équipements, ressources humaines, stock', () => {
  const { corr, prev } = K.kpiCollect('Alger', DATA, PER, 'x', null);
  it('indicateurs par équipement, triés par nombre de pannes', () => {
    const rows = K.kpiEquipements(corr, prev, PER, EQ);
    expect(rows.map((r) => r.code)).toEqual(['CFO.ALG.SST.01', 'CFO.ALG.SST.02']);
    expect(rows[0]).toMatchObject({ nom: 'T1', nbCorr: 2, nbPrev: 1, nbBT: 3, cat: 1, hasCorrH: true });
    expect(rows[0].tauxLogCorr).toBeCloseTo(1 / 7, 10); expect(rows[0].tauxIntervCorr).toBeCloseTo(6 / 7, 10);
    expect(rows[0].k.dispo).toBeCloseTo((744 - 8) / 744, 10);
    expect(rows[1]).toMatchObject({ nbCorr: 1, nbPrev: 1, hasCorrH: false });
  });
  it('charge des techniciens : surcharge / équilibre / sous-charge', () => {
    const rh = K.kpiRH(corr, prev, PER, K.KPI_NORME_DEFAUT, 300);
    expect(rh.norme).toBeCloseTo(111.6, 8);                  // 108 h × 31 / 30
    const par = Object.fromEntries(rh.techs.map((t) => [t.technicien, t]));
    expect(par.A).toMatchObject({ chargeReelle: 120, nbInterventions: 2, statut: 'surcharge' });
    expect(par.C).toMatchObject({ chargeReelle: 100, statut: 'équilibre' });
    expect(par.B).toMatchObject({ chargeReelle: 50, statut: 'sous-charge' });
    expect(rh.techs.map((t) => t.technicien)).toEqual(['A', 'C', 'B']);
    expect(rh).toMatchObject({ total: 270, nbTech: 3, besoin: 3, delta: 0, nbSurcharge: 1, nbEquil: 1, nbSous: 1 });
    expect(rh.besoinTheo).toBeCloseTo(270 / 111.6, 8); expect(rh.efficience).toBeCloseTo(0.9, 10);
    expect(K.kpiRH([], [], PER, 108, 0)).toMatchObject({ nbTech: 0, besoin: 0, tauxMoyen: 0, efficience: null });
  });
  it('stock : coût des sorties, stock de sécurité, dormants', () => {
    const pieces = [
      { code: 'P-001', nom: 'Fusible', categorie: 'Pièce', prix: 100, stock: 20, min: 5, mouvements: [{ type: 'Achat', qte: 50, date: '2025-12-01' }, { type: 'Sortie', qte: 10, date: '2026-01-10' }, { type: 'Sortie', qte: 5, date: '2026-01-20' }] },
      { code: 'P-002', nom: 'Relais', categorie: 'Pièce', prix: 50, stock: 8, min: 1, mouvements: [{ type: 'Sortie', qte: 4, date: '2025-06-01' }] },
      { code: 'C-001', nom: 'Chiffon', categorie: 'Consommable', prix: 10, stock: 0, mouvements: [] },
    ];
    const s = K.kpiStock(pieces, PER, 2, new Date(2026, 9, 6));
    expect(s).toMatchObject({ coutTotal: 1500, nbSorties: 2, nbMois: 1, coutMoyenMois: 1500, parCat: { Pièce: 1500 } });
    expect(s.top).toEqual([{ code: 'P-001', nom: 'Fusible', categorie: 'Pièce', qte: 15, cout: 1500 }]);
    expect(s.secu).toHaveLength(1); expect(s.secu[0]).toMatchObject({ code: 'P-001', avgMois: 15, stockSecu: 30, stockActuel: 20, sousSeuil: true }); expect(s.nbSousSeuil).toBe(1);
    const rot = Object.fromEntries(s.rot.map((r) => [r.code, r]));
    expect(rot['P-001']).toMatchObject({ valeurStock: 2000, conso12: 1500, jours: 259, dormant: false });
    expect(rot['P-002']).toMatchObject({ valeurStock: 400, conso12: 0, jours: 492, dormant: true });
    expect(rot['C-001']).toMatchObject({ jours: null, dormant: false });
    expect(s.valeurStock).toBe(2400); expect(s.nbDormants).toBe(1); expect(s.valeurDormants).toBe(400);
  });
});

describe('KPI — criticité AMDEC et stratégie', () => {
  it('seuils de fréquence et de gravité', () => {
    expect([0.5, 1, 3.9, 4, 51, 52].map(K.kpiScoreF)).toEqual([1, 2, 2, 3, 3, 4]);
    expect([0, 1.9, 2, 19, 20, 119, 120].map(K.kpiScoreG)).toEqual([1, 1, 2, 2, 3, 3, 4]);
    expect([5, 10, 15, 16, 64].map((c) => K.kpiBand(c).label)).toEqual(['Acceptable', 'Modérée', 'Modérée', 'Majeure', 'Majeure']);
  });
  it('stratégie de maintenance recommandée', () => {
    expect(K.kpiStrategie(4, 4, 3, 48).id).toBe('MBF / RCM');
    expect(K.kpiStrategie(1, 4, 1, 4).id).toBe('MBF / RCM');       // gravité maximale suffit
    expect(K.kpiStrategie(2, 1, 2, 4).id).toBe('Corrective');
    expect(K.kpiStrategie(2, 2, 1, 4).id).toBe('Basée sur l\'état');
    expect(K.kpiStrategie(3, 2, 3, 18 - 9).id).toBe('Proactive');
    expect(K.kpiStrategie(2, 3, 2, 12).id).toBe('TPM');
    expect(K.kpiStrategie(2, 3, 3, 18 - 8).id).toBe('Préventive');
  });
  it('AMDEC par équipement : criticité C = G × P × ND', () => {
    const { corr } = K.kpiCollect('Alger', DATA, PER, 'x', null);
    const r = K.kpiAmdec(corr, PER, { groupBy: 'Équipement', gravBase: 'Durée d\'arrêt', equipements: EQ });
    expect(r.map((x) => x.key)).toEqual(['CFO.ALG.SST.01', 'CFO.ALG.SST.02']);          // trié par criticité
    expect(r[0]).toMatchObject({ count: 2, avgMin: 240, f: 3, g: 4, d: 3, crit: 36, dDefaut: false });
    expect(r[0].annual).toBeCloseTo(23.5, 1); expect(r[0].band.label).toBe('Majeure'); expect(r[0].strat.id).toBe('MBF / RCM');
    expect(r[1]).toMatchObject({ count: 1, avgMin: 0, f: 3, g: 1, d: 2, crit: 6, dDefaut: true }); expect(r[1].strat.id).toBe('Corrective');
  });
  it('AMDEC : gravité saisie sur les OT, regroupement par système', () => {
    const { corr } = K.kpiCollect('Alger', { ...DATA, bts: BTS.map((b) => (b.code === 'B1' ? { ...b, gravite: 2 } : b.code === 'B2' ? { ...b, gravite: 3 } : b)) }, PER, 'x', null);
    const r = K.kpiAmdec(corr, PER, { groupBy: 'Système', gravBase: 'Gravité saisie (OT)', equipements: EQ, nomSys: (c) => 'Sys ' + c });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ key: 'CFO', label: 'Sys CFO', count: 3, g: 3, nbGrav: 2, gMin: 2, gMax: 3, gDefaut: false });     // moyenne 2,5 → 3
    const sansSaisie = K.kpiAmdec(corr, PER, { groupBy: 'Équipement', gravBase: 'Gravité saisie (OT)', equipements: EQ });
    expect(sansSaisie.find((x) => x.key === 'CFO.ALG.SST.02').gDefaut).toBe(true);   // aucune gravité saisie : repli sur la durée d'arrêt
  });
});
