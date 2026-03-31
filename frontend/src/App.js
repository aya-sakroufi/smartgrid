import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import MatrixViewer from './components/MatrixViewer';
import NetworkVisualizer from './components/NetworkVisualizer';
import ResultsPanel from './components/ResultsPanel';
import ComparisonChart from './components/ComparisonChart';
import { Toaster, toast } from 'react-hot-toast';

const API_URL = 'http://localhost:5000';

const App = () => {
  const [network, setNetwork] = useState(null);
  const [originalB, setOriginalB] = useState(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentNode, setCurrentNode] = useState(null);
  const [calculationMessage, setCalculationMessage] = useState('');
  const [results, setResults] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [selectedMethod, setSelectedMethod] = useState('lu');
  const [scenario, setScenario] = useState('standard');
  const [activeTab, setActiveTab] = useState('visualization');
  const [brokenLine, setBrokenLine] = useState(null);
  const [dispatchResult, setDispatchResult] = useState(null);
  const [blackoutMode, setBlackoutMode] = useState(false);
  const [litNodes, setLitNodes] = useState(new Set());

  const socketRef = useRef(null);
  const [socketId, setSocketId] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  // CORRECTION 1: Gestion robuste des messages Socket.IO
  useEffect(() => {
    const ws = new WebSocket('ws://localhost:5000/socket.io/?EIO=4&transport=websocket');
    
    ws.onopen = () => {
      setIsConnected(true);
      console.log('WebSocket connecté');
      // Envoyer le handshake Socket.IO
      ws.send('40');
    };

    ws.onmessage = (event) => {
      try {
        const data = event.data;
        
        // Ignorer les pings/pongs Socket.IO (2, 3, 40, 41, etc.)
        if (typeof data !== 'string' || data.length < 2 || data[0] !== '4' || data[1] !== '2') {
          return; // Ce n'est pas un événement, c'est un ping/pong/autre
        }
        
        // Parser uniquement si c'est un événement (42...)
        const jsonStr = data.slice(2);
        const parsed = JSON.parse(jsonStr);
        
        if (!Array.isArray(parsed) || parsed.length < 2) return;
        
        const [eventName, payload] = parsed;
        
        if (eventName === 'connected' && payload?.socket_id) {
          setSocketId(payload.socket_id);
          console.log('Socket ID reçu:', payload.socket_id);
        }
        
        if (eventName === 'progress' && payload) {
          setProgress(payload.percent || 0);
          setCurrentNode(payload.node);
          if (payload.message) setCalculationMessage(payload.message);
          
          if (payload.node !== undefined && payload.node !== null) {
            setLitNodes(prev => new Set([...prev, payload.node]));
          }
        }
      } catch (e) {
        // CORRECTION: Ne pas afficher d'erreur pour les messages non-JSON (ping/pong normaux)
        if (event.data && event.data.length > 2) {
          console.log('Message non-parsable (ignoré):', event.data.substring(0, 50));
        }
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket erreur:', error);
      setIsConnected(false);
    };

    ws.onclose = () => {
      setIsConnected(false);
    };

    socketRef.current = ws;

    return () => {
      if (ws) ws.close();
    };
  }, []);

  const loadIEEE = async (size) => {
    try {
      setLoading(true);
      resetState();
      
      const response = await fetch(`${API_URL}/api/ieee/${size}`);
      const data = await response.json();
      
      if (data.error) throw new Error(data.error);
      
      setNetwork(data);
      setOriginalB([...data.b]);
      toast.success(`${data.name} chargé avec succès`);
      setActiveTab('matrices');
    } catch (error) {
      toast.error(`Erreur: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const generateNeighborhood = async (n = 20) => {
    try {
      setLoading(true);
      resetState();
      
      const response = await fetch(`${API_URL}/api/neighborhood`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ n, density: 0.4 })
      });
      
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      
      setNetwork(data);
      setOriginalB([...data.b]);
      toast.success('Quartier généré avec succès');
      setActiveTab('matrices');
    } catch (error) {
      toast.error(`Erreur: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleFileImport = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const json = JSON.parse(e.target.result);
        
        if (json.xij && json.n) {
          const response = await fetch(`${API_URL}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ n: json.n, xij: json.xij })
          });
          
          const data = await response.json();
          if (data.error) throw new Error(data.error);
          
          setNetwork(data);
          setOriginalB([...data.b]);
          toast.success('Fichier importé avec succès');
          setActiveTab('matrices');
        } else {
          throw new Error('Format JSON invalide');
        }
      } catch (error) {
        toast.error(`Erreur import: ${error.message}`);
      }
    };
    reader.readAsText(file);
  };

  const resetState = () => {
    setResults(null);
    setComparison(null);
    setBrokenLine(null);
    setDispatchResult(null);
    setBlackoutMode(false);
    setProgress(0);
    setLitNodes(new Set());
  };

  // CORRECTION 2: Envoi du socket_id pour recevoir les progressions
  const solve = async () => {
    if (!network) return;
    
    try {
      setLoading(true);
      setProgress(0);
      setCalculationMessage('Initialisation...');
      setResults(null);
      setBlackoutMode(false);
      setLitNodes(new Set());
      
      const response = await fetch(`${API_URL}/api/solve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          A: network.A,
          b: network.b,
          method: selectedMethod,
          scenario: scenario,
          socket_id: socketId // AJOUT IMPORTANT: permet au serveur d'envoyer les progressions
        })
      });
      
      // CORRECTION 3: Gestion sécurisée de la réponse
      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        throw new Error('Réponse serveur invalide: ' + text.substring(0, 50));
      }
      
      if (data.error) throw new Error(data.error);
      if (!data.success) throw new Error(data.error || 'Échec de la résolution');
      
      setResults(data);
      setLitNodes(new Set(Array.from({length: network.n}, (_, i) => i)));
      toast.success(`Résolu en ${data.time.toFixed(4)}s`);
      setActiveTab('results');
    } catch (error) {
      toast.error(`Erreur calcul: ${error.message}`);
    } finally {
      setLoading(false);
      setProgress(100);
    }
  };

  const compareMethods = async () => {
    if (!network) return;
    
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/compare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ A: network.A, b: network.b })
      });
      
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      
      setComparison(data);
      toast.success('Comparaison terminée');
      setActiveTab('comparison');
    } catch (error) {
      toast.error(`Erreur comparaison: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const simulateBreak = async () => {
    if (!network) return;
    
    const from = prompt(`Nœud départ (0-${network.n-1}):`);
    if (from === null) return;
    const to = prompt(`Nœud arrivée (0-${network.n-1}):`);
    if (to === null) return;
    
    const i = parseInt(from), j = parseInt(to);
    if (isNaN(i) || isNaN(j) || i < 0 || i >= network.n || j < 0 || j >= network.n) {
      toast.error('Indices invalides');
      return;
    }
    
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/break_line`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          A: network.A,
          b: network.b,
          from: i,
          to: j
        })
      });
      
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      
      setBrokenLine(data.line_broken);
      setDispatchResult(data.dispatch);
      
      if (data.dispatch.status === 'blackout') {
        setBlackoutMode(true);
        setLitNodes(new Set());
        toast.error('⚠️ BLACKOUT DÉTECTÉ !');
      } else {
        setBlackoutMode(false);
        setNetwork(prev => ({ ...prev, A: data.dispatch.new_matrix }));
        setLitNodes(new Set(Array.from({length: network.n}, (_, i) => i)));
        toast.success('Dispatch recalculé - Réseau stable');
      }
    } catch (error) {
      toast.error(`Erreur simulation: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const modifyB = (index, value) => {
    if (!network) return;
    const newB = [...network.b];
    newB[index] = parseFloat(value) || 0;
    setNetwork({ ...network, b: newB });
  };

  const exportResults = () => {
    if (!results) return;
    const dataStr = JSON.stringify(results, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `results_${results.method}_${Date.now()}.json`;
    a.click();
  };

  return (
    <div className="app">
      <Toaster position="top-right" />
      
      <header className="header">
        <div className="header-content">
          <div className="logo">
            <div className="logo-icon">⚡</div>
            <div>
              <h1>Smart Grid Solver</h1>
              <p>Résolution de Ax=b par méthodes directes avancées</p>
            </div>
          </div>
          <div className="connection-status">
            <span className={`status-dot ${isConnected ? 'connected' : 'disconnected'}`} />
            {isConnected ? 'Connecté' : 'Déconnecté'}
            {socketId && <span style={{fontSize: '10px', marginLeft: '10px', color: '#666'}}>ID: {socketId.substr(0,8)}</span>}
          </div>
        </div>
      </header>

      <div className="main-container">
        <aside className="sidebar left">
          <div className="panel">
            <h3>📁 Données Réseau</h3>
            
            <div className="button-group">
              <label className="btn-label">Standards IEEE</label>
              <div className="ieee-buttons">
                <button onClick={() => loadIEEE(14)} className="btn btn-ieee">IEEE 14</button>
                <button onClick={() => loadIEEE(30)} className="btn btn-ieee">IEEE 30</button>
                <button onClick={() => loadIEEE(118)} className="btn btn-ieee">IEEE 118</button>
              </div>
            </div>

            <div className="button-group">
              <label className="btn-label">Génération Procédurale</label>
              <button onClick={() => generateNeighborhood(20)} className="btn btn-secondary">
                🏘️ Quartier (20 nœuds)
              </button>
              <button onClick={() => generateNeighborhood(50)} className="btn btn-secondary">
                🏙️ Quartier (50 nœuds)
              </button>
            </div>

            <div className="file-input">
              <label className="btn-label">Import/Export</label>
              <input 
                type="file" 
                accept=".json" 
                onChange={handleFileImport}
                id="file-input"
                style={{ display: 'none' }}
              />
              <label htmlFor="file-input" className="btn btn-file">
                📤 Impporter Xij (JSON)
              </label>
              {results && (
                <button onClick={exportResults} className="btn btn-file">
                  💾 Exporter résultats
                </button>
              )}
            </div>
          </div>

          {network && (
            <>
              <div className="panel">
                <h3>⚙️ Simulation</h3>
                
                <div className="form-group">
                  <label>Méthode de résolution</label>
                  <select 
                    value={selectedMethod} 
                    onChange={(e) => setSelectedMethod(e.target.value)}
                    className="select"
                  >
                    <option value="lu">🔢 Factorisation LU (Stable)</option>
                    <option value="gauss">📐 Élimination de Gauss</option>
                    <option value="cholesky">📊 Cholesky (Rapide)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Scénario de consommation</label>
                  <div className="scenario-buttons">
                    <button 
                      className={`scenario-btn ${scenario === 'standard' ? 'active' : ''}`}
                      onClick={() => setScenario('standard')}
                    >
                      ☀️ Standard
                    </button>
                    <button 
                      className={`scenario-btn ${scenario === 'matin' ? 'active' : ''}`}
                      onClick={() => setScenario('matin')}
                    >
                      📈 Matin +30%
                    </button>
                    <button 
                      className={`scenario-btn ${scenario === 'soir' ? 'active' : ''}`}
                      onClick={() => setScenario('soir')}
                    >
                      📉 Soir -20%
                    </button>
                  </div>
                </div>

                {loading && (
                  <div className="progress-container">
                    <div className="progress-bar">
                      <div 
                        className="progress-fill" 
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <span className="progress-text">{progress}% - {calculationMessage}</span>
                  </div>
                )}

                <button 
                  onClick={solve} 
                  disabled={loading}
                  className="btn btn-primary btn-large"
                >
                  {loading ? '⏳ Calcul...' : '🚀 Lancer résolution'}
                </button>

                <button 
                  onClick={compareMethods}
                  disabled={loading}
                  className="btn btn-secondary btn-large"
                >
                  ⚖️ Comparer méthodes
                </button>
              </div>

              <div className="panel danger-panel">
                <h3>⚠️ Zone de Danger</h3>
                <button 
                  onClick={simulateBreak}
                  disabled={loading}
                  className="btn btn-danger btn-large"
                >
                  💥 Simuler panne ligne
                </button>
                
                {brokenLine && (
                  <div className={`status-box ${dispatchResult?.status}`}>
                    <div className="status-header">
                      {dispatchResult?.status === 'blackout' ? '🔴 BLACKOUT' : '🟢 STABLE'}
                    </div>
                    <p>Ligne {brokenLine.from} → {brokenLine.to} coupée</p>
                    {dispatchResult?.overloaded_lines?.length > 0 && (
                      <p className="warning-text">
                        ⚠️ {dispatchResult.overloaded_lines.length} lignes surchargées
                      </p>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </aside>

        <main className="main-content">
          {network ? (
            <>
              <div className="tabs">
                <button 
                  className={activeTab === 'visualization' ? 'active' : ''}
                  onClick={() => setActiveTab('visualization')}
                >
                  🌐 Visualisation
                </button>
                <button 
                  className={activeTab === 'matrices' ? 'active' : ''}
                  onClick={() => setActiveTab('matrices')}
                >
                  🧮 Matrices
                </button>
                <button 
                  className={activeTab === 'results' ? 'active' : ''}
                  onClick={() => setActiveTab('results')}
                  disabled={!results}
                >
                  📊 Résultats
                </button>
                <button 
                  className={activeTab === 'comparison' ? 'active' : ''}
                  onClick={() => setActiveTab('comparison')}
                  disabled={!comparison}
                >
                  📈 Comparaison
                </button>
              </div>

              <div className="tab-content">
                {activeTab === 'visualization' && (
                  <NetworkVisualizer 
                    network={network}
                    results={results}
                    currentNode={currentNode}
                    progress={progress}
                    loading={loading}
                    brokenLine={brokenLine}
                    blackoutMode={blackoutMode}
                    litNodes={litNodes}
                  />
                )}

                {activeTab === 'matrices' && (
                  <div className="matrices-tab">
                    <MatrixViewer 
                      matrix={network.A} 
                      title="Matrice A (Admittances/Ybus)" 
                      type="matrix"
                    />
                    <MatrixViewer 
                      vector={network.b} 
                      title="Vecteur b (Puissances nettes P)" 
                      type="vector"
                      editable={true}
                      onEdit={modifyB}
                    />
                  </div>
                )}

                {activeTab === 'results' && results && (
                  <ResultsPanel results={results} network={network} />
                )}

                {activeTab === 'comparison' && comparison && (
                  <ComparisonChart comparison={comparison} />
                )}
              </div>
            </>
          ) : (
            <div className="welcome-screen">
              <div className="welcome-icon">🔌</div>
              <h2>Bienvenue dans Smart Grid Solver</h2>
              <p>Sélectionnez un réseau IEEE ou générez un quartier pour commencer</p>
              <div className="features">
                <div className="feature">
                  <span>⚡</span>
                  <span>3 Méthodes directes</span>
                </div>
                <div className="feature">
                  <span>🎮</span>
                  <span>Visualisation temps réel</span>
                </div>
                <div className="feature">
                  <span>💥</span>
                  <span>Simulation de pannes</span>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default App;
