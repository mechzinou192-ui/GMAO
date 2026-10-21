/*
 * Import Excel des données de référence (équipements, articles du magasin, intervenants, prestataires...).
 *
 *   genererModele(ExcelJS, ref)           -> classeur modèle (feuilles + liste des valeurs autorisées)
 *   lireClasseur(ExcelJS, arrayBuffer)    -> lignes brutes de chaque feuille reconnue
 *   preparerImport(lecture, ctx, options) -> enregistrements prêts à envoyer + erreurs ligne par ligne
 *   completerCodes(prep, reserver)        -> attribue les numéros des articles (par le serveur) juste avant l'envoi
 *
 * Tout est « tout ou rien » : à la moindre erreur, rien n'est importé. Les erreurs sont précises
 * (feuille, ligne, colonne) pour que le fichier puisse être corrigé puis rechargé.
 * Un fichier rechargé deux fois ne crée jamais de doublons : ce qui existe déjà est reconnu.
 */

import { fmpDuLien, nomFichierLien, tachesPourVisite } from './lib/fmp.js';
import { congeAt } from './lib/jours.js';
import { interDuSysteme } from './lib/equipes.js';

export const MAX_LIGNES = 20000;
const MAX_TEXTE = 300;

/* ───────────────────────── Utilitaires ───────────────────────── */
export const norm = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const pad2 = (n) => String(n).padStart(2, '0');
const ymd = (y, m, d) => `${y}-${pad2(m)}-${pad2(d)}`;

function dateValide(y, m, d) {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d && y >= 1990 && y <= 2100;
}

// Valeur d'une cellule exceljs -> '' | nombre | Date | texte
export function valeurCellule(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date || typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 'Oui' : 'Non';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join('').trim();
    if ('result' in v) return valeurCellule(v.result);          // formule : on lit le résultat calculé
    if ('text' in v) return valeurCellule(v.text);              // lien hypertexte
    if ('error' in v) return '';
  }
  return String(v).trim();
}

const vide = (v) => v === '' || v === undefined || v === null;

/* ───────────────────────── Analyse des valeurs ───────────────────────── */
function lireTexte(v) {
  const t = v instanceof Date ? '' : String(v).trim();
  if (t.length > MAX_TEXTE) throw new Error(`texte trop long (${t.length} caractères, maximum ${MAX_TEXTE})`);
  return t;
}

function lireNombre(v, { min = 0, entier = false } = {}) {
  let n;
  if (typeof v === 'number') n = v;
  else if (v instanceof Date) throw new Error('une date a été saisie à la place d\'un nombre');
  else {
    let t = String(v).replace(/[\s\u00a0\u202f]/g, '').replace(/(da|dzd)$/i, '');
    if (t.includes(',') && t.includes('.')) t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
    else t = t.replace(',', '.');
    n = /^[-+]?\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
  }
  if (!Number.isFinite(n)) throw new Error(`« ${v} » n'est pas un nombre`);
  if (entier && !Number.isInteger(n)) throw new Error(`« ${v} » doit être un nombre entier`);
  if (n < min) throw new Error(`« ${v} » doit être supérieur ou égal à ${min}`);
  if (n > 1e12) throw new Error(`« ${v} » est trop grand`);
  return n;
}

export function lireDate(v) {
  let y, m, d;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) throw new Error('date invalide');
    [y, m, d] = [v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate()];
  } else if (typeof v === 'number') {
    if (v < 20000 || v > 80000) throw new Error(`« ${v} » n'est pas une date`);
    const t = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 864e5);
    [y, m, d] = [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()];
  } else {
    const s = String(v).trim();
    let r = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/);
    if (r) [y, m, d] = [+r[1], +r[2], +r[3]];
    else if ((r = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/))) [d, m, y] = [+r[1], +r[2], +r[3]];
    else throw new Error(`« ${s} » n'est pas une date (format attendu : JJ/MM/AAAA)`);
  }
  if (!dateValide(y, m, d)) throw new Error('date inexistante ou hors de la période 1990-2100');
  return ymd(y, m, d);
}

function lireChoix(v, choix, alias = {}) {
  const t = norm(v);
  const hit = choix.find((c) => norm(c) === t) || alias[t];
  if (!hit) throw new Error(`« ${v} » n'est pas une valeur autorisée (choix : ${choix.join(', ')})`);
  return hit;
}

/* ───────────────────────── Définition des feuilles ───────────────────────── */
// k = clé interne · h = en-tête dans Excel · req = obligatoire · t = type · ex = exemple (page « Lisez-moi »)
const C = (k, h, ex, o = {}) => ({ k, h, ex, t: 'txt', ...o });

