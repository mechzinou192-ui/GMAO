import datetime
import streamlit as st
from db import (
    get_conn, get_equipements_flat, get_controles, ajouter_controle,
    supprimer_controle, generer_di_preventives_dues,
)

st.set_page_config(page_title="Contrôles réglementaires — MaintTrack", page_icon="📅", layout="centered")
st.title("📅 Contrôles réglementaires / de mesure")
st.caption(
    "Chaque contrôle a une fréquence. Dès que l'échéance est atteinte, une DI préventive "
    "est créée automatiquement (état « à transmettre »), comme une DI classique."
)

utilisateur = st.session_state.get("utilisateur", "")
if not utilisateur:
    st.warning("Retournez à la page d'accueil et entrez votre nom.")
    st.page_link("Home.py", label="⬅️ Retour à l'accueil")
    st.stop()

conn = get_conn()

# ------------------------------------------------------------------
# Vérification automatique à chaque chargement de la page
# ------------------------------------------------------------------
codes_crees = generer_di_preventives_dues(conn)
if codes_crees:
    st.success(
        f"✅ {len(codes_crees)} DI préventive(s) générée(s) automatiquement : {', '.join(codes_crees)}"
    )

st.divider()
st.subheader("1. Ajouter un contrôle")

equipements = get_equipements_flat(conn)
if not equipements:
    st.info("Aucun équipement dans l'arbre pour le moment.")
else:
    with st.form("form_controle", clear_on_submit=True):
        options_e = {
            f"{nom}  ({code or 'sans code'})  ·  {chemin_txt}": eid
            for eid, nom, code, site_nom, chemin_txt in equipements
        }
        choix_e = st.selectbox("Équipement concerné", list(options_e.keys()))
        equipement_id = options_e[choix_e]

        type_controle = st.radio("Type de contrôle", ["reglementaire", "mesure"], horizontal=True,
                                  format_func=lambda t: "Réglementaire" if t == "reglementaire" else "De mesure")
        nom_controle = st.text_input("Nom du contrôle", placeholder="ex : Vérification générale périodique")
        col1, col2 = st.columns(2)
        frequence_jours = col1.number_input("Fréquence (en jours)", min_value=1, value=365, step=1)
        derniere_date = col2.date_input("Dernier contrôle effectué (optionnel)", value=None)

        if st.form_submit_button("➕ Ajouter le contrôle", type="primary") and nom_controle.strip():
            ajouter_controle(conn, equipement_id, type_controle, nom_controle.strip(),
                              int(frequence_jours), derniere_date)
            conn.commit()
            st.success("Contrôle ajouté.")
            st.rerun()

st.divider()
st.subheader("2. Contrôles programmés")

controles = get_controles(conn)
if not controles:
    st.caption("Aucun contrôle programmé pour le moment.")
else:
    aujourdhui = datetime.date.today()
    for (controle_id, equipement_id, nom_eq, code_eq, type_c, nom_c,
         frequence, derniere, prochaine) in controles:
        prochaine_date = datetime.date.fromisoformat(prochaine) if prochaine else None
        if prochaine_date:
            jours_restants = (prochaine_date - aujourdhui).days
            if jours_restants < 0:
                statut = f"🔴 en retard de {-jours_restants} j"
            elif jours_restants == 0:
                statut = "🟠 échéance aujourd'hui"
            elif jours_restants <= 7:
                statut = f"🟠 dans {jours_restants} j"
            else:
                statut = f"🟢 dans {jours_restants} j"
        else:
            statut = "—"

        nature = "Réglementaire" if type_c == "reglementaire" else "De mesure"
        with st.expander(f"{nom_c} — {nom_eq} ({code_eq or 'sans code'}) — {statut}"):
            st.write(f"**Type :** {nature}")
            st.write(f"**Fréquence :** tous les {frequence} jours")
            st.write(f"**Dernier contrôle :** {derniere or '—'}")
            st.write(f"**Prochaine échéance :** {prochaine or '—'}")
            if st.button("🗑️ Supprimer ce contrôle", key=f"del_controle_{controle_id}"):
                supprimer_controle(conn, controle_id)
                conn.commit()
                st.rerun()

conn.close()
