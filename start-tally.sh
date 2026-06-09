#!/bin/bash
# Start both Tally backend and frontend for systemd

set -e

ROOT="/home/nick/dev/lucent/idea/Tally"

# Backend
cd "$ROOT/backend"
source .venv/bin/activate
uvicorn app.main:app --host 127.0.0.1 --port 8010 &
BACKEND_PID=$!

# Frontend
cd "$ROOT/frontend"
npm run dev -- --host 127.0.0.1 --port 5173 &
FRONTEND_PID=$!

# Wait for both
wait $BACKEND_PID $FRONTEND_PID
