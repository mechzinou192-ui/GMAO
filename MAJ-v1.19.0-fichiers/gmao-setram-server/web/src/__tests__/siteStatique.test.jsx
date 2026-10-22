import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import { createDemoApi } from '../demo/apiDemo.js';

const JPEG = () => new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0])], { type: 'image/jpeg' });
const GIF = () => new Blob([new TextEncoder().encode('GIF89a-pas-une-photo-acceptee')], { type: 'image/jpeg' });
const AN = new Date().getFullYear();
const MDP = { 'demo.admin': 'Demo2026-Admin', 'demo.responsable': 'Demo2026-Resp', 'demo.charge': 'Demo2026-Charge', 'demo.expert': 'Demo2026-Expert', 'demo.resp.dg': 'Demo2026-RespDG', 'demo.technicien': 'Demo2026-Tech', 'demo.exploitation': 'Demo2026-Expl', 'demo.magasin': 'Demo2026-Mag', 'demo.direction': 'Demo2026-Dir' };
const nouveau = () => createDemoApi({ stockage: null });
const connecte = async (api, id) => { await api.login(id, MDP[id]); return api; };

describe('serveur de démonstration intégré au navigateur', () => {
  it('connexion : bon / mauvais mot de passe, session, déconnexion, événement de session expirée', async () => {
    const api = nouveau();
    const evts = []; const h = () => evts.push(1); window.addEventListener('gmao:unauth', h);
    await expect(api.me()).rejects.toMatchObject({ status: 401 });
    await expect(api.list('dis')).rejects.toMatchObject({ status: 401 }); expect(evts.length).toBeGreaterThan(0);
    await expect(api.login('demo.admin', 'mauvais')).rejects.toMatchObject({ status: 401, message: 'Identifiant ou mot de passe incorrect.' });
    await expect(api.login('inconnu', 'x')).rejects.toMatchObject({ status: 401 });
    const r = await api.login('Demo.Admin ', MDP['demo.admin']);
    expect(r.user).toMatchObject({ id: 'demo.admin', superAdmin: true, mustChangePw: false, role: 'Super Admin' });
    expect((await api.me()).user.id).toBe('demo.admin');
    await api.logout(); await expect(api.me()).rejects.toMatchObject({ status: 401 });
    window.removeEventListener('gmao:unauth', h);
  });

  it('profils de démonstration annoncés', async () => {
    const d = await nouveau().demo();
    expect(d).toMatchObject({ demo: true, statique: true }); expect(d.comptes.map((c) => c.id).sort()).toEqual(Object.keys(MDP).sort());
    expect(d.comptes.every((c) => c.motDePasse && c.description)).toBe(true);
  });

  it('les droits sont ceux du vrai serveur : chacun ne voit que son périmètre', async () => {
    const tech = await connecte(nouveau(), 'demo.technicien');
    const ots = (await tech.list('bts')).items;                                     // profil Technicien : les OT seulement
    expect(ots.length).toBeGreaterThan(5); expect(ots.every((i) => i.unit === 'Alger' && ['CFO', 'CFA', 'BIL'].includes(i.system))).toBe(true);
    expect((await tech.list('dis')).items).toHaveLength(0);
    const dir = await connecte(nouveau(), 'demo.direction');
    expect(new Set((await dir.list('dis')).items.map((i) => i.unit)).size).toBeGreaterThanOrEqual(4);
    await expect(dir.save('dis', 'DI-X', { unit: 'Alger', system: 'CFO', data: { code: 'DI-X' } })).rejects.toMatchObject({ status: 403 });
    expect((await (await connecte(nouveau(), 'demo.exploitation')).list('bts')).items).toHaveLength(0);
    expect((await (await connecte(nouveau(), 'demo.magasin')).list('pieces')).items.length).toBeGreaterThanOrEqual(15);
    const adm = await connecte(nouveau(), 'demo.admin');
    expect((await adm.list('equipements')).items.length).toBeGreaterThanOrEqual(60);
    expect((await tech.list('systemes')).items.length).toBeGreaterThan(5);          // référentiels lisibles par tous
  });

  it('enregistrement : création, modification versionnée, conflit, doublon, suppression, synchronisation par « since »', async () => {
    const api = await connecte(nouveau(), 'demo.admin');
    const t0 = (await api.list('pieces')).serverTime;
    const c = await api.save('pieces', 'P-TEST', { unit: '', system: null, data: { code: 'P-TEST', nom: 'Essai', stock: 1 } });
    expect(c).toMatchObject({ id: 'P-TEST', version: 1, deleted: false });
    await expect(api.save('pieces', 'P-TEST', { unit: '', data: { nom: 'doublon' } })).rejects.toMatchObject({ status: 409, code: 'EXISTS' });
    const m = await api.save('pieces', 'P-TEST', { unit: '', data: { code: 'P-TEST', nom: 'Essai 2', stock: 2 }, version: 1 });
    expect(m.version).toBe(2);
    await expect(api.save('pieces', 'P-TEST', { unit: '', data: {}, version: 1 })).rejects.toMatchObject({ status: 409, code: 'CONFLICT', current: expect.objectContaining({ version: 2 }) });
    const depuis = (await api.list('pieces', t0)).items; expect(depuis.map((i) => i.id)).toEqual(['P-TEST']);
    await api.remove('pieces', 'P-TEST');
    expect((await api.list('pieces')).items.some((i) => i.id === 'P-TEST')).toBe(false);
    expect((await api.list('pieces', t0)).items.find((i) => i.id === 'P-TEST')).toMatchObject({ deleted: true, version: 3 });
    expect((await api.save('pieces', 'P-TEST', { unit: '', data: { nom: 'recréé' } })).version).toBe(4);
    await expect(api.save('dis', 'DI-?', { unit: 'Paris', data: {} })).rejects.toMatchObject({ status: 400 });
    await expect(api.save('dis', 'a/b', { unit: 'Alger', data: {} })).rejects.toMatchObject({ status: 400 });
    await expect(api.list('inconnue')).rejects.toMatchObject({ status: 404 });
  });

  it('numérotation : mêmes formats que le serveur, continue après les données de démonstration, sans doublon', async () => {
    const api = await connecte(nouveau(), 'demo.responsable');
    const existants = Object.keys(api._etat().records.dis).filter((id) => id.startsWith(`DI-ALG-${AN}-`)).map((id) => Number(id.slice(-4)));
    const [a, b] = await api.nextCodes('dis', { unit: 'Alger', count: 2 });
    expect(a).toBe(`DI-ALG-${AN}-${String(Math.max(...existants) + 1).padStart(4, '0')}`); expect(b.endsWith(String(Math.max(...existants) + 2).padStart(4, '0'))).toBe(true);
    expect((await api.nextCodes('bts', { unit: 'Oran', variant: 'prev' }))[0]).toMatch(new RegExp(`^OT-PREV-ORN-${AN}-\\d{4}$`));
    expect((await api.nextCodes('pieces', { variant: 'P' }))[0]).toMatch(/^P-0\d\d$/);
    await expect(api.nextCodes('dis', { unit: 'Paris' })).rejects.toMatchObject({ status: 400 });
    await expect(api.nextCodes('dis', { unit: 'Alger', count: 0 })).rejects.toMatchObject({ status: 400 });
    await expect(api.nextCodes('equipements', { unit: 'Alger' })).rejects.toMatchObject({ status: 404 });
    await expect((await connecte(nouveau(), 'demo.direction')).nextCodes('dis', { unit: 'Alger' })).rejects.toMatchObject({ status: 403 });
    // un code déjà pris est sauté
    const x = nouveau(); await connecte(x, 'demo.admin');
    const [n1] = await x.nextCodes('dis', { unit: 'Sétif' });                         // 3 DI de démonstration existent déjà : le suivant est 0004
    expect(n1.endsWith('0004')).toBe(true);
    await x.save('dis', n1.replace(/\d{4}$/, '0005'), { unit: 'Sétif', system: 'CFO', data: { code: 'x' } });
    expect((await x.nextCodes('dis', { unit: 'Sétif' }))[0].endsWith('0006')).toBe(true);   // 0005 déjà pris : sauté
  });

  it('import Excel : tout ou rien, ignorer / mettre à jour, simulation, droits', async () => {
    const adm = await connecte(nouveau(), 'demo.admin');
    const corps = (nom, extra = {}) => ({ collections: { organismes: [{ id: 'ORG-99', data: { code: 'ORG-99', nom } }], pieces: [{ id: 'P-IMP', data: { code: 'P-IMP', nom: 'x' } }] }, ...extra });
    let r = await adm.importExcel(corps('A'));
    expect(r.totals).toEqual({ created: 2, updated: 0, skipped: 0 });
    r = await adm.importExcel(corps('B')); expect(r.totals).toEqual({ created: 0, updated: 0, skipped: 2 });
    expect((await adm.list('organismes')).items.find((i) => i.id === 'ORG-99').data.nom).toBe('A');
    r = await adm.importExcel(corps('C', { onConflict: 'update' })); expect(r.totals.updated).toBe(2);
    expect((await adm.list('organismes')).items.find((i) => i.id === 'ORG-99')).toMatchObject({ version: 2, data: { nom: 'C' } });
    r = await adm.importExcel({ dryRun: true, collections: { mesures: [{ id: 'M-S', data: { nom: 'a' } }] } });
    expect(r).toMatchObject({ dryRun: true, totals: { created: 1 } }); expect((await adm.list('mesures')).items.some((i) => i.id === 'M-S')).toBe(false);
    const avant = (await adm.list('pieces')).items.length;
    for (const mauvais of [{ collections: { pieces: [{ id: 'P-OK', data: {} }], equipements: [{ id: 'E', unit: 'Paris', data: {} }] } }, { collections: { pieces: [{ id: 'D', data: {} }, { id: 'D', data: {} }] } }, { collections: {} }, { onConflict: 'x', collections: { pieces: [] } }])
      await expect(adm.importExcel(mauvais)).rejects.toMatchObject({ status: 400 });
    expect((await adm.list('pieces')).items.length).toBe(avant);                             // rien écrit
    await expect((await connecte(nouveau(), 'demo.responsable')).importExcel(corps('Z'))).rejects.toMatchObject({ status: 403 });
  });

  it('photos : formats contrôlés par le contenu, limites, droits, suppression', async () => {
    const api = await connecte(nouveau(), 'demo.responsable');
    const di = (await api.list('dis')).items[0].id;
    const f = await api.uploadFile('dis', di, JPEG(), '../../fuite.jpg');
    expect(f).toMatchObject({ name: 'fuite.jpg', mime: 'image/jpeg', uploadedBy: 'demo.responsable' });
    expect(await api.listFiles('dis', di)).toHaveLength(1);
    await expect(api.uploadFile('dis', di, GIF(), 'x.jpg')).rejects.toMatchObject({ status: 415 });   // même annoncé « image/jpeg »
    await expect(api.uploadFile('dis', di, new Blob([]), 'x.jpg')).rejects.toMatchObject({ status: 400 });
    await expect(api.uploadFile('equipements', 'X', JPEG(), 'x.jpg')).rejects.toMatchObject({ status: 400 });
    await expect(api.uploadFile('dis', 'DI-INCONNU', JPEG(), 'x.jpg')).rejects.toMatchObject({ status: 404 });
    for (let i = 1; i < 12; i++) await api.uploadFile('dis', di, JPEG(), `p${i}.jpg`);
    await expect(api.uploadFile('dis', di, JPEG(), 'trop.jpg')).rejects.toMatchObject({ status: 409 });
    await expect((await connecte(nouveau(), 'demo.direction')).uploadFile('dis', di, JPEG(), 'x.jpg')).rejects.toMatchObject({ status: 403 });
    await api.deleteFile(f.id); expect(await api.listFiles('dis', di)).toHaveLength(11);
    await expect(api.deleteFile(f.id)).rejects.toMatchObject({ status: 404 });
  });

  it('comptes et mots de passe verrouillés ; consultation réservée au super admin ; journal tenu', async () => {
    const adm = await connecte(nouveau(), 'demo.admin');
    for (const appel of [() => adm.createUser({ id: 'x' }), () => adm.updateUser('demo.admin', {}), () => adm.deleteUser('demo.technicien'), () => adm.changePassword('a', 'b')])
      await expect(appel()).rejects.toMatchObject({ status: 403, message: 'Désactivé dans la version de démonstration.' });
    expect((await adm.users()).users).toHaveLength(9); expect((await adm.users()).users.every((u) => !('password' in u))).toBe(true);
    await adm.save('pieces', 'P-J', { unit: '', data: { nom: 'x' } });
    expect((await adm.audit()).entries[0]).toMatchObject({ action: 'create', record_id: 'P-J', user_id: 'demo.admin' });
    const r = await connecte(nouveau(), 'demo.responsable');
    await expect(r.users()).rejects.toMatchObject({ status: 403 }); await expect(r.audit()).rejects.toMatchObject({ status: 403 });
  });

  it('l\'état survit au rechargement de la page (onglet) mais pas à la fermeture : stockage de session', async () => {
    const magasin = new Map(); const stockage = { getItem: (k) => (magasin.has(k) ? magasin.get(k) : null), setItem: (k, v) => magasin.set(k, v) };
    const a = createDemoApi({ stockage }); await a.login('demo.admin', MDP['demo.admin']);
    await a.save('pieces', 'P-PERSIST', { unit: '', data: { nom: 'gardé' } });
    const b = createDemoApi({ stockage });                                           // « rechargement » : nouvelle instance, même onglet
    expect((await b.me()).user.id).toBe('demo.admin');
    expect((await b.list('pieces')).items.some((i) => i.id === 'P-PERSIST')).toBe(true);
    const c = createDemoApi({ stockage: { getItem: () => null, setItem: () => {} } });  // nouvel onglet : démo à zéro
    await c.login('demo.admin', MDP['demo.admin']); expect((await c.list('pieces')).items.some((i) => i.id === 'P-PERSIST')).toBe(false);
    const casse = createDemoApi({ stockage: { getItem: () => '{pas du json', setItem: () => { throw new Error('quota'); } } });   // stockage cassé : aucune panne
    await casse.login('demo.admin', MDP['demo.admin']); await casse.save('pieces', 'P-Q', { unit: '', data: { nom: 'x' } });
  });
});

