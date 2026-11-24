-- v1.22 : l'arborescence sous un équipement n'est plus limitée à 5 niveaux. Chaque nœud peut avoir `enfants` (récursif) ;
-- l'ancien champ `sousSousEquip` (enfants d'un sous-équipement) est converti en `enfants`. Rien n'est perdu :
-- mêmes codes, mêmes noms, mêmes fournisseurs ; le code d'un enfant reste « code du parent + .NN ».
-- Les DI / OT / plans existants gardent leurs champs `se` et `ss` (le champ `noeud`, ajouté pour les nouvelles
-- saisies, n'est pas nécessaire pour les lire). Idempotent : sans `sousSousEquip`, la fonction ne change rien.

CREATE OR REPLACE FUNCTION _gmao_convertir_noeud(n jsonb) RETURNS jsonb AS $$
DECLARE
  enf jsonb;
  res jsonb;
BEGIN
  IF jsonb_typeof(n) <> 'object' THEN RETURN n; END IF;
  enf := COALESCE(n->'enfants', n->'sousSousEquip', '[]'::jsonb);
  IF jsonb_typeof(enf) <> 'array' THEN enf := '[]'::jsonb; END IF;
  SELECT COALESCE(jsonb_agg(_gmao_convertir_noeud(x) ORDER BY ord), '[]'::jsonb) INTO enf
    FROM jsonb_array_elements(enf) WITH ORDINALITY AS t(x, ord);
  res := (n - 'sousSousEquip') || jsonb_build_object('enfants', enf);
  RETURN res;
END;
$$ LANGUAGE plpgsql;

UPDATE records r SET data = jsonb_set(r.data, '{sousEquip}', (
    SELECT COALESCE(jsonb_agg(_gmao_convertir_noeud(x) ORDER BY ord), '[]'::jsonb)
      FROM jsonb_array_elements(r.data->'sousEquip') WITH ORDINALITY AS t(x, ord)))
WHERE r.collection = 'equipements'
  AND jsonb_typeof(r.data->'sousEquip') = 'array'
  AND r.data::text LIKE '%sousSousEquip%';

DROP FUNCTION _gmao_convertir_noeud(jsonb);
