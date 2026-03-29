import numpy as np
import pandas as pd
from flask import Flask, request, jsonify
from flask_socketio import SocketIO, emit
from flask_cors import CORS
import time
from scipy.sparse import csr_matrix
from scipy.sparse.linalg import spsolve
import json

app = Flask(__name__)
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# ============================================================
# 1. CLASSES DES MÉTHODES DIRECTES (Aspect Mathématique)
# ============================================================

class DirectSolver:
    def __init__(self, A, b, method='lu'):
        self.A = np.array(A, dtype=float)
        self.b = np.array(b, dtype=float)
        self.n = len(b)
        self.method = method
        self.steps = []  # Pour affichage progressif
        
    def solve(self):
        t_start = time.time()
        
        if self.method == 'gauss':
            x, iterations = self._gauss_elimination()
        elif self.method == 'lu':
            x, iterations = self._lu_factorization()
        elif self.method == 'cholesky':
            x, iterations = self._cholesky()
        else:
            raise ValueError("Méthode inconnue")
            
        t_end = time.time()
        
        return {
            'solution': x.tolist(),
            'time': t_end - t_start,
            'iterations': iterations,
            'residual': float(np.linalg.norm(self.A @ x - self.b)),
            'steps': self.steps,
            'matrix_A': self.A.tolist(),
            'vector_b': self.b.tolist()
        }
    
    def _gauss_elimination(self):
        """Élimination de Gauss avec pivot partiel"""
        A = self.A.copy()
        b = self.b.copy()
        n = self.n
        iterations = 0
        
        for k in range(n-1):
            # Pivot partiel pour stabilité numérique
            max_idx = np.argmax(np.abs(A[k:, k])) + k
            if A[max_idx, k] == 0:
                raise ValueError("Matrice singulière")
            
            if max_idx != k:
                A[[k, max_idx]] = A[[max_idx, k]]
                b[[k, max_idx]] = b[[max_idx, k]]
            
            for i in range(k+1, n):
                if A[i, k] != 0:
                    factor = A[i, k] / A[k, k]
                    A[i, k:] -= factor * A[k, k:]
                    b[i] -= factor * b[k]
                    iterations += 1
                
                # Envoi progression pour animation (tous les 5 nœuds)
                if i % 5 == 0:
                    socketio.emit('progress', {
                        'node': i,
                        'method': 'gauss',
                        'phase': 'elimination'
                    })
            
            self.steps.append({
                'step': k,
                'matrix': A.copy().tolist(),
                'vector': b.copy().tolist()
            })
        
        # Substitution arrière
        x = np.zeros(n)
        for i in range(n-1, -1, -1):
            x[i] = (b[i] - np.dot(A[i, i+1:], x[i+1:])) / A[i, i]
            iterations += 1
        
        return x, iterations
    
    def _lu_factorization(self):
        """Factorisation LU avec pivot"""
        A = self.A.copy()
        n = self.n
        L = np.eye(n)
        P = np.eye(n)  # Matrice de permutation
        
        iterations = 0
        
        for k in range(n-1):
            # Pivot
            max_idx = np.argmax(np.abs(A[k:, k])) + k
            if k != max_idx:
                A[[k, max_idx]] = A[[max_idx, k]]
                P[[k, max_idx]] = P[[max_idx, k]]
                if k > 0:
                    L[[k, max_idx], :k] = L[[max_idx, k], :k]
            
            for i in range(k+1, n):
                L[i, k] = A[i, k] / A[k, k]
                A[i, k:] -= L[i, k] * A[k, k:]
                iterations += 1
            
            if k % 3 == 0:  # Progression pour animation
                socketio.emit('progress', {
                    'node': k,
                    'method': 'lu',
                    'phase': 'factorization'
                })
        
        U = A
        
        # Résolution Ly = Pb puis Ux = y
        Pb = P @ self.b
        y = np.zeros(n)
        for i in range(n):
            y[i] = Pb[i] - np.dot(L[i, :i], y[:i])
        
        x = np.zeros(n)
        for i in range(n-1, -1, -1):
            x[i] = (y[i] - np.dot(U[i, i+1:], x[i+1:])) / U[i, i]
        
        self.steps.append({
            'L': L.tolist(),
            'U': U.tolist(),
            'P': P.tolist()
        })
        
        return x, iterations
    
    def _cholesky(self):
        """Factorisation de Cholesky (A = LL^T)"""
        if not self._is_symmetric_positive_definite():
            raise ValueError("Matrice non symétrique définie positive")
        
        n = self.n
        L = np.zeros((n, n))
        iterations = 0
        
        for j in range(n):
            sum_diag = sum(L[j, k]**2 for k in range(j))
            L[j, j] = np.sqrt(self.A[j, j] - sum_diag)
            
            for i in range(j+1, n):
                sum_off = sum(L[i, k] * L[j, k] for k in range(j))
                L[i, j] = (self.A[i, j] - sum_off) / L[j, j]
                iterations += 1
            
            if j % 4 == 0:
                socketio.emit('progress', {
                    'node': j,
                    'method': 'cholesky',
                    'phase': 'decomposition'
                })
        
        # Résolution Ly = b puis L^Tx = y
        y = np.zeros(n)
        for i in range(n):
            y[i] = (self.b[i] - np.dot(L[i, :i], y[:i])) / L[i, i]
        
        x = np.zeros(n)
        LT = L.T
        for i in range(n-1, -1, -1):
            x[i] = (y[i] - np.dot(LT[i, i+1:], x[i+1:])) / LT[i, i]
        
        self.steps.append({
            'L': L.tolist()
        })
        
        return x, iterations
    
    def _is_symmetric_positive_definite(self):
        """Vérifie si A est SDP"""
        if not np.allclose(self.A, self.A.T):
            return False
        eigenvalues = np.linalg.eigvals(self.A)
        return np.all(eigenvalues > 0)

