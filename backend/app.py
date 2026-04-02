import numpy as np
from flask import Flask, request, jsonify
from flask_socketio import SocketIO
from flask_cors import CORS
import time
import math
from collections import deque

app = Flask(__name__)
CORS(app, resources={
    r"/api/*": {
        "origins": ["http://localhost:3000", "http://127.0.0.1:3000"],
        "methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type"]
    }
})
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading',
                    logger=False, engineio_logger=False)


# ============================================================
# DONNÉES IEEE RÉELLES
# ============================================================

class RealIEEEData:

    @staticmethod
    def _build_admittance_matrix(n, branches):
        B = np.zeros((n, n))
        for i, j, x in branches:
            b = 1.0 / x if x != 0 else 0
            if i != j:
                ii, jj = i - 1, j - 1
                B[ii, jj] -= b
                B[jj, ii] -= b
                B[ii, ii] += b
                B[jj, jj] += b
        return B

    @staticmethod
    def get_ieee_14_real():
        n = 14
        branches = [
            (1,2,0.05917),(1,5,0.22304),(2,3,0.19797),(2,4,0.17632),
            (2,5,0.17388),(3,4,0.17103),(4,5,0.04211),(4,7,0.20912),
            (4,9,0.55618),(5,6,0.25202),(6,11,0.19890),(6,12,0.25581),
            (6,13,0.13027),(7,8,0.17615),(7,9,0.11001),(9,10,0.08450),
            (9,14,0.27038),(10,11,0.19207),(12,13,0.19988),(13,14,0.34802),
        ]
        B = RealIEEEData._build_admittance_matrix(n, branches)

        # Puissances nettes en pu (base 100 MVA) — valeurs directes Matpower
        # CORRECTION : on ne divise plus par 100 une 2e fois, les valeurs sont déjà en pu
        P_net = np.array([
            2.3239, 0.1830, -0.9420, -0.4780, -0.0760, -0.1120,
            0.0000, 0.0000, -0.2950, -0.0900, -0.0350, -0.0610,
           -0.1350, -0.1490
        ])
        # Bus slack absorbe le déséquilibre résiduel
        P_net[0] = -float(np.sum(P_net[1:]))

        coords = [
            [0.50,0.90],[0.25,0.72],[0.75,0.72],[0.50,0.54],
            [0.18,0.38],[0.82,0.38],[0.67,0.28],[0.35,0.28],
            [0.50,0.16],[0.67,0.16],[0.18,0.16],[0.35,0.08],
            [0.50,0.08],[0.67,0.08],
        ]
        return {
            'A': B.tolist(), 'b': P_net.tolist(), 'n': n,
            'name': 'IEEE 14 Bus (Real Data)', 'coords': coords,
            'slack_bus': 0, 'source': 'Matpower case14.m',
            'lines': len(branches),
            'branches': [[i-1, j-1] for i, j, _ in branches],
        }

    @staticmethod
    def get_ieee_30_real():
        n = 30
        branches = [
            (1,2,0.0575),(1,3,0.1652),(2,4,0.1737),(3,4,0.0379),
            (2,5,0.1983),(2,6,0.1763),(4,6,0.0414),(5,7,0.1160),
            (6,7,0.0820),(6,8,0.0420),(6,9,0.0318),(6,10,0.0309),
            (9,11,0.1271),(9,10,0.0845),(4,12,0.0236),(12,13,0.0384),
            (12,14,0.0434),(12,15,0.0405),(12,16,0.0429),(14,15,0.0434),
            (16,17,0.0389),(15,18,0.0599),(18,19,0.0132),(19,20,0.0244),
            (10,20,0.0936),(10,17,0.0329),(10,21,0.0348),(10,22,0.0727),
            (21,22,0.0116),(15,23,0.0419),(22,24,0.0280),(23,24,0.0233),
            (24,25,0.0985),(25,26,0.0238),(25,27,0.0389),(28,27,0.0195),
            (27,29,0.0378),(27,30,0.0410),(29,30,0.0355),(8,28,0.0437),
            (6,28,0.0599),
        ]
        B = RealIEEEData._build_admittance_matrix(n, branches)

        # En pu — valeurs directes
        P_net = np.array([
            0.2604, 0.4020,-0.0240,-0.0760, 0.0000,-0.9420,
            0.0000,-0.3000,-0.0580,-0.1120, 0.0000,-0.0620,
            0.0000,-0.0820,-0.0700,-0.0350,-0.0900,-0.0320,
           -0.0950,-0.0220,-0.1750,-0.0350,-0.0320,-0.0870,
           -0.0240,-0.0240,-0.0430,-0.0260,-0.0240,-0.1060,
        ])
        P_net[0] = -float(np.sum(P_net[1:]))

        coords = []
        for i in range(n):
            angle = (2 * math.pi * i) / n - math.pi / 2
            r = 0.4 if i < 15 else 0.35
            coords.append([0.5 + r * math.cos(angle), 0.5 + r * math.sin(angle)])

        return {
            'A': B.tolist(), 'b': P_net.tolist(), 'n': n,
            'name': 'IEEE 30 Bus (Real Data)', 'coords': coords,
            'slack_bus': 0, 'source': 'Matpower case30.m',
            'lines': len(branches),
            'branches': [[i-1, j-1] for i, j, _ in branches],
        }

    @staticmethod
    def get_ieee_118_real():
        n = 118
        branches = [
            (1,2,0.0303),(1,3,0.0129),(2,12,0.0238),(3,5,0.0386),(3,12,0.0219),
            (4,5,0.0179),(4,11,0.0203),(5,6,0.0194),(5,11,0.0209),(6,7,0.0258),
            (7,12,0.0143),(8,9,0.0023),(8,5,0.0267),(9,10,0.0022),(10,11,0.0060),
            (11,12,0.0173),(11,13,0.0176),(12,14,0.0107),(12,16,0.0232),(13,23,0.0244),
            (14,15,0.0178),(15,16,0.0209),(15,19,0.0124),(16,17,0.0187),(16,20,0.0171),
            (17,18,0.0173),(17,22,0.0144),(18,21,0.0109),(19,20,0.0254),(20,21,0.0184),
            (21,22,0.0209),(22,23,0.0141),(23,25,0.0145),(24,25,0.0108),(24,72,0.0282),
            (25,27,0.0319),(26,25,0.0072),(26,30,0.0238),(27,28,0.0192),(27,32,0.0386),
            (28,29,0.0237),(29,31,0.0267),(30,17,0.0166),(30,38,0.0294),(31,32,0.0231),
            (32,113,0.0416),(33,37,0.0202),(34,35,0.0064),(34,36,0.0114),(34,37,0.0306),
            (35,36,0.0058),(36,40,0.0297),(37,38,0.0175),(37,39,0.0275),(38,65,0.0233),
            (39,40,0.0271),(40,41,0.0191),(40,42,0.0161),(41,42,0.0049),(42,49,0.0715),
            (42,49,0.0715),(43,44,0.0231),(44,45,0.0173),(45,46,0.0147),(45,49,0.0697),
            (46,47,0.0105),(46,48,0.0151),(47,69,0.0278),(48,49,0.0295),(49,50,0.0170),
            (49,51,0.0374),(49,54,0.0536),(49,66,0.0263),(49,69,0.0269),(50,57,0.0173),
            (51,52,0.0203),(51,58,0.0255),(52,53,0.0405),(53,54,0.0263),(54,55,0.0169),
            (54,56,0.0081),(54,59,0.0503),(55,56,0.0089),(55,59,0.0466),(56,57,0.0131),
            (56,58,0.0177),(56,59,0.0273),(57,60,0.0189),(58,60,0.0186),(59,60,0.0182),
            (59,61,0.0145),(60,61,0.0188),(60,62,0.0124),(61,62,0.0172),(62,66,0.0258),
            (62,67,0.0295),(63,59,0.0386),(63,64,0.0173),(64,65,0.0216),(65,66,0.0263),
            (65,68,0.0258),(66,67,0.0224),(68,69,0.0017),(68,81,0.0140),(68,116,0.0049),
            (69,70,0.0305),(69,75,0.0183),(70,71,0.0128),(70,74,0.0327),(70,75,0.0317),
            (71,72,0.0226),(72,73,0.0140),(72,74,0.0153),(73,76,0.0128),(74,75,0.0273),
            (75,77,0.0173),(75,118,0.0198),(76,77,0.0104),(76,118,0.0204),(77,78,0.0264),
            (77,80,0.0296),(77,80,0.0296),(78,79,0.0132),(79,80,0.0156),(80,96,0.0171),
            (80,97,0.0173),(80,98,0.0234),(80,99,0.0295),(81,80,0.0273),(82,83,0.0298),
            (83,84,0.0298),(83,85,0.0212),(84,85,0.0199),(85,86,0.0141),(85,88,0.0255),
            (85,89,0.0295),(86,87,0.0164),(87,88,0.0151),(88,89,0.0274),(89,90,0.0099),
            (89,90,0.0099),(89,91,0.0185),(89,92,0.0186),(90,91,0.0099),(91,92,0.0113),
            (92,93,0.0266),(92,94,0.0169),(92,100,0.0138),(92,102,0.0295),(93,94,0.0295),
            (94,95,0.0143),(94,96,0.0167),(95,96,0.0166),(96,97,0.0255),(97,98,0.0131),
            (98,100,0.0211),(99,100,0.0178),(100,101,0.0252),(100,103,0.0376),(100,104,0.0456),
            (100,106,0.0180),(101,102,0.0270),(101,103,0.0424),(103,104,0.0152),(103,105,0.0185),
            (103,110,0.0278),(104,105,0.0184),(105,106,0.0114),(105,107,0.0231),(105,108,0.0135),
            (106,107,0.0143),(108,109,0.0165),(108,110,0.0166),(109,110,0.0228),(110,111,0.0190),
            (110,112,0.0256),(111,112,0.0146),(111,113,0.0164),(112,113,0.0100),(113,114,0.0101),
            (113,115,0.0117),(114,115,0.0150),(115,116,0.0134),(115,117,0.0297),(116,117,0.0119),
            (116,118,0.0220),(117,118,0.0220),
        ]
        B = RealIEEEData._build_admittance_matrix(n, branches)

        # MW → pu (base 100 MVA) : division par 100 une seule fois
        P_gen_mw = {
            1:0,4:0,6:0,8:0,10:450,12:85,15:0,18:0,19:0,24:0,25:220,26:314,
            27:0,31:7,32:0,34:0,36:0,40:0,42:0,46:19,49:204,54:48,55:0,56:0,
            59:155,61:160,62:0,65:391,66:392,69:516,70:0,72:0,73:0,74:0,76:0,
            77:0,80:477,85:0,87:4,89:607,90:0,91:0,92:0,99:0,100:252,103:40,
            104:0,105:0,107:0,110:0,111:36,112:0,113:0,116:0,
        }
        P_load_mw = {
            2:22,3:39,4:39,5:0,6:52,7:19,8:28,9:0,10:0,11:70,12:47,13:34,
            14:14,15:90,16:25,17:11,18:60,19:45,20:18,21:14,22:10,23:7,24:13,
            25:0,26:0,27:71,28:17,29:24,30:0,31:43,32:59,33:23,34:59,35:33,
            36:31,37:0,38:0,39:27,40:66,41:37,42:96,43:18,44:16,45:53,46:28,
            47:34,48:20,49:87,50:17,51:17,52:18,53:23,54:113,55:63,56:84,57:12,
            58:12,59:277,60:78,61:0,62:77,63:0,64:0,65:0,66:39,67:28,68:0,
            69:0,70:66,71:0,72:12,73:6,74:68,75:47,76:68,77:61,78:71,79:39,
            80:130,81:0,82:54,83:20,84:11,85:24,86:21,87:0,88:48,89:0,90:163,
            91:10,92:65,93:12,94:30,95:42,96:38,97:15,98:34,99:42,100:37,
            101:58,102:18,103:0,104:38,105:31,106:43,107:50,108:2,109:8,
            110:39,111:0,112:68,113:6,114:8,115:22,116:184,117:20,118:33,
        }
        P_net = np.zeros(n)
        for bus, mw in P_gen_mw.items():
            P_net[bus-1] += mw / 100.0
        for bus, mw in P_load_mw.items():
            P_net[bus-1] -= mw / 100.0
        P_net[0] = -float(np.sum(P_net[1:]))

        coords = []
        cols = 12
        for i in range(n):
            row = i // cols
            col = i % cols
            coords.append([
                0.05 + col * (0.90 / (cols - 1)),
                0.05 + row * (0.90 / 9),
            ])

        return {
            'A': B.tolist(), 'b': P_net.tolist(), 'n': n,
            'name': 'IEEE 118 Bus (Real Data)', 'coords': coords,
            'slack_bus': 0, 'source': 'Matpower case118.m',
            'lines': len(branches),
            'branches': [[i-1, j-1] for i, j, _ in branches],
        }


