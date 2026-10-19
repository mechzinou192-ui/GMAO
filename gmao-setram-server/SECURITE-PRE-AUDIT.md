# GMAO SETRAM — Dossier de pré-audit sécurité

**Version de l'application : 1.12** · Public : RSSI, DSI, prestataire d'audit

Ce dossier prépare l'**audit de sécurité externe** (test d'intrusion et revue de code) demandé avant toute mise en production. Il récapitule ce qui est en place, ce qui a été contrôlé lors du développement, et ce que l'auditeur doit vérifier. **Il ne remplace pas l'audit externe**, qui n'a pas été réalisé.

---

## 1. Contrôles réalisés pendant le développement

| Contrôle | Résultat (19/10/2026) |
|---|---|
| Tests automatiques serveur (authentification, droits, conflits, import, photos, fenêtre de chargement, compteurs) | 39 / 39 réussis |
| Tests automatiques interface | 178 / 178 réussis |
| Analyse statique (ESLint : variables non définies, code mort) | 0 erreur |
| `npm audit` dépendances de **production** — serveur | 0 vulnérabilité |
| `npm audit` dépendances de **production** — interface | 0 vulnérabilité (bibliothèque `uuid` utilisée par l'export Excel forcée en version corrigée 11.1.1) |
| `npm audit` dépendances de **développement** — interface | 15 alertes (Vite 5, Vitest 2 et leurs dépendances) : outils de construction et de test, **non livrés en production**. Montée de version Vite / Vitest à planifier |

---

## 2. Mesures de sécurité en place

| Domaine | Mesure |
|---|---|
| Authentification | Mots de passe hachés (bcrypt, coût 12) ; aucun mot de passe par défaut ; changement obligatoire au premier accès ; 10 caractères minimum avec lettre et chiffre |
| Force brute | Verrouillage du compte après 5 échecs ; limitation du débit des connexions par adresse IP |
| Session | Cookie `HttpOnly`, `Secure`, `SameSite=Strict`, 8 h ; invalidée si le compte est désactivé ou le mot de passe changé |
| Autorisations | Contrôle **côté serveur** à chaque requête, par unité / système / module ; lecture filtrée ligne par ligne ; pré-filtre SQL par unité |
| CSRF | En-tête `X-Requested-With` obligatoire sur toutes les requêtes API |
| Injection | Requêtes SQL paramétrées uniquement |
| XSS / en-têtes | CSP stricte (aucun script ni ressource externe, police embarquée) ; HSTS ; `nosniff` ; `frame-ancestors 'none'` ; React échappe les contenus affichés |
| Fichiers | Photos contrôlées par leur **contenu** (JPEG / PNG / WebP), 10 Mo, 12 par élément, nom aléatoire, servies en `sandbox` |
| Traçabilité | Journal d'audit : connexions, échecs, créations, modifications (avant / après), suppressions, imports, photos |
| Intégrité | Verrou optimiste (conflit 409) ; numérotation attribuée par le serveur ; suppression logique |
| Secrets | Variables d'environnement uniquement ; valeurs d'exemple refusées au démarrage |
| Exécution | Image Docker en utilisateur non privilégié ; service systemd durci |

---

## 3. Périmètre demandé à l'auditeur

**Test d'intrusion (boîte grise, 3 à 5 jours) :**
1. Authentification : force brute, énumération de comptes, fixation et vol de session, réinitialisation de mot de passe.
2. **Contrôle d'accès** (priorité) : avec un compte limité (une unité, un système, un module), tenter de lire et modifier les données d'une autre unité, d'un autre système ou d'un autre module — API `/api/data/*`, `/api/files`, `/api/import`, numérotation.
3. Élévation de privilège vers le super administrateur (`/api/users`).
4. Injections (SQL, JSON, en-têtes) et XSS stockée (désignations, commentaires, noms de fichiers).
5. Téléversement de fichiers : contournement du contrôle de type, fichiers polyglottes, volume.
6. Configuration HTTPS du reverse proxy (protocoles, suites, certificats) et en-têtes.
7. Déni de service applicatif : imports volumineux, requêtes sans fenêtre de chargement.

**Revue de code ciblée (1 à 2 jours) :** `server/src/auth.js`, `rights-core.js`, `records.js`, `files.js`, `importer.js`, `users.js`.

**Livrables attendus :** rapport classé par criticité, preuves, recommandations, puis contre-audit après corrections.

---

## 4. Points ouverts à arbitrer par le RSSI

| Sujet | État | Piste |
|---|---|---|
| Annuaire d'entreprise (AD / LDAP), SSO, double authentification | Non pris en charge | À développer si la politique l'exige (priorité si plus de 50 comptes) |
| Antivirus sur les photos | Contrôle de format seulement | Analyse du volume `files` par l'antivirus de l'entreprise |
| Chiffrement au repos | Non géré par l'application | Chiffrement des disques et des sauvegardes côté infrastructure |
| Exposition Internet | Non recommandée | Intranet / VPN ; sinon WAF et audit préalable obligatoire |
| Données personnelles | Noms, matricules, taux horaires, habilitations | Avis du DPO / juriste (loi 18-07) avant le pilote |
| Notifications e-mail | Absentes | Si ajoutées : serveur SMTP interne, aucun contenu sensible dans les messages |

---

## 5. Préparation de l'audit

- [ ] Environnement de recette identique à la production (même proxy, même configuration), **sans données réelles**
- [ ] Mode démonstration (`DEMO=1`) **désactivé**
- [ ] 4 comptes de test : super administrateur, responsable 2 unités, technicien 1 système, exploitation
- [ ] Code source et ce dossier remis à l'auditeur
- [ ] `scripts/verifier-installation.sh` exécuté sans échec
- [ ] Sauvegarde faite avant l'audit, restauration testée après
