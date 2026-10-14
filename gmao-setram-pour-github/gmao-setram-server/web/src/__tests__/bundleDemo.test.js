// Vérifie le site statique RÉELLEMENT construit (dist-demo/, minifié) : il démarre, affiche l'écran de démonstration,
// permet de se connecter et de lire des données. Ignoré si le site n'a pas été construit (npm run build:demo).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const dossier = path.resolve(__dirname, '../../dist-demo');
const present = fs.existsSync(path.join(dossier, 'index.html'));

describe.skipIf(!present)('site statique construit (dist-demo)', () => {
  it('index.html : adresses relatives, aucun appel externe', () => {
    const html = fs.readFileSync(path.join(dossier, 'index.html'), 'utf8');
    expect(html).toMatch(/src="\.\/assets\/index-[\w-]+\.js"/); expect(html).toMatch(/href="\.\/assets\/index-[\w-]+\.css"/);
    expect(html).not.toMatch(/https?:\/\//);
    for (const f of fs.readdirSync(path.join(dossier, 'assets'))) {
      const t = fs.readFileSync(path.join(dossier, 'assets', f), 'utf8');
      if (f.startsWith('index-') && f.endsWith('.js')) { expect(t).not.toContain('X-Requested-With'); expect(t).toContain('Demo2026-Admin'); }
    }
  });

  it('le bundle minifié démarre, affiche le bandeau de démonstration, connecte un profil et affiche la liste des DI', async () => {
    document.body.innerHTML = '<div id="root"></div>';
    window.HTMLElement.prototype.scrollIntoView = () => {};
    const js = fs.readdirSync(path.join(dossier, 'assets')).find((f) => /^index-.*\.js$/.test(f));
    await import(/* @vite-ignore */ pathToFileURL(path.join(dossier, 'assets', js)).href);
    const attendre = async (fn, ms = 8000) => { const t0 = Date.now(); for (;;) { try { const r = fn(); if (r) return r; } catch { /* pas encore */ } if (Date.now() - t0 > ms) throw new Error('délai dépassé : ' + document.body.textContent.slice(0, 200)); await new Promise((r) => setTimeout(r, 25)); } };
    const bandeau = await attendre(() => document.querySelector('[data-testid="bandeau-demo"]'));
    expect(bandeau.textContent).toContain('restent dans votre navigateur');
    [...bandeau.querySelectorAll('button')].find((b) => b.textContent === 'Responsable maintenance').click();
    await attendre(() => [...document.querySelectorAll('button')].find((b) => b.textContent === 'Se connecter'));
    [...document.querySelectorAll('button')].find((b) => b.textContent === 'Se connecter').click();
    await attendre(() => document.querySelector('[data-testid="menu-lateral"]'));
    [...document.querySelectorAll('nav button')].find((b) => /Demandes d'Intervention/.test(b.textContent)).click();
    const cartes = await attendre(() => { const c = document.querySelector('[data-testid="di-cartes"]'); return c && /DI-[A-Z]{3}-\d{4}-\d{4}/.test(c.textContent) ? c : null; });
    expect(cartes.textContent).toMatch(/DI-ALG-\d{4}-\d{4}/);
  }, 30000);
});
