# MaintTrack — GMAO multi-sites

Plateforme de Gestion de Maintenance Assistée par Ordinateur (GMAO), multi-sites (7 sites),
avec arborescence technique complète et cycle de vie des documents :
**DI → BT → DS → BS → BR**.

## Structure du projet

```
maintrack/
├── data/
│   └── maintrack.db                 ← base de données SQLite (21 tables)
├── scripts/
│   ├── create_db.py                 ← crée le schéma complet (fraîche installation)
│   ├── seed_structure.py            ← initialise les 7 sites × 8 systèmes
│   ├── migrate_add_code_equipement.py ← migration : ajoute la colonne `code` sur elements
│   └── gestion_arbre.py             ← navigation CLI pour peupler l'arbre technique
├── app/
│   ├── Home.py                      ← page d'accueil (identification + aperçu)
│   ├── db.py                        ← fonctions partagées (connexion, arbre, codes)
│   └── pages/
│       └── 1_Nouvelle_DI.py         ← formulaire de création de DI
└── requirements.txt
```

## Installation (première fois)

```bash
pip install -r requirements.txt
python3 scripts/create_db.py
python3 scripts/seed_structure.py
```

Si vous avez déjà une base existante créée avant l'ajout du "code équipement",
lancez en plus (une seule fois) :
```bash
python3 scripts/migrate_add_code_equipement.py
```

## Peupler l'arbre technique (sites > systèmes > ... > équipements)

```bash
python3 scripts/gestion_arbre.py
```
Naviguez avec les numéros, `a` pour ajouter un élément, `r` pour remonter, `q` pour quitter.
Un code interne (ex: `EQ-000001`) est généré automatiquement pour chaque élément créé.

## Lancer l'application en local

```bash
cd app
streamlit run Home.py
```
Puis ouvrez le lien affiché dans le terminal (en général http://localhost:8501).
Entrez votre nom sur la page d'accueil (sert de "demandeur" automatique sur les DI),
puis ouvrez la page **Nouvelle DI** dans le menu latéral.

## Déployer gratuitement pour que le client y accède par un lien web

1. Poussez ce dossier sur un dépôt GitHub.
2. Allez sur https://share.streamlit.io, connectez votre compte GitHub.
3. Sélectionnez le dépôt, indiquez `app/Home.py` comme fichier principal.
4. Déployez — vous obtenez une URL publique à partager avec la Direction.

## Photos

Les photos (équipements et BT avant/après) sont stockées sur disque dans `data/photos/`
et leur chemin relatif est enregistré en base. Pensez à sauvegarder ce dossier avec
`data/maintrack.db` si vous déployez ou faites une copie de la base.

## État du cycle de vie des documents

- **DI** : à transmettre → transmise (dès qu'un BT est créé) → traitée (dès que le BT est clos)
- **BT** : à faire → en cours / en attente de pièce → clos
- **DS** : à traiter → en cours de traitement → traitée
- **BS** : en cours → traitée (fait passer la DS liée à traitée aussi)
- **BR** : référence le BS d'origine, quantité rentrée

## Prochaines étapes

- [x] Schéma complet de la base (21 tables)
- [x] Script d'ajout d'équipements dans l'arbre (CLI)
- [x] Formulaire de création de DI
- [x] Génération du BT à partir d'une DI
- [x] Formulaires DS / BS / BR (le BR peut rentrer une pièce **ou** un équipement complet)
- [x] Fiche équipement (page `4_Fiche_Equipement.py`) : édition, photo, nomenclature pièces/outillages/consommables
- [x] Fiche pièce (éditable depuis l'onglet Ressources de la page Stock)
- [x] Photos avant/après réellement enregistrées sur le BT (`data/photos/bt/`)
- [x] Contrôles réglementaires/mesure (page `5_Controles_Reglementaires.py`) → génération automatique de DI préventives dès qu'une échéance est atteinte (vérifiée à chaque chargement de Home, BT ou Contrôles)
- [ ] Import Excel en masse de l'arbre technique
- [ ] Navigation/ajout dans l'arbre technique directement depuis l'app web (actuellement CLI via `gestion_arbre.py`)
