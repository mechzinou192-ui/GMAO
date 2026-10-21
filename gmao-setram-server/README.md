# GMAO SETRAM

## Documents

| Document | Pour qui |
|---|---|
| [`DOSSIER-DSI.md`](DOSSIER-DSI.md) | DSI / RSSI : installation, HTTPS, sauvegardes, exploitation |
| [`GUIDE-UTILISATEUR.md`](GUIDE-UTILISATEUR.md) | Utilisateurs : utilisation au quotidien, par profil |
| [`PLAN-PILOTE.md`](PLAN-PILOTE.md) | Direction / chef de projet : pilote sur une unité, indicateurs de réussite |
| [`SECURITE-PRE-AUDIT.md`](SECURITE-PRE-AUDIT.md) | RSSI / auditeur : mesures en place, périmètre du test d'intrusion |
| [`RAPPORT-CONFORMITE.md`](RAPPORT-CONFORMITE.md) | DSI : état de conformité aux règles d'ingénierie, résultats réels des contrôles, ce qui reste à vérifier |
| [`docs/architecture.md`](docs/architecture.md) | Développeur / DSI : composants, flux, modèle de données |
| [`docs/api.md`](docs/api.md) | Développeur : routes, droits, limites, format d'erreur |
| [`docs/decisions.md`](docs/decisions.md) | Développeur / DSI : chaque choix technique, sa raison, l'alternative écartée |
| [`docs/runbook.md`](docs/runbook.md) | Exploitant : démarrer, superviser, retrouver une erreur, sauvegarder, mettre à jour, revenir en arrière |

**Vérification complète en une commande** (identique à la CI, hors Docker) : `./scripts/verifier.sh`.

Versions imprimables (`.html`, images intégrées) : `python3 scripts/generer-docs.py`.

## Structure du code de l'interface (`web/src`)

