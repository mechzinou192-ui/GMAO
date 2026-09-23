import streamlit as st
from db import (
    get_conn, get_sites, get_children, get_element, get_chemin,
    LABELS_TYPE, type_pour_niveau, ajouter_element, renommer_element,
    supprimer_element, update_fiche_equipement, compter_enfants,
    suggerer_segment, modifier_segment_code,
    obtenir_code_site, modifier_code_site,
)

st.set_page_config(page_title="Arborescence — MaintTrack", page_icon="🌳", layout="centered")
st.title("🌳 Arborescence technique")
st.caption("Système > sous-système > sous-sous-système > équipement > sous-équipement")

utilisateur = st.session_state.get("utilisateur", "")
if not utilisateur:
    st.warning("Retournez à la page d'accueil et connectez-vous.")
    st.page_link("Home.py", label="⬅️ Retour à l'accueil")
    st.stop()

conn = get_conn()

sites = get_sites(conn)
if not sites:
    st.error("Aucun site en base. Lancez scripts/create_db.py puis scripts/seed_structure.py.")
    st.stop()

site_choisi = st.selectbox("Site", sites, format_func=lambda s: s[1], key="arbre_site")
site_id = site_choisi[0]

code_site_actuel = obtenir_code_site(conn, site_id)
conn.commit()
with st.expander(f"Préfixe de code de ce site : **{code_site_actuel}**  (ex : {code_site_actuel}.CFO.AG1...)"):
    nouveau_code_site = st.text_input("Préfixe", value=code_site_actuel, key=f"site_code_{site_id}")
    if st.button("💾 Enregistrer le préfixe", key=f"site_code_save_{site_id}"):
        if not nouveau_code_site.strip():
            st.error("Le préfixe ne peut pas être vide.")
        else:
            modifier_code_site(conn, site_id, nouveau_code_site)
            conn.commit()
            st.success("Préfixe mis à jour, tous les codes de ce site ont été ajustés.")
            st.rerun()

cle_chemin = f"arbre_chemin_{site_id}"
if cle_chemin not in st.session_state:
    st.session_state[cle_chemin] = []  # liste d'ids depuis la racine

chemin_ids = st.session_state[cle_chemin]
parent_id = chemin_ids[-1] if chemin_ids else None
niveau = len(chemin_ids)

# ------------------------------------------------------------------
# Fil d'Ariane
# ------------------------------------------------------------------
labels_chemin = [site_choisi[1]] + get_chemin(conn, parent_id) if parent_id else [site_choisi[1]]
st.markdown("**" + " > ".join(labels_chemin) + "**")

col_racine, col_remonter = st.columns(2)
if col_racine.button("🏠 Racine du site", disabled=not chemin_ids):
    st.session_state[cle_chemin] = []
    st.rerun()
if col_remonter.button("⬆️ Remonter d'un niveau", disabled=not chemin_ids):
    st.session_state[cle_chemin] = chemin_ids[:-1]
    st.rerun()

st.divider()

# ------------------------------------------------------------------
# Liste des éléments à ce niveau — ouvrir / modifier / supprimer
# ------------------------------------------------------------------
enfants = get_children(conn, site_id, parent_id)

if not enfants:
    st.info("Rien ici pour le moment. Ajoutez un élément ci-dessous.")
