import datetime
import streamlit as st
from db import (
    get_conn, get_di, get_bt, get_bt_techniciens, get_bt_ressources,
    get_pieces, get_outillages, get_consommables,
    generer_prochain_code, marquer_di_transmise, marquer_di_traitee,
    sauvegarder_photo, enregistrer_photos_bt, chemin_absolu_photo,
    generer_di_preventives_dues, supprimer_bt,
)

# Vérifie et génère automatiquement les DI préventives dont l'échéance est atteinte
_conn_check = get_conn()
_di_preventives = generer_di_preventives_dues(_conn_check)
_conn_check.close()
if _di_preventives:
    st.toast(f"{len(_di_preventives)} DI préventive(s) générée(s) automatiquement : {', '.join(_di_preventives)}")

st.set_page_config(page_title="Bons de Travail — MaintTrack", page_icon="🔧", layout="centered")
st.title("🔧 Bons de Travail (BT)")

utilisateur = st.session_state.get("utilisateur", "")
if not utilisateur:
    st.warning("Retournez à la page d'accueil et entrez votre nom.")
    st.page_link("Home.py", label="⬅️ Retour à l'accueil")
    st.stop()

conn = get_conn()

onglet_creer, onglet_gerer = st.tabs(["➕ Créer un BT depuis une DI", "📋 Gérer les BT existants"])

# ==================================================================
# ONGLET 1 : créer un BT à partir d'une DI "à transmettre"
# ==================================================================
with onglet_creer:
    di_en_attente = get_di(conn, etat="a_transmettre")

    if not di_en_attente:
        st.info("Aucune DI en attente de transmission (état 'à transmettre').")
    else:
        options = {
            f"{code_di}  —  {nom_eq}  ({type_panne or 'panne non précisée'})": di_id
            for (di_id, code_di, eq_id, nom_eq, type_panne, *_ ) in di_en_attente
        }
        choix = st.selectbox("DI à transformer en BT", list(options.keys()))
        di_id = options[choix]

        di_row = next(d for d in di_en_attente if d[0] == di_id)
        _, code_di, equipement_id, nom_equipement, type_panne, date_evt, heure_evt, demandeur, _ = di_row

        st.caption(f"DI {code_di} — {nom_equipement} — signalée par {demandeur} le {date_evt} à {heure_evt}")

        prochain_code_bt = generer_prochain_code(conn, "bons_travail")
        st.text_input("Code BT (auto)", value=prochain_code_bt, disabled=True)

        if st.button("✅ Créer le BT et transmettre la DI", type="primary"):
            maintenant = datetime.datetime.now()
            conn.execute(
                """INSERT INTO bons_travail (code_bt, di_id, equipement_id, etat_bt, date_creation)
                   VALUES (?, ?, ?, 'a_faire', ?)""",
                (prochain_code_bt, di_id, equipement_id, maintenant.isoformat(timespec="seconds")),
            )
            marquer_di_transmise(conn, di_id)
            conn.commit()
            st.success(f"BT **{prochain_code_bt}** créé. La DI {code_di} est passée à l'état **transmise**.")
            st.rerun()

