import streamlit as st
from db import (
    get_conn, get_sites, generer_di_preventives_dues,
    compter_comptes, verifier_login,
)

st.set_page_config(page_title="MaintTrack", page_icon="🛠️", layout="centered")

st.title("🛠️ MaintTrack")
st.caption("Gestion de maintenance assistée par ordinateur — multi-sites")

st.divider()

conn_boot = get_conn()
nb_comptes = compter_comptes(conn_boot)
conn_boot.close()

# ------------------------------------------------------------------
# Aucun compte en base : on force la création du premier compte (admin)
# ------------------------------------------------------------------
if nb_comptes == 0:
    st.warning("Aucun compte n'existe encore. Créez le premier compte (administrateur) pour commencer.")
    st.page_link("pages/0_Comptes.py", label="➕ Créer le premier compte", icon="👤")
    st.stop()

# ------------------------------------------------------------------
# Connexion par identifiant / mot de passe
# ------------------------------------------------------------------
if "user_id" not in st.session_state:
    st.subheader("Connexion")
    with st.form("form_login"):
        identifiant = st.text_input("Identifiant")
        mot_de_passe = st.text_input("Mot de passe", type="password")
        connecte = st.form_submit_button("🔓 Se connecter", type="primary")

    if connecte:
        conn = get_conn()
        resultat = verifier_login(conn, identifiant, mot_de_passe)
        conn.close()
        if resultat:
            uid, nom_complet, role = resultat
            st.session_state["user_id"] = uid
            st.session_state["utilisateur"] = nom_complet
            st.session_state["role"] = role
            st.rerun()
        else:
            st.error("Identifiant, mot de passe incorrect, ou compte désactivé.")
    st.stop()

# ------------------------------------------------------------------
# Utilisateur connecté
# ------------------------------------------------------------------
col_bienvenue, col_deco = st.columns([4, 1])
col_bienvenue.success(f"Connecté en tant que **{st.session_state['utilisateur']}** ({st.session_state.get('role', '')})")
if col_deco.button("🚪 Déconnexion"):
    for cle in ("user_id", "utilisateur", "role"):
        st.session_state.pop(cle, None)
    st.rerun()

st.divider()

# --- Vérification automatique des contrôles réglementaires/mesure échus ---
_conn_check = get_conn()
_di_preventives = generer_di_preventives_dues(_conn_check)
_conn_check.close()
if _di_preventives:
    st.info(f"📅 {len(_di_preventives)} DI préventive(s) générée(s) automatiquement : {', '.join(_di_preventives)}")

# --- Aperçu rapide de l'état de la base ---
conn = get_conn()
n_sites = len(get_sites(conn))
n_elements = conn.execute("SELECT COUNT(*) FROM elements").fetchone()[0]
n_equipements = conn.execute(
    "SELECT COUNT(*) FROM elements WHERE type IN ('equipement','sous_equipement')"
).fetchone()[0]
n_di = conn.execute("SELECT COUNT(*) FROM demandes_intervention").fetchone()[0]
n_bt = conn.execute("SELECT COUNT(*) FROM bons_travail").fetchone()[0]
n_ds = conn.execute("SELECT COUNT(*) FROM demandes_sortie").fetchone()[0]
n_bs = conn.execute("SELECT COUNT(*) FROM bons_sortie").fetchone()[0]
n_controles = conn.execute("SELECT COUNT(*) FROM controles_periodiques").fetchone()[0]
conn.close()

c1, c2, c3, c4 = st.columns(4)
c1.metric("Sites", n_sites)
c2.metric("Éléments d'arbre", n_elements)
c3.metric("Équipements", n_equipements)
c4.metric("DI créées", n_di)

c5, c6, c7, c8 = st.columns(4)
c5.metric("BT créés", n_bt)
c6.metric("DS créées", n_ds)
c7.metric("BS créés", n_bs)
c8.metric("Contrôles programmés", n_controles)

st.divider()
st.page_link("pages/0_Comptes.py", label="👤 Comptes / Accès", icon="👤")
st.page_link("pages/6_Arborescence.py", label="🌳 Arborescence technique (ajouter/modifier/supprimer)", icon="🌳")
st.page_link("pages/1_Demandes_Intervention.py", label="📋 Demandes d'intervention (DI) — créer / gérer", icon="📋")
st.page_link("pages/2_Bons_Travail.py", label="🔧 Bons de Travail (créer / gérer / clôturer)", icon="🔧")
st.page_link("pages/3_Stock.py", label="📦 Stock — DS / BS / BR", icon="📦")
st.page_link("pages/4_Fiche_Equipement.py", label="🗂️ Fiche équipement (photo, nomenclature)", icon="🗂️")
st.page_link("pages/5_Controles_Reglementaires.py", label="📅 Contrôles réglementaires / de mesure", icon="📅")

if n_equipements == 0:
    st.info("Aucun équipement dans l'arbre pour le moment. Ajoutez-en depuis la page **Arborescence technique**.")
