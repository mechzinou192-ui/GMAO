import datetime
import streamlit as st
from db import (
    get_conn, get_bt_ouverts, get_pieces, get_outillages, get_consommables,
    ajouter_piece, ajouter_outillage, ajouter_consommable,
    get_ds, get_ds_pieces, marquer_ds_en_cours, marquer_ds_traitee,
    get_bs, get_bs_pieces, get_br, generer_prochain_code,
    get_piece, update_piece, get_equipements_flat, creer_bon_retour,
)

st.set_page_config(page_title="Stock — MaintTrack", page_icon="📦", layout="centered")
st.title("📦 Stock — DS / BS / BR")

utilisateur = st.session_state.get("utilisateur", "")
if not utilisateur:
    st.warning("Retournez à la page d'accueil et entrez votre nom.")
    st.page_link("Home.py", label="⬅️ Retour à l'accueil")
    st.stop()

conn = get_conn()

onglet_ressources, onglet_ds, onglet_bs, onglet_br = st.tabs(
    ["🧩 Ressources", "📝 Demandes de sortie (DS)", "📤 Bons de sortie (BS)", "↩️ Bons de retour (BR)"]
)

# ==================================================================
# RESSOURCES : pièces / outillages / consommables
# ==================================================================
with onglet_ressources:
    st.subheader("Ajouter une pièce")
    with st.form("form_piece", clear_on_submit=True):
        nom_p = st.text_input("Nom de la pièce")
        c1, c2 = st.columns(2)
        constructeur_p = c1.text_input("Constructeur")
        fournisseur_p = c2.text_input("Fournisseur")
        c3, c4 = st.columns(2)
        reference_p = c3.text_input("Référence")
        numero_serie_p = c4.text_input("Numéro de série (si applicable)")
        if st.form_submit_button("➕ Ajouter la pièce") and nom_p.strip():
            code = ajouter_piece(conn, nom_p.strip(), constructeur_p or None, fournisseur_p or None,
                                  reference_p or None, numero_serie_p or None)
            conn.commit()
            st.success(f"Pièce ajoutée : {code} — {nom_p}")
            st.rerun()

    st.divider()
    col_out, col_cons = st.columns(2)

    with col_out:
        st.subheader("Ajouter un outillage")
        with st.form("form_outillage", clear_on_submit=True):
            nom_o = st.text_input("Nom de l'outillage")
            if st.form_submit_button("➕ Ajouter") and nom_o.strip():
                code = ajouter_outillage(conn, nom_o.strip())
                conn.commit()
                st.success(f"Outillage ajouté : {code}")
                st.rerun()

    with col_cons:
        st.subheader("Ajouter un consommable")
        with st.form("form_consommable", clear_on_submit=True):
            nom_c = st.text_input("Nom du consommable")
            if st.form_submit_button("➕ Ajouter") and nom_c.strip():
                code = ajouter_consommable(conn, nom_c.strip())
                conn.commit()
                st.success(f"Consommable ajouté : {code}")
                st.rerun()

    st.divider()
    st.subheader("Stock actuel")
    p, o, c = get_pieces(conn), get_outillages(conn), get_consommables(conn)
    st.write(f"**{len(o)} outillage(s)**", ", ".join(f"{code} {nom}" for _, code, nom in o) or "—")
    st.write(f"**{len(c)} consommable(s)**", ", ".join(f"{code} {nom}" for _, code, nom in c) or "—")

    st.markdown(f"**{len(p)} pièce(s) — fiche pièce (cliquer pour éditer)**")
    if not p:
        st.caption("—")
    for piece_id, code_p, nom_p in p:
        with st.expander(f"{code_p} — {nom_p}"):
            fiche_p = get_piece(conn, piece_id)
            _, _, nom_fp, constructeur_fp, fournisseur_fp, reference_fp, numero_serie_fp = fiche_p
            with st.form(f"form_fiche_piece_{piece_id}"):
                nom_edit = st.text_input("Nom", value=nom_fp, key=f"nom_p_{piece_id}")
                ce1, ce2 = st.columns(2)
                constructeur_edit = ce1.text_input("Constructeur", value=constructeur_fp or "", key=f"cons_p_{piece_id}")
                fournisseur_edit = ce2.text_input("Fournisseur", value=fournisseur_fp or "", key=f"four_p_{piece_id}")
                ce3, ce4 = st.columns(2)
                reference_edit = ce3.text_input("Référence", value=reference_fp or "", key=f"ref_p_{piece_id}")
                numero_serie_edit = ce4.text_input("Numéro de série", value=numero_serie_fp or "", key=f"ns_p_{piece_id}")
                if st.form_submit_button("💾 Enregistrer"):
                    update_piece(conn, piece_id, nom_edit.strip(), constructeur_edit.strip() or None,
                                 fournisseur_edit.strip() or None, reference_edit.strip() or None,
                                 numero_serie_edit.strip() or None)
                    conn.commit()
                    st.success("Pièce mise à jour.")
                    st.rerun()