export const FEUILLES = [
  { cle: 'equipements', nom: 'Équipements', collection: 'equipements',
    but: 'Arborescence technique : un équipement par ligne. Le code (CFO.ALG.SST.01) est créé automatiquement. Donnez un « Repère » (T1, T2…) aux équipements qui ont des sous-équipements : la feuille Sous-équipements s\'y réfère, sans attendre le code GMAO.',
    cols: [
      C('repere', 'Repère', 'T1', { alias: ['repere (facultatif)', 'reference interne', 'ref interne'] }),
      C('unite', 'Unité', 'Alger', { req: true, t: 'unite' }),
      C('systeme', 'Système', 'CFO', { req: true }),
      C('sous', 'Sous-système', 'SST', { req: true }),
      C('nom', 'Désignation', 'Transformateur HT/BT', { req: true }),
      C('emplacement', 'Emplacement', 'Dépôt Alger — Atelier B'),
      C('prix', 'Prix (DA)', '1250000', { t: 'num' }),
      C('c_nom', 'Constructeur', 'ABB'), C('c_contact', 'Contact constructeur', 'M. Saidi'),
      C('c_tel', 'Tél. constructeur', '0550 00 00 00'), C('c_email', 'Email constructeur', 'contact@abb.example'),
      C('f_nom', 'Fournisseur', 'ElecPro'), C('f_tel', 'Tél. fournisseur', '021 00 00 00'), C('f_email', 'Email fournisseur', 'ventes@elecpro.example'),
      C('code', 'Code', 'laisser vide pour une création', { alias: ['code gmao'] }),
    ] },
  { cle: 'sous', nom: 'Sous-équipements', collection: 'equipements',
    but: 'Composants d\'un équipement. Équipement parent : son « Repère » de la feuille Équipements (ex. T1) OU son code GMAO s\'il existe déjà (ex. CFO.ALG.SST.01). Équipements et sous-équipements s\'importent ainsi en une seule fois. Code créé automatiquement : CFO.ALG.SST.01.01.',
    cols: [
      C('parent', 'Équipement parent (repère ou code GMAO)', 'T1', { req: true, alias: ['code equipement parent', 'equipement parent', 'code equipement', 'repere parent', 'parent'] }),
      C('nom', 'Désignation', 'Moteur de traction', { req: true }),
      C('f_nom', 'Fournisseur', 'ElecPro'), C('f_tel', 'Tél. fournisseur', ''), C('f_email', 'Email fournisseur', ''),
      C('code', 'Code', 'laisser vide pour une création'),
    ] },
  { cle: 'pieces', nom: 'Articles du magasin', collection: 'pieces',
    but: 'Pièces, outillage et consommables du magasin central. Code créé automatiquement (P-001, O-001, C-001). Le stock est pris en compte à la création uniquement.',
    cols: [
      C('cat', 'Catégorie', 'Pièce', { req: true, t: 'choix' }),
      C('nom', 'Désignation', 'Fusible 10A', { req: true }),
      C('ref', 'Référence', 'FUS-10A'), C('serie', 'N° de série', ''),
      C('prix', 'Prix unitaire (DA)', '120', { t: 'num' }),
      C('stock', 'Stock actuel', '50', { t: 'num' }), C('min', 'Seuil min', '10', { t: 'num' }), C('max', 'Seuil max', '100', { t: 'num' }),
      C('c_nom', 'Constructeur', ''), C('c_contact', 'Contact constructeur', ''), C('c_tel', 'Tél. constructeur', ''), C('c_email', 'Email constructeur', ''),
      C('f1_nom', 'Fournisseur 1', ''), C('f1_tel', 'Tél. fournisseur 1', ''), C('f1_email', 'Email fournisseur 1', ''),
      C('f2_nom', 'Fournisseur 2', ''), C('f2_tel', 'Tél. fournisseur 2', ''), C('f2_email', 'Email fournisseur 2', ''),
      C('code', 'Code', 'laisser vide pour une création'),
    ] },
  { cle: 'intervenants', nom: 'Intervenants', collection: 'intervenants',
    but: 'Personnel de maintenance. Le matricule identifie la personne.',
    cols: [
      C('mat', 'Matricule', 'MT-1200', { req: true }),
      C('nom', 'Nom', 'K. Belaïd', { req: true }),
      C('poste', 'Poste / Fonction', 'Technicien CFO'),
      C('role', 'Rôle', 'Technicien', { t: 'role' }),
      C('taux', 'Taux horaire (DA/h)', '1000', { t: 'num', min: 0.01 }),
    ] },
  { cle: 'habs', nom: 'Habilitations', collection: 'intervenants',
    but: 'Habilitations des intervenants (une par ligne). Le matricule doit figurer dans la feuille Intervenants ou déjà exister.',
    cols: [
      C('mat', 'Matricule', 'MT-1200', { req: true }),
      C('intitule', 'Habilitation', 'H2V', { req: true }),
      C('date', 'Date de la dernière habilitation', '15/03/2026', { req: true, t: 'date' }),
      C('validite', 'Validité (mois)', '12', { t: 'int', min: 1 }),
    ] },
  { cle: 'prestataires', nom: 'Prestataires', collection: 'prestataires',
    but: 'Prestataires externes. Référence EXT-01, EXT-02... créée automatiquement.',
    cols: [
      C('nom', 'Prestataire', 'SOTEMA Services', { req: true }),
      C('ref', 'Référence', 'laisser vide pour une création'),
      C('poste', 'Domaine / spécialité', 'Prestataire — Matériel roulant'),
      C('contrat', 'N° de contrat', 'M-2026/14'),
      C('contact', 'Contact', ''), C('tel', 'Téléphone', ''), C('email', 'Email', ''),
      C('taux', 'Taux horaire (DA/h)', '2000', { t: 'num', min: 0.01 }),
      C('debut', 'Début du contrat', '01/01/2026', { t: 'date' }),
      C('fin', 'Fin du contrat', '31/12/2027', { t: 'date' }),
      C('cdc', 'Cahier des charges', 'À préparer', { t: 'cdc' }),
      C('systemes', 'Systèmes (codes séparés par ;)', 'MR; ELM'),
    ] },
  { cle: 'organismes', nom: 'Organismes', collection: 'organismes',
    but: 'Organismes de contrôle réglementaire et d\'étalonnage. Code ORG-01... créé automatiquement.',
    cols: [
      C('nom', 'Organisme', 'VERITAS', { req: true }),
      C('code', 'Code', 'laisser vide pour une création'),
      C('domaines', 'Domaines (séparés par ;)', 'Contrôle réglementaire; Étalonnage'),
      C('contact', 'Contact', ''), C('tel', 'Téléphone', ''), C('email', 'Email', ''),
    ] },
  { cle: 'mesures', nom: 'Appareils de mesure', collection: 'mesures',
    but: 'Appareils de mesure à étalonner. Code M-01... créé automatiquement.',
    cols: [
      C('nom', 'Désignation', 'Multimètre Fluke 117', { req: true }),
      C('code', 'Code', 'laisser vide pour une création'),
      C('etalonnage', 'Date d\'étalonnage', '10/03/2026', { t: 'date' }),
      C('peremption', 'Date de péremption', '10/03/2027', { t: 'date' }),
      C('organisme', 'Organisme d\'étalonnage', 'ALGERAC'),
    ] },
  { cle: 'planning', nom: 'Planning préventif', collection: 'planning',
    but: 'Une ligne par visite préventive d\'un équipement. Les tâches sont lues automatiquement dans la FMP du lien (ajoutez les fichiers FMP à l\'étape « FMP » de l\'import). Les intervenants sont répartis automatiquement entre les techniciens du système (modifiable ensuite dans chaque plan). Objets à utiliser : désignations ou codes séparés par « ; », quantité facultative (« multimètre x2 »).',
    cols: [
      C('eq', 'Code GMAO', 'CFO.ALG.SST.01', { req: true, alias: ['code equipement', 'equipement', 'code gmao equipement', 'repere'] }),
      C('periode', 'Type de visite', 'Mensuel', { req: true, t: 'visite', alias: ['type de la visite', 'periodicite', 'visite'] }),
      C('fmp', 'Lien FMP de la visite', 'ORG-CFO-IIT-FOR-0001-A__FMP_Annuelle.xlsx', { lien: true, alias: ['lien fmp', 'fmp', 'lien fmp de la visite', 'fiche fmp'] }),
      C('pieces', 'Pièces à utiliser', '', { alias: ['piece a utiliser', 'pieces a utiliser', 'pieces'] }),
      C('conso', 'Consommables à utiliser', '', { alias: ['consomable a utiliser', 'consomable a utilier', 'consommable a utiliser', 'consommables'] }),
      C('outil', 'Outillage à utiliser', 'multimètre;dynamomètre', { alias: ['outillage a utiliser', 'outillage', 'outils'] }),
      C('date', 'Première échéance', '', { t: 'date', alias: ['date de la visite', 'prochaine echeance', 'date prevue', 'echeance'] }),
      C('inter', 'Intervenants (facultatif)', '', { alias: ['intervenants', 'equipe', 'intervenant'] }),
    ] },
  { cle: 'controles', nom: 'Contrôles réglementaires', collection: 'controles',
    but: 'Contrôles réglementaires périodiques. Code R-01... créé automatiquement.',
    cols: [
      C('nom', 'Équipement', 'Pont roulant 10T Dépôt', { req: true }),
      C('code', 'Code', 'laisser vide pour une création'),
      C('organisme', 'Organisme de contrôle', 'APAVE'),
      C('periodicite', 'Périodicité', 'Annuelle', { t: 'periodicite' }),
      C('statut', 'Statut', 'À contrôler', { t: 'statut' }),
    ] },
];

export const PERIODICITES = ['Mensuelle', 'Trimestrielle', 'Semestrielle', 'Annuelle', 'Biennale'];
export const VISITES = ['Hebdomadaire', 'Mensuel', 'Trimestriel', 'Semestriel', 'Annuel'];
// « Mensuelle », « mensuel », « Visite annuelle », « M »… -> périodicité de la GMAO
function lireVisite(v) {
  const n = norm(lireTexte(v)).replace(/^visite\s+/, '');
  const abr = { h: 'Hebdomadaire', m: 'Mensuel', t: 'Trimestriel', s: 'Semestriel', a: 'Annuel' };
  const hit = VISITES.find((p) => n.startsWith(norm(p).slice(0, 6))) || abr[n];
  if (!hit) throw new Error(`« ${v} » : type de visite inconnu (choix : ${VISITES.join(', ')})`);
  return hit;
}
export const STATUTS_CONTROLE = ['Conforme', 'Réserves levées', 'À contrôler', 'Non conforme'];
export const CATEGORIES = ['Pièce', 'Outillage', 'Consommable'];

// listes déroulantes du modèle (selon les référentiels de l'application)
function choixDeColonne(col, ctx) {
  switch (col.t) {
    case 'unite': return ctx.units;
    case 'choix': return CATEGORIES;
    case 'role': return ctx.roles;
    case 'cdc': return ctx.cdcEtats;
    case 'periodicite': return PERIODICITES;
    case 'statut': return STATUTS_CONTROLE;
    default: return null;
  }
}

