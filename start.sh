#!/bin/bash
cd "$(dirname "$0")"

echo "=========================================="
echo "  LANCEMENT SMART GRID"
echo "=========================================="

# Arrêt propre si relance
pkill -f "python app.py" 2>/dev/null || true
pkill -f "npm start" 2>/dev/null || true
sleep 2

# Backend
echo "[+] Backend (Port 5000)..."
cd backend
source venv/bin/activate
python3 app.py &
BACK_PID=$!
cd ..

sleep 3

# Frontend
echo "[+] Frontend (Port 3000)..."
cd frontend
npm start &
FRONT_PID=$!
cd ..

echo ""
echo "=========================================="
echo "  SERVEURS ACTIFS"
echo "=========================================="
echo "Backend PID: $BACK_PID"
echo "Frontend PID: $FRONT_PID"
echo ""
echo "URLs:"
echo "- API:    http://localhost:5000"
echo "- App:    http://localhost:3000"
echo ""
echo "Arrêt: ./stop.sh"
echo "=========================================="

wait