# ============================================================
# 2. GESTION DES DONNÉES IEEE ET TOPOLOGIE
# ============================================================

class SmartGridData:
    @staticmethod
    def get_ieee_14():
        """Réseau IEEE 14 nœuds (simplifié pour DC Power Flow)"""
        n = 14
        # Matrice des susceptances B' (approximation DC)
        # Données basées sur le cas IEEE 14 bus standard
        B_prime = np.array([
            [6.250, -5.000, -1.250, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            [-5.000, 10.834, -1.667, -4.167, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            [-1.250, -1.667, 12.917, -10.000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            [0, -4.167, -10.000, 21.353, -5.000, -2.083, 0, 0, 0, 0, 0, 0, 0, 0],
            [0, 0, 0, -5.000, 9.333, 0, 0, -4.333, 0, 0, 0, 0, 0, 0],
            [0, 0, 0, -2.083, 0, 5.000, -2.917, 0, 0, 0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0, -2.917, 6.667, 0, 0, -3.750, 0, 0, 0, 0],
            [0, 0, 0, 0, -4.333, 0, 0, 13.600, -6.000, -3.333, 0, 0, 0, 0],
            [0, 0, 0, 0, 0, 0, 0, -6.000, 10.000, 0, -4.000, 0, 0, 0],
            [0, 0, 0, 0, 0, 0, -3.333, -3.333, 0, 0, 14.000, -3.333, -3.333, -4.000],
            [0, 0, 0, 0, 0, 0, 0, 0, -4.000, -3.333, 12.500, -2.500, -2.500, 0],
            [0, 0, 0, 0, 0, 0, 0, 0, 0, -3.333, -2.500, 5.833, 0, 0],
            [0, 0, 0, 0, 0, 0, 0, 0, 0, -3.333, -2.500, 0, 5.833, 0],
            [0, 0, 0, 0, 0, 0, 0, 0, 0, -4.000, 0, 0, 0, 4.000]
        ])
        
        # Vecteur b : Scénario standard IEEE 14
        b = np.array([2.324, 0.183, -0.942, -0.478, -0.076, -0.112, 0.000, 
                      0.000, -0.295, -0.090, -0.035, -0.061, -0.149, -0.270])
        
        # Coordonnées pour visualisation
        coords = [
            [0.5, 1.0], [0.3, 0.8], [0.7, 0.8], [0.5, 0.6], [0.2, 0.4],
            [0.8, 0.4], [0.6, 0.3], [0.3, 0.2], [0.5, 0.1], [0.7, 0.2],
            [0.1, 0.0], [0.3, -0.1], [0.5, -0.1], [0.7, 0.0]
        ]
        
        return {
            'A': B_prime.tolist(),
            'b': b.tolist(),
            'n': n,
            'name': 'IEEE 14 Bus',
            'coords': coords,
            'slack_bus': 0  # Nœud 1 est le slack
        }
    
    @staticmethod
    def get_ieee_30():
        """Générateur pour IEEE 30 (structure similaire, étendue)"""
        n = 30
        # Génération procédurale pour l'exemple (dans un vrai cas, données réelles)
        A = np.zeros((n, n))
        # Remplissage aléatoire mais structuré pour créer un vrai réseau
        np.random.seed(30)
        for i in range(n):
            for j in range(i+1, min(i+4, n)):  # Chaque nœud connecté aux 3 suivants
                b_ij = np.random.uniform(1, 10)
                A[i, j] = -b_ij
                A[j, i] = -b_ij
                A[i, i] += b_ij
                A[j, j] += b_ij
        
        # Scénario matin (pic de consommation)
        b_morning = np.random.uniform(-0.5, 0.2, n)
        b_morning[0] = 2.0  # Centrale
        
        return {
            'A': A.tolist(),
            'b': b_morning.tolist(),
            'n': n,
            'name': 'IEEE 30 Bus',
            'slack_bus': 0
        }
    
    @staticmethod
    def get_ieee_118():
        """Générateur pour IEEE 118 (grand réseau)"""
        n = 118
        # Structure creuse réaliste
        A = np.zeros((n, n))
        np.random.seed(118)
        for i in range(n):
            # Connectivité moyenne de 3-5 connexions par nœud
            degree = np.random.randint(2, 6)
            connections = np.random.choice([j for j in range(n) if j != i], 
                                          size=min(degree, n-1), replace=False)
            for j in connections:
                if A[i, j] == 0:  # Éviter doublons
                    b_ij = np.random.uniform(2, 15)
                    A[i, j] = -b_ij
                    A[j, i] = -b_ij
                    A[i, i] += b_ij
                    A[j, j] += b_ij
        
        b = np.random.uniform(-1.0, 0.5, n)
        b[0] = 5.0  # Grosse centrale
        
        return {
            'A': A.tolist(),
            'b': b.tolist(),
            'n': n,
            'name': 'IEEE 118 Bus',
            'slack_bus': 0
        }

# ============================================================
# 3. SIMULATION DE PANNE ET DISPATCHING
# ============================================================

class GridSimulator:
    def __init__(self, A, b, slack_bus=0):
        self.A_original = np.array(A, dtype=float)
        self.b = np.array(b, dtype=float)
        self.n = len(b)
        self.slack_bus = slack_bus
        self.current_A = self.A_original.copy()
        
    def break_line(self, bus_from, bus_to):
        """Simulation de rupture de ligne entre deux nœuds"""
        if self.current_A[bus_from, bus_to] != 0:
            # Retirer la connexion
            b_ij = -self.current_A[bus_from, bus_to]
            self.current_A[bus_from, bus_to] = 0
            self.current_A[bus_to, bus_from] = 0
            self.current_A[bus_from, bus_from] -= b_ij
            self.current_A[bus_to, bus_to] -= b_ij
            return True
        return False
    
    def calculate_dispatch(self, generation_costs=None):
        """
        Dispatching économique : minimise coût de production
        sous contrainte de flux
        """
        if generation_costs is None:
            # Coûts quadratiques par défaut : c(P) = aP² + bP + c
            generation_costs = [{'a': 0.01, 'b': 2.0} for _ in range(self.n)]
        
        # Simplification : résolution itérative avec ajustement des générations
        # Dans une vraie implémentation, optimisation quadratique (quadprog)
        
        # Méthode simple : ajustement proportionnel des générations disponibles
        x = np.zeros(self.n)
        try:
            # Essayer de résoudre avec les pertes de ligne
            solver = DirectSolver(self.current_A, self.b, 'lu')
            result = solver.solve()
            x = np.array(result['solution'])
            status = 'success'
            blackout_nodes = []
        except Exception as e:
            # Si échec, identifier les îlots noirs
            status = 'blackout'
            x = np.zeros(self.n)
            # Détection simplifiée : nœuds non alimentés
            blackout_nodes = list(range(self.n))  # Tous éteints dans ce cas simple
            
        return {
            'status': status,
            'angles': x.tolist(),
            'blackout_nodes': blackout_nodes,
            'flows': self._calculate_flows(x),
            'matrix': self.current_A.tolist()
        }
    
    def _calculate_flows(self, angles):
        """Calcule les flux sur lignes à partir des angles"""
        flows = []
        for i in range(self.n):
            for j in range(i+1, self.n):
                if self.current_A[i, j] != 0:
                    b_ij = -self.current_A[i, j]
                    flow = b_ij * (angles[i] - angles[j])
                    flows.append({
                        'from': i,
                        'to': j,
                        'flow': float(flow),
                        'capacity': float(b_ij * 0.5)  # Limite approximative
                    })
        return flows

# ============================================================
# 4. API ENDPOINTS
# ============================================================

@app.route('/api/ieee/<int:size>')
def get_ieee(size):
    if size == 14:
        return jsonify(SmartGridData.get_ieee_14())
    elif size == 30:
        return jsonify(SmartGridData.get_ieee_30())
    elif size == 118:
        return jsonify(SmartGridData.get_ieee_118())
    return jsonify({'error': 'Taille non supportée'}), 400

@app.route('/api/solve', methods=['POST'])
def solve_system():
    data = request.json
    A = data['A']
    b = data['b']
    method = data.get('method', 'lu')
    scenario = data.get('scenario', 'standard')  # matin, soir, standard
    
    # Modification du vecteur b selon scénario
    b_vec = np.array(b)
    if scenario == 'matin':
        b_vec *= 1.3  # Pic de consommation
    elif scenario == 'soir':
        b_vec *= 0.8  # Consommation réduite
    
    try:
        solver = DirectSolver(A, b_vec.tolist(), method)
        result = solver.solve()
        result['method'] = method
        result['scenario'] = scenario
        
        # Calcul des métriques supplémentaires
        A_np = np.array(A)
        cond_number = np.linalg.cond(A_np)
        result['condition_number'] = float(cond_number)
        result['complexity'] = f"O(n³) = O({len(b)}³) opérations"
        
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/compare', methods=['POST'])
def compare_methods():
    """Compare les trois méthodes sur le même système"""
    data = request.json
    A = data['A']
    b = data['b']
    
    methods = ['gauss', 'lu', 'cholesky']
    results = {}
    
    for method in methods:
        try:
            solver = DirectSolver(A, b, method)
            res = solver.solve()
            results[method] = {
                'time': res['time'],
                'residual': res['residual'],
                'iterations': res['iterations'],
                'complexity': 'O(n³/3)' if method == 'cholesky' else 'O(2n³/3)',
                'memory': 'n²/2' if method == 'cholesky' else 'n²'
            }
        except Exception as e:
            results[method] = {'error': str(e)}
    
    # Recommandation automatique
    valid_methods = {k: v for k, v in results.items() if 'error' not in v}
    if valid_methods:
        best = min(valid_methods.items(), key=lambda x: x[1]['time'])
        results['recommendation'] = {
            'method': best[0],
            'reason': f"Plus rapide ({best[1]['time']:.4f}s) et stable (résidu: {best[1]['residual']:.2e})"
        }
    
    return jsonify(results)

@app.route('/api/break_line', methods=['POST'])
def simulate_break():
    """Simulation de rupture de ligne et dispatching d'urgence"""
    data = request.json
    A = data['A']
    b = data['b']
    line_from = data['from']
    line_to = data['to']
    
    sim = GridSimulator(A, b)
    
    # Rupture
    success = sim.break_line(line_from, line_to)
    if not success:
        return jsonify({'error': 'Ligne déjà inexistante'}), 400
    
    # Dispatching
    dispatch = sim.calculate_dispatch()
    
    return jsonify({
        'line_broken': {'from': line_from, 'to': line_to},
        'new_matrix': sim.current_A.tolist(),
        'dispatch': dispatch
    })

@socketio.on('connect')
def handle_connect():
    print('Client connecté')

if __name__ == '__main__':
    socketio.run(app, debug=True, port=5000)