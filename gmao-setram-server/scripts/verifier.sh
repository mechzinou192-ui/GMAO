#!/usr/bin/env bash
# Vérification complète, identique à la CI (sauf Docker) : à lancer avant chaque livraison.
#   ./scripts/verifier.sh
# Échoue (code ≠ 0) à la première étape en erreur.
set -euo pipefail
cd "$(dirname "$0")/.."
etape() { echo; echo "== $1 =="; }
etape "Serveur : installation";             (cd server && npm ci --no-audit --no-fund >/dev/null)
etape "Serveur : tests";                    (cd server && npm test 2>&1 | grep -E '^# (tests|pass|fail)')
(cd server && npm test >/dev/null 2>&1) || { echo "Tests serveur en échec"; exit 1; }
etape "Serveur : audit des dépendances";    (cd server && npm audit --omit=dev --audit-level=moderate)
etape "Interface : installation";           (cd web && npm ci --no-audit --no-fund >/dev/null)
etape "Interface : analyse du code";        (cd web && npm run lint -- --max-warnings=0)
etape "Interface : tests";                  (cd web && npm test)
etape "Interface : compilation";            (cd web && npm run build >/dev/null && echo "compilation OK")
etape "Interface : audit des dépendances";  (cd web && npm audit --omit=dev --audit-level=moderate)
etape "Détection de secrets"
if command -v gitleaks >/dev/null; then gitleaks detect --source=.. --no-git --config=../.gitleaks.toml --redact --no-banner
else echo "gitleaks non installé : étape faite par la CI (https://github.com/gitleaks/gitleaks)"; fi
echo; echo "Tout est vert."