| Fichier | Contenu |
|---|---|
| `App.jsx` | Point d'entrée : session, connexion |
| `GmaoApp.jsx` | Application connectée : données synchronisées, actions métier, menu / en-tête / onglets |
| `pages/*.jsx` | Un fichier par écran : Accueil, Arborescence (et matériaux), MaintenanceCorrective, DemandesIntervention, OrdresTravail, Preventif, Compteurs, Stock, Personnel, Indicateurs, Administration, Connexion |
| `ui/base.jsx`, `ui/icones.jsx`, `ui/graphes.jsx` | Composants communs (badges, cartes, fenêtres, champs…), icônes, graphiques SVG |
| `lib/*.js` | Règles métier pures et testées : dates, préventif, compteurs, KPI, échéances, coûts |
| `sync.js`, `api.js` | Synchronisation avec le serveur (fenêtre de chargement, conflits, file d'attente) |

Contrôles : `npm test` (tests), `npm run lint` (références non définies, code mort).

> **Remise à la DSI : lire d'abord [`DOSSIER-DSI.md`](DOSSIER-DSI.md)** (installation, HTTPS, sauvegardes, sécurité, ce qui a été vérifié ou non). Version imprimable : `DOSSIER-DSI.html`. — Serveur

Socle serveur de la GMAO : base PostgreSQL partagée entre les 7 unités, authentification sécurisée,
droits par **unité / système / volet** vérifiés **côté serveur**, journal d'audit, sauvegardes.

```
Postes (navigateur) ──HTTPS──> Caddy ──> API Node.js ──> PostgreSQL
```

> **Essai sans installation** : sans `DATABASE_URL`, le serveur démarre en *mode local* avec une base PostgreSQL
> embarquée (dossier `data/`), écoute uniquement sur `127.0.0.1` en HTTP, et génère lui-même sa clé de session.
> Commande : `cd server && npm install && npm start`. C'est ce mode qu'utilise le paquet Windows autonome
> (`gmao-setram-local-windows.zip`). **Ne l'utilisez pas pour la production multi-utilisateurs** : voir ci-dessous.

## 1. Prérequis (serveur interne)

- Linux (Ubuntu Server 22.04/24.04 recommandé), 2 CPU / 4 Go RAM / 50 Go de disque suffisent
- Docker + Docker Compose (`apt install docker.io docker-compose-v2`)
- Un nom pour le serveur, résolu par les postes (DNS interne ou fichier `hosts`), ex. `gmao.setram.local`

## 2. Installation

```bash
cd /opt && git clone <ce-dépôt> gmao-setram-server   # ou copier le dossier
cd gmao-setram-server
cp .env.example .env
nano .env            # GMAO_HOST, DB_PASSWORD, JWT_SECRET (openssl rand -base64 48)
docker compose up -d --build
docker compose logs app | grep -A6 "super administrateur"   # mot de passe initial de « admin »
```

Ouvrir `https://gmao.setram.local`, se connecter avec `admin` : le **changement du mot de passe est exigé**
dès la première connexion. Aucun mot de passe par défaut n'existe dans le code.

### Certificat HTTPS interne
Caddy génère une autorité interne. Pour éviter l'avertissement du navigateur, installer son certificat racine
sur les postes (idéalement par GPO) :
```bash
docker compose cp proxy:/data/caddy/pki/authorities/local/root.crt ./setram-root.crt
```
Si SETRAM dispose d'une autorité de certification interne, on peut la remplacer dans le `Caddyfile`
(`tls /chemin/cert.pem /chemin/key.pem`).

## 3. Sécurité intégrée

| Point | Mise en œuvre |
|---|---|
| Mots de passe | bcrypt (coût 12), 10 caractères min. avec lettre + chiffre |
| Premier accès / réinitialisation | changement de mot de passe obligatoire |
| Force brute | verrouillage 15 min après 5 échecs + limitation par IP |
| Session | cookie `httpOnly` + `SameSite=Strict` + `Secure`, 8 h, invalidée si compte désactivé ou mot de passe changé |
| Droits | contrôlés à **chaque requête** sur le serveur (lecture filtrée ligne par ligne) |
| CSRF / XSS | en-tête `X-Requested-With` obligatoire, CSP stricte (aucun script externe) |
| Concurrence | verrou optimiste (`version`) : erreur 409 si deux personnes modifient le même objet |
| Traçabilité | `audit_log` : connexions, échecs, créations, modifications **avec avant/après des rubriques changées**, suppressions (contenu conservé), imports |
| Numérotation | numéros de DI, OT, DS, BS, BR, décharges, plans préventifs et articles **attribués par le serveur** (jamais de doublon) |
| Suppression | logique (rien n'est perdu), historique conservé |

## 4. Modèle de droits

Identique à l'interface : pour chaque utilisateur, **par unité** → liste de systèmes + liste de volets.

| Volet | Collections (écriture) | Portée |
|---|---|---|
| 0 Arborescence | `equipements` | par unité + système |
| 0 Arborescence | `mesures`, `controles`, `organismes`, `systemes`, `arborescence` | partagé (toutes unités) |
| 1 DI | `dis` | par unité + système (déduits de l'équipement visé) |
| 2 OT | `bts` | par unité + système |
| 3 Planning préventif | `planning` | par unité + système |
| 4 Gestion de stock | `pieces`, `dss`, `bs`, `brs`, `decharges` | partagé (magasin central) |
| 5 Intervenants | `intervenants`, `prestataires`, `feries` | partagé |
| 6 Indicateurs | lecture seule des collections nécessaires aux KPI | — |

Les collections « partagées » sont accessibles si l'utilisateur détient le volet dans **au moins une** unité (comme
dans l'interface d'origine, où le magasin et les intervenants sont communs). Un utilisateur qui crée des DI peut lire
les `equipements` de son périmètre même sans le volet 0.

Unités : Alger, Oran, Constantine, Sidi Bel Abbès, Ouargla, Sétif, Mostaganem (modifiable via `UNITS` dans `.env`).

## 4 bis. Numérotation des documents

Les numéros sont attribués par le **serveur** (compteurs atomiques en base, table `counters`) : deux personnes qui créent
un document au même instant obtiennent deux numéros différents.

| Document | Format | Compteur |
|---|---|---|
| DI | `DI-ALG-2026-0042` | par unité, repart de 1 chaque année |
| OT | `OT-ALG-2026-0042` | par unité, par année |
| OT préventif | `OT-PREV-ALG-2026-0042` | par unité, par année |
| Plan préventif | `PREV-ALG-0042` | par unité, continu |
| DS / BS / BR / Décharge | `DS-2026-0042`, `BS-…`, `BR-…`, `DCH-…` | magasin central, par année |
| Articles | `P-001` (pièce), `O-001` (outillage), `C-001` (consommable) | continu |

- L'**unité** d'une DI ou d'un OT est celle de l'équipement visé ; l'**année** est l'année civile à Alger.
- Les anciens codes (`DI-2026-015`, `OT-3312`…) restent valides ; un numéro déjà utilisé est automatiquement sauté.
- Si le serveur est injoignable au moment de créer un document, **rien n'est créé** et un message l'indique (on ne risque
  plus de doublon). Un numéro réservé puis non utilisé n'est pas réattribué : la suite peut comporter des trous.
- Pour une unité ajoutée via `UNITS`, l'abréviation est formée des 3 premières lettres (modifiable dans `server/src/numbering.js`).

## 4 sexies. Téléphone, tablette et impression du ordre de travail

- **Téléphone** : le menu devient un tiroir (bouton ☰, fermé au démarrage, se referme après chaque choix) ;
  les listes **DI** et **OT** s'affichent en **cartes** (au toucher : ouverture du détail) au lieu d'un tableau à
  11 colonnes ; les formulaires passent sur une colonne ; les champs ne déclenchent plus le zoom automatique d'iPhone ;
  les fenêtres occupent presque tout l'écran. Sur ordinateur, rien ne change.
- **Imprimer / PDF** : dans le détail d'un OT, bouton « 🖨 Imprimer / PDF » → ordre de travail A4 (identification,
  consigne, tâches avec cases, constat, temps, intervenants, matières, coût, cases de signature). Dans la boîte de
  dialogue d'impression, choisir « Enregistrer au format PDF ». Un OT en cours s'imprime avec des cases vides à
  remplir sur le terrain. Si rien ne s'ouvre, autoriser les fenêtres pop-up pour le site.
- Pas encore adaptés au téléphone : le calendrier du planning préventif (grille de 7 colonnes) et les écrans
  d'administration — utilisables, mais plus à l'aise sur tablette ou ordinateur.

## 4 decies. Démonstration en site statique (sans serveur)

`npm run build:demo` (ou `./scripts/construire-site-demo.sh`) produit `web/dist-demo/` : 5 fichiers (1,5 Mo) à déposer sur
Netlify Drop, Cloudflare Pages ou GitHub Pages. Le « serveur » est simulé dans le navigateur par `web/src/demo/apiDemo.js`, qui
réutilise **les mêmes fichiers que le vrai serveur** pour les droits (`server/src/rights-core.js`), la numérotation
(`server/src/numbering-core.js`) et les données fictives (`server/src/demo/`). Les profils de démonstration n'existent que dans cette
version : la version de production (`npm run build`) ne les contient pas (vérifié par la recherche de leurs mots de passe dans le fichier).

## 4 nonies. Démonstration en ligne gratuite

Le mode `DEMO=1` publie une instance de présentation (données fictives, comptes publics, remise à zéro toutes les
`DEMO_RESET_HOURS` heures, gestion des comptes verrouillée). Guide complet : **`HEBERGEMENT-GRATUIT.md`** (Render + Neon, ou
PC + lien temporaire Cloudflare). Fichier de déploiement : `render.yaml`.
**N'activez jamais `DEMO=1` sur une instance contenant de vraies données.** Avec la base embarquée (sans `DATABASE_URL`),
la démo consomme ~500 Mo de mémoire : utilisez une vraie base PostgreSQL (≈ 80 Mo).

## 4 octies. Photos et QR codes

**Photos (pièces jointes)** — dans le détail d'une DI ou d'un OT : « 📷 Prendre une photo » (appareil photo du téléphone) ou
« 🖼 Choisir ». La photo est réduite sur le téléphone (1600 px, JPEG) puis envoyée ; on la touche pour l'agrandir, ✕ pour la supprimer.
- Mêmes droits que la DI / l'OT concerné (unité, système, volet), vérifiés côté serveur ; 12 photos maximum par élément, 10 Mo maximum par envoi.
- Le serveur contrôle le **contenu** : JPEG, PNG ou WebP uniquement (ni SVG, ni HTML, ni exécutable, même renommés).
- Stockage : volume Docker `gmao_files` (`/data/files`) ; dossier `donnees/files` pour le paquet Windows. **Inclus dans `backup.sh` / `restore.sh`.**
- Ajout et suppression sont inscrits au journal d'audit.

**QR codes** — Arborescence → « 🏷 Étiquettes QR » : planche A4 d'étiquettes (QR + code + désignation + emplacement) pour l'unité
courante, ou pour le système / sous-système ouvert (300 maximum par impression). Coller l'étiquette sur l'équipement.
Scanner le QR avec le téléphone ouvre l'application (connexion si besoin) directement sur **« Nouvelle DI » pour cet équipement**.
Le lien contient l'adresse du serveur : imprimer les étiquettes **depuis l'adresse définitive** (`https://gmao.setram.local`) et non depuis `localhost`.

## 4 septies. Vérifications automatiques

- `./scripts/verifier.sh` : tests du serveur, analyse du code, tests de l'interface, compilation — à lancer avant chaque livraison.
- `.github/workflows/ci.yml` : la même chose, automatiquement, à chaque modification si le dépôt est sur GitHub.
- `./scripts/assembler-paquet-windows.sh <dossier gmao-setram-local>` : met le paquet Windows à jour depuis ce dépôt
  (une seule source de code, plus de copie manuelle).

## 4 quinquies. Organisation du code de l'interface

`web/src/App.jsx` reste le point d'entrée, mais les **règles de calcul** en ont été sorties dans `web/src/lib/`
(fonctions pures, sans interface, couvertes par 51 tests dont les valeurs ont été vérifiées à la main) :

| Module | Contenu |
|---|---|
| `lib/dates.js` | formats, ajout de mois (fin de mois ramenée au dernier jour), échéances sans dérive |
| `lib/jours.js` | jours fériés, week-end vendredi-samedi, congés |
| `lib/echeances.js` | habilitations, contrats prestataires, péremption des appareils de mesure |
| `lib/preventif.js` | périodicités, occurrences d'un plan, génération d'un OT préventif, avancement |
| `lib/equipes.js` | rattachement équipement / intervenant à un système |
| `lib/couts.js` | coût d'un ordre de travail |
| `lib/kpi.js` | MTTR, MTBF, disponibilité, TMP/TMC, récurrence, RH, stock, AMDEC |
| `lib/unites.js` | unités d'exploitation et abréviations |

Une modification d'une règle de calcul se fait dans ces fichiers et se vérifie par `npm test` sans ouvrir l'application.

## 4 quater. Référentiels partagés (systèmes, arborescence, jours fériés)

Chaque système, sous-système et jour férié est **une ligne** en base (avant : une fiche unique par référentiel).
Deux administrateurs qui modifient deux éléments différents ne se gênent donc plus ; le conflit n'apparaît que si
les deux modifient **le même** élément. Seules les lignes modifiées sont enregistrées.

- Migration **automatique** au démarrage du serveur (`003_referentiels_en_lignes.sql`) : vos systèmes, sous-systèmes
  et jours fériés existants sont convertis, l'ancienne fiche est retirée. Rien à faire ; le script est rejouable.
- Après la mise à jour, les utilisateurs doivent **recharger la page** (F5) pour récupérer la nouvelle version de l'interface.
- Identifiants des lignes : système `CFO` · en-tête d'arborescence `CFO` · sous-système `CFO.SST` · jour férié `md:01-01` / `date:2026-03-20`.

## 4 ter. Import de données depuis Excel

Réservé au **super administrateur** : *Administration → Import de données (Excel)*.

1. **Télécharger le modèle** : un classeur avec une feuille par type de données (Équipements, Sous-équipements,
   Articles du magasin, Intervenants, Habilitations, Prestataires, Organismes, Appareils de mesure, Contrôles
   réglementaires), une notice « Lisez-moi » et la liste des unités / systèmes / sous-systèmes autorisés
   (générée à partir de **vos** référentiels). Les listes déroulantes (unité, rôle, catégorie, périodicité…) sont intégrées.
2. **Remplir** les feuilles utiles (les autres peuvent rester vides). Colonnes marquées `*` = obligatoires. Dates en `JJ/MM/AAAA`.
   Les **codes sont créés automatiquement** (`CFO.ALG.SST.01`, `P-001`, `EXT-01`, `ORG-01`, `M-01`, `R-01`) : colonne « Code » vide.
3. **Charger** le fichier : contrôle complet *avant* tout enregistrement, avec un tableau récapitulatif
   (nouveaux / déjà présents / mis à jour) et la liste des erreurs **par feuille, ligne et colonne**
   (téléchargeable en Excel). S'il reste une erreur, **rien n'est importé**.
4. **Confirmer** : l'import s'exécute dans **une seule transaction** (tout ou rien) et est inscrit au journal d'audit.

Règles :
- **Rejouable sans doublon** : ce qui existe déjà est reconnu (par code, sinon par désignation) et ignoré.
  Des désignations identiques dans un même fichier (3 portillons « Portillon ») restent 3 éléments distincts.
- Mode **« Ajouter et mettre à jour »** : seules les cellules **renseignées** modifient l'existant (une cellule vide ne
  supprime rien). Les sous-équipements, mouvements de stock, congés, etc. déjà enregistrés sont conservés.
