"""
Migration : ajoute la colonne `code` à la table `elements`.

Cette colonne sert de "code équipement" (ex: EQ-000123), demandé dans la fiche
DI. Elle est différente de `reference` (référence constructeur) : `code` est
l'identifiant interne unique généré par l'application pour CHAQUE élément de
l'arbre (système, sous-système, équipement...), un peu comme code_di/code_bt.

Sans danger à relancer plusieurs fois : si la colonne existe déjà, ne fait rien.
Backfille aussi un code pour tous les éléments déjà en base qui n'en ont pas.
"""
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "maintrack.db")

PREFIXES = {
    "systeme": "SYS",
    "sous_systeme": "SSY",
    "sous_sous_systeme": "SSS",
    "equipement": "EQ",
    "sous_equipement": "SEQ",
}


def colonne_existe(cur, table, colonne):
    cur.execute(f"PRAGMA table_info({table})")
    return any(row[1] == colonne for row in cur.fetchall())


def main():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    if not colonne_existe(cur, "elements", "code"):
        cur.execute("ALTER TABLE elements ADD COLUMN code TEXT")
        print("Colonne 'code' ajoutée à la table elements.")
    else:
        print("Colonne 'code' déjà présente, rien à faire côté schéma.")

    # Backfill : tout élément sans code en reçoit un, numéroté globalement
    # par type (EQ-000001, EQ-000002, ... / SYS-000001, ...).
    cur.execute("SELECT id, type FROM elements WHERE code IS NULL ORDER BY id")
    a_completer = cur.fetchall()

    if a_completer:
        compteurs = {}
        for prefixe in PREFIXES.values():
            cur.execute(
                "SELECT code FROM elements WHERE code LIKE ? ORDER BY code DESC LIMIT 1",
                (f"{prefixe}-%",),
            )
            row = cur.fetchone()
            compteurs[prefixe] = int(row[0].split("-")[1]) if row else 0

        for elem_id, typ in a_completer:
            prefixe = PREFIXES.get(typ, "EL")
            compteurs[prefixe] = compteurs.get(prefixe, 0) + 1
            nouveau_code = f"{prefixe}-{compteurs[prefixe]:06d}"
            cur.execute("UPDATE elements SET code = ? WHERE id = ?", (nouveau_code, elem_id))

        print(f"{len(a_completer)} élément(s) complété(s) avec un code.")
    else:
        print("Aucun élément à compléter.")

    # Unicité du code, une fois toutes les valeurs en place
    cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_elements_code ON elements(code)")

    conn.commit()
    conn.close()
    print("Migration terminée.")


if __name__ == "__main__":
    main()
