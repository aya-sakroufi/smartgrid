#!/bin/bash
set -e

echo "=========================================="
echo "  INSTALLATION SMART GRID - WSL"
echo "=========================================="

cd "$(dirname "$0")"

# Mise à jour système
echo "[1/4] Mise à jour paquets..."
sudo apt update -qq

# Python
echo "[2/4] Installation Python..."
sudo apt install -y python3 python3-pip python3-venv -qq

# Node.js 18 LTS
echo "[3/4] Installation Node.js..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt install -y nodejs -qq
fi

# Backend
echo "[4/4] Configuration projet..."
cd backend
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
source venv/bin/activate
pip install --upgrade pip -q
pip install -r requirements.txt -q

# Frontend
cd ../frontend
if [ ! -d "node_modules" ]; then
    echo "Installation npm (peut prendre 2-3 min)..."
    npm install
fi

echo ""
echo "=========================================="
echo "  INSTALLATION TERMINÉE !"
echo "=========================================="
echo "Lancez avec: ./start.sh"
echo "Ou avec VS Code: code . (puis Ctrl+Shift+B)"