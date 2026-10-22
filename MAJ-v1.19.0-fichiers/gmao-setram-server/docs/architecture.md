# Architecture — GMAO SETRAM

**Version 1.13** · À lire avant toute modification du code (avec `decisions.md` et `api.md`).

## 1. Vue d'ensemble

```
Navigateur (React)  ──HTTPS──▶  Reverse proxy (Caddy ou nginx)  ──HTTP──▶  API Node.js / Express  ──SQL──▶  PostgreSQL 16
   web/                                Caddyfile / deploy/nginx               server/                         volume gmao_pgdata
                                                                                  └──▶ disque : photos (volume gmao_files)
```

Trois couches strictement séparées :

| Couche | Dossier | Rôle | Où chercher en cas de problème |
|---|---|---|---|
| Interface | `web/` | Affichage, saisie, calculs d'affichage (indicateurs) | Affichage incorrect, bouton inactif, graphe vide |
| Serveur | `server/` | Authentification, **droits**, numérotation, validation, journal d'audit, fichiers | Refus (403, 409, 429), réponse incorrecte, erreur 500 |
| Données | PostgreSQL (`server/src/migrations/`) | Stockage, contraintes, transactions | Donnée absente ou incohérente |

L'interface ne parle **qu'à l'API** (`web/src/api.js`, client unique). Seul le serveur accède à la base.

## 2. Serveur (`server/src`)

| Fichier | Rôle |
|---|---|
| `start.js` → `index.js` | Point d'entrée ; assemblage Express (`buildApp`), migrations, compte admin initial, **arrêt propre** |
| `config.js` | **Seul** lecteur des variables d'environnement ; valide tout au démarrage (refus si secret absent / d'exemple, limite invalide) |
| `http.js` | Identifiant de requête, journal d'accès, **format d'erreur unique**, **limitation de débit** |
| `logger.js` | Journal JSON (une ligne par événement) |
| `auth.js` | Connexion, session (cookie httpOnly signé), changement de mot de passe, verrouillage après 5 échecs, garde CSRF |
| `users.js` | Comptes et droits (super administrateur), journal d'audit consultable |
| `records.js` | API de données générique : lecture filtrée par droits, création / modification avec verrou optimiste, suppression logique, numérotation |
| `rights-core.js` / `rights.js` | Règles d'accès par **unité × système × volet** (fonctions pures, partagées avec la démo) |
| `numbering-core.js` / `numbering.js` | Numéros DI / OT / DS… attribués par le serveur, sans doublon |
| `archives-core.js` | Fenêtre de chargement (DI / OT clos anciens non renvoyés par défaut) |
| `importer.js` | Import Excel « tout ou rien » (une transaction) |
| `profils-core.js` | Profils (exploitation, technicien, chargé / responsable système, administrateur UO, expert DG…) : contrôle de chaque écriture, validation DG recalculée, délégation des comptes (fonctions pures, partagées avec la démo) |
| `notifications-core.js` / `notifications.js` / `mail.js` | Qui prévenir (OT à clôturer, clôture, reprise DG), table `notifications`, e-mail SMTP interne facultatif |
| `rapports-core.js` / `fichiers-core.js` / `profils.js` | Circuit des rapports d'activité (contrôles par rôle, tours de revue, notifications), reconnaissance des documents Excel / Word / PDF, chargement des profils créés par le super admin |
| `migration-codes-core.js` / `migrer-codes.js` | Migration unique des codes (LAC système à part, BILLETTIQUE → BIL), simulation puis application |
| `reinitialisation-core.js` / `reinitialisation.js` | « Repartir de zéro » : règles pures (partagées avec la démo) + route transactionnelle (archivage `records_archive`, suppression logique) |
| `files.js` | Photos : contrôle du contenu, taille, nombre, droits identiques à la DI / l'OT |
| `db.js`, `migrations/` | Connexion PostgreSQL (ou PGlite en mode local), migrations versionnées, écriture du journal d'audit |
| `demo/` | Données fictives de démonstration (jamais actives en exploitation : `DEMO` absent) |

Flux d'une requête : `requestId → format d'erreur → journal → limitation de débit → CSRF → authentification → droits (dans la route) → transaction SQL → audit`.

## 3. Modèle de données

Une table générique `records` porte toutes les données métier, une ligne par objet :

| Colonne | Contenu |
|---|---|
| `collection`, `id` | Clé primaire composée (`bts`, `OT-ALG-2026-0007`) |
| `unit`, `system` | Rattachement utilisé par les **droits** (indexés) |
| `data` (JSONB) | Contenu de l'objet (DI, OT, équipement…) |
| `version` | Verrou optimiste : conflit 409 si deux personnes modifient le même objet |
| `deleted` | Suppression logique |
| `created_at`, `updated_at`, `updated_by` | Traçabilité |

Autres tables : `users` (comptes, droits JSON, verrouillage), `audit_log` (qui, quoi, quand, avant / après), `counters` (numérotation), `files` (références des photos), `schema_migrations`.

Collections : `equipements`, `dis`, `bts` (OT), `planning`, `compteurs_eq`, `pieces`, `dss`, `bs`, `brs`, `decharges`, `intervenants`, `prestataires`, `mesures`, `controles`, `organismes`, `systemes`, `arborescence`, `feries`. Leur rattachement aux volets de droits est dans `rights-core.js` (`COLLECTIONS`).

## 4. Interface (`web/src`)

| Dossier / fichier | Rôle |
|---|---|
| `App.jsx` | Session : connexion, changement de mot de passe obligatoire |
| `GmaoApp.jsx` | Application connectée : chargement des collections, actions métier, menu / en-tête / onglets |
| `pages/` | Un fichier par écran (Accueil, Arborescence, MaintenanceCorrective, OrdresTravail, Preventif, Compteurs, Stock, Personnel, Indicateurs, Administration, Connexion) |
| `ui/` | Composants communs, icônes, graphiques SVG |
| `lib/` | Règles métier **pures et testées** (dates, préventif, compteurs, KPI, échéances, coûts) |
| `sync.js` | Synchronisation : chargement, file d'envoi, réessai (réseau, 429), conflits, actualisation toutes les 15 s |
| `api.js` | Client HTTP unique : en-têtes, identifiant de requête, lecture des erreurs |
| `demo/apiDemo.js` | Serveur simulé dans le navigateur (site de démonstration statique) |

## 5. Parcours critiques (couverts par les tests)

1. Connexion → changement de mot de passe obligatoire → accès limité au périmètre.
2. DI → génération de l'OT correctif → DS / BS (magasin) → clôture de l'OT → DI traitée.
3. Plan préventif (calendrier ou compteur) → déclenchement → OT préventif → clôture (relevé du compteur) → échéance suivante.
4. Import Excel (contrôle, puis tout ou rien).
5. Indicateurs (période, filtres, tableau de bord graphique).

## 6. Environnements

| Environnement | Lancement | Base |
|---|---|---|
| Développement | `cd server && npm start` + `cd web && npm run dev` | PGlite intégrée (`server/data`) |
| Recette / production | `docker compose up -d --build` (ou systemd + nginx, `deploy/`) | PostgreSQL 16 |
| Démonstration | `npm run build:demo` (site statique) ou `DEMO=1` | Navigateur / PostgreSQL |
