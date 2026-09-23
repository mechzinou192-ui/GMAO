"""
Fonctions partagées entre les pages de l'application Streamlit :
connexion à la base, navigation dans l'arbre technique, génération des codes
de documents (DI-0001, BT-0001, ...).
"""
import sqlite3
import os
import re
import unicodedata
import datetime
import hashlib

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "maintrack.db")
PHOTOS_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "photos")

LABELS_TYPE = {
    "systeme": "Système",
    "sous_systeme": "Sous-système",
    "sous_sous_systeme": "Sous-sous-système",
    "equipement": "Équipement",
    "sous_equipement": "Sous-équipement",
}

PREFIXES_DOCUMENT = {
    "demandes_intervention": ("code_di", "DI"),
    "bons_travail": ("code_bt", "BT"),
    "demandes_sortie": ("code_ds", "DS"),
    "bons_sortie": ("code_bs", "BS"),
    "bons_retour": ("code_br", "BR"),
}


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def get_sites(conn):
    return conn.execute("SELECT id, nom FROM sites ORDER BY nom").fetchall()


def obtenir_code_site(conn, site_id):
    """Renvoie le segment de code du site (ex 'ALG' pour Alger), utilisé comme
    préfixe de tous les codes de son arborescence. S'il n'existe pas encore
    (site créé avant cette fonctionnalité), il est généré et enregistré."""
    row = conn.execute("SELECT code, nom FROM sites WHERE id=?", (site_id,)).fetchone()
    if not row:
        return None
    code, nom = row
    if code:
        return code

    autres = {
        c for (c,) in conn.execute(
            "SELECT code FROM sites WHERE id != ? AND code IS NOT NULL", (site_id,)
        ).fetchall()
    }
    segment = suggerer_segment(nom)
    candidat = segment
    n = 1
    while candidat in autres:
        n += 1
        candidat = f"{segment}{n}"
    conn.execute("UPDATE sites SET code=? WHERE id=?", (candidat, site_id))
    return candidat


def modifier_code_site(conn, site_id, nouveau_code):
    """Change le code d'un site et répercute le changement en préfixe de tous
    les codes des éléments de ce site (ex 'ALG.CFO...' -> 'ALGER.CFO...')."""
    ancien_code = obtenir_code_site(conn, site_id)
    nouveau_code = nouveau_code.strip().upper()
    if not nouveau_code or nouveau_code == ancien_code:
        return ancien_code

    conn.execute("UPDATE sites SET code=? WHERE id=?", (nouveau_code, site_id))
    elements = conn.execute(
        "SELECT id, code FROM elements WHERE site_id=? AND code IS NOT NULL", (site_id,)
    ).fetchall()
    prefixe_ancien = f"{ancien_code}."
    for elem_id, code in elements:
        if code == ancien_code:
            conn.execute("UPDATE elements SET code=? WHERE id=?", (nouveau_code, elem_id))
        elif code.startswith(prefixe_ancien):
            conn.execute(
                "UPDATE elements SET code=? WHERE id=?",
                (nouveau_code + code[len(ancien_code):], elem_id),
            )
    return nouveau_code


def get_children(conn, site_id, parent_id):
    """Enfants directs d'un élément (ou éléments racine si parent_id est None)."""
    return conn.execute(
        "SELECT id, nom, type, code FROM elements WHERE site_id=? AND parent_id IS ? ORDER BY nom",
        (site_id, parent_id),
    ).fetchall()


def get_element(conn, element_id):
    return conn.execute(
        "SELECT id, site_id, parent_id, nom, type, code, emplacement, reference, "
        "numero_serie, constructeur, fournisseur, photo_path FROM elements WHERE id=?",
        (element_id,),
    ).fetchone()


def get_chemin(conn, element_id):
    """Retourne la liste des noms depuis la racine jusqu'à cet élément (fil d'Ariane)."""
    chemin = []
    current_id = element_id
    while current_id is not None:
        row = conn.execute("SELECT nom, parent_id FROM elements WHERE id=?", (current_id,)).fetchone()
        if not row:
            break
        chemin.insert(0, row[0])
        current_id = row[1]
    return chemin


def generer_prochain_code(conn, table):
    """Génère le prochain code de document (DI-0001, BT-0001, ...) pour une table donnée."""
    colonne, prefixe = PREFIXES_DOCUMENT[table]
    row = conn.execute(
        f"SELECT {colonne} FROM {table} WHERE {colonne} LIKE ? ORDER BY {colonne} DESC LIMIT 1",
        (f"{prefixe}-%",),
    ).fetchone()
    dernier_numero = int(row[0].split("-")[1]) if row else 0
    return f"{prefixe}-{dernier_numero + 1:04d}"


