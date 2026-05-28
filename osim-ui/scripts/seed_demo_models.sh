#!/usr/bin/env bash
# Lädt die drei kanonischen OSim2004-Beispiel-Modelle in den Account admin@osim-dev.
# Vorher: alte Modelle des Users werden entfernt, damit der Workspace sauber ist.
set -euo pipefail

API="http://localhost:8000"
EMULATOR="http://localhost:19099"
KEY="demo-api-key-for-emulator"

OTX_DIR="C:/Users/JörgWFischer/PycharmProjects/OSim2004/Vorstellung04"

# 1. Token holen
TOKEN=$(curl -s -X POST \
  "${EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${KEY}" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@osim-dev","password":"admin123","returnSecureToken":true}' \
  | python -c "import sys,json; print(json.load(sys.stdin)['idToken'])")

if [ -z "$TOKEN" ]; then
  echo "FEHLER: kein Token vom Emulator erhalten" >&2
  exit 1
fi

# 2. Alle existierenden Modelle des admins löschen
echo "Räume bestehende Modelle..."
MODELS=$(curl -s "${API}/api/v1/models" -H "Authorization: Bearer $TOKEN")
echo "$MODELS" | python -c "
import sys, json
for m in json.load(sys.stdin):
    print(m['id'])
" | while read mid; do
  [ -z "$mid" ] && continue
  echo "  - lösche $mid"
  curl -s -X DELETE "${API}/api/v1/models/${mid}" -H "Authorization: Bearer $TOKEN" > /dev/null
done

# 3. Drei Beispiel-Modelle hochladen
upload() {
  local file="$1"
  local name="$2"
  echo "Lade hoch: $name"
  curl -s -X POST "${API}/api/v1/models/upload-otx" \
    -H "Authorization: Bearer $TOKEN" \
    -F "file=@${file};type=application/octet-stream" \
    -F "name=${name}" \
    | python -c "
import sys, json
data = json.load(sys.stdin)
if 'model' in data:
    m = data['model']
    cov = data['wire']['coverage']
    print(f\"  ✓ id={m['id']}  coverage: loaded={cov['loaded']} skipped={cov['skipped']}\")
else:
    print(f\"  ✗ FEHLER: {data}\")
"
}

upload "${OTX_DIR}/Dummy.otx" "Dummy — Minimal-Modell zum Erkunden"
upload "${OTX_DIR}/Fertigungsstruktur1_mit_AslFj.otx" "Fertigungsstruktur 1 — Mehrstufige Produktion mit Aufträgen"
upload "${OTX_DIR}/Bosch2_wechseln.otx" "Bosch 2 (Wechseln) — Größeres Realdaten-Beispiel"

echo ""
echo "Fertig. Login: admin@osim-dev / admin123  oder  user@osim-dev / user123"
echo "Portal:  http://localhost:3002"
