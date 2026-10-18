// Préparation de la base intégrée (PGlite) au moment de la construction de l'image Docker.
// La toute première initialisation de PGlite consomme ~750 Mo : faite au démarrage, elle dépasse la mémoire
// des petits hébergements (Render gratuit : 512 Mo). Faite ici, le conteneur démarre sur une base déjà prête (~350 Mo).
import { config } from './config.js';
import { pool, migrate } from './db.js';

if (config.localMode) {
  await migrate();
  await pool.end();
  console.log(`[préparation] base intégrée prête dans ${config.dataDir}`);
}