# ==================================================================
# DS : créée à partir d'un BT par le technicien ingénierie
# ==================================================================
with onglet_ds:
    st.subheader("Créer une DS depuis un BT")
    bt_ouverts = get_bt_ouverts(conn)
    pieces_dispo = get_pieces(conn)

    if not bt_ouverts:
        st.info("Aucun BT ouvert. Créez d'abord un BT depuis la page Bons de Travail.")
    elif not pieces_dispo:
        st.info("Aucune pièce en base. Ajoutez-en dans l'onglet Ressources.")
    else:
        options_bt = {f"{code_bt} — {nom_eq} [{etat}]": bt_id for bt_id, code_bt, eq_id, nom_eq, etat in bt_ouverts}
        choix_bt = st.selectbox("Bon de travail", list(options_bt.keys()), key="ds_bt_select")
        bt_id = options_bt[choix_bt]
        equipement_id = next(eq_id for bid, cb, eq_id, ne, et in bt_ouverts if bid == bt_id)

        pieces_demandees = st.multiselect(
            "Pièces demandées", options=[p[0] for p in pieces_dispo],
            format_func=lambda pid: next(f"{p[1]} — {p[2]}" for p in pieces_dispo if p[0] == pid),
            key="ds_pieces_select",
        )
        quantites = {}
        for pid in pieces_demandees:
            nom_p = next(p[2] for p in pieces_dispo if p[0] == pid)
            quantites[pid] = st.number_input(f"Quantité — {nom_p}", min_value=1.0, value=1.0, step=1.0, key=f"ds_qte_{pid}")

        prochain_code_ds = generer_prochain_code(conn, "demandes_sortie")
        st.text_input("Code DS (auto)", value=prochain_code_ds, disabled=True)

        if st.button("✅ Créer la DS", type="primary") and pieces_demandees:
            maintenant = datetime.datetime.now()
            conn.execute(
                """INSERT INTO demandes_sortie (code_ds, bt_id, equipement_id, etat_ds, cree_par, date_creation)
                   VALUES (?, ?, ?, 'a_traiter', ?, ?)""",
                (prochain_code_ds, bt_id, equipement_id, utilisateur, maintenant.isoformat(timespec="seconds")),
            )
            ds_id = conn.execute("SELECT id FROM demandes_sortie WHERE code_ds=?", (prochain_code_ds,)).fetchone()[0]
            for pid, qte in quantites.items():
                conn.execute(
                    "INSERT INTO ds_pieces (ds_id, piece_id, quantite_demandee) VALUES (?, ?, ?)",
                    (ds_id, pid, qte),
                )
            conn.commit()
            st.success(f"DS **{prochain_code_ds}** créée.")
            st.rerun()

    st.divider()
    st.subheader("DS existantes")
    toutes_ds = get_ds(conn)
    if not toutes_ds:
        st.caption("Aucune DS pour le moment.")
    for ds_id, code_ds, bt_id, code_bt, eq_id, nom_eq, etat_ds, cree_par, date_creation in toutes_ds:
        with st.expander(f"{code_ds} — {nom_eq} [{etat_ds}]"):
            pieces_ds = get_ds_pieces(conn, ds_id)
            st.write("Pièces demandées :", ", ".join(f"{n} ×{q:g}" for _, _, n, q in pieces_ds))
            st.caption(f"BT lié : {code_bt}  ·  créée par {cree_par} le {date_creation}")
            if etat_ds == "a_traiter" and st.button("▶️ Passer en cours de traitement", key=f"ds_encours_{ds_id}"):
                marquer_ds_en_cours(conn, ds_id)
                conn.commit()
                st.rerun()

