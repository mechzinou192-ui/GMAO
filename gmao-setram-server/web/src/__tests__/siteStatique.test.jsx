import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import { createDemoApi } from '../demo/apiDemo.js';

const JPEG = () => new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0])], { type: 'image/jpeg' });
const GIF = () => new Blob([new TextEncoder().encode('GIF89a-pas-une-photo-acceptee')], { type: 'image/jpeg' });
const AN = new Date().getFullYear();
const MDP = { 'demo.admin': 'Demo2026-Admin', 'demo.responsable': 'Demo2026-Resp', 'demo.technicien': 'Demo2026-Tech', 'demo.exploitation': 'Demo2026-Expl', 'demo.magasin': 'Demo2026-Mag', 'demo.direction': 'Demo2026-Dir' };
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
    const dis = (await tech.list('dis')).items;
    expect(dis.length).toBeGreaterThan(5); expect(dis.every((i) => i.unit === 'Alger' && ['CFO', 'CFA', 'BILLETTIQUE'].includes(i.system))).toBe(true);
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
    expect((await adm.users()).users).toHaveLength(6); expect((await adm.users()).users.every((u) => !('password' in u))).toBe(true);
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
    await waitFor(() => expect(document.body.textContent).toContain('Ajouter un système'));
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

  it('administration : comptes visibles mais verrouillés, journal consultable', async () => {
    await seConnecter('Super administrateur');
    onglet(/^\s*Administration/);
    await waitFor(() => expect(document.body.textContent).toContain('demo.technicien'));
  });
});
