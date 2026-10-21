// Lecture des Fiches de Maintenance Préventive (FMP) au format Excel (modèle SETRAM ORG-…-FOR-…).
// On ne prend que le tableau des opérations : ligne d'en-tête contenant « N° » et « Opération », puis une ligne par tâche
// (sous-équipement fusionné sur plusieurs lignes, périodicité). Le reste de la fiche (entête, émargements…) est ignoré.
const sansAccents = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
export const normFmp = (s) => sansAccents(s).toLowerCase().replace(/\s+/g, ' ').trim();

function texte(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join('');
    if ('result' in v) return texte(v.result);
    if ('text' in v) return texte(v.text);
    return '';
  }
  return String(v);
}
const propre = (s) => texte(s).replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

// Nom de fichier d'un lien (chemin réseau, URL, chemin relatif) : « ..\FMP\ORG-CFO-IIT-FOR-0001-A__FMP.xlsx » -> le nom seul
export function nomFichierLien(lien) {
  let t = String(lien || '').trim();
  try { t = decodeURIComponent(t); } catch { /* lien déjà décodé */ }
  t = t.replace(/[?#].*$/, '');
  const morceaux = t.split(/[\\/]/).filter(Boolean);
  return morceaux.length ? morceaux[morceaux.length - 1] : '';
}
// Référence documentaire : « ORG-CFO-IIT-FOR-0001-A » (dans la fiche ou au début du nom de fichier)
// le « _ » qui suit souvent la référence dans un nom de fichier sert de séparateur (pas de \\b, qui le considère comme une lettre)
const REF = /(?:^|[^A-Z0-9])([A-Z]{2,5}(?:-[A-Z0-9]{1,8}){1,4}-FOR-\d{3,5}(?:-[A-Z0-9]{1,3})?)(?=$|[^A-Z0-9])/;
export const refDepuis = (s) => { const m = String(s || '').toUpperCase().match(REF); return m ? m[1] : ''; };

// chemin = chemin relatif dans le dossier choisi (« FMP/CFO/ORG-CFO-….xlsx ») : distingue deux fiches de même nom
// rangées dans deux dossiers de système différents
export async function lireFMP(ExcelJS, buffer, nomFichier = '', chemin = '') {
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(buffer); } catch { throw new Error('fichier Excel (.xlsx) illisible'); }
  for (const ws of wb.worksheets) {
    let ref = '', titre = '', entete = 0, colN = 0, colOp = 0, colSous = 0, colPer = 0, colSecu = 0;
    const max = Math.min(ws.rowCount, 400);
    for (let r = 1; r <= max && !entete; r++) {
      ws.getRow(r).eachCell({ includeEmpty: false }, (cell, c) => {
        const t = propre(cell.value), n = normFmp(t);
        if (!ref && refDepuis(t)) ref = refDepuis(t);
        if (!titre && /fiche de maintenance preventive/.test(n)) titre = t;
        // en-têtes fusionnés : la valeur est répétée sur chaque colonne de la fusion, on garde la première
        if (!colOp && (n === 'operation' || n === 'operations' || n === 'operation a realiser' || n === 'taches' || n === 'tache')) colOp = c;
        if (!colN && (n === 'n°' || n === 'n' || n === 'no' || n === 'n° operation')) colN = c;
        if (!colSous && (n.startsWith('sous-equipement') || n.startsWith('sous equipement') || n === 'organe')) colSous = c;
        if (!colPer && n === 'periodicite') colPer = c;
        if (!colSecu && n === 'securitaire') colSecu = c;
      });
      if (colOp) entete = r; else { colN = 0; colSous = 0; colPer = 0; colSecu = 0; }
    }
    if (!entete) continue;
    const taches = []; let sous = ''; let vides = 0;
    for (let r = entete + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const op = propre(row.getCell(colOp).value);
      const debut = normFmp(propre(row.getCell(1).value));
      if (/^(commentaires?|observations?|outillage de mesure|n\.?b)\b/.test(debut)) break;
      if (!op) { if (++vides >= 2) break; continue; }
      vides = 0;
      if (colSous) { const s = propre(row.getCell(colSous).value); if (s) sous = s; }
      taches.push({
        n: colN ? propre(row.getCell(colN).value) : String(taches.length + 1),
        operation: op,
        sousEquipement: sous,
        periodicite: colPer ? propre(row.getCell(colPer).value) : '',
        securitaire: colSecu ? !!propre(row.getCell(colSecu).value) : false,
      });
    }
    if (!taches.length) continue;
    return { ref: ref || refDepuis(nomFichier), titre: titre || nomFichier.replace(/\.xlsx$/i, ''), fichier: nomFichier, chemin: chemin || nomFichier, taches };
  }
  throw new Error('tableau des opérations introuvable (en-tête « N° » / « Opération » attendu)');
}

// Index des FMP lues : par nom de fichier et par référence documentaire (plusieurs fiches possibles par clé :
// une fiche de même nom peut exister dans le dossier de chaque système)
const segments = (s) => String(s || '').split(/[\\/]/).filter(Boolean).map(normFmp);
export function indexerFMP(fmps) {
  const m = new Map();
  const ajouter = (k, f) => { if (!m.has(k)) m.set(k, []); if (!m.get(k).includes(f)) m.get(k).push(f); };
  for (const f of fmps) {
    if (f.fichier) ajouter('f:' + normFmp(f.fichier), f);
    if (f.ref) ajouter('r:' + f.ref.toUpperCase(), f);
  }
  return m;
}
// Nombre de dossiers en commun, en partant de la fin, entre le lien du planning et le chemin de la fiche
function proximite(lien, chemin) {
  let l = String(lien || '');
  try { l = decodeURIComponent(l); } catch { /* lien déjà décodé */ }
  const a = segments(l.replace(/[?#].*$/, '')), b = segments(chemin);
  let n = 0;
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
  return n;
}
const meilleure = (liste, lien) => {
  if (!liste || !liste.length) return null;
  if (liste.length === 1) return liste[0];
  return liste.map((f) => ({ f, p: proximite(lien, f.chemin || f.fichier) })).sort((x, y) => y.p - x.p)[0].f;
};
// FMP correspondant à un lien du planning : nom de fichier (le dossier départage les homonymes), sinon référence contenue dans le lien
export function fmpDuLien(index, lien) {
  if (!index || !lien) return null;
  const nom = nomFichierLien(lien);
  const parNom = index.get('f:' + normFmp(nom));
  if (parNom && parNom.length) return meilleure(parNom, lien);
  const ref = refDepuis(nom || lien);
  return ref ? meilleure(index.get('r:' + ref), lien) : null;
}

// Répartition des fiches lues par dossier de premier niveau (en général : un dossier par système)
export function resumeParDossier(fmps) {
  const r = new Map();
  for (const f of fmps) {
    const seg = String(f.chemin || '').split(/[\\/]/).filter(Boolean);
    const dossier = seg.length > 2 ? seg[seg.length - 2] : seg.length === 2 ? seg[0] : '(fichiers isolés)';
    r.set(dossier, (r.get(dossier) || 0) + 1);
  }
  return [...r].sort((a, b) => a[0].localeCompare(b[0]));
}

// Périodicité d'une tâche FMP (« Annuelle ») ramenée aux périodicités de la GMAO (« Annuel »)
export const periodeFmp = (s) => {
  const n = normFmp(s);
  if (/^hebdo/.test(n)) return 'Hebdomadaire';
  if (/^mensuel/.test(n)) return 'Mensuel';
  if (/^trimestriel/.test(n)) return 'Trimestriel';
  if (/^semestriel/.test(n)) return 'Semestriel';
  if (/^annuel/.test(n)) return 'Annuel';
  return '';
};

// Tâches d'une FMP pour une visite donnée : celles de la périodicité de la visite si la fiche en distingue plusieurs, sinon toutes.
// Le sous-équipement est rappelé en tête quand la fiche en couvre plusieurs.
export function tachesPourVisite(fmp, periode) {
  const avec = fmp.taches.filter((t) => periodeFmp(t.periodicite) === periode);
  const liste = avec.length ? avec : fmp.taches;
  const plusieurs = new Set(liste.map((t) => t.sousEquipement).filter(Boolean)).size > 1;
  return liste.map((t) => (plusieurs && t.sousEquipement ? `[${t.sousEquipement}] ` : '') + t.operation);
}