# ============================================================
# UTILITAIRES TOPOLOGIE
# ============================================================

def apply_broken_lines(A, broken_lines, n):
    A_mod = np.array(A, dtype=float)
    for line in broken_lines:
        i, j = int(line['from']), int(line['to'])
        if 0 <= i < n and 0 <= j < n:
            bij = -A_mod[i, j]
            if bij > 0:
                A_mod[i, i] -= bij
                A_mod[j, j] -= bij
                A_mod[i, j] = 0.0
                A_mod[j, i] = 0.0
    return A_mod


def find_connected_nodes(A_mod, slack_bus, n):
    visited = set()
    queue = deque([slack_bus])
    visited.add(slack_bus)
    while queue:
        node = queue.popleft()
        for nb in range(n):
            if nb not in visited and A_mod[node, nb] != 0:
                visited.add(nb)
                queue.append(nb)
    return visited


def reduce_system(A_mod, b, connected_nodes, slack_bus):
    node_map = sorted([nd for nd in connected_nodes if nd != slack_bus])
    if not node_map:
        return None, None, node_map
    A_red = A_mod[np.ix_(node_map, node_map)]
    b_red = b[node_map]
    return A_red, b_red, node_map


# ============================================================
# SOLVER
# ============================================================

class DirectSolver:
    def __init__(self, A, b, method='lu'):
        self.A      = np.array(A, dtype=float)
        self.b      = np.array(b, dtype=float)
        self.n      = len(b)
        self.method = method
        self.steps  = []

    def solve(self):
        t0 = time.time()
        if   self.method == 'gauss':    x, it = self._gauss_elimination()
        elif self.method == 'lu':       x, it = self._lu_factorization()
        elif self.method == 'cholesky': x, it = self._cholesky()
        else: raise ValueError("Méthode inconnue")
        return {
            'solution':  x.tolist(),
            'time':      time.time() - t0,
            'iterations': it,
            'residual':  float(np.linalg.norm(self.A @ x - self.b)),
        }

    def _gauss_elimination(self):
        A, b, n = self.A.copy(), self.b.copy(), self.n
        it = 0
        for k in range(n - 1):
            mx = np.argmax(np.abs(A[k:, k])) + k
            if A[mx, k] == 0: raise ValueError("Matrice singulière")
            if mx != k:
                A[[k, mx]] = A[[mx, k]]
                b[[k, mx]] = b[[mx, k]]
            for i in range(k + 1, n):
                if A[i, k] != 0:
                    f = A[i, k] / A[k, k]
                    A[i, k:] -= f * A[k, k:]
                    b[i]      -= f * b[k]
                    it += 1
            self.steps.append({'step': k, 'matrix': A.copy().tolist()})
        x = np.zeros(n)
        for i in range(n - 1, -1, -1):
            x[i] = (b[i] - np.dot(A[i, i+1:], x[i+1:])) / A[i, i]
            it += 1
        return x, it

    def _lu_factorization(self):
        A, n = self.A.copy(), self.n
        L, P = np.eye(n), np.eye(n)
        it = 0
        for k in range(n - 1):
            mx = np.argmax(np.abs(A[k:, k])) + k
            if k != mx:
                A[[k, mx]] = A[[mx, k]]
                P[[k, mx]] = P[[mx, k]]
                if k > 0: L[[k, mx], :k] = L[[mx, k], :k]
            for i in range(k + 1, n):
                L[i, k] = A[i, k] / A[k, k]
                A[i, k:] -= L[i, k] * A[k, k:]
                it += 1
        U, Pb = A, P @ self.b
        y = np.zeros(n)
        for i in range(n):
            y[i] = Pb[i] - np.dot(L[i, :i], y[:i])
        x = np.zeros(n)
        for i in range(n - 1, -1, -1):
            x[i] = (y[i] - np.dot(U[i, i+1:], x[i+1:])) / U[i, i]
        return x, it

    def _cholesky(self):
        if not self._is_spd():
            raise ValueError(
                "Matrice non symétrique définie positive — "
                "Cholesky inapplicable sur la matrice Y-bus DC"
            )
        n, L = self.n, np.zeros((self.n, self.n))
        it = 0
        for j in range(n):
            L[j, j] = np.sqrt(self.A[j, j] - sum(L[j, k]**2 for k in range(j)))
            for i in range(j + 1, n):
                L[i, j] = (self.A[i, j] - sum(L[i,k]*L[j,k] for k in range(j))) / L[j, j]
                it += 1
        y = np.zeros(n)
        for i in range(n):
            y[i] = (self.b[i] - np.dot(L[i, :i], y[:i])) / L[i, i]
        x = np.zeros(n)
        LT = L.T
        for i in range(n - 1, -1, -1):
            x[i] = (y[i] - np.dot(LT[i, i+1:], x[i+1:])) / LT[i, i]
        return x, it

    def _is_spd(self):
        if not np.allclose(self.A, self.A.T): return False
        try: np.linalg.cholesky(self.A); return True
        except Exception: return False


