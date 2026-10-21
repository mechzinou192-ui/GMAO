# Journal des modifications

## 1.16.2 — imports de gros volume, FMP rangées par système
- Limites d'import relevées : **100 000 lignes par feuille** (au lieu de 20 000), fichier de **50 Mo** (au lieu de 15),
  envoi de **100 Mo** (au lieu de 25). Réglables par la DSI : `IMPORT_MAX_LIGNES`, `IMPORT_MAX_MO` (`.env`).
- Serveur : écritures de l'import **groupées par lots de 1 000** (100 000 lignes importées en ~5 s en test, au lieu
  d'une requête par ligne) ; numéros réservés par plages (lot de 1 000 par requête). Toujours tout ou rien.
- Interface : taille de l'envoi contrôlée **avant** de réserver des numéros, avec un message clair (découper le fichier).
- **FMP rangées dans un dossier par système** : choisir le dossier parent (sous-dossiers compris) ou ajouter les
  dossiers l'un après l'autre ; deux fiches de même nom dans deux dossiers (ex. `CFO/FMP_Mensuelle.xlsx` et
  `CFA/FMP_Mensuelle.xlsx`) sont départagées par le chemin du lien du planning. Compteur de lecture et répartition par dossier.
- Exemple nginx : bloc `/api/import` avec `client_max_body_size 100m` (l'ancien 11 Mo bloquait les gros imports).

## 1.16.1 — suppression directe des fiches créées par erreur
- **Arborescence** : icône ✕ au bout de chaque équipement et de chaque sous-équipement, bouton **Supprimer** dans la
  fiche équipement, entrée « Supprimer… » du clic droit. La confirmation s'ouvre directement.
- **Gestion et suivi des matériaux** : bouton **✕ Supprimer** sur chaque ligne (appareils de mesure, contrôles
  réglementaires, organismes).
- Mêmes garde-fous qu'avant : confirmation, refus motivé si l'élément est utilisé (équipement avec DI / OT / plans /
  compteurs, organisme rattaché à un appareil ou un contrôle), suppression logique tracée dans le journal d'audit.
- Sous-équipement : la suppression demande maintenant une confirmation et est refusée s'il a des DI ou OT
  (auparavant immédiate et sans contrôle). Supprimer un équipement supprime aussi ses sous-équipements (indiqué dans la confirmation).

## 1.16.0 — DS globale, retrait d'une pièce, repartir de zéro
- **DS globale** : une seule demande de sortie pour plusieurs pièces (une ligne par pièce), au lieu d'une DS par pièce.
  Depuis un OT, le bouton **« Créer une DS globale »** reprend toutes les pièces de l'OT — ou, pour un OT préventif,
  les **pièces prévues par le plan** — en ne proposant que les quantités pas encore demandées.
- Formulaire DS : ajout / **retrait de lignes**, quantité par ligne, montant estimé, pièces en rupture signalées.
  La DS part « En attente pièce » dès qu'une seule pièce manque.
- Magasin : **retrait d'une pièce d'une DS** tant que le bon de sortie n'est pas généré (l'état est recalculé ;
  retirer la dernière pièce annule la DS). Le BS reprend toutes les pièces ; son traitement décrémente le stock de chacune.
  Une DS « En attente pièce » peut être transformée en BS dès que le stock est réapprovisionné.
- Exports Excel DS / BS : une ligne par pièce (avec le code article). Les anciennes DS à une pièce restent lisibles
  sans reprise de données.
- **Administration › Repartir de zéro** (super administrateur) : vide les données (équipements, DI, OT, plans,
  compteurs, magasin, personnel, matériaux ; référentiels sur option) avant l'import des vraies données.
  Garde-fous : sauvegarde déclarée + phrase « REPARTIR DE ZERO » à recopier ; contrôle serveur ; une transaction ;
  **archivage** dans `records_archive` puis suppression logique (restaurable) ; comptes et journal d'audit conservés ;
  numérotation remise à 0001 (option). Nouvelle route `POST /api/admin/reinitialiser`, migration `006`.
- Numérotation : un code **supprimé** peut être réattribué (nécessaire pour repartir de 0001).

