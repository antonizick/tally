#!/bin/bash
# Quick dev launcher — runs backend + frontend without Docker
# Handles TCP port TIME_WAIT conflicts with retry logic

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🚀 Starting Tally dev environment..."

# Function to wait for port to be free
wait_for_port() {
  local port=$1
  local max_attempts=30
  local attempt=0

  while [ $attempt -lt $max_attempts ]; do
    if ! lsof -i :$port >/dev/null 2>&1; then
      return 0
    fi
    attempt=$((attempt + 1))
    echo "⏳ Waiting for port $port to be free... (attempt $attempt/$max_attempts)"
    sleep 1
  done

  echo "❌ Port $port still in use after 30 seconds"
  return 1
}

# Kill any lingering processes on these ports
cleanup_ports() {
  for port in 8000 5173; do
    if lsof -i :$port >/dev/null 2>&1; then
      echo "🧹 Cleaning up port $port..."
      lsof -i :$port | grep -v COMMAND | awk '{print $2}' | xargs kill -9 2>/dev/null || true
      sleep 1
    fi
  done
}

# Clean up any stuck processes
cleanup_ports
wait_for_port 8000 || true
wait_for_port 5173 || true

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
echo "   Data:     ~/.tally/ (SQLite)"
echo ""
echo "Press Ctrl+C to stop"

cleanup() {
  echo ""
  echo "🛑 Shutting down..."
  kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
  wait 2>/dev/null || true
  echo "Stopped"
}
trap cleanup EXIT INT TERM
wait
