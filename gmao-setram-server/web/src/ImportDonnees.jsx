import { useRef, useState } from 'react';
import { api } from './api.js';
import { flushAll, refreshAll } from './sync.js';
import { reserverNumeros } from './numbering.js';
import { indexerFMP, lireFMP } from './lib/fmp.js';
import { genererModele, lireClasseur, preparerImport, compterAEcrire, completerCodes, genererRapport, MAX_LIGNES } from './importExcel.js';

const MAX_OCTETS = 15 * 1024 * 1024;
const MAX_AFFICHEES = 60;
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function telecharger(buffer, nom) {
  const url = URL.createObjectURL(new Blob([buffer], { type: XLSX }));
  const a = document.createElement('a');
  a.href = url; a.download = nom; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}
const jour = () => new Date().toISOString().slice(0, 10);
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
const NOMS = { planning: 'plans préventifs', equipements: 'équipements', pieces: 'articles du magasin', intervenants: 'intervenants', prestataires: 'prestataires', organismes: 'organismes', mesures: 'appareils de mesure', controles: 'contrôles réglementaires' };

// ref : { units, unitAbbr, roles, cdcEtats, orgDom, systemsList, treeStruct, equipements, pieces, intervenants, prestataires, organismes, mesures, controles }
export default function ImportDonnees({ refs }) {
  const latest = useRef(refs); latest.current = refs;
  const lectureRef = useRef(null);
  const [etape, setEtape] = useState('choix');           // choix | lecture | revue | confirmation | envoi | termine
  const [nomFichier, setNomFichier] = useState('');
  const [mode, setMode] = useState('skip');
  const [prep, setPrep] = useState(null);
  const [erreurFatale, setErreurFatale] = useState('');
  const [rapport, setRapport] = useState(null);
  const [toutVoir, setToutVoir] = useState(false);
  const inputRef = useRef(null);
  // FMP (fiches de maintenance préventive) lues dans les fichiers choisis : les tâches du planning y sont prises
  const fmpsRef = useRef([]);
  const [fmps, setFmps] = useState([]);
  const [fmpErreurs, setFmpErreurs] = useState([]);
  const [fmpLecture, setFmpLecture] = useState(false);

  const recalculer = (lecture, m) => preparerImport(lecture, { ...latest.current, fmps: indexerFMP(fmpsRef.current), today: jour() }, { onConflict: m });

  async function choisirFMP(e) {
    const fichiers = [...(e.target.files || [])].filter((f) => /\.xlsx$/i.test(f.name) && !f.name.startsWith('~$'));
    e.target.value = '';
    if (!fichiers.length) return;
    setFmpLecture(true);
    const ExcelJS = (await import('exceljs')).default;
    const lues = [...fmpsRef.current]; const erreurs = [];
    for (const f of fichiers) {
      if (f.size > MAX_OCTETS) { erreurs.push(`${f.name} : fichier trop volumineux`); continue; }
      try {
        const fmp = await lireFMP(ExcelJS, await f.arrayBuffer(), f.name);
        const i = lues.findIndex((x) => x.fichier.toLowerCase() === f.name.toLowerCase());
        if (i >= 0) lues[i] = fmp; else lues.push(fmp);
      } catch (err) { erreurs.push(`${f.name} : ${err.message}`); }
    }
    fmpsRef.current = lues; setFmps(lues); setFmpErreurs(erreurs); setFmpLecture(false);
    if (lectureRef.current) setPrep(recalculer(lectureRef.current, mode));
  }

  async function modele() {
    try {
      const ExcelJS = (await import('exceljs')).default;
      const wb = genererModele(ExcelJS, latest.current);
      telecharger(await wb.xlsx.writeBuffer(), 'Modele_import_GMAO_SETRAM.xlsx');
    } catch (e) { setErreurFatale('Le modèle n\'a pas pu être généré : ' + (e.message || e)); }
  }

  async function choisir(e) {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    setErreurFatale(''); setRapport(null); setPrep(null); setToutVoir(false);
    if (!/\.xlsx$/i.test(f.name)) return setErreurFatale('Choisissez un fichier Excel au format .xlsx (pas .xls ni .csv : ouvrez-le dans Excel puis « Enregistrer sous » .xlsx).');
    if (f.size > MAX_OCTETS) return setErreurFatale('Fichier trop volumineux (15 Mo maximum).');
    setNomFichier(f.name); setEtape('lecture');
    try {
      await flushAll();                        // enregistre d'abord les modifications en attente
      await refreshAll();                      // données du serveur à jour : « ce qui existe déjà » est exact
      await attendre(0);
      const ExcelJS = (await import('exceljs')).default;
      const lecture = await lireClasseur(ExcelJS, await f.arrayBuffer());
      lectureRef.current = lecture;
      setPrep(recalculer(lecture, mode));
      setEtape('revue');
    } catch (err) {
      setErreurFatale(err.message || 'Lecture impossible.'); setEtape('choix');
    }
  }

  function changerMode(m) {
    setMode(m);
    if (lectureRef.current) setPrep(recalculer(lectureRef.current, m));
  }

  function recommencer() {
    lectureRef.current = null; setPrep(null); setRapport(null); setErreurFatale(''); setNomFichier(''); setEtape('choix'); setToutVoir(false);
  }

  async function telechargerRapport() {
    const ExcelJS = (await import('exceljs')).default;
    telecharger(await genererRapport(ExcelJS, prep).xlsx.writeBuffer(), `Rapport_import_${jour()}.xlsx`);
  }

  async function envoyer() {
    setEtape('envoi'); setErreurFatale('');
    try {
      const body = await completerCodes(prep, reserverNumeros);
      if (!body) { setEtape('confirmation'); return; }       // reserverNumeros a déjà affiché le motif
      const res = await api.importExcel(body);
      await refreshAll();
      setRapport(res); setEtape('termine');
    } catch (err) {
      setErreurFatale(err.network ? 'Serveur injoignable : rien n\'a été importé. Réessayez dans un instant.' : `Import refusé : ${err.message} — rien n'a été importé.`);
      setEtape('revue');
    }
  }

  const compte = prep ? compterAEcrire(prep) : null;
  const nbErr = prep ? prep.erreurs.length : 0;
  const peutImporter = prep && nbErr === 0 && compte.total > 0;
  const btn = 'px-3 py-1.5 rounded-lg text-sm font-medium transition ';
  const primaire = btn + 'bg-sky-600 hover:bg-sky-500 text-white';
  const secondaire = btn + 'bg-slate-700 hover:bg-slate-600 text-slate-100';

  return (
    <div className="space-y-4" data-testid="import-donnees">
      <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4">
        <div className="text-base font-semibold">Import de données depuis Excel</div>
        <div className="text-sm text-slate-400 mt-1">
          Chargez d'un coup vos équipements, le planning préventif (avec les tâches de vos FMP), articles du magasin, intervenants, prestataires, organismes, appareils de mesure et contrôles réglementaires.
          Le fichier est contrôlé <b>avant</b> tout enregistrement : si une ligne est incorrecte, rien n'est importé et l'erreur est indiquée (feuille, ligne, colonne).
          Vous pouvez recharger le même fichier sans risque de doublons.
        </div>
        <div className="flex flex-wrap gap-2 mt-3 items-center">
          <button className={secondaire} onClick={modele}>1. Télécharger le modèle Excel</button>
          <label className={primaire + ' cursor-pointer'}>
            2. Choisir mon fichier rempli
            <input ref={inputRef} type="file" accept=".xlsx" className="hidden" onChange={choisir} aria-label="Fichier Excel à importer" />
          </label>
          {nomFichier && etape !== 'choix' && <span className="text-xs text-slate-400">{nomFichier}</span>}
        </div>
        <div className="mt-3 rounded-lg border border-slate-700 bg-slate-900/60 p-3" data-testid="import-fmp">
          <div className="text-sm font-semibold">Fiches FMP (pour la feuille « Planning préventif »)</div>
          <div className="text-xs text-slate-400 mt-0.5">Ajoutez les fichiers FMP vers lesquels pointent les liens du planning : les tâches de chaque visite y sont lues automatiquement (tableau « N° / Opération »). L'ordre n'a pas d'importance : avant ou après le fichier principal.</div>
          <div className="flex flex-wrap gap-2 mt-2 items-center">
            <label className={secondaire + ' cursor-pointer'}>Ajouter des fichiers FMP
              <input type="file" accept=".xlsx" multiple className="hidden" onChange={choisirFMP} aria-label="Fichiers FMP" /></label>
            <label className={secondaire + ' cursor-pointer'}>Ajouter un dossier de FMP
              <input type="file" multiple webkitdirectory="" directory="" className="hidden" onChange={choisirFMP} aria-label="Dossier de FMP" /></label>
            {fmpLecture && <span className="text-xs text-slate-400">Lecture des FMP…</span>}
            {fmps.length > 0 && <span className="text-xs text-emerald-300" data-testid="fmp-compte">{fmps.length} FMP lue(s) — {fmps.reduce((a, f) => a + f.taches.length, 0)} tâches</span>}
            {fmps.length > 0 && <button className="text-xs text-slate-400 underline" onClick={() => { fmpsRef.current = []; setFmps([]); setFmpErreurs([]); if (lectureRef.current) setPrep(recalculer(lectureRef.current, mode)); }}>Retirer les FMP</button>}
          </div>
          {fmpErreurs.length > 0 && <ul className="mt-2 text-xs text-amber-200 space-y-0.5">{fmpErreurs.slice(0, 20).map((m) => <li key={m}>{m}</li>)}</ul>}
        </div>
        {erreurFatale && <div role="alert" className="mt-3 text-sm text-rose-300 bg-rose-900/30 border border-rose-800 rounded-lg px-3 py-2">{erreurFatale}</div>}
      </div>

      {etape === 'lecture' && <div className="text-sm text-slate-400">Lecture et contrôle du fichier…</div>}

      {prep && (etape === 'revue' || etape === 'confirmation' || etape === 'envoi') && (
        <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4">
          <div className="text-sm font-semibold mb-2">3. Contrôle du fichier</div>

          <div className="flex flex-wrap gap-4 text-sm mb-3">
            <label className="flex items-start gap-2 cursor-pointer">
              <input type="radio" name="mode" checked={mode === 'skip'} onChange={() => changerMode('skip')} className="mt-1" />
              <span><b>Ajouter uniquement ce qui est nouveau</b> <span className="text-slate-400">(recommandé) — les éléments déjà présents ne sont pas modifiés.</span></span>
            </label>
            <label className="flex items-start gap-2 cursor-pointer">
              <input type="radio" name="mode" checked={mode === 'update'} onChange={() => changerMode('update')} className="mt-1" />
              <span><b>Ajouter et mettre à jour</b> <span className="text-slate-400">— les éléments déjà présents sont modifiés avec les cellules renseignées.</span></span>
            </label>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="resume-import">
              <thead><tr className="text-left text-xs text-slate-400 border-b border-slate-700">
                <th className="py-1 pr-3">Feuille</th><th className="pr-3 text-right">Lignes</th><th className="pr-3 text-right">Nouveaux</th><th className="pr-3 text-right">Déjà présents</th><th className="text-right">Mis à jour</th>
              </tr></thead>
              <tbody>
                {prep.resume.map((r) => (
                  <tr key={r.cle} className="border-b border-slate-800">
                    <td className="py-1 pr-3">{r.nom}</td><td className="pr-3 text-right">{r.lignes}</td>
                    <td className="pr-3 text-right text-emerald-300">{r.nouveaux}</td><td className="pr-3 text-right text-slate-400">{r.existants}</td><td className="text-right text-amber-300">{r.modifies}</td>
                  </tr>))}
                {prep.resume.length === 0 && <tr><td colSpan={5} className="py-2 text-slate-500">Aucune feuille exploitable.</td></tr>}
              </tbody>
            </table>
          </div>

          {nbErr > 0 && (
            <div className="mt-3" data-testid="erreurs-import">
              <div className="text-sm font-semibold text-rose-300">{nbErr} erreur{nbErr > 1 ? 's' : ''} à corriger — rien ne sera importé tant qu'il en reste</div>
              <ul className="mt-1 text-sm space-y-1 max-h-72 overflow-y-auto">
                {(toutVoir ? prep.erreurs : prep.erreurs.slice(0, MAX_AFFICHEES)).map((e, i) => (
                  <li key={i} className="text-rose-200 bg-rose-900/20 border border-rose-900 rounded px-2 py-1">
                    <b>{e.feuille || 'Fichier'}</b>{e.ligne ? <> — ligne {e.ligne}</> : null} : {e.message}
                  </li>))}
              </ul>
              {nbErr > MAX_AFFICHEES && !toutVoir && <button className="text-xs text-sky-300 mt-1 underline" onClick={() => setToutVoir(true)}>Afficher les {nbErr - MAX_AFFICHEES} autres erreurs</button>}
              <div className="mt-2 flex gap-2">
                <button className={secondaire} onClick={telechargerRapport}>Télécharger la liste des erreurs (Excel)</button>
                <button className={secondaire} onClick={recommencer}>Choisir un autre fichier</button>
              </div>
              <div className="text-xs text-slate-500 mt-1">Corrigez le fichier dans Excel, enregistrez-le, puis choisissez-le à nouveau.</div>
            </div>
          )}

          {prep.avertissements.length > 0 && (
            <div className="mt-3" data-testid="avertissements-import">
              <div className="text-sm font-semibold text-amber-300">{prep.avertissements.length} avertissement{prep.avertissements.length > 1 ? 's' : ''} (n'empêchent pas l'import)</div>
              <ul className="mt-1 text-xs space-y-1 max-h-40 overflow-y-auto">
                {prep.avertissements.slice(0, MAX_AFFICHEES).map((e, i) => <li key={i} className="text-amber-200">{e.feuille}{e.ligne ? ` — ligne ${e.ligne}` : ''} : {e.message}</li>)}
              </ul>
            </div>
          )}

          {nbErr === 0 && compte.total === 0 && prep.resume.length > 0 && (
            <div className="mt-3 text-sm text-slate-300 bg-slate-900/60 border border-slate-700 rounded-lg px-3 py-2">
              Rien à importer : tout ce que contient ce fichier existe déjà dans l'application.
            </div>)}

          {peutImporter && etape !== 'confirmation' && (
            <div className="mt-3 flex items-center gap-3">
              <button className={primaire} onClick={() => setEtape('confirmation')}>4. Importer ({compte.total} élément{compte.total > 1 ? 's' : ''})</button>
              <button className={secondaire} onClick={recommencer}>Annuler</button>
            </div>)}

          {peutImporter && (etape === 'confirmation' || etape === 'envoi') && (
            <div className="mt-3 border border-sky-700 bg-sky-900/20 rounded-lg p-3" data-testid="confirmation-import">
              <div className="text-sm">
                Vous allez <b>créer {Object.values(compte.parCollection).reduce((a, c) => a + c.crees, 0)}</b> élément(s)
                {Object.values(compte.parCollection).some((c) => c.modifies > 0) && <> et <b>modifier {Object.values(compte.parCollection).reduce((a, c) => a + c.modifies, 0)}</b> élément(s) existant(s)</>}
                {' '}({Object.entries(compte.parCollection).map(([k, c]) => `${c.crees + c.modifies} ${NOMS[k] || k}`).join(', ')}).
                Les données sont visibles immédiatement par les utilisateurs autorisés. L'opération est enregistrée dans le journal d'audit.
              </div>
              <div className="mt-2 flex gap-2">
                <button className={primaire} disabled={etape === 'envoi'} onClick={envoyer}>{etape === 'envoi' ? 'Import en cours…' : 'Confirmer l\'import'}</button>
                <button className={secondaire} disabled={etape === 'envoi'} onClick={() => setEtape('revue')}>Retour</button>
              </div>
            </div>)}
        </div>
      )}

      {etape === 'termine' && rapport && (
        <div className="bg-emerald-900/20 border border-emerald-700 rounded-xl p-4" data-testid="import-termine">
          <div className="text-sm font-semibold text-emerald-300">Import terminé</div>
          <div className="text-sm mt-1">
            {rapport.totals.created} créé(s){rapport.totals.updated > 0 && <>, {rapport.totals.updated} mis à jour</>}{rapport.totals.skipped > 0 && <>, <span className="text-amber-300">{rapport.totals.skipped} ignoré(s) (code déjà utilisé entre-temps)</span></>}.
          </div>
          <ul className="text-xs text-slate-300 mt-1">
            {Object.entries(rapport.collections).map(([k, c]) => <li key={k}>{NOMS[k] || k} : {c.created} créé(s), {c.updated} mis à jour, {c.skipped} ignoré(s)</li>)}
          </ul>
          <div className="mt-3"><button className={primaire} onClick={recommencer}>Faire un autre import</button></div>
        </div>
      )}
      <div className="text-xs text-slate-500">Limites : {MAX_LIGNES.toLocaleString('fr-FR')} lignes par feuille, 15 Mo par fichier, format .xlsx.</div>
    </div>
  );
}