## 1.15.3 — suppression des fiches
- Bouton **« Supprimer »** en bas de chaque fiche modifiable : équipement, système, sous-système, DI, OT, plan préventif,
  article du magasin, intervenant, prestataire, appareil de mesure, contrôle réglementaire, organisme, compteur.
- **Confirmation** explicite ; suppression **logique** côté serveur (rien n'est effacé de la base) et tracée dans le
  journal d'audit (qui, quand, contenu supprimé). Droits identiques à la modification.
- **Refus avec la raison** tant que l'élément est utilisé : équipement avec DI / OT / plans / compteurs, système ou
  sous-système non vide, DI qui a un OT, OT clôturé (historique des indicateurs) ou avec DS, plan avec OT ouvert,
  article présent dans une DS en cours / un plan / un OT ouvert, intervenant assigné à un plan ou un OT ouvert,
  organisme utilisé, compteur utilisé par un plan.
- Supprimer un OT correctif remet sa DI « À transmettre ».

## 1.15.2 — calendrier préventif : vue « Jour »
- Option **Jour** dans la liste *Vue* (Jour / Mois / Année complète) et lien « Voir la journée » depuis l'agenda du mois.
- Feuille de route du jour : une carte par visite (équipement, plan, état, intervenants, horaire, consignation, outillage,
  consommables, FMP, liste des tâches dépliable), équipe de la journée, déclenchement / ouverture de l'OT.
- Navigation jour par jour ; **impression de la journée** (A4 paysage, colonne visa) ; jours fériés signalés.

## 1.15.1 — calendrier préventif : vue « Année complète »
- Liste déroulante **Vue : Mois / Année complète** dans *Préventif › Calendrier / Agenda*.
- Vue annuelle type PDC : une ligne par plan (équipement, périodicité, intervenants), une colonne par mois, chaque visite
  en pastille colorée selon son état (planifié, en cours, en retard, réalisé) avec son jour ; clic = ouverture du mois sur ce jour.
- Ligne **« Visites par mois »** (charge mensuelle avec histogramme) et total annuel ; navigation d'une année à l'autre.
- **Export Excel** du planning annuel (jours des visites par mois, totaux). Le filtre par intervenant s'applique.

## 1.15.0 — import du planning préventif avec les tâches des FMP
- Nouvelle feuille d'import **« Planning préventif »** : Code GMAO (ou repère), Type de visite, **Lien FMP de la visite**
  (lien hypertexte Excel ou chemin), pièces / consommables / outillage à utiliser (désignations séparées par « ; »,
  quantité facultative « x2 »), première échéance et intervenants facultatifs.
- **Étape « FMP » de l'import** : ajout des fichiers FMP (ou d'un dossier entier). Le tableau « N° / Opération » de chaque
  fiche est lu automatiquement (en-têtes fusionnés, sous-équipement, périodicité) ; chaque ligne du planning est rattachée
  à sa FMP par le nom du fichier du lien ou par la référence documentaire (ORG-CFO-IIT-FOR-0001-A).
- **Tâches du plan = opérations de la FMP** (celles de la périodicité de la visite si la fiche en distingue plusieurs).
- **Répartition automatique des intervenants** : technicien du système le moins chargé, hors congés à la date prévue ;
  modifiable ensuite dans chaque plan. Intervenants imposés possibles dans le fichier.
- Le plan et l'OT généré conservent la **référence et le lien de la FMP** (affichés dans le plan, l'OT et le bon imprimé) ;
  pièces prévues reprises dans l'OT (à demander par DS).
- Réimport sans doublon (même équipement, même visite, même FMP) ; mode « mettre à jour » pour rafraîchir les tâches.
- Tests : 194 côté interface (dont la FMP réelle ORG-CFO-IIT-FOR-0001-A comme fichier de test).

## 1.14.1 — import Excel : équipements et sous-équipements en une seule fois
- Feuille **Équipements** : nouvelle colonne facultative **« Repère »** (T1, R02…), unique dans le fichier.
- Feuille **Sous-équipements** : la colonne **« Équipement parent (repère ou code GMAO) »** accepte le repère de la feuille
  Équipements **ou** le code GMAO d'un équipement existant. Plus besoin d'importer les équipements, de relever leurs codes,
  puis d'importer les sous-équipements. Les anciens fichiers (« Code équipement parent ») restent acceptés.