/* ───── l'application complète, branchée sur ce serveur intégré (aucun simulacre) ───── */
vi.mock('../api.js', async () => { const { createDemoApi: c } = await import('../demo/apiDemo.js'); return { api: c({ stockage: null }) }; });
import { api as apiSite } from '../api.js';
import App from '../App.jsx';

describe('application complète en mode site statique', () => {
  beforeEach(() => { cleanup(); apiSite._reinitialiser(); window.HTMLElement.prototype.scrollIntoView = vi.fn(); window.history.replaceState(null, '', '/'); });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  const seConnecter = async (profil) => {
    render(<App />);
    const bandeau = await screen.findByTestId('bandeau-demo');
    expect(bandeau.textContent).toContain('restent dans votre navigateur');
    fireEvent.click(within(bandeau).getByText(profil));
    fireEvent.click(screen.getByText('Se connecter'));
    await screen.findByTestId('menu-lateral');
  };
  const onglet = (re) => fireEvent.click([...screen.getByTestId('menu-lateral').querySelectorAll('nav button')].find((b) => re.test(b.textContent)));

  it('connexion par un profil, liste des DI avec les données de démonstration, ouverture du détail', async () => {
    await seConnecter('Responsable maintenance');
    onglet(/Maintenance corrective/);
    const cartes = await screen.findByTestId('di-cartes');
    const code = Object.keys(apiSite._etat().records.dis).filter((id) => id.startsWith('DI-ALG-')).sort().reverse()[0];   // unité courante : Alger
    await waitFor(() => expect(document.body.textContent).toContain(code));
    expect(cartes.textContent).toMatch(/DI-[A-Z]{3}-\d{4}-\d{4}/);
  });

  it('création d\'une DI par l\'interface : numéro attribué, DI enregistrée', async () => {
    await seConnecter('Responsable maintenance');
    onglet(/Maintenance corrective/);
    fireEvent.click(await screen.findByText('Nouvelle DI'));
    const select = await waitFor(() => { const s = [...document.querySelectorAll('select')].find((x) => [...x.options].some((o) => o.value.startsWith('CFO.ALG'))); if (!s) throw new Error('equipements'); return s; });
    fireEvent.change(select, { target: { value: 'CFO.ALG.SST.01' } });
    const avant = Object.keys(apiSite._etat().records.dis).length;
    fireEvent.click(screen.getByText('Créer la DI'));
    await waitFor(() => expect(Object.keys(apiSite._etat().records.dis).length).toBe(avant + 1));
    const nouvelle = Object.values(apiSite._etat().records.dis).find((r) => r.createdAt === Object.values(apiSite._etat().records.dis).map((x) => x.createdAt).sort().pop());
    expect(nouvelle.id).toMatch(new RegExp(`^DI-ALG-${AN}-\\d{4}$`)); expect(nouvelle).toMatchObject({ unit: 'Alger', system: 'CFO' });
  });

  it('tous les écrans du super administrateur s\'affichent avec les données de démonstration, sans erreur', async () => {
    const erreurs = vi.spyOn(console, 'error').mockImplementation(() => {});
    await seConnecter('Super administrateur');
    const boutons = [...screen.getByTestId('menu-lateral').querySelectorAll('nav button')];
    expect(boutons.length).toBeGreaterThanOrEqual(8);
    for (const b of boutons) { fireEvent.click(b); await new Promise((r) => setTimeout(r, 30)); expect(document.body.textContent.length).toBeGreaterThan(200); }
    const fatales = erreurs.mock.calls.filter((c) => /The above error occurred|Uncaught|Cannot read/.test(String(c[0])));
    expect(fatales).toEqual([]);
  });

  it('compteurs : plans au compteur, relevé contrôlé, relevé exigé à la clôture de l’OT', async () => {
    await seConnecter('Responsable maintenance');
    await waitFor(() => expect(document.body.textContent).toContain('Compteurs : plans à déclencher'));     // alerte sur l'accueil
    onglet(/Préventif/);
    fireEvent.click(await screen.findByText('Compteurs (km, heures)'));
    await waitFor(() => expect(document.body.textContent).toContain('Révision bogie (30 000 km)'));
    expect(document.body.textContent).toContain('MR.ALG.BOG.01-KM');
    // relevé : une valeur inférieure au dernier relevé est refusée, une valeur supérieure est enregistrée
    const ligne = screen.getAllByText('MR.ALG.BOG.01-KM').find((e) => e.tagName === 'TD');
    fireEvent.click(ligne);
    const champ = await screen.findByLabelText(/Valeur lue/);
    fireEvent.change(champ, { target: { value: '10' } });
    fireEvent.click(screen.getByText('Enregistrer le relevé'));
    expect(await screen.findByText(/inférieure au dernier relevé/)).toBeTruthy();
    const avant = apiSite._etat().records.compteurs_eq['MR.ALG.BOG.01-KM'].data.releves.length;
    fireEvent.change(champ, { target: { value: '999999' } });
    fireEvent.click(screen.getByText('Enregistrer le relevé'));
    await waitFor(() => expect(apiSite._etat().records.compteurs_eq['MR.ALG.BOG.01-KM'].data.releves.length).toBe(avant + 1), { timeout: 4000 });
    // déclenchement du plan dépassé puis clôture : le relevé du compteur est obligatoire
    const lignePlan = screen.getByText('Contrôle usure disques de frein (10 000 km)').closest('tr');
    fireEvent.click(within(lignePlan).getByText('Déclencher'));
    const ot = await waitFor(() => { const b = Object.values(apiSite._etat().records.bts || {}).find((r) => r.data.plan && r.data.etat === 'En cours' && r.data.eq === 'MR.ALG.BOG.02'); if (!b) throw new Error('OT'); return b; }, { timeout: 4000 });
    expect(ot.id).toMatch(/^OT-PREV-ALG-/);
    onglet(/Ordres de travail/);
    fireEvent.click((await screen.findAllByText(ot.id))[0]);
    const bloc = await screen.findByTestId('releve-cloture');
    expect(bloc.textContent).toContain('Obligatoire pour clôturer');
  });

  it('modules : maintenance corrective (DI + OT correctifs), OT préventifs seuls, matériaux séparés de l’arborescence', async () => {
    await seConnecter('Responsable maintenance');
    const recs = Object.values(apiSite._etat().records.bts);
    const corr = recs.find((r) => r.unit === 'Alger' && !r.data.plan && r.data.type !== 'Préventive');
    const prev = recs.find((r) => r.unit === 'Alger' && r.data.plan);
    onglet(/Maintenance corrective/);
    fireEvent.click(await screen.findByText('OT correctifs'));
    await waitFor(() => expect(document.body.textContent).toContain(corr.id));
    expect(document.body.textContent).not.toContain(prev.id);
    onglet(/Ordres de travail/);
    await waitFor(() => expect(document.body.textContent).toContain(prev.id));
    expect(document.body.textContent).not.toContain(corr.id);
    onglet(/Arborescence/);
    await waitFor(() => expect(document.body.textContent).toContain('+ Sous-système'));
    expect(document.body.textContent).not.toContain('Ajouter un système');            // systèmes : super administrateur seul
    expect(document.body.textContent).not.toContain('Appareils de mesure');
    onglet(/Matériaux/);
    for (const t of ['Appareils de mesure', 'Contrôles réglementaires', 'Organismes']) expect(await screen.findByText(t)).toBeTruthy();
  });

  it('OT : une DS non traitée bloque la clôture et met l’OT en attente de pièce', async () => {
    const ot = Object.values(apiSite._etat().records.bts).find((r) => r.unit === 'Alger' && !r.data.plan && r.data.etat === 'En cours');
    const t = new Date().toISOString();
    (apiSite._etat().records.dss ||= {})['DS-TEST-0001'] = { id: 'DS-TEST-0001', unit: '', system: null, version: 1, deleted: false, createdAt: t, updatedAt: t,
      data: { code: 'DS-TEST-0001', eq: ot.data.eq, nom: ot.data.nom, designation: 'Test', piece: 'P-001', pieceNom: 'Fusible 10A', qte: 1, prix: 120, bt: ot.id, etat: 'Transmis au Magasinier' } };
    await seConnecter('Responsable maintenance');
    onglet(/Maintenance corrective/);
    fireEvent.click(await screen.findByText('OT correctifs'));
    fireEvent.click((await screen.findAllByText(ot.id))[0]);
    const bloc = await screen.findByTestId('ot-attente-piece');
    expect(bloc.textContent).toContain('DS-TEST-0001');
    fireEvent.click(screen.getByText(/Clôturer/, { selector: 'button' }));
    expect(await screen.findByText(/sortie magasin n'est pas traitée|tâches contrôlées|intervenant/)).toBeTruthy();
    expect(apiSite._etat().records.bts[ot.id].data.etat).not.toBe('Clôturé');
  });

  it('calendrier préventif : vue « Année complète » (plans × 12 mois), retour au mois par un clic sur une visite', async () => {
    await seConnecter('Responsable maintenance');
    onglet(/Préventif/);
    fireEvent.click(await screen.findByText(/Calendrier \/ Agenda/));
    fireEvent.change(await screen.findByTestId('calendrier-vue'), { target: { value: 'annee' } });
    const vue = await screen.findByTestId('vue-annuelle');
    const an = new Date().getFullYear();
    expect(document.body.textContent).toContain('Année ' + an);
    for (const m of ['Janv.', 'Juin', 'Déc.']) expect(vue.textContent).toContain(m);
    const plans = Object.values(apiSite._etat().records.planning).filter((r) => r.unit === 'Alger' && !r.data.declenchement);
    expect(plans.some((r) => vue.textContent.includes(r.id))).toBe(true);
    expect(vue.textContent).toContain('Visites par mois');
    const pastille = vue.querySelector('button.gm-pastille');
    fireEvent.click(pastille);
    expect(screen.queryByTestId('vue-annuelle')).toBeNull();                       // retour à la vue du mois
    expect(screen.getByTestId('calendrier-vue').value).toBe('mois');
    // vue « Jour » : la journée de la visite cliquée, en détail, avec impression
    const jour = pastille.title.slice(0, 10).split('/').reverse().join('-');
    fireEvent.change(screen.getByTestId('calendrier-vue'), { target: { value: 'jour' } });
    const vj = await screen.findByTestId('vue-jour');
    expect(vj.textContent).toMatch(/[1-9]\d* visite\(s\)/);
    expect(vj.textContent).toContain('Imprimer la journée');
    expect(vj.textContent).toMatch(/Voir les \d+ tâche\(s\)/);
    fireEvent.click(screen.getAllByText('›')[0]);                                    // jour suivant
    const lendemain = new Date(jour + 'T12:00:00'); lendemain.setDate(lendemain.getDate() + 1);
    expect(document.body.textContent).toContain(lendemain.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
  });

  it('préventif : filtre des plans par intervenant', async () => {
    await seConnecter('Responsable maintenance');
    onglet(/Préventif/);
    const filtre = within(await screen.findByTestId('filtre-intervenant')).getByRole('combobox');
    const noms = [...filtre.options].map((o) => o.value).filter(Boolean);
    expect(noms.length).toBeGreaterThan(1);
    const plans = Object.values(apiSite._etat().records.planning).filter((r) => r.unit === 'Alger');
    const nom = noms[0];
    fireEvent.change(filtre, { target: { value: nom } });
    const attendus = plans.filter((r) => (r.data.assignes || []).includes(nom));
    expect(await screen.findByText(new RegExp('Plans assignés à'))).toBeTruthy();
    expect(document.body.textContent).toContain('Plans assignés à ' + nom + ' : ' + attendus.length);
    const autre = plans.find((r) => !(r.data.assignes || []).includes(nom) && !r.data.declenchement);
    if (autre) expect([...document.querySelectorAll('tbody td')].some((td) => td.textContent === autre.id)).toBe(false);
  });

  it('indicateurs : tableau de bord graphique (chiffres clés, graphes, tableaux de données)', async () => {
    await seConnecter('Direction');
    onglet(/Indicateurs/);
    const tb = await screen.findByTestId('kpi-graphiques');
    for (const t of ['Disponibilité', 'MTBF', 'MTTR', 'Activité de maintenance — 12 derniers mois', 'Charge préventive / corrective', 'Top 10 des équipements en panne']) expect(tb.textContent).toContain(t);
    expect(tb.querySelectorAll('svg').length).toBeGreaterThanOrEqual(4);
    expect(tb.querySelectorAll('details.gm-viz-table').length).toBeGreaterThanOrEqual(4);
  });

  it('suppression : DI « À transmettre » supprimée côté serveur ; DI avec OT et équipement utilisé : suppression refusée avec la raison', async () => {
    const recs = apiSite._etat().records;
    const diLibre = Object.values(recs.dis).find((r) => r.unit === 'Alger' && r.data.etat === 'À Transmettre' && !Object.values(recs.bts).some((b) => b.data.di === r.id));
    const diAvecOT = Object.values(recs.dis).find((r) => r.unit === 'Alger' && Object.values(recs.bts).some((b) => b.data.di === r.id));
    await seConnecter('Responsable maintenance');
    onglet(/Maintenance corrective/);
    fireEvent.click((await screen.findAllByText(diLibre.id))[0]);
    fireEvent.click(await screen.findByText('Supprimer la DI ' + diLibre.id));
    expect(await screen.findByText(/Supprimer définitivement la DI/)).toBeTruthy();
    fireEvent.click(screen.getByText('Oui, supprimer'));
    await waitFor(() => expect(apiSite._etat().records.dis[diLibre.id].deleted).toBe(true), { timeout: 4000 });
    expect(apiSite._etat().audit.some((a) => a.action === 'delete' && a.record_id === diLibre.id)).toBe(true);   // tracé dans le journal
    fireEvent.click((await screen.findAllByText(diAvecOT.id))[0]);
    const zone = await screen.findByTestId('zone-suppression');
    expect(zone.textContent).toMatch(/Suppression impossible : un OT a été généré/);
    expect(within(zone).getByText('Supprimer').disabled).toBe(true);
  });

  it('suppression directe : équipement créé par erreur (bouton ✕ de l’arborescence), appareil de mesure, organisme utilisé refusé', async () => {
    const recs = apiSite._etat().records;
    const modele = Object.values(recs.equipements).find((r) => r.unit === 'Alger' && r.data.system === 'CFO');
    const code = modele.data.system + '.ALG.' + modele.data.subCode + '.99';
    const t = new Date().toISOString();
    recs.equipements[code] = { ...modele, id: code, version: 1, createdAt: t, updatedAt: t, data: { ...modele.data, code, nom: 'Créé par erreur', sousEquip: [] } };
    await seConnecter('Super administrateur');
    onglet(/Arborescence/);
    fireEvent.click(await screen.findByText('CFO', { selector: 'span', exact: false }));
    const sous = (await screen.findAllByText(new RegExp('\\(CFO\\.ALG\\.' + modele.data.subCode + '\\)')))[0];
    fireEvent.click(sous.closest('button'));
    fireEvent.click(await screen.findByLabelText('Supprimer ' + code));
    expect(await screen.findByText(/Supprimer définitivement l'équipement/)).toBeTruthy();       // confirmation ouverte directement
    fireEvent.click(screen.getByText('Oui, supprimer'));
    await waitFor(() => expect(apiSite._etat().records.equipements[code].deleted).toBe(true), { timeout: 4000 });

    onglet(/Matériaux/);
    fireEvent.click(await screen.findByText('Appareils de mesure'));
    const mesure = Object.values(recs.mesures).find((r) => !r.deleted);
    fireEvent.click(await screen.findByLabelText('Supprimer ' + mesure.id));
    fireEvent.click(await screen.findByText('Oui, supprimer'));
    await waitFor(() => expect(apiSite._etat().records.mesures[mesure.id].deleted).toBe(true), { timeout: 4000 });

    fireEvent.click(await screen.findByText('Organismes'));
    const utilise = Object.values(recs.organismes).find((o) => Object.values(recs.mesures).some((m) => !m.deleted && m.data.organisme === o.data.nom) || Object.values(recs.controles || {}).some((c) => c.data.organisme === o.data.nom));
    fireEvent.click(await screen.findByLabelText('Supprimer ' + utilise.id));
    expect((await screen.findByTestId('zone-suppression')).textContent).toMatch(/Suppression impossible/);
  });

  it('suppression : OT non clôturé supprimé et sa DI repasse « À transmettre »', async () => {
    const recs = apiSite._etat().records;
    const ot = Object.values(recs.bts).find((r) => r.unit === 'Alger' && r.data.di && r.data.etat === 'En cours' && !Object.values(recs.dss || {}).some((d) => d.data.bt === r.id));
    await seConnecter('Super administrateur');
    onglet(/Maintenance corrective/);
    fireEvent.click(await screen.findByText('OT correctifs'));
    fireEvent.click((await screen.findAllByText(ot.id))[0]);
    fireEvent.click(await screen.findByText(/^Supprimer l'OT /));
    fireEvent.click(await screen.findByText('Oui, supprimer'));
    await waitFor(() => expect(apiSite._etat().records.bts[ot.id].deleted).toBe(true), { timeout: 4000 });
    await waitFor(() => expect(apiSite._etat().records.dis[ot.data.di].data.etat).toBe('À Transmettre'), { timeout: 4000 });
  });

  it('accueil : tableau de bord limité aux volets autorisés', async () => {
    await seConnecter('Exploitation');
    await waitFor(() => expect(document.body.textContent).toContain('Mes infos DI'));
    const txt = document.body.textContent;
    expect(txt).toContain('Mes menus favoris'); expect(txt).toContain("Nouvelle demande d'intervention");
    expect(txt).not.toContain('Mes infos OT'); expect(txt).not.toContain('Stock critique'); expect(txt).not.toContain('Mon planning');
    cleanup(); apiSite._reinitialiser();
    await seConnecter('Super administrateur');
    await waitFor(() => expect(document.body.textContent).toContain('Mes infos OT'));
    expect(document.body.textContent).toContain('Mon planning');
  });

  it('technicien : ne voit que son périmètre ; direction : voit les indicateurs', async () => {
    await seConnecter('Technicien');
    const noms = [...screen.getByTestId('menu-lateral').querySelectorAll('nav button')].map((b) => b.textContent);
    expect(noms.some((n) => /Administration/.test(n))).toBe(false);
    cleanup(); apiSite._reinitialiser();
    await seConnecter('Direction');
    onglet(/Indicateurs|KPI/);
    await waitFor(() => expect(document.body.textContent).toMatch(/Disponibilit|MTBF|MTTR/));
  });

  it('préventif : une DS globale pour toutes les pièces prévues, retrait d’une pièce par le magasin, bon de sortie multi-pièces', async () => {
    const recs = apiSite._etat().records;
    const prev = Object.values(recs.bts).find((r) => r.unit === 'Alger' && r.data.plan && r.data.etat !== 'Clôturé' && r.data.etat !== 'Annulé');
    const stock = (c) => recs.pieces[c].data.stock;
    const s1 = stock('P-001'), s2 = stock('P-002');
    prev.data = { ...prev.data, piecesPrevues: [{ code: 'P-001', qte: 2 }, { code: 'P-002', qte: 1 }, { code: 'P-003', qte: 500 }] };
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await seConnecter('Super administrateur');
    onglet(/Ordres de travail/);
    fireEvent.click((await screen.findAllByText(prev.id))[0]);
    const bouton = await screen.findByTestId('ds-globale');
    expect(bouton.textContent).toContain('3 pièces');
    fireEvent.click(bouton);
    await waitFor(() => expect(screen.getAllByTestId('ds-ligne')).toHaveLength(3));
    expect(document.body.textContent).toContain('Stock insuffisant pour');
    fireEvent.click(screen.getByText('Créer la Demande de Sortie (DS)'));
    await waitFor(() => expect(Object.values(apiSite._etat().records.dss || {}).some((r) => r.data.bt === prev.id)).toBe(true));
    const ds = () => Object.values(apiSite._etat().records.dss).find((r) => r.data.bt === prev.id && !r.deleted);
    expect(ds().data.lignes.map((l) => l.piece)).toEqual(['P-001', 'P-002', 'P-003']);       // UNE seule DS, trois pièces
    expect(ds().data.etat).toBe('En attente pièce');
    await waitFor(() => expect(apiSite._etat().records.bts[prev.id].data.etat).toBe('En attente pièce'));

    onglet(/Gestion de stock/);
    const choixSection = await screen.findByDisplayValue('Pièces');
    fireEvent.change(choixSection, { target: { value: 'ds' } });
    const code = ds().id;
    const cellule = await screen.findByTestId('ds-lignes-' + code);
    fireEvent.click(within(cellule).getByLabelText(/Retirer .* de la DS/, { selector: '[aria-label*="Relais"]' }));
    await waitFor(() => expect(ds().data.lignes.map((l) => l.piece)).toEqual(['P-001', 'P-002']));
    expect(ds().data.etat).toBe('Transmis au Magasinier');                                      // plus de rupture : transmis au magasin

    fireEvent.click(within(cellule.closest('tr')).getByText('Générer BS'));
    fireEvent.change(choixSection, { target: { value: 'bs' } });
    fireEvent.click(await screen.findByText('Traiter / Délivrer'));
    await waitFor(() => expect(stock('P-001')).toBe(s1 - 2));
    expect(stock('P-002')).toBe(s2 - 1);
    await waitFor(() => expect(ds().data.etat).toBe('Traité'));
    await waitFor(() => expect(apiSite._etat().records.bts[prev.id].data.etat).toBe('En cours'));   // OT débloqué
  });

  it('administration : repartir de zéro (super admin) — confirmation exigée, données vidées, comptes et référentiels gardés', async () => {
    await seConnecter('Super administrateur');
    onglet(/^\s*Administration/);
    fireEvent.click(await screen.findByText('Repartir de zéro'));
    const bouton = await screen.findByText('Vider les données');
    fireEvent.click(bouton);
    expect(Object.values(apiSite._etat().records.equipements).some((r) => !r.deleted)).toBe(true);   // rien sans confirmation
    expect(screen.getByTestId('reinit-manque').textContent).toMatch(/cocher.*taper REPARTIR DE ZERO/s);   // ce qui manque est affiché
    fireEvent.click(screen.getByText(/une sauvegarde de la base/).closest('label'));
    fireEvent.change(screen.getByLabelText('Phrase de confirmation'), { target: { value: 'Repartir de zéro' } });
    expect(screen.queryByTestId('reinit-manque')).toBeNull();
    fireEvent.click(bouton);
    expect(await screen.findByTestId('reinit-ok')).toBeTruthy();
    const e = apiSite._etat();
    for (const c of ['equipements', 'dis', 'bts', 'pieces', 'intervenants', 'planning']) expect(Object.values(e.records[c] || {}).every((r) => r.deleted)).toBe(true);
    expect(Object.values(e.records.systemes).some((r) => !r.deleted)).toBe(true);
    expect((await apiSite.nextCodes('dis', { unit: 'Alger' }))[0]).toBe(`DI-ALG-${AN}-0001`);
    expect(e.audit.at(-1).action).toBe('reinitialisation');
  });

  it('administration : repartir de zéro pour une seule unité et une seule catégorie — le reste est conservé', async () => {
    await seConnecter('Super administrateur');
    onglet(/^\s*Administration/);
    fireEvent.click(await screen.findByText('Repartir de zéro'));
    const vivants = (c, f = () => true) => Object.values(apiSite._etat().records[c] || {}).filter((r) => !r.deleted && f(r));
    const unites = [...new Set(vivants('dis').map((r) => r.unit))];
    expect(unites.length).toBeGreaterThan(1);
    const [cible, autre] = unites;
    const avantAutre = vivants('dis', (r) => r.unit === autre).length;
    const avantEquip = vivants('equipements').length;
    fireEvent.change(await screen.findByLabelText('Unité'), { target: { value: cible } });
    fireEvent.click(screen.getByText('Tout décocher'));
    fireEvent.click(screen.getByLabelText("Demandes d'intervention"));
    fireEvent.click(screen.getByText(/une sauvegarde de la base/).closest('label'));
    fireEvent.change(screen.getByLabelText('Phrase de confirmation'), { target: { value: 'repartir de zero' } });
    fireEvent.click(screen.getByText('Vider les données'));
    expect(await screen.findByTestId('reinit-ok')).toBeTruthy();
    expect(vivants('dis', (r) => r.unit === cible)).toHaveLength(0);
    expect(vivants('dis', (r) => r.unit === autre)).toHaveLength(avantAutre);
    expect(vivants('equipements')).toHaveLength(avantEquip);
  });

  it('administration : repartir de zéro pour l arborescence de CFO seulement — les autres systèmes sont conservés', async () => {
    await seConnecter('Super administrateur');
    onglet(/^\s*Administration/);
    fireEvent.click(await screen.findByText('Repartir de zéro'));
    const arbo = () => Object.values(apiSite._etat().records.arborescence || {}).filter((r) => !r.deleted);
    const cfo = (r) => r.id === 'CFO' || r.id.startsWith('CFO.');
    const autres = arbo().filter((r) => !cfo(r)).length;
    expect(arbo().filter(cfo).length).toBeGreaterThan(0);
    expect(autres).toBeGreaterThan(0);
    const equipements = Object.values(apiSite._etat().records.equipements).filter((r) => !r.deleted).length;
    fireEvent.change(await screen.findByLabelText('Système'), { target: { value: 'CFO' } });
    fireEvent.click(screen.getByText('Tout décocher'));
    fireEvent.click(screen.getByLabelText(/Sous-systèmes \(arborescence\)/));
    fireEvent.click(screen.getByText(/une sauvegarde de la base/).closest('label'));
    fireEvent.change(screen.getByLabelText('Phrase de confirmation'), { target: { value: 'repartir de zero' } });
    fireEvent.click(screen.getByText('Vider les données'));
    expect(await screen.findByTestId('reinit-ok')).toBeTruthy();
    expect(arbo().filter(cfo)).toHaveLength(0);
    expect(arbo().filter((r) => !cfo(r))).toHaveLength(autres);
    expect(Object.values(apiSite._etat().records.equipements).filter((r) => !r.deleted)).toHaveLength(equipements);
    expect(Object.values(apiSite._etat().records.systemes).some((r) => !r.deleted && r.id === 'CFO')).toBe(true);
  });

  it('assistant GMAO : question sur une panne, lien vers l’OT, synthèse d’un intervenant ; refusée au technicien', async () => {
    await seConnecter('Responsable maintenance');
    fireEvent.click(screen.getByTestId('assistant-bouton'));
    const panneau = await screen.findByTestId('assistant');
    fireEvent.change(within(panneau).getByLabelText("Question à l'assistant"), { target: { value: 'portillon bloqué' } });
    fireEvent.click(within(panneau).getByText('Envoyer'));
    expect(await within(panneau).findByText(/intervention.* similaire/)).toBeTruthy();
    expect(within(panneau).getByText('Causes les plus fréquentes')).toBeTruthy();
    const lien = within(panneau).getAllByRole('button').find((b) => /^OT-ALG-|^DI-ALG-/.test(b.textContent));
    fireEvent.click(lien);
    const code = lien.textContent.split(' — ')[0];
    await waitFor(() => expect(document.body.textContent).toMatch(new RegExp('(Ordre de travail|OT|DI).*' + code)));
    fireEvent.change(within(panneau).getByLabelText("Question à l'assistant"), { target: { value: 'synthèse de K. Belaïd' } });
    fireEvent.click(within(panneau).getByText('Envoyer'));
    expect((await within(panneau).findAllByText(/Points forts|Points d'attention/)).length).toBeGreaterThan(0);
    expect(within(panneau).getByText(/pas une évaluation/)).toBeTruthy();
    cleanup(); apiSite._reinitialiser();
    await seConnecter('Technicien');
    fireEvent.click(screen.getByTestId('assistant-bouton'));
    const p2 = await screen.findByTestId('assistant');
    fireEvent.click(within(p2).getByText('Synthèse de K. Belaïd'));
    expect(await within(p2).findByText(/réservée aux profils/)).toBeTruthy();
  });

  it('profils : le technicien termine la saisie, le chargé est notifié et clôture, l’expert DG valide', async () => {
    const recs = apiSite._etat().records;
    const ot = Object.values(recs.bts).find((r) => r.unit === 'Alger' && r.system === 'CFO' && !r.data.plan && r.data.dateCloture);
    ot.data = { ...ot.data, etat: 'En cours', dateCloture: undefined, validationDG: undefined, taches: ot.data.taches.map((t) => ({ ...t, res: 'OK' })) };
    if (ot.data.di) recs.dis[ot.data.di].data.etat = 'Transmis';
    // 1. technicien : pas de bouton de clôture, « Terminer la saisie »
    await seConnecter('Technicien');
    onglet(/Maintenance corrective/);
    fireEvent.click(await screen.findByText('OT correctifs'));
    fireEvent.click((await screen.findAllByText(ot.id))[0]);
    expect(screen.queryByText("Clôturer l'OT")).toBeNull();
    fireEvent.click(await screen.findByText('Terminer la saisie'));
    await waitFor(() => expect(apiSite._etat().records.bts[ot.id].data.etat).toBe('À clôturer'), { timeout: 4000 });
    // le serveur refuse une clôture par le technicien, même en contournant l'écran
    const tech = apiSite._etat().records.bts[ot.id];
    await expect(apiSite.save('bts', ot.id, { unit: 'Alger', system: 'CFO', version: tech.version, data: { ...tech.data, etat: 'Clôturé' } })).rejects.toMatchObject({ status: 403, code: 'PROFIL' });
    // 2. chargé système : notifié, ouvre l'OT depuis la cloche, clôture
    cleanup(); await apiSite.logout();               // même état de démonstration, autre compte
    await seConnecter('Chargé système CFO');
    fireEvent.click(screen.getByLabelText('Alertes'));
    const notif = await screen.findByTestId('notifications');
    expect(notif.textContent).toContain(ot.id + ' — ' + ot.data.eq + ' à clôturer');
    fireEvent.click(within(notif).getAllByRole('button')[0]);
    expect(await screen.findByTestId('ot-a-cloturer')).toBeTruthy();
    fireEvent.click(screen.getByText("Clôturer l'OT"));
    await waitFor(() => expect(apiSite._etat().records.bts[ot.id].data.etat).toBe('Clôturé'), { timeout: 4000 });
    expect(apiSite._etat().records.bts[ot.id].data.validationDG.etat).toBe('À valider');
    // 3. expert DG : écran de validation, « Valider »
    cleanup(); await apiSite.logout();
    await seConnecter('Expert DG CFO');
    onglet(/Validation DG/);
    const ligne = await screen.findByTestId('val-' + ot.id);
    fireEvent.click(within(ligne).getByText('Valider'));
    await waitFor(() => expect(apiSite._etat().records.bts[ot.id].data.validationDG).toMatchObject({ etat: 'Validé', par: 'Démo — Expert DG CFO' }), { timeout: 4000 });
  });

  it('profils : l’expert DG fait reprendre un plan avec un motif (chargé notifié) ; exploitation sans OT', async () => {
    const recs = apiSite._etat().records;
    const plan = Object.values(recs.planning).find((r) => r.unit === 'Alger' && r.system === 'CFO');
    plan.data = { ...plan.data, validationDG: { etat: 'À valider', depuis: '2026-10-20' } };
    await seConnecter('Expert DG CFO');
    onglet(/Validation DG/);
    const ligne = await screen.findByTestId('val-' + plan.id);
    fireEvent.click(within(ligne).getByText('À reprendre'));
    fireEvent.change(within(ligne).getByLabelText('Motif pour ' + plan.id), { target: { value: 'FMP non jointe' } });
    fireEvent.click(within(ligne).getByText('Envoyer'));
    await waitFor(() => expect(apiSite._etat().records.planning[plan.id].data.validationDG).toMatchObject({ etat: 'À reprendre', motif: 'FMP non jointe' }), { timeout: 4000 });
    expect((apiSite._etat().notifications || []).some((n) => n.userId === 'demo.charge' && /FMP non jointe/.test(n.texte))).toBe(true);
    cleanup(); apiSite._reinitialiser();
    await seConnecter('Exploitation');
    onglet(/Maintenance corrective/);
    await waitFor(() => expect(document.body.textContent).toContain('Nouvelle DI'));
    expect(screen.queryByText('Générer OT')).toBeNull();
  });

  it('rapports d’activité : l’expert relève les erreurs, le responsable DG renvoie, l’UO corrige et renvoie (tour 2)', async () => {
    const rap = () => Object.values(apiSite._etat().records.rapports).find((r) => r.data.etat !== 'Clôturé' && r.unit === 'Alger');
    const code = rap().id;
    // expert DG : revue
    await seConnecter('Expert DG CFO');
    onglet(/Rapports d'activité/);
    fireEvent.click(await screen.findByTestId('rapport-' + code));
    const fiche = await screen.findByTestId('fiche-rapport');
    fireEvent.change(within(fiche).getByLabelText("Nombre d'erreurs"), { target: { value: '2' } });
    fireEvent.click(within(fiche).getByText('Terminer ma revue'));
    expect(await within(fiche).findByText(/Décrivez les erreurs/)).toBeTruthy();
    fireEvent.change(within(fiche).getByLabelText('Commentaire de revue'), { target: { value: 'Disponibilité CFO erronée' } });
    fireEvent.click(within(fiche).getByText('Terminer ma revue'));
    await waitFor(() => expect(rap().data.etat).toBe('À valider DG'), { timeout: 4000 });
    // responsable DG : clôture impossible (erreurs) ; renvoi pour correction
    cleanup(); await apiSite.logout();
    await seConnecter('Responsable DG');
    onglet(/Rapports d'activité/);
    fireEvent.click(await screen.findByTestId('rapport-' + code));
    const f2 = await screen.findByTestId('fiche-rapport');
    expect(within(f2).getByText(/doit être renvoyé à l'UO/)).toBeTruthy();
    fireEvent.change(within(f2).getByLabelText('Motif de renvoi'), { target: { value: 'Revoir la disponibilité CFO' } });
    fireEvent.click(within(f2).getByText("Renvoyer à l'UO pour correction"));
    await waitFor(() => expect(rap().data.etat).toBe('À corriger'), { timeout: 4000 });
    // UO (administrateur UO) : notifiée, joint la correction et renvoie
    cleanup(); await apiSite.logout();
    await seConnecter('Responsable maintenance');
    fireEvent.click(screen.getByLabelText('Alertes'));
    expect((await screen.findByTestId('notifications')).textContent).toMatch(/à corriger/);
    onglet(/Rapports d'activité/);
    fireEvent.click(await screen.findByTestId('rapport-' + code));
    const f3 = await screen.findByTestId('fiche-rapport');
    expect(within(f3).getAllByText(/Revoir la disponibilité CFO/).length).toBeGreaterThan(0);
    const xlsx = new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04]), 'xl/workbook.xml'], 'Rapport_corrige.xlsx');
    fireEvent.change(within(f3).getByLabelText('Joindre des fichiers au rapport'), { target: { files: [xlsx] } });
    await waitFor(() => expect(rap().data.fichiers.length).toBe(1), { timeout: 4000 });
    fireEvent.click(await within(await screen.findByTestId('fiche-rapport')).findByText('Correction terminée — renvoyer aux experts'));
    await waitFor(() => expect(rap().data).toMatchObject({ etat: 'Envoyé', tour: 2 }), { timeout: 4000 });
    expect((apiSite._etat().notifications || []).some((n) => n.userId === 'demo.expert' && /tour 2/.test(n.texte))).toBe(true);
  });

  it('super administrateur : statut manuel d’une DI (tracé), système ajouté puis supprimé avec ses sous-systèmes', async () => {
    const di = Object.values(apiSite._etat().records.dis).find((r) => r.unit === 'Alger' && r.data.etat === 'Traité');
    await seConnecter('Super administrateur');
    onglet(/Maintenance corrective/);
    fireEvent.click((await screen.findAllByText(di.id))[0]);
    fireEvent.click(await screen.findByTestId('statut-manuel'));
    const form = await screen.findByTestId('statut-manuel-form');
    fireEvent.change(within(form).getByLabelText('Nouveau statut'), { target: { value: 'Annulé' } });
    fireEvent.change(within(form).getByLabelText('Motif du changement'), { target: { value: 'Doublon' } });
    fireEvent.click(within(form).getByText('Appliquer'));
    await waitFor(() => expect(apiSite._etat().records.dis[di.id].data).toMatchObject({ etat: 'Annulé', historiqueStatut: [expect.objectContaining({ de: 'Traité', a: 'Annulé', motif: 'Doublon', manuel: true })] }), { timeout: 4000 });
    cleanup();
    // système vide ajouté par le super admin, puis supprimé avec son sous-système
    const t = new Date().toISOString(); const recs = apiSite._etat().records;
    recs.systemes.TST = { id: 'TST', unit: '', system: null, version: 1, deleted: false, createdAt: t, updatedAt: t, data: { code: 'TST', nom: 'Test', ordre: 99 } };
    recs.arborescence.TST = { id: 'TST', unit: '', system: null, version: 1, deleted: false, createdAt: t, updatedAt: t, data: { system: 'TST', header: true, ordre: 99 } };
    recs.arborescence['TST.A'] = { id: 'TST.A', unit: '', system: null, version: 1, deleted: false, createdAt: t, updatedAt: t, data: { system: 'TST', code: 'A', sub: 'Sous A', ordre: 0 } };
    render(<App />); await screen.findByTestId('menu-lateral');
    onglet(/Arborescence/);
    fireEvent.click(await screen.findByLabelText('Modifier le système TST'));
    fireEvent.click(await screen.findByText(/Supprimer le système TST et ses 1 sous-système/));
    fireEvent.click(screen.getByText('Oui, supprimer'));
    await waitFor(() => expect(recs.systemes.TST.deleted && recs.arborescence['TST.A'].deleted).toBe(true), { timeout: 4000 });
  });

  it('super administrateur : un profil créé (organigramme) est proposé pour les comptes', async () => {
    await seConnecter('Super administrateur');
    onglet(/^\s*Administration/);
    fireEvent.click(await screen.findByText('Profils (organigramme)'));
    fireEvent.click(await screen.findByText('+ Nouveau profil'));
    fireEvent.change(screen.getByLabelText('Nom du profil'), { target: { value: 'Chef de district' } });
    fireEvent.click(screen.getByText('Demandes d\'Intervention (DI)').closest('label'));
    fireEvent.click(screen.getByText('Clôture les OT').closest('label'));
    fireEvent.click(screen.getByText('Enregistrer le profil'));
    await waitFor(() => expect(apiSite._etat().records.profils?.['Chef de district']?.data).toMatchObject({ volets: [1], cloture: true }), { timeout: 4000 });
    fireEvent.click(screen.getByText("Comptes et droits d'accès"));
    fireEvent.click(await screen.findByText('+ Nouvel utilisateur'));
    expect([...screen.getByLabelText('Profil', { selector: 'select' }).options].map((o) => o.value)).toContain('Chef de district');
  });

  it('administration : comptes visibles mais verrouillés, journal consultable', async () => {
    await seConnecter('Super administrateur');
    onglet(/^\s*Administration/);
    await waitFor(() => expect(document.body.textContent).toContain('demo.technicien'));
  });
});
