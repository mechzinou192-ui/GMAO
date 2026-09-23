"""
Schéma complet de la base de données GMAO (Gestion de Maintenance Assistée par Ordinateur).

Trois grandes parties :
1. HIÉRARCHIE TECHNIQUE  : sites > éléments (arbre : système > sous-système > équipement > sous-équipement)
2. FICHES RESSOURCES     : pièces, outillages, consommables (utilisés par les équipements et les interventions)
3. CYCLE DE VIE           : DI (demande d'intervention) -> BT (bon de travail) -> DS (demande de sortie)
                             -> BS (bon de sortie) -> BR (bon de retour)
   + contrôles réglementaires / de mesure (déclenchent des DI préventives)

Les codes (DI-0001, BT-0001...) et les changements d'état automatiques (ex: DI passe à
"transmise" quand un BT est créé) seront gérés par le code Python de l'application,
pas par la base elle-même — la base ne fait que stocker les données et vérifier les liens.
"""
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "maintrack.db")

SCHEMA = """
-- ============================================================
-- 0. COMPTES / ACCÈS
-- ============================================================

CREATE TABLE IF NOT EXISTS utilisateurs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom_complet TEXT NOT NULL,
    identifiant TEXT UNIQUE NOT NULL,
    mot_de_passe_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'technicien',
    actif INTEGER NOT NULL DEFAULT 1,
    date_creation TEXT NOT NULL
);

-- ============================================================
-- 1. HIÉRARCHIE TECHNIQUE
-- ============================================================

CREATE TABLE IF NOT EXISTS sites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom TEXT NOT NULL UNIQUE
);

-- Un "element" représente n'importe quel niveau de l'arbre technique :
-- système, sous-système, équipement, sous-équipement...
-- parent_id = NULL  -> système de tête, rattaché directement à un site.
-- Les colonnes reference/numero_serie/constructeur/fournisseur/photo_path/emplacement
-- ne sont utiles que pour les équipements et sous-équipements (elles restent vides
-- pour les systèmes et sous-systèmes, qui ne sont que des regroupements).
CREATE TABLE IF NOT EXISTS elements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    site_id INTEGER NOT NULL,
    parent_id INTEGER,
    nom TEXT NOT NULL,
    type TEXT NOT NULL,              -- 'systeme' / 'sous_systeme' / 'equipement' / 'sous_equipement'
    code TEXT UNIQUE,                -- code interne généré (ex: EQ-000123), = "code équipement" dans la DI
    emplacement TEXT,                -- ex : "Atelier 3, Zone B" (surtout pour les équipements)
    reference TEXT,                  -- référence ou numéro de série du fabricant
    numero_serie TEXT,
    constructeur TEXT,
    fournisseur TEXT,
    photo_path TEXT,                 -- chemin/URL de la photo de l'équipement
    FOREIGN KEY (site_id) REFERENCES sites(id),
    FOREIGN KEY (parent_id) REFERENCES elements(id),
    UNIQUE(site_id, parent_id, nom)
);

-- ============================================================
-- 2. FICHES RESSOURCES (pièces, outillages, consommables)
-- ============================================================

CREATE TABLE IF NOT EXISTS pieces (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    nom TEXT NOT NULL,
    constructeur TEXT,
    fournisseur TEXT,
    reference TEXT,
    numero_serie TEXT
);

CREATE TABLE IF NOT EXISTS outillages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    nom TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS consommables (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    nom TEXT NOT NULL
);

-- Nomenclature : quelles pièces/outillages/consommables sont associés à quel équipement
-- (utile pour savoir quoi préparer avant une intervention sur cet équipement).
CREATE TABLE IF NOT EXISTS equipement_pieces (
    equipement_id INTEGER NOT NULL REFERENCES elements(id),
    piece_id INTEGER NOT NULL REFERENCES pieces(id),
    PRIMARY KEY (equipement_id, piece_id)
);

CREATE TABLE IF NOT EXISTS equipement_outillages (
    equipement_id INTEGER NOT NULL REFERENCES elements(id),
    outillage_id INTEGER NOT NULL REFERENCES outillages(id),
    PRIMARY KEY (equipement_id, outillage_id)
);

CREATE TABLE IF NOT EXISTS equipement_consommables (
    equipement_id INTEGER NOT NULL REFERENCES elements(id),
    consommable_id INTEGER NOT NULL REFERENCES consommables(id),
    PRIMARY KEY (equipement_id, consommable_id)
);

-- ============================================================
-- 3. CYCLE DE VIE : DI -> BT -> DS -> BS -> BR
-- ============================================================

-- DI : Demande d'Intervention (signalement d'une panne)
-- États : 'a_transmettre' -> 'transmise' (dès qu'un BT est créé) -> 'traitee' (dès que le BT est clos)
CREATE TABLE IF NOT EXISTS demandes_intervention (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code_di TEXT UNIQUE NOT NULL,
    equipement_id INTEGER NOT NULL REFERENCES elements(id),
    type_panne TEXT,
    date_evenement TEXT,
    heure_evenement TEXT,
    date_creation TEXT NOT NULL,      -- rempli automatiquement (datetime.now())
    demandeur TEXT NOT NULL,          -- rempli automatiquement (utilisateur connecté)
    etat_di TEXT NOT NULL DEFAULT 'a_transmettre'
);

-- BT : Bon de Travail, généré à partir d'une DI
-- États : 'a_faire' -> 'en_cours' / 'attente_piece' -> 'clos'
CREATE TABLE IF NOT EXISTS bons_travail (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code_bt TEXT UNIQUE NOT NULL,
    di_id INTEGER NOT NULL REFERENCES demandes_intervention(id),
    equipement_id INTEGER NOT NULL REFERENCES elements(id),
    duree_intervention_h REAL,
    temps_logistique_h REAL,
    numero_permis_travail TEXT,
    photo_avant_path TEXT,
    photo_apres_path TEXT,
    etat_bt TEXT NOT NULL DEFAULT 'a_faire',
    date_creation TEXT NOT NULL,
    date_cloture TEXT
);

CREATE TABLE IF NOT EXISTS bt_techniciens (
    bt_id INTEGER NOT NULL REFERENCES bons_travail(id),
    technicien_nom TEXT NOT NULL,
    PRIMARY KEY (bt_id, technicien_nom)
);

CREATE TABLE IF NOT EXISTS bt_pieces (
    bt_id INTEGER NOT NULL REFERENCES bons_travail(id),
    piece_id INTEGER NOT NULL REFERENCES pieces(id),
    quantite REAL NOT NULL DEFAULT 1,
    PRIMARY KEY (bt_id, piece_id)
);

CREATE TABLE IF NOT EXISTS bt_outillages (
    bt_id INTEGER NOT NULL REFERENCES bons_travail(id),
    outillage_id INTEGER NOT NULL REFERENCES outillages(id),
    PRIMARY KEY (bt_id, outillage_id)
);

CREATE TABLE IF NOT EXISTS bt_consommables (
    bt_id INTEGER NOT NULL REFERENCES bons_travail(id),
    consommable_id INTEGER NOT NULL REFERENCES consommables(id),
    quantite REAL NOT NULL DEFAULT 1,
    PRIMARY KEY (bt_id, consommable_id)
);

-- DS : Demande de Sortie (besoin en pièces), créée à partir d'un BT par le technicien ingénierie
-- États : 'a_traiter' -> 'en_cours_traitement' -> 'traitee'
CREATE TABLE IF NOT EXISTS demandes_sortie (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code_ds TEXT UNIQUE NOT NULL,
    bt_id INTEGER NOT NULL REFERENCES bons_travail(id),
    equipement_id INTEGER NOT NULL REFERENCES elements(id),
    etat_ds TEXT NOT NULL DEFAULT 'a_traiter',
    cree_par TEXT,
    date_creation TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ds_pieces (
    ds_id INTEGER NOT NULL REFERENCES demandes_sortie(id),
    piece_id INTEGER NOT NULL REFERENCES pieces(id),
    quantite_demandee REAL NOT NULL DEFAULT 1,
    PRIMARY KEY (ds_id, piece_id)
);

-- BS : Bon de Sortie, généré à partir d'une DS (imprimé pour le magasinier)
-- États : 'en_cours' -> 'traitee'  (quand le BS passe à "traitee", la DS liée passe aussi à "traitee")
CREATE TABLE IF NOT EXISTS bons_sortie (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code_bs TEXT UNIQUE NOT NULL,
    ds_id INTEGER NOT NULL REFERENCES demandes_sortie(id),
    equipement_id INTEGER NOT NULL REFERENCES elements(id),
    etat_bs TEXT NOT NULL DEFAULT 'en_cours',
    date_creation TEXT NOT NULL,
    date_traitement TEXT
);

CREATE TABLE IF NOT EXISTS bs_pieces (
    bs_id INTEGER NOT NULL REFERENCES bons_sortie(id),
    piece_id INTEGER NOT NULL REFERENCES pieces(id),
    quantite_sortie REAL NOT NULL DEFAULT 1,
    PRIMARY KEY (bs_id, piece_id)
);

-- BR : Bon de Retour (pièce ou équipement rentré au magasin), référence le BS d'origine
CREATE TABLE IF NOT EXISTS bons_retour (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code_br TEXT UNIQUE NOT NULL,
    bs_id INTEGER NOT NULL REFERENCES bons_sortie(id),
    piece_id INTEGER REFERENCES pieces(id),
    equipement_id INTEGER REFERENCES elements(id),
    quantite REAL NOT NULL DEFAULT 1,
    date_retour TEXT NOT NULL
);

-- ============================================================
-- Contrôles périodiques (réglementaires ou de mesure)
-- Déclenchent automatiquement des DI préventives selon leur fréquence.
-- ============================================================
CREATE TABLE IF NOT EXISTS controles_periodiques (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    equipement_id INTEGER NOT NULL REFERENCES elements(id),
    type TEXT NOT NULL,              -- 'reglementaire' / 'mesure'
    nom_controle TEXT NOT NULL,
    frequence_jours INTEGER NOT NULL,
    derniere_date TEXT,
    prochaine_date TEXT
);
"""


def main():
    conn = sqlite3.connect(DB_PATH)
    conn.executescript(SCHEMA)
    conn.commit()
    conn.close()
    print(f"Base créée avec le schéma complet : {DB_PATH}")


if __name__ == "__main__":
    main()
