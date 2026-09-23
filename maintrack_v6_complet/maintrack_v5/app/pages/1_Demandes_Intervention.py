import datetime
import streamlit as st
from db import (
    get_conn, get_sites, get_children, get_element, get_chemin,
    generer_prochain_code, LABELS_TYPE, get_di, get_di_by_id,
    modifier_di, supprimer_di,
)

st.set_page_config(page_title="Demandes d'intervention — MaintTrack", page_icon="📋", layout="centered")
st.title("📋 Demandes d'intervention (DI)")

utilisateur = st.session_state.get("utilisateur", "")
if not utilisateur:
    st.warning("Retournez à la page d'accueil et connectez-vous avant de créer une DI.")
    st.page_link("Home.py", label="⬅️ Retour à l'accueil")
    st.stop()

conn = get_conn()

onglet_creer, onglet_gerer = st.tabs(["➕ Nouvelle DI", "📋 Gérer les DI existantes"])

# ==================================================================
# ONGLET 1 : créer une DI
# ==================================================================
with onglet_creer:
    st.subheader("1. Équipement concerné")

    sites = get_sites(conn)
    if not sites:
        st.error("Aucun site en base. Lancez scripts/create_db.py puis scripts/seed_structure.py.")
        st.stop()

    site_choisi = st.selectbox("Site", sites, format_func=lambda s: s[1], key="di_site")
    site_id = site_choisi[0]

    def choisir_equipement(conn, site_id):
        parent_id = None
        depth = 0
        selection = None

        while True:
            enfants = get_children(conn, site_id, parent_id)
            if not enfants:
                break

            options = {}
            for eid, nom, typ, code in enfants:
                etiquette = f"{nom}  ·  {LABELS_TYPE.get(typ, typ)}"
                if code:
                    etiquette += f"  ({code})"
                options[etiquette] = (eid, nom, typ)

            label_niveau = f"Niveau {depth + 1}"
            choix = st.selectbox(label_niveau, list(options.keys()), key=f"di_niveau_{site_id}_{depth}")
            eid, nom, typ = options[choix]
            selection = (eid, nom, typ)

            if typ in ("equipement", "sous_equipement"):
                enfants_suivants = get_children(conn, site_id, eid)
                if not enfants_suivants:
                    break
                descendre = st.checkbox(
                    f"'{nom}' contient des sous-équipements — en choisir un plus précis ?",
                    key=f"di_descendre_{site_id}_{eid}",
                )
                if not descendre:
                    break

            parent_id = eid
            depth += 1

        return selection

    selection = choisir_equipement(conn, site_id)

    if selection is None:
        st.info(
            "Aucun équipement trouvé pour ce site. Ajoutez-en depuis la page **Arborescence technique** "
            "avant de créer une DI."
        )
        st.stop()

    equipement_id, equipement_nom, equipement_type = selection

    if equipement_type not in ("equipement", "sous_equipement"):
        st.warning("Continuez à descendre dans l'arbre jusqu'à un équipement (pas juste un système).")
        st.stop()

    fiche = get_element(conn, equipement_id)
    _, _, _, _, _, code_equipement, emplacement, *_ = fiche

    chemin = get_chemin(conn, equipement_id)
    st.caption(" > ".join(chemin))

    col1, col2 = st.columns(2)
    col1.text_input("Nom de l'équipement", value=equipement_nom, disabled=True)
    col2.text_input("Code équipement", value=code_equipement or "(non défini)", disabled=True)
    st.text_input("Emplacement", value=emplacement or "(non renseigné)", disabled=True)

    st.subheader("2. Détails de la panne")

    type_panne = st.selectbox(
        "Type de panne",
        ["Électrique", "Mécanique", "Électronique", "Logiciel/Informatique", "Autre"],
    )
    type_panne_libre = ""
    if type_panne == "Autre":
        type_panne_libre = st.text_input("Précisez le type de panne")

    col3, col4 = st.columns(2)
    date_evenement = col3.date_input("Date de l'événement", value=datetime.date.today())
    heure_evenement = col4.time_input("Heure de l'événement", value=datetime.datetime.now().time())

    description = st.text_area("Description de la panne (optionnel)", placeholder="Détails observés...")

    st.subheader("3. Champs automatiques")

    maintenant = datetime.datetime.now()
    prochain_code_di = generer_prochain_code(conn, "demandes_intervention")

    col5, col6 = st.columns(2)
    col5.text_input("Code DI", value=prochain_code_di, disabled=True)
    col6.text_input("Demandeur", value=utilisateur, disabled=True)
    st.text_input("Date/heure de création", value=maintenant.strftime("%d/%m/%Y %H:%M"), disabled=True)

    st.divider()

    if st.button("✅ Créer la DI", type="primary"):
        panne_finale = type_panne_libre.strip() if type_panne == "Autre" and type_panne_libre.strip() else type_panne

        conn.execute(
            """INSERT INTO demandes_intervention
                   (code_di, equipement_id, type_panne, date_evenement, heure_evenement,
                    date_creation, demandeur, etat_di)
               VALUES (?, ?, ?, ?, ?, ?, ?, 'a_transmettre')""",
            (
                prochain_code_di, equipement_id, panne_finale, date_evenement.isoformat(),
                heure_evenement.strftime("%H:%M"), maintenant.isoformat(timespec="seconds"), utilisateur,
            ),
        )
        conn.commit()
        st.success(f"DI **{prochain_code_di}** créée pour l'équipement **{equipement_nom}** (état : à transmettre).")
        st.balloons()