def generer_code_ressource(conn, table, prefixe):
    """Génère le prochain code pour pieces/outillages/consommables (ex: PC-000001)."""
    row = conn.execute(
        f"SELECT code FROM {table} WHERE code LIKE ? ORDER BY code DESC LIMIT 1",
        (f"{prefixe}-%",),
    ).fetchone()
    dernier_numero = int(row[0].split("-")[1]) if row else 0
    return f"{prefixe}-{dernier_numero + 1:06d}"


# ------------------------------------------------------------------
# DI (demandes d'intervention)
# ------------------------------------------------------------------

def get_di(conn, etat=None):
    if etat:
        return conn.execute(
            """SELECT di.id, di.code_di, di.equipement_id, e.nom, di.type_panne,
                      di.date_evenement, di.heure_evenement, di.demandeur, di.etat_di
               FROM demandes_intervention di JOIN elements e ON e.id = di.equipement_id
               WHERE di.etat_di = ? ORDER BY di.date_creation DESC""",
            (etat,),
        ).fetchall()
    return conn.execute(
        """SELECT di.id, di.code_di, di.equipement_id, e.nom, di.type_panne,
                  di.date_evenement, di.heure_evenement, di.demandeur, di.etat_di
           FROM demandes_intervention di JOIN elements e ON e.id = di.equipement_id
           ORDER BY di.date_creation DESC"""
    ).fetchall()


def marquer_di_transmise(conn, di_id):
    conn.execute("UPDATE demandes_intervention SET etat_di='transmise' WHERE id=?", (di_id,))


def marquer_di_traitee(conn, di_id):
    conn.execute("UPDATE demandes_intervention SET etat_di='traitee' WHERE id=?", (di_id,))


# ------------------------------------------------------------------
# BT (bons de travail)
# ------------------------------------------------------------------

def get_bt(conn, etat=None):
    base = """SELECT bt.id, bt.code_bt, bt.di_id, di.code_di, bt.equipement_id, e.nom,
                     bt.duree_intervention_h, bt.temps_logistique_h, bt.numero_permis_travail,
                     bt.etat_bt, bt.date_creation, bt.date_cloture,
                     bt.photo_avant_path, bt.photo_apres_path
              FROM bons_travail bt
              JOIN demandes_intervention di ON di.id = bt.di_id
              JOIN elements e ON e.id = bt.equipement_id"""
    if etat:
        return conn.execute(base + " WHERE bt.etat_bt=? ORDER BY bt.date_creation DESC", (etat,)).fetchall()
    return conn.execute(base + " ORDER BY bt.date_creation DESC").fetchall()


def get_bt_ouverts(conn):
    """BT pas encore clos, utilisables pour créer une DS."""
    return conn.execute(
        """SELECT bt.id, bt.code_bt, bt.equipement_id, e.nom, bt.etat_bt
           FROM bons_travail bt JOIN elements e ON e.id = bt.equipement_id
           WHERE bt.etat_bt != 'clos' ORDER BY bt.date_creation DESC"""
    ).fetchall()


def get_bt_techniciens(conn, bt_id):
    return [r[0] for r in conn.execute(
        "SELECT technicien_nom FROM bt_techniciens WHERE bt_id=?", (bt_id,)
    ).fetchall()]


def get_bt_ressources(conn, bt_id):
    pieces = conn.execute(
        """SELECT p.code, p.nom, bp.quantite FROM bt_pieces bp
           JOIN pieces p ON p.id = bp.piece_id WHERE bp.bt_id=?""", (bt_id,)
    ).fetchall()
    outillages = conn.execute(
        """SELECT o.code, o.nom FROM bt_outillages bo
           JOIN outillages o ON o.id = bo.outillage_id WHERE bo.bt_id=?""", (bt_id,)
    ).fetchall()
    consommables = conn.execute(
        """SELECT c.code, c.nom, bc.quantite FROM bt_consommables bc
           JOIN consommables c ON c.id = bc.consommable_id WHERE bc.bt_id=?""", (bt_id,)
    ).fetchall()
    return pieces, outillages, consommables


# ------------------------------------------------------------------
# Ressources : pièces / outillages / consommables
# ------------------------------------------------------------------

def get_pieces(conn):
    return conn.execute("SELECT id, code, nom FROM pieces ORDER BY nom").fetchall()


def get_outillages(conn):
    return conn.execute("SELECT id, code, nom FROM outillages ORDER BY nom").fetchall()


def get_consommables(conn):
    return conn.execute("SELECT id, code, nom FROM consommables ORDER BY nom").fetchall()


