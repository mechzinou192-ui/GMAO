# Runbook — exploitation de la GMAO SETRAM

Procédures courtes pour l'exploitant. Détails d'installation : `DOSSIER-DSI.md`. Commandes données pour l'installation **Docker Compose** (dossier `/opt/gmao-setram-server`) ; équivalents systemd entre parenthèses.

## 1. Démarrer, arrêter, redémarrer

```bash
docker compose up -d            # démarrer (systemctl start gmao)
docker compose stop app         # arrêt propre : les requêtes en cours se terminent (systemctl stop gmao)
docker compose restart app      # redémarrer l'application seule
docker compose ps               # état ; « healthy » = l'application répond et la base est joignable
```

## 2. Vérifier que tout va bien

| Contrôle | Commande | Attendu |
|---|---|---|
| Application vivante | `curl -sk https://GMAO_HOST/api/live` | `{"ok":true}` |
| Base joignable | `curl -sk https://GMAO_HOST/api/ready` | `{"ok":true}` (503 si la base est arrêtée) |
| Installation complète | `INSECURE=1 ./scripts/verifier-installation.sh https://GMAO_HOST` | aucun `[ÉCHEC]` |

Supervision : sonder `/api/ready` toutes les minutes ; alerte après 3 échecs consécutifs.

## 3. Retrouver une erreur en une minute

Chaque réponse porte un en-tête `X-Request-Id` et chaque message d'erreur serveur affiche une **référence** (« Communiquez la référence … »).

```bash
docker compose logs app | grep '<référence>'                  # (journalctl -u gmao | grep '<référence>')
docker compose logs app | grep '"level":"error"' | tail -20     # dernières erreurs serveur (avec la pile)
docker compose logs app | grep 'limite de débit atteinte'       # abus ou limite trop basse
```

| Symptôme | Couche | Piste |
|---|---|---|
| Écran incorrect, bouton sans effet, rien dans le journal | Interface | Console du navigateur (F12) ; vider le cache |
| Message « Vous n'avez pas le droit… » (403) | Serveur — droits | Vérifier unité / système / module du compte (Administration) |
| « … modifié par un autre utilisateur » (409) | Serveur — concurrence | Normal : refaire la modification |
| « Trop de requêtes » (429) | Serveur — limitation | Si fréquent pour des utilisateurs légitimes : augmenter `RATE_LIMIT_*` dans `.env`, puis `docker compose up -d` |
| Erreur 500 avec référence | Serveur | Rechercher la référence dans le journal |
| 503 sur `/api/ready` | Base | `docker compose ps db`, `docker compose logs db`, espace disque |

## 4. Comptes

| Besoin | Procédure |
|---|---|
| Mot de passe oublié | Administration › Comptes › compte › nouveau mot de passe provisoire (changement exigé à la connexion) |
| Compte verrouillé (5 échecs) | Attendre 15 min, ou réinitialiser le mot de passe |
| Départ d'un agent | Désactiver le compte (session coupée immédiatement) ; ne pas supprimer (traçabilité) |
| Plus aucun super administrateur ne peut se connecter | `docker compose exec app node src/reinitialiser-admin.js` : mot de passe provisoire affiché une fois, compte réactivé et déverrouillé, opération inscrite au journal d'audit |

## 5. Sauvegarde et restauration

```bash
./scripts/backup.sh                       # base + photos dans backups/ (planifier chaque nuit par cron)
./scripts/restore.sh backups/<fichier>    # restauration (arrête l'application pendant l'opération)
```

**Tester la restauration** sur un serveur de recette au moins une fois par trimestre.

## 6. Mise à jour et retour arrière

1. `./scripts/backup.sh` (**obligatoire**).
2. Déposer la nouvelle version, conserver l'ancien dossier (`/opt/gmao-setram-server.prev`).
3. `docker compose up -d --build` — les migrations de base s'appliquent automatiquement au démarrage (journal : `"msg":"migration appliquée"`).
4. Contrôles du § 2.

**Retour arrière** : `docker compose down` → remettre l'ancien dossier → `./scripts/restore.sh <sauvegarde de l'étape 1>` → `docker compose up -d --build`. Les migrations sont additives : on ne les « défait » pas, on restaure la sauvegarde.

## 7. Secrets

| Secret | Rotation | Effet |
|---|---|---|
| `JWT_SECRET` | Modifier `.env` puis `docker compose up -d` | Toutes les sessions sont fermées (reconnexion) |
| `DB_PASSWORD` | `ALTER USER gmao PASSWORD '…'` dans la base, puis `.env`, puis `docker compose up -d` | Aucun pour les utilisateurs |
| Secret exposé (dépôt, message, capture) | **Immédiatement** : rotation comme ci-dessus + vérifier le journal d'audit | — |

## 8. Réglages sans modification du code (`.env`)

`SESSION_HOURS`, `LOG_LEVEL`, `RATE_LIMIT_*`, `SHUTDOWN_TIMEOUT_SEC`, `UNITS` (liste des unités) : modifier `.env` puis `docker compose up -d`. Une valeur invalide empêche le démarrage avec un message explicite (`docker compose logs app`).
