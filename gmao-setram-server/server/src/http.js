// Briques HTTP communes : identifiant de requête, journal d'accès, format d'erreur unique, limitation de débit.
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { rateLimit } from 'express-rate-limit';
import { config } from './config.js';
import { log } from './logger.js';

// ---------- Identifiant de requête ----------
// Repris de l'en-tête X-Request-Id s'il est sain (l'interface en envoie un), sinon généré. Renvoyé dans la réponse
// et dans chaque ligne de journal : une erreur signalée par un utilisateur se retrouve en une recherche.
const ID_SAIN = /^[A-Za-z0-9-]{8,64}$/;
export function requestId(req, res, next) {
  const recu = req.get('X-Request-Id');
  req.id = recu && ID_SAIN.test(recu) ? recu : crypto.randomUUID();
  res.set('X-Request-Id', req.id);
  next();
}

// ---------- Journal d'accès (une ligne JSON par requête API) ----------
export function journalAcces(req, res, next) {
  const debut = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - debut) / 1e6;
    const niveau = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    // chemin sans paramètres de requête (ils peuvent contenir des données métier)
    log[niveau === 'info' && req.method === 'GET' ? 'debug' : niveau]('requête', {
      requestId: req.id, method: req.method, path: req.baseUrl + req.path, status: res.statusCode,
      ms: Math.round(ms), user: req.user ? req.user.id : undefined,
    });
  });
  next();
}

// ---------- Format d'erreur unique ----------
// Toute réponse d'erreur devient : { error: { code, message, details?, requestId } }.
// Les routes existantes renvoient { error: "message" } : ce middleware les met au format sans les réécrire une à une.
const CODES = { 400: 'BAD_REQUEST', 401: 'UNAUTHENTICATED', 403: 'FORBIDDEN', 404: 'NOT_FOUND', 409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE', 415: 'UNSUPPORTED_MEDIA_TYPE', 422: 'UNPROCESSABLE', 423: 'LOCKED', 429: 'RATE_LIMITED',
  500: 'INTERNAL_ERROR', 503: 'SERVICE_UNAVAILABLE' };
export const codeErreur = (status) => CODES[status] || (status >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST');
export function formatErreurs(req, res, next) {
  const json = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode >= 400 && body && typeof body.error === 'string') {
      // les autres champs (dont un « code » métier déjà présent : EXISTS, MUST_CHANGE_PW…) restent aussi au premier niveau, pour compatibilité
      const { error, details, ...reste } = body;
      return json({ ...reste, error: { code: body.code || codeErreur(res.statusCode), message: error, ...(details !== undefined ? { details } : {}), requestId: req.id } });
    }
    return json(body);
  };
  next();
}

// ---------- Limitation de débit ----------
// Clé de comptage : l'utilisateur connecté (lu dans le cookie de session signé), sinon l'adresse IP.
// L'adresse IP n'est fiable que si TRUST_PROXY est réglé selon le reverse proxy (jamais l'en-tête X-Forwarded-For brut).
function cle(req) {
  try {
    const t = req.cookies && req.cookies.gmao_token;
    if (t) { const p = jwt.verify(t, config.jwtSecret); if (p && p.sub) return 'u:' + p.sub; }
  } catch { /* jeton absent ou invalide : comptage par adresse */ }
  return 'ip:' + (req.ip || 'inconnue');
}
const anonymiser = (k) => k.slice(0, 2) + crypto.createHash('sha256').update(k).digest('hex').slice(0, 12);

function limiteur(nom, max, fenetreMs, { keyGenerator = cle, skip } = {}) {
  return rateLimit({
    windowMs: fenetreMs, limit: max, standardHeaders: 'draft-6', legacyHeaders: false, keyGenerator, skip,
    handler: (req, res) => {
      const reset = req.rateLimit && req.rateLimit.resetTime ? Math.max(1, Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000)) : Math.ceil(fenetreMs / 1000);
      log.warn('limite de débit atteinte', { requestId: req.id, limite: nom, path: req.baseUrl + req.path, cle: anonymiser(keyGenerator(req)) });
      res.set('Retry-After', String(reset));
      res.status(429).json({ error: `Trop de requêtes. Réessayez dans ${reset} s.`, code: 'RATE_LIMITED' });
    },
  });
}

const ECRITURE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
// Fabrique les limiteurs à partir de la configuration (les tests passent des valeurs plus basses)
export function limiteurs(lim = config.rateLimit) {
  const w = lim.windowSec * 1000;
  return {
    global: limiteur('global', lim.globalMax, w),
    ecritures: limiteur('écritures', lim.writeMax, w, { skip: (req) => !ECRITURE.has(req.method) }),
    couteuses: limiteur('coûteuses', lim.costlyMax, w, { skip: (req) => !ECRITURE.has(req.method) }),
    connexion: limiteur('connexion', lim.authMax, lim.authWindowMin * 60 * 1000, { keyGenerator: (req) => 'ip:' + (req.ip || 'inconnue') }),
  };
}
