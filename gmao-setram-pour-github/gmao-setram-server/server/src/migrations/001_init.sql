CREATE TABLE users (
  id              text PRIMARY KEY,
  nom             text NOT NULL,
  role            text NOT NULL DEFAULT 'Technicien',
  pw_hash         text NOT NULL,
  actif           boolean NOT NULL DEFAULT true,
  super_admin     boolean NOT NULL DEFAULT false,
  must_change_pw  boolean NOT NULL DEFAULT false,
  droits          jsonb NOT NULL DEFAULT '{}',
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_until    timestamptz,
  token_version   integer NOT NULL DEFAULT 0,
  last_login      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Stockage générique des données métier (une ligne = un objet de l'application).
-- unit = '' pour les référentiels globaux (liste des systèmes, arborescence...).
CREATE TABLE records (
  collection text NOT NULL,
  id         text NOT NULL,
  unit       text NOT NULL DEFAULT '',
  system     text,
  data       jsonb NOT NULL,
  version    integer NOT NULL DEFAULT 1,
  deleted    boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text,
  PRIMARY KEY (collection, id)
);
CREATE INDEX records_by_unit ON records (collection, unit);
CREATE INDEX records_by_update ON records (updated_at);

CREATE TABLE audit_log (
  id         bigserial PRIMARY KEY,
  at         timestamptz NOT NULL DEFAULT now(),
  user_id    text,
  action     text NOT NULL,
  collection text,
  record_id  text,
  unit       text,
  detail     jsonb,
  ip         text
);
CREATE INDEX audit_by_at ON audit_log (at DESC);
