import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';
import { q, audit } from './db.js';
import { canRead, canWrite } from './rights.js';
import { roleRapports } from './profils-core.js';
import { detectDocumentOctets } from './fichiers-core.js';

export const filesRouter = Router();     // monté derrière authRequired + mustNotChangePw

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_DOC_BYTES = 25 * 1024 * 1024;                  // rapports d'activité (Excel, Word, PDF)
export const MAX_FILE_BYTES = MAX_DOC_BYTES;                     // limite de lecture du corps (la limite par type est vérifiée ensuite)
export const MAX_FILES_PER_RECORD = 12;
const MAX_DOCS_PAR_RAPPORT = 30;
const ATTACHABLE = new Set(['dis', 'bts', 'rapports']);
const DOCUMENTS = new Set(['rapports']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// Le type du fichier est déterminé par son CONTENU (signature), jamais par ce qu'annonce le navigateur.
// Seuls JPEG, PNG et WebP sont acceptés : ni SVG, ni HTML, ni GIF animé, ni exécutable.
export function detectImage(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png' };
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  return null;
}

// Documents des rapports : Excel (.xlsx), Word (.docx) ou PDF, reconnus par leur CONTENU. Les fichiers à macros
// (vbaProject.bin) et les anciens formats binaires (.xls / .doc) sont refusés.
export const detectDocument = (buf) => (Buffer.isBuffer(buf) ? detectDocumentOctets(new Uint8Array(buf.buffer, buf.byteOffset, buf.length)) : null);
const EXT = { 'image/png': 'png', 'image/webp': 'webp', 'image/jpeg': 'jpg', 'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx' };

// Rapport d'activité : seuls l'UO (rôle « uo ») et le super administrateur déposent ou retirent des fichiers,
// et seulement tant que le rapport est en brouillon ou à corriger.
function depotRapportRefuse(user, rec) {
  const role = roleRapports(user);
  if (role !== 'uo' && role !== 'admin') return 'Seule l\'UO joint les fichiers de son rapport.';
  if (role === 'uo' && !['Brouillon', 'À corriger'].includes(rec.data?.etat)) return 'Rapport entre les mains de la DG : fichiers non modifiables.';
  return null;
}

export const cleanName = (n) => {
  const base = String(n ?? '').split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '').trim().slice(0, 80);
  return base || 'photo';
};

const fileOnDisk = (f) => path.join(config.filesDir, `${f.id}.${EXT[f.mime] || 'bin'}`);

async function recordOf(collection, recordId) {
  const { rows } = await q('SELECT unit, system, data FROM records WHERE collection=$1 AND id=$2 AND NOT deleted', [collection, recordId]);
  return rows[0] || null;
}

// Retrouve le fichier + son enregistrement et vérifie le droit demandé
async function load(req, res, need) {
  const id = req.params.id;
  if (!UUID.test(id)) { res.status(404).json({ error: 'Fichier introuvable.' }); return null; }
  const { rows } = await q('SELECT * FROM files WHERE id=$1 AND NOT deleted', [id]);
  const f = rows[0];
  const rec = f && await recordOf(f.collection, f.record_id);
  if (!f || !rec) { res.status(404).json({ error: 'Fichier introuvable.' }); return null; }
  const ok = need === 'write' ? canWrite(req.user, f.collection, rec.unit, rec.system) : canRead(req.user, f.collection, rec.unit, rec.system);
  if (!ok) { res.status(403).json({ error: "Vous n'avez pas accès à ce fichier." }); return null; }
  if (need === 'write' && DOCUMENTS.has(f.collection)) { const refus = depotRapportRefuse(req.user, rec); if (refus) { res.status(403).json({ error: refus }); return null; } }
  return { f, rec };
}

const meta = (f) => ({ id: f.id, name: f.name, mime: f.mime, size: f.size, uploadedBy: f.uploaded_by, createdAt: f.created_at });

