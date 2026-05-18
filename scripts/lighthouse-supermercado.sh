#!/usr/bin/env bash
# Ejecuta Lighthouse (CLI) sobre las páginas de supermercado ECI.
# Genera reportes HTML y JSON en reports/lighthouse.
#
# Uso:
#   npm run lighthouse:supermercado      # usa .env.local
#   npm run lighthouse:supermercado:ci   # usa .env.ci

set -e

ENV="${ENV:-local}"
ENV_FILE=".env.${ENV}"
if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck source=/dev/null
  . "./$ENV_FILE"
  set +a
fi

BASE_URL_SUPERMERCADO="${BASE_URL_SUPERMERCADO:-https://www.elcorteingles.es/supermercado}"
BASE_URL_SUPERMERCADO="${BASE_URL_SUPERMERCADO%/}"

URLS=(
  "${BASE_URL_SUPERMERCADO}/"
  "${BASE_URL_SUPERMERCADO}/buscar/?term=arroz%20redondo%20sos%202%20kg"
  "${BASE_URL_SUPERMERCADO}/sos-arroz-redondo-bolsa-2-kg/"
  "${BASE_URL_SUPERMERCADO}/tienda-club-del-gourmet/"
)

REPORTS_DIR="reports/lighthouse"
# Vaciar el directorio en cada ejecución para evitar confusión con reportes anteriores
rm -rf "$REPORTS_DIR"
mkdir -p "$REPORTS_DIR"

safe_name() {
  echo "$1" | sed 's|https\?://||' | sed 's|[^a-zA-Z0-9]|-|g' | sed 's|-*$||' | sed 's|^-*||'
}

echo "═══════════════════════════════════════════════════════════"
echo "  Lighthouse - Páginas Supermercado ECI"
echo "  Reportes: $REPORTS_DIR"
echo "═══════════════════════════════════════════════════════════"
echo "  BASE_URL_SUPERMERCADO: $BASE_URL_SUPERMERCADO"
echo "  URLs a auditar: ${#URLS[@]}"

for url in "${URLS[@]}"; do
  name=$(safe_name "$url")
  echo ""
  echo "🔍 Auditoría: $url"
  npx lighthouse "$url" \
    --only-categories=accessibility,performance,best-practices \
    --output=html \
    --output=json \
    --output-path="$REPORTS_DIR/$name" \
    --chrome-flags="--headless --no-sandbox --disable-gpu" \
    --quiet \
    || true
  echo "  📄 $REPORTS_DIR/${name}.html"
  echo "  📄 $REPORTS_DIR/${name}.json"
done

echo ""
echo "✅ Proceso finalizado. Reportes en $REPORTS_DIR"
echo ""
