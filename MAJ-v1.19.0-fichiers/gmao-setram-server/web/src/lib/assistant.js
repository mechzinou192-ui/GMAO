// Assistant GMAO : répond à des questions en langage courant à partir des données SAISIES dans la GMAO.
// Aucune IA externe : la question est analysée par mots-clés, la réponse est CALCULÉE (recherche, comptages, moyennes).
// Rien ne sort du poste ni du serveur ; l'assistant ne voit que ce que l'utilisateur a déjà le droit de voir.
//
// repondre(question, ctx) -> { type, titre, resume, chiffres:[[libellé, valeur]], sections:[{ titre, items:[{ texte, detail?, ref? }] }],
//                              suggestions:[texte], note? }     ref = { type: 'di' | 'ot' | 'eq' | 'piece', code }
// ctx = { dis, bts, equipements, intervenants, pieces, planning, aujourdhui:'YYYY-MM-DD', peutPersonnel:bool }
import { estOTPreventif } from './preventif.js';
import { habInfo } from './echeances.js';

/* ───────────── texte ───────────── */
export const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const MOTS_VIDES = new Set(('le la les un une des du de d l au aux et ou en sur sous pour par avec sans dans ce cet cette ces qui que quoi ' +
  'quel quelle quels quelles est sont a ont fait faire donne donner moi nous vous il elle on y ne pas plus tres comment combien pourquoi ' +
  'quand ou je j me mon ma mes son sa ses leur leurs tout tous toute toutes trouve trouver cherche chercher recherche montre montrer liste ' +
  'dis dire sais savoir peux peut veux voudrais svp stp merci bonjour salut probleme souci question info infos information informations ' +
  'gmao rapport fiche etat suite derniere dernier dernieres derniers').split(' '));
const racine = (m) => (m.length > 5 ? m.replace(/(ements|ement|ations|ation|ages|age|eurs|eur|euses|euse|ees|ee|es|s|x|e)$/, '') : m.replace(/s$/, ''));
export function motsCles(s) {
  return [...new Set(norm(s).replace(/[^a-z0-9.\-/ ]+/g, ' ').split(/[\s/]+/)
    .map((m) => m.replace(/^[.\-]+|[.\-]+$/g, ''))
    .filter((m) => m.length >= 3 && !MOTS_VIDES.has(m) && !/^\d+$/.test(m)))];
}
const contient = (mots, cible) => mots.some((m) => cible.includes(m));

/* ───────────── outils de calcul ───────────── */
const jour = (s) => String(s || '').slice(0, 10);
const joursEntre = (a, b) => Math.round((new Date(jour(b) + 'T00:00:00Z') - new Date(jour(a) + 'T00:00:00Z')) / 86400000);
const fr = (s) => (s ? jour(s).split('-').reverse().join('/') : '—');
const arrondi = (x, n = 1) => (Number.isFinite(x) ? Math.round(x * 10 ** n) / 10 ** n : 0);
const dec = (x) => String(arrondi(x)).replace('.', ',');            // affichage français : 5,2 h
const moyenne = (l) => (l.length ? l.reduce((a, b) => a + b, 0) / l.length : 0);
// pluriel : sigles invariables (OT, DI), autres mots + s (« plan préventif » -> « plans préventifs ») ; forme explicite sinon
const pluriel = (s) => s.split(' ').map((w) => (/^[A-Z0-9]+$/.test(w) || /[sxz]$/.test(w) ? w : w + 's')).join(' ');
const plur = (n, s, p) => `${n} ${n > 1 ? (p || pluriel(s)) : s}`;
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
function compter(liste, cle) {
  const m = new Map();
  for (const x of liste) { const k = cle(x); if (k) m.set(k, (m.get(k) || 0) + 1); }
  return [...m].sort((a, b) => b[1] - a[1]);
}
const vide = (v) => !v || v === '-' || v === '—';
const clos = (b) => b.etat === 'Clôturé';
const ouvert = (b) => b.etat !== 'Clôturé' && b.etat !== 'Annulé';
const systemeDe = (code, eqs) => { const e = eqs.find((x) => x.code === code); return e ? e.system : String(code || '').split('.')[0]; };
const nomsOT = (b) => [...new Set([...(b.intervenants || []).map((i) => i.nom), ...(b.assignes || []), ...(b.assigne ? [b.assigne] : [])].filter(Boolean))];
const tempsDe = (b, nom) => (b.intervenants || []).filter((i) => i.nom === nom).reduce((s, i) => s + (Number(i.temps) || 0), 0);
const dateOT = (b) => b.dateCloture || b.dateGeneration || '';
const refOT = (b) => ({ type: 'ot', code: b.code });

