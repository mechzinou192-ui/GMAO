# GMAO SETRAM — Dossier d'hébergement et d'exploitation (DSI)

**Version de l'application : 1.9.0** · Public : DSI / RSSI / administrateurs système · Langue : français

Ce document permet à la DSI d'**héberger, sécuriser, sauvegarder, superviser et mettre à jour** l'application sur son
infrastructure. Il dit aussi, sans détour, **ce qui a été vérifié et ce qui ne l'a pas été** (§ 12).

---

## 1. En bref

| | |
|---|---|
| **Nature** | Application web (GMAO : demandes d'intervention, bons de travail, préventif, magasin, indicateurs) pour 7 unités |
| **Architecture** | Navigateur → reverse proxy HTTPS → application Node.js → base PostgreSQL. Aucun autre composant |
| **Accès** | Intranet (recommandé) ; utilisable sur téléphone / tablette (navigateur) |
| **Connexions sortantes** | **Aucune.** Pas de CDN, pas de police externe, pas de service tiers : l'application fonctionne sans accès Internet |
| **Authentification** | Comptes locaux (mot de passe haché). **Pas d'annuaire AD/LDAP ni de SSO** dans cette version (§ 10) |
| **Données** | Fiches équipements, DI, BT, stocks, personnel de maintenance (nom, matricule, taux horaire, habilitations), photos |
| **Instances** | **Une seule instance** (pas de haute disponibilité intégrée, § 11) |
| **Dépendances** | 8 paquets Node côté serveur ; **0 vulnérabilité connue** (`npm audit`, 13/10/2026) ; licences permissives (MIT, ISC, BSD, Apache-2.0) |

### Schéma des flux

```
 Poste utilisateur (navigateur)
        │  HTTPS 443  (TLS 1.2/1.3)
        ▼
 Reverse proxy (nginx ou Caddy)  ── redirige 80 → 443, en-têtes de sécurité, limite 11 Mo
        │  HTTP, réseau local uniquement  (127.0.0.1:3000 ou réseau Docker interne)
        ▼
 Application Node.js (port 3000)  ── API + fichiers de l'interface
        │                      └─── disque : photos (volume /data/files  ou  /var/lib/gmao-setram/files)
        │  PostgreSQL 5432, réseau local uniquement
        ▼
 Base PostgreSQL 16
```

### Ports et flux réseau à ouvrir

| Port | Sens | Ouverture |
|---|---|---|
| **443/TCP** | utilisateurs → proxy | Intranet (ou VPN) uniquement, **jamais** vers Internet sans décision RSSI |
| **80/TCP** | utilisateurs → proxy | Facultatif : sert uniquement à rediriger vers HTTPS |
| 3000/TCP | proxy → application | **Local à la machine** (`HOST=127.0.0.1`) ou réseau Docker interne. **Ne pas exposer** |
| 5432/TCP | application → base | **Local** uniquement. **Ne pas exposer** |

---

## 2. Dimensionnement

| Ressource | Minimum | Recommandé | Mesuré |
|---|---|---|---|
| CPU | 1 vCPU | 2 vCPU | — |
| Mémoire | 2 Go | 4 Go | Application ≈ **75–82 Mo** avec le jeu de démonstration (68 équipements, 86 DI, 93 BT) |
| Disque | 20 Go | 40 Go | Photo ≈ 200–400 Ko après réduction sur le téléphone : 50 photos/jour ≈ 4–6 Go/an |
| Réseau | 100 Mb/s | — | — |

> **Charge** : aucun test de charge n'a été réalisé. Pour une équipe de maintenance de quelques dizaines d'utilisateurs,
> la configuration recommandée est très largement suffisante, mais le **pilote** (§ 13) doit le confirmer.

---

## 3. Choix d'installation

| | **A. Docker Compose** (recommandé) | **B. Sans Docker** (Linux) |
|---|---|---|
| Quand | La DSI exploite déjà Docker | Pas de Docker autorisé / préférence systemd |
| Éléments | `docker-compose.yml`, `Caddyfile` | `deploy/gmao.service`, `deploy/nginx.conf.example`, `deploy/gmao.env.example` |
| Sauvegarde | `scripts/backup.sh` | `scripts/backup-sans-docker.sh` |

Windows Server : voir § 14 (pistes, non testé). La version « Windows local » (`gmao-setram-local-windows.zip`) est un
**outil d'essai pour un poste isolé** (base embarquée, sans HTTPS) : **ne pas l'utiliser en exploitation**.

---

## 4. Installation A — Docker Compose

Prérequis : Docker Engine ≥ 24 avec le plugin Compose v2, un nom DNS interne (ex. `gmao.setram.local`).

```bash
# 1. Déposer le dossier gmao-setram-server sur le serveur, par exemple dans /opt/gmao-setram-server
cd /opt/gmao-setram-server
cp .env.example .env
nano .env            # renseigner les 4 valeurs ci-dessous

# 2. Générer des secrets aléatoires
openssl rand -base64 48 | tr -d '\n'     # → JWT_SECRET
openssl rand -base64 24 | tr -d '\n'     # → DB_PASSWORD

# 3. Construire et démarrer
docker compose build
docker compose up -d
docker compose ps                         # app doit être « healthy » après ~40 s
docker compose logs app | head -30        # le mot de passe du compte admin y figure (§ 7)
```

Fichier `.env` :

| Variable | Rôle |
|---|---|
| `GMAO_HOST` | Nom DNS de l'application (ex. `gmao.setram.local`) |
| `DB_PASSWORD` | Mot de passe de la base (obligatoire ; la valeur d'exemple est **refusée**) |
| `JWT_SECRET` | Clé de signature des sessions, **≥ 32 caractères** (la valeur d'exemple est **refusée**) |
| `ADMIN_INITIAL_PASSWORD` | Facultatif. Sinon un mot de passe aléatoire est affiché une fois dans les journaux |

Le fichier `docker-compose.yml` ne publie **que** les ports 80 et 443 (Caddy). La base et l'application ne sont
joignables que sur le réseau interne de Compose. Les journaux sont limités à 50 Mo par service.

**HTTPS** — deux possibilités :
1. *Caddy avec le certificat de l'entreprise* (recommandé) : déposer `gmao.crt` (chaîne complète) et `gmao.key` dans `./certs/`,
   décommenter la ligne `./certs:/certs:ro` dans `docker-compose.yml` et monter `Caddyfile.certificat-entreprise` à la place de `Caddyfile`.
2. *Déjà un reverse proxy d'entreprise* (F5, nginx, HAProxy…) : supprimer le service `proxy` et faire pointer le proxy existant
   vers `app:3000` (publier ce port **sur 127.0.0.1 uniquement**). Voir § 6 pour les en-têtes à transmettre.

> Le `Caddyfile` livré utilise `tls internal` (autorité de certification interne de Caddy) : les navigateurs affichent
> un avertissement tant que cette autorité n'est pas distribuée aux postes. Utiliser le certificat de l'entreprise en exploitation.

---

## 5. Installation B — Sans Docker (Linux)

Testé sur Ubuntu 24.04, Node.js 22 LTS, PostgreSQL 16, nginx 1.24.

```bash
# 1. Paquets
apt install -y postgresql nginx
#    Node.js 22 LTS : dépôt officiel NodeSource ou nvm (la version du paquet de la distribution est souvent trop ancienne)
node -v     # doit afficher v22.x (minimum v20)

# 2. Utilisateur système et dossiers
useradd --system --home /opt/gmao-setram --shell /usr/sbin/nologin gmao
mkdir -p /opt/gmao-setram /var/lib/gmao-setram/files /etc/gmao-setram /var/backups/gmao
cp -r gmao-setram-server/* /opt/gmao-setram/
cd /opt/gmao-setram/server && npm ci --omit=dev          # installation reproductible (fichier de verrouillage)
chown -R gmao:gmao /var/lib/gmao-setram

# 3. Base PostgreSQL
sudo -u postgres psql -c "CREATE USER gmao WITH PASSWORD 'MOT_DE_PASSE_ROBUSTE'" \
                      -c "CREATE DATABASE gmao OWNER gmao"

# 4. Configuration (secrets)
cp /opt/gmao-setram/deploy/gmao.env.example /etc/gmao-setram/gmao.env
nano /etc/gmao-setram/gmao.env                            # DATABASE_URL, JWT_SECRET
chown root:gmao /etc/gmao-setram/gmao.env && chmod 640 /etc/gmao-setram/gmao.env

# 5. Service
cp /opt/gmao-setram/deploy/gmao.service /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now gmao
journalctl -u gmao -n 30                                  # mot de passe admin initial, « serveur démarré »

# 6. Reverse proxy HTTPS (§ 6)
cp /opt/gmao-setram/deploy/nginx.conf.example /etc/nginx/conf.d/gmao.conf
nano /etc/nginx/conf.d/gmao.conf                          # nom DNS + chemins du certificat
nginx -t && systemctl reload nginx
```

`HOST=127.0.0.1` dans `gmao.env` limite l'écoute de l'application à la machine (vérifié : le port 3000 n'est alors pas joignable depuis le réseau).

---

## 6. HTTPS, DNS et reverse proxy

- Un **certificat TLS valide** (autorité de l'entreprise ou publique) et un **nom DNS interne** sont nécessaires. HTTPS est obligatoire :
  les cookies de session sont marqués `Secure` et l'application envoie l'en-tête HSTS.
- Le fichier `deploy/nginx.conf.example` est **testé** : redirection 80→443, TLS 1.2/1.3, taille d'envoi 11 Mo, plafond de débit.
- Quel que soit le proxy, il **doit transmettre** `Host`, `X-Forwarded-For` et `X-Forwarded-Proto`, et l'application doit être
  lancée avec `TRUST_PROXY=1` (un proxy devant l'application). Sans cela, la limitation des tentatives de connexion
  s'appliquerait à l'adresse du proxy au lieu de celle de l'utilisateur.
- **Vérifié** derrière nginx : 36 tentatives de connexion échouées avec un en-tête `X-Forwarded-For` falsifié à chaque essai →
  les 30 premières reçoivent `401`, les suivantes `429` : l'usurpation de l'adresse ne contourne pas la limitation.
- Taille d'envoi : l'application refuse les fichiers > 10 Mo (vérifié derrière nginx : 9 Mo accepté, 11 Mo refusé).

---

## 7. Premier démarrage

1. Au premier démarrage, l'application **crée les tables** (migrations automatiques, versionnées) et le compte **`admin`**.
2. Son mot de passe est `ADMIN_INITIAL_PASSWORD` s'il est défini, sinon un mot de passe **aléatoire affiché une seule fois** dans les journaux
   (`docker compose logs app` ou `journalctl -u gmao`). **Le changement est exigé à la première connexion.**
3. Se connecter, puis : *Administration → Comptes et droits d'accès* pour créer les comptes (droits par **unité / système / volet**).
4. *Administration → Import de données (Excel)* : charger équipements, articles, intervenants, prestataires… (modèle fourni, contrôle complet avant enregistrement).
5. Lancer `scripts/verifier-installation.sh` (§ 9).

> Les valeurs par défaut (systèmes, arborescence technique, jours fériés 2026-2027) sont créées à la première connexion du compte `admin`.
> Les **jours fériés** et les **dates religieuses** (Aïd, etc.) doivent être mis à jour chaque année dans l'onglet *Intervenants*.

---

## 8. Variables d'environnement

| Variable | Défaut | Description |
|---|---|---|
| `NODE_ENV` | — | `production` en exploitation |
| `DATABASE_URL` | — | `postgres://utilisateur:mot_de_passe@hôte:5432/gmao`. **Sans cette variable, l'application bascule en mode « base embarquée » (essai)** : à ne pas utiliser en exploitation |
| `JWT_SECRET` | — | **Obligatoire**, ≥ 32 caractères, aléatoire. Le changer déconnecte tous les utilisateurs |
| `PORT` | 3000 | Port d'écoute |
| `HOST` | toutes interfaces (Docker) | `127.0.0.1` hors Docker, derrière un proxy local |
| `COOKIE_SECURE` | `true` | Cookie de session réservé à HTTPS |
| `TRUST_PROXY` | 0 | `1` = un reverse proxy devant l'application |
| `FILES_DIR` | `<DATA_DIR>/files` | Dossier des photos (volume persistant) |
| `SESSION_HOURS` | 8 | Durée d'une session |
| `ADMIN_INITIAL_PASSWORD` | aléatoire | Mot de passe initial du compte `admin` |
| `UNITS` | 7 unités SETRAM | Liste des unités, séparées par des virgules, pour en ajouter |
| `DEMO` | — | **Ne jamais définir en exploitation** (mode démonstration : comptes publics) |

Valeurs fixes : verrouillage d'un compte après **5** échecs pendant **15 minutes** ; mot de passe de **10 caractères minimum** ;
maximum **30** tentatives de connexion par adresse et par fenêtre de 15 minutes.

---

## 9. Contrôle de l'installation

```bash
./scripts/verifier-installation.sh https://gmao.setram.local
VERIF_ID=admin VERIF_PW='…' ./scripts/verifier-installation.sh https://gmao.setram.local   # avec contrôle de session
# Certificat auto-signé de test : INSECURE=1 ; serveur non encore dans le DNS : RESOLVE=gmao.setram.local:443:10.0.0.5
```

Le script **ne modifie aucune donnée** et vérifie notamment : disponibilité et base de données (`/api/health` → 503 si la base
est injoignable), HTTPS, redirection 80→443, HSTS, **protocoles TLS 1.0/1.1 refusés**, validité du certificat (alerte à 30 jours),
en-têtes de sécurité (CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy), absence d'`X-Powered-By`, accès refusé sans session,
protection CSRF, **mode démonstration inactif**, cookies `HttpOnly` / `Secure` / `SameSite`. Code de sortie ≠ 0 si un contrôle échoue : utilisable en supervision.

Supervision : surveiller `GET /api/health` (200 `{"ok":true}`) ; l'image Docker embarque un `HEALTHCHECK`.

---

## 10. Sécurité

### Mesures en place (vérifiées par des tests automatiques)

- **Mots de passe** hachés (bcrypt, coût 12) ; aucun mot de passe par défaut ; changement obligatoire à la première connexion.
- **Verrouillage** du compte après 5 échecs ; **limitation de débit** des connexions par adresse IP.
- **Sessions** : cookie `HttpOnly`, `Secure`, `SameSite` ; désactiver un compte **coupe sa session immédiatement**.
- **CSRF** : toute écriture exige l'en-tête `X-Requested-With` (refus 403 sinon).
- **En-têtes** : Content-Security-Policy stricte (aucun script ni ressource externe), HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy.
- **Droits** vérifiés **côté serveur** par unité / système / volet (l'interface n'est qu'un confort) ; un utilisateur ne peut ni lire ni écrire hors de son périmètre.
- **Requêtes SQL paramétrées** (aucune concaténation de données saisies).
- **Photos** : type contrôlé par le **contenu** (JPEG/PNG/WebP uniquement — ni SVG, ni HTML, ni exécutable, même renommés), 10 Mo maximum, 12 par élément,
  nommées par identifiant aléatoire sur le disque, servies avec `nosniff` et une politique `sandbox`.
- **Journal d'audit** : connexions, échecs, créations, modifications **avec valeurs avant/après**, suppressions, imports, ajouts/suppressions de photos.
- **Aucun secret dans le code** ; secrets uniquement par variables d'environnement ; valeurs d'exemple refusées au démarrage.
- **Dépendances** : installation reproductible (`npm ci`), 0 vulnérabilité connue ; l'image Docker tourne en **utilisateur non privilégié**.

### Limites connues — à arbitrer par la DSI / le RSSI

| Sujet | État | Recommandation |
|---|---|---|
| Annuaire d'entreprise (AD/LDAP), SSO, authentification à deux facteurs | **Non pris en charge** | Comptes locaux. À étudier si exigé par la politique de sécurité |
| Politique de mot de passe | 10 caractères minimum ; pas d'expiration périodique ni d'historique | Compléter par une procédure d'exploitation si nécessaire |
| Antivirus sur les photos | Aucun (contrôle de format uniquement) | Analyse antivirale du volume `files` par la solution de l'entreprise |
| Chiffrement au repos (base, photos, sauvegardes) | **Non géré par l'application** | Chiffrement disque / volume et chiffrement des sauvegardes côté infrastructure |
| Haute disponibilité | Instance unique ; photos sur disque local | Sauvegardes + procédure de restauration testée (§ 11). Voir § 11 pour le multi-instances |
| Test d'intrusion / audit de code externe | **Non réalisé** | À planifier avant ouverture au-delà de l'intranet |
| Données personnelles | Noms, matricules, **taux horaires**, habilitations (visibles des profils autorisés) | Validation par le juriste / DPO au regard de la réglementation algérienne sur les données personnelles (loi 18-07) — à confirmer par vos services |
| Exposition Internet | Non recommandée | Intranet / VPN. Si exposition : WAF, pare-feu applicatif et audit préalable |

---

## 11. Exploitation

### Sauvegarde et restauration — **à tester avant la mise en service**

Ce qu'il faut sauvegarder : **la base PostgreSQL** et **le dossier des photos**. Les deux scripts le font avec le même horodatage.

| | Docker | Sans Docker |
|---|---|---|
| Sauvegarde | `./scripts/backup.sh` → `/var/backups/gmao/gmao_AAAA-MM-JJ_HHMM.sql.gz` + `gmao_files_….tar.gz` | `./scripts/backup-sans-docker.sh` |
| Planification | `0 2 * * * /opt/gmao-setram-server/scripts/backup.sh` | `0 2 * * * /opt/gmao-setram/scripts/backup-sans-docker.sh` |
| Restauration | `./scripts/restore.sh <base.sql.gz> [<photos.tar.gz>]` | `gunzip -c base.sql.gz \| psql <base>` puis `tar -C /var/lib/gmao-setram -xzf photos.tar.gz` |

- Rétention par défaut : 30 jours (`KEEP_DAYS`). **Copier les sauvegardes hors du serveur** (autre machine / NAS) et les chiffrer.
- **Vérifié** : sauvegarde d'une base de production de test, restauration dans une base vierge, données et photos retrouvées.
  Le test de restauration sur *votre* infrastructure reste à faire une fois avant la mise en service, puis chaque trimestre.

### Journaux

L'application écrit sur la sortie standard (`docker compose logs app` / `journalctl -u gmao`). Les mots de passe n'y figurent pas.
Le **journal d'audit métier** est dans la base (table `audit_log`) et consultable par le super administrateur (*Administration*).

### Mise à jour

1. **Sauvegarder** (base + photos) ; noter la version actuelle.
2. Remplacer les fichiers par la nouvelle version.
3. Docker : `docker compose build && docker compose up -d` · Sans Docker : `cd server && npm ci --omit=dev && systemctl restart gmao`.
4. Les **migrations de base s'appliquent automatiquement** au démarrage (elles ajoutent ou convertissent des données, sans perte).
5. Lancer `scripts/verifier-installation.sh` ; demander aux utilisateurs de recharger la page (F5).
6. **Retour arrière** : les migrations ne sont pas réversibles ; revenir à la version précédente suppose de **restaurer la sauvegarde** de l'étape 1.

### Rotation des secrets

- `JWT_SECRET` : le remplacer puis redémarrer ; tous les utilisateurs devront se reconnecter.
- Mot de passe de la base : le modifier dans PostgreSQL **et** dans `.env` / `gmao.env`, puis redémarrer.

### Cycle de vie des composants

Node.js 22 LTS est la version testée ; planifier le passage à la LTS suivante avant la fin de support de la 22 (à vérifier sur nodejs.org).
Lancer `npm audit --omit=dev` dans `server/` au moins chaque trimestre. PostgreSQL 16 : suivre le calendrier de support de postgresql.org.

### Plusieurs instances (pour information)

Les sessions sont portées par un jeton signé (aucune session stockée côté serveur), mais les photos sont sur disque local : plusieurs instances exigeraient un stockage
partagé pour `FILES_DIR`. Non prévu ni testé.

---

## 12. Ce qui a été vérifié — et ce qui ne l'a pas été

| Élément | État |
|---|---|
| 36 tests automatiques du serveur (droits, conflits, import, photos, numérotation, audit…) | ✅ passent sur **PostgreSQL 16** et sur la base embarquée |
| 168 tests automatiques de l'interface (calculs KPI, préventif, écrans, import Excel, photos, QR codes) | ✅ passent |
| Installation propre depuis le fichier de verrouillage (`npm ci`) puis démarrage | ✅ |
| Application + PostgreSQL 16 + nginx 1.24 en HTTPS (certificat auto-signé), `NODE_ENV=production` | ✅ (script de contrôle : 18 contrôles réussis, 0 échec) |
| Limitation des connexions derrière nginx malgré un `X-Forwarded-For` falsifié ; limites d'envoi des photos | ✅ |
| Sauvegarde puis restauration d'une base de production de test (données + photos) | ✅ |
| Port 3000 inaccessible depuis le réseau avec `HOST=127.0.0.1` | ✅ |
| `npm audit` (dépendances de production) | ✅ 0 vulnérabilité (serveur) ; 2 de gravité *modérée* signalées côté interface (voir ci-dessous) |
| **Construction de l'image Docker et `docker compose up`** | ⚠️ **Non exécutés** (pas de Docker dans l'environnement de développement). Fichiers relus, étapes `npm ci` / démarrage reproduites hors conteneur. **À valider au premier déploiement** |
| Caddy (HTTPS, certificat d'entreprise) | ⚠️ Non testé (configuration relue) |
| Unité systemd | ⚠️ Non testée en conditions réelles (syntaxe standard, sorties de test non disponibles sans systemd) |
| Windows Server / IIS | ⚠️ Non testé |
| Affichage sur vrais téléphones, impression PDF | ⚠️ Non testés (aucun navigateur dans l'environnement de développement) |
| Charge (utilisateurs simultanés), test d'intrusion, audit de code externe | ❌ Non réalisés |

**Note sur `npm audit` (interface)** : 2 alertes *modérées* concernent le paquet `uuid` utilisé indirectement par la bibliothèque
d'export Excel (`exceljs`), exécutée **dans le navigateur** ; la faille décrite exige un appel avec un tampon fourni, ce que cette
bibliothèque ne fait pas. Risque jugé non exploitable ici ; à surveiller lors des mises à jour.

---

## 13. Recette et pilote recommandés

**Recette technique (DSI)** : § 9 sans échec ; test de restauration réussi ; certificat valide ; accès depuis un poste de chaque site ; supervision `/api/health` en place.

**Recette fonctionnelle** (compte `admin` puis comptes de test) :
1. Créer un compte avec droits limités (une unité, un système) et vérifier qu'il ne voit que son périmètre.
2. Importer un petit fichier Excel (modèle fourni) ; le recharger : aucun doublon.
3. Déclarer une DI (au téléphone), générer le BT, le clôturer, imprimer le bon (PDF).
4. Ajouter une photo à une DI ; scanner une étiquette QR d'équipement.
5. Planifier un préventif ; consulter les indicateurs (KPI).
6. Couper la base 30 secondes : `/api/health` passe en 503 puis revient ; l'application reprend sans redémarrage.

**Pilote** : 2 à 3 utilisateurs puis une unité pendant 2 à 4 semaines, avant généralisation aux 7 unités.

---

## 14. Annexes

### Windows Server (pistes — non testé)
Node.js 22 (MSI) + PostgreSQL 16 (installeur) ; exécuter `node src/start.js` comme **service** avec un gestionnaire de services (NSSM ou équivalent),
variables d'environnement identiques au § 8 ; reverse proxy HTTPS avec IIS (URL Rewrite + Application Request Routing), nginx pour Windows ou
le proxy d'entreprise, avec les en-têtes du § 6 ; sauvegardes par `pg_dump` planifié + copie du dossier des photos.

### Contenu du dossier livré

| Fichier / dossier | Rôle |
|---|---|
| `server/` | Application (API, migrations SQL, interface compilée dans `server/public`) |
| `web/` | Sources de l'interface et tests (pour la maintenance du code) |
| `docker-compose.yml`, `Caddyfile`, `Caddyfile.certificat-entreprise`, `.env.example` | Installation A |
| `deploy/` | `gmao.service`, `nginx.conf.example`, `gmao.env.example` (installation B) |
| `scripts/` | `verifier-installation.sh`, `backup.sh`, `restore.sh`, `backup-sans-docker.sh`, `verifier.sh` (tests), `assembler-paquet-windows.sh` |
| `README.md`, `CHANGELOG.md` | Documentation fonctionnelle et historique des versions |

### Composants tiers (production)
Serveur : express 4, helmet 7, pg 8, jsonwebtoken 9, bcryptjs 2, cookie-parser, express-rate-limit, @electric-sql/pglite (base embarquée, mode essai).
Interface : react 18, exceljs, qrcode. Licences : MIT, ISC, BSD-3-Clause, Apache-2.0 (une dépendance transitive à double licence MIT/GPL est utilisée sous licence MIT).

### Dépannage rapide

| Symptôme | Cause probable |
|---|---|
| `JWT_SECRET manquant` / « valeur d'exemple » au démarrage | Variable absente, trop courte (< 32) ou valeur d'exemple |
| `DATABASE_URL contient encore le mot de passe d'exemple` | `.env` non personnalisé (`DB_PASSWORD`) |
| Page blanche / erreur 502 | L'application n'est pas démarrée (`docker compose ps`, `journalctl -u gmao`) |
| Les utilisateurs sont déconnectés à chaque requête | `COOKIE_SECURE=true` mais accès en HTTP : utiliser HTTPS |
| Trop de `429` pour tous les utilisateurs | `TRUST_PROXY` non défini derrière un proxy (toutes les requêtes semblent venir du proxy) |
| `/api/health` renvoie 503 | Base PostgreSQL injoignable |
| Photos refusées (413) | Fichier > 10 Mo ; ou `client_max_body_size` du proxy trop bas |
| Compte verrouillé | 5 échecs : attendre 15 minutes, ou réinitialiser par un super administrateur |
