import React, { useState, useEffect, useRef } from 'react';
import './App.css';

const API_URL = 'http://localhost:5000';

const App = () => {
  const [network, setNetwork] = useState(null);
  const [selectedMethod, setSelectedMethod] = useState('lu');
  const [scenario, setScenario] = useState('standard');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [brokenLine, setBrokenLine] = useState(null);
  const [dispatchResult, setDispatchResult] = useState(null);
  const [litNodes, setLitNodes] = useState(new Set());
  const [blackoutNodes, setBlackoutNodes] = useState(new Set());
  
  const ws = useRef(null);

  useEffect(() => {
    ws.current = new WebSocket(`ws://localhost:5000/socket.io/?EIO=3&transport=websocket`);
    
    ws.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.node !== undefined && network) {
          setLitNodes(prev => new Set([...prev, data.node]));
          setProgress(prev => Math.min(prev + (100/network.n), 100));
        }
      } catch(e) {}
    };
    
    return () => ws.current.close();
  }, [network]);

  const loadIEEE = async (size) => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/api/ieee/${size}`);
      const data = await res.json();
      
      // Conversion sécurisée des données en nombres
      if (data.A) {
        data.A = data.A.map(row => row.map(val => Number(val) || 0));
      }
      if (data.b) {
        data.b = data.b.map(val => Number(val) || 0);
      }
      
      setNetwork(data);
      setResults(null);
      setComparison(null);
      setLitNodes(new Set());
      setBlackoutNodes(new Set());
      setDispatchResult(null);
    } catch (e) {
      alert('Erreur chargement réseau');
    } finally {
      setLoading(false);
    }
  };

  const handleFileImport = (e) => {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        // Conversion en nombres
        if (data.matrix) {
          data.matrix = data.matrix.map(row => row.map(val => Number(val) || 0));
        }
        if (data.vector) {
          data.vector = data.vector.map(val => Number(val) || 0);
        }
        
        setNetwork({
          A: data.matrix,
          b: data.vector,
          n: data.matrix.length,
          name: 'Réseau Importé',
          coords: data.coords || generateCoords(data.matrix.length)
        });
      } catch {
        alert('Format JSON invalide');
      }
    };
    reader.readAsText(file);
  };

  const generateCoords = (n) => {
    return Array.from({length: n}, (_, i) => [
      0.5 + 0.4 * Math.cos(2 * Math.PI * i / n),
      0.5 + 0.4 * Math.sin(2 * Math.PI * i / n)
    ]);
  };

  const solve = async () => {
    if (!network) return;
    
    setLoading(true);
    setProgress(0);
    setLitNodes(new Set());
    
    try {
      const res = await fetch(`${API_URL}/api/solve`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          A: network.A,
          b: network.b,
          method: selectedMethod,
          scenario: scenario
        })
      });
      
      const data = await res.json();
      
      setTimeout(() => {
        setResults(data);
        if (!data.error) {
          setLitNodes(new Set(Array.from({length: network.n}, (_, i) => i)));
        }
        setLoading(false);
      }, 1000);
      
    } catch (e) {
      alert('Erreur calcul');
      setLoading(false);
    }
  };

  const compareMethods = async () => {
    if (!network) return;
    setLoading(true);
    
    try {
      const res = await fetch(`${API_URL}/api/compare`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          A: network.A,
          b: network.b
        })
      });
      
      const data = await res.json();
      setComparison(data);
    } catch (e) {
      alert('Erreur comparaison');
    } finally {
      setLoading(false);
    }
  };

  const simulateBreak = async () => {
    const from = prompt("Nœud départ (0-" + (network.n-1) + "):");
    const to = prompt("Nœud arrivée (0-" + (network.n-1) + "):");
    if (from === null || to === null) return;
    
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/break_line`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          A: network.A,
          b: network.b,
          from: parseInt(from),
          to: parseInt(to)
        })
      });
      
      const data = await res.json();
      setBrokenLine({from: parseInt(from), to: parseInt(to), status: data.status});
      setDispatchResult(data.dispatch);
      
      if (data.status === 'blackout') {
        setBlackoutNodes(new Set(Array.from({length: network.n}, (_, i) => i)));
        setLitNodes(new Set());
      } else {
        setNetwork({...network, A: data.new_matrix.map(row => row.map(val => Number(val) || 0))});
        setBlackoutNodes(new Set());
        setLitNodes(new Set(Array.from({length: network.n}, (_, i) => i)));
      }
    } catch (e) {
      alert('Erreur simulation');
    } finally {
      setLoading(false);
    }
  };

  const modifyB = (index, value) => {
    const newB = [...network.b];
    newB[index] = parseFloat(value) || 0;
    setNetwork({...network, b: newB});
  };

  // FONCTION CORRIGÉE - Gestion sécurisée des nombres
  const renderMatrix = (matrix, title) => {
    if (!matrix || !Array.isArray(matrix)) return null;
    
    return (
      <div className="matrix-container">
        <h3>{title}</h3>
        <div className="matrix">
          {matrix.slice(0, 10).map((row, i) => (
            <div key={i} className="matrix-row">
              {Array.isArray(row) && row.slice(0, 8).map((val, j) => {
                // Conversion sécurisée en nombre
                const numVal = Number(val);
                const displayVal = !isNaN(numVal) ? numVal.toFixed(2) : '0.00';
                
                return (
                  <span key={j} className={`matrix-cell ${i===j ? 'diagonal' : ''}`}>
                    {displayVal}
                  </span>
                );
              })}
              {row.length > 8 && <span style={{color: '#666'}}>...</span>}
            </div>
          ))}
          {matrix.length > 10 && <div style={{color: '#666', padding: '5px'}}>...</div>}
        </div>
      </div>
    );
  };

  return (
    <div className="app">
      <header className="header">
        <h1>🔌 Smart Grid Solver - Analyse Numérique</h1>
        <p>Résolution de Ax=b par méthodes directes (LU, Gauss, Cholesky)</p>
      </header>

      <div className="main-container">
        <div className="control-panel">
          <div className="section">
            <h2>📁 Chargement Données</h2>
            <div className="button-group">
              <button onClick={() => loadIEEE(14)} className="btn ieee">IEEE 14</button>
              <button onClick={() => loadIEEE(30)} className="btn ieee">IEEE 30</button>
              <button onClick={() => loadIEEE(118)} className="btn ieee">IEEE 118</button>
            </div>
            <div className="file-import">
              <label>Importer JSON (Xij):</label>
              <input type="file" accept=".json" onChange={handleFileImport} />
            </div>
          </div>

          {network && (
            <>
              <div className="section">
                <h2>⚙️ Paramètres</h2>
                <label>Méthode:</label>
                <select value={selectedMethod} onChange={(e) => setSelectedMethod(e.target.value)}>
                  <option value="lu">Factorisation LU</option>
                  <option value="gauss">Élimination de Gauss</option>
                  <option value="cholesky">Cholesky (SDP)</option>
                </select>

                <label>Scénario:</label>
                <select value={scenario} onChange={(e) => setScenario(e.target.value)}>
                  <option value="standard">Standard</option>
                  <option value="matin">Matin (Pic +30%)</option>
                  <option value="soir">Soir (Réduit -20%)</option>
                </select>

                <button onClick={solve} className="btn solve" disabled={loading}>
                  {loading ? `Calcul... ${Math.round(progress)}%` : '🚀 Résoudre'}
                </button>
                
                <button onClick={compareMethods} className="btn compare">
                  ⚖️ Comparer méthodes
                </button>
                
                <button onClick={simulateBreak} className="btn danger">
                  💥 Simuler panne
                </button>
              </div>

              <div className="section">
                <h2>📊 Vecteur b</h2>
                <div className="b-editor">
                  {network.b.slice(0, 5).map((val, i) => (
                    <div key={i} className="b-row">
                      <label>b[{i}]:</label>
                      <input 
                        type="number" 
                        step="0.1" 
                        value={val} 
                        onChange={(e) => modifyB(i, e.target.value)}
                      />
                    </div>
                  ))}
                  {network.n > 5 && <span>... ({network.n-5} autres)</span>}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="visualization">
          {network && network.coords ? (
            <div className="network-viz">
              <h2>Réseau: {network.name} ({network.n} nœuds)</h2>
              <svg viewBox="0 0 1 1" className="network-svg">
                {network.A.map((row, i) => 
                  row.map((val, j) => {
                    if (j > i && val !== 0 && network.coords[i] && network.coords[j]) {
                      const [x1, y1] = network.coords[i];
                      const [x2, y2] = network.coords[j];
                      const isBroken = brokenLine?.from === i && brokenLine?.to === j;
                      return (
                        <line 
                          key={`${i}-${j}`}
                          x1={x1} y1={y1} x2={x2} y2={y2}
                          stroke={isBroken ? '#ff0000' : litNodes.has(i) && litNodes.has(j) ? '#00ff88' : '#444'}
                          strokeWidth="0.01"
                          strokeDasharray={isBroken ? "0.02,0.02" : "none"}
                        />
                      );
                    }
                    return null;
                  })
                )}
                
                {network.coords.map(([x, y], i) => (
                  <g key={i}>
                    <circle 
                      cx={x} cy={y} r="0.025"
                      fill={blackoutNodes.has(i) ? 'red' : litNodes.has(i) ? '#00ff88' : '#333'}
                      stroke="white"
                      strokeWidth="0.005"
                    />
                    <text x={x} y={y-0.03} fontSize="0.03" fill="white" textAnchor="middle">
                      {i}
                    </text>
                  </g>
                ))}
              </svg>
              
              <div className="legend">
                <span className="legend-item"><span className="dot lit"></span> Alimenté</span>
                <span className="legend-item"><span className="dot unlit"></span> Hors tension</span>
                <span className="legend-item"><span className="dot blackout"></span> Blackout</span>
              </div>
            </div>
          ) : (
            <div className="placeholder">
              <p>Sélectionnez un cas IEEE pour commencer</p>
            </div>
          )}
        </div>

        <div className="math-panel">
          {network && (
            <>
              {renderMatrix(network.A, 'Matrice A (Susceptances)')}
              {renderMatrix(network.b.map(v => [v]), 'Vecteur b (Puissances)')}
              
              {results && (
                <div className="results-section">
                  <h2>🔬 Résultats - {results.method?.toUpperCase()}</h2>
                  <div className="metrics">
                    <div className="metric">
                      <label>Temps:</label>
                      <value>{results.time?.toFixed(4)}s</value>
                    </div>
                    <div className="metric">
                      <label>Résidu:</label>
                      <value>{results.residual?.toExponential(2)}</value>
                    </div>
                    <div className="metric">
                      <label>Conditionnement:</label>
                      <value>{results.condition_number?.toFixed(2) || 'N/A'}</value>
                    </div>
                  </div>
                  
                  <h3>Solution θ (angles):</h3>
                  <div className="solution-vector">
                    {results.solution?.slice(0, 8).map((val, i) => (
                      <div key={i} className="sol-item">
                        θ<sub>{i}</sub> = {Number(val).toFixed(4)} rad
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {comparison && (
                <div className="comparison-section">
                  <h2>⚖️ Comparaison</h2>
                  <table className="compare-table">
                    <thead>
                      <tr>
                        <th>Méthode</th>
                        <th>Temps (s)</th>
                        <th>Résidu</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(comparison)
                        .filter(([key]) => key !== 'recommendation')
                        .map(([method, data]) => (
                        <tr key={method} className={comparison.recommendation?.method === method ? 'best' : ''}>
                          <td>{method.toUpperCase()}</td>
                          <td>{data.time?.toFixed(4) || 'N/A'}</td>
                          <td>{data.residual?.toExponential(2) || 'N/A'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  
                  {comparison.recommendation && (
                    <div className="recommendation">
                      <h3>🏆 Recommandé: {comparison.recommendation.method.toUpperCase()}</h3>
                      <p>{comparison.recommendation.reason}</p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;
