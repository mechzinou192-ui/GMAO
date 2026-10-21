// Journal structuré : une ligne JSON par événement (horodatage, niveau, message, requestId…), sur la sortie standard.
// Jamais de mot de passe, de jeton ni de corps de requête dans les journaux.
import { config } from './config.js';

const ORDRE = { debug: 10, info: 20, warn: 30, error: 40 };

function ecrire(niveau, msg, champs = {}) {
  if (ORDRE[niveau] < ORDRE[config.logLevel]) return;
  const ligne = { time: new Date().toISOString(), level: niveau, msg, ...champs };
  (niveau === 'error' || niveau === 'warn' ? process.stderr : process.stdout).write(JSON.stringify(ligne) + '\n');
}

export const log = {
  debug: (msg, c) => ecrire('debug', msg, c),
  info: (msg, c) => ecrire('info', msg, c),
  warn: (msg, c) => ecrire('warn', msg, c),
  error: (msg, c) => ecrire('error', msg, c),
};
