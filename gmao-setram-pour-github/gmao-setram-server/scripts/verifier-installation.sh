#!/usr/bin/env bash
# Contrôle d'une installation de GMAO SETRAM (à lancer par la DSI après la mise en service, puis après chaque mise à jour).
#
#   ./scripts/verifier-installation.sh https://gmao.setram.local
#   VERIF_ID=admin VERIF_PW='motdepasse' ./scripts/verifier-installation.sh https://gmao.setram.local     (contrôles avec connexion)
#   Options : INSECURE=1 (certificat auto-signé : ne pas vérifier la chaîne), RESOLVE=gmao.setram.local:443:10.0.0.5
#
# Ne modifie aucune donnée. Code de sortie : 0 = tout est bon, 1 = au moins un contrôle en échec.
set -uo pipefail
URL="${1:?Usage : $0 https://adresse-du-serveur}"; URL="${URL%/}"
HOST="${URL#*://}"; HOST="${HOST%%/*}"; HOST_ONLY="${HOST%%:*}"
CURL=(curl -s -m 15); [ "${INSECURE:-0}" = "1" ] && CURL+=(-k)
TARGET="$HOST_ONLY:443"                                   # adresse jointe par openssl
if [ -n "${RESOLVE:-}" ]; then
  RH=$(echo "$RESOLVE" | cut -d: -f1); RP=$(echo "$RESOLVE" | cut -d: -f2); RI=$(echo "$RESOLVE" | cut -d: -f3)
  CURL+=(--resolve "$RESOLVE" --resolve "$RH:80:$RI"); TARGET="$RI:$RP"
fi
ok=0; ko=0; warn=0
pass() { echo "  [ OK ]  $1"; ok=$((ok+1)); }
fail() { echo "  [ÉCHEC] $1"; ko=$((ko+1)); }
avert() { echo "  [ATTN]  $1"; warn=$((warn+1)); }
hdr() { "${CURL[@]}" -I "$1" 2>/dev/null | tr -d '\r'; }

echo "== Contrôle de $URL =="
echo "-- Disponibilité"
H=$("${CURL[@]}" "$URL/api/health"); [ "$H" = '{"ok":true}' ] && pass "l'application répond (/api/health)" || fail "/api/health ne répond pas correctement : « $H »"
P=$("${CURL[@]}" "$URL/" | grep -c '<div id="root">'); [ "$P" -ge 1 ] && pass "l'interface est servie" || fail "la page d'accueil ne contient pas l'interface"

echo "-- HTTPS"
case "$URL" in
  https://*)
    pass "adresse en HTTPS"
    R=$("${CURL[@]}" -o /dev/null -w '%{http_code} %{redirect_url}' "http://$HOST_ONLY/" 2>/dev/null)
    case "$R" in 30[1278]\ https://*) pass "HTTP redirige vers HTTPS ($R)";; *) avert "le port 80 ne redirige pas vers HTTPS (réponse : « $R »)";; esac
    HD=$(hdr "$URL/")
    echo "$HD" | grep -qi '^strict-transport-security:' && pass "en-tête HSTS présent" || fail "en-tête Strict-Transport-Security absent"
    if command -v openssl >/dev/null; then
      for v in tls1 tls1_1; do
        if echo | timeout 8 openssl s_client -connect "$TARGET" -servername "$HOST_ONLY" -$v >/dev/null 2>&1; then fail "protocole obsolète accepté : $v"; else pass "protocole obsolète refusé : $v"; fi
      done
      END=$(echo | timeout 8 openssl s_client -connect "$TARGET" -servername "$HOST_ONLY" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
      if [ -n "$END" ]; then
        J=$(( ( $(date -d "$END" +%s) - $(date +%s) ) / 86400 ))
        if [ "$J" -lt 0 ]; then fail "certificat expiré depuis $((-J)) jours"; elif [ "$J" -lt 30 ]; then avert "le certificat expire dans $J jours ($END)"; else pass "certificat valide encore $J jours"; fi
      else avert "date d'expiration du certificat non lue"; fi
    fi;;
  *) avert "adresse en HTTP : les mots de passe circulent en clair. HTTPS est obligatoire en exploitation.";;
