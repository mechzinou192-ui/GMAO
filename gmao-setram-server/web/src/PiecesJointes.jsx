import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { flushAll } from './sync.js';
import { reduirePhoto } from './photo.js';

const heure = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); };

// Photos d'une DI ou d'un OT : prendre / choisir, voir en grand, supprimer.
export default function PiecesJointes({ collection, recordId, lectureSeule = false }) {
  const [fichiers, setFichiers] = useState(null);
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [aSupprimer, setASupprimer] = useState(null);
  const camera = useRef(null), galerie = useRef(null);

  const charger = useCallback(async () => {
    try { setFichiers(await api.listFiles(collection, recordId)); setErreur(''); }
    catch (e) { setFichiers([]); setErreur(e.network ? 'Serveur injoignable : photos non chargées.' : e.message); }
  }, [collection, recordId]);
  useEffect(() => { charger(); }, [charger]);

  async function ajouter(e) {
    const liste = [...(e.target.files || [])];
    e.target.value = '';
    if (!liste.length) return;
    setErreur(''); setEnvoi(true);
    try {
      await flushAll();                                  // l'élément doit être enregistré sur le serveur avant d'y rattacher une photo
      for (const f of liste) await api.uploadFile(collection, recordId, await reduirePhoto(f), (f.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg');
    } catch (err) { setErreur(err.network ? 'Serveur injoignable : la photo n\'a pas été envoyée.' : err.message); }
    setEnvoi(false); charger();
  }

  async function supprimer(id) {
    try { await api.deleteFile(id); setASupprimer(null); charger(); } catch (err) { setErreur(err.message); setASupprimer(null); }
  }

  const bouton = 'px-3 py-2 md:py-1.5 rounded-lg text-sm font-medium transition bg-slate-700 hover:bg-slate-600 text-slate-100 cursor-pointer';
  return (
    <div className="border-t border-slate-700 pt-3" data-testid="pieces-jointes">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
        <div className="text-xs text-slate-500">Photos{fichiers ? ` (${fichiers.length})` : ''}</div>
        {!lectureSeule && (
          <div className="flex gap-2">
            <label className={bouton}>📷 Prendre une photo<input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={ajouter} disabled={envoi} aria-label="Prendre une photo" /></label>
            <label className={bouton}>🖼 Choisir<input ref={galerie} type="file" accept="image/*" multiple className="hidden" onChange={ajouter} disabled={envoi} aria-label="Choisir des images" /></label>
          </div>)}
      </div>
      {envoi && <div className="text-xs text-slate-400 mb-2">Envoi en cours…</div>}
      {erreur && <div role="alert" className="text-xs text-rose-300 bg-rose-900/30 border border-rose-800 rounded px-2 py-1 mb-2">{erreur}</div>}
      {fichiers && fichiers.length === 0 && !erreur && <div className="text-xs text-slate-500">Aucune photo.</div>}
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {(fichiers || []).map((f) => (
          <div key={f.id} className="relative group" data-testid="photo">
            <a href={api.fileUrl(f.id)} target="_blank" rel="noopener noreferrer" title={`${f.name} — ${f.uploadedBy} ${heure(f.createdAt)}`}>
              <img src={api.fileUrl(f.id)} alt={f.name} loading="lazy" className="w-full aspect-square object-cover rounded-lg border border-slate-700" />
            </a>
            {!lectureSeule && (aSupprimer === f.id
              ? <div className="absolute inset-0 bg-black/70 rounded-lg flex flex-col items-center justify-center gap-1 text-xs">
                  <button className="px-2 py-1 rounded bg-rose-600 text-white" onClick={() => supprimer(f.id)}>Supprimer</button>
                  <button className="px-2 py-1 rounded bg-slate-600 text-white" onClick={() => setASupprimer(null)}>Annuler</button>
                </div>
              : <button className="absolute top-1 right-1 w-7 h-7 rounded-full bg-black/60 text-white text-xs" aria-label={`Supprimer ${f.name}`} onClick={() => setASupprimer(f.id)}>✕</button>)}
          </div>))}
      </div>
    </div>
  );
}
