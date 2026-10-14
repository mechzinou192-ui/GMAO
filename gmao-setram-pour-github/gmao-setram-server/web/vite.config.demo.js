// Site de démonstration STATIQUE : un dossier de fichiers (dist-demo/) à déposer sur n'importe quel hébergeur gratuit.
// Aucun serveur ni base de données : le « serveur » est simulé dans le navigateur (src/demo/apiDemo.js).
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',                                   // adresses relatives : fonctionne à la racine comme dans un sous-dossier
  define: { __STATIC_DEMO__: 'true' },
  build: { outDir: 'dist-demo', emptyOutDir: true, chunkSizeWarningLimit: 1500 },
});