def ajouter_piece(conn, nom, constructeur, fournisseur, reference, numero_serie):
    code = generer_code_ressource(conn, "pieces", "PC")
    conn.execute(
        """INSERT INTO pieces (code, nom, constructeur, fournisseur, reference, numero_serie)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (code, nom, constructeur, fournisseur, reference, numero_serie),
    )
    return code


def ajouter_outillage(conn, nom):
    code = generer_code_ressource(conn, "outillages", "OUT")
    conn.execute("INSERT INTO outillages (code, nom) VALUES (?, ?)", (code, nom))
    return code


def ajouter_consommable(conn, nom):
    code = generer_code_ressource(conn, "consommables", "CONS")
    conn.execute("INSERT INTO consommables (code, nom) VALUES (?, ?)", (code, nom))
    return code


# ------------------------------------------------------------------
# DS (demandes de sortie)
# ------------------------------------------------------------------

def get_ds(conn, etat=None):
    base = """SELECT ds.id, ds.code_ds, ds.bt_id, bt.code_bt, ds.equipement_id, e.nom,
                     ds.etat_ds, ds.cree_par, ds.date_creation
              FROM demandes_sortie ds
              JOIN bons_travail bt ON bt.id = ds.bt_id
              JOIN elements e ON e.id = ds.equipement_id"""
    if etat:
        return conn.execute(base + " WHERE ds.etat_ds=? ORDER BY ds.date_creation DESC", (etat,)).fetchall()
    return conn.execute(base + " ORDER BY ds.date_creation DESC").fetchall()


def get_ds_pieces(conn, ds_id):
    return conn.execute(
        """SELECT p.id, p.code, p.nom, dp.quantite_demandee FROM ds_pieces dp
           JOIN pieces p ON p.id = dp.piece_id WHERE dp.ds_id=?""", (ds_id,)
    ).fetchall()


def marquer_ds_en_cours(conn, ds_id):
    conn.execute("UPDATE demandes_sortie SET etat_ds='en_cours_traitement' WHERE id=?", (ds_id,))


def marquer_ds_traitee(conn, ds_id):
    conn.execute("UPDATE demandes_sortie SET etat_ds='traitee' WHERE id=?", (ds_id,))


# ------------------------------------------------------------------
# BS (bons de sortie)
# ------------------------------------------------------------------

def get_bs(conn, etat=None):
    base = """SELECT bs.id, bs.code_bs, bs.ds_id, ds.code_ds, bs.equipement_id, e.nom,
                     bs.etat_bs, bs.date_creation, bs.date_traitement
              FROM bons_sortie bs
              JOIN demandes_sortie ds ON ds.id = bs.ds_id
              JOIN elements e ON e.id = bs.equipement_id"""
    if etat:
        return conn.execute(base + " WHERE bs.etat_bs=? ORDER BY bs.date_creation DESC", (etat,)).fetchall()
    return conn.execute(base + " ORDER BY bs.date_creation DESC").fetchall()


def get_bs_pieces(conn, bs_id):
    return conn.execute(
        """SELECT p.id, p.code, p.nom, bp.quantite_sortie FROM bs_pieces bp
           JOIN pieces p ON p.id = bp.piece_id WHERE bp.bs_id=?""", (bs_id,)
    ).fetchall()


# ------------------------------------------------------------------
# BR (bons de retour) — une pièce OU un équipement complet rentré au magasin
# ------------------------------------------------------------------

def get_br(conn):
    return conn.execute(
        """SELECT br.id, br.code_br, br.bs_id, bs.code_bs,
                  p.code, p.nom, ee.code, ee.nom, br.quantite, br.date_retour
           FROM bons_retour br
           JOIN bons_sortie bs ON bs.id = br.bs_id
           LEFT JOIN pieces p ON p.id = br.piece_id
           LEFT JOIN elements ee ON ee.id = br.equipement_id
           ORDER BY br.date_retour DESC"""
    ).fetchall()


def creer_bon_retour(conn, code_br, bs_id, piece_id, equipement_id, quantite, date_retour):
    conn.execute(
        """INSERT INTO bons_retour (code_br, bs_id, piece_id, equipement_id, quantite, date_retour)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (code_br, bs_id, piece_id, equipement_id, quantite, date_retour),
    )


# ------------------------------------------------------------------
# Fiche équipement : arbre complet, édition, nomenclature, photo
# ------------------------------------------------------------------

