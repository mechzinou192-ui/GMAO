"""
Initialise la base avec vos 7 sites et, pour chacun, les 8 systèmes de tête.
Structure vide : à vous de venir ajouter au fur et à mesure les sous-systèmes,
sous-sous-systèmes et équipements sous chaque système, via l'application.
"""
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "maintrack.db")

SITES = [
    "Alger", "Ouargla", "Sétif", "Mostaganem",
    "Sidi Bel Abbès", "Oran", "Constantine",
]

# code : (nom affiché)
SYSTEMES = {
    "CFO": "CFO — Courant fort",
    "CFA": "CFA — Courant faible",
    "BILLETIQUE": "Billettique",
    "ELM": "ELM — Électromécanique",
    "VOIE": "Voie",
    "BO": "BO",
    "EI": "EI — Équipement industriel",
    "MR": "MR — Matériel roulant",
}


def main():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    for site_nom in SITES:
        cur.execute("INSERT OR IGNORE INTO sites (nom) VALUES (?)", (site_nom,))
        cur.execute("SELECT id FROM sites WHERE nom = ?", (site_nom,))
        site_id = cur.fetchone()[0]

        for code, nom in SYSTEMES.items():
            cur.execute("""
                INSERT OR IGNORE INTO elements (site_id, parent_id, nom, type)
                VALUES (?, NULL, ?, 'systeme')
            """, (site_id, nom))

    conn.commit()

    cur.execute("SELECT COUNT(*) FROM sites")
    n_sites = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM elements WHERE type='systeme'")
    n_systemes = cur.fetchone()[0]
    conn.close()

    print(f"{n_sites} sites et {n_systemes} systèmes créés ({n_systemes // n_sites} par site).")


if __name__ == "__main__":
    main()
