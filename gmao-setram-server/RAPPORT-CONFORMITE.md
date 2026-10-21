# GMAO SETRAM — Rapport de conformité aux règles d'ingénierie

**Version 1.16.2 · contrôles exécutés le 21/10/2026** · Public : DSI, RSSI, futur mainteneur

Ce rapport compare l'application aux règles du cahier d'ingénierie remis à la DSI (rôle « ingénieur senior »). Il dit ce qui est conforme, ce qui est volontairement différent (et pourquoi), et ce qui n'a pas pu être vérifié. Les chiffres ci-dessous sont **les résultats réels** des commandes exécutées, pas des estimations.

---

## 1. Résultats réels des contrôles

| Contrôle | Commande | Résultat |
|---|---|---|
| Tests serveur (authentification, droits, conflits, import, photos, fenêtre de chargement, compteurs, limitation de débit, format d'erreur, supervision, configuration) | `cd server && npm test` | **46 / 46 réussis** |
| Couverture du serveur | `npm run test:coverage` | **96,4 %** des lignes · 84,9 % des branches · 93,9 % des fonctions |
| Tests interface (règles métier, synchronisation, écrans, site de démonstration complet, bundle minifié) | `cd web && npm test` | **208 / 208 réussis** (21 fichiers) |
| Couverture des règles métier de l'interface (`lib/`, `sync.js`, `api.js`, import Excel, numérotation) | `vitest --coverage` | **95,1 %** des lignes · 85,9 % des branches |
| Couverture de toute l'interface (écrans compris) | `npm run test:coverage` | 69,6 % des lignes (les écrans sont vérifiés par les parcours de bout en bout du site de démonstration) |
| Analyse du code (références non définies, code mort) | `npm run lint -- --max-warnings=0` | **0 erreur, 0 avertissement** |
| Compilation de l'application et du site de démonstration | `npm run build`, `npm run build:demo` | **Réussies** |
| Audit des dépendances de production (serveur et interface) | `npm audit --omit=dev` | **0 vulnérabilité** |
| Détection de secrets (gitleaks) | CI | **Non exécutée ici** (outil non installé, registre Docker inaccessible) — exécutée par la CI à chaque envoi |
| Démarrage complet `docker compose up` + parcours HTTPS | CI | **Non exécuté ici** : le moteur Docker démarre dans l'environnement de développement, mais le téléchargement des images (`postgres`, `caddy`, `node`) est bloqué par le réseau. La CI le fait à chaque envoi (construction, attente des contrôles de santé, connexion, arrêt propre) |

Pour tout relancer en une commande (hors Docker) : `./scripts/verifier.sh`.

---

## 2. Conformité règle par règle

| Règle | État | Détail |
|---|---|---|
| 3 couches séparées (interface → API → base) | ✅ | Seul le serveur accède à PostgreSQL ; l'interface ne parle qu'à l'API |
| Simplicité (aucune dépendance inutile) | ✅ | Serveur : 8 dépendances ; graphiques sans bibliothèque ; décisions dans `docs/decisions.md` |
| Valeurs variables hors du code | ✅ | Unités (`UNITS`), limites, durée de session, niveau de journal : variables d'environnement ; systèmes, sous-systèmes, jours fériés, articles : en base |
| Variables d'environnement validées au démarrage | ✅ | `config.js` est le seul à lire l'environnement ; valeur invalide ou secret d'exemple = refus de démarrer avec message clair (testé) |
| `.env.example` commenté, `.gitignore` | ✅ | Ajoutés (le `.env.example` manquait alors que la procédure le citait) |
| Sécurité par défaut, droits vérifiés côté serveur | ✅ | Par unité / système / module, à chaque requête, lecture filtrée ligne par ligne ; tests d'accès hors périmètre (anti-IDOR) |
| Mots de passe, sessions, CSRF, en-têtes | ✅ | bcrypt ; cookie `HttpOnly` / `Secure` / `SameSite=Strict` ; en-tête anti-CSRF ; CSP stricte, HSTS |
| Limitation de débit sur toute l'API | ✅ | Global, écritures, opérations coûteuses, connexion ; réglable par `RATE_LIMIT_*` ; 429 + `Retry-After` + en-têtes `RateLimit-*` ; supervision exemptée ; verrouillage du compte après 5 échecs (testé) |
| Une action = un seul effet | ✅ (autre méthode) | Numéros attribués par le serveur + écriture sur ce numéro : un rejeu ne crée jamais de doublon (409) ; une création à la fois côté interface. Pas de table `Idempotency-Key` : voir § 3 |
| Format d'erreur unique, jamais de détail technique | ✅ | `{ error: { code, message, details, requestId } }` ; les erreurs 500 affichent une référence à communiquer (testé) |
| Erreur localisable en une minute | ✅ | Identifiant de requête (`X-Request-Id`) envoyé par l'interface, renvoyé et journalisé ; journal JSON une ligne par requête ; procédure dans `docs/runbook.md` |
| `/health`, `/ready`, arrêt propre | ✅ | `/api/live`, `/api/ready`, `/api/health` ; arrêt : fin des requêtes en cours puis fermeture de la base (SIGTERM / SIGINT) |
| Verrou anti-conflit, suppression logique, audit | ✅ | Colonne `version` (409), suppression logique, journal avant / après |
| Migrations versionnées, index | ✅ | `server/src/migrations/001` à `006`, jamais modifiées ; index sur unité, date de modification, état |
| Docker : utilisateur non privilégié, contrôle de santé, sans secret | ✅ | Voir `server/Dockerfile`, `docker-compose.yml` |
| CI : tests, analyse, compilation, audit, secrets, Docker | ✅ | `.github/workflows/ci.yml` (dont tests sur un vrai PostgreSQL 16) |
| Documentation `docs/` | ✅ | `architecture.md`, `api.md`, `decisions.md`, `runbook.md` |
| Interface : 4 états (chargement, erreur, vide, succès), boutons bloqués pendant l'envoi | ✅ | Écran de chargement, erreurs serveur affichées, listes vides signalées, une création à la fois |

---

## 3. Écarts volontaires (et pourquoi)

Le cahier d'ingénierie est écrit pour un **nouveau** projet. Pour une application déjà en place et testée, il dit aussi : « ne réécris pas ce qui fonctionne » et « simplicité d'abord ». Ces écarts sont donc des choix, chacun documenté dans `docs/decisions.md` avec la condition qui le ferait changer :

| Règle du cahier | Choix retenu | Raison | Quand le revoir |
|---|---|---|---|
| Typage strict TypeScript | JavaScript + analyse du code + 229 tests | Une conversion de tout le code serait une réécriture à risque, sans gain fonctionnel | Si l'équipe de maintenance de la DSI travaille en TypeScript |
| API versionnée `/api/v1` | `/api/...` | Un seul client, livré avec le serveur | Dès qu'un système externe (ERP, application mobile) consomme l'API |
| Listes paginées | Fenêtre de chargement (DI / OT clos depuis plus de 24 mois exclus) + historique à la demande | Les indicateurs sont calculés sur des listes complètes | Si une unité dépasse quelques dizaines de milliers d'OT ouverts ou récents |
| Table `Idempotency-Key` | Numérotation par le serveur + écriture idempotente | Aucun paiement, e-mail ni appel externe aujourd'hui | Dès qu'une notification e-mail ou une interface externe est ajoutée |
| Compteurs de limitation partagés (Redis) | En mémoire | Une seule instance du serveur | Si la DSI déploie plusieurs instances |
| Structure `frontend/ backend/ database/` | `web/ server/` (migrations dans `server/src/migrations`) | Renommer casserait les scripts, la CI et le dossier DSI déjà remis | Lors d'une refonte majeure |

---

## 4. Comment tester soi-même (10 minutes)

Sur l'installation de recette (ou le site de démonstration) :

1. **Connexion et blocage** : se tromper **6 fois** de mot de passe sur un compte → message « compte verrouillé, réessayez dans quelques minutes ».
2. **Double clic** : *Maintenance corrective* › **Nouvelle DI**, remplir, **double-cliquer** sur « Créer la DI » → **une seule** DI créée, avec un seul numéro.
3. **Droits** : se connecter avec un compte limité à une unité et un système → aucune donnée d'une autre unité n'apparaît, même en changeant l'adresse dans le navigateur.
4. **Conflit** : ouvrir la même DI dans deux navigateurs, la modifier dans les deux → le second reçoit un message clair, rien n'est écrasé en silence.
5. **Erreur retrouvable** : `docker compose logs app | grep <référence>` avec la référence affichée dans un message d'erreur → la ligne du journal apparaît.
6. **Supervision** : `curl -k https://gmao.setram.local/api/ready` → `{"ok":true}`.
7. **Arrêt propre** : `docker compose restart app` pendant l'utilisation → les requêtes en cours se terminent, l'interface renvoie automatiquement les modifications en attente dès que le serveur répond à nouveau (le journal affiche `"serveur arrêté"` puis le redémarrage).

---

## 5. Ce qui n'a pas pu être vérifié ici

- **Démarrage complet avec Docker** (`docker compose up`) et parcours HTTPS de bout en bout : vérifiés **uniquement par la CI**. À constater lors de la première installation par la DSI (procédure : `DOSSIER-DSI.md` § 4 et § 9).
- **Détection de secrets** : exécutée par la CI uniquement.
- **Charge** (nombre d'utilisateurs simultanés), **test d'intrusion**, **affichage sur vrais téléphones** : non réalisés — voir `SECURITE-PRE-AUDIT.md` et `PLAN-PILOTE.md`.

---

## 6. Points à surveiller avant la mise en production

1. Faire tourner la CI une première fois sur le dépôt de la DSI (GitHub) et vérifier qu'elle est verte, **y compris l'étape Docker**.
2. Restaurer une sauvegarde sur un serveur de recette **avant** la mise en service (`docs/runbook.md` § 5).
3. Audit de sécurité externe (`SECURITE-PRE-AUDIT.md`) et avis du DPO sur les données personnelles.
4. Régler `TRUST_PROXY` selon le reverse proxy réel (sinon la limitation par adresse IP compte mal).
5. Superviser `/api/ready` et surveiller les lignes `"limite de débit atteinte"` du journal pendant le pilote (ajuster `RATE_LIMIT_*` si des utilisateurs légitimes sont bloqués).