def get_equipements_flat(conn):
    """Tous les équipements/sous-équipements de tous les sites, avec leur chemin complet
    (pour un selectbox de recherche direct, sans re-descendre l'arbre niveau par niveau)."""
    rows = conn.execute(
        """SELECT e.id, e.nom, e.code, s.nom FROM elements e
           JOIN sites s ON s.id = e.site_id
           WHERE e.type IN ('equipement', 'sous_equipement')
           ORDER BY s.nom, e.nom"""
    ).fetchall()
    resultat = []
    for eid, nom, code, site_nom in rows:
        chemin = get_chemin(conn, eid)
        resultat.append((eid, nom, code, site_nom, " > ".join(chemin)))
    return resultat


def update_fiche_equipement(conn, element_id, emplacement, reference, numero_serie,
                             constructeur, fournisseur, photo_path=None):
    if photo_path is not None:
        conn.execute(
            """UPDATE elements SET emplacement=?, reference=?, numero_serie=?,
                      constructeur=?, fournisseur=?, photo_path=? WHERE id=?""",
            (emplacement, reference, numero_serie, constructeur, fournisseur, photo_path, element_id),
        )
    else:
        conn.execute(
            """UPDATE elements SET emplacement=?, reference=?, numero_serie=?,
                      constructeur=?, fournisseur=? WHERE id=?""",
            (emplacement, reference, numero_serie, constructeur, fournisseur, element_id),
        )


def get_nomenclature_equipement(conn, element_id):
    pieces = conn.execute(
        """SELECT p.id, p.code, p.nom FROM equipement_pieces ep
           JOIN pieces p ON p.id = ep.piece_id WHERE ep.equipement_id=? ORDER BY p.nom""",
        (element_id,),
    ).fetchall()
    outillages = conn.execute(
        """SELECT o.id, o.code, o.nom FROM equipement_outillages eo
           JOIN outillages o ON o.id = eo.outillage_id WHERE eo.equipement_id=? ORDER BY o.nom""",
        (element_id,),
    ).fetchall()
    consommables = conn.execute(
        """SELECT c.id, c.code, c.nom FROM equipement_consommables ec
           JOIN consommables c ON c.id = ec.consommable_id WHERE ec.equipement_id=? ORDER BY c.nom""",
        (element_id,),
    ).fetchall()
    return pieces, outillages, consommables


def set_nomenclature_equipement(conn, element_id, piece_ids, outillage_ids, consommable_ids):
    conn.execute("DELETE FROM equipement_pieces WHERE equipement_id=?", (element_id,))
    for pid in piece_ids:
        conn.execute("INSERT INTO equipement_pieces (equipement_id, piece_id) VALUES (?, ?)", (element_id, pid))
    conn.execute("DELETE FROM equipement_outillages WHERE equipement_id=?", (element_id,))
    for oid in outillage_ids:
        conn.execute("INSERT INTO equipement_outillages (equipement_id, outillage_id) VALUES (?, ?)", (element_id, oid))
    conn.execute("DELETE FROM equipement_consommables WHERE equipement_id=?", (element_id,))
    for cid in consommable_ids:
        conn.execute("INSERT INTO equipement_consommables (equipement_id, consommable_id) VALUES (?, ?)", (element_id, cid))


def sauvegarder_photo(sous_dossier, nom_fichier, fichier_upload):
    """Sauvegarde un fichier uploadé (st.file_uploader) sur disque et retourne son chemin relatif."""
    dossier = os.path.join(PHOTOS_DIR, sous_dossier)
    os.makedirs(dossier, exist_ok=True)
    extension = os.path.splitext(fichier_upload.name)[1].lower() or ".jpg"
    chemin_absolu = os.path.join(dossier, f"{nom_fichier}{extension}")
    with open(chemin_absolu, "wb") as f:
        f.write(fichier_upload.getbuffer())
    return os.path.join("data", "photos", sous_dossier, f"{nom_fichier}{extension}")


def chemin_absolu_photo(chemin_relatif):
    """chemin_relatif est stocké en base sous la forme 'data/photos/...' (relatif à la racine
    du projet, c-à-d le dossier au-dessus de app/). On le convertit en chemin absolu utilisable
    par st.image()."""
    if not chemin_relatif:
        return None
    return os.path.normpath(os.path.join(os.path.dirname(__file__), "..", chemin_relatif))


# ------------------------------------------------------------------
# Fiche pièce
# ------------------------------------------------------------------

def get_piece(conn, piece_id):
    return conn.execute(
        "SELECT id, code, nom, constructeur, fournisseur, reference, numero_serie FROM pieces WHERE id=?",
        (piece_id,),
    ).fetchone()


