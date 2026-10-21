import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const env = process.env;

// Entier lu dans l'environnement, borné ; une valeur invalide empêche le démarrage (message clair)
function entier(nom, defaut, min, max) {
  const brut = env[nom];
  if (brut === undefined || brut === '') return defaut;
  const n = Number(brut);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${nom} invalide : « ${brut} » (entier attendu entre ${min} et ${max})`);
  return n;
}
const NIVEAUX_LOG = ['debug', 'info', 'warn', 'error'];
// Mode local : pas de DATABASE_URL -> base intégrée (PGlite) stockée dans ./data, sans aucune installation.
const localMode = !env.DATABASE_URL;
const dataDir = path.resolve(env.DATA_DIR || './data');

function localSecret() {
  fs.mkdirSync(dataDir, { recursive: true });
  const f = path.join(dataDir, '.session-secret');
  if (!fs.existsSync(f)) fs.writeFileSync(f, crypto.randomBytes(48).toString('base64'));
  return fs.readFileSync(f, 'utf8').trim();
}

export const config = {
  port: Number(env.PORT) || 3000,
  localMode,
  dataDir,
  filesDir: path.resolve(env.FILES_DIR || path.join(dataDir, 'files')),   // pièces jointes (photos)
  databaseUrl: env.DATABASE_URL,
  jwtSecret: env.JWT_SECRET || (localMode ? localSecret() : undefined),
  cookieSecure: env.COOKIE_SECURE === 'true',
  sessionHours: Number(env.SESSION_HOURS) || 8,
  trustProxy: env.TRUST_PROXY ? Number(env.TRUST_PROXY) : 0,
  // Mode démonstration (instance publique de présentation uniquement) — voir demo/seed.js
  demo: env.DEMO === '1',
  demoResetHours: env.DEMO_RESET_HOURS === undefined ? 24 : Number(env.DEMO_RESET_HOURS),
  adminInitialPassword: env.ADMIN_INITIAL_PASSWORD || '',
  // Peut être surchargé par UNITS="Alger,Oran,..." si une unité est ajoutée
  units: (env.UNITS ||
    'Alger,Oran,Constantine,Sidi Bel Abbès,Ouargla,Sétif,Mostaganem')
    .split(',').map(s => s.trim()).filter(Boolean),
  // Adresse d'écoute : défaut localhost en mode local, toutes les interfaces en mode serveur (conteneur)
  host: env.HOST || (localMode ? '127.0.0.1' : undefined),
  logLevel: env.LOG_LEVEL || 'info',
  // Limitation de débit (requêtes par fenêtre) — voir docs/decisions.md
  rateLimit: {
    windowSec: entier('RATE_LIMIT_WINDOW_SEC', 60, 1, 3600),
    globalMax: entier('RATE_LIMIT_GLOBAL_MAX', 600, 10, 100000),     // toute l'API, par utilisateur (sinon par adresse IP)
    writeMax: entier('RATE_LIMIT_WRITE_MAX', 300, 5, 100000),        // écritures (POST / PUT / DELETE), par utilisateur
    costlyMax: entier('RATE_LIMIT_COSTLY_MAX', 30, 1, 10000),        // import Excel, envoi de photos, par utilisateur
    authWindowMin: entier('RATE_LIMIT_AUTH_WINDOW_MIN', 15, 1, 1440),
    authMax: entier('RATE_LIMIT_AUTH_MAX', 30, 3, 10000),            // tentatives de connexion par adresse IP
  },
  // Import Excel : lignes par feuille et taille de l'envoi (Mo) — voir docs/decisions.md
  importMaxLignes: entier('IMPORT_MAX_LIGNES', 100000, 1000, 500000),
  importMaxMo: entier('IMPORT_MAX_MO', 100, 5, 500),
  shutdownTimeoutSec: entier('SHUTDOWN_TIMEOUT_SEC', 10, 1, 120),
  maxFailedAttempts: 5,
  lockMinutes: 15,
  minPasswordLength: 10,
};

if (!NIVEAUX_LOG.includes(config.logLevel)) throw new Error(`LOG_LEVEL invalide : « ${config.logLevel} » (${NIVEAUX_LOG.join(', ')})`);
if (!localMode && /changez-moi/i.test(config.databaseUrl || '')) {
  throw new Error('DATABASE_URL contient encore le mot de passe d\'exemple : personnalisez DB_PASSWORD');
}
if (!config.jwtSecret || config.jwtSecret.length < 32 || config.jwtSecret.startsWith('changez-moi')) {
  throw new Error('JWT_SECRET manquant, trop court (32 caractères min.) ou non personnalisé');
}