- Repère en double ou inconnu : erreur claire, rien n'est importé.
- Tests : 188 côté interface.

## 1.14.0 — mise en conformité pour la DSI (exploitation, sécurité, CI, documentation)
- **`.env.example`** (manquant jusqu'ici alors que la procédure d'installation le citait) : toutes les variables, commentées ;
  `.gitignore` ; `UNITS` et les nouveaux réglages transmis par `docker-compose.yml`.
- **Configuration validée au démarrage** : une valeur invalide (limite, niveau de journal, secret d'exemple) empêche le démarrage
  avec un message clair ; plus aucune lecture de l'environnement hors de `config.js`.
- **Limitation de débit sur toute l'API** (global, écritures, opérations coûteuses, connexion), réglable par variables
  `RATE_LIMIT_*`, clé = utilisateur sinon IP, réponse 429 + `Retry-After` + en-têtes `RateLimit-*` ; supervision jamais limitée.
  L'interface conserve la modification et la renvoie après le délai (aucune perte).
- **Format d'erreur unique** `{ error: { code, message, details, requestId } }` ; jamais de détail technique côté client ;
  les erreurs 500 affichent une **référence** à communiquer.
- **Identifiant de requête** (`X-Request-Id`) envoyé par l'interface, repris dans la réponse et dans le journal.
- **Journal JSON** (une ligne par requête API et par événement), niveau `LOG_LEVEL`.
- **Supervision** : `/api/live` (processus) et `/api/ready` (base) ; `/api/health` inchangée.
- **Arrêt propre** (SIGTERM / SIGINT) : fin des requêtes en cours, fermeture de la base, arrêt forcé après `SHUTDOWN_TIMEOUT_SEC`.
- **Secours administrateur** : `node src/reinitialiser-admin.js` (mot de passe provisoire, compte réactivé, audit).
- **CI GitHub Actions** : tests (base intégrée et PostgreSQL 16), analyse sans avertissement, compilation, audit des dépendances,
  détection de secrets (gitleaks), construction Docker, démarrage complet et parcours HTTPS de bout en bout, arrêt propre.
- **Documentation** `docs/` : `architecture.md`, `api.md`, `decisions.md`, `runbook.md` ; **`RAPPORT-CONFORMITE.md`**.
- Couverture mesurable : `npm run test:coverage` (serveur et interface).
- Tests : 43 côté serveur, 186 côté interface.

## 1.13.0 — modules réorganisés, règle DS, filtre préventif, tableau de bord graphique
- **Gestion de la maintenance corrective** (remplace « Demandes d'intervention ») : onglets **DI** et **OT correctifs**
  (visibles selon les droits DI / OT).
- **Gestion des ordres de travail (OT)** : **OT préventifs uniquement** (issus d'un plan ou créés « Nouvel OT préventif »).
- **Gestion et suivi des matériaux** (nouveau module) : appareils de mesure, contrôles réglementaires et organismes,
  retirés de l'Arborescence (droits : volet Arborescence, renommé « Arborescence technique et matériaux »).
- **Règle DS / clôture** : toute DS rattachée à un OT le passe « En attente pièce » ; l'OT ne peut pas être clôturé tant
  qu'une DS n'est pas traitée (BS traité) ou annulée ; il ne repasse « En cours » que lorsque **toutes** ses DS sont soldées.
- **Préventif : filtre par intervenant** (plans, agenda, plage de déclenchement, plans au compteur).
- **Indicateurs › Tableau de bord** (nouvel onglet par défaut) : chiffres clés avec variation vs période précédente,
  activité sur 12 mois, disponibilité et MTTR mensuels (avec cible), charge préventive / corrective, pannes par système,
  top 10 des équipements, disponibilité par unité. Graphiques SVG sans bibliothèque externe, infobulles au survol
  et au clavier, tableau de données sous chaque graphe, palette validée (contraste et daltonisme).
- Tests : 182 côté interface, 39 côté serveur.

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
