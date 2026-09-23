import streamlit as st
from db import (
    get_conn, get_equipements_flat, get_element, get_chemin,
    update_fiche_equipement, sauvegarder_photo, chemin_absolu_photo,
    get_pieces, get_outillages, get_consommables,
    get_nomenclature_equipement, set_nomenclature_equipement,
    supprimer_element,
)

st.set_page_config(page_title="Fiche Équipement — MaintTrack", page_icon="🗂️", layout="centered")
st.title("🗂️ Fiche équipement")

utilisateur = st.session_state.get("utilisateur", "")
if not utilisateur:
    st.warning("Retournez à la page d'accueil et entrez votre nom.")
    st.page_link("Home.py", label="⬅️ Retour à l'accueil")
    st.stop()

conn = get_conn()

equipements = get_equipements_flat(conn)
if not equipements:
    st.info("Aucun équipement dans l'arbre pour le moment.")
    st.page_link("pages/6_Arborescence.py", label="🌳 Ajouter un équipement dans l'Arborescence technique")
    st.stop()

st.page_link("pages/6_Arborescence.py", label="🌳 Ajouter un nouvel équipement (page Arborescence technique)")

st.subheader("1. Choisir l'équipement")
options = {
    f"{nom}  ({code or 'sans code'})  ·  {site_nom}  —  {chemin_txt}": eid
    for eid, nom, code, site_nom, chemin_txt in equipements
}
choix = st.selectbox("Équipement / sous-équipement", list(options.keys()), key="fiche_eq_select")
equipement_id = options[choix]

fiche = get_element(conn, equipement_id)
(_, site_id, parent_id, nom, type_el, code, emplacement,
 reference, numero_serie, constructeur, fournisseur, photo_path) = fiche

chemin = get_chemin(conn, equipement_id)
st.caption(" > ".join(chemin))

st.divider()
st.subheader("2. Identification")

col1, col2 = st.columns(2)
col1.text_input("Nom de l'équipement", value=nom, disabled=True)
col2.text_input("Code équipement", value=code or "(non défini)", disabled=True)

with st.form("form_fiche_equipement"):
    emplacement_in = st.text_input("Emplacement", value=emplacement or "")
    col3, col4 = st.columns(2)
    reference_in = col3.text_input("Référence", value=reference or "")
    numero_serie_in = col4.text_input("Numéro de série", value=numero_serie or "")
    col5, col6 = st.columns(2)
    constructeur_in = col5.text_input("Constructeur", value=constructeur or "")
    fournisseur_in = col6.text_input("Fournisseur", value=fournisseur or "")

    if photo_path:
        st.image(chemin_absolu_photo(photo_path), caption="Photo actuelle", width=280)
    nouvelle_photo = st.file_uploader(
        "Photo de l'équipement (remplace la photo actuelle si vous en déposez une)",
        type=["png", "jpg", "jpeg"],
    )

    enregistrer = st.form_submit_button("💾 Enregistrer la fiche", type="primary")

if enregistrer:
    chemin_photo = None
    if nouvelle_photo is not None:
        chemin_photo = sauvegarder_photo("equipements", code or f"eq_{equipement_id}", nouvelle_photo)
    update_fiche_equipement(
        conn, equipement_id, emplacement_in.strip() or None, reference_in.strip() or None,
        numero_serie_in.strip() or None, constructeur_in.strip() or None,
        fournisseur_in.strip() or None, photo_path=chemin_photo,
    )
    conn.commit()
    st.success("Fiche équipement enregistrée.")
    st.rerun()

st.divider()
st.subheader("3. Nomenclature — pièces, outillages, consommables")
st.caption("Ce qui est associé à cet équipement s'affichera automatiquement pour préparer une intervention.")

pieces_dispo = get_pieces(conn)
outillages_dispo = get_outillages(conn)
consommables_dispo = get_consommables(conn)
pieces_liees, outillages_lies, consommables_lies = get_nomenclature_equipement(conn, equipement_id)

if not pieces_dispo and not outillages_dispo and not consommables_dispo:
    st.info("Aucune pièce/outillage/consommable en base pour le moment — ajoutez-en depuis la page Stock.")
else:
    with st.form("form_nomenclature"):
        pieces_choisies = st.multiselect(
            "Pièces de rechange",
            options=[p[0] for p in pieces_dispo],
            default=[p[0] for p in pieces_liees],
            format_func=lambda pid: next(f"{p[1]} — {p[2]}" for p in pieces_dispo if p[0] == pid),
        )
        outillages_choisis = st.multiselect(
            "Outillages nécessaires",
            options=[o[0] for o in outillages_dispo],
            default=[o[0] for o in outillages_lies],
            format_func=lambda oid: next(f"{o[1]} — {o[2]}" for o in outillages_dispo if o[0] == oid),
        )
        consommables_choisis = st.multiselect(
            "Consommables nécessaires",
            options=[c[0] for c in consommables_dispo],
            default=[c[0] for c in consommables_lies],
            format_func=lambda cid: next(f"{c[1]} — {c[2]}" for c in consommables_dispo if c[0] == cid),
        )
        if st.form_submit_button("💾 Enregistrer la nomenclature", type="primary"):
            set_nomenclature_equipement(conn, equipement_id, pieces_choisies, outillages_choisis, consommables_choisis)
            conn.commit()
            st.success("Nomenclature mise à jour.")
            st.rerun()

st.divider()
with st.expander("🗑️ Supprimer cet équipement"):
    st.caption(
        "Impossible si cet équipement a des sous-équipements, ou s'il est référencé par "
        "des DI, BT ou contrôles réglementaires existants."
    )
    if st.button("🗑️ Confirmer la suppression", key=f"suppr_eq_{equipement_id}", type="primary"):
        ok, message = supprimer_element(conn, equipement_id)
        if ok:
            conn.commit()
            st.success(message)
            st.rerun()
        else:
            st.error(message)

conn.close()
