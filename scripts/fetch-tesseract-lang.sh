#!/usr/bin/env bash
#
# Download the Tesseract language traineddata models used by the OCR feature into
# public/tesseract/lang/ so OCR runs fully offline (no CDN hit on first use).
#
# These files are NOT shipped in node_modules — they are normally fetched from the
# CDN (https://tessdata.projectnaptha.com) on first OCR run. Run this once to vendor
# them locally.
#
# Usage:
#   bash scripts/fetch-tesseract-lang.sh
#
set -euo pipefail

# Resolve repo root relative to this script so it works from any cwd.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST_DIR="${SCRIPT_DIR}/../public/tesseract/lang"

# tesseract.js v7 uses the 4.0.0 (best) tessdata by default.
BASE_URL="https://tessdata.projectnaptha.com/4.0.0"
LANGS=("eng" "bul")

mkdir -p "${DEST_DIR}"

for lang in "${LANGS[@]}"; do
  out="${DEST_DIR}/${lang}.traineddata.gz"
  echo "Downloading ${lang}.traineddata.gz -> ${out}"
  curl -fsSL "${BASE_URL}/${lang}.traineddata.gz" -o "${out}"
done

echo "Done. Vendored ${#LANGS[@]} language model(s) into public/tesseract/lang/."
