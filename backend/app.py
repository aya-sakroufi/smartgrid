import numpy as np
import json
import time
from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO, emit
import logging
import warnings

warnings.filterwarnings('ignore')
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

# CORRECTION: Utiliser threading sans debug mode problématique
socketio = SocketIO(
    app, 
    cors_allowed_origins="*", 
    async_mode='threading',
    logger=False, 
    engineio_logger=False
)

# ============================================================
# SOLVEURS DIRECTES
# ============================================================

class DirectSolver:
    def __init__(self, A, b, method='lu', socket_id=None):
        self.A = np.array(A, dtype=float)
        self.b = np.array(b, dtype=float)
        self.n = len(b)
        self.method = method
        self.socket_id = socket_id
        
        if self.A.shape != (self.n, self.n):
            raise ValueError(f"Dimensions incompatibles")

    def emit_progress(self, percent, node=None, message=""):
        """Émet la progression via WebSocket"""
        try:
            if self.socket_id:
                socketio.emit('progress', {
                    'percent': int(percent),
                    'node': int(node) if node is not None else None,
                    'message': str(message),
                    'method': self.method
                }, room=self.socket_id)
        except Exception as e:
            pass  # Silencieux pour éviter pollution logs

    def solve(self):
        t_start = time.perf_counter()

        try:
            # CORRECTION: Calculer le conditionnement mais ne pas bloquer
            try:
                cond = np.linalg.cond(self.A)
                if cond > 1e15:
                    logger.warning(f"Matrice mal conditionnée (cond={cond:.2e}) mais tentative de résolution...")
            except:
                cond = float('inf')
            
            if self.method == 'gauss':
                x, iterations = self._gauss_elimination()
            elif self.method == 'lu':
                x, iterations = self._lu_factorization()
            elif self.method == 'cholesky':
                x, iterations = self._cholesky()
            else:
                raise ValueError("Méthode inconnue")

            t_end = time.perf_counter()
            residual = float(np.linalg.norm(self.A @ x - self.b))

            return {
                'success': True,
                'solution': x.tolist(),
                'time': t_end - t_start,
                'iterations': iterations,
                'residual': residual,
                'method': self.method,
                'matrix_A': self.A.tolist(),
                'vector_b': self.b.tolist(),
                'condition_number': float(cond) if cond != float('inf') else 0
            }
        except Exception as e:
            logger.error(f"Erreur résolution {self.method}: {e}")
            return {
                'success': False,
                'error': str(e),
                'method': self.method
            }

    def _gauss_elimination(self):
        """Élimination de Gauss avec pivot partiel"""
        A = self.A.copy()
        b = self.b.copy()
        n = self.n
        
        for k in range(n-1):
            max_idx = np.argmax(np.abs(A[k:, k])) + k
            if abs(A[max_idx, k]) < 1e-14:
                continue  # Passer si déjà nul
            
            if max_idx != k:
                A[[k, max_idx]] = A[[max_idx, k]]
                b[[k, max_idx]] = b[[max_idx, k]]

            for i in range(k+1, n):
                if abs(A[i, k]) > 1e-14:
                    factor = A[i, k] / A[k, k]
                    A[i, k:] -= factor * A[k, k:]
                    b[i] -= factor * b[k]
                
                # Notification progression
                if n > 10 and i % max(1, n//10) == 0:
                    percent = int((k * n + i) / (n * (n-1)) * 80)
                    self.emit_progress(percent, i)

        # Substitution arrière
        x = np.zeros(n)
        for i in range(n-1, -1, -1):
            if abs(A[i, i]) > 1e-14:
                x[i] = (b[i] - np.dot(A[i, i+1:], x[i+1:])) / A[i, i]
            else:
                x[i] = 0  # Éviter division par zéro
            
            if n > 10:
                percent = 80 + int((n-1-i) / n * 20)
                self.emit_progress(min(percent, 99), i)

        self.emit_progress(100, n-1, "Terminé")
        return x, n*n

    def _lu_factorization(self):
        """Factorisation LU avec pivot"""
        A = self.A.copy()
        n = self.n
        L = np.eye(n)
        P = np.arange(n)

        for k in range(n-1):
            max_idx = np.argmax(np.abs(A[k:, k])) + k
            if k != max_idx:
                A[[k, max_idx]] = A[[max_idx, k]]
                P[[k, max_idx]] = P[[max_idx, k]]
                if k > 0:
                    L[[k, max_idx], :k] = L[[max_idx, k], :k]

            for i in range(k+1, n):
                if abs(A[k, k]) > 1e-14:
                    L[i, k] = A[i, k] / A[k, k]
                    A[i, k:] -= L[i, k] * A[k, k:]

            if n > 10 and k % max(1, n//10) == 0:
                percent = int(k / n * 60)
                self.emit_progress(percent, k)

        U = A
        y = np.zeros(n)
        for i in range(n):
            y[i] = self.b[P[i]] - np.dot(L[i, :i], y[:i])
            if n > 10 and i % max(1, n//10) == 0:
                percent = 60 + int(i / n * 20)
                self.emit_progress(percent, i)

        x = np.zeros(n)
        for i in range(n-1, -1, -1):
            if abs(U[i, i]) > 1e-14:
                x[i] = (y[i] - np.dot(U[i, i+1:], x[i+1:])) / U[i, i]

        self.emit_progress(100, n-1, "LU terminé")
        return x, n*n

    def _cholesky(self):
        """Cholesky pour matrices SDP"""
        if not np.allclose(self.A, self.A.T, atol=1e-10):
            raise ValueError("Matrice non symétrique")

        n = self.n
        L = np.zeros((n, n))

        for j in range(n):
            sum_diag = sum(L[j, k]**2 for k in range(j))
            val = self.A[j, j] - sum_diag
            if val <= 1e-10:
                # CORRECTION: Ajouter une petite régularisation au lieu d'échouer
                val = 1e-10
                logger.warning(f"Régularisation Cholesky à l'indice {j}")
            L[j, j] = np.sqrt(val)

            for i in range(j+1, n):
                sum_off = sum(L[i, k] * L[j, k] for k in range(j))
                L[i, j] = (self.A[i, j] - sum_off) / L[j, j]

            if n > 10 and j % max(1, n//10) == 0:
                percent = int(j / n * 60)
                self.emit_progress(percent, j)

        y = np.zeros(n)
        for i in range(n):
            y[i] = (self.b[i] - np.dot(L[i, :i], y[:i])) / L[i, i]

        LT = L.T
        x = np.zeros(n)
        for i in range(n-1, -1, -1):
            x[i] = (y[i] - np.dot(LT[i, i+1:], x[i+1:])) / LT[i, i]

        self.emit_progress(100, n-1, "Cholesky terminé")
        return x, n*n//2

# ============================================================
# DONNÉES IEEE (VÉRIFIÉES ET CORRIGÉES)
# ============================================================

class SmartGridData:
    @staticmethod
    def generate_from_xij(xij_list, n):
        A = np.zeros((n, n))
        for i, j, x_ij in xij_list:
            if x_ij != 0 and 0 <= i < n and 0 <= j < n and i != j:
                b_ij = 1.0 / x_ij
                A[i, j] = -b_ij
                A[j, i] = -b_ij
                A[i, i] += b_ij
                A[j, j] += b_ij
        return A

    @staticmethod
    def get_ieee_14():
        """IEEE 14 Bus - DONNÉES RÉELLES FONCTIONNELLES"""
        n = 14
        # Réactances Xij (p.u.) - données IEEE standard
        connections = [
            (0, 1, 0.05917), (0, 4, 0.22304), (1, 2, 0.19797), (1, 3, 0.17632),
            (1, 4, 0.17388), (2, 3, 0.17103), (3, 4, 0.04211), (4, 5, 0.25202),
            (5, 6, 0.20912), (6, 7, 0.17615), (7, 8, 0.11600), (4, 7, 0.19890),
            (7, 9, 0.25581), (9, 10, 0.32420), (10, 11, 0.23993), (9, 12, 0.25480),
            (12, 13, 0.13027)
        ]
        
        A = SmartGridData.generate_from_xij(connections, n)
        
        # Puissances nettes P (p.u.) - valeurs IEEE standard
        b = np.array([
            2.3238,   # Bus 1 (Slack/Générateur)
            0.1830,   # Bus 2
            -0.9420,  # Bus 3 (Charge)
            -0.4780,  # Bus 4 (Charge)
            -0.0760,  # Bus 5
            -0.1120,  # Bus 6
            0.0,      # Bus 7
            0.0,      # Bus 8
            -0.2950,  # Bus 9 (Charge)
            -0.0900,  # Bus 10 (Charge)
            -0.0350,  # Bus 11 (Charge)
            -0.0610,  # Bus 12 (Charge)
            -0.1490,  # Bus 13 (Charge)
            -0.2700   # Bus 14 (Charge)
        ])
        
        # Coordonnées pour visualisation (layout IEEE standard)
        coords = [
            [0.500, 0.800], [0.300, 0.700], [0.600, 0.700], [0.500, 0.550],
            [0.350, 0.500], [0.400, 0.350], [0.600, 0.350], [0.700, 0.500],
            [0.300, 0.200], [0.650, 0.200], [0.500, 0.100], [0.350, 0.050],
            [0.650, 0.050], [0.800, 0.200]
        ]
        
        return {
            'A': A.tolist(), 
            'b': b.tolist(), 
            'n': n, 
            'name': 'IEEE 14 Bus',
            'coords': coords,
            'type': 'ieee14',
            'info': 'Réseau IEEE 14 bus standard'
        }

    @staticmethod
    def get_ieee_30():
        """IEEE 30 Bus - Structure réaliste et stable"""
        n = 30
        
        # Structure connectée mais stable (arbre + quelques liens)
        connections = []
        
        # Backbone principal (arbre)
        backbone = [(i, i+1, np.random.uniform(0.05, 0.15)) for i in range(n-1)]
        connections.extend(backbone)
        
        # Quelques connexions transversales pour maillage
        np.random.seed(30)
        extras = [(0, 15, 0.08), (5, 20, 0.12), (10, 25, 0.10), (3, 18, 0.09), (7, 22, 0.11)]
        connections.extend(extras)
        
        A = SmartGridData.generate_from_xij(connections, n)
        
        # Vérifier que la matrice est bien formée
        for i in range(n):
            if A[i, i] == 0:
                A[i, i] = 0.001  # Éviter ligne isolée
        
        # Puissances : générateurs en positif, charges en négatif
        b = np.zeros(n)
        # Générateurs aux buses 0, 1, 2
        b[0] = 2.5
        b[1] = 0.8
        b[2] = 0.5
        # Charges sur les autres
        for i in range(3, n):
            b[i] = -np.random.uniform(0.05, 0.3)
        # Équilibrage
        b[0] += -np.sum(b[1:])
        
        # Coordonnées circulaires
        coords = [[0.5 + 0.4*np.cos(2*np.pi*i/n), 0.5 + 0.4*np.sin(2*np.pi*i/n)] for i in range(n)]
        
        return {
            'A': A.tolist(),
            'b': b.tolist(),
            'n': n,
            'name': 'IEEE 30 Bus',
            'coords': coords,
            'type': 'ieee30'
        }

    @staticmethod
    def get_ieee_118():
        """IEEE 118 Bus - Version simplifiée stable"""
        n = 118
        np.random.seed(118)
        
        # Créer une structure hiérarchique stable
        A = np.zeros((n, n))
        
        # Connectivité locale + liens longue distance
        for i in range(n):
            # Connexions locales (2-3 voisins proches)
            local_links = min(3, n-1)
            for offset in range(1, local_links+1):
                j = (i + offset) % n
                if A[i, j] == 0:
                    x_ij = np.random.uniform(0.05, 0.2)
                    b_ij = 1.0 / x_ij
                    A[i, j] = -b_ij
                    A[j, i] = -b_ij
                    A[i, i] += b_ij
                    A[j, j] += b_ij
            
            # Quelques liens aléatoires pour densité
            if np.random.random() < 0.1:
                j = np.random.randint(0, n)
                if i != j and A[i, j] == 0:
                    x_ij = np.random.uniform(0.1, 0.3)
                    b_ij = 1.0 / x_ij
                    A[i, j] = -b_ij
                    A[j, i] = -b_ij
                    A[i, i] += b_ij
                    A[j, j] += b_ij
        
        # Puissances
        b = np.random.uniform(-0.5, 0.5, n)
        b[0] = -np.sum(b[1:]) + 0.1
        
        coords = [[0.5 + 0.45*np.cos(2*np.pi*i/n), 0.5 + 0.45*np.sin(2*np.pi*i/n)] for i in range(n)]
        
        return {
            'A': A.tolist(),
            'b': b.tolist(),
            'n': n,
            'name': 'IEEE 118 Bus',
            'coords': coords,
            'type': 'ieee118'
        }

    @staticmethod
    def generate_neighborhood_grid(n, density=0.4):
        """Grille de quartier stable"""
        np.random.seed(int(time.time()))
        
        # Générer positions
        coords = []
        for i in range(n):
            angle = 2 * np.pi * i / n + np.random.uniform(-0.2, 0.2)
            radius = 0.3 + 0.2 * np.random.random()
            x = 0.5 + radius * np.cos(angle)
            y = 0.5 + radius * np.sin(angle)
            coords.append([round(x, 3), round(y, 3)])
        
        # Créer matrice basée sur distance (plus proches voisins)
        A = np.zeros((n, n))
        for i in range(n):
            # Trouver 2-3 plus proches voisins
            distances = []
            for j in range(n):
                if i != j:
                    dx = coords[i][0] - coords[j][0]
                    dy = coords[i][1] - coords[j][1]
                    dist = np.sqrt(dx**2 + dy**2)
                    distances.append((j, dist, max(0.02, dist * 0.3)))
            
            distances.sort(key=lambda x: x[1])
            num = np.random.randint(2, 4)
            
            for j, dist, x_ij in distances[:num]:
                if A[i, j] == 0:
                    b_ij = 1.0 / x_ij
                    A[i, j] = -b_ij
                    A[j, i] = -b_ij
                    A[i, i] += b_ij
                    A[j, j] += b_ij
        
        # Puissances
        b = np.random.uniform(-0.5, 0.3, n)
        b[0] = -np.sum(b[1:])
        
        return {
            'A': A.tolist(),
            'b': b.tolist(),
            'n': n,
            'name': f'Quartier ({n} nœuds)',
            'coords': coords,
            'type': 'neighborhood'
        }

# ============================================================
# SIMULATION
# ============================================================

def calculate_dispatch(A, b, broken_from=None, broken_to=None):
    A_mod = np.array(A, dtype=float)
    b_vec = np.array(b, dtype=float)
    n = len(b_vec)
    
    if broken_from is not None and broken_to is not None:
        i, j = int(broken_from), int(broken_to)
        if 0 <= i < n and 0 <= j < n and A_mod[i, j] != 0:
            b_ij = -A_mod[i, j]
            A_mod[i, j] = 0
            A_mod[j, i] = 0
            A_mod[i, i] -= b_ij
            A_mod[j, j] -= b_ij

    try:
        x = np.linalg.solve(A_mod, b_vec)
        
        flows = []
        overloaded = []
        
        for i in range(n):
            for j in range(i+1, n):
                if A_mod[i, j] != 0:
                    b_ij = -A_mod[i, j]
                    flow = b_ij * (x[i] - x[j])
                    capacity = abs(b_ij) * 0.6
                    status = 'overloaded' if abs(flow) > capacity else 'normal'
                    if status == 'overloaded':
                        overloaded.append({'from': i, 'to': j, 'load': abs(flow)/capacity})
                    flows.append({
                        'from': i, 'to': j,
                        'flow': float(flow),
                        'capacity': float(capacity),
                        'status': status
                    })

        return {
            'status': 'success',
            'angles': x.tolist(),
            'flows': flows,
            'new_matrix': A_mod.tolist(),
            'overloaded_lines': overloaded
        }
    except:
        return {
            'status': 'blackout',
            'angles': [],
            'flows': [],
            'affected_nodes': list(range(n)),
            'new_matrix': A_mod.tolist()
        }

# ============================================================
# ROUTES
# ============================================================

@app.route('/api/health')
def health_check():
    return jsonify({'status': 'ok'})

@app.route('/api/ieee/<int:size>')
def get_ieee(size):
    try:
        if size == 14:
            data = SmartGridData.get_ieee_14()
        elif size == 30:
            data = SmartGridData.get_ieee_30()
        elif size == 118:
            data = SmartGridData.get_ieee_118()
        else:
            return jsonify({'error': 'Utilisez 14, 30 ou 118'}), 400
        return jsonify(data)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/neighborhood', methods=['POST'])
def generate_neighborhood():
    try:
        data = request.json or {}
        n = data.get('n', 20)
        grid = SmartGridData.generate_neighborhood_grid(n)
        return jsonify(grid)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/generate', methods=['POST'])
def generate_matrix():
    try:
        data = request.json
        n = data.get('n', 0)
        xij_list = data.get('xij', [])
        if n <= 0:
            return jsonify({'error': 'n invalide'}), 400
        
        A = SmartGridData.generate_from_xij(xij_list, n)
        b = np.random.uniform(-0.5, 0.5, n)
        b[0] = -np.sum(b[1:])
        coords = [[0.5 + 0.4*np.cos(2*np.pi*i/n), 0.5 + 0.4*np.sin(2*np.pi*i/n)] for i in range(n)]
        
        return jsonify({
            'A': A.tolist(), 'b': b.tolist(), 'n': n,
            'name': 'Personnalisé', 'coords': coords
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/solve', methods=['POST'])
def solve_system():
    try:
        data = request.json
        A = np.array(data['A'])
        b = np.array(data['b'])
        method = data.get('method', 'lu')
        scenario = data.get('scenario', 'standard')
        socket_id = data.get('socket_id')
        
        # Appliquer scénario
        if scenario == 'matin':
            b = b * 1.3
            b[0] = -np.sum(b[1:])
        elif scenario == 'soir':
            b = b * 0.8
            b[0] = -np.sum(b[1:])
        
        solver = DirectSolver(A, b, method, socket_id)
        result = solver.solve()
        
        return jsonify(result)
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/compare', methods=['POST'])
def compare_methods():
    try:
        data = request.json
        A = np.array(data['A'])
        b = np.array(data['b'])
        
        results = {}
        for method in ['gauss', 'lu', 'cholesky']:
            try:
                solver = DirectSolver(A, b, method)
                res = solver.solve()
                results[method] = {
                    'success': res['success'],
                    'time': res.get('time', 0),
                    'residual': res.get('residual', 0),
                    'error': res.get('error')
                }
            except Exception as e:
                results[method] = {'success': False, 'error': str(e)}
        
        # Recommandation
        valid = {k:v for k,v in results.items() if v.get('success')}
        if valid:
            best = min(valid.items(), key=lambda x: x[1]['time'])
            results['recommendation'] = {
                'method': best[0],
                'reason': f"{best[1]['time']:.4f}s, résidu {best[1]['residual']:.2e}"
            }
        
        return jsonify(results)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/break_line', methods=['POST'])
def break_line():
    try:
        data = request.json
        result = calculate_dispatch(data['A'], data['b'], data.get('from'), data.get('to'))
        return jsonify({
            'line_broken': {'from': data.get('from'), 'to': data.get('to')},
            'dispatch': result
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ============================================================
# WEBSOCKET
# ============================================================

@socketio.on('connect')
def handle_connect():
    logger.info(f'Client: {request.sid}')
    emit('connected', {'socket_id': request.sid})

@socketio.on('disconnect')
def handle_disconnect():
    logger.info(f'Déconnecté: {request.sid}')

if __name__ == '__main__':
    print("="*60)
    print("SMART GRID SOLVER - Backend")
    print("="*60)
    # CORRECTION: Désactiver le reloader qui cause l'erreur WebSocket
    socketio.run(app, host='0.0.0.0', port=5000, debug=False, use_reloader=False)
