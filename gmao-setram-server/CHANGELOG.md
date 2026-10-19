# Journal des modifications

## 1.12.0 — compteurs, restructuration, fenêtre de chargement, dossiers pilote et sécurité

### Restructuration du code de l'interface
- `App.jsx` (3 100 lignes) découpé en **16 modules** : un fichier par écran (`pages/`), composants communs (`ui/`), constantes,
  application connectée (`GmaoApp.jsx`). Aucun changement de comportement (tous les tests inchangés passent).
- **Analyse statique réactivée** (`.eslintrc.json` était absent) : `npm run lint` contrôle tout `src/` — 0 erreur.

### Performance : fenêtre de chargement
- Les **DI et OT clos depuis plus de 24 mois** ne sont plus chargés au démarrage (`?fenetre=24`) ; tout ce qui est ouvert reste chargé.
- Indicateurs : bandeau **« Charger l'historique complet »** quand la période commence avant la fenêtre.
- Serveur : **pré-filtre SQL par unité autorisée** avant le contrôle ligne par ligne ; index `(collection, updated_at)` et
  `(collection, etat)` (migration `005`).

### Sécurité
- Interface : dépendance `uuid` (via l'export Excel) forcée en 11.1.1 → **`npm audit` production : 0 vulnérabilité** (serveur et interface).
- **`SECURITE-PRE-AUDIT.md`** : mesures en place, contrôles faits, périmètre du test d'intrusion, points à arbitrer par le RSSI.

### Documentation
- **`GUIDE-UTILISATEUR.md`** (par profil, captures d'écran), **`PLAN-PILOTE.md`** (12 semaines, indicateurs de réussite, risques),
  générateur `scripts/generer-docs.py` (versions `.html` imprimables).

### Maintenance conditionnelle par compteur (km, heures, cycles)
- **Compteurs d'équipement** (Préventif › onglet « Compteurs ») : création, relevés datés, historique, usage moyen / jour,
  remplacement du compteur sans perte du cumul, export Excel (compteurs, relevés, plans).
- **Relevés contrôlés** : valeur numérique, jamais dans le futur, jamais inférieure au dernier relevé (sauf remplacement déclaré).
- **Plans déclenchés au compteur** : pas (ex. 30 000 km), seuil d'alerte (90 % par défaut), valeur au dernier passage ;
  états « Planifié / À déclencher / En retard », jauge de consommation, date d'échéance estimée (usage des 90 derniers jours),
  intégration au planning, à l'agenda et à la plage de déclenchement.
- **Clôture d'un OT issu d'un plan compteur** : relevé du compteur obligatoire ; il est enregistré et remet le cycle du plan à zéro.
- **Accueil** : bloc « Compteurs : plans à déclencher ».
- **Droits** : nouvelle collection `compteurs_eq` — lecture : Arborescence, OT, Préventif, Indicateurs ; saisie : OT ou Préventif
  (nouveau paramètre `writeVolets` côté serveur).
- Démonstration : 8 compteurs (rames, groupe électrogène, pont roulant) et 6 plans au compteur.
- Tests : 178 côté interface, 39 côté serveur.

## 1.11.0 — mise en page type GMAO du marché (Mainti4) et nouveaux libellés
- **Accueil (tableau de bord)** : menus favoris en tuiles de couleur, compteurs « Mes infos DI » et « Mes infos OT »,
  alertes (contrats, habilitations, stock), DI en retard (> 48 h sans OT), OT ouverts depuis plus de 7 jours,
  planning préventif des 14 prochains jours, stock critique. Chaque bloc n'apparaît que si le volet est autorisé.
- **Menu latéral en barre d'icônes sombre** (icône + libellé court), en-tête pleine largeur avec logo SETRAM,
  bandeau d'onglets (Accueil / module courant).
- **Bons de Travail (BT) → Ordres de Travail (OT)** : tous les libellés, exports Excel, impression ;
  nouveaux numéros `OT-ALG-2026-0001` / `OT-PREV-ALG-2026-0001` (le compteur continue : pas de doublon avec les anciens `BT-…`).
- **Arborescence : système EQI → ED (Équipement Dépôt)** dans les référentiels par défaut et la démonstration.
- **Magasin & Achats → Gestion de stock** ; **Intervenants → Gestion du personnel** (noms de modules et de volets de droits).
- Démonstration statique : clé de stockage `v2` (les anciennes données de démonstration du navigateur sont ignorées).
- Tests : 169 côté interface (dont l'accueil limité aux droits), 37 côté serveur.

## 1.10.0 — refonte visuelle (charte SETRAM)
- **Charte** : couleurs du logo SETRAM (bleu marine `#2A3B90`, cyan `#2DC3EA`), police **Montserrat** (corps 11 pt),
  embarquée dans l'application (`@fontsource/montserrat`, aucun appel externe : CSP inchangée).
- **Mise en page type GMAO** : menu latéral sombre groupé par domaine (Patrimoine, Maintenance, Ressources, Pilotage, Système),
  barre supérieure fixe (fil d'Ariane, sélecteur d'unité, cloche d'alertes, menu profil / déconnexion).
- Alertes (contrats, habilitations, stock critique) regroupées dans la cloche ; compteurs sur Magasin et Intervenants.
- Onglets secondaires soulignés (Arborescence, Indicateurs, Administration), tuiles d'indicateurs avec filet de couleur,
  tableaux denses (en-têtes en capitales, survol de ligne), pastilles d'état douces, fenêtres avec en-tête fixe.
- Écran de connexion scindé (présentation + formulaire), adapté au téléphone.
- Aucune logique métier modifiée. Tests : 168 côté interface, tous verts.

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
