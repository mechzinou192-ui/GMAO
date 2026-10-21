-- « Repartir de zéro » (mise en service d'une nouvelle GMAO) : avant d'être marqués supprimés, les éléments sont
-- copiés ici avec le numéro de l'opération. Rien n'est effacé physiquement : la DSI peut restaurer une opération
-- (voir docs/runbook.md, « Annuler une remise à zéro »).
CREATE TABLE reinitialisations (
  id           bigserial PRIMARY KEY,
  at           timestamptz NOT NULL DEFAULT now(),
  user_id      text NOT NULL,
  collections  text[] NOT NULL,
  numerotation boolean NOT NULL,
  compteurs    jsonb,          -- état des compteurs de numérotation avant remise à 1
  totaux       jsonb NOT NULL  -- nombre d'éléments archivés par collection
);

CREATE TABLE records_archive (
  reinitialisation bigint NOT NULL REFERENCES reinitialisations(id),
  collection text NOT NULL,
  id         text NOT NULL,
  unit       text NOT NULL,
  system     text,
  data       jsonb NOT NULL,
  version    integer NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by text,
  PRIMARY KEY (reinitialisation, collection, id)
);
