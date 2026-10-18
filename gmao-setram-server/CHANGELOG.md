# Journal des modifications

## 1.9.0 — dossier de remise à la DSI
- **`DOSSIER-DSI.md` / `.html`** : architecture, flux et ports, dimensionnement, deux modes d'installation (Docker Compose, sans Docker),
  HTTPS, variables, premier démarrage, sauvegarde / restauration, mise à jour et retour arrière, sécurité (mesures et limites),
  recette, dépannage, et **tableau de ce qui a été vérifié ou non**.
- **`scripts/verifier-installation.sh`** : contrôle d'une installation (HTTPS, TLS obsolète refusé, certificat, en-têtes, cookies, accès,
  mode démonstration inactif), sans modifier de données ; code de sortie exploitable en supervision.
- **Installation sans Docker** : `deploy/gmao.service` (systemd durci), `deploy/gmao.env.example`, `deploy/nginx.conf.example`
  (testé : nginx 1.24, TLS, limitation, envois de 10 Mo), `scripts/backup-sans-docker.sh` (sauvegarde + restauration testées sur PostgreSQL 16).
- Durcissement : image **Node 22**, installation par `npm ci` (fichier de verrouillage), `HEALTHCHECK`, journaux Docker limités,
  mot de passe de base obligatoire et **valeurs d'exemple refusées** (`DATABASE_URL` comme `JWT_SECRET`), `HOST` configurable pour
  n'écouter que sur la machine, `Caddyfile.certificat-entreprise`.
- Tests : 37 côté serveur, 168 côté interface. `npm audit` : 0 vulnérabilité côté serveur.

## 1.8.0
- **Site de démonstration statique** : dossier de 5 fichiers (1,5 Mo) à déposer sur un hébergeur gratuit, sans serveur ni base de
  données. Le serveur est simulé dans le navigateur avec la logique réelle (droits, numérotation, conflits, import tout-ou-rien,
  photos, journal). Même application, mêmes données fictives, mêmes 6 profils.
- Découpage de `rights.js` et `numbering.js` en un noyau pur (`*-core.js`) partagé avec la démonstration ; comportement du serveur inchangé.
- Guide `HEBERGEMENT-GRATUIT.md` réécrit : option 1 = site statique, option 2 = vrai serveur (Render + Neon).
- Tests : 36 côté serveur, 168 côté interface (dont le fichier minifié réellement construit : démarrage, connexion, liste des DI).

## 1.7.0
- **Démonstration en ligne** : mode `DEMO=1` (jeu de données fictives réaliste et déterministe, 6 comptes de profils différents
  affichés sur l'écran de connexion, remise à zéro périodique, gestion des comptes verrouillée), `render.yaml`,
  guide `HEBERGEMENT-GRATUIT.md` (Render + Neon, ou PC + lien temporaire Cloudflare), lanceur `DEMARRER-DEMO.bat`.
- **Robustesse PostgreSQL** : une connexion inactive coupée par l'hébergeur (base gratuite qui s'endort) ne fait plus
  tomber l'application ; délais adaptés au réveil d'une base endormie.
- **Validé sur un vrai PostgreSQL 16** : les 36 tests serveur passent aussi bien sur PostgreSQL que sur la base embarquée.
- Valeurs par défaut des référentiels déplacées dans `web/src/lib/referentiels-defaut.js`.
- Tests : 36 côté serveur, 152 côté interface.

## 1.6.0
- **Photos sur les DI et BT** : prise de vue depuis le téléphone, réduction avant envoi, miniatures, suppression. Stockage disque
  (volume `gmao_files`), contrôle du contenu côté serveur (JPEG / PNG / WebP), droits identiques à la DI / au BT, 12 photos max,
  audit, sauvegarde et restauration incluses (`backup.sh`, `restore.sh`). Migration `004_files.sql`.