/* ───────────────────────── Modèle Excel à télécharger ───────────────────────── */
export function genererModele(ExcelJS, ctx) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'GMAO SETRAM'; wb.created = new Date();
  const navy = 'FF2B3593';

  const lisez = wb.addWorksheet('Lisez-moi', { views: [{ showGridLines: false }] });
  lisez.columns = [{ width: 34 }, { width: 34 }, { width: 14 }, { width: 22 }, { width: 46 }];
  const ligne = (vals, o = {}) => {
    const r = lisez.addRow(vals);
    r.eachCell((c) => { c.alignment = { vertical: 'top', wrapText: true }; if (o.bold) c.font = { bold: true, color: { argb: o.color } }; if (o.fill) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: o.fill } }; });
    return r;
  };
  lisez.mergeCells('A1:E1'); lisez.getCell('A1').value = 'GMAO SETRAM — Modèle d\'import de données'; lisez.getCell('A1').font = { size: 16, bold: true, color: { argb: navy } };
  [
    '',
    'Comment faire :',
    '1. Remplissez les feuilles dont vous avez besoin (les autres peuvent rester vides ou être supprimées). Une ligne = un élément. Ne changez pas les en-têtes de la ligne 1.',
    '2. Les colonnes dont l\'en-tête se termine par * sont obligatoires.',
    '3. Dans l\'application : Administration → Import de données → choisissez ce fichier. Le contrôle est fait avant tout enregistrement ; si une ligne est incorrecte, rien n\'est importé et l\'erreur est indiquée (feuille, ligne, colonne).',
    '4. Vous pouvez recharger le même fichier sans risque : ce qui existe déjà est reconnu et n\'est pas dupliqué.',
    '',
    'Règles :',
    '• Les codes (équipements, articles, prestataires, organismes...) sont créés automatiquement : laissez la colonne « Code » vide pour une création. Renseignez-la seulement pour modifier un élément existant.',
    '• Les dates s\'écrivent JJ/MM/AAAA. Les nombres peuvent s\'écrire 1250000 ou 1 250 000,50.',
    '• Pour modifier des éléments déjà présents, choisissez « Mettre à jour » à l\'import (seules les cellules renseignées sont modifiées). Par défaut, les éléments existants sont laissés tels quels.',
    '• Le stock d\'un article n\'est pris en compte qu\'à sa création : ensuite, il évolue par les achats, sorties et retours (historique des mouvements).',
    '• Vérifiez les unités, systèmes et sous-systèmes autorisés dans la feuille « Référentiels ».',
    '',
  ].forEach((t, i) => { const r = lisez.addRow([t]); lisez.mergeCells(`A${r.number}:E${r.number}`); r.getCell(1).alignment = { wrapText: true, vertical: 'top' }; if (t.endsWith(':')) r.getCell(1).font = { bold: true, color: { argb: navy } }; r.height = t.length > 120 ? 32 : 16; void i; });

  for (const f of FEUILLES) {
    lisez.addRow([]);
    const t = lisez.addRow([`Feuille « ${f.nom} »`]); lisez.mergeCells(`A${t.number}:E${t.number}`); t.getCell(1).font = { bold: true, size: 12, color: { argb: navy } };
    const b = lisez.addRow([f.but]); lisez.mergeCells(`A${b.number}:E${b.number}`); b.getCell(1).alignment = { wrapText: true, vertical: 'top' }; b.height = f.but.length > 110 ? 30 : 16;
    ligne(['Colonne', 'Obligatoire', 'Format', 'Exemple', 'Valeurs autorisées'].map((x, i) => (i === 3 ? 'Exemple' : x)), { bold: true, color: 'FFFFFFFF', fill: navy });
    for (const c of f.cols) {
      const ch = choixDeColonne(c, ctx);
      const fmt = { txt: 'Texte', num: 'Nombre', int: 'Nombre entier', date: 'Date JJ/MM/AAAA' }[c.t] || 'Liste';
      ligne([c.h, c.req ? 'Oui' : 'Non', fmt, c.ex || '', ch ? ch.join(' · ') : '']);
    }
  }

  for (const f of FEUILLES) {
    const ws = wb.addWorksheet(f.nom, { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = f.cols.map((c) => ({ width: Math.min(40, Math.max(14, c.h.length + 6)) }));
    const head = ws.getRow(1);
    f.cols.forEach((c, i) => {
      const cell = head.getCell(i + 1);
      cell.value = c.h + (c.req ? ' *' : '');
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: navy } };
      cell.alignment = { vertical: 'middle', wrapText: true };
      if (c.t === 'date') ws.getColumn(i + 1).numFmt = 'dd/mm/yyyy';
      const ch = choixDeColonne(c, ctx);
      const liste = ch ? `"${ch.join(',')}"` : null;
      if (liste && liste.length <= 250) {
        for (let r = 2; r <= 1000; r++) ws.getCell(r, i + 1).dataValidation = { type: 'list', allowBlank: true, formulae: [liste], showErrorMessage: true, errorTitle: 'Valeur non autorisée', error: `Choisissez dans la liste : ${ch.join(', ')}` };
      }
    });
    head.height = 32;
  }

  const ref = wb.addWorksheet('Référentiels');
  ref.columns = [{ width: 22 }, { width: 14 }, { width: 4 }, { width: 14 }, { width: 38 }, { width: 4 }, { width: 14 }, { width: 38 }];
  const h = (cells) => cells.forEach(([col, txt]) => { const c = ref.getCell(1, col); c.value = txt; c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: navy } }; });
  h([[1, 'Unité'], [2, 'Abréviation'], [4, 'Système'], [5, 'Désignation'], [7, 'Sous-système'], [8, 'Désignation']]);
  ctx.units.forEach((u, i) => { ref.getCell(2 + i, 1).value = u; ref.getCell(2 + i, 2).value = ctx.unitAbbr[u] || ''; });
  let r = 2;
  for (const [code, nom] of ctx.systemsList) {
    ref.getCell(r, 4).value = code; ref.getCell(r, 5).value = nom; r++;
  }
  r = 2;
  for (const [code] of ctx.systemsList) {
    for (const s of (ctx.treeStruct[code] || [])) { ref.getCell(r, 7).value = `${code} / ${s.code}`; ref.getCell(r, 8).value = s.sub; r++; }
  }
  return wb;
}

/* ───────────────────────── Lecture du fichier ───────────────────────── */
const IGNOREES = new Set(['lisez moi', 'referentiels', 'lisezmoi', 'readme']);

export async function lireClasseur(ExcelJS, buffer) {
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(buffer); } catch { throw new Error('Ce fichier n\'est pas un classeur Excel (.xlsx) lisible.'); }
  const feuilles = {};
  const inconnues = [];
  const vues = new Set();
  wb.eachSheet((ws) => {
    const n = norm(ws.name);
    if (IGNOREES.has(n)) return;
    const def = FEUILLES.find((f) => norm(f.nom) === n);
    if (!def) { if (ws.actualRowCount > 0) inconnues.push(ws.name); return; }
    if (vues.has(def.cle)) return;
    vues.add(def.cle);

    // en-têtes : première ligne (parmi les 10 premières) qui contient au moins une colonne connue
    const cible = new Map();
    def.cols.forEach((c) => { cible.set(norm(c.h), c.k); (c.alias || []).forEach((a) => cible.set(norm(a), c.k)); });
    let entete = 0; let colonnes = {};
    for (let r = 1; r <= Math.min(10, ws.rowCount) && !entete; r++) {
      const trouve = {};
      ws.getRow(r).eachCell({ includeEmpty: false }, (cell, ci) => {
        const k = cible.get(norm(valeurCellule(cell.value)));
        if (k && !(k in trouve)) trouve[k] = ci;
      });
      const toutesObligatoires = def.cols.filter((c) => c.req).every((c) => c.k in trouve);
      if (Object.keys(trouve).length >= Math.min(2, def.cols.length) || (toutesObligatoires && Object.keys(trouve).length >= 1)) { entete = r; colonnes = trouve; }
    }
    const liens = new Set(def.cols.filter((c) => c.lien).map((c) => c.k));
    const lignes = [];
    if (entete) {
      for (let r = entete + 1; r <= ws.rowCount; r++) {
        const row = ws.getRow(r);
        const brut = {}; let plein = false;
        for (const [k, ci] of Object.entries(colonnes)) {
          const cell = row.getCell(ci);
          const lien = liens.has(k) ? (cell.hyperlink || (cell.value && typeof cell.value === 'object' && cell.value.hyperlink) || '') : '';
          const v = lien ? String(lien).trim() : valeurCellule(cell.value);   // colonne « lien » : l'adresse du lien hypertexte, sinon le texte
          brut[k] = v; if (!vide(v)) plein = true;
        }
        if (plein) lignes.push({ ligne: r, brut });
        if (lignes.length > MAX_LIGNES) break;
      }
    }
    const manquantes = entete ? def.cols.filter((c) => c.req && !(c.k in colonnes)).map((c) => c.h) : [];
    feuilles[def.cle] = { entete, lignes, manquantes, vide: lignes.length === 0 };
  });
  return { feuilles, inconnues };
}

