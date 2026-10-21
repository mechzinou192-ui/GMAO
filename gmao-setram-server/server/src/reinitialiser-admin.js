// Secours : redonne l'accès au compte « admin » quand plus aucun super administrateur ne peut se connecter.
//   docker compose exec app node src/reinitialiser-admin.js            (installation Docker)
//   sudo -u gmao --preserve-env node src/reinitialiser-admin.js        (installation systemd, variables chargées)
// Effet : nouveau mot de passe provisoire aléatoire affiché UNE fois, compte réactivé, super administrateur,
// déverrouillé, changement exigé à la connexion, sessions ouvertes coupées. L'opération est inscrite au journal d'audit.
import crypto from 'node:crypto';
import { q, pool, migrate } from './db.js';
import { hashPassword } from './auth.js';

await migrate();
const pw = crypto.randomBytes(9).toString('base64url') + '7';
const h = await hashPassword(pw);
const { rowCount } = await q(
  `UPDATE users SET pw_hash=$1, must_change_pw=true, actif=true, super_admin=true, role='Super Admin',
     failed_attempts=0, locked_until=NULL, token_version=token_version+1 WHERE id='admin'`, [h]);
if (!rowCount) await q(`INSERT INTO users (id, nom, role, pw_hash, super_admin, must_change_pw) VALUES ('admin','Super Administrateur','Super Admin',$1,true,true)`, [h]);
await q(`INSERT INTO audit_log (user_id, action, detail) VALUES ('admin', 'admin_reset_console', $1)`, [JSON.stringify({ recree: !rowCount })]);
console.log('\nCompte « admin » réinitialisé. Mot de passe provisoire (affiché une seule fois) : ' + pw + '\nLe changement sera exigé à la connexion.\n');
await pool.end?.();
process.exit(0);
