# Décisions techniques — GMAO SETRAM

Format : **décision** — raison — alternative écartée. Ajouter une ligne à chaque nouveau choix ; ne pas réécrire l'historique.

## Socle

| # | Décision | Raison | Alternative écartée |
|---|---|---|---|
| D1 | **Node.js 22 LTS + Express 4** pour le serveur | Application web classique (comptes, saisie, tableaux de bord) ; même langage que l'interface | Python / FastAPI (pas de traitement de données lourd côté serveur : l'Excel est lu dans le navigateur) |
| D2 | **React 18 + Vite + Tailwind** pour l'interface | Écosystème stable, construction rapide, aucun serveur nécessaire pour le site de démonstration | Framework serveur (Next.js) : inutile pour une application interne |
| D3 | **PostgreSQL 16** en production ; **PGlite** (PostgreSQL embarqué) en mode local | Même SQL partout ; essai sans installation sur un poste Windows | SQLite (dialecte différent, double maintenance) |
| D4 | **JavaScript (non TypeScript)**, contrôlé par ESLint (références non définies, code mort) et 229 tests | Le code existant fonctionne et est testé ; une migration TypeScript serait une réécriture sans gain fonctionnel immédiat | TypeScript `strict` : à envisager si l'équipe de maintenance de la DSI le demande, module par module |
| D5 | Une **table générique `records`** (JSONB) + colonnes de droits (`unit`, `system`) et de concurrence (`version`) | Nombreuses fiches métier qui évoluent souvent (référentiels SETRAM) ; une seule API, un seul contrôle de droits, un seul audit | Une table par entité (≈ 18 tables, autant de routes et de migrations à chaque évolution métier) |
| D6 | Unités, systèmes, sous-systèmes, jours fériés, organismes **en base** (référentiels) ; liste des unités aussi réglable par `UNITS` | Ajouter une unité ou un système = une ligne, pas une modification du code | Listes codées dans l'interface |
| D7 | États métier (DI : À transmettre / Transmis / Traité ; OT : En cours / En attente pièce / Clôturé…) **dans le code** | Ensemble fermé, stable, porteur de règles (clôture, déblocage) ; le paramétrer compliquerait sans besoin réel | Table d'états paramétrable |

## Sécurité et robustesse