/* ───────────── intentions ───────────── */
const AIDE = ['aide', 'help', 'exemple', 'exemples', 'utiliser', 'utilise'];
const MOTS_ETAT = ['attente', 'retard', 'ouvert', 'ouverts', 'ouverte', 'ouvertes', 'cloture', 'clotures', 'transmettre', 'situation', 'bilan', 'resume', 'synthese', 'aujourd', 'semaine', 'tableau'];
const MOTS_STOCK = ['stock', 'rupture', 'seuil', 'magasin', 'article', 'articles', 'reste', 'disponible', 'quantite'];
const MOTS_TOP = ['frequent', 'frequente', 'frequentes', 'frequents', 'recurrent', 'recurrente', 'recurrentes', 'recurrents', 'top', 'souvent', 'classement', 'pires'];

export const SUGGESTIONS = [
  'Panne portillon bloqué',
  'Synthèse de K. Belaïd',
  'Historique de CFO.ALG.SST.01',
  'Pannes les plus fréquentes',
  'Articles sous le seuil',
  'Situation des OT',
];

export function trouverIntervenant(question, intervenants) {
  const q = norm(question); const mots = motsCles(question);
  let meilleur = null, score = 0;
  for (const p of intervenants || []) {
    if (p.mat && q.includes(norm(p.mat))) return p;
    const parts = norm(p.nom).split(/[\s.\-']+/).filter((x) => x.length >= 3);
    const s = parts.filter((x) => mots.includes(x)).length;          // nom entier (pas une partie de mot)
    if (s > score) { score = s; meilleur = p; }
  }
  return score > 0 ? meilleur : null;
}
export function trouverEquipement(question, equipements) {
  const q = norm(question);
  const parCode = (equipements || []).filter((e) => q.includes(norm(e.code))).sort((a, b) => b.code.length - a.code.length)[0];
  if (parCode) return parCode;
  return (equipements || []).filter((e) => e.nom && norm(e.nom).length >= 6 && q.includes(norm(e.nom))).sort((a, b) => b.nom.length - a.nom.length)[0] || null;
}

export function repondre(question, ctx) {
  const c = { dis: [], bts: [], equipements: [], intervenants: [], pieces: [], planning: [], aujourdhui: new Date().toISOString().slice(0, 10), peutPersonnel: false, ...ctx };
  const q = norm(question).trim();
  const mots = motsCles(question);
  if (!q || (mots.length === 0 && contient(q.split(/\s+/), AIDE)) || /^(aide|help|\?)$/.test(q)) return aide();

  const inter = trouverIntervenant(question, c.intervenants);
  const eq = trouverEquipement(question, c.equipements);
  const qMots = q.split(/[^a-z0-9.]+/);
  if (inter && (!eq || /synthese|intervenant|technicien|agent|qui est|bilan|profil|travail|travaille/.test(q))) return syntheseIntervenant(inter, c);
  if (eq) return syntheseEquipement(eq, c);
  if (contient(qMots, MOTS_STOCK) || /sous le seuil/.test(q)) return reponseStock(question, c);
  if (contient(qMots, MOTS_TOP) && /panne|defaillance|incident|equipement|probleme|di\b/.test(q)) return topPannes(c);
  if (contient(qMots, MOTS_ETAT) && /\b(ot|di|bt|ordre|demande|preventi|correcti|intervention|attente|retard|situation|bilan|aujourd)/.test(q)) return situation(c);
  return recherchePanne(question, c);
}

/* ───────────── réponses ───────────── */
function aide() {
  return {
    type: 'aide', titre: 'Que puis-je chercher pour vous ?',
    resume: 'Posez une question en français : je réponds à partir des DI, OT, plans, articles et intervenants enregistrés dans la GMAO (pour votre unité).',
    sections: [{ titre: 'Exemples', items: [
      { texte: 'Une panne : « disjoncteur qui déclenche », « portillon bloqué » → interventions similaires, causes, actions, pièces, durée' },
      { texte: 'Un intervenant : « synthèse de K. Belaïd » → correctif / préventif, heures, systèmes, points forts et points d\'attention' },
      { texte: 'Un équipement : « historique CFO.ALG.SST.01 » → pannes, causes récurrentes, MTBF, plans préventifs' },
      { texte: 'Le magasin : « stock fusible », « articles sous le seuil »' },
      { texte: 'La situation : « OT en attente pièce », « situation des OT », « pannes les plus fréquentes »' },
    ] }],
    suggestions: SUGGESTIONS,
  };
}

// Recherche de pannes similaires dans les DI et les OT correctifs (désignation, panne, cause, effet / action, consigne)
export function recherchePanne(question, c) {
  const mots = motsCles(question).map(racine).filter((m) => m.length >= 3);
  if (!mots.length) return aide();
  const docs = [];
  const otDeDI = new Map(c.bts.filter((b) => b.di).map((b) => [b.di, b]));
  for (const d of c.dis) {
    const b = otDeDI.get(d.code);
    docs.push({ di: d, ot: b || null, texte: norm([d.designation, d.nom, d.eq, b && b.panne, b && b.cause, b && b.effet, b && b.consigne].filter((x) => !vide(x)).join(' ')) });
  }
  for (const b of c.bts) if (!b.di && !estOTPreventif(b)) docs.push({ di: null, ot: b, texte: norm([b.panne, b.cause, b.effet, b.consigne, b.nom, b.eq].filter((x) => !vide(x)).join(' ')) });
  // poids : un mot rare compte plus qu'un mot fréquent
  const freq = new Map(mots.map((m) => [m, docs.filter((x) => x.texte.includes(m)).length]));
  const N = docs.length || 1;
  const trouves = docs.map((x) => {
    let s = 0, n = 0;
    for (const m of mots) if (x.texte.includes(m)) { s += Math.log(1 + N / (freq.get(m) || 1)); n++; }
    return { ...x, score: s, n };
  }).filter((x) => x.n > 0 && (mots.length < 3 || x.n >= Math.min(2, mots.length)))
    .sort((a, b) => b.score - a.score || (jour(b.di?.dateEvt || dateOT(b.ot)) > jour(a.di?.dateEvt || dateOT(a.ot)) ? 1 : -1));
  if (!trouves.length) {
    return { type: 'panne', titre: 'Aucune intervention trouvée', resume: `Rien dans la GMAO ne correspond à « ${question.trim()} ». Essayez d'autres mots (organe, symptôme) ou le code de l'équipement.`, suggestions: SUGGESTIONS };
  }
  const ots = trouves.map((x) => x.ot).filter((b) => b && clos(b));
  const causes = compter(ots, (b) => (vide(b.cause) ? '' : b.cause.trim()));
  const actions = compter(ots, (b) => (vide(b.effet) ? '' : b.effet.trim()));
  const pieces = compter(ots.flatMap((b) => b.pieces || []), (p) => p.code);
  const nomPiece = (code) => (c.pieces.find((p) => p.code === code) || {}).nom || code;
  const durees = ots.map((b) => Number(b.dureeIntervention) || 0).filter((x) => x > 0);
  const techs = compter(ots.flatMap((b) => nomsOT(b)), (n) => n);
  const eqs = compter(trouves, (x) => (x.di || x.ot).eq);
  const chiffres = [
    ['Interventions similaires', trouves.length],
    ['OT clôturés', ots.length],
    ['Durée moyenne', durees.length ? dec(moyenne(durees)) + ' h' : '—'],
    ['Équipements touchés', eqs.length],
  ];
  const sections = [];
  if (causes.length) sections.push({ titre: 'Causes les plus fréquentes', items: causes.slice(0, 5).map(([k, n]) => ({ texte: k, detail: plur(n, 'fois', 'fois') })) });
  if (actions.length) sections.push({ titre: 'Actions réalisées', items: actions.slice(0, 5).map(([k, n]) => ({ texte: k, detail: plur(n, 'fois', 'fois') })) });
  if (pieces.length) sections.push({ titre: 'Pièces utilisées', items: pieces.slice(0, 5).map(([k, n]) => ({ texte: nomPiece(k), detail: plur(n, 'OT'), ref: { type: 'piece', code: k } })) });
  if (techs.length) sections.push({ titre: 'Intervenants qui ont déjà traité ce type de panne', items: techs.slice(0, 4).map(([k, n]) => ({ texte: k, detail: plur(n, 'OT') })) });
  sections.push({ titre: 'Interventions (les plus proches d\'abord)', items: trouves.slice(0, 8).map((x) => {
    const d = x.di, b = x.ot;
    return {
      texte: `${d ? d.code : b.code} — ${d ? d.designation : b.panne} (${(d || b).eq})`,
      detail: `${fr(d ? d.dateEvt : dateOT(b))}${b ? ' · ' + b.code + ' ' + b.etat + (b && !vide(b.cause) ? ' · cause : ' + b.cause : '') : ' · sans OT'}`,
      ref: b ? refOT(b) : { type: 'di', code: d.code },
    };
  }) });
  const top = causes[0];
  return {
    type: 'panne', titre: `Panne : « ${question.trim()} »`,
    resume: `${plur(trouves.length, 'intervention similaire')} dans la GMAO, sur ${plur(eqs.length, 'équipement')}.` +
      (top ? ` Cause la plus fréquente : ${top[0]} (${top[1]} fois).` : '') +
      (actions[0] ? ` Action la plus courante : ${actions[0][0]}.` : '') +
      (durees.length ? ` Durée moyenne d'intervention : ${dec(moyenne(durees))} h.` : ''),
    chiffres, sections,
    suggestions: eqs.slice(0, 2).map(([e]) => `Historique de ${e}`),
  };
}

// Synthèse d'un intervenant : activité correctif / préventif, heures, systèmes, points forts, points d'attention
export function syntheseIntervenant(p, c) {
  if (!c.peutPersonnel) {
    return { type: 'intervenant', titre: p.nom, resume: 'La synthèse d\'un intervenant est réservée aux profils ayant accès à la gestion du personnel ou aux indicateurs.', suggestions: SUGGESTIONS };
  }
  const nom = p.nom;
  const siens = c.bts.filter((b) => nomsOT(b).includes(nom));
  const corr = siens.filter((b) => !estOTPreventif(b)), prev = siens.filter(estOTPreventif);
  const corrClos = corr.filter(clos), prevClos = prev.filter(clos);
  const heures = siens.reduce((s, b) => s + tempsDe(b, nom), 0);
  const depuis90 = siens.filter((b) => dateOT(b) && joursEntre(dateOT(b), c.aujourdhui) <= 90).length;
  const parSys = compter(siens, (b) => systemeDe(b.eq, c.equipements));
  const parEq = compter(siens, (b) => b.eq);
  const ouverts = siens.filter(ouvert).sort((a, b) => (jour(a.dateGeneration) < jour(b.dateGeneration) ? -1 : 1));
  const anciens = ouverts.filter((b) => b.dateGeneration && joursEntre(b.dateGeneration, c.aujourdhui) > 7);
  // comparaison avec l'équipe, à système égal
  const dureeMoy = (l) => moyenne(l.map((b) => Number(b.dureeIntervention) || 0).filter((x) => x > 0));
  const forts = [], attention = [];
  for (const [sys, n] of parSys) {
    const corrSys = c.bts.filter((b) => !estOTPreventif(b) && clos(b) && systemeDe(b.eq, c.equipements) === sys);
    const lui = corrClos.filter((b) => systemeDe(b.eq, c.equipements) === sys);
    if (lui.length >= 3 && corrSys.length >= 5 && lui.length / corrSys.length >= 0.4) forts.push(`Référent ${sys} : ${pct(lui.length, corrSys.length)} % des dépannages ${sys} clôturés`);
    const autres = corrSys.filter((b) => !nomsOT(b).includes(nom));
    if (lui.length >= 3 && autres.length >= 3) {
      const a = dureeMoy(lui), e = dureeMoy(autres);
      if (a && e && a <= 0.85 * e) forts.push(`Dépannage rapide sur ${sys} : ${dec(a)} h en moyenne contre ${dec(e)} h pour les autres intervenants`);
      if (a && e && a >= 1.25 * e) attention.push(`Durée de dépannage sur ${sys} plus longue que l'équipe : ${dec(a)} h contre ${dec(e)} h (à mettre en regard de la difficulté des pannes)`);
    }
    void n;
  }
  // visites « dues » : clôturées, ou ouvertes depuis plus de 7 jours (une visite du jour n'est pas un retard)
  const prevDues = prev.filter((b) => clos(b) || (ouvert(b) && b.dateGeneration && joursEntre(b.dateGeneration, c.aujourdhui) > 7));
  const tauxPrev = prevDues.length ? pct(prevClos.length, prevDues.length) : null;
  if (prevDues.length >= 3 && tauxPrev >= 90) forts.push(`Préventif tenu : ${tauxPrev} % des visites dues clôturées (${prevClos.length}/${prevDues.length})`);
  if (prevDues.length >= 3 && tauxPrev < 70) attention.push(`Préventif à rattraper : ${tauxPrev} % des visites dues clôturées (${prevClos.length}/${prevDues.length})`);
  if (parSys.length >= 3) forts.push(`Polyvalent : intervient sur ${parSys.length} systèmes (${parSys.map(([s]) => s).join(', ')})`);
  const nokSignales = prev.reduce((s, b) => s + (b.taches || []).filter((t) => (t.res === 'NOK' || t.res === 'Non OK')).length, 0);
  if (nokSignales >= 2) forts.push(`Vigilant en visite : ${nokSignales} anomalies signalées lors du préventif`);
  const habs = (p.habs || []).map((h) => ({ h, ...habInfo(h.date, h.m) }));
  const habOk = habs.filter((x) => x.niveau === 'vert');
  if (habs.length && habOk.length === habs.length) forts.push(`Habilitations à jour (${habs.map((x) => x.h.i).join(', ')})`);
  for (const x of habs.filter((x) => x.niveau === 'rouge' || x.niveau === 'orange')) attention.push(`Habilitation ${x.h.i} : ${x.c}`);
  if (anciens.length) attention.push(`${plur(anciens.length, 'OT ouvert')} depuis plus de 7 jours`);
  const conge = (p.conges || []).find((x) => x.au >= c.aujourdhui);
  if (!siens.length) attention.push('Aucun OT enregistré à son nom dans la période chargée');

  const chiffres = [
    ['OT correctifs', `${corr.length} (${corrClos.length} clôturés)`],
    ['OT préventifs', `${prev.length} (${prevClos.length} clôturés)`],
    ['Heures pointées', dec(heures) + ' h'],
    ['OT ces 90 derniers jours', depuis90],
    ['OT ouverts', ouverts.length],
    ['Durée moyenne de dépannage', corrClos.length ? dec(dureeMoy(corrClos)) + ' h' : '—'],
  ];
  const sections = [];
  if (forts.length) sections.push({ titre: 'Points forts (d\'après les données)', items: forts.map((t) => ({ texte: t })) });
  if (attention.length) sections.push({ titre: 'Points d\'attention', items: attention.map((t) => ({ texte: t })) });
  if (parSys.length) sections.push({ titre: 'Répartition par système', items: parSys.map(([s, n]) => ({ texte: s, detail: `${plur(n, 'OT')} · ${pct(n, siens.length)} %` })) });
  if (parEq.length) sections.push({ titre: 'Équipements les plus suivis', items: parEq.slice(0, 5).map(([e, n]) => ({ texte: e, detail: plur(n, 'OT'), ref: { type: 'eq', code: e } })) });
  if (ouverts.length) sections.push({ titre: 'OT en cours', items: ouverts.slice(0, 6).map((b) => ({ texte: `${b.code} — ${b.nom || b.eq}`, detail: `${b.etat} depuis le ${fr(b.dateGeneration)}`, ref: refOT(b) })) });
  return {
    type: 'intervenant', titre: `${p.nom} — ${p.poste || p.role || ''}`.replace(/ — $/, ''),
    resume: `${plur(siens.length, 'OT')} : ${corr.length} en correctif, ${prev.length} en préventif, ${dec(heures)} h pointées.` +
      (parSys[0] ? ` Système principal : ${parSys[0][0]}.` : '') + (conge ? ` En congé du ${fr(conge.du)} au ${fr(conge.au)}.` : ''),
    chiffres, sections,
    note: 'Synthèse calculée sur les OT saisis dans la GMAO : à lire avec le contexte (difficulté des pannes, absences, charge). Ce n\'est pas une évaluation.',
    suggestions: parEq[0] ? [`Historique de ${parEq[0][0]}`] : [],
  };
}

// Synthèse d'un équipement : pannes, causes récurrentes, MTBF, préventif
export function syntheseEquipement(e, c) {
  const dis = c.dis.filter((d) => d.eq === e.code).sort((a, b) => (jour(a.dateEvt) < jour(b.dateEvt) ? 1 : -1));
  const ots = c.bts.filter((b) => b.eq === e.code);
  const corr = ots.filter((b) => !estOTPreventif(b)), prev = ots.filter(estOTPreventif);
  const dates = dis.map((d) => jour(d.dateEvt || d.dateCreation)).filter(Boolean).sort();
  const ecarts = dates.slice(1).map((d, i) => joursEntre(dates[i], d)).filter((x) => x >= 0);
  const mtbf = ecarts.length ? arrondi(moyenne(ecarts), 0) : null;
  const pannes = compter(dis, (d) => d.designation);
  const causes = compter(corr.filter(clos), (b) => (vide(b.cause) ? '' : b.cause.trim()));
  const durees = corr.filter(clos).map((b) => Number(b.dureeIntervention) || 0).filter((x) => x > 0);
  const plans = c.planning.filter((p) => p.eq === e.code);
  const d90 = dis.filter((d) => joursEntre(d.dateEvt || d.dateCreation, c.aujourdhui) <= 90).length;
  const sections = [];
  if (pannes.length) sections.push({ titre: 'Pannes les plus fréquentes', items: pannes.slice(0, 5).map(([k, n]) => ({ texte: k, detail: plur(n, 'fois', 'fois') })) });
  if (causes.length) sections.push({ titre: 'Causes relevées', items: causes.slice(0, 5).map(([k, n]) => ({ texte: k, detail: plur(n, 'fois', 'fois') })) });
  if (plans.length) sections.push({ titre: 'Préventif', items: plans.map((p) => ({ texte: `${p.code} — ${p.periode || 'au compteur'}`, detail: `prochaine échéance ${fr(p.date)}${p.date && p.date < c.aujourdhui ? ' (en retard)' : ''}` })) });
  if (dis.length) sections.push({ titre: 'Dernières DI', items: dis.slice(0, 6).map((d) => {
    const b = c.bts.find((x) => x.di === d.code);
    return { texte: `${d.code} — ${d.designation}`, detail: `${fr(d.dateEvt)} · ${b ? b.code + ' ' + b.etat : d.etat}`, ref: b ? refOT(b) : { type: 'di', code: d.code } };
  }) });
  const recurrente = pannes[0] && pannes[0][1] >= 3 ? ` Panne récurrente : « ${pannes[0][0]} » (${pannes[0][1]} fois) — à analyser (AMDEC, plan d'action).` : '';
  return {
    type: 'equipement', titre: `${e.code} — ${e.nom}`,
    resume: `${plur(dis.length, 'DI')} (${d90} sur 90 jours), ${plur(corr.length, 'OT correctif')}, ${plur(prev.length, 'OT préventif')}.` +
      (mtbf !== null ? ` Temps moyen entre deux pannes : ${mtbf} jours.` : '') + recurrente,
    chiffres: [
      ['DI', dis.length], ['DI sur 90 jours', d90], ['MTBF (jours)', mtbf ?? '—'],
      ['Durée moyenne de dépannage', durees.length ? dec(moyenne(durees)) + ' h' : '—'],
      ['OT ouverts', ots.filter(ouvert).length], ['Plans préventifs', plans.length],
    ],
    sections,
    suggestions: pannes[0] ? [pannes[0][0]] : [],
    ref: { type: 'eq', code: e.code },
  };
}

function reponseStock(question, c) {
  const mots = motsCles(question).filter((m) => !MOTS_STOCK.includes(m) && !['sous', 'seuil', 'piece', 'pieces'].includes(m)).map(racine);
  const vises = mots.length ? c.pieces.filter((p) => mots.some((m) => norm(`${p.nom} ${p.code} ${p.ref || ''}`).includes(m))) : [];
  const sousSeuil = c.pieces.filter((p) => Number(p.stock) < Number(p.min));
  const liste = vises.length ? vises : sousSeuil;
  const titre = vises.length ? `Stock : « ${question.trim()} »` : 'Articles sous le seuil minimum';
  return {
    type: 'stock', titre,
    resume: vises.length ? `${plur(vises.length, 'article trouvé', 'articles trouvés')}.` : `${plur(sousSeuil.length, 'article')} sous le seuil minimum.`,
    sections: [{ titre: vises.length ? 'Articles' : 'À réapprovisionner', items: liste.slice(0, 12).map((p) => ({
      texte: `${p.code} — ${p.nom}`,
      detail: `stock ${p.stock}${p.min !== undefined ? ' (min ' + p.min + ')' : ''}${Number(p.stock) < Number(p.min) ? ' · sous le seuil' : ''}`,
      ref: { type: 'piece', code: p.code },
    })) }],
    suggestions: [],
  };
}

function topPannes(c) {
  const d90 = c.dis.filter((d) => joursEntre(d.dateEvt || d.dateCreation, c.aujourdhui) <= 90);
  const parEq = compter(d90, (d) => d.eq), parPanne = compter(d90, (d) => d.designation);
  return {
    type: 'top', titre: 'Pannes les plus fréquentes (90 derniers jours)',
    resume: `${plur(d90.length, 'DI')} sur 90 jours.` + (parEq[0] ? ` Équipement le plus touché : ${parEq[0][0]} (${parEq[0][1]} DI).` : ''),
    sections: [
      { titre: 'Équipements', items: parEq.slice(0, 8).map(([k, n]) => ({ texte: k, detail: plur(n, 'DI'), ref: { type: 'eq', code: k } })) },
      { titre: 'Pannes', items: parPanne.slice(0, 8).map(([k, n]) => ({ texte: k, detail: plur(n, 'fois', 'fois') })) },
    ],
    suggestions: parEq[0] ? [`Historique de ${parEq[0][0]}`] : [],
  };
}

function situation(c) {
  const attente = c.bts.filter((b) => b.etat === 'En attente pièce');
  const enCours = c.bts.filter((b) => b.etat === 'En cours');
  const aTransmettre = c.dis.filter((d) => d.etat === 'À Transmettre');
  const retardPrev = c.planning.filter((p) => p.date && p.date < c.aujourdhui);
  const vieux = c.bts.filter((b) => ouvert(b) && b.dateGeneration && joursEntre(b.dateGeneration, c.aujourdhui) > 7);
  const sousSeuil = c.pieces.filter((p) => Number(p.stock) < Number(p.min));
  const habs = c.intervenants.filter((p) => !p.externe).flatMap((p) => (p.habs || []).map((h) => ({ p, ...habInfo(h.date, h.m) }))).filter((x) => x.niveau === 'rouge');
  return {
    type: 'situation', titre: 'Situation de la maintenance',
    resume: `${plur(enCours.length, 'OT en cours', 'OT en cours')}, ${attente.length} en attente de pièce, ${plur(aTransmettre.length, 'DI')} à transmettre, ${plur(retardPrev.length, 'plan préventif')} en retard.`,
    chiffres: [['OT en cours', enCours.length], ['OT en attente pièce', attente.length], ['OT ouverts > 7 jours', vieux.length],
      ['DI à transmettre', aTransmettre.length], ['Préventifs en retard', retardPrev.length], ['Articles sous le seuil', sousSeuil.length],
      ...(c.peutPersonnel ? [['Habilitations expirées', habs.length]] : [])],
    sections: [
      ...(attente.length ? [{ titre: 'OT en attente de pièce', items: attente.slice(0, 8).map((b) => ({ texte: `${b.code} — ${b.nom || b.eq}`, detail: fr(b.dateGeneration), ref: refOT(b) })) }] : []),
      ...(vieux.length ? [{ titre: 'OT ouverts depuis plus de 7 jours', items: vieux.slice(0, 8).map((b) => ({ texte: `${b.code} — ${b.nom || b.eq}`, detail: `${b.etat} · ${joursEntre(b.dateGeneration, c.aujourdhui)} j`, ref: refOT(b) })) }] : []),
      ...(retardPrev.length ? [{ titre: 'Préventifs en retard', items: retardPrev.slice(0, 8).map((p) => ({ texte: `${p.code} — ${p.nom || p.eq}`, detail: `échéance ${fr(p.date)}` })) }] : []),
    ],
    suggestions: ['Pannes les plus fréquentes', 'Articles sous le seuil'],
  };
}
