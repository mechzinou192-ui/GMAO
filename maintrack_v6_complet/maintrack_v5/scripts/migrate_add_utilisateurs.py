"""
Migration : ajoute la table `utilisateurs` (comptes / accès) à une base MaintTrack existante.
Sans danger à relancer plusieurs fois (CREATE TABLE IF NOT EXISTS).

Utilisation :
    python3 scripts/migrate_add_utilisateurs.py
"""
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "maintrack.db")

SCHEMA = """
CREATE TABLE IF NOT EXISTS utilisateurs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom_complet TEXT NOT NULL,
    identifiant TEXT UNIQUE NOT NULL,
    mot_de_passe_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'technicien',
    actif INTEGER NOT NULL DEFAULT 1,
    date_creation TEXT NOT NULL
);
"""


def main():
    conn = sqlite3.connect(DB_PATH)
    conn.executescript(SCHEMA)
    conn.commit()
    conn.close()
    print(f"Table 'utilisateurs' prête dans : {DB_PATH}")


if __name__ == "__main__":
    main()
