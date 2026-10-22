-- « Repartir de zéro » par unité et/ou par système : on garde le périmètre de chaque opération (lecture du journal,
-- procédure d'annulation du runbook). NULL = toutes les unités / tous les systèmes.
ALTER TABLE reinitialisations ADD COLUMN unite   text;
ALTER TABLE reinitialisations ADD COLUMN systeme text;
