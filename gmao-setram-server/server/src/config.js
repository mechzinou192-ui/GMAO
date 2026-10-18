import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const env = process.env;
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
  maxFailedAttempts: 5,
  lockMinutes: 15,
  minPasswordLength: 10,
};

if (!localMode && /changez-moi/i.test(config.databaseUrl || '')) {
  throw new Error('DATABASE_URL contient encore le mot de passe d\'exemple : personnalisez DB_PASSWORD');
}
if (!config.jwtSecret || config.jwtSecret.length < 32 || config.jwtSecret.startsWith('changez-moi')) {
  throw new Error('JWT_SECRET manquant, trop court (32 caractères min.) ou non personnalisé');
}
