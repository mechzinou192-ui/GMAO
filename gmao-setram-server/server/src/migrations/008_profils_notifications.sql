-- Profils (v1.18) : anciens intitulés renommés, e-mail pour les notifications, délégation de la gestion des comptes
UPDATE users SET role = 'Chargé système'        WHERE role = 'Chargé de Maintenance';
UPDATE users SET role = 'Responsable système'   WHERE role = 'Responsable';
UPDATE users SET role = 'Gestionnaire de stock' WHERE role = 'Magasinier';
ALTER TABLE users ADD COLUMN email text;
-- l'administrateur UO ne gère les comptes de son unité que si le super administrateur lui en donne la main (révocable)
ALTER TABLE users ADD COLUMN gestion_comptes boolean NOT NULL DEFAULT false;

-- Notifications dans la GMAO (cloche) : une ligne par destinataire
CREATE TABLE notifications (
  id         bigserial PRIMARY KEY,
  user_id    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  at         timestamptz NOT NULL DEFAULT now(),
  type       text NOT NULL,
  collection text,
  record_id  text,
  unit       text,
  texte      text NOT NULL,
  lu         boolean NOT NULL DEFAULT false
);
CREATE INDEX notifications_user_idx ON notifications (user_id, lu, at DESC);