// POST /api/files?collection=dis&recordId=DI-ALG-2026-0001&name=photo.jpg   (corps = image brute)
filesRouter.post('/', async (req, res) => {
  const { collection, recordId } = req.query;
  if (!ATTACHABLE.has(collection) || typeof recordId !== 'string' || !recordId) return res.status(400).json({ error: 'Collection ou enregistrement invalide.' });
  const rec = await recordOf(collection, recordId);
  if (!rec) return res.status(404).json({ error: "Enregistrement introuvable (a-t-il bien été enregistré ?)." });
  if (!canWrite(req.user, collection, rec.unit, rec.system)) return res.status(403).json({ error: "Vous n'avez pas le droit d'ajouter une pièce jointe ici." });
  const doc = DOCUMENTS.has(collection);
  if (doc) { const refus = depotRapportRefuse(req.user, rec); if (refus) return res.status(403).json({ error: refus }); }
  const body = req.body;
  if (!Buffer.isBuffer(body) || body.length === 0) return res.status(400).json({ error: 'Aucun fichier reçu.' });
  if (!doc && body.length > MAX_IMAGE_BYTES) return res.status(413).json({ error: 'Fichier ou envoi trop volumineux.' });
  const kind = doc ? detectDocument(body) : detectImage(body);
  if (kind?.refus) return res.status(415).json({ error: kind.refus });
  if (!kind) return res.status(415).json({ error: doc ? 'Format non accepté : Excel (.xlsx), Word (.docx) ou PDF.' : 'Format non accepté : photos JPEG, PNG ou WebP uniquement.' });
  const max = doc ? MAX_DOCS_PAR_RAPPORT : MAX_FILES_PER_RECORD;
  const n = (await q('SELECT count(*)::int AS n FROM files WHERE collection=$1 AND record_id=$2 AND NOT deleted', [collection, recordId])).rows[0].n;
  if (n >= max) return res.status(409).json({ error: `Maximum ${max} pièces jointes par élément.` });

  const id = crypto.randomUUID();
  const f = { id, collection, record_id: recordId, name: cleanName(req.query.name), mime: kind.mime, size: body.length, uploaded_by: req.user.id };
  fs.mkdirSync(config.filesDir, { recursive: true });
  const dest = fileOnDisk(f);
  fs.writeFileSync(dest, body, { flag: 'wx', mode: 0o640 });
  try {
    await q('INSERT INTO files (id, collection, record_id, name, mime, size, uploaded_by) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [f.id, f.collection, f.record_id, f.name, f.mime, f.size, f.uploaded_by]);
  } catch (e) { fs.rmSync(dest, { force: true }); throw e; }
  await audit(req, 'file_added', { collection, recordId, unit: rec.unit, detail: { id, name: f.name, size: f.size } });
  const { rows } = await q('SELECT * FROM files WHERE id=$1', [id]);
  res.status(201).json(meta(rows[0]));
});

// GET /api/files?collection=dis&recordId=...   -> liste
filesRouter.get('/', async (req, res) => {
  const { collection, recordId } = req.query;
  if (!ATTACHABLE.has(collection) || typeof recordId !== 'string') return res.status(400).json({ error: 'Collection ou enregistrement invalide.' });
  const rec = await recordOf(collection, recordId);
  if (!rec) return res.json({ files: [] });
  if (!canRead(req.user, collection, rec.unit, rec.system)) return res.status(403).json({ error: "Vous n'avez pas accès à ces données." });
  const { rows } = await q('SELECT * FROM files WHERE collection=$1 AND record_id=$2 AND NOT deleted ORDER BY created_at, id', [collection, recordId]);
  res.json({ files: rows.map(meta) });
});

// GET /api/files/:id   -> l'image
filesRouter.get('/:id', async (req, res) => {
  const ctx = await load(req, res, 'read'); if (!ctx) return;
  const file = fileOnDisk(ctx.f);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'Fichier absent du disque.' });
  res.set({
    'Content-Type': ctx.f.mime,
    'Content-Length': String(ctx.f.size),
    // documents : toujours téléchargés (jamais ouverts dans la page) ; photos : affichées
    'Content-Disposition': `${ctx.f.mime.startsWith('image/') ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(ctx.f.name)}`,
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'Cache-Control': 'private, max-age=3600',
  });
  fs.createReadStream(file).pipe(res);
});

// DELETE /api/files/:id
filesRouter.delete('/:id', async (req, res) => {
  const ctx = await load(req, res, 'write'); if (!ctx) return;
  await q('UPDATE files SET deleted=true WHERE id=$1', [ctx.f.id]);
  fs.rmSync(fileOnDisk(ctx.f), { force: true });
  await audit(req, 'file_deleted', { collection: ctx.f.collection, recordId: ctx.f.record_id, unit: ctx.rec.unit, detail: { id: ctx.f.id, name: ctx.f.name } });
  res.json({ ok: true });
});