# ============================================================
# API
# ============================================================

@app.route('/api/health')
def health():
    return jsonify({'status': 'ok', 'message': 'Backend Smart Grid IEEE'})


@app.route('/api/ieee/<int:size>')
def get_ieee(size):
    try:
        if   size == 14:  data = RealIEEEData.get_ieee_14_real()
        elif size == 30:  data = RealIEEEData.get_ieee_30_real()
        elif size == 118: data = RealIEEEData.get_ieee_118_real()
        else: return jsonify({'error': 'Utilisez 14, 30 ou 118'}), 400
        return jsonify(data)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/solve', methods=['POST'])
def solve_system():
    data         = request.json
    A_orig       = data['A']
    b_orig       = data['b']
    method       = data.get('method', 'lu')
    scenario     = data.get('scenario', 'standard')
    broken_lines = data.get('broken_lines', [])
    slack_bus    = int(data.get('slack_bus', 0))
    n            = len(b_orig)

    b_vec = np.array(b_orig, dtype=float)
    if scenario == 'matin': b_vec *= 1.3
    elif scenario == 'soir': b_vec *= 0.8

    try:
        A_mod     = apply_broken_lines(A_orig, broken_lines, n)
        connected = find_connected_nodes(A_mod, slack_bus, n)
        blackout  = [i for i in range(n) if i not in connected]

        A_red, b_red, node_map = reduce_system(A_mod, b_vec, connected, slack_bus)

        if A_red is None:
            return jsonify({
                'solution': [0.0] + [None]*(n-1),
                'blackout_nodes': list(range(1, n)),
                'lit_nodes': [slack_bus],
                'isolated_islands': True,
                'method': method, 'time': 0, 'iterations': 0,
                'residual': 0, 'condition_number': 0,
            })

        res = DirectSolver(A_red.tolist(), b_red.tolist(), method).solve()

        # Reconstruction vecteur θ complet
        theta = [None] * n
        theta[slack_bus] = 0.0
        for loc, glob in enumerate(node_map):
            theta[glob] = float(res['solution'][loc])

        try:    cond = float(np.linalg.cond(A_red))
        except: cond = float('inf')

        return jsonify({
            'solution':         theta,
            'time':             res['time'],
            'iterations':       res['iterations'],
            'residual':         res['residual'],
            'condition_number': cond,
            'method':           method,
            'scenario':         scenario,
            'blackout_nodes':   blackout,
            'lit_nodes':        list(connected),
            'isolated_islands': len(blackout) > 0,
        })

    except Exception as e:
        return jsonify({'error': str(e), 'method': method}), 500


