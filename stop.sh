#!/bin/bash
echo "Arrêt des serveurs..."
pkill -9 -f "python app.py" 2>/dev/null || echo "Backend déjà arrêté"
pkill -9 -f "npm start" 2>/dev/null || echo "Frontend déjà arrêté"
echo "Fait."