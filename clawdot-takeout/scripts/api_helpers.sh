#!/usr/bin/env bash
set -euo pipefail

GATEWAY_URL="${GATEWAY_URL:-}"
API_KEY="${API_KEY:-}"
USER_TOKEN="${USER_TOKEN:-}"

require_config() {
  if [[ -z "${GATEWAY_URL}" ]]; then
    echo "GATEWAY_URL is required" >&2
    exit 1
  fi
  if [[ -z "${API_KEY}" ]]; then
    echo "API_KEY is required" >&2
    exit 1
  fi
  if [[ -z "${USER_TOKEN}" ]]; then
    echo "USER_TOKEN is required" >&2
    exit 1
  fi
}

api_get() {
  local path="$1"
  shift
  require_config
  curl -s --get "${GATEWAY_URL}${path}" \
    -H "Authorization: Bearer ${API_KEY}" \
    -H "X-User-Token: ${USER_TOKEN}" \
    "$@"
}

api_post_json() {
  local path="$1"
  local json_body="$2"
  require_config
  curl -s -X POST "${GATEWAY_URL}${path}" \
    -H "Authorization: Bearer ${API_KEY}" \
    -H "X-User-Token: ${USER_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "${json_body}"
}
