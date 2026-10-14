#!/usr/bin/env bash
# Lance toutes les vérifications : tests du serveur, analyse du code, tests de l'interface, compilation.
# À exécuter avant chaque livraison :   ./scripts/verifier.sh
set -euo pipefail
cd "$(dirname "$0")/.."
echo "== Serveur : tests ==";        (cd server && npm install --no-audit --no-fund >/dev/null && npm test)
echo "== Interface : analyse ==";    (cd web && npm install --no-audit --no-fund >/dev/null && npm run lint)
echo "== Interface : tests ==";      (cd web && npm test)
echo "== Interface : compilation =="; (cd web && npm run build)
echo; echo "Tout est vert."