# ==================================================================
# ONGLET 2 : gérer / compléter / clôturer un BT existant
# ==================================================================
with onglet_gerer:
    tous_les_bt = get_bt(conn)

    if not tous_les_bt:
        st.info("Aucun BT créé pour le moment.")
    else:
        options_bt = {
            f"{code_bt}  —  {nom_eq}  [{etat_bt}]": bt_id
            for (bt_id, code_bt, di_id, code_di, eq_id, nom_eq, duree, logistique, permis,
                 etat_bt, dc, dcl, photo_av, photo_ap)
            in tous_les_bt
        }
        choix_bt = st.selectbox("Bon de travail", list(options_bt.keys()))
        bt_id = options_bt[choix_bt]
        bt_row = next(b for b in tous_les_bt if b[0] == bt_id)
        (_, code_bt, di_id, code_di, equipement_id, nom_equipement,
         duree, logistique, permis, etat_bt, date_creation, date_cloture,
         photo_avant_existante, photo_apres_existante) = bt_row

        st.caption(f"Lié à la DI {code_di} — équipement : {nom_equipement}")
        st.markdown(f"**État actuel : `{etat_bt}`**")

        with st.expander("🗑️ Supprimer ce BT"):
            st.caption("Impossible si une demande de sortie (DS) est déjà liée à ce BT.")
            if st.button("🗑️ Confirmer la suppression", key=f"suppr_bt_{bt_id}", type="primary"):
                ok, message = supprimer_bt(conn, bt_id, di_id)
                if ok:
                    conn.commit()
                    st.success(message)
                    st.rerun()
                else:
                    st.error(message)

        if etat_bt == "clos":
            st.success(f"Ce BT est clos depuis le {date_cloture}.")
            techniciens = get_bt_techniciens(conn, bt_id)
            pieces_u, outillages_u, consommables_u = get_bt_ressources(conn, bt_id)
            st.write("**Techniciens :**", ", ".join(techniciens) or "—")
            st.write("**Durée d'intervention :**", f"{duree} h" if duree else "—")
            st.write("**Temps logistique :**", f"{logistique} h" if logistique else "—")
            st.write("**N° permis de travail :**", permis or "—")
            if pieces_u:
                st.write("**Pièces utilisées :**", ", ".join(f"{n} ×{q:g}" for _, n, q in pieces_u))
            if outillages_u:
                st.write("**Outillages utilisés :**", ", ".join(n for _, n in outillages_u))
            if consommables_u:
                st.write("**Consommables utilisés :**", ", ".join(f"{n} ×{q:g}" for _, n, q in consommables_u))
            colp1, colp2 = st.columns(2)
            if photo_avant_existante:
                colp1.image(chemin_absolu_photo(photo_avant_existante), caption="Avant panne")
            if photo_apres_existante:
                colp2.image(chemin_absolu_photo(photo_apres_existante), caption="Après intervention")
        else:
            st.divider()
            st.subheader("Compléter l'intervention")

            techniciens_txt = st.text_input(
                "Techniciens (séparés par une virgule)",
                value=", ".join(get_bt_techniciens(conn, bt_id)),
            )
            col1, col2 = st.columns(2)
            duree_input = col1.number_input("Durée d'intervention (h)", min_value=0.0, step=0.5, value=duree or 0.0)
            logistique_input = col2.number_input("Temps logistique (h)", min_value=0.0, step=0.5, value=logistique or 0.0)
            permis_input = st.text_input("Numéro de permis de travail", value=permis or "")

            colph1, colph2 = st.columns(2)
            if photo_avant_existante:
                colph1.image(chemin_absolu_photo(photo_avant_existante), caption="Photo avant actuelle", width=200)
            if photo_apres_existante:
                colph2.image(chemin_absolu_photo(photo_apres_existante), caption="Photo après actuelle", width=200)

            photo_avant = colph1.file_uploader("Photo avant panne (remplace si déjà présente)", type=["png", "jpg", "jpeg"], key="avant")
            photo_apres = colph2.file_uploader("Photo après intervention (remplace si déjà présente)", type=["png", "jpg", "jpeg"], key="apres")

            st.markdown("**Pièces utilisées**")
            pieces_dispo = get_pieces(conn)
            pieces_choisies = st.multiselect(
                "Pièces", options=[p[0] for p in pieces_dispo],
                format_func=lambda pid: next(f"{p[1]} — {p[2]}" for p in pieces_dispo if p[0] == pid),
                key="pieces_bt",
            )
            quantites_pieces = {}
            for pid in pieces_choisies:
                nom_p = next(p[2] for p in pieces_dispo if p[0] == pid)
                quantites_pieces[pid] = st.number_input(f"Quantité — {nom_p}", min_value=0.0, value=1.0, step=1.0, key=f"qte_piece_{pid}")

            st.markdown("**Outillages utilisés**")
            outillages_dispo = get_outillages(conn)
            outillages_choisis = st.multiselect(
                "Outillages", options=[o[0] for o in outillages_dispo],
                format_func=lambda oid: next(f"{o[1]} — {o[2]}" for o in outillages_dispo if o[0] == oid),
                key="outillages_bt",
            )

            st.markdown("**Consommables utilisés**")
            consommables_dispo = get_consommables(conn)
            consommables_choisis = st.multiselect(
                "Consommables", options=[c[0] for c in consommables_dispo],
                format_func=lambda cid: next(f"{c[1]} — {c[2]}" for c in consommables_dispo if c[0] == cid),
                key="consommables_bt",
            )
            quantites_conso = {}
            for cid in consommables_choisis:
                nom_c = next(c[2] for c in consommables_dispo if c[0] == cid)
                quantites_conso[cid] = st.number_input(f"Quantité — {nom_c}", min_value=0.0, value=1.0, step=1.0, key=f"qte_conso_{cid}")

            if not pieces_dispo and not outillages_dispo and not consommables_dispo:
                st.caption("Aucune ressource en base pour le moment — ajoutez-en depuis la page Stock.")

            st.divider()
            nouvel_etat = st.radio("Changer l'état du BT", ["en_cours", "attente_piece"], horizontal=True)

            colA, colB = st.columns(2)

            def sauvegarder_champs():
                conn.execute(
                    """UPDATE bons_travail SET duree_intervention_h=?, temps_logistique_h=?,
                       numero_permis_travail=? WHERE id=?""",
                    (duree_input, logistique_input, permis_input, bt_id),
                )
                conn.execute("DELETE FROM bt_techniciens WHERE bt_id=?", (bt_id,))
                for nom_t in [t.strip() for t in techniciens_txt.split(",") if t.strip()]:
                    conn.execute(
                        "INSERT OR IGNORE INTO bt_techniciens (bt_id, technicien_nom) VALUES (?, ?)",
                        (bt_id, nom_t),
                    )
                conn.execute("DELETE FROM bt_pieces WHERE bt_id=?", (bt_id,))
                for pid, qte in quantites_pieces.items():
                    conn.execute(
                        "INSERT INTO bt_pieces (bt_id, piece_id, quantite) VALUES (?, ?, ?)",
                        (bt_id, pid, qte),
                    )
                conn.execute("DELETE FROM bt_outillages WHERE bt_id=?", (bt_id,))
                for oid in outillages_choisis:
                    conn.execute(
                        "INSERT INTO bt_outillages (bt_id, outillage_id) VALUES (?, ?)", (bt_id, oid)
                    )
                conn.execute("DELETE FROM bt_consommables WHERE bt_id=?", (bt_id,))
                for cid, qte in quantites_conso.items():
                    conn.execute(
                        "INSERT INTO bt_consommables (bt_id, consommable_id, quantite) VALUES (?, ?, ?)",
                        (bt_id, cid, qte),
                    )
                if photo_avant is not None:
                    chemin_av = sauvegarder_photo("bt", f"{code_bt}_avant", photo_avant)
                    enregistrer_photos_bt(conn, bt_id, photo_avant_path=chemin_av)
                if photo_apres is not None:
                    chemin_ap = sauvegarder_photo("bt", f"{code_bt}_apres", photo_apres)
                    enregistrer_photos_bt(conn, bt_id, photo_apres_path=chemin_ap)

            if colA.button("💾 Enregistrer les modifications"):
                sauvegarder_champs()
                conn.execute("UPDATE bons_travail SET etat_bt=? WHERE id=?", (nouvel_etat, bt_id))
                conn.commit()
                st.success(f"BT {code_bt} mis à jour (état : {nouvel_etat}).")
                st.rerun()

            if colB.button("🔒 Clôturer le BT", type="primary"):
                sauvegarder_champs()
                maintenant = datetime.datetime.now()
                conn.execute(
                    "UPDATE bons_travail SET etat_bt='clos', date_cloture=? WHERE id=?",
                    (maintenant.isoformat(timespec="seconds"), bt_id),
                )
                marquer_di_traitee(conn, di_id)
                conn.commit()
                st.success(f"BT {code_bt} clôturé. La DI {code_di} est passée à l'état **traitée**.")
                st.balloons()
                st.rerun()

conn.close()