# ==================================================================
# BS : généré à partir d'une DS, imprimé pour le magasinier
# ==================================================================
with onglet_bs:
    st.subheader("Générer un BS depuis une DS")
    ds_disponibles = [d for d in get_ds(conn) if d[6] != "traitee"]

    if not ds_disponibles:
        st.info("Aucune DS en attente de bon de sortie.")
    else:
        options_ds = {f"{code_ds} — {nom_eq} [{etat}]": ds_id for ds_id, code_ds, bt_id, code_bt, eq_id, nom_eq, etat, cp, dc in ds_disponibles}
        choix_ds = st.selectbox("Demande de sortie", list(options_ds.keys()))
        ds_id = options_ds[choix_ds]
        equipement_id = next(eq_id for did, cd, bid, cb, eq_id, ne, et, cp, dc in ds_disponibles if did == ds_id)

        prochain_code_bs = generer_prochain_code(conn, "bons_sortie")
        st.text_input("Code BS (auto)", value=prochain_code_bs, disabled=True)

        if st.button("✅ Générer le BS", type="primary"):
            maintenant = datetime.datetime.now()
            conn.execute(
                """INSERT INTO bons_sortie (code_bs, ds_id, equipement_id, etat_bs, date_creation)
                   VALUES (?, ?, ?, 'en_cours', ?)""",
                (prochain_code_bs, ds_id, equipement_id, maintenant.isoformat(timespec="seconds")),
            )
            bs_id = conn.execute("SELECT id FROM bons_sortie WHERE code_bs=?", (prochain_code_bs,)).fetchone()[0]
            for piece_id, code_p, nom_p, qte in get_ds_pieces(conn, ds_id):
                conn.execute(
                    "INSERT INTO bs_pieces (bs_id, piece_id, quantite_sortie) VALUES (?, ?, ?)",
                    (bs_id, piece_id, qte),
                )
            conn.commit()
            st.success(f"BS **{prochain_code_bs}** généré.")
            st.rerun()

    st.divider()
    st.subheader("BS existants")
    tous_bs = get_bs(conn)
    if not tous_bs:
        st.caption("Aucun BS pour le moment.")
    for bs_id, code_bs, ds_id, code_ds, eq_id, nom_eq, etat_bs, date_creation, date_traitement in tous_bs:
        with st.expander(f"{code_bs} — {nom_eq} [{etat_bs}]"):
            pieces_bs = get_bs_pieces(conn, bs_id)
            st.markdown("**🖨️ Fiche à imprimer (pour le magasinier)**")
            st.markdown(f"""
> **BON DE SORTIE — {code_bs}**
> DS d'origine : {code_ds}
> Équipement : {nom_eq}
> Date de création : {date_creation}
>
> | Pièce | Quantité |
> |---|---|
{chr(10).join(f'> | {n} | {q:g} |' for _, _, n, q in pieces_bs)}
            """)
            st.caption("Utilisez Ctrl+P (ou Cmd+P) pour imprimer cette fiche.")
            if etat_bs == "en_cours" and st.button("🔒 Marquer comme traitée", key=f"bs_traite_{bs_id}"):
                maintenant = datetime.datetime.now()
                conn.execute(
                    "UPDATE bons_sortie SET etat_bs='traitee', date_traitement=? WHERE id=?",
                    (maintenant.isoformat(timespec="seconds"), bs_id),
                )
                marquer_ds_traitee(conn, ds_id)
                conn.commit()
                st.success(f"BS {code_bs} traité. La DS {code_ds} est passée à l'état traitée.")
                st.rerun()

# ==================================================================
# BR : pièce ou équipement rentré au magasin, référence le BS d'origine
# ==================================================================
with onglet_br:
    st.subheader("Créer un BR")
    st.caption("Un BR référence toujours le BS d'origine, et rentre soit une pièce, soit un équipement complet.")
    bs_pour_retour = get_bs(conn)
    pieces_dispo = get_pieces(conn)
    equipements_dispo = get_equipements_flat(conn)

    if not bs_pour_retour:
        st.info("Aucun BS en base pour référencer un retour.")
    else:
        options_bs = {f"{code_bs} — {nom_eq}": bs_id for bs_id, code_bs, ds_id, code_ds, eq_id, nom_eq, etat, dc, dt in bs_pour_retour}
        choix_bs = st.selectbox("BS d'origine", list(options_bs.keys()))
        bs_id = options_bs[choix_bs]

        type_retour = st.radio("Ce qui est rentré", ["Pièce", "Équipement complet"], horizontal=True)

        piece_retour = None
        equipement_retour = None
        if type_retour == "Pièce":
            if pieces_dispo:
                options_p = {"— aucune —": None}
                options_p.update({f"{code} — {nom}": pid for pid, code, nom in pieces_dispo})
                choix_p = st.selectbox("Pièce rentrée", list(options_p.keys()))
                piece_retour = options_p[choix_p]
            else:
                st.caption("Aucune pièce en base.")
        else:
            if equipements_dispo:
                options_e = {f"{nom}  ({code or 'sans code'})  ·  {chemin_txt}": eid
                             for eid, nom, code, site_nom, chemin_txt in equipements_dispo}
                choix_e = st.selectbox("Équipement rentré", list(options_e.keys()))
                equipement_retour = options_e[choix_e]
            else:
                st.caption("Aucun équipement en base.")

        quantite = st.number_input("Quantité", min_value=1.0, value=1.0, step=1.0)
        prochain_code_br = generer_prochain_code(conn, "bons_retour")
        st.text_input("Code BR (auto)", value=prochain_code_br, disabled=True)

        if st.button("✅ Créer le BR", type="primary"):
            maintenant = datetime.datetime.now()
            creer_bon_retour(conn, prochain_code_br, bs_id, piece_retour, equipement_retour,
                              quantite, maintenant.isoformat(timespec="seconds"))
            conn.commit()
            st.success(f"BR **{prochain_code_br}** créé.")
            st.rerun()

    st.divider()
    st.subheader("BR existants")
    tous_br = get_br(conn)
    if not tous_br:
        st.caption("Aucun BR pour le moment.")
    else:
        for br_id, code_br, bs_id, code_bs, code_p, nom_p, code_e, nom_e, quantite, date_retour in tous_br:
            libelle_rentre = f"{nom_p} (pièce)" if nom_p else (f"{nom_e} (équipement)" if nom_e else "(non précisé)")
            st.write(f"**{code_br}** — BS {code_bs} — {libelle_rentre} ×{quantite:g} — {date_retour}")

conn.close()