def update_piece(conn, piece_id, nom, constructeur, fournisseur, reference, numero_serie):
    conn.execute(
        """UPDATE pieces SET nom=?, constructeur=?, fournisseur=?, reference=?, numero_serie=? WHERE id=?""",
        (nom, constructeur, fournisseur, reference, numero_serie, piece_id),
    )


# ------------------------------------------------------------------
# BT — sauvegarde effective des photos avant/après
# ------------------------------------------------------------------

def enregistrer_photos_bt(conn, bt_id, photo_avant_path=None, photo_apres_path=None):
    if photo_avant_path is not None:
        conn.execute("UPDATE bons_travail SET photo_avant_path=? WHERE id=?", (photo_avant_path, bt_id))
    if photo_apres_path is not None:
        conn.execute("UPDATE bons_travail SET photo_apres_path=? WHERE id=?", (photo_apres_path, bt_id))


# ------------------------------------------------------------------
# Contrôles réglementaires / de mesure — génération automatique de DI préventives
# ------------------------------------------------------------------

def get_controles(conn):
    return conn.execute(
        """SELECT cp.id, cp.equipement_id, e.nom, e.code, cp.type, cp.nom_controle,
                  cp.frequence_jours, cp.derniere_date, cp.prochaine_date
           FROM controles_periodiques cp JOIN elements e ON e.id = cp.equipement_id
           ORDER BY cp.prochaine_date"""
    ).fetchall()


