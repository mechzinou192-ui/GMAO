#!/usr/bin/env python3
"""Génère les versions imprimables (.html autonomes) des documents Markdown du dossier.
Usage : python3 scripts/generer-docs.py   (nécessite : pip install markdown)"""
import base64, os, re, sys
try:
    import markdown
except ImportError:
    sys.exit("Module manquant : pip install markdown")
RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS = {'DOSSIER-DSI.md': 'Dossier DSI', 'GUIDE-UTILISATEUR.md': 'Guide utilisateur', 'PLAN-PILOTE.md': 'Plan de pilote', 'SECURITE-PRE-AUDIT.md': 'Pré-audit sécurité'}
CSS = ("body{font:14px/1.55 Montserrat,-apple-system,Segoe UI,Arial,sans-serif;color:#1a1a1a;max-width:960px;margin:24px auto;padding:0 18px}"
       "h1{color:#2A3B90;border-bottom:3px solid #2DC3EA;padding-bottom:6px}h2{color:#2A3B90;margin-top:34px;border-bottom:1px solid #ccd;padding-bottom:3px}h3{margin-top:22px}"
       "table{border-collapse:collapse;width:100%;margin:12px 0;font-size:13px}th,td{border:1px solid #bbb;padding:5px 8px;vertical-align:top;text-align:left}th{background:#eef0fa}"
       "code{background:#f3f3f6;padding:1px 4px;border-radius:3px;font-size:12.5px}pre{background:#f3f3f6;padding:10px 12px;border-radius:6px;overflow-x:auto;border:1px solid #dde}pre code{background:none;padding:0}"
       "blockquote{border-left:4px solid #e0a030;background:#fff8ea;margin:12px 0;padding:6px 14px}hr{border:0;border-top:1px solid #ccd;margin:26px 0}"
       "img{max-width:100%;border:1px solid #dde;border-radius:6px;margin:8px 0}"
       "@media print{body{max-width:none;margin:0;font-size:11.5px}h2{page-break-after:avoid}table,pre,img{page-break-inside:avoid}}")
def integrer_images(html):
    def rep(m):
        chemin = os.path.join(RACINE, m.group(1))
        if not os.path.isfile(chemin): return m.group(0)
        b64 = base64.b64encode(open(chemin, 'rb').read()).decode()
        return f'src="data:image/png;base64,{b64}"'
    return re.sub(r'src="([^"]+\.png)"', rep, html)
for md, titre in DOCS.items():
    src = os.path.join(RACINE, md)
    if not os.path.isfile(src): continue
    corps = markdown.markdown(open(src, encoding='utf8').read(), extensions=['tables', 'fenced_code'])
    corps = integrer_images(corps)
    out = f'<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>GMAO SETRAM — {titre}</title><style>{CSS}</style></head><body>{corps}</body></html>\n'
    open(src[:-3] + '.html', 'w', encoding='utf8').write(out)
    print(f'{md[:-3]}.html  ({len(out)//1024} Ko)')
