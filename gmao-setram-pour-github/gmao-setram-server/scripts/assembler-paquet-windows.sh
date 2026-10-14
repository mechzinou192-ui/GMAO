#!/usr/bin/env bash
# Copie le serveur et l'interface COMPILÉE de ce dépôt dans le dossier du paquet Windows, pour que les deux versions
# restent strictement identiques (plus de code recopié à la main).
#   ./scripts/assembler-paquet-windows.sh /chemin/vers/gmao-setram-local
# Prérequis : l'interface a été compilée (cd web && npm run build). Les données (dossier "donnees") ne sont pas touchées.
set -euo pipefail
cd "$(dirname "$0")/.."
DEST="${1:?Indiquez le dossier gmao-setram-local}"
[ -d "$DEST/app" ] || { echo "Dossier $DEST/app introuvable"; exit 1; }
[ -f server/public/index.html ] || { echo "Interface non compilée : lancez d'abord  cd web && npm run build"; exit 1; }
rm -rf "$DEST/app/src" && cp -r server/src "$DEST/app/src"      # tout le dossier : sous-dossiers (migrations, demo...) compris
rm -rf "$DEST/app/public" && cp -r server/public "$DEST/app/public"
cp server/package.json server/package-lock.json "$DEST/app/"
diff -rq server/src "$DEST/app/src" && diff -rq server/public "$DEST/app/public" && echo "Paquet Windows à jour (sources identiques au serveur)."
