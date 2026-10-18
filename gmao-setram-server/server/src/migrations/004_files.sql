-- Pièces jointes (photos) rattachées à une DI ou à un BT. Le fichier est stocké sur disque (FILES_DIR),
-- la base ne garde que la référence : qui, quoi, quand.
CREATE TABLE files (
  id          text PRIMARY KEY,                 -- UUID, aussi nom du fichier sur disque
  collection  text NOT NULL,                    -- 'dis' | 'bts'
  record_id   text NOT NULL,
  name        text NOT NULL,                    -- nom d'origine, nettoyé (affichage uniquement)
  mime        text NOT NULL,                    -- déterminé par le serveur d'après le contenu, jamais d'après le client
  size        integer NOT NULL,
  uploaded_by text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  deleted     boolean NOT NULL DEFAULT false
);
CREATE INDEX files_record_idx ON files (collection, record_id) WHERE NOT deleted;
