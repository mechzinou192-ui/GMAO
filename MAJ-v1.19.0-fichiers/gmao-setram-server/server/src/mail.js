// Envoi des e-mails de notification. Facultatif : rien n'est envoyé tant que SMTP_HOST n'est pas renseigné.
// Le message ne contient que le texte court de la notification (numéro d'OT, équipement) et un lien vers la GMAO :
// aucun détail sensible ne sort par la messagerie. Un échec d'envoi est journalisé, jamais bloquant.
import nodemailer from 'nodemailer';
import { config } from './config.js';
import { log } from './logger.js';

let transport = null;
const transportSmtp = () => {
  if (!config.smtp.host) return null;
  transport ||= nodemailer.createTransport({
    host: config.smtp.host, port: config.smtp.port, secure: config.smtp.secure,
    ...(config.smtp.user ? { auth: { user: config.smtp.user, pass: config.smtp.pass } } : {}),
    disableFileAccess: true, disableUrlAccess: true,
  });
  return transport;
};
// pour les tests : transport factice
export const _definirTransport = (t) => { transport = t; };
export const emailActif = () => !!(config.smtp.host || transport);

const ADRESSE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[A-Za-z]{2,}$/;
export const adresseValide = (a) => typeof a === 'string' && a.length <= 200 && ADRESSE.test(a);

export async function envoyerNotification(destinataires, texte) {
  const t = transport || transportSmtp();
  const a = [...new Set(destinataires.filter(adresseValide))];
  if (!t || !a.length) return 0;
  const lien = config.smtp.url ? `\n\nOuvrir la GMAO : ${config.smtp.url}` : '';
  try {
    await t.sendMail({ from: config.smtp.from, bcc: a, subject: `GMAO — ${texte.slice(0, 120)}`, text: `${texte}${lien}\n\n(Message automatique, ne pas répondre.)` });
    return a.length;
  } catch (e) {
    log.warn('e-mail de notification non envoyé', { erreur: e.message, destinataires: a.length });
    return 0;
  }
}
