import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import crypto from 'node:crypto';
import { config } from './config.js';
import { migrate, pool, q } from './db.js';
import { authRouter, authRequired, superAdminRequired, mustNotChangePw, csrfGuard, hashPassword } from './auth.js';
import { usersRouter } from './users.js';
import { dataRouter } from './records.js';
import { importRouter } from './importer.js';
import { filesRouter, MAX_FILE_BYTES } from './files.js';
import { initDemo, comptesPublics } from './demo/seed.js';
import { genererDemo } from './demo/donnees.js';

export function buildApp() {
  const app = express();
  if (config.trustProxy) app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');
  app.use(helmet({
    hsts: !config.localMode,
    contentSecurityPolicy: {
      directives: {
        upgradeInsecureRequests: config.localMode ? null : [],
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
  }));
  // L'import Excel peut envoyer plusieurs milliers de lignes : limite plus large sur cette seule route
  app.use('/api/import', express.json({ limit: '25mb' }));
  // envoi d'une photo : corps binaire brut (le serveur en vérifie le contenu), taille limitée
  app.use('/api/files', (req, res, next) => (req.method === 'POST' ? express.raw({ type: () => true, limit: MAX_FILE_BYTES })(req, res, next) : next()));
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());

  app.get('/api/health', async (req, res) => {
    try { await q('SELECT 1'); res.json({ ok: true }); }
    catch { res.status(503).json({ ok: false }); }
  });

  app.use('/api', csrfGuard);
  // Démonstration publique : on ne peut ni créer / modifier des comptes ni changer un mot de passe (comptes partagés)
  app.use(['/api/users', '/api/auth/change-password'], (req, res, next) =>
    (config.demo && req.method !== 'GET' ? res.status(403).json({ error: 'Désactivé dans la version de démonstration.' }) : next()));
  app.get('/api/config', authRequired, (req, res) => res.json({ units: config.units }));
  app.use('/api/auth', authRouter);
  app.use('/api/users', authRequired, superAdminRequired, usersRouter);
  app.use('/api/data', authRequired, mustNotChangePw, dataRouter);
  app.use('/api/import', authRequired, superAdminRequired, mustNotChangePw, importRouter);
  // Mode démonstration : comptes publics affichés sur l'écran de connexion ; gestion des comptes verrouillée
  app.get('/api/demo', (req, res) => {
    if (!config.demo) return res.status(404).json({ error: 'Route inconnue.' });
    res.json({ demo: true, resetHeures: config.demoResetHours, comptes: comptesPublics(genererDemo().users) });
  });
  app.use('/api/files', authRequired, mustNotChangePw, filesRouter);
  app.use('/api', (req, res) => res.status(404).json({ error: 'Route inconnue.' }));

  const pub = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
  if (fs.existsSync(pub)) app.use(express.static(pub));
  // Erreurs : toujours une réponse JSON lisible par l'interface (jamais de page HTML ni de détail technique)
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.too.large' || err.status === 413) return res.status(413).json({ error: 'Fichier ou envoi trop volumineux.' });
    if (err.status >= 400 && err.status < 500) return res.status(err.status).json({ error: 'Requête invalide.' });
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur.' });
  });
  return app;
}

export async function ensureAdmin() {
  const { rows } = await q('SELECT count(*)::int AS n FROM users');
  if (rows[0].n > 0) return;
  const pw = config.adminInitialPassword || crypto.randomBytes(9).toString('base64url') + '7';
  await q(`INSERT INTO users (id, nom, role, pw_hash, super_admin, must_change_pw)
           VALUES ('admin','Super Administrateur','Super Admin',$1,true,true)`, [await hashPassword(pw)]);
  console.log('\n==============================================================');
  console.log(' Compte super administrateur créé');
  console.log('   identifiant  : admin');
  console.log(`   mot de passe : ${config.adminInitialPassword ? '(celui défini dans ADMIN_INITIAL_PASSWORD)' : pw}`);
  console.log(' Le changement du mot de passe sera exigé à la 1re connexion.');
  console.log('==============================================================\n');
}

export async function main() {
  await migrate();
  await ensureAdmin();
  await initDemo();
  // Mode local : écoute uniquement sur ce poste (aucune alerte de pare-feu, rien d'exposé au réseau)
  // HOST : adresse d'écoute. Défaut : localhost en mode local, toutes les interfaces en mode serveur (nécessaire dans un conteneur).
  // Hors Docker, derrière un reverse proxy installé sur la même machine : HOST=127.0.0.1 (le port 3000 n'est alors pas joignable du réseau).
  const host = process.env.HOST || (config.localMode ? '127.0.0.1' : undefined);
  const where = config.localMode ? `http://${host}:${config.port}` : `port ${config.port}`;
  buildApp().listen(config.port, host, () => console.log(`GMAO SETRAM — serveur démarré : ${where}`));
  process.on('SIGTERM', async () => { await pool.end(); process.exit(0); });
}
