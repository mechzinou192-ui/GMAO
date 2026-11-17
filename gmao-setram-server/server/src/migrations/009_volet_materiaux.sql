-- v1.20 : « Gestion et suivi des matériaux » devient un volet à part (8), séparé de l'arborescence technique (0).
-- Pour ne rien retirer à personne, le volet 8 est ajouté partout où le volet 0 était donné, SAUF aux comptes des
-- profils de base qui n'ont pas l'arborescence d'origine (Exploitation, Gestionnaire de stock, Technicien, Directeur) :
-- s'ils voyaient l'arborescence, c'est que le super administrateur la leur avait ajoutée ; ils gardent l'arborescence
-- technique seule (il peut leur ajouter les matériaux dans Administration › Profils).

-- comptes : volet 8 ajouté sur chaque unité où le volet 0 est donné
UPDATE users u SET droits = (
  SELECT jsonb_object_agg(e.k,
    CASE WHEN jsonb_typeof(e.v->'volets') = 'array' AND (e.v->'volets') @> '[0]'::jsonb AND NOT (e.v->'volets') @> '[8]'::jsonb
         THEN jsonb_set(e.v, '{volets}', (e.v->'volets') || '[8]'::jsonb)
         ELSE e.v END)
  FROM jsonb_each(u.droits) AS e(k, v))
WHERE NOT u.super_admin
  AND u.role NOT IN ('Exploitation', 'Gestionnaire de stock', 'Magasinier', 'Technicien', 'Directeur')
  AND jsonb_typeof(u.droits) = 'object'
  AND EXISTS (SELECT 1 FROM jsonb_each(u.droits) AS e(k, v)
              WHERE jsonb_typeof(e.v->'volets') = 'array' AND (e.v->'volets') @> '[0]'::jsonb AND NOT (e.v->'volets') @> '[8]'::jsonb);

-- profils créés par le super administrateur (pas les réglages des profils de base) : même règle
UPDATE records SET data = jsonb_set(data, '{volets}', (data->'volets') || '[8]'::jsonb), version = version + 1, updated_at = now()
WHERE collection = 'profils' AND NOT deleted
  AND COALESCE(data->>'nom', '') NOT IN ('Exploitation', 'Gestionnaire de stock', 'Technicien', 'Chargé système', 'Responsable système',
    'Administrateur UO', 'Directeur UO', 'Expert DG', 'Responsable DG', 'Directeur DG', 'Directeur')
  AND jsonb_typeof(data->'volets') = 'array' AND (data->'volets') @> '[0]'::jsonb AND NOT (data->'volets') @> '[8]'::jsonb;
