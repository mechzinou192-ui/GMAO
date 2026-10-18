-- Référentiels « document unique » -> une ligne par élément.
--
-- Avant : systemes / arborescence / feries étaient chacun UN enregistrement (id 'main') : deux administrateurs qui
--         modifiaient le même référentiel en même temps se retrouvaient en conflit, le second perdait sa saisie.
-- Après : un enregistrement par système, par sous-système et par jour férié.
--
--   systemes     : id = code système            data = { code, nom, ordre }
--   arborescence : id = SYSTÈME (en-tête)       data = { system, header: true, ordre }
--                  id = SYSTÈME.SOUS            data = { system, code, sub, ordre }
--   feries       : id = md:MM-JJ | date:AAAA-MM-JJ   data = { nom, md | date }
--
-- Le script est rejouable : rien n'est écrasé, l'ancienne fiche 'main' est marquée supprimée une fois convertie.
-- Sur un serveur neuf (aucune fiche 'main'), il ne fait rien : les valeurs par défaut sont créées par l'application.

INSERT INTO records (collection, id, unit, system, data, version, updated_by)
SELECT 'systemes', e.value->>0, '', NULL,
       jsonb_build_object('code', e.value->>0, 'nom', COALESCE(e.value->>1, e.value->>0), 'ordre', (e.ord - 1)::int),
       1, 'migration'
FROM records r, jsonb_array_elements(r.data->'list') WITH ORDINALITY AS e(value, ord)
WHERE r.collection = 'systemes' AND r.id = 'main' AND NOT r.deleted
  AND jsonb_typeof(r.data->'list') = 'array' AND jsonb_typeof(e.value) = 'array' AND (e.value->>0) IS NOT NULL
ON CONFLICT (collection, id) DO NOTHING;

INSERT INTO records (collection, id, unit, system, data, version, updated_by)
SELECT 'arborescence', k.key, '', NULL,
       jsonb_build_object('system', k.key, 'header', true, 'ordre', (k.ord - 1)::int),
       1, 'migration'
FROM records r, jsonb_each(r.data) WITH ORDINALITY AS k(key, value, ord)
WHERE r.collection = 'arborescence' AND r.id = 'main' AND NOT r.deleted
ON CONFLICT (collection, id) DO NOTHING;

INSERT INTO records (collection, id, unit, system, data, version, updated_by)
SELECT 'arborescence', k.key || '.' || (s.value->>'code'), '', NULL,
       jsonb_build_object('system', k.key, 'code', s.value->>'code', 'sub', COALESCE(s.value->>'sub', s.value->>'code'), 'ordre', (s.ord - 1)::int),
       1, 'migration'
FROM records r, jsonb_each(r.data) AS k(key, value),
     jsonb_array_elements(CASE WHEN jsonb_typeof(k.value) = 'array' THEN k.value ELSE '[]'::jsonb END) WITH ORDINALITY AS s(value, ord)
WHERE r.collection = 'arborescence' AND r.id = 'main' AND NOT r.deleted
  AND jsonb_typeof(s.value) = 'object' AND (s.value->>'code') IS NOT NULL
ON CONFLICT (collection, id) DO NOTHING;

INSERT INTO records (collection, id, unit, system, data, version, updated_by)
SELECT 'feries',
       CASE WHEN f.value->>'md' IS NOT NULL THEN 'md:' || (f.value->>'md') ELSE 'date:' || (f.value->>'date') END,
       '', NULL,
       CASE WHEN f.value->>'md' IS NOT NULL
            THEN jsonb_build_object('nom', f.value->>'nom', 'md', f.value->>'md')
            ELSE jsonb_build_object('nom', f.value->>'nom', 'date', f.value->>'date') END,
       1, 'migration'
FROM records r, jsonb_array_elements(r.data->'list') AS f(value)
WHERE r.collection = 'feries' AND r.id = 'main' AND NOT r.deleted
  AND jsonb_typeof(r.data->'list') = 'array' AND jsonb_typeof(f.value) = 'object'
  AND (f.value->>'md' IS NOT NULL OR f.value->>'date' IS NOT NULL)
ON CONFLICT (collection, id) DO NOTHING;

UPDATE records SET deleted = true, version = version + 1, updated_at = now(), updated_by = 'migration'
WHERE collection IN ('systemes', 'arborescence', 'feries') AND id = 'main' AND NOT deleted;
