-- Compteurs de numérotation attribués par le serveur (DI, BT, DS, BS, BR, décharges, plans préventifs, articles).
-- name  : séquence (ex. 'dis', 'bts:prev', 'pieces:P')
-- scope : abréviation de l'unité ('ALG'...) ou '' pour les séquences communes (magasin central)
-- year  : année civile, 0 pour les séquences qui ne redémarrent jamais
CREATE TABLE counters (
  name  text    NOT NULL,
  scope text    NOT NULL DEFAULT '',
  year  integer NOT NULL DEFAULT 0,
  last  integer NOT NULL DEFAULT 0,
  PRIMARY KEY (name, scope, year)
);
