#!/usr/bin/env bash
set -euo pipefail

GATEWAY_URL="${GATEWAY_URL:-http://127.0.0.1:8000}"
AUTH_HEADER="${AUTH_HEADER:-Authorization: Bearer {API_KEY}}"
USER_HEADER="${USER_HEADER:-X-User-Token: {USER_TOKEN}}"

api_get() {
  local path="$1"
  shift
  curl -s --get "${GATEWAY_URL}${path}" \
    -H "${AUTH_HEADER}" \
    -H "${USER_HEADER}" \
    "$@"
}

api_post_json() {
  local path="$1"
  local json_body="$2"
  curl -s -X POST "${GATEWAY_URL}${path}" \
    -H "${AUTH_HEADER}" \
    -H "${USER_HEADER}" \
    -H "Content-Type: application/json" \
    -d "${json_body}"
}
