#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./api_helpers.sh
source "${SCRIPT_DIR}/api_helpers.sh"

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <preview-body.json>" >&2
  exit 1
fi

json_file="$1"

if [[ ! -f "${json_file}" ]]; then
  echo "Preview body not found: ${json_file}" >&2
  exit 1
fi

api_post_json "/api/v1/orders/preview" "$(cat "${json_file}")"
