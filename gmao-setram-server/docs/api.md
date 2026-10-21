# API — GMAO SETRAM

Base : `/api` · Format : JSON · Session : cookie `gmao_token` (httpOnly) posé par `/auth/login`.

## Règles communes

| Règle | Détail |
|---|---|
| En-tête obligatoire | `X-Requested-With: gmao` sur toutes les requêtes (protection CSRF) — sinon 403 |
| Identifiant de requête | `X-Request-Id` (8 à 64 caractères `A-Za-z0-9-`) accepté, sinon généré ; toujours renvoyé dans la réponse et présent dans le journal |
| Format d'erreur | `{ "error": { "code": "CODE_STABLE", "message": "…", "details": …, "requestId": "…" } }` + champs complémentaires éventuels (`current` sur un conflit) ; pour compatibilité, un `code` métier est aussi présent au premier niveau |
| Codes | 200, 201, 400 `BAD_REQUEST`, 401 `UNAUTHENTICATED`, 403 `FORBIDDEN`, 404 `NOT_FOUND`, 409 `CONFLICT` / `EXISTS`, 413 `PAYLOAD_TOO_LARGE`, 415, 423 `LOCKED`, 429 `RATE_LIMITED`, 500 `INTERNAL_ERROR`, 503 |
| Limitation de débit | En-têtes `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` sur toutes les réponses limitées ; au dépassement : 429 + `Retry-After` (secondes) |
| Taille du corps | 2 Mo (25 Mo pour `/import`, 10 Mo par photo) |
| Erreur serveur | Message générique + `requestId` ; le détail est dans le journal uniquement |

### Limites (variables d'environnement, valeurs par défaut)

