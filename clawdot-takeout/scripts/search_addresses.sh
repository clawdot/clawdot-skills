#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./api_helpers.sh
source "${SCRIPT_DIR}/api_helpers.sh"

if [[ $# -eq 0 ]]; then
  body='{"keyword":""}'
elif [[ $# -eq 3 ]]; then
  keyword="$1"
  lat="$2"
  lng="$3"
  body="$(jq -n --arg keyword "$keyword" --argjson lat "$lat" --argjson lng "$lng" \
    '{keyword: $keyword, lat: $lat, lng: $lng}')"
else
  echo "Usage: $0 [<keyword> <lat> <lng>]" >&2
  exit 1
fi

api_post_json "/api/v1/addresses/search" "$body"
