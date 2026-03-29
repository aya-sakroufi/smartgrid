import React, { useState, useEffect, useRef } from 'react';
import './App.css';

const API_URL = 'http://localhost:5000';

const App = () => {
  // États principaux
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

  // Connexion WebSocket pour temps réel
  useEffect(() => {
    ws.current = new WebSocket(`ws://localhost:5000/socket.io/?EIO=3&transport=websocket`);
    
    ws.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.node !== undefined) {
        // Allumer le nœud progressivement pendant calcul
        setLitNodes(prev => new Set([...prev, data.node]));
        setProgress(prev => Math.min(prev + (100/network.n), 100));
      }
    };
    
    return () => ws.current.close();
  }, [network]);

  // Chargement d'un cas IEEE
  const loadIEEE = async (size) => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/api/ieee/${size}`);
      const data = await res.json();
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

  // Import fichier custom
  const handleFileImport = (e) => {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
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
    // Génération circulaire si pas de coords
    return Array.from({length: n}, (_, i) => [
      0.5 + 0.4 * Math.cos(2 * Math.PI * i / n),
      0.5 + 0.4 * Math.sin(2 * Math.PI * i / n)
    ]);
  };

  // Résolution avec animation
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
      
      // Simulation animation finale
      setTimeout(() => {
        setResults(data);
        // Tous les nœuds s'allument à la fin si succès
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

  // Comparaison des méthodes
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

  // Simulation de panne
  const simulateBreak = async (from, to) => {
    if (!network) return;
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
      setBrokenLine(data.line_broken);
      setDispatchResult(data.dispatch);
      
      // Gestion visuelle blackout
      if (data.dispatch.status === 'blackout') {
        setBlackoutNodes(new Set(data.dispatch.blackout_nodes));
        setLitNodes(new Set());
      } else {
        setBlackoutNodes(new Set());
        setLitNodes(new Set(Array.from({length: network.n}, (_, i) => i)));
      }
      
      // Mise à jour matrice si dispatch réussi
      if (data.dispatch.status === 'success') {
        setNetwork({...network, A: data.new_matrix});
      }
      
    } catch (e) {
      alert('Erreur simulation panne');
    } finally {
      setLoading(false);
    }
  };

  // Modification vecteur b
  const modifyB = (index, value) => {
    const newB = [...network.b];
    newB[index] = parseFloat(value);
    setNetwork({...network, b: newB});
  };

  // Rendu matrice stylisée
  const renderMatrix = (matrix, title) => {
    if (!matrix) return null;
    return (
      <div className="matrix-container">
        <h3>{title}</h3>
        <div className="matrix">
          {matrix.map((row, i) => (
            <div key={i} className="matrix-row">
              {row.slice(0, 8).map((val, j) => (
                <span key={j} className={`matrix-cell ${i===j ? 'diagonal' : ''}`}>
                  {val.toFixed(2)}
                </span>
              ))}
              {row.length > 8 && <span>...</span>}
            </div>
          ))}
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
        {/* PANNEAU DE CONTRÔLE */}
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
                <h2>⚙️ Paramètres de Simulation</h2>
                <label>Méthode:</label>
                <select value={selectedMethod} onChange={(e) => setSelectedMethod(e.target.value)}>
                  <option value="lu">Factorisation LU (avec pivot)</option>
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
                  ⚖️ Comparer les 3 méthodes
                </button>
              </div>

              <div className="section">
                <h2>⚡ Gestion des Pannes</h2>
                <div className="break-form">
                  <input type="number" placeholder="Nœud départ" id="break-from" min="0" max={network.n-1} />
                  <input type="number" placeholder="Nœud arrivée" id="break-to" min="0" max={network.n-1} />
                  <button onClick={() => {
                    const from = document.getElementById('break-from').value;
                    const to = document.getElementById('break-to').value;
                    simulateBreak(from, to);
                  }} className="btn danger">
                    💥 Rompre la ligne
                  </button>
                </div>
                {brokenLine && (
                  <div className={`alert ${dispatchResult?.status === 'blackout' ? 'error' : 'warning'}`}>
                    Ligne {brokenLine.from}→{brokenLine.to} rompue
                    <br/>
                    Status: {dispatchResult?.status === 'blackout' ? '⚠️ BLACKOUT' : '✅ Dispatching réussi'}
                  </div>
                )}
              </div>

              <div className="section">
                <h2>📊 Modification Vecteur b</h2>
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

        {/* VISUALISATION */}
        <div className="visualization">
          {network && (
            <div className="network-viz">
              <h2>Réseau: {network.name} ({network.n} nœuds)</h2>
              <svg viewBox="0 0 1 1" className="network-svg">
                {/* Lignes */}
                {network.A.map((row, i) => 
                  row.map((val, j) => {
                    if (j > i && val !== 0 && network.coords) {
                      const [x1, y1] = network.coords[i];
                      const [x2, y2] = network.coords[j];
                      const isBroken = brokenLine?.from === i && brokenLine?.to === j;
                      return (
                        <line 
                          key={`${i}-${j}`}
                          x1={x1} y1={y1} x2={x2} y2={y2}
                          className={`power-line ${isBroken ? 'broken' : ''}`}
                          stroke={isBroken ? '#ff0000' : litNodes.has(i) && litNodes.has(j) ? '#00ff88' : '#444'}
                          strokeWidth="0.01"
                          strokeDasharray={isBroken ? "0.02,0.02" : "none"}
                        />
                      );
                    }
                    return null;
                  })
                )}
                
                {/* Nœuds */}
                {network.coords?.map(([x, y], i) => (
                  <g key={i}>
                    <circle 
                      cx={x} cy={y} r="0.025"
                      className={`node ${litNodes.has(i) ? 'lit' : ''} ${blackoutNodes.has(i) ? 'blackout' : ''}`}
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
                <span className="legend-item"><span className="line broken"></span> Ligne rompue</span>
              </div>
            </div>
          )}

          {!network && (
            <div className="placeholder">
              <p>Sélectionnez un cas IEEE ou importez des données pour commencer</p>
            </div>
          )}
        </div>

        {/* AFFICHAGE MATHÉMATIQUE ET RÉSULTATS */}
        <div className="math-panel">
          {network && (
            <>
              {renderMatrix(network.A, 'Matrice A (Susceptances)')}
              {renderMatrix([network.b.map(v => [v])], 'Vecteur b (Puissances)')}
              
              {results && (
                <div className="results-section">
                  <h2>🔬 Résultats - Méthode {results.method.toUpperCase()}</h2>
                  <div className="metrics">
                    <div className="metric">
                      <label>Temps de calcul:</label>
                      <value>{results.time.toFixed(4)}s</value>
                    </div>
                    <div className="metric">
                      <label>Résidu ||Ax-b||:</label>
                      <value>{results.residual.toExponential(2)}</value>
                    </div>
                    <div className="metric">
                      <label>Conditionnement:</label>
                      <value>{results.condition_number?.toFixed(2) || 'N/A'}</value>
                    </div>
                    <div className="metric">
                      <label>Complexité:</label>
                      <value>{results.complexity}</value>
                    </div>
                  </div>
                  
                  <h3>Solution x (Angles de phase θ):</h3>
                  <div className="solution-vector">
                    {results.solution.slice(0, 8).map((val, i) => (
                      <div key={i} className="sol-item">
                        θ<sub>{i}</sub> = {val.toFixed(4)} rad
                      </div>
                    ))}
                    {results.solution.length > 8 && <div>...</div>}
                  </div>
                  
                  {results.steps && results.steps.length > 0 && (
                    <div className="steps">
                      <h3>Étapes intermédiaires:</h3>
                      <p>{results.steps.length} étapes de calcul visibles</p>
                    </div>
                  )}
                </div>
              )}

              {comparison && (
                <div className="comparison-section">
                  <h2>⚖️ Comparaison des Méthodes</h2>
                  <table className="compare-table">
                    <thead>
                      <tr>
                        <th>Méthode</th>
                        <th>Temps (s)</th>
                        <th>Itérations</th>
                        <th>Résidu</th>
                        <th>Complexité</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(comparison)
                        .filter(([key]) => key !== 'recommendation')
                        .map(([method, data]) => (
                        <tr key={method} className={comparison.recommendation?.method === method ? 'best' : ''}>
                          <td>{method.toUpperCase()}</td>
                          <td>{data.time?.toFixed(4) || 'N/A'}</td>
                          <td>{data.iterations || 'N/A'}</td>
                          <td>{data.residual?.toExponential(2) || 'N/A'}</td>
                          <td>{data.complexity || 'O(n³)'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  
                  {comparison.recommendation && (
                    <div className="recommendation">
                      <h3>🏆 Recommandation: {comparison.recommendation.method.toUpperCase()}</h3>
                      <p>{comparison.recommendation.reason}</p>
                      <div className="why">
                        <strong>Pourquoi ?</strong>
                        <ul>
                          <li>Cholesky: 2x plus rapide si matrice SDP (exploite symétrie)</li>
                          <li>LU: Plus stable numériquement (pivot partiel)</li>
                          <li>Gauss: Simple mais sans réutilisation de la factorisation</li>
                        </ul>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {dispatchResult && (
                <div className="dispatch-results">
                  <h2>🔄 Résultats Dispatching</h2>
                  {dispatchResult.status === 'blackout' ? (
                    <div className="blackout-alert">
                      ⚠️ BLACKOUT DÉTECTÉ: Îlotage du réseau impossible à aliminer
                      <br/>
                      Nœuds affectés: {dispatchResult.blackout_nodes.length}
                    </div>
                  ) : (
                    <>
                      <p>Flux recalculés après rupture:</p>
                      <div className="flows">
                        {dispatchResult.flows.slice(0, 5).map((flow, i) => (
                          <div key={i} className="flow-item">
                            {flow.from}→{flow.to}: {flow.flow.toFixed(2)} MW 
                            {Math.abs(flow.flow) > Math.abs(flow.capacity) && 
                              <span className="overload">⚠️ SURCHARGE</span>
                            }
                          </div>
                        ))}
                      </div>
                    </>
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