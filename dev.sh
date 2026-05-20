#!/bin/bash
# Quick dev launcher — runs backend + frontend without Docker
set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🚀 Starting Tally dev environment..."

# Backend
cd "$ROOT/backend"
if [ ! -d ".venv" ]; then
  echo "📦 Creating Python venv..."
  python3 -m venv .venv
fi
source .venv/bin/activate
pip install -q -e . 2>/dev/null || pip install -e .

echo "✅ Backend dependencies installed"
uvicorn app.main:app --reload --port 8000 &
BACKEND_PID=$!

# Frontend
cd "$ROOT/frontend"
if [ ! -d "node_modules" ]; then
  echo "📦 Installing frontend deps..."
  npm install
fi
npm run dev &
FRONTEND_PID=$!

echo ""
echo "🎉 Tally is running!"
echo "   Backend:  http://localhost:8000"
echo "   Frontend: http://localhost:5173"
echo "   API Docs: http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop"

cleanup() {
  kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
  echo "Stopped"
}
trap cleanup EXIT INT TERM
wait