- **QR codes d'équipements** : planche d'étiquettes imprimable ; le scan ouvre « Nouvelle DI » sur l'équipement
  (contrôle d'existence et de droits, adresse nettoyée). QR code relu par un décodeur dans les tests.
- Erreurs du serveur toujours en JSON lisible (envoi trop volumineux, requête invalide).
- Tests : 31 côté serveur, 146 côté interface.

## 1.5.0
- **Téléphone / tablette** : menu en tiroir, listes DI et BT en cartes, formulaires sur une colonne, champs sans zoom
  automatique sur iPhone, fenêtres adaptées, boutons plus faciles à toucher. Ordinateur inchangé.
- **Impression / PDF du bon de travail** (A4, cases de signature, texte saisi échappé contre toute injection HTML).
- **Vérifications automatiques** : `scripts/verifier.sh`, workflow GitHub Actions, script d'assemblage du paquet Windows.
- Tests : 26 côté serveur, 129 côté interface.

## 1.4.0
- **Découpage de `App.jsx`** : les règles de calcul (dates, jours fériés, habilitations et contrats, préventif,
  rattachement aux systèmes, coûts, KPI) sont déplacées dans `web/src/lib/` — 3 200 → 2 750 lignes pour `App.jsx`.
  Comportement inchangé (les 67 tests existants passent, bundle identique à 0,01 Ko près).
- **51 nouveaux tests** sur ces calculs (MTTR, MTBF, disponibilité, TMP/TMC, récurrence, charge RH, stock dormant,
  criticité AMDEC, habilitations, contrats, occurrences du préventif…), avec valeurs calculées à la main ;
  vérifié qu'ils détectent une régression volontaire.
- **Correctif — échéances mensuelles en fin de mois** : un plan préventif démarré un 29, 30 ou 31 sautait février
  (31 janvier + 1 mois = **3 mars**) et décalait toutes les échéances suivantes. Désormais 31 janv. → 28 févr. → 31 mars
  → 30 avr. Corrigé pour le calendrier, le déclenchement par plage, les alertes de congés et « prochaine échéance ».
  Les plans existants sont recalculés automatiquement ; aucune donnée à modifier.
- Tests : 26 côté serveur, 118 côté interface.

## 1.3.0
- **Référentiels en lignes** : systèmes, arborescence et jours fériés sont stockés une ligne par élément au lieu
  d'une fiche unique. Fin des conflits entre deux administrateurs qui modifient des éléments différents ; seules
  les lignes modifiées sont enregistrées. Migration automatique des données existantes (`003_referentiels_en_lignes.sql`,
  rejouable). Les utilisateurs rechargent la page après la mise à jour.
- Tests : 26 côté serveur, 67 côté interface.

## 1.2.0
- **Import Excel** (Administration → Import de données) : modèle à télécharger (9 feuilles + notice + référentiels
  de l'application + listes déroulantes), contrôle complet avant enregistrement, erreurs par feuille / ligne / colonne
  (exportables), import en une seule transaction (`POST /api/import`), journal d'audit, rejeu sans doublon,
  mode « ajouter » ou « ajouter et mettre à jour ».
- Les codes des équipements, sous-équipements, prestataires, organismes, appareils de mesure et contrôles importés
  sont créés automatiquement ; les articles reçoivent leur numéro du serveur.
- Correctif : l'unité d'un code d'équipement hors liste est reconnue avec les abréviations réellement utilisées
  (Ouargla `OUA`, Sétif `SET`, Mostaganem `MST`) ; avant, ces trois unités retombaient sur Alger dans ce cas.
- L'onglet « Administration — Accès » devient « Administration » (Comptes et droits / Import de données).
- Tests : 24 côté serveur, 55 côté interface.

## 1.1.0
- **Numérotation par le serveur** pour les DI, BT, BT préventifs, plans préventifs, DS, BS, BR, décharges et articles
  (table `counters`, migration `002_counters.sql`, route `POST /api/data/:collection/next-code`).
  Fin des doublons en cas de création simultanée ; fin des numéros calculés avec la taille de la liste
  (`DS-500+n`, `BT-3300+n+aléatoire`) qui pouvaient se répéter après une suppression.
- **Année**: les DI ne sont plus figées sur « 2026 » ; le millésime suit l'année civile (fuseau Africa/Algiers).
- **Journal d'audit détaillé** : une modification enregistre les rubriques changées (ancienne → nouvelle valeur) ;
  une suppression conserve le contenu supprimé.
- **Anti double-clic** à la création de documents ; si la numérotation échoue (réseau, droits), rien n'est créé.
- Tests : 18 côté serveur (+7), 20 côté interface (+9).
