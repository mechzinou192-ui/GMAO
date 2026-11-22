-- v1.21 : le magasin devient PAR UNITÉ. Articles, DS, BS, BR et décharges étaient communs à toutes les unités
-- (unit = '') ; chaque élément existant est rattaché à une unité, déduite de ce qu'il concerne :
--   DS        : unité de l'OT lié, sinon de l'équipement visé
--   BS        : unité de sa DS
--   articles  : unité qui l'a le plus demandé (lignes de DS), sinon qui l'a le plus utilisé dans ses OT
--   décharges : unité de l'OT lié, sinon de l'article
--   BR        : unité de l'article
-- À défaut (aucune trace), l'unité la plus active de la base (celle du pilote). Les numéros (P-001, DS-2026-0012…)
-- ne changent pas : ils restent uniques pour toute l'entreprise. Les éléments supprimés sont aussi rattachés
-- (une restauration retrouve son unité).

CREATE TEMP TABLE _unite_defaut ON COMMIT DROP AS
SELECT COALESCE(
  (SELECT unit FROM records WHERE unit <> '' AND NOT deleted GROUP BY unit ORDER BY count(*) DESC, unit LIMIT 1),
  (SELECT e.k FROM users u, jsonb_each(CASE WHEN jsonb_typeof(u.droits) = 'object' THEN u.droits ELSE '{}'::jsonb END) AS e(k, v)
     GROUP BY e.k ORDER BY count(*) DESC, e.k LIMIT 1),
  'Alger') AS unit;

-- DS : OT lié, sinon équipement (ou sous-équipement : le code commence par celui de l'équipement)
UPDATE records d SET unit = COALESCE(
  (SELECT b.unit FROM records b WHERE b.collection = 'bts' AND b.id = d.data->>'bt' AND b.unit <> ''),
  (SELECT e.unit FROM records e WHERE e.collection = 'equipements' AND e.unit <> ''
     AND (e.id = d.data->>'eq' OR left(d.data->>'eq', char_length(e.id) + 1) = e.id || '.')
     ORDER BY char_length(e.id) DESC LIMIT 1),
  (SELECT unit FROM _unite_defaut))
WHERE d.collection = 'dss' AND d.unit = '';

-- BS : unité de la DS
UPDATE records s SET unit = COALESCE(
  (SELECT d.unit FROM records d WHERE d.collection = 'dss' AND d.id = s.data->>'ds' AND d.unit <> ''),
  (SELECT unit FROM _unite_defaut))
WHERE s.collection = 'bs' AND s.unit = '';

-- articles : unité qui l'a le plus demandé (DS), sinon le plus utilisé (OT : pièces, outillage, consommables)
UPDATE records p SET unit = COALESCE(
  (SELECT d.unit FROM records d
     LEFT JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(d.data->'lignes') = 'array' THEN d.data->'lignes' ELSE '[]'::jsonb END) AS l(x) ON true
     WHERE d.collection = 'dss' AND NOT d.deleted AND d.unit <> '' AND (l.x->>'piece' = p.id OR d.data->>'piece' = p.id)
     GROUP BY d.unit ORDER BY count(*) DESC, d.unit LIMIT 1),
  (SELECT b.unit FROM records b
     WHERE b.collection = 'bts' AND NOT b.deleted AND b.unit <> ''
       AND (COALESCE(b.data->'pieces', '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('code', p.id))
         OR COALESCE(b.data->'outillage', '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('code', p.id))
         OR COALESCE(b.data->'consommables', '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('code', p.id)))
     GROUP BY b.unit ORDER BY count(*) DESC, b.unit LIMIT 1),
  (SELECT unit FROM _unite_defaut))
WHERE p.collection = 'pieces' AND p.unit = '';

-- décharges : OT lié, sinon article
UPDATE records c SET unit = COALESCE(
  (SELECT b.unit FROM records b WHERE b.collection = 'bts' AND b.id = c.data->>'bt' AND b.unit <> ''),
  (SELECT p.unit FROM records p WHERE p.collection = 'pieces' AND p.id = c.data->>'piece' AND p.unit <> ''),
  (SELECT unit FROM _unite_defaut))
WHERE c.collection = 'decharges' AND c.unit = '';

-- BR : unité de l'article
UPDATE records r SET unit = COALESCE(
  (SELECT p.unit FROM records p WHERE p.collection = 'pieces' AND p.id = r.data->>'piece' AND p.unit <> ''),
  (SELECT unit FROM _unite_defaut))
WHERE r.collection = 'brs' AND r.unit = '';

-- l'unité est aussi portée par la donnée (l'interface filtre le magasin sur l'unité affichée)
UPDATE records SET data = jsonb_set(data, '{unit}', to_jsonb(unit)), version = version + 1, updated_at = now()
WHERE collection IN ('pieces', 'dss', 'bs', 'brs', 'decharges') AND unit <> ''
  AND jsonb_typeof(data) = 'object' AND (data->>'unit') IS DISTINCT FROM unit;
