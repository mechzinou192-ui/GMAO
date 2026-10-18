#!/usr/bin/env bash
# Construit le SITE DE DÉMONSTRATION STATIQUE : dossier web/dist-demo/ à déposer sur un hébergeur gratuit
# (aucun serveur, aucune base de données). Voir HEBERGEMENT-GRATUIT.md.
set -euo pipefail
cd "$(dirname "$0")/../web"
npm install --no-audit --no-fund >/dev/null
npm run build:demo
echo; echo "Site prêt : $(pwd)/dist-demo  ($(du -sh dist-demo | cut -f1))"
echo "Déposez CE DOSSIER sur Netlify Drop (https://app.netlify.com/drop), Cloudflare Pages ou GitHub Pages."