| Niveau | Clé de comptage | Défaut | Variable |
|---|---|---|---|
| Global (toute l'API) | utilisateur connecté, sinon adresse IP | 600 / 60 s | `RATE_LIMIT_GLOBAL_MAX`, `RATE_LIMIT_WINDOW_SEC` |
| Écritures (POST, PUT, PATCH, DELETE) | utilisateur, sinon IP | 300 / 60 s | `RATE_LIMIT_WRITE_MAX` |
| Coûteuses (import Excel, envoi de photos) | utilisateur | 30 / 60 s | `RATE_LIMIT_COSTLY_MAX` |
| Connexion | adresse IP | 30 / 15 min | `RATE_LIMIT_AUTH_MAX`, `RATE_LIMIT_AUTH_WINDOW_MIN` |
| Connexion (par compte visé) | identifiant | verrouillage 15 min après 5 échecs | — |
| Supervision `/live`, `/ready`, `/health` | — | **non limitées** | — |

### Une action = un seul effet

| Situation | Comportement |
|---|---|
| Création d'une DI, d'un OT, d'une DS… | Le numéro est **réservé par le serveur** (`next-code`), puis l'objet est écrit par `PUT` sur ce numéro : renvoyer la même requête ne crée pas de second objet (409 `EXISTS`) |
| Modification | `PUT` avec `version` : un rejeu après succès renvoie 409 `CONFLICT` (aucune double écriture) |
| Double clic | L'interface n'exécute qu'une création à la fois (testé) |
| Import Excel | Rejouer le même fichier ne crée aucun doublon (identifiants métier, `onConflict: skip`) |

---

## Supervision (publiques)

| Méthode | Route | Rôle | Réponse |
|---|---|---|---|
| GET | `/live` | Le processus répond | `200 {"ok":true}` |
| GET | `/ready` | La base répond | `200 {"ok":true}` ou `503` |
| GET | `/health` | Identique à `/ready` (utilisée par le contrôle de santé Docker et la supervision existante) | idem |

## Authentification

| Méthode | Route | Rôle requis | Corps | Réponses |
|---|---|---|---|---|
| POST | `/auth/login` | public (limite « connexion ») | `{ "id": "k.belaid", "password": "…", "remember": false }` | 200 `{ user }` + cookie · 401 identifiants incorrects (même message que le compte existe ou non) · 423 compte verrouillé · 429 |
| POST | `/auth/logout` | — | — | 200 |
| GET | `/auth/me` | connecté | — | 200 `{ user: { id, nom, role, superAdmin, droits, mustChangePw } }` · 401 |
| POST | `/auth/change-password` | connecté | `{ "current": "…", "next": "…" }` (10 caractères min., lettre + chiffre) | 200 · 400 · 401 |

Exemple d'erreur :
```json
{ "error": { "code": "UNAUTHENTICATED", "message": "Identifiant ou mot de passe incorrect.", "requestId": "4f2aa75a-4e7d-453a-bcbf-5b9a8ca351a5" } }
```

## Données métier

`:collection` ∈ `equipements, dis, bts, planning, compteurs_eq, pieces, dss, bs, brs, decharges, intervenants, prestataires, mesures, controles, organismes, systemes, arborescence, feries`. Droits : voir `rights-core.js` (volet d'écriture et volets de lecture par collection, filtrage par unité et système).

| Méthode | Route | Rôle requis | Description |
|---|---|---|---|
| GET | `/data/:collection` | lecture du volet | Liste **filtrée par droits** (`items`, `serverTime`). Paramètres : `since=ISO` (changements depuis, suppressions incluses), `unit=…`, `fenetre=N` (mois, 3 à 240 : DI / OT clos depuis plus de N mois exclus) |
| PUT | `/data/:collection/:id` | écriture du volet sur l'unité / le système | Crée (sans `version`) ou modifie (avec `version`). Corps : `{ "unit": "Alger", "system": "CFO", "data": {…}, "version": 3 }`. 409 `EXISTS` / `CONFLICT` avec `current` |
| DELETE | `/data/:collection/:id` | écriture | Suppression logique (contenu conservé dans l'audit) |
| POST | `/data/:collection/next-code` | écriture | Réserve 1 à 200 numéros : `{ "unit": "Alger", "variant": "prev", "count": 5 }` → `{ "codes": ["OT-PREV-ALG-2026-0012", …] }` |
| POST | `/data/:collection/bulk` | super administrateur | Écriture en lot `{ items: [{ id, unit, system, data }] }` (20 000 max, une transaction) |

Exemple :
```http
PUT /api/data/dis/DI-ALG-2026-0042
{ "unit": "Alger", "system": "CFO", "data": { "code": "DI-ALG-2026-0042", "eq": "CFO.ALG.SST.01", "etat": "À Transmettre" } }
→ 200 { "id": "DI-ALG-2026-0042", "unit": "Alger", "system": "CFO", "data": {…}, "version": 1, … }
```

## Import Excel

| Méthode | Route | Rôle | Corps | Réponses |
|---|---|---|---|---|
| POST | `/import` | super administrateur (limite « coûteuses » ; 100 000 lignes par collection et 100 Mo par défaut : `IMPORT_MAX_LIGNES`, `IMPORT_MAX_MO`, exposés par `GET /config`) | `{ "collections": { "equipements": [{ id, unit, system, data }] }, "dryRun": true, "onConflict": "skip" \| "update" }` | 200 `{ dryRun, totals: { created, updated, skipped }, collections }` · 400 · 500 (rien n'est écrit) |

## Repartir de zéro (mise en service)

| Méthode | Route | Rôle | Corps | Réponses |
|---|---|---|---|---|
| POST | `/admin/reinitialiser` | super administrateur (limite « coûteuses ») | `{ "confirmation": "REPARTIR DE ZERO", "sauvegardeFaite": true, "referentiels": false, "numerotation": true }` | 200 `{ reinitialisation, collections: { nom: n }, total, numerotation }` · 400 (confirmation / sauvegarde) · 403 · 500 (rien n'est modifié) |

Une transaction : copie dans `records_archive`, suppression logique (`deleted=true`, `version+1`, visible des autres
navigateurs à la synchronisation suivante), photos des DI / OT masquées, compteurs de numérotation remis à zéro si
`numerotation`. Comptes utilisateurs et `audit_log` jamais modifiés. Action `reinitialisation` dans le journal d'audit.

## Pièces jointes (photos)

| Méthode | Route | Rôle | Description |
|---|---|---|---|
| POST | `/files?collection=dis\|bts&recordId=…&name=…` | écriture sur la DI / l'OT (limite « coûteuses ») | Corps binaire JPEG / PNG / WebP, 10 Mo max, 12 par élément → 201 `{ id, name, … }` · 409 maximum atteint · 413 · 415 |
| GET | `/files?collection=…&recordId=…` | lecture | `{ files: [...] }` |
| GET | `/files/:id` | lecture | Contenu (en-têtes `nosniff`, CSP `sandbox`) |
| DELETE | `/files/:id` | écriture | Suppression (fichier effacé du disque, audit conservé) |

## Comptes (super administrateur)

| Méthode | Route | Corps / paramètres |
|---|---|---|
| GET | `/users` | — |
| POST | `/users` | `{ id, nom, role, password, superAdmin, droits: { "Alger": { systems: ["CFO"], volets: [0,1,2], kpi?: [...] } } }` → 201 · 409 identifiant pris |
| PUT | `/users/:id` | mêmes champs, `password` = réinitialisation (changement exigé, sessions coupées) |
| DELETE | `/users/:id` | — (pas son propre compte) |
| GET | `/users/audit/log?limit=…` | Journal d'audit |

## Divers

| Méthode | Route | Rôle | Description |
|---|---|---|---|
| GET | `/config` | connecté | Liste des unités configurées |
| GET | `/demo` | public | 404 hors mode démonstration |