esac

echo "-- En-têtes de sécurité"
HD=$(hdr "$URL/")
for h in content-security-policy x-content-type-options x-frame-options referrer-policy; do echo "$HD" | grep -qi "^$h:" && pass "en-tête $h" || fail "en-tête $h absent"; done
echo "$HD" | grep -qi '^x-powered-by:' && fail "X-Powered-By exposé (technologie visible)" || pass "X-Powered-By absent"
echo "$HD" | grep -i '^server:' | grep -Eqi '[0-9]+\.[0-9]+' && avert "la version du serveur web est visible dans l'en-tête Server" || pass "version du serveur web non divulguée"

echo "-- Contrôle d'accès"
C=$("${CURL[@]}" -o /dev/null -w '%{http_code}' "$URL/api/data/equipements"); [ "$C" = "401" ] && pass "les données exigent une connexion (401 sans session)" || fail "accès sans connexion : code $C (attendu 401)"
C=$("${CURL[@]}" -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{"id":"x","password":"x"}' "$URL/api/auth/login"); [ "$C" = "403" ] && pass "écriture sans en-tête anti-CSRF refusée (403)" || fail "POST sans X-Requested-With : code $C (attendu 403)"
C=$("${CURL[@]}" -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -H 'X-Requested-With: gmao' -d '{"id":"inconnu","password":"mauvais-mot-de-passe"}' "$URL/api/auth/login"); [ "$C" = "401" ] && pass "mauvais identifiants refusés (401)" || fail "connexion invalide : code $C (attendu 401)"
D=$("${CURL[@]}" -o /dev/null -w '%{http_code}' "$URL/api/demo"); [ "$D" = "404" ] && pass "mode démonstration inactif (aucun compte public)" || fail "LE MODE DÉMONSTRATION EST ACTIF (/api/demo répond $D) : à désactiver en exploitation (variable DEMO)"

if [ -n "${VERIF_ID:-}" ] && [ -n "${VERIF_PW:-}" ]; then
  echo "-- Session (compte $VERIF_ID)"
  JAR=$(mktemp); trap 'rm -f "$JAR"' EXIT
  RESP=$("${CURL[@]}" -D - -o /dev/null -c "$JAR" -X POST -H 'Content-Type: application/json' -H 'X-Requested-With: gmao' -d "{\"id\":\"$VERIF_ID\",\"password\":\"$VERIF_PW\"}" "$URL/api/auth/login" | tr -d '\r')
  if echo "$RESP" | head -1 | grep -q ' 200'; then
    pass "connexion réussie"
    CK=$(echo "$RESP" | grep -i '^set-cookie:' | head -1)
    echo "$CK" | grep -qi 'httponly' && pass "cookie de session HttpOnly" || fail "cookie de session sans HttpOnly"
    case "$URL" in https://*) echo "$CK" | grep -qi 'secure' && pass "cookie de session Secure" || fail "cookie de session sans l'attribut Secure";; esac
    echo "$CK" | grep -qi 'samesite' && pass "cookie de session SameSite" || fail "cookie de session sans SameSite"
    N=$("${CURL[@]}" -b "$JAR" "$URL/api/data/systemes" | grep -o '"id"' | wc -l); [ "$N" -ge 1 ] && pass "lecture des données avec session ($N systèmes)" || avert "aucun système lu (base vierge ? mot de passe à changer ?)"
  else fail "connexion refusée : $(echo "$RESP" | head -1)"; fi
else
  echo "-- Session : ignorée (définir VERIF_ID et VERIF_PW pour la contrôler)"
fi

echo
echo "Résultat : $ok contrôles réussis, $warn avertissement(s), $ko échec(s)."
[ "$ko" -eq 0 ]
