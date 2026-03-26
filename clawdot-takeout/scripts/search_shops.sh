#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./api_helpers.sh
source "${SCRIPT_DIR}/api_helpers.sh"

if [[ $# -lt 3 ]]; then
  echo "Usage: $0 <lat> <lng> <keyword> [offset] [limit]" >&2
  exit 1
fi

lat="$1"
lng="$2"
keyword="$3"
offset="${4:-0}"
limit="${5:-20}"

api_get "/api/v1/shops/search" \
  --data-urlencode "lat=${lat}" \
  --data-urlencode "lng=${lng}" \
  --data-urlencode "keyword=${keyword}" \
  --data-urlencode "offset=${offset}" \
  --data-urlencode "limit=${limit}"