| # | Décision | Raison | Alternative écartée |
|---|---|---|---|
| S1 | Session par **cookie httpOnly signé** (JWT), `SameSite=Strict`, `Secure` en HTTPS, 8 h ; invalidation par `token_version` | Le JavaScript n'accède jamais au jeton ; désactiver un compte coupe sa session immédiatement | Jeton d'accès + jeton de rafraîchissement : complexité inutile pour une application interne à session de travail |
| S2 | CSRF : en-tête **`X-Requested-With`** obligatoire + `SameSite=Strict` | Une page tierce ne peut pas ajouter cet en-tête sans autorisation CORS (aucune n'est accordée) | Jeton CSRF synchronisé |
| S3 | **Pas de CORS** (interface et API sur la même origine) | Rien à autoriser, rien à mal configurer | Liste d'origines |
| S4 | Droits **unité × système × volet** vérifiés côté serveur à chaque requête + **pré-filtre SQL** par unité | L'interface n'est qu'un confort ; un utilisateur ne peut lire / écrire hors de son périmètre (testé) | Contrôle uniquement côté interface |
| S5 | Mots de passe **bcrypt coût 12** | Standard éprouvé, bibliothèque pure JavaScript (pas de compilation native dans l'image) | argon2id (dépendance native) |
| S6 | **Limitation de débit** : `express-rate-limit` (bibliothèque maintenue), 4 niveaux (global, écritures, coûteuses, connexion), toutes les valeurs en variables d'environnement, clé = utilisateur sinon IP ; `/live`, `/ready`, `/health` exemptées | Anti-abus et anti-force brute ; un poste consomme ~70 requêtes / minute (actualisation des listes), d'où le défaut global de 600 | Valeurs codées en dur |
| S7 | Compteurs de débit **en mémoire** | Une seule instance de l'application (voir DOSSIER-DSI § 11) | Redis : à ajouter **si** plusieurs instances un jour (sinon chaque instance compterait séparément) |
| S8 | Adresse IP réelle lue **uniquement** derrière un proxy déclaré (`TRUST_PROXY`) | Un client ne peut pas usurper son adresse avec `X-Forwarded-For` (testé) | Confiance systématique aux en-têtes |
| S9 | Compte visé **verrouillé 15 min après 5 échecs** + limite par IP ; même message que le compte existe ou non | Contre la force brute distribuée (changement d'IP) et l'énumération de comptes | Limite par IP seule |
| S10 | Photos : type vérifié **par le contenu**, 10 Mo, 12 par élément, nom aléatoire, servies en `sandbox` | Aucun fichier actif (HTML, SVG, exécutable) ne peut être servi | Confiance à l'extension |
| S11 | Dépendance `uuid` (via `exceljs`) **forcée en 11.1.1** (`overrides`) | Corrige l'alerte `npm audit` de production sans changer de bibliothèque Excel | Rester sur la version vulnérable (non exploitable ici, mais alerte d'audit) |

## Une action = un seul effet (idempotence)

| # | Décision | Raison | Alternative écartée |
|---|---|---|---|
| I1 | **Numéros attribués par le serveur** (`next-code`, compteur en transaction) puis écriture par **`PUT` sur ce numéro** | Un double envoi ou un rejeu ne peut pas créer deux DI / OT : le second reçoit 409 `EXISTS` ; une modification rejouée reçoit 409 `CONFLICT` (verrou `version`) | Table `idempotency_keys` + en-tête `Idempotency-Key` sur chaque POST : redondante ici (aucun POST de création métier, aucun paiement, aucun e-mail) — **à ajouter si** un effet externe apparaît (e-mail, SMS, interface ERP) |
| I2 | L'interface n'exécute **qu'une création à la fois** (`unSeul`) | Première barrière contre le double clic (testée) | — |
| I3 | Import **tout ou rien** en une transaction, rejouable sans doublon | Reprise de données sûre | Import ligne à ligne |

## API et données

| # | Décision | Raison | Alternative écartée |
|---|---|---|---|
| A1 | Routes **non versionnées** (`/api/...`) | Un seul client (l'interface livrée avec le serveur, même version) | `/api/v1` : à introduire le jour où un client externe (ERP, application mobile) consommera l'API |
| A2 | **Format d'erreur unique** `{ error: { code, message, details, requestId } }` produit par un intercepteur (`http.js`) | Mise au format de toutes les routes existantes sans les réécrire ; `code` métier conservé aussi au premier niveau pour compatibilité | Réécriture de chaque route |
| A3 | Listes **non paginées** mais **fenêtre de chargement** (DI / OT clos depuis plus de 24 mois exclus par défaut, `?fenetre=`) + historique complet à la demande | Les indicateurs (MTBF, MTTR, disponibilité) sont calculés sur des listes complètes dans le navigateur ; la fenêtre borne le volume sans casser ces calculs | Pagination serveur : imposerait de déplacer tous les calculs d'indicateurs côté serveur (chantier dédié si le volume l'exige) |
| A4 | `/health` = `/ready` (base joignable) ; `/live` = processus | `/health` est déjà utilisée par le contrôle de santé Docker, la supervision et le DOSSIER-DSI : son sens n'est pas changé | Changer le sens de `/health` (casse la supervision existante) |
| A5 | Migrations **additives**, jamais modifiées ; retour arrière = restauration de la sauvegarde prise avant la mise à jour (`docs/runbook.md`) | Les migrations n'effacent aucune donnée ; une restauration est plus sûre qu'un « down » partiel | Scripts « down » pour chaque migration |

## Exploitation et qualité

| # | Décision | Raison | Alternative écartée |
|---|---|---|---|
| O1 | **Journal JSON** sur la sortie standard (`logger.js`), une ligne par requête API (`requestId`, méthode, chemin sans paramètres, statut, durée, utilisateur) | Lisible par `docker compose logs`, journald et tout outil de collecte ; aucune donnée sensible ni corps de requête | Bibliothèque de journalisation (pino) : non nécessaire pour ce volume |
| O2 | Message de création du compte `admin` laissé **en texte** | La procédure DSI le retrouve par `grep "super administrateur"` ; il n'apparaît qu'une fois | Ligne JSON |
| O3 | **Arrêt propre** : refus des nouvelles connexions, fin des requêtes en cours, fermeture de la base, arrêt forcé après `SHUTDOWN_TIMEOUT_SEC` | Une mise à jour ne coupe pas une saisie en cours | `process.exit` immédiat |
| O4 | **CI GitHub Actions** (tests, PostgreSQL réel, analyse, compilation, audit, secrets, construction Docker et démarrage complet) + `scripts/verifier.sh` équivalent hors Docker | Preuve automatique à chaque modification ; le script local permet la même vérification sans GitHub | Vérification manuelle |
| O5 | Détection de secrets par **gitleaks** (`.gitleaks.toml` : exceptions documentées pour les valeurs fictives de test / démo) | Outil standard, gratuit, exécuté en conteneur | Action GitHub sous licence |
| O6 | Graphiques en **SVG sans bibliothèque** | CSP stricte (aucun script externe), poids réduit, palette validée (contraste, daltonisme) | Bibliothèque de graphiques (≈ 400 Ko) |
| O7 | Police **Montserrat embarquée** (`@fontsource`) | Charte SETRAM sans appel externe | Google Fonts (bloqué par la CSP, dépendance Internet) |
| O8 | **Pas de formateur automatique (Prettier) ni de crochets pre-commit** pour l'instant | Reformater ~6 000 lignes produirait un écart massif sans valeur et masquerait l'historique ; la CI bloque déjà toute erreur d'analyse ou de test | Prettier + husky : à activer au moment où la DSI reprend la maintenance du code (une seule passe de formatage, isolée dans un commit dédié) |
| O9 | Couverture mesurée (`npm run test:coverage`) mais **pas de seuil bloquant** dans la CI | Règles métier déjà couvertes à 96 % (serveur) et 99,7 % (`web/src/lib`) ; l'affichage est vérifié par des tests de parcours | Seuil global de 80 % sur l'interface (les écrans y descendraient artificiellement) |

## Assistant GMAO sans IA externe (v1.17)

**Choix** : l'assistant comprend la question par mots-clés et **calcule** la réponse (recherche, comptages, moyennes)
dans le navigateur, sur les données déjà autorisées pour l'utilisateur. Pas de modèle de langage.
**Pourquoi** : aucune donnée (pannes, noms, temps des intervenants) ne sort de SETRAM, pas d'accès Internet ni de
clé payante, réponses traçables (chaque chiffre vient d'une DI / d'un OT cliquable), rien à valider par le RSSI / DPO.
**Limite** : questions hors des types prévus (panne, intervenant, équipement, stock, situation) → recherche de panne
par mots-clés. **Quand revoir** : si la DSI met à disposition un modèle de langage hébergé chez SETRAM (ex. Ollama),
il pourra reformuler ces réponses calculées sans changer leur source.

## Profils vérifiés par le serveur ; notifications ; e-mail facultatif (v1.18)

**Choix** : le profil (colonne `users.role`) fixe ce que la personne peut faire, les droits (`users.droits`) fixent où.
Les règles sont dans `server/src/profils-core.js`, pures et partagées avec la démonstration, et appliquées à chaque
`PUT` / `DELETE` : masquer un bouton ne suffit pas. La validation DG est recalculée par le serveur (personne ne se valide
soi-même). Les notifications sont créées par le serveur après l'enregistrement (table `notifications`), l'e-mail est
facultatif (`nodemailer`, version figée, transport désactivé tant que `SMTP_HOST` est vide, accès fichiers / URL coupés,
texte court sans détail technique). **Pourquoi** : besoin exprimé (technicien sans clôture, validation DG, délégation des
comptes révocable) et règle « droits vérifiés côté serveur ». **Quand revoir** : annuaire d'entreprise (rôles AD / LDAP),
ou circuit de validation plus riche (plusieurs niveaux).