def ajouter_controle(conn, equipement_id, type_controle, nom_controle, frequence_jours, derniere_date):
    if derniere_date:
        prochaine = derniere_date + datetime.timedelta(days=frequence_jours)
    else:
        prochaine = datetime.date.today()
    conn.execute(
        """INSERT INTO controles_periodiques
               (equipement_id, type, nom_controle, frequence_jours, derniere_date, prochaine_date)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (equipement_id, type_controle, nom_controle, frequence_jours,
         derniere_date.isoformat() if derniere_date else None, prochaine.isoformat()),
    )


def supprimer_controle(conn, controle_id):
    conn.execute("DELETE FROM controles_periodiques WHERE id=?", (controle_id,))


def generer_di_preventives_dues(conn, utilisateur_systeme="Contrôle automatique"):
    """Parcourt les contrôles dont l'échéance est atteinte ou dépassée, crée une DI préventive
    pour chacun (état 'a_transmettre', comme une DI normale) et reporte leur prochaine échéance.
    Retourne la liste des codes DI créés. Appelée au chargement des pages concernées."""
    aujourdhui = datetime.date.today()
    dus = conn.execute(
        """SELECT id, equipement_id, type, nom_controle, frequence_jours
           FROM controles_periodiques
           WHERE prochaine_date IS NOT NULL AND prochaine_date <= ?""",
        (aujourdhui.isoformat(),),
    ).fetchall()

    codes_crees = []
    for controle_id, equipement_id, type_controle, nom_controle, frequence_jours in dus:
        maintenant = datetime.datetime.now()
        code_di = generer_prochain_code(conn, "demandes_intervention")
        nature = "réglementaire" if type_controle == "reglementaire" else "de mesure"
        libelle = f"Contrôle {nature} préventif — {nom_controle}"
        conn.execute(
            """INSERT INTO demandes_intervention
                   (code_di, equipement_id, type_panne, date_evenement, heure_evenement,
                    date_creation, demandeur, etat_di)
               VALUES (?, ?, ?, ?, ?, ?, ?, 'a_transmettre')""",
            (code_di, equipement_id, libelle, aujourdhui.isoformat(), maintenant.strftime("%H:%M"),
             maintenant.isoformat(timespec="seconds"), utilisateur_systeme),
        )
        nouvelle_prochaine = aujourdhui + datetime.timedelta(days=frequence_jours)
        conn.execute(
            "UPDATE controles_periodiques SET derniere_date=?, prochaine_date=? WHERE id=?",
            (aujourdhui.isoformat(), nouvelle_prochaine.isoformat(), controle_id),
        )
        codes_crees.append(code_di)

    if codes_crees:
        conn.commit()
    return codes_crees


# ------------------------------------------------------------------
# Comptes utilisateurs (authentification simple par identifiant/mot de passe)
# ------------------------------------------------------------------

ROLES_DISPONIBLES = ["admin", "responsable_maintenance", "technicien", "magasinier"]


def hash_mot_de_passe(mot_de_passe):
    return hashlib.sha256(mot_de_passe.encode("utf-8")).hexdigest()


def compter_comptes(conn):
    return conn.execute("SELECT COUNT(*) FROM utilisateurs").fetchone()[0]


def get_comptes(conn):
    return conn.execute(
        """SELECT id, nom_complet, identifiant, role, actif, date_creation
           FROM utilisateurs ORDER BY nom_complet"""
    ).fetchall()


def get_compte(conn, compte_id):
    return conn.execute(
        "SELECT id, nom_complet, identifiant, role, actif FROM utilisateurs WHERE id=?",
        (compte_id,),
    ).fetchone()


def verifier_login(conn, identifiant, mot_de_passe):
    """Retourne (id, nom_complet, role) si identifiant/mot de passe valides et compte actif, sinon None."""
    row = conn.execute(
        "SELECT id, nom_complet, role, actif, mot_de_passe_hash FROM utilisateurs WHERE identifiant=?",
        (identifiant.strip(),),
    ).fetchone()
    if not row:
        return None
    uid, nom_complet, role, actif, hash_stocke = row
    if not actif or hash_mot_de_passe(mot_de_passe) != hash_stocke:
        return None
    return (uid, nom_complet, role)


def creer_compte(conn, nom_complet, identifiant, mot_de_passe, role):
    conn.execute(
        """INSERT INTO utilisateurs (nom_complet, identifiant, mot_de_passe_hash, role, actif, date_creation)
           VALUES (?, ?, ?, ?, 1, ?)""",
        (
            nom_complet.strip(), identifiant.strip(), hash_mot_de_passe(mot_de_passe), role,
            datetime.datetime.now().isoformat(timespec="seconds"),
        ),
    )


def modifier_compte(conn, compte_id, nom_complet, role, actif, nouveau_mot_de_passe=None):
    if nouveau_mot_de_passe:
        conn.execute(
            "UPDATE utilisateurs SET nom_complet=?, role=?, actif=?, mot_de_passe_hash=? WHERE id=?",
            (nom_complet.strip(), role, int(actif), hash_mot_de_passe(nouveau_mot_de_passe), compte_id),
        )
    else:
        conn.execute(
            "UPDATE utilisateurs SET nom_complet=?, role=?, actif=? WHERE id=?",
            (nom_complet.strip(), role, int(actif), compte_id),
        )


def supprimer_compte(conn, compte_id):
    conn.execute("DELETE FROM utilisateurs WHERE id=?", (compte_id,))


# ------------------------------------------------------------------
# Arborescence technique — gestion complète depuis le web (ajouter / modifier / supprimer)
# ------------------------------------------------------------------

TYPES_PAR_NIVEAU = {0: "systeme", 1: "sous_systeme", 2: "sous_sous_systeme", 3: "equipement"}


def type_pour_niveau(niveau):
    return TYPES_PAR_NIVEAU.get(niveau, "sous_equipement")


# ------------------------------------------------------------------
# Codes hiérarchiques (ex : CFO.AG1.RBT.ACC, ...MALT.01)
# Chaque élément reçoit un "segment" (2 à 4 lettres, + un numéro s'il y en
# a un dans le nom, ex "Agitateur 1" -> AG1). Le code complet est le code
# du parent + "." + son propre segment. Si le nom ne fournit aucune
# distinction (deux éléments avec le même segment), on ajoute un numéro
# chronologique (01, 02, ...).
# ------------------------------------------------------------------

def _sans_accents(texte):
    nfkd = unicodedata.normalize("NFKD", texte)
    return "".join(c for c in nfkd if not unicodedata.combining(c))


def suggerer_segment(nom):
    """Propose un segment de code à partir du nom (ex: 'Robinet vanne' -> 'RBT',
    'Agitateur 1' -> 'AG1'). Si le nom commence déjà par un code
    (ex: 'CFO — Courant fort'), ce code est repris tel quel."""
    nom_original = (nom or "").strip()
    if not nom_original:
        return "ELT"

    premier_mot = re.split(r"[\s\-–—]+", nom_original)[0]
    if re.fullmatch(r"[A-Z0-9]{2,6}", premier_mot):
        return premier_mot

    nom = _sans_accents(nom_original).upper()
    match_nombre = re.search(r"(\d+)\s*$", nom)
    numero = match_nombre.group(1) if match_nombre else ""
    base = nom[: match_nombre.start()] if match_nombre else nom

    mots = [m for m in re.split(r"[^A-Z]+", base) if m]
    if not mots:
        lettres = ""
    elif len(mots) >= 2:
        # Plusieurs mots -> initiales (ex "Coffret Fibre Optique" -> "CFO")
        lettres = "".join(m[0] for m in mots[:4])
    else:
        mot = mots[0]
        # Un seul mot -> 1ère lettre + consonnes suivantes (ex "Robinet" -> "RBT")
        lettres = mot[0]
        for c in mot[1:]:
            if len(lettres) >= 3:
                break
            if c not in "AEIOUY":
                lettres += c
        if len(lettres) < 3:
            lettres = mot[: max(3, len(lettres))]

    lettres = lettres[:4] or "ELT"
    return f"{lettres}{numero}"


def _segments_freres(conn, site_id, parent_id, code_parent):
    """Segments (partie du code après celui du parent) déjà pris par les
    frères/soeurs (même parent) d'un futur élément. Un segment peut lui-même
    contenir un point (ex 'MALT.01'), donc on retire le préfixe du parent
    plutôt que de couper au dernier point."""
    lignes = conn.execute(
        "SELECT code FROM elements WHERE site_id=? AND parent_id IS ?",
        (site_id, parent_id),
    ).fetchall()
    prefixe = f"{code_parent}." if code_parent else ""
    segments = []
    for (c,) in lignes:
        if not c:
            continue
        if prefixe:
            if c.startswith(prefixe):
                segments.append(c[len(prefixe):])
        else:
            segments.append(c)
    return segments


def rendre_segment_unique(conn, site_id, parent_id, code_parent, segment):
    """Si le segment proposé existe déjà chez les frères/soeurs, ajoute un
    numéro chronologique à 2 chiffres (ex 'MALT' -> 'MALT.01', 'MALT.02')."""
    pris = set(_segments_freres(conn, site_id, parent_id, code_parent))
    if segment not in pris:
        return segment
    n = 1
    while f"{segment}.{n:02d}" in pris:
        n += 1
    return f"{segment}.{n:02d}"


def generer_code_element(conn, site_id, parent_id, nom, segment_manuel=None):
    """Construit le code hiérarchique complet d'un nouvel élément :
    code_du_parent + '.' + son_segment (ou juste son segment s'il est à la racine)."""
    if parent_id is not None:
        row = conn.execute("SELECT code FROM elements WHERE id=?", (parent_id,)).fetchone()
        code_parent = row[0] if row else None
    else:
        code_parent = obtenir_code_site(conn, site_id)

    segment = (segment_manuel or "").strip().upper() or suggerer_segment(nom)
    segment = rendre_segment_unique(conn, site_id, parent_id, code_parent, segment)

    return f"{code_parent}.{segment}" if code_parent else segment


def ajouter_element(conn, site_id, parent_id, niveau, nom, fiche=None, segment_code=None):
    """Ajoute un élément de l'arbre. fiche = dict optionnel avec emplacement/reference/
    numero_serie/constructeur/fournisseur (utile pour équipement/sous-équipement).
    segment_code = segment de code optionnel saisi par l'utilisateur (ex 'CFO'); si
    absent, un segment est proposé automatiquement à partir du nom."""
    type_elem = type_pour_niveau(niveau)
    fiche = fiche or {}
    code = generer_code_element(conn, site_id, parent_id, nom, segment_code)
    conn.execute(
        """INSERT INTO elements (site_id, parent_id, nom, type, code, emplacement, reference,
                                  numero_serie, constructeur, fournisseur, photo_path)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            site_id, parent_id, nom.strip(), type_elem, code,
            fiche.get("emplacement") or None, fiche.get("reference") or None,
            fiche.get("numero_serie") or None, fiche.get("constructeur") or None,
            fiche.get("fournisseur") or None, None,
        ),
    )
    return code


def renommer_element(conn, element_id, nouveau_nom):
    conn.execute("UPDATE elements SET nom=? WHERE id=?", (nouveau_nom.strip(), element_id))


def modifier_segment_code(conn, element_id, nouveau_segment):
    """Change le dernier segment du code d'un élément (ex l'utilisateur corrige
    'AG1' -> 'AGT1') et répercute le changement sur tous les descendants,
    dont le code commence par l'ancien code du parent."""
    row = conn.execute("SELECT code, parent_id FROM elements WHERE id=?", (element_id,)).fetchone()
    if not row:
        return None
    ancien_code, parent_id = row
    if not ancien_code:
        return None

    nouveau_segment = nouveau_segment.strip().upper()
    if not nouveau_segment:
        return ancien_code

    prefixe_parent = ancien_code.rsplit(".", 1)[0] if "." in ancien_code else None
    nouveau_code = f"{prefixe_parent}.{nouveau_segment}" if prefixe_parent else nouveau_segment

    if nouveau_code == ancien_code:
        return ancien_code

    # Met à jour l'élément lui-même, puis tous les descendants dont le code
    # commence par "ancien_code." (préfixe hiérarchique).
    conn.execute("UPDATE elements SET code=? WHERE id=?", (nouveau_code, element_id))
    descendants = conn.execute(
        "SELECT id, code FROM elements WHERE code LIKE ?", (f"{ancien_code}.%",)
    ).fetchall()
    for desc_id, desc_code in descendants:
        conn.execute(
            "UPDATE elements SET code=? WHERE id=?",
            (nouveau_code + desc_code[len(ancien_code):], desc_id),
        )
    return nouveau_code


def compter_enfants(conn, element_id):
    return conn.execute("SELECT COUNT(*) FROM elements WHERE parent_id=?", (element_id,)).fetchone()[0]


def compter_references_element(conn, element_id):
    n_di = conn.execute(
        "SELECT COUNT(*) FROM demandes_intervention WHERE equipement_id=?", (element_id,)
    ).fetchone()[0]
    n_bt = conn.execute(
        "SELECT COUNT(*) FROM bons_travail WHERE equipement_id=?", (element_id,)
    ).fetchone()[0]
    n_ctrl = conn.execute(
        "SELECT COUNT(*) FROM controles_periodiques WHERE equipement_id=?", (element_id,)
    ).fetchone()[0]
    return n_di + n_bt + n_ctrl


def supprimer_element(conn, element_id):
    """Supprime un élément de l'arbre. Refuse s'il a des sous-éléments ou s'il est référencé
    par des DI / BT / contrôles existants. Retourne (ok: bool, message: str)."""
    if compter_enfants(conn, element_id) > 0:
        return False, "Impossible : cet élément contient des sous-éléments. Supprimez-les d'abord."
    if compter_references_element(conn, element_id) > 0:
        return False, "Impossible : cet équipement est référencé par des DI, BT ou contrôles existants."
    conn.execute("DELETE FROM equipement_pieces WHERE equipement_id=?", (element_id,))
    conn.execute("DELETE FROM equipement_outillages WHERE equipement_id=?", (element_id,))
    conn.execute("DELETE FROM equipement_consommables WHERE equipement_id=?", (element_id,))
    conn.execute("DELETE FROM elements WHERE id=?", (element_id,))
    return True, "Élément supprimé."


# ------------------------------------------------------------------
# DI — consultation détaillée, modification, suppression
# ------------------------------------------------------------------

def get_di_by_id(conn, di_id):
    return conn.execute(
        """SELECT di.id, di.code_di, di.equipement_id, e.nom, di.type_panne, di.date_evenement,
                  di.heure_evenement, di.demandeur, di.etat_di, di.date_creation
           FROM demandes_intervention di JOIN elements e ON e.id = di.equipement_id WHERE di.id=?""",
        (di_id,),
    ).fetchone()


def modifier_di(conn, di_id, type_panne, date_evenement, heure_evenement, etat_di):
    conn.execute(
        """UPDATE demandes_intervention SET type_panne=?, date_evenement=?, heure_evenement=?, etat_di=?
           WHERE id=?""",
        (type_panne, date_evenement, heure_evenement, etat_di, di_id),
    )


def compter_bt_pour_di(conn, di_id):
    return conn.execute("SELECT COUNT(*) FROM bons_travail WHERE di_id=?", (di_id,)).fetchone()[0]


def supprimer_di(conn, di_id):
    if compter_bt_pour_di(conn, di_id) > 0:
        return False, "Impossible : un bon de travail est déjà lié à cette DI."
    conn.execute("DELETE FROM demandes_intervention WHERE id=?", (di_id,))
    return True, "DI supprimée."


# ------------------------------------------------------------------
# BT — suppression
# ------------------------------------------------------------------

def compter_ds_pour_bt(conn, bt_id):
    return conn.execute("SELECT COUNT(*) FROM demandes_sortie WHERE bt_id=?", (bt_id,)).fetchone()[0]


def supprimer_bt(conn, bt_id, di_id):
    if compter_ds_pour_bt(conn, bt_id) > 0:
        return False, "Impossible : une demande de sortie est déjà liée à ce BT."
    conn.execute("DELETE FROM bt_techniciens WHERE bt_id=?", (bt_id,))
    conn.execute("DELETE FROM bt_pieces WHERE bt_id=?", (bt_id,))
    conn.execute("DELETE FROM bt_outillages WHERE bt_id=?", (bt_id,))
    conn.execute("DELETE FROM bt_consommables WHERE bt_id=?", (bt_id,))
    conn.execute("DELETE FROM bons_travail WHERE id=?", (bt_id,))
    conn.execute("UPDATE demandes_intervention SET etat_di='a_transmettre' WHERE id=?", (di_id,))
    return True, "BT supprimé. La DI liée repasse à l'état 'à transmettre'."
