#!/usr/bin/env bash
# One-command local demo: installs (first run only), then starts the API (:8000) and UI (:5173).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"

cd "$ROOT/backend"
if [ ! -d .venv ]; then
  python3 -m venv .venv
  . .venv/bin/activate
  pip install -q -e ".[dev]"
else
  . .venv/bin/activate
fi
[ -f .env ] || cp .env.example .env
python -c "from app.ml.scorer import load_bundle; load_bundle()" 2>/dev/null || { python scripts/generate_dataset.py && python scripts/train_model.py; }

cd "$ROOT/frontend"
[ -d node_modules ] || npm install

cd "$ROOT/backend"
uvicorn app.main:app --port 8000 &
API_PID=$!
trap 'kill $API_PID 2>/dev/null' EXIT

cd "$ROOT/frontend"
echo "UI → http://localhost:5173   API docs → http://localhost:8000/docs"
npx vite --port 5173