- Le **stock** d'un article n'est pris en compte qu'à sa création (mouvement initial « Achat ») ; ensuite il évolue par
  les achats, sorties et retours.
- Habilitations : ajoutées à celles qui existent ; la mise à jour d'une habilitation existante exige le mode « mettre à jour ».
- Limites : 20 000 lignes par feuille, 15 Mo, format `.xlsx`.
- Un organisme inconnu (appareils de mesure, contrôles) n'est pas bloquant : avertissement, valeur enregistrée telle quelle.

## 5. API

Toutes les requêtes d'écriture portent l'en-tête `X-Requested-With: gmao` (voir `web/src/api.js`).

| Méthode | Route | Usage |
|---|---|---|
| POST | `/api/auth/login` · `/logout` · `/change-password` | session |
| GET | `/api/auth/me` · `/api/config` | utilisateur courant, unités |
| GET | `/api/data/:collection?unit=&since=` | lecture (filtrée par droits) ; `since` = changements depuis une date |
| PUT | `/api/data/:collection/:id` | créer/modifier `{unit, system, data, version}` |
| DELETE | `/api/data/:collection/:id` | suppression logique |
| POST | `/api/import` | import Excel multi-collections, transaction unique (super admin) : `{onConflict, dryRun, collections}` |
| POST | `/api/data/:collection/next-code` | réserve 1..200 numéros `{unit, variant?, count?}` → `{codes: [...]}` |
| POST | `/api/data/:collection/bulk` | import en masse (super admin) |
| GET/POST/PUT/DELETE | `/api/users` · `/api/users/audit/log` | administration (super admin) |

