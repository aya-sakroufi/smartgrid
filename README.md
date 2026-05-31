# Smart Grid IEEE

Projet académique réalisé dans le cadre du cours d'**Analyse Numérique** à l'Institut Supérieur d'Informatique (ISI Ariana).

Smart Grid IEEE est une application web de simulation et de visualisation de réseaux électriques standards IEEE. Elle permet de charger des topologies IEEE 14, IEEE 30 et IEEE 118 bus ou d'importer un fichier personnalisé, de simuler des coupures de lignes, puis de comparer plusieurs méthodes numériques de résolution.

## Fonctionnalités

- Chargement des réseaux IEEE 14, IEEE 30 et IEEE 118 à partir de données intégrées.
- **Import d'un fichier personnalisé** pour charger une topologie de réseau externe.
- Visualisation interactive du réseau avec zoom, déplacement et états des nœuds.
- Simulation de scénarios de charge standard, matin et soir.
- Simulation de coupures de lignes et détection des nœuds hors tension.
- Résolution numérique par élimination de Gauss, factorisation LU et Cholesky.
- Comparaison des performances selon le temps d'exécution, le résidu et le nombre d'itérations.
- API Flask pour exposer les données, lancer les calculs et comparer les méthodes.

## Architecture

```
smartgrid/
├── backend/
│   └── app.py
└── frontend/
    ├── public/
    ├── src/
    ├── package.json
    └── package-lock.json
```

## Technologies

- **Backend :** Python, Flask, Flask-CORS, Flask-SocketIO, NumPy.
- **Frontend :** React, JavaScript, CSS.
- **Données réseau :** cas IEEE basés sur des topologies de référence Matpower.

## Prérequis

- Python 3.10 ou version compatible.
- Node.js 18 ou version compatible.
- npm.

## Installation

### Backend

Depuis la racine du projet :

```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # Linux / macOS
pip install flask flask-cors flask-socketio numpy
python app.py
```

Le backend démarre sur : `http://localhost:5000`

### Frontend

Dans un second terminal, depuis la racine du projet :

```bash
cd frontend
npm install
npm start
```

Le frontend démarre sur : `http://localhost:3000`

## Endpoints API

| Méthode | Endpoint           | Description                                                    |
| ------- | ------------------ | -------------------------------------------------------------- |
| GET     | `/api/health`      | Vérifie l'état du backend.                                     |
| GET     | `/api/ieee/<size>` | Charge un réseau IEEE. Valeurs supportées : `14`, `30`, `118`. |
| POST    | `/api/upload`      | Importe un fichier de réseau personnalisé.                     |
| POST    | `/api/solve`       | Résout le système selon la méthode et le scénario fournis.     |
| POST    | `/api/compare`     | Compare les méthodes de résolution disponibles.                |

## Utilisation

1. Démarrer le backend Flask.
2. Démarrer le frontend React.
3. Choisir un standard IEEE dans le panneau de contrôle, **ou importer un fichier de réseau personnalisé**.
4. Sélectionner une ou plusieurs méthodes de résolution.
5. Ajuster le scénario de charge ou ajouter des coupures de lignes.
6. Lancer la résolution et consulter les résultats, matrices et comparaisons.

## Structure des données

Chaque réseau expose :

- `A` : matrice d'admittance du réseau.
- `b` : vecteur des puissances nettes.
- `coords` : coordonnées de visualisation des bus.
- `branches` : connexions entre les bus.
- `slack_bus` : bus de référence.


## Auteurs

SAKROUFI Aya & AYARI Wiem — ISI Ariana, Université de Tunis El Manar