# ==================================================================
# ONGLET 2 : gérer les DI — liste, modifier, supprimer
# ==================================================================
with onglet_gerer:
    toutes_di = get_di(conn)
    if not toutes_di:
        st.info("Aucune DI créée pour le moment.")
    else:
        options_di = {
            f"{code_di}  —  {nom_eq}  [{etat}]  ({type_panne or 'panne non précisée'})": di_id
            for (di_id, code_di, eq_id, nom_eq, type_panne, d_evt, h_evt, dem, etat) in toutes_di
        }
        choix = st.selectbox("DI", list(options_di.keys()), key="gerer_di_select")
        di_id = options_di[choix]

        di_row = get_di_by_id(conn, di_id)
        (_, code_di, equipement_id, nom_equipement, type_panne, date_evenement,
         heure_evenement, demandeur, etat_di, date_creation) = di_row

        st.caption(f"Créée par {demandeur} le {date_creation}")

        with st.form(f"form_edit_di_{di_id}"):
            type_panne_edit = st.selectbox(
                "Type de panne",
                ["Électrique", "Mécanique", "Électronique", "Logiciel/Informatique", "Autre", type_panne],
                index=5 if type_panne not in
                ["Électrique", "Mécanique", "Électronique", "Logiciel/Informatique", "Autre"] else
                ["Électrique", "Mécanique", "Électronique", "Logiciel/Informatique", "Autre"].index(type_panne),
            )
            col_d, col_h = st.columns(2)
            date_evt_edit = col_d.date_input(
                "Date de l'événement",
                value=datetime.date.fromisoformat(date_evenement) if date_evenement else datetime.date.today(),
            )
            heure_evt_edit = col_h.text_input("Heure de l'événement (HH:MM)", value=heure_evenement or "")
            etat_edit = st.selectbox(
                "État", ["a_transmettre", "transmise", "traitee"],
                index=["a_transmettre", "transmise", "traitee"].index(etat_di) if etat_di in
                ["a_transmettre", "transmise", "traitee"] else 0,
            )

            col_save, col_del = st.columns(2)
            enregistrer = col_save.form_submit_button("💾 Enregistrer")
            supprimer = col_del.form_submit_button("🗑️ Supprimer la DI", type="primary")

        if enregistrer:
            modifier_di(conn, di_id, type_panne_edit, date_evt_edit.isoformat(), heure_evt_edit, etat_edit)
            conn.commit()
            st.success(f"DI {code_di} mise à jour.")
            st.rerun()

        if supprimer:
            ok, message = supprimer_di(conn, di_id)
            if ok:
                conn.commit()
                st.success(message)
                st.rerun()
            else:
                st.error(message)

conn.close()
