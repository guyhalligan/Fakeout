#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${PORT:-8000}"
URL="http://localhost:$PORT"

cd "$SCRIPT_DIR" || exit 1

echo "Starting server at $URL"
echo "Press Ctrl+C to stop"

if command -v open >/dev/null 2>&1; then
  (sleep 1; open "$URL" >/dev/null 2>&1) &
elif command -v xdg-open >/dev/null 2>&1; then
  (sleep 1; xdg-open "$URL" >/dev/null 2>&1) &
fi

python3 -m http.server "$PORT"