else:
    for eid, nom, typ, code in enfants:
        nb_sous_elements = compter_enfants(conn, eid)
        suffixe_code = f"  ({code})" if code else ""
        with st.expander(f"{nom}{suffixe_code}  ·  {LABELS_TYPE.get(typ, typ)}  ·  {nb_sous_elements} sous-élément(s)"):
            col_ouvrir, col_vide = st.columns([1, 3])
            if col_ouvrir.button("📂 Ouvrir", key=f"ouvrir_{eid}"):
                st.session_state[cle_chemin] = chemin_ids + [eid]
                st.rerun()

            st.markdown("**Modifier**")
            with st.form(f"form_modifier_{eid}"):
                nouveau_nom = st.text_input("Nom", value=nom, key=f"nom_edit_{eid}")

                segment_actuel = (code or "").split(".")[-1]
                prefixe_code = code[: -len(segment_actuel) - 1] if code and "." in code else None
                if prefixe_code:
                    st.caption(f"Code : {prefixe_code}." + "**" + segment_actuel + "**")
                nouveau_segment = st.text_input(
                    "Segment de code (dernier morceau, ex: AG1, RBT, MALT.01)",
                    value=segment_actuel, key=f"code_edit_{eid}",
                )

                fiche_vals = {}
                if typ in ("equipement", "sous_equipement"):
                    fiche = get_element(conn, eid)
                    (_, _, _, _, _, _, emplacement, reference, numero_serie,
                     constructeur, fournisseur, _photo) = fiche
                    fiche_vals["emplacement"] = st.text_input("Emplacement", value=emplacement or "", key=f"empl_{eid}")
                    c1, c2 = st.columns(2)
                    fiche_vals["reference"] = c1.text_input("Référence", value=reference or "", key=f"ref_{eid}")
                    fiche_vals["numero_serie"] = c2.text_input("Numéro de série", value=numero_serie or "", key=f"ns_{eid}")
                    c3, c4 = st.columns(2)
                    fiche_vals["constructeur"] = c3.text_input("Constructeur", value=constructeur or "", key=f"cons_{eid}")
                    fiche_vals["fournisseur"] = c4.text_input("Fournisseur", value=fournisseur or "", key=f"four_{eid}")

                col_save, col_del = st.columns(2)
                enregistrer = col_save.form_submit_button("💾 Enregistrer")
                supprimer = col_del.form_submit_button("🗑️ Supprimer", type="primary")

            if enregistrer:
                if not nouveau_nom.strip():
                    st.error("Le nom ne peut pas être vide.")
                elif not nouveau_segment.strip():
                    st.error("Le segment de code ne peut pas être vide.")
                else:
                    renommer_element(conn, eid, nouveau_nom)
                    if nouveau_segment.strip().upper() != segment_actuel:
                        modifier_segment_code(conn, eid, nouveau_segment)
                    if typ in ("equipement", "sous_equipement"):
                        update_fiche_equipement(
                            conn, eid,
                            fiche_vals["emplacement"].strip() or None,
                            fiche_vals["reference"].strip() or None,
                            fiche_vals["numero_serie"].strip() or None,
                            fiche_vals["constructeur"].strip() or None,
                            fiche_vals["fournisseur"].strip() or None,
                        )
                    conn.commit()
                    st.success(f"'{nouveau_nom}' mis à jour.")
                    st.rerun()

            if supprimer:
                ok, message = supprimer_element(conn, eid)
                if ok:
                    conn.commit()
                    st.success(message)
                    st.rerun()
                else:
                    st.error(message)

st.divider()

# ------------------------------------------------------------------
# Ajouter un élément à ce niveau
# ------------------------------------------------------------------
type_a_creer = type_pour_niveau(niveau)
st.subheader(f"➕ Ajouter un {LABELS_TYPE.get(type_a_creer, type_a_creer)} ici")

nom_nouveau_apercu = st.session_state.get("new_nom_apercu", "")
suggestion = suggerer_segment(nom_nouveau_apercu) if nom_nouveau_apercu.strip() else ""

with st.form("form_ajouter_element", clear_on_submit=True):
    nom_nouveau = st.text_input(
        f"Nom du {LABELS_TYPE.get(type_a_creer, type_a_creer).lower()}",
        key="new_nom_apercu",
    )
    segment_nouveau = st.text_input(
        "Segment de code (laisser vide pour auto — ex: CFO, AG1, RBT)",
        value=suggestion, key="new_segment",
        help="Un numéro chronologique (.01, .02...) sera ajouté automatiquement en cas de doublon.",
    )

    fiche_nouvelle = {}
    if type_a_creer in ("equipement", "sous_equipement"):
        st.caption("Fiche équipement (facultatif, modifiable plus tard)")
        fiche_nouvelle["emplacement"] = st.text_input("Emplacement", key="new_empl")
        c1, c2 = st.columns(2)
        fiche_nouvelle["reference"] = c1.text_input("Référence", key="new_ref")
        fiche_nouvelle["numero_serie"] = c2.text_input("Numéro de série", key="new_ns")
        c3, c4 = st.columns(2)
        fiche_nouvelle["constructeur"] = c3.text_input("Constructeur", key="new_cons")
        fiche_nouvelle["fournisseur"] = c4.text_input("Fournisseur", key="new_four")

    valider_ajout = st.form_submit_button("✅ Ajouter", type="primary")

if valider_ajout:
    if not nom_nouveau.strip():
        st.error("Le nom est obligatoire.")
    else:
        try:
            code = ajouter_element(
                conn, site_id, parent_id, niveau, nom_nouveau, fiche_nouvelle,
                segment_code=segment_nouveau,
            )
            conn.commit()
            st.success(f"'{nom_nouveau}' ajouté — code {code}.")
            st.rerun()
        except Exception:
            st.error(f"Un élément nommé '{nom_nouveau}' existe déjà à cet endroit.")

conn.close()
