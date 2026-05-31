# Smart Grid IEEE

Smart Grid IEEE est une application web de simulation et de visualisation de reseaux electriques standards IEEE. Elle permet de charger des topologies IEEE 14, IEEE 30 et IEEE 118 bus, de simuler des coupures de lignes, puis de comparer plusieurs methodes numeriques de resolution.

## Fonctionnalites

- Chargement des reseaux IEEE 14, IEEE 30 et IEEE 118 a partir de donnees integrees.
- Visualisation interactive du reseau avec zoom, deplacement et etats des noeuds.
- Simulation de scenarios de charge standard, matin et soir.
- Simulation de coupures de lignes et detection des noeuds hors tension.
- Resolution numerique par elimination de Gauss, factorisation LU et Cholesky.
- Comparaison des performances selon le temps d'execution, le residu et le nombre d'iterations.
- API Flask pour exposer les donnees, lancer les calculs et comparer les methodes.

## Architecture

```text
smartgrid-VF/
├── backend/
│   └── app.py
└── frontend/
    ├── public/
    ├── src/
    ├── package.json
    └── package-lock.json
```

## Technologies

- Backend: Python, Flask, Flask-CORS, Flask-SocketIO, NumPy.
- Frontend: React, JavaScript, CSS.
- Donnees reseau: cas IEEE bases sur des topologies de reference Matpower.

## Prerequis

- Python 3.10 ou version compatible.
- Node.js 18 ou version compatible.
- npm.

## Installation

### Backend

Depuis la racine du projet:

```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install flask flask-cors flask-socketio numpy
python app.py
```

Le backend demarre sur:

```text
http://localhost:5000
```

### Frontend

Dans un second terminal, depuis la racine du projet:

```bash
cd frontend
npm install
npm start
```

Le frontend demarre sur:

```text
http://localhost:3000
```

## Endpoints API

| Methode | Endpoint | Description |
| --- | --- | --- |
| GET | `/api/health` | Verifie l'etat du backend. |
| GET | `/api/ieee/<size>` | Charge un reseau IEEE. Valeurs supportees: `14`, `30`, `118`. |
| POST | `/api/solve` | Resout le systeme selon la methode et le scenario fournis. |
| POST | `/api/compare` | Compare les methodes de resolution disponibles. |

## Utilisation

1. Demarrer le backend Flask.
2. Demarrer le frontend React.
3. Choisir un standard IEEE dans le panneau de controle.
4. Selectionner une ou plusieurs methodes de resolution.
5. Ajuster le scenario de charge ou ajouter des coupures de lignes.
6. Lancer la resolution et consulter les resultats, matrices et comparaisons.

## Structure des donnees

Chaque reseau expose:

- `A`: matrice d'admittance du reseau.
- `b`: vecteur des puissances nettes.
- `coords`: coordonnees de visualisation des bus.
- `branches`: connexions entre les bus.
- `slack_bus`: bus de reference.

## Notes de developpement

- Les dossiers `node_modules`, `build` et `venv` ne sont pas versionnes.
- Les dependances frontend sont gerees par `package.json` et `package-lock.json`.
- Les dependances backend peuvent etre installees avec `pip install flask flask-cors flask-socketio numpy`.
