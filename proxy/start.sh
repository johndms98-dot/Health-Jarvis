#!/bin/bash
# Start both proxy services. Run this on your Mac before opening the app.
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "ERROR: proxy/.env not found. Copy .env.example and fill in your credentials."
  exit 1
fi

echo "Starting Garmin proxy on port 8765..."
uvicorn garmin_proxy:app --host 0.0.0.0 --port 8765 &
GARMIN_PID=$!

echo "Starting MFP proxy on port 8766..."
uvicorn mfp_proxy:app --host 0.0.0.0 --port 8766 &
MFP_PID=$!

echo "Both proxies running. Press Ctrl+C to stop."
echo "  Garmin: http://localhost:8765/health"
echo "  MFP:    http://localhost:8766/health"

trap "kill $GARMIN_PID $MFP_PID 2>/dev/null; echo 'Proxies stopped.'" EXIT
wait