## 6. Exploitation

```bash
./scripts/backup.sh                       # sauvegarde manuelle
0 2 * * * /opt/gmao-setram-server/scripts/backup.sh   # cron quotidien (root)
./scripts/restore.sh /var/backups/gmao/gmao_AAAA-MM-JJ_HHMM.sql.gz [/var/backups/gmao/gmao_files_AAAA-MM-JJ_HHMM.tar.gz]
docker compose logs -f app                # journaux
git pull && docker compose up -d --build  # mise à jour
```
**Copiez régulièrement `/var/backups/gmao` hors du serveur** (autre machine, NAS) : une sauvegarde sur le même disque ne protège pas d'une panne disque.

## 7. Tests

```bash
cd server && npm install
DATABASE_URL=postgres://... JWT_SECRET=<32+ car.> npm test    # base de test : le schéma est réinitialisé !
```
36 tests de bout en bout (validés sur PostgreSQL 16 et sur la base embarquée) (connexion, verrouillage, droits par unité/système/volet, conflits, audit avant/après, numérotation : formats, 25 demandes simultanées, droits, changement d'année ; import : droits, idempotence, simulation, tout-ou-rien, 3 000 lignes ; migration des référentiels ; photos : contenu, droits, limites…).

## 8. Interface (dossier `web/`)

L'application d'origine a été portée **telle quelle** (mêmes écrans, mêmes exports Excel) dans un projet Vite/React
compilé : plus de CDN ni de Babel dans le navigateur, **fonctionne sans Internet**. Le résultat compilé est déjà
fourni dans `server/public/` : le déploiement ne nécessite pas Node côté web.

Changements par rapport au fichier HTML :
- **Connexion, mot de passe provisoire, comptes** : via l'API (le stockage local des comptes a disparu).
- **Données** : tous les `useState` de données sont remplacés par `useSynced` (`web/src/sync.js`) : chargement au
  démarrage, enregistrement automatique de chaque création / modification / suppression, rafraîchissement des
  modifications des autres utilisateurs toutes les 15 s, nouvelle tentative automatique si le réseau coupe,
  avertissement avant de quitter la page si des modifications ne sont pas parties.
- **Conflits** : si quelqu'un d'autre a modifié le même élément, le serveur fait foi et un message rouge s'affiche.
- **Base vierge** : les données de démonstration ne sont plus chargées. Au premier démarrage, le super administrateur
  initialise automatiquement les référentiels par défaut (systèmes, arborescence, jours fériés, organismes).

Modifier l'interface puis recompiler :
```bash
cd web && npm install
npm run dev      # développement (proxy vers http://localhost:3000)
npm test         # 168 tests (calculs, mobile, impression, photos, QR codes, démo, site statique : dates, préventif, habilitations, KPI ; synchronisation, référentiels, connexion, onglets, numérotation, import Excel : lecture de vrais .xlsx, erreurs, rejeu, interface)
npm run build    # écrit dans ../server/public ; puis : docker compose up -d --build
```

## 9. Limites connues (v1)

- **Codes encore générés côté poste** : seuls les référentiels saisis par les administrateurs (équipements et
  sous-équipements `SYS.UNITÉ.SOUS.NN`, mesures `M-`, contrôles `R-`, organismes `ORG-`, prestataires `EXT-`).
  En cas de saisie simultanée, la seconde personne est prévenue (« ce code existe déjà »). Les documents d'exploitation
  (DI, OT, DS, BS, BR, décharges, plans, articles) sont numérotés par le serveur (voir § 4 bis).
- **Jours fériés** : la liste par défaut couvre 2026 et 2027 (fêtes fixes + dates religieuses prévisionnelles, à confirmer selon l'observation de la lune). Prévoir d'ajouter 2028 et au-delà dans l'onglet Intervenants.
- **Rafraîchissement** des données des autres utilisateurs toutes les 15 s (pas de temps réel instantané).
- **Données réelles** (équipements, personnel, stock) à saisir ou importer : l'import en masse existe côté API
  (`POST /api/data/:collection/bulk`, super administrateur) mais n'a pas encore d'écran.
- **Pilote conseillé** : valider avec 2-3 comptes de test (1 super admin, 1 par profil de droits) avant d'ouvrir aux 7 unités.
