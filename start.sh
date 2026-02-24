#!/bin/bash
# ─────────────────────────────────────────────
# VOICE4BLIND — Quick Start Script
# ─────────────────────────────────────────────
set -e

echo "=============================="
echo "  VOICE4BLIND — Starting Up"
echo "=============================="

# Option 1: Full backend (FastAPI)
if command -v uvicorn &>/dev/null; then
  echo "[INFO] Starting FastAPI backend on port 8000..."
  cd backend
  uvicorn main:app --host 0.0.0.0 --port 8000 --reload
else
  # Option 2: Frontend-only with Python HTTP server
  echo "[INFO] uvicorn not found. Starting frontend-only mode on port 3000..."
  echo "[INFO] Open: http://127.0.0.1:3000/frontend/index.html"
  python3 -m http.server 3000
fi