@app.route('/api/compare', methods=['POST'])
def compare_methods():
    data         = request.json
    A            = data['A']
    b            = data['b']
    broken_lines = data.get('broken_lines', [])
    slack_bus    = int(data.get('slack_bus', 0))
    n            = len(b)

    A_mod     = apply_broken_lines(A, broken_lines, n)
    connected = find_connected_nodes(A_mod, slack_bus, n)
    A_red, b_red, _ = reduce_system(A_mod, np.array(b, dtype=float), connected, slack_bus)

    results = {}
    for method in ['gauss', 'lu', 'cholesky']:
        try:
            res = DirectSolver(A_red.tolist(), b_red.tolist(), method).solve()
            results[method] = {'time': res['time'], 'residual': res['residual'], 'iterations': res['iterations']}
        except Exception as e:
            results[method] = {'error': str(e)}

    valid = {k: v for k, v in results.items() if 'error' not in v}
    if valid:
        best = min(valid.items(), key=lambda x: x[1]['time'])
        results['recommendation'] = {'method': best[0], 'reason': f"Plus rapide ({best[1]['time']*1000:.2f}ms)"}

    return jsonify(results)


if __name__ == '__main__':
    print("🚀 Serveur Smart Grid")
    print("📡 http://localhost:5000/api/health")
    socketio.run(app, debug=True, port=5000, host='0.0.0.0', allow_unsafe_werkzeug=True)