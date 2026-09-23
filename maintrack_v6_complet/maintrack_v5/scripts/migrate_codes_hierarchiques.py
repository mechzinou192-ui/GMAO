"""
Migration : remplace les anciens codes plats (SYS-000001, EQ-000002, ...) par
des codes hiérarchiques construits sur la nomenclature réelle, du style :

    CFO                     (système)
    CFO.AG1                 (sous-système "Agitateur 1")
    CFO.AG1.RBT             (sous-sous-système "Robinet")
    CFO.AG1.RBT.ACC         (équipement "Accouplement")
    CFO.AG1.MALT.01         (deuxième élément "Mise à la terre" sans numéro
                              distinctif dans le nom -> numéro chronologique)

Chaque segment est déduit automatiquement du nom (voir suggerer_segment dans
app/db.py) : si le nom commence déjà par un code (ex "CFO — Courant fort"),
ce code est repris tel quel ; sinon un segment de 2 à 4 lettres est généré
à partir des initiales ou des consonnes du nom, plus un numéro s'il y en a
un dans le nom. En cas de doublon entre éléments d'un même parent, un
numéro chronologique (.01, .02, ...) est ajouté.

Sans danger à relancer plusieurs fois : les codes sont recalculés à
l'identique tant que les noms et l'ordre des éléments ne changent pas.

Utilisation :
    python3 scripts/migrate_codes_hierarchiques.py
"""
import sqlite3
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "app"))
from db import suggerer_segment, obtenir_code_site  # noqa: E402

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "maintrack.db")


def colonne_existe(cur, table, colonne):
    cur.execute(f"PRAGMA table_info({table})")
    return any(row[1] == colonne for row in cur.fetchall())


def main():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    if not colonne_existe(cur, "sites", "code"):
        cur.execute("ALTER TABLE sites ADD COLUMN code TEXT")
        print("Colonne 'code' ajoutée à la table sites.")

    for (site_id,) in cur.execute("SELECT id FROM sites ORDER BY id").fetchall():
        code_site = obtenir_code_site(conn, site_id)
        print(f"Site {site_id} -> préfixe '{code_site}'")
    conn.commit()

    total = 0
    for (site_id,) in cur.execute("SELECT id FROM sites ORDER BY id").fetchall():
        code_site = obtenir_code_site(conn, site_id)
        # Segments déjà attribués à ce niveau (par parent_id), pour détecter
        # les doublons au fil du parcours -> {parent_id: {segment: qte}}
        segments_pris = {}

        # Parcours en largeur, du haut de l'arbre vers le bas : un élément
        # n'est traité qu'une fois que son parent a déjà reçu son code.
        niveau_courant = cur.execute(
            "SELECT id, nom FROM elements WHERE site_id=? AND parent_id IS NULL ORDER BY nom",
            (site_id,),
        ).fetchall()

        codes_par_id = {None: code_site}

        while niveau_courant:
            suivant = []
            for elem_id, nom in niveau_courant:
                parent_id = cur.execute(
                    "SELECT parent_id FROM elements WHERE id=?", (elem_id,)
                ).fetchone()[0]

                segment = suggerer_segment(nom)
                pris = segments_pris.setdefault(parent_id, set())
                segment_final = segment
                if segment_final in pris:
                    n = 1
                    while f"{segment}.{n:02d}" in pris:
                        n += 1
                    segment_final = f"{segment}.{n:02d}"
                pris.add(segment_final)

                code_parent = codes_par_id.get(parent_id)
                nouveau_code = f"{code_parent}.{segment_final}" if code_parent else segment_final
                codes_par_id[elem_id] = nouveau_code

                cur.execute("UPDATE elements SET code=? WHERE id=?", (nouveau_code, elem_id))
                total += 1

                enfants = cur.execute(
                    "SELECT id, nom FROM elements WHERE parent_id=? ORDER BY nom", (elem_id,)
                ).fetchall()
                suivant.extend(enfants)
            niveau_courant = suivant

    conn.commit()
    conn.close()
    print(f"{total} élément(s) recodé(s) avec le format hiérarchique (ex: CFO.AG1.RBT.ACC).")
    print("Ouvrez l'Arborescence dans l'app pour vérifier / ajuster les segments si besoin "
          "(champ 'Segment de code' dans le formulaire Modifier).")


if __name__ == "__main__":
    main()
