-- Lecture rapide des DI / OT récents ou ouverts (fenêtre de chargement) et des changements depuis (since).
CREATE INDEX IF NOT EXISTS records_by_coll_updated ON records (collection, updated_at);
CREATE INDEX IF NOT EXISTS records_by_coll_etat ON records (collection, (data->>'etat'));
