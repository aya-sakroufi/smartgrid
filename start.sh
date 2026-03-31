#!/bin/bash
cd "$(dirname "$0")"

echo "=========================================="
echo "  LANCEMENT SMART GRID"
echo "=========================================="

# Fonction pour tuer le processus sur un port spécifique
kill_port() {
    local port=$1
    local pid=$(sudo lsof -ti:$port 2>/dev/null)
    if [ ! -z "$pid" ]; then
        echo "  → Libération du port $port (PID: $pid)"
        kill -9 $pid 2>/dev/null || sudo kill -9 $pid 2>/dev/null
        sleep 1
    fi
}

# Arrêt propre si relance
echo "[1/3] Nettoyage des processus existants..."

# Méthode 1: Par nom
pkill -f "python app.py" 2>/dev/null || true
pkill -f "react-scripts" 2>/dev/null || true
pkill -9 node 2>/dev/null || true

# Méthode 2: Par port (plus fiable)
kill_port 5000
kill_port 3000

sleep 2

# Vérification finale
if sudo lsof -ti:3000 > /dev/null 2>&1; then
    echo "ERREUR: Port 3000 toujours occupé !"
    echo "Forcer la libération avec: sudo fuser -k 3000/tcp"
    exit 1
fi

# Backend
echo "[2/3] Démarrage Backend (Port 5000)..."
cd backend
source venv/bin/activate
python3 app.py &
BACK_PID=$!
cd ..

# Attendre que Flask démarre
sleep 4

# Frontend
echo "[3/3] Démarrage Frontend (Port 3000)..."
cd frontend
npm start &
FRONT_PID=$!
cd ..

sleep 2

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
echo "Logs: tail -f backend/flask.log (si redirigé)"
echo "Arrêt: ./stop.sh"
echo "=========================================="

# Gestion de l'arrêt propre (Ctrl+C)
trap "echo 'Arrêt...'; kill $BACK_PID $FRONT_PID 2>/dev/null; exit" INT

wait
