#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
export npm_config_cache="${npm_config_cache:-/tmp/classlens-npm-cache}"
python3 -m venv .venv
.venv/bin/python -m pip install --cache-dir "${PIP_CACHE_DIR:-/tmp/classlens-pip-cache}" -r backend/requirements.txt
npm ci --no-audit --no-fund
npm run build
.venv/bin/python -m pytest backend/tests -q
if [[ "${CLASSLENS_DOWNLOAD_MODELS:-0}" == "1" ]]; then
  .venv/bin/python backend/download_models.py
else
  echo 'Core setup complete. To enable recognition: .venv/bin/python backend/download_models.py'
fi
