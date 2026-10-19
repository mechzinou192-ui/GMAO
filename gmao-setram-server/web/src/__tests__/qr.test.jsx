import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { lienEquipement, codeDepuisAdresse, planchetteEtiquettesHtml } from '../lib/qr.js';
import { svgQr } from '../etiquettes.js';

// Décode réellement le QR généré (matrice -> image -> lecteur) : le lien contenu est bien celui attendu
function decoder(texte) {
  const qr = QRCode.create(texte, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size, k = 6, marge = 4, w = (n + 2 * marge) * k;
  const px = new Uint8ClampedArray(w * w * 4).fill(255);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.modules.data[y * n + x])
    for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) { const i = (((y + marge) * k + dy) * w + (x + marge) * k + dx) * 4; px[i] = px[i + 1] = px[i + 2] = 0; }
  return jsQR(px, w, w)?.data;
}

describe('liens et QR codes', () => {
  it('lien profond encodé / décodé', () => {
    expect(lienEquipement('https://gmao.setram.local', 'CFO.ALG.SST.01')).toBe('https://gmao.setram.local/?eq=CFO.ALG.SST.01');
    expect(lienEquipement('http://localhost:3000/', 'A B')).toBe('http://localhost:3000/?eq=A%20B');
    expect(codeDepuisAdresse('?eq=CFO.ALG.SST.01')).toBe('CFO.ALG.SST.01');
    for (const mauvais of ['', '?x=1', '?eq=', '?eq=<script>', "?eq=a'b", '?eq=' + 'A'.repeat(81), '?eq=../../etc', '?eq=a b']) expect(codeDepuisAdresse(mauvais), mauvais).toBeNull();
    expect(codeDepuisAdresse(undefined)).toBeNull();
  });
  it('le QR code lu par un lecteur redonne exactement le lien', () => {
    for (const code of ['CFO.ALG.SST.01', 'BILLETTIQUE.OUA.PTL.12', 'MR.SBA.BOG.03']) {
      const lien = lienEquipement('https://gmao.setram.local', code);
      expect(decoder(lien)).toBe(lien);
    }
  });
  it('svgQr produit un SVG', async () => {
    const svg = await svgQr('https://x/?eq=A'); expect(svg).toMatch(/^<svg[^>]*viewBox/); expect(svg).toContain('</svg>');
  });
  it('planche d\'étiquettes : une étiquette par équipement, texte échappé', () => {
    const h = planchetteEtiquettesHtml([{ code: 'CFO.ALG.SST.01', nom: 'Transformateur <T1>', emplacement: 'Poste "HT"', svg: '<svg></svg>' }, { code: 'X', nom: 'Y', svg: '<svg></svg>' }]);
    expect((h.match(/class="et"/g) || []).length).toBe(2);
    expect(h).toContain('Transformateur &lt;T1&gt;'); expect(h).toContain('Poste &quot;HT&quot;'); expect(h).not.toContain('<T1>');
    expect(h).toContain('(2)');
  });
});

/* ───── dans l'application ───── */
const rec = (id, data) => ({ id, data, version: 1, deleted: false, createdAt: '2026-10-01T08:00:00Z', updatedAt: '2026-10-01T08:00:00Z' });
const EQ = { code: 'CFO.ALG.SST.01', unit: 'Alger', system: 'CFO', subCode: 'SST', nom: 'Transformateur T1', emplacement: 'Poste HT', sousEquip: [] };
const EQ2 = { code: 'CFO.ORN.SST.01', unit: 'Oran', system: 'CFO', subCode: 'SST', nom: 'Transformateur Oran', emplacement: '', sousEquip: [] };
vi.mock('../api.js', () => ({ api: { me: vi.fn(), login: vi.fn(), logout: vi.fn(), changePassword: vi.fn(), list: vi.fn(), save: vi.fn(async () => ({ version: 1 })), remove: vi.fn(), bulkImport: vi.fn(async () => ({})), nextCodes: vi.fn(), listFiles: vi.fn(async () => []), fileUrl: (i) => i, users: vi.fn(async () => ({ users: [] })) } }));
import { api } from '../api.js';
import App from '../App.jsx';
const SA = { id: 'admin', nom: 'Super Admin', role: 'Super Admin', superAdmin: true, mustChangePw: false, droits: {} };
const TECH_BT = { id: 'tech', nom: 'Tech', role: 'Technicien', superAdmin: false, mustChangePw: false, droits: { Alger: { systems: ['CFO'], volets: [0, 2] } } };

describe('scan d\'un QR code dans l\'application', () => {
  beforeEach(() => {
    cleanup(); vi.clearAllMocks(); window.HTMLElement.prototype.scrollIntoView = vi.fn();
    api.me.mockResolvedValue({ user: SA });
    api.list.mockImplementation(async (n) => ({ items: n === 'equipements' ? [rec(EQ.code, EQ), rec(EQ2.code, EQ2)] : [], serverTime: '2026-10-06T10:00:00Z' }));
  });
  afterEach(() => window.history.replaceState(null, '', '/'));

  it('?eq=CODE ouvre la déclaration d\'une DI sur cet équipement, change d\'unité si besoin, et nettoie l\'adresse', async () => {
    window.history.replaceState(null, '', '/?eq=CFO.ORN.SST.01');
    render(<App />);
    await screen.findByText(/Nouvelle Demande d'Intervention/);
    await waitFor(() => expect(document.body.textContent).toContain('CFO.ORN.SST.01'));
    expect(window.location.search).toBe('');
  });
  it('équipement inconnu : message clair, aucune fenêtre ouverte', async () => {
    window.history.replaceState(null, '', '/?eq=NOPE.ALG.X.01');
    render(<App />);
    await screen.findByText(/introuvable ou hors de vos droits/);
    expect(screen.queryByText(/Nouvelle Demande d'Intervention/)).toBeNull();
    expect(window.location.search).toBe('');
  });
  it('utilisateur sans le droit « DI » : message, pas de formulaire', async () => {
    api.me.mockResolvedValue({ user: TECH_BT });
    window.history.replaceState(null, '', '/?eq=CFO.ALG.SST.01');
    render(<App />);
    await screen.findByText(/pas le droit de créer une demande d'intervention/);
    expect(screen.queryByText(/Nouvelle Demande d'Intervention/)).toBeNull();
  });
  it('sans paramètre : comportement habituel', async () => {
    render(<App />);
    await screen.findByText('Arborescence', { selector: 'nav button' });
    expect(document.body.textContent).toContain('Mes menus favoris');                   // ouverture sur le tableau de bord
    expect(screen.queryByText(/Nouvelle Demande d'Intervention/)).toBeNull();
  });
  it('bouton « Étiquettes QR » : planche imprimable avec un QR par équipement de l\'unité', async () => {
    const w = { document: { open: vi.fn(), write: vi.fn(), close: vi.fn() }, focus: vi.fn(), print: vi.fn() };
    const ouvrir = vi.spyOn(window, 'open').mockReturnValue(w);
    render(<App />);
    fireEvent.click(await screen.findByText('Arborescence', { selector: 'nav button' }));
    fireEvent.click(await screen.findByText('🏷 Étiquettes QR'));
    await waitFor(() => expect(ouvrir).toHaveBeenCalled());
    const html = w.document.write.mock.calls[0][0];
    expect(html).toContain('CFO.ALG.SST.01'); expect(html).not.toContain('CFO.ORN.SST.01');     // unité courante uniquement
    expect(html).toContain('<svg'); expect(html).toContain('Poste HT');
    ouvrir.mockRestore();
  });
});
