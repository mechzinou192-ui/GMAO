import streamlit as st
from db import (
    get_conn, get_comptes, get_compte, creer_compte, modifier_compte,
    supprimer_compte, compter_comptes, ROLES_DISPONIBLES,
)

st.set_page_config(page_title="Comptes — MaintTrack", page_icon="👤", layout="centered")
st.title("👤 Comptes / Accès")

conn = get_conn()
nb_comptes = compter_comptes(conn)

# ------------------------------------------------------------------
# Cas 1 : aucun compte -> amorçage du premier compte (admin), accessible sans connexion
# ------------------------------------------------------------------
if nb_comptes == 0:
    st.info("Créez le premier compte — il sera automatiquement administrateur.")
    with st.form("form_premier_compte"):
        nom_complet = st.text_input("Nom complet", placeholder="ex: Zineddine")
        identifiant = st.text_input("Identifiant de connexion", placeholder="ex: zineddine")
        mdp1 = st.text_input("Mot de passe", type="password")
        mdp2 = st.text_input("Confirmer le mot de passe", type="password")
        valider = st.form_submit_button("✅ Créer le compte administrateur", type="primary")

    if valider:
        if not nom_complet.strip() or not identifiant.strip() or not mdp1:
            st.error("Tous les champs sont obligatoires.")
        elif mdp1 != mdp2:
            st.error("Les deux mots de passe ne correspondent pas.")
        else:
            creer_compte(conn, nom_complet, identifiant, mdp1, "admin")
            conn.commit()
            st.success("Compte administrateur créé. Retournez à l'accueil pour vous connecter.")
            st.page_link("Home.py", label="⬅️ Aller à la connexion")
    conn.close()
    st.stop()

# ------------------------------------------------------------------
# Cas normal : il faut être connecté
# ------------------------------------------------------------------
utilisateur = st.session_state.get("utilisateur", "")
if not utilisateur:
    st.warning("Connectez-vous depuis la page d'accueil.")
    st.page_link("Home.py", label="⬅️ Retour à l'accueil")
    conn.close()
    st.stop()

role_actuel = st.session_state.get("role", "")
est_admin = role_actuel == "admin"

st.caption(f"Connecté en tant que **{utilisateur}** ({role_actuel})")

onglet_liste, onglet_ajouter = st.tabs(["📋 Comptes existants", "➕ Ajouter un compte"])

# ==================================================================
# LISTE — modifier / activer-désactiver / supprimer
# ==================================================================
with onglet_liste:
    comptes = get_comptes(conn)
    if not comptes:
        st.caption("Aucun compte.")
    for compte_id, nom_complet, identifiant, role, actif, date_creation in comptes:
        statut = "✅ actif" if actif else "⛔ désactivé"
        with st.expander(f"{nom_complet}  ·  {identifiant}  ·  {role}  ·  {statut}"):
            if not est_admin:
                st.caption("Seul un administrateur peut modifier ou supprimer un compte.")
                st.write(f"Créé le {date_creation}")
            else:
                with st.form(f"form_edit_compte_{compte_id}"):
                    nom_edit = st.text_input("Nom complet", value=nom_complet, key=f"nom_{compte_id}")
                    role_edit = st.selectbox(
                        "Rôle", ROLES_DISPONIBLES,
                        index=ROLES_DISPONIBLES.index(role) if role in ROLES_DISPONIBLES else 0,
                        key=f"role_{compte_id}",
                    )
                    actif_edit = st.checkbox("Compte actif", value=bool(actif), key=f"actif_{compte_id}")
                    nouveau_mdp = st.text_input(
                        "Nouveau mot de passe (laisser vide pour ne pas changer)",
                        type="password", key=f"mdp_{compte_id}",
                    )
                    col1, col2 = st.columns(2)
                    enregistrer = col1.form_submit_button("💾 Enregistrer")
                    supprimer = col2.form_submit_button("🗑️ Supprimer", type="primary")

                if enregistrer:
                    modifier_compte(conn, compte_id, nom_edit, role_edit, actif_edit, nouveau_mdp or None)
                    conn.commit()
                    st.success("Compte mis à jour.")
                    st.rerun()

                if supprimer:
                    if compte_id == st.session_state.get("user_id"):
                        st.error("Vous ne pouvez pas supprimer votre propre compte connecté.")
                    else:
                        supprimer_compte(conn, compte_id)
                        conn.commit()
                        st.success("Compte supprimé.")
                        st.rerun()

# ==================================================================
# AJOUTER
# ==================================================================
with onglet_ajouter:
    if not est_admin:
        st.warning("Seul un administrateur peut créer un nouveau compte.")
    else:
        with st.form("form_ajout_compte", clear_on_submit=True):
            nom_n = st.text_input("Nom complet")
            identifiant_n = st.text_input("Identifiant de connexion")
            role_n = st.selectbox("Rôle", ROLES_DISPONIBLES)
            mdp_n1 = st.text_input("Mot de passe", type="password")
            mdp_n2 = st.text_input("Confirmer le mot de passe", type="password")
            ajouter = st.form_submit_button("✅ Créer le compte", type="primary")

        if ajouter:
            if not nom_n.strip() or not identifiant_n.strip() or not mdp_n1:
                st.error("Tous les champs sont obligatoires.")
            elif mdp_n1 != mdp_n2:
                st.error("Les deux mots de passe ne correspondent pas.")
            else:
                try:
                    creer_compte(conn, nom_n, identifiant_n, mdp_n1, role_n)
                    conn.commit()
                    st.success(f"Compte **{nom_n}** créé.")
                    st.rerun()
                except Exception:
                    st.error("Cet identifiant existe déjà.")

conn.close()
