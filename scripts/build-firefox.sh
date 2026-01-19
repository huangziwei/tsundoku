#!/usr/bin/env bash
set -euo pipefail

if ! command -v zip >/dev/null 2>&1; then
  echo "zip is required to build the Firefox extension." >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_DIR="${ROOT_DIR}/firefox"
OUT_DIR="${ROOT_DIR}/dist"
OUT_FILE="${OUT_DIR}/tsundoku-firefox.xpi"

mkdir -p "${OUT_DIR}"
rm -f "${OUT_FILE}"

(
  cd "${SRC_DIR}"
  zip -r -q "${OUT_FILE}" . -x "*.DS_Store"
)

echo "Built ${OUT_FILE}"
