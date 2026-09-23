"""
Script interactif pour ajouter des éléments dans l'arbre technique
(système > sous-système > sous-sous-système > équipement > sous-équipement).

Utilisation :
    python3 scripts/gestion_arbre.py

À chaque niveau, on vous montre ce qui existe déjà et vous pouvez soit y entrer,
soit ajouter un nouvel élément. Le type (système, sous-système...) est déduit
automatiquement de la profondeur — vous n'avez rien à choisir.

Quand l'élément ajouté est un équipement (ou plus profond), le script demande
en plus les infos de la fiche équipement (référence, n° de série, etc.).
"""
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "maintrack.db")

TYPES_PAR_NIVEAU = {0: "systeme", 1: "sous_systeme", 2: "sous_sous_systeme", 3: "equipement"}

PREFIXES_CODE = {
    "systeme": "SYS",
    "sous_systeme": "SSY",
    "sous_sous_systeme": "SSS",
    "equipement": "EQ",
    "sous_equipement": "SEQ",
}


def type_pour_niveau(niveau):
    return TYPES_PAR_NIVEAU.get(niveau, "sous_equipement")


def generer_code(cur, type_elem):
    """Génère le prochain code disponible pour ce type (ex: EQ-000042)."""
    prefixe = PREFIXES_CODE.get(type_elem, "EL")
    cur.execute(
        "SELECT code FROM elements WHERE code LIKE ? ORDER BY code DESC LIMIT 1",
        (f"{prefixe}-%",),
    )
    row = cur.fetchone()
    dernier_numero = int(row[0].split("-")[1]) if row else 0
    return f"{prefixe}-{dernier_numero + 1:06d}"


def label_type(t):
    return {
        "systeme": "système", "sous_systeme": "sous-système",
        "sous_sous_systeme": "sous-sous-système",
        "equipement": "équipement", "sous_equipement": "sous-équipement",
    }.get(t, t)


def choisir_dans_liste(cur, titre, options, formatter):
    """Affiche une liste numérotée et retourne l'élément choisi (ou None)."""
    print(f"\n{titre}")
    for i, opt in enumerate(options, start=1):
        print(f"  {i}. {formatter(opt)}")
    choix = input("Numéro (ou Entrée pour annuler) : ").strip()
    if not choix.isdigit() or not (1 <= int(choix) <= len(options)):
        return None
    return options[int(choix) - 1]


def saisir_fiche_equipement():
    print("  (laissez vide si non applicable)")
    return {
        "emplacement": input("  Emplacement (ex: Atelier 3, Zone B) : ").strip() or None,
        "reference": input("  Référence : ").strip() or None,
        "numero_serie": input("  Numéro de série : ").strip() or None,
        "constructeur": input("  Constructeur : ").strip() or None,
        "fournisseur": input("  Fournisseur : ").strip() or None,
        "photo_path": input("  Chemin de la photo (optionnel) : ").strip() or None,
    }


def ajouter_element(cur, site_id, parent_id, niveau):
    type_a_creer = type_pour_niveau(niveau)
    article = "nouvel" if type_a_creer == "equipement" else "nouveau"
    nom = input(f"Nom du {article} {label_type(type_a_creer)} : ").strip()
    if not nom:
        print("Nom vide, annulé.")
        return None

    type_elem = type_pour_niveau(niveau)
    fiche = {}
    if type_elem in ("equipement", "sous_equipement"):
        print(f"\nFiche {label_type(type_elem)} — infos complémentaires :")
        fiche = saisir_fiche_equipement()

    code = generer_code(cur, type_elem)

    try:
        cur.execute("""
            INSERT INTO elements (site_id, parent_id, nom, type, code, emplacement, reference,
                                   numero_serie, constructeur, fournisseur, photo_path)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            site_id, parent_id, nom, type_elem, code,
            fiche.get("emplacement"), fiche.get("reference"), fiche.get("numero_serie"),
            fiche.get("constructeur"), fiche.get("fournisseur"), fiche.get("photo_path"),
        ))
        cur.connection.commit()
        print(f"✓ '{nom}' ajouté ({label_type(type_elem)}) — code {code}.")
        return cur.lastrowid
    except sqlite3.IntegrityError:
        print(f"Un élément nommé '{nom}' existe déjà à cet endroit.")
        return None


def naviguer(cur, site_id, site_nom):
    parent_id = None
    niveau = 0
    chemin = [site_nom]

    while True:
        cur.execute(
            "SELECT id, nom, type, code FROM elements WHERE site_id=? AND parent_id IS ? ORDER BY nom",
            (site_id, parent_id)
        )
        enfants = cur.fetchall()

        print("\n" + " > ".join(chemin))
        print("-" * 40)
        if enfants:
            for i, (eid, nom, typ, code) in enumerate(enfants, start=1):
                suffixe = f"  ({code})" if code else ""
                print(f"  {i}. {nom}  [{label_type(typ)}]{suffixe}")
        else:
            print("  (rien ici pour le moment)")

        print(f"  a. Ajouter un {label_type(type_pour_niveau(niveau))} ici")
        print("  r. Remonter")
        print("  q. Quitter")

        choix = input("Votre choix : ").strip().lower()

        if choix == "q":
            break
        elif choix == "r":
            if len(chemin) <= 1:
                print("Vous êtes déjà à la racine du site.")
                continue
            # Remonter d'un niveau : retrouver le parent du parent actuel
            cur.execute("SELECT parent_id FROM elements WHERE id=?", (parent_id,))
            row = cur.fetchone()
            grandparent_id = row[0] if row else None
            parent_id = grandparent_id
            niveau -= 1
            chemin.pop()
        elif choix == "a":
            ajouter_element(cur, site_id, parent_id, niveau)
        elif choix.isdigit() and 1 <= int(choix) <= len(enfants):
            eid, nom, typ, code = enfants[int(choix) - 1]
            parent_id = eid
            niveau += 1
            chemin.append(nom)
        else:
            print("Choix non reconnu.")


def main():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    cur.execute("SELECT id, nom FROM sites ORDER BY nom")
    sites = cur.fetchall()
    if not sites:
        print("Aucun site trouvé. Lancez d'abord scripts/create_db.py puis scripts/seed_structure.py.")
        return

    site = choisir_dans_liste(cur, "Choisissez un site :", sites, lambda s: s[1])
    if not site:
        print("Annulé.")
        return

    naviguer(cur, site[0], site[1])
    conn.close()
    print("\nTerminé.")


if __name__ == "__main__":
    main()