/* ───────────────────────── Préparation des enregistrements ───────────────────────── */
const clone = (o) => JSON.parse(JSON.stringify(o));
const dernierNumero = (code) => { const m = String(code).match(/(\d+)$/); return m ? parseInt(m[1], 10) : 0; };

// Index « clé -> liste d'éléments » : chaque élément du fichier « consomme » un élément existant de même clé
// (si le fichier contient 3 portillons identiques et que 2 existent déjà, 2 sont reconnus et 1 est nouveau).
function indexer(liste, cle) {
  const m = new Map();
  for (const x of liste) { const k = cle(x); if (!k) continue; if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
  return m;
}
const prendre = (m, k) => { const a = m.get(k); return a && a.length ? a.shift() : null; };

export function preparerImport(lecture, ctx, { onConflict = 'skip' } = {}) {
  const maj = onConflict === 'update';
  const erreurs = [];
  const avertissements = [];
  const resume = [];
  const sortie = {};           // collection -> Map id|clé -> enregistrement
  const aCoder = [];           // enregistrements dont le code sera attribué par le serveur
  const err = (feuille, ligne, colonne, msg) => erreurs.push({ feuille, ligne, message: colonne ? `colonne « ${colonne} » : ${msg}` : msg });
  const warn = (feuille, ligne, msg) => avertissements.push({ feuille, ligne, message: msg });
  const aujourdhui = ctx.today || new Date().toISOString().slice(0, 10);

  const unitesParAbbr = {};
  ctx.units.forEach((u) => { unitesParAbbr[norm(ctx.unitAbbr[u] || '')] = u; });

  // --- lecture typée des lignes d'une feuille ---
  function lire(def, feuille) {
    const out = [];
    for (const { ligne, brut } of feuille.lignes) {
      const v = {}; let ok = true;
      for (const c of def.cols) {
        const raw = brut[c.k];
        if (vide(raw)) {
          if (c.req) { err(def.nom, ligne, c.h, 'valeur obligatoire manquante'); ok = false; }
          continue;
        }
        try {
          switch (c.t) {
            case 'num': v[c.k] = lireNombre(raw, { min: c.min ?? 0 }); break;
            case 'int': v[c.k] = lireNombre(raw, { min: c.min ?? 0, entier: true }); break;
            case 'date': v[c.k] = lireDate(raw); break;
            case 'unite': v[c.k] = lireChoix(raw, ctx.units, unitesParAbbr); break;
            case 'choix': v[c.k] = lireChoix(raw, CATEGORIES); break;
            case 'role': v[c.k] = lireChoix(raw, ctx.roles); break;
            case 'cdc': v[c.k] = lireChoix(raw, ctx.cdcEtats); break;
            case 'periodicite': v[c.k] = lireChoix(raw, PERIODICITES); break;
            case 'visite': v[c.k] = lireVisite(raw); break;
            case 'statut': v[c.k] = lireChoix(raw, STATUTS_CONTROLE); break;
            default: v[c.k] = c.lien ? String(raw).trim().slice(0, 1000) : lireTexte(raw);
          }
        } catch (e) { err(def.nom, ligne, c.h, e.message); ok = false; }
      }
      if (ok) out.push({ ligne, v });
    }
    return out;
  }

  const defOf = (cle) => FEUILLES.find((f) => f.cle === cle);
  const present = (cle) => lecture.feuilles[cle] && !lecture.feuilles[cle].vide;
  const stats = (cle) => { const s = { cle, nom: defOf(cle).nom, lignes: 0, nouveaux: 0, existants: 0, modifies: 0 }; resume.push(s); return s; };
  const sortieDe = (col) => (sortie[col] ||= new Map());
  const ecrire = (col, cle, rec) => sortieDe(col).set(cle, rec);

  for (const f of FEUILLES) {
    const fe = lecture.feuilles[f.cle];
    if (fe && fe.manquantes.length) err(f.nom, 0, null, `colonne(s) obligatoire(s) introuvable(s) dans la ligne d'en-tête : ${fe.manquantes.join(', ')}`);
    if (fe && !fe.entete && fe.vide) continue;
    if (fe && fe.lignes.length > MAX_LIGNES) err(f.nom, 0, null, `trop de lignes (maximum ${MAX_LIGNES})`);
  }

  const sysCodes = new Map(ctx.systemsList.map(([c, n]) => [norm(c), c]));
  const sysNoms = new Map(ctx.systemsList.map(([c, n]) => [norm(n), c]));
  const trouverSysteme = (t) => sysCodes.get(norm(t)) || sysNoms.get(norm(t)) || null;

  /* ============ ORGANISMES (avant mesures et contrôles) ============ */
  const orgs = [...ctx.organismes.map((o) => ({ ...clone(o), _existant: true }))];
  const orgNoms = () => new Set(orgs.map((o) => norm(o.nom)));
  if (present('organismes')) {
    const def = defOf('organismes'), s = stats('organismes');
    const lignes = lire(def, lecture.feuilles.organismes); s.lignes = lecture.feuilles.organismes.lignes.length;
    const parCode = new Map(orgs.map((o) => [norm(o.code), o]));
    const parNom = indexer(orgs, (o) => norm(o.nom));
    let max = Math.max(0, ...orgs.map((o) => dernierNumero(o.code)));
    const codesFichier = new Set(lignes.map((l) => norm(l.v.code)).filter(Boolean));
    codesFichier.forEach((c) => { max = Math.max(max, dernierNumero(c)); });
    const vus = new Set();
    for (const { ligne, v } of lignes) {
      let domaines;
      if (v.domaines) {
        domaines = [];
        for (const d of v.domaines.split(/[;,/|]/).map((x) => x.trim()).filter(Boolean)) {
          try { const dd = lireChoix(d, ctx.orgDom); if (!domaines.includes(dd)) domaines.push(dd); } catch (e) { err(def.nom, ligne, 'Domaines', e.message); domaines = null; break; }
        }
        if (domaines && !domaines.length) domaines = undefined;
        if (domaines === null) continue;
      }
      const cleDoublon = norm(v.code) || `nom:${norm(v.nom)}`;
      if (vus.has(cleDoublon)) { err(def.nom, ligne, null, `« ${v.code || v.nom} » apparaît plusieurs fois dans la feuille`); continue; }
      vus.add(cleDoublon);
      let ex = v.code ? parCode.get(norm(v.code)) : prendre(parNom, norm(v.nom));
      if (v.code && !ex && !/^ORG-\d+$/i.test(v.code)) { err(def.nom, ligne, 'Code', `« ${v.code} » ne ressemble pas à un code d'organisme (ORG-01) et n'existe pas : laissez vide pour une création`); continue; }
      const champs = { nom: v.nom, ...(domaines ? { domaines } : {}), ...(v.contact ? { contact: v.contact } : {}), ...(v.tel ? { tel: v.tel } : {}), ...(v.email ? { email: v.email } : {}) };
      if (ex) {
        if (maj) { const data = { ...ex, ...champs }; delete data._existant; Object.assign(ex, champs); ecrire('organismes', ex.code, { id: ex.code, unit: '', system: null, data, ecrase: true }); s.modifies++; } else s.existants++;
      } else {
        const code = v.code ? String(v.code).toUpperCase() : `ORG-${pad2(++max)}`;
        const data = { code, nom: v.nom, domaines: domaines || [...ctx.orgDom], contact: v.contact || '', tel: v.tel || '', email: v.email || '' };
        orgs.push({ ...data }); parCode.set(norm(code), data);
        ecrire('organismes', code, { id: code, unit: '', system: null, data }); s.nouveaux++;
      }
    }
  }

  /* ============ ÉQUIPEMENTS ============ */
  const eqIndex = new Map(ctx.equipements.map((e) => [e.code, { id: e.code, unit: e.unit, system: e.system, data: clone(e), ecrase: false, existant: true, nouvelleSub: false }]));
  const eqPrefixMax = new Map();
  const bumpPrefix = (code) => { const m = String(code).match(/^(.*)\.(\d+)$/); if (m) eqPrefixMax.set(m[1], Math.max(eqPrefixMax.get(m[1]) || 0, +m[2])); };
  ctx.equipements.forEach((e) => bumpPrefix(e.code));

  const parRepere = new Map();     // repère (feuille Équipements) -> code GMAO, attribué ou existant
  if (present('equipements')) {
    const def = defOf('equipements'), s = stats('equipements');
    const lignes = lire(def, lecture.feuilles.equipements); s.lignes = lecture.feuilles.equipements.lignes.length;
    // codes explicites : réservés avant toute génération
    const explicites = new Set();
    for (const { v } of lignes) if (v.code) bumpPrefix(v.code.toUpperCase());
    const parNom = indexer(ctx.equipements, (e) => `${e.unit}|${e.system}|${e.subCode}|${norm(e.nom)}`);
    for (const { ligne, v } of lignes) {
      const systeme = trouverSysteme(v.systeme);
      if (!systeme) { err(def.nom, ligne, 'Système', `« ${v.systeme} » inconnu (voir la feuille Référentiels)`); continue; }
      const sub = (ctx.treeStruct[systeme] || []).find((x) => norm(x.code) === norm(v.sous) || norm(x.sub) === norm(v.sous));
      if (!sub) { err(def.nom, ligne, 'Sous-système', `« ${v.sous} » inconnu pour le système ${systeme} (choix : ${(ctx.treeStruct[systeme] || []).map((x) => x.code).join(', ') || 'aucun'})`); continue; }
      const abr = ctx.unitAbbr[v.unite];
      const prefixe = `${systeme}.${abr}.${sub.code}`;
      let rec; let code = v.code ? v.code.toUpperCase() : '';
      if (code) {
        if (!new RegExp(`^${prefixe.replace(/[.]/g, '\\.')}\\.\\d{2,}$`).test(code)) { err(def.nom, ligne, 'Code', `« ${code} » ne correspond pas à l'unité, au système et au sous-système de la ligne (attendu : ${prefixe}.NN) — laissez vide pour une création`); continue; }
        if (explicites.has(code)) { err(def.nom, ligne, 'Code', `« ${code} » apparaît plusieurs fois dans la feuille`); continue; }
        explicites.add(code);
        rec = eqIndex.get(code);
      } else {
        const ex = prendre(parNom, `${v.unite}|${systeme}|${sub.code}|${norm(v.nom)}`);
        rec = ex ? eqIndex.get(ex.code) : null;
        if (!rec) { const n = (eqPrefixMax.get(prefixe) || 0) + 1; eqPrefixMax.set(prefixe, n); code = `${prefixe}.${pad2(n)}`; }
      }
      const repere = v.repere ? norm(v.repere) : '';
      if (repere) {
        if (parRepere.has(repere)) { err(def.nom, ligne, 'Repère', `« ${v.repere} » est déjà utilisé par une autre ligne : chaque repère doit être unique dans la feuille`); continue; }
        parRepere.set(repere, rec ? rec.id : code);
      }
      const champs = {
        nom: v.nom,
        ...(v.emplacement ? { emplacement: v.emplacement } : {}),
        ...(v.prix !== undefined ? { prix: v.prix } : {}),
      };
      const constructeur = {}; ['nom', 'contact', 'tel', 'email'].forEach((k) => { if (v[`c_${k}`]) constructeur[k] = v[`c_${k}`]; });
      const fournisseur = v.f_nom ? { nom: v.f_nom, tel: v.f_tel || '', email: v.f_email || '' } : null;
      if (rec) {
        if (maj) {
          rec.data = { ...rec.data, ...champs, constructeur: { ...(rec.data.constructeur || {}), ...constructeur }, ...(fournisseur ? { fournisseurs: [fournisseur] } : {}) };
          rec.ecrase = true; s.modifies++;
        } else s.existants++;
      } else {
        const data = { code, system: systeme, subCode: sub.code, unit: v.unite, nom: v.nom, emplacement: v.emplacement || '', prix: v.prix ?? 0, sousEquip: [],
          constructeur: { nom: '', contact: '', tel: '', email: '', ...constructeur },
          fournisseurs: [fournisseur || { nom: 'Non renseigné', tel: '', email: '' }] };
        eqIndex.set(code, { id: code, unit: v.unite, system: systeme, data, ecrase: false, existant: false, nouvelleSub: false });
        s.nouveaux++;
      }
    }
  }

  /* ============ SOUS-ÉQUIPEMENTS ============ */
  if (present('sous')) {
    const def = defOf('sous'), s = stats('sous');
    const lignes = lire(def, lecture.feuilles.sous); s.lignes = lecture.feuilles.sous.lignes.length;
    const explicites = new Set();
    const parParent = new Map();    // parent -> index des sous-équipements existants avant import (consommables)
    for (const { ligne, v } of lignes) {
      // parent : repère de la feuille Équipements (prioritaire), sinon code GMAO existant ou créé par ce fichier
      const viaRepere = parRepere.get(norm(v.parent));
      const parent = eqIndex.get(viaRepere || String(v.parent).toUpperCase());
      if (!parent) { err(def.nom, ligne, 'Équipement parent', `« ${v.parent} » est introuvable : ni repère de la feuille Équipements, ni code d'un équipement existant`); continue; }
      const subs = parent.data.sousEquip || (parent.data.sousEquip = []);
      if (!parParent.has(parent.id)) parParent.set(parent.id, indexer(clone(subs), (x) => norm(x.nom)));
      let existant = null; let code = v.code ? v.code.toUpperCase() : '';
      if (code) {
        if (!code.startsWith(`${parent.id}.`)) { err(def.nom, ligne, 'Code', `« ${code} » ne commence pas par le code de l'équipement parent (${parent.id}.)`); continue; }
        if (explicites.has(code)) { err(def.nom, ligne, 'Code', `« ${code} » apparaît plusieurs fois dans la feuille`); continue; }
        explicites.add(code);
        existant = subs.find((x) => x.code === code) || null;
      } else {
        const ex = prendre(parParent.get(parent.id), norm(v.nom));
        existant = ex ? subs.find((x) => x.code === ex.code) : null;
        if (!existant) code = `${parent.id}.${pad2(Math.max(0, ...subs.map((x) => dernierNumero(x.code)), ...[...explicites].map(dernierNumero)) + 1)}`;
      }
      const fournisseur = v.f_nom ? [{ nom: v.f_nom, tel: v.f_tel || '', email: v.f_email || '' }] : null;
      if (existant) {
        if (maj) { existant.nom = v.nom; if (fournisseur) existant.fournisseurs = fournisseur; parent.ecrase = true; s.modifies++; } else s.existants++;
      } else {
        subs.push({ code, nom: v.nom, fournisseurs: fournisseur || [{ nom: 'Non renseigné', tel: '', email: '' }] });
        parent.nouvelleSub = true; s.nouveaux++;
      }
    }
  }
  for (const rec of eqIndex.values()) {
    if (!rec.existant || rec.ecrase || rec.nouvelleSub) {
      ecrire('equipements', rec.id, { id: rec.id, unit: rec.unit, system: rec.system, data: rec.data, ecrase: rec.existant });
    }
  }

  /* ============ ARTICLES DU MAGASIN ============ */
  if (present('pieces')) {
    const def = defOf('pieces'), s = stats('pieces');
    const lignes = lire(def, lecture.feuilles.pieces); s.lignes = lecture.feuilles.pieces.lignes.length;
    const parCode = new Map(ctx.pieces.map((p) => [p.code, p]));
    const parNom = indexer(ctx.pieces, (p) => `${p.categorie}|${norm(p.nom)}|${norm(p.ref)}`);
    const explicites = new Set();
    for (const { ligne, v } of lignes) {
      if (v.min !== undefined && v.max !== undefined && v.max < v.min) { err(def.nom, ligne, 'Seuil max', 'doit être supérieur ou égal au seuil min'); continue; }
      let ex = null; const code = v.code ? v.code.toUpperCase() : '';
      if (code) {
        if (explicites.has(code)) { err(def.nom, ligne, 'Code', `« ${code} » apparaît plusieurs fois dans la feuille`); continue; }
        explicites.add(code);
        ex = parCode.get(code);
        if (!ex) { err(def.nom, ligne, 'Code', `« ${code} » n'existe pas : laissez vide pour créer un nouvel article (le code est attribué automatiquement)`); continue; }
        if (ex.categorie !== v.cat) { err(def.nom, ligne, 'Catégorie', `l'article ${code} est de catégorie « ${ex.categorie} »`); continue; }
      } else ex = prendre(parNom, `${v.cat}|${norm(v.nom)}|${norm(v.ref)}`);
      const sous = (p) => { const o = {}; ['nom', 'contact', 'tel', 'email'].forEach((k) => { if (v[`${p}_${k}`]) o[k] = v[`${p}_${k}`]; }); return o; };
      const champs = { nom: v.nom, ...(v.ref ? { ref: v.ref } : {}), ...(v.serie ? { serie: v.serie } : {}), ...(v.prix !== undefined ? { prix: v.prix } : {}),
        ...(v.min !== undefined ? { min: v.min } : {}), ...(v.max !== undefined ? { max: v.max } : {}) };
      if (ex) {
        if (maj) {
          if (v.stock !== undefined && v.stock !== ex.stock) warn(def.nom, ligne, `stock de ${ex.code} non modifié (${ex.stock}) : le stock d'un article existant évolue par achats, sorties et retours`);
          const data = { ...clone(ex), ...champs, constructeur: { ...(ex.constructeur || {}), ...sous('c') }, fourn1: { ...(ex.fourn1 || {}), ...sous('f1') }, fourn2: { ...(ex.fourn2 || {}), ...sous('f2') } };
          ecrire('pieces', ex.code, { id: ex.code, unit: '', system: null, data, ecrase: true }); s.modifies++;
        } else {
          if (v.stock !== undefined && v.stock !== ex.stock) warn(def.nom, ligne, `« ${ex.code} » existe déjà : ligne ignorée (stock inchangé)`);
          s.existants++;
        }
      } else {
        const data = { nom: v.nom, ref: v.ref || '', serie: v.serie || '', prix: v.prix ?? 0, stock: v.stock ?? 0, min: v.min ?? 0, max: v.max ?? 0, categorie: v.cat,
          constructeur: { nom: '', contact: '', tel: '', email: '', ...sous('c') }, fourn1: { nom: '', tel: '', email: '', ...sous('f1') }, fourn2: { nom: '', tel: '', email: '', ...sous('f2') },
          mouvements: (v.stock ?? 0) > 0 ? [{ date: aujourdhui, qte: v.stock, type: 'Achat' }] : [] };
        const rec = { id: null, unit: '', system: null, data, variant: { Pièce: 'P', Outillage: 'O', Consommable: 'C' }[v.cat] };
        aCoder.push(rec); sortieDe('pieces').set(`nouveau:${aCoder.length}`, rec); s.nouveaux++;
      }
    }
  }

  /* ============ INTERVENANTS ET HABILITATIONS ============ */
  const interParMat = new Map(ctx.intervenants.map((i) => [norm(i.mat), i]));
  const interRec = new Map();     // matricule normalisé -> enregistrement à écrire
  const dossier = (m) => interRec.get(norm(m)) || null;
  if (present('intervenants')) {
    const def = defOf('intervenants'), s = stats('intervenants');
    const lignes = lire(def, lecture.feuilles.intervenants); s.lignes = lecture.feuilles.intervenants.lignes.length;
    const vus = new Set();
    for (const { ligne, v } of lignes) {
      const k = norm(v.mat);
      if (vus.has(k)) { err(def.nom, ligne, 'Matricule', `« ${v.mat} » apparaît plusieurs fois dans la feuille`); continue; }
      vus.add(k);
      const ex = interParMat.get(k);
      if (ex) {
        if (maj) {
          const data = { ...clone(ex), nom: v.nom, ...(v.poste ? { poste: v.poste } : {}), ...(v.role ? { role: v.role } : {}), ...(v.taux !== undefined ? { taux: v.taux } : {}) };
          const rec = { id: ex.mat, unit: '', system: null, data, ecrase: true }; interRec.set(k, rec); s.modifies++;
        } else { interRec.set(k, { id: ex.mat, unit: '', system: null, data: clone(ex), ecrase: false, existant: true }); s.existants++; }
      } else {
        if (v.taux === undefined) { err(def.nom, ligne, 'Taux horaire (DA/h)', 'valeur obligatoire pour un nouvel intervenant'); continue; }
        const data = { nom: v.nom, mat: v.mat, poste: v.poste || '', role: v.role || 'Technicien', taux: v.taux, habs: [], conges: [] };
        interRec.set(k, { id: v.mat, unit: '', system: null, data, ecrase: false }); s.nouveaux++;
      }
    }
  }
  if (present('habs')) {
    const def = defOf('habs'), s = stats('habs');
    const lignes = lire(def, lecture.feuilles.habs); s.lignes = lecture.feuilles.habs.lignes.length;
    const vus = new Set();
    for (const { ligne, v } of lignes) {
      let rec = dossier(v.mat);
      if (!rec) {
        const ex = interParMat.get(norm(v.mat));
        if (!ex) { err(def.nom, ligne, 'Matricule', `« ${v.mat} » est introuvable (ni dans la feuille Intervenants, ni dans l'application)`); continue; }
        rec = { id: ex.mat, unit: '', system: null, data: clone(ex), ecrase: false, existant: true }; interRec.set(norm(v.mat), rec);
      }
      const cle = `${norm(v.mat)}|${norm(v.intitule)}`;
      if (vus.has(cle)) { err(def.nom, ligne, 'Habilitation', `« ${v.intitule} » apparaît plusieurs fois pour ${v.mat}`); continue; }
      vus.add(cle);
      const habs = rec.data.habs || (rec.data.habs = []);
      const ex = habs.find((h) => norm(h.i) === norm(v.intitule));
      const m = v.validite ?? 12;
      if (ex) {
        if (maj) { ex.date = v.date; ex.m = v.validite ?? ex.m; rec.ecrase = true; s.modifies++; } else s.existants++;
      } else { habs.push({ i: v.intitule, date: v.date, m }); rec.ecrase = true; s.nouveaux++; }
    }
  }
  for (const rec of interRec.values()) if (!rec.existant || rec.ecrase) ecrire('intervenants', rec.id, { id: rec.id, unit: '', system: null, data: rec.data, ecrase: !!rec.existant || rec.ecrase });

  /* ============ PLANNING PRÉVENTIF (tâches lues dans les FMP) ============ */
  if (present('planning')) {
    const def = defOf('planning'), s = stats('planning');
    const lignes = lire(def, lecture.feuilles.planning); s.lignes = lecture.feuilles.planning.lignes.length;
    const plans = ctx.planning || [];
    const existants = indexer(plans, (p) => `${p.eq}|${p.periode}|${(p.fmp && p.fmp.ref) || ''}`);
    // charge actuelle de chaque intervenant (plans assignés) : la répartition automatique équilibre les tournées
    const charge = new Map();
    plans.forEach((p) => (p.assignes || []).forEach((n) => charge.set(n, (charge.get(n) || 0) + 1)));
    const inter = (ctx.intervenants || []).filter((i) => !i.externe);
    const parNomInter = new Map((ctx.intervenants || []).concat(ctx.prestataires || []).map((i) => [norm(i.nom), i]));
    const articles = (ctx.pieces || []);
    const trouverArticle = (txt, categorie) => {
      const t = norm(txt);
      const cat = articles.filter((p) => p.categorie === categorie);
      return cat.find((p) => norm(p.code) === t) || cat.find((p) => norm(p.nom) === t)
        || (() => { const c = cat.filter((p) => norm(p.nom).includes(t) || t.includes(norm(p.nom))); return c.length === 1 ? c[0] : null; })();
    };
    const listeArticles = (txt, categorie, ligne, colonne) => {
      const out = [];
      for (const brut of String(txt || '').split(/[;\n]/).map((x) => x.trim()).filter(Boolean)) {
        const m = brut.match(/^(.*?)(?:\s*[x×*]\s*(\d+)|\s*\((\d+)\))\s*$/i);
        const nom = (m ? m[1] : brut).trim(); const qte = m ? Number(m[2] || m[3]) : 1;
        const a = trouverArticle(nom, categorie);
        if (!a) { warn(def.nom, ligne, `colonne « ${colonne} » : « ${nom} » introuvable dans la catégorie ${categorie} du magasin — non repris (créez l'article puis réimportez en mode « mettre à jour »)`); continue; }
        const ex = out.find((x) => x.code === a.code); if (ex) ex.qte += qte; else out.push({ code: a.code, qte });
      }
      return out;
    };
    const vus = new Set();
    for (const { ligne, v } of lignes) {
      const viaRepere = parRepere.get(norm(v.eq));
      const eq = eqIndex.get(viaRepere || String(v.eq).toUpperCase());
      if (!eq) { err(def.nom, ligne, 'Code GMAO', `« ${v.eq} » : équipement introuvable (ni dans l'application, ni dans la feuille Équipements)`); continue; }
      const d = eq.data;
      if (!v.fmp) { err(def.nom, ligne, 'Lien FMP de la visite', 'lien vers la FMP obligatoire : les tâches de la visite y sont lues'); continue; }
      const fmp = fmpDuLien(ctx.fmps, v.fmp);
      if (!fmp) { err(def.nom, ligne, 'Lien FMP de la visite', `FMP « ${nomFichierLien(v.fmp) || v.fmp} » non fournie : ajoutez ce fichier à l'étape « FMP » de l'import`); continue; }
      const taches = tachesPourVisite(fmp, v.periode);
      const cle = `${d.code}|${v.periode}|${fmp.ref || ''}`;
      if (vus.has(cle)) { err(def.nom, ligne, null, `visite ${v.periode.toLowerCase()} de ${d.code} avec la FMP ${fmp.ref || fmp.fichier} en double dans la feuille`); continue; }
      vus.add(cle);
      // intervenants : ceux du fichier, sinon répartition automatique (technicien du système le moins chargé, hors congés)
      const date = v.date || aujourdhui;
      let assignes = [];
      if (v.inter) {
        let bon = true;
        for (const n of v.inter.split(/[;,\n]/).map((x) => x.trim()).filter(Boolean)) {
          const p = parNomInter.get(norm(n));
          if (!p) { err(def.nom, ligne, 'Intervenants (facultatif)', `« ${n} » n'est pas un intervenant connu`); bon = false; break; }
          assignes.push(p.nom);
        }
        if (!bon) continue;
      } else {
        const candidats = interDuSysteme(inter, d.system).filter((i) => !/magasin|exploitation|directeur/i.test(i.role || '') && !congeAt(i, date));
        if (candidats.length) {
          const choisi = [...candidats].sort((a, b) => (charge.get(a.nom) || 0) - (charge.get(b.nom) || 0) || a.nom.localeCompare(b.nom))[0];
          assignes = [choisi.nom]; charge.set(choisi.nom, (charge.get(choisi.nom) || 0) + 1);
        } else warn(def.nom, ligne, `aucun technicien disponible pour le système ${d.system} : plan créé sans intervenant (à affecter dans le plan)`);
      }
      const champs = {
        taches, fmp: { ref: fmp.ref, titre: fmp.titre, lien: v.fmp, fichier: fmp.fichier },
        piecesPrevues: listeArticles(v.pieces, 'Pièce', ligne, 'Pièces à utiliser'),
        consommables: listeArticles(v.conso, 'Consommable', ligne, 'Consommables à utiliser'),
        outillage: listeArticles(v.outil, 'Outillage', ligne, 'Outillage à utiliser'),
        intitule: fmp.titre,
      };
      const ex = prendre(existants, cle);
      if (ex) {
        if (maj) { ecrire('planning', ex.code, { id: ex.code, unit: ex.unit, system: ex.sys, data: { ...clone(ex), ...champs, ...(v.date ? { date: v.date } : {}), ...(v.inter ? { assignes } : {}) }, ecrase: true }); s.modifies++; }
        else s.existants++;
        continue;
      }
      const data = { code: null, unit: d.unit, sys: d.system, eq: d.code, nom: d.nom, periode: v.periode, date, dernier: '', assignes, ...champs,
        exc: false, motifExc: '', horaire: 'Jour', consignation: 'Non', termine: false };
      const rec = { id: null, unit: d.unit, system: d.system, data, collection: 'planning' };
      aCoder.push(rec); sortieDe('planning').set(`nouveau:${aCoder.length}`, rec); s.nouveaux++;
    }
  }

  /* ============ PRESTATAIRES ============ */
  if (present('prestataires')) {
    const def = defOf('prestataires'), s = stats('prestataires');
    const lignes = lire(def, lecture.feuilles.prestataires); s.lignes = lecture.feuilles.prestataires.lignes.length;
    const parRef = new Map(ctx.prestataires.map((p) => [norm(p.mat), p]));
    const parNom = indexer(ctx.prestataires, (p) => norm(p.nom));
    let max = Math.max(0, ...ctx.prestataires.map((p) => dernierNumero(p.mat)), ...lignes.map((l) => dernierNumero(l.v.ref || '')));
    const vus = new Set();
    const systemesAutorises = ctx.systemsList.filter(([c]) => c !== 'MESURE' && c !== 'CTRL');
    for (const { ligne, v } of lignes) {
      const cle = v.ref ? `ref:${norm(v.ref)}` : `nom:${norm(v.nom)}`;
      if (vus.has(cle)) { err(def.nom, ligne, null, `« ${v.ref || v.nom} » apparaît plusieurs fois dans la feuille`); continue; }
      vus.add(cle);
      let systemes;
      if (v.systemes) {
        systemes = [];
        let bon = true;
        for (const t of v.systemes.split(/[;,/|]/).map((x) => x.trim()).filter(Boolean)) {
          const c = systemesAutorises.find(([code, nom]) => norm(code) === norm(t) || norm(nom) === norm(t));
          if (!c) { err(def.nom, ligne, 'Systèmes (codes séparés par ;)', `« ${t} » est un système inconnu (voir la feuille Référentiels)`); bon = false; break; }
          if (!systemes.includes(c[0])) systemes.push(c[0]);
        }
        if (!bon) continue;
      }
      if (v.debut && v.fin && v.fin < v.debut) { err(def.nom, ligne, 'Fin du contrat', 'doit être postérieure au début du contrat'); continue; }
      const ex = v.ref ? parRef.get(norm(v.ref)) : prendre(parNom, norm(v.nom));
      if (v.ref && !ex && !/^EXT-\d+$/i.test(v.ref)) { err(def.nom, ligne, 'Référence', `« ${v.ref} » n'existe pas : laissez vide pour une création`); continue; }
      const champs = { nom: v.nom, ...(v.poste ? { poste: v.poste } : {}), ...(v.contrat ? { contrat: v.contrat } : {}), ...(v.contact ? { contact: v.contact } : {}),
        ...(v.tel ? { tel: v.tel } : {}), ...(v.email ? { email: v.email } : {}), ...(v.taux !== undefined ? { taux: v.taux } : {}), ...(v.debut ? { dateDebut: v.debut } : {}),
        ...(v.fin ? { dateFin: v.fin } : {}), ...(v.cdc ? { cdc: v.cdc } : {}), ...(systemes && systemes.length ? { systemes } : {}) };
      if (ex) {
        if (maj) { ecrire('prestataires', ex.mat, { id: ex.mat, unit: '', system: null, data: { ...clone(ex), ...champs }, ecrase: true }); s.modifies++; } else s.existants++;
      } else {
        if (v.taux === undefined) { err(def.nom, ligne, 'Taux horaire (DA/h)', 'valeur obligatoire pour un nouveau prestataire'); continue; }
        if (!systemes || !systemes.length) { err(def.nom, ligne, 'Systèmes (codes séparés par ;)', 'au moins un système est obligatoire pour un nouveau prestataire'); continue; }
        const mat = v.ref ? v.ref.toUpperCase() : `EXT-${pad2(++max)}`;
        const data = { nom: v.nom, mat, poste: v.poste || 'Prestataire externe', role: 'Prestataire', externe: true, systemes, taux: v.taux, contrat: v.contrat || '',
          dateDebut: v.debut || '', dateFin: v.fin || '', cdc: v.cdc || 'À préparer', contact: v.contact || '', tel: v.tel || '', email: v.email || '', habs: [], conges: [] };
        ecrire('prestataires', mat, { id: mat, unit: '', system: null, data }); s.nouveaux++;
      }
    }
  }

  /* ============ APPAREILS DE MESURE ============ */
  if (present('mesures')) {
    const def = defOf('mesures'), s = stats('mesures');
    const lignes = lire(def, lecture.feuilles.mesures); s.lignes = lecture.feuilles.mesures.lignes.length;
    const parCode = new Map(ctx.mesures.map((m) => [norm(m.code), m]));
    const parNom = indexer(ctx.mesures, (m) => norm(m.nom));
    let max = Math.max(0, ...ctx.mesures.map((m) => dernierNumero(m.code)), ...lignes.map((l) => dernierNumero(l.v.code || '')));
    const explicites = new Set();
    for (const { ligne, v } of lignes) {
      if (v.etalonnage && v.peremption && v.peremption < v.etalonnage) { err(def.nom, ligne, 'Date de péremption', 'doit être postérieure à la date d\'étalonnage'); continue; }
      if (v.organisme && !orgNoms().has(norm(v.organisme))) warn(def.nom, ligne, `organisme « ${v.organisme} » inconnu : enregistré tel quel (ajoutez-le dans la feuille Organismes pour le retrouver dans les listes)`);
      let ex = null;
      if (v.code) {
        if (explicites.has(norm(v.code))) { err(def.nom, ligne, 'Code', `« ${v.code} » apparaît plusieurs fois dans la feuille`); continue; }
        explicites.add(norm(v.code));
        ex = parCode.get(norm(v.code));
        if (!ex && !/^M-\d+$/i.test(v.code)) { err(def.nom, ligne, 'Code', `« ${v.code} » n'existe pas : laissez vide pour une création`); continue; }
      } else ex = prendre(parNom, norm(v.nom));
      const champs = { nom: v.nom, ...(v.etalonnage ? { etalonnage: v.etalonnage } : {}), ...(v.peremption ? { peremption: v.peremption } : {}), ...(v.organisme ? { organisme: v.organisme } : {}) };
      if (ex) {
        if (maj) { ecrire('mesures', ex.code, { id: ex.code, unit: '', system: null, data: { ...clone(ex), ...champs }, ecrase: true }); s.modifies++; } else s.existants++;
      } else {
        const code = v.code ? v.code.toUpperCase() : `M-${pad2(++max)}`;
        ecrire('mesures', code, { id: code, unit: '', system: null, data: { code, nom: v.nom, etalonnage: v.etalonnage || '', peremption: v.peremption || '', organisme: v.organisme || '' } }); s.nouveaux++;
      }
    }
  }

  /* ============ CONTRÔLES RÉGLEMENTAIRES ============ */
  if (present('controles')) {
    const def = defOf('controles'), s = stats('controles');
    const lignes = lire(def, lecture.feuilles.controles); s.lignes = lecture.feuilles.controles.lignes.length;
    const parCode = new Map(ctx.controles.map((c) => [norm(c.code), c]));
    const parNom = indexer(ctx.controles, (c) => `${norm(c.nom)}|${norm(c.organisme)}`);
    let max = Math.max(0, ...ctx.controles.map((c) => dernierNumero(c.code)), ...lignes.map((l) => dernierNumero(l.v.code || '')));
    const explicites = new Set();
    for (const { ligne, v } of lignes) {
      if (v.organisme && !orgNoms().has(norm(v.organisme))) warn(def.nom, ligne, `organisme « ${v.organisme} » inconnu : enregistré tel quel`);
      let ex = null;
      if (v.code) {
        if (explicites.has(norm(v.code))) { err(def.nom, ligne, 'Code', `« ${v.code} » apparaît plusieurs fois dans la feuille`); continue; }
        explicites.add(norm(v.code));
        ex = parCode.get(norm(v.code));
        if (!ex && !/^R-\d+$/i.test(v.code)) { err(def.nom, ligne, 'Code', `« ${v.code} » n'existe pas : laissez vide pour une création`); continue; }
      } else ex = prendre(parNom, `${norm(v.nom)}|${norm(v.organisme)}`);
      const champs = { nom: v.nom, ...(v.organisme ? { organisme: v.organisme } : {}), ...(v.periodicite ? { periodicite: v.periodicite } : {}), ...(v.statut ? { statut: v.statut } : {}) };
      if (ex) {
        if (maj) { ecrire('controles', ex.code, { id: ex.code, unit: '', system: null, data: { ...clone(ex), ...champs }, ecrase: true }); s.modifies++; } else s.existants++;
      } else {
        const code = v.code ? v.code.toUpperCase() : `R-${pad2(++max)}`;
        ecrire('controles', code, { id: code, unit: '', system: null, data: { code, nom: v.nom, organisme: v.organisme || '', periodicite: v.periodicite || 'Annuelle', statut: v.statut || 'À contrôler' } }); s.nouveaux++;
      }
    }
  }

  for (const nom of lecture.inconnues || []) warn(nom, 0, 'feuille non reconnue : ignorée');
  if (!resume.length && !erreurs.length) erreurs.push({ feuille: '', ligne: 0, message: 'Aucune donnée à importer : le fichier ne contient aucune ligne dans les feuilles du modèle.' });

  // erreurs et avertissements classés par feuille (ordre du modèle) puis par ligne
  const ordre = (x) => { const i = FEUILLES.findIndex((f) => f.nom === x.feuille); return i < 0 ? 99 : i; };
  const trier = (a, b) => ordre(a) - ordre(b) || a.ligne - b.ligne;
  erreurs.sort(trier); avertissements.sort(trier);

  const collections = {};
  for (const [col, m] of Object.entries(sortie)) collections[col] = [...m.values()];
  return { collections, aCoder, resume, erreurs, avertissements, onConflict };
}

// Total d'enregistrements à écrire, par collection
export function compterAEcrire(prep) {
  const out = {}; let total = 0;
  for (const [col, liste] of Object.entries(prep.collections)) {
    const nouveaux = liste.filter((r) => !r.ecrase).length;
    out[col] = { crees: nouveaux, modifies: liste.length - nouveaux }; total += liste.length;
  }
  return { parCollection: out, total };
}

// Attribue les numéros des nouveaux articles (P-001, O-001, C-001) auprès du serveur, puis fabrique le corps de la requête.
// reserver(collection, { variant, count }) doit retourner un tableau de codes, ou null en cas d'échec.
export async function completerCodes(prep, reserver) {
  const groupes = new Map();      // collection | variante | unité -> enregistrements (articles : P/O/C ; plans : par unité)
  for (const r of prep.aCoder) {
    const k = `${r.collection || 'pieces'}|${r.variant || ''}|${r.collection === 'planning' ? r.unit : ''}`;
    if (!groupes.has(k)) groupes.set(k, []); groupes.get(k).push(r);
  }
  for (const [k, recs] of groupes) {
    const [collection, variant, unit] = k.split('|');
    const codes = await reserver(collection, { ...(variant ? { variant } : {}), ...(unit ? { unit } : {}), count: recs.length });
    if (!codes || codes.length !== recs.length) return null;
    recs.forEach((r, i) => { r.id = codes[i]; r.data.code = codes[i]; });
  }
  return corpsRequete(prep);
}

export function corpsRequete(prep, { dryRun = false } = {}) {
  const collections = {};
  for (const [col, liste] of Object.entries(prep.collections)) {
    collections[col] = liste.map((r) => ({ id: r.id, unit: r.unit, system: r.system, data: r.data, ...(r.ecrase ? { overwrite: true } : {}) }));
  }
  return { onConflict: prep.onConflict, dryRun, collections };
}

/* ───────────────────────── Rapport d'erreurs ───────────────────────── */
export function genererRapport(ExcelJS, prep) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Erreurs et avertissements');
  ws.columns = [{ header: 'Type', width: 14 }, { header: 'Feuille', width: 26 }, { header: 'Ligne', width: 8 }, { header: 'Message', width: 110 }];
  ws.getRow(1).font = { bold: true };
  for (const e of prep.erreurs) ws.addRow(['Erreur', e.feuille, e.ligne || '', e.message]);
  for (const e of prep.avertissements) ws.addRow(['Avertissement', e.feuille, e.ligne || '', e.message]);
  return wb;
}
