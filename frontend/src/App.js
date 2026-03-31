import React, { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';

const API_URL = 'http://localhost:5000';

// ============================================================
// COMPOSANT NetworkSVG — zoom/pan + affichage blackout correct
// ============================================================
const NetworkSVG = ({ network, litNodes, blackoutNodes, brokenLines, results, selectedMethods }) => {
  const svgRef = useRef(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });
  const [startTransform, setStartTransform] = useState({ x: 0, y: 0 });
  const lastTouchDist = useRef(null);

  useEffect(() => {
    setTransform({ x: 0, y: 0, scale: 1 });
  }, [network?.name]);

  const isLineBroken = useCallback((i, j) =>
    brokenLines.some(l => (l.from === i && l.to === j) || (l.from === j && l.to === i)),
    [brokenLines]
  );

  // Zoom molette
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.85 : 1.18;
    const rect = svgRef.current.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / rect.width;
    const my = (e.clientY - rect.top) / rect.height;
    setTransform(prev => {
      const newScale = Math.min(Math.max(prev.scale * delta, 0.4), 12);
      const r = newScale / prev.scale;
      return { scale: newScale, x: mx - r * (mx - prev.x), y: my - r * (my - prev.y) };
    });
  }, []);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    setIsPanning(true);
    setStartPan({ x: e.clientX, y: e.clientY });
    setStartTransform({ x: transform.x, y: transform.y });
  };

  const handleMouseMove = useCallback((e) => {
    if (!isPanning) return;
    const rect = svgRef.current.getBoundingClientRect();
    setTransform(prev => ({
      ...prev,
      x: startTransform.x + (e.clientX - startPan.x) / rect.width,
      y: startTransform.y + (e.clientY - startPan.y) / rect.height,
    }));
  }, [isPanning, startPan, startTransform]);

  const handleMouseUp = () => setIsPanning(false);

  const handleTouchStart = (e) => {
    if (e.touches.length === 1) {
      setIsPanning(true);
      setStartPan({ x: e.touches[0].clientX, y: e.touches[0].clientY });
      setStartTransform({ x: transform.x, y: transform.y });
    }
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastTouchDist.current = Math.sqrt(dx * dx + dy * dy);
    }
  };

  const handleTouchMove = (e) => {
    if (e.touches.length === 1 && isPanning) {
      const rect = svgRef.current.getBoundingClientRect();
      setTransform(prev => ({
        ...prev,
        x: startTransform.x + (e.touches[0].clientX - startPan.x) / rect.width,
        y: startTransform.y + (e.touches[0].clientY - startPan.y) / rect.height,
      }));
    }
    if (e.touches.length === 2 && lastTouchDist.current) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const delta = dist / lastTouchDist.current;
      lastTouchDist.current = dist;
      setTransform(prev => ({ ...prev, scale: Math.min(Math.max(prev.scale * delta, 0.4), 12) }));
    }
  };

  const handleTouchEnd = () => { setIsPanning(false); lastTouchDist.current = null; };
  const resetZoom = () => setTransform({ x: 0, y: 0, scale: 1 });

  if (!network?.coords) return null;

  const coords = network.coords;
  const nodeR   = network.n <= 14 ? 0.038 : network.n <= 30 ? 0.030 : 0.022;
  const fontSize = network.n <= 14 ? 0.040 : network.n <= 30 ? 0.032 : 0.024;
  const strokeW  = network.n <= 30 ? 0.008 : 0.005;

  const hasResults = litNodes.size > 0;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* Boutons zoom */}
      <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {[
          { label: '+', action: () => setTransform(p => ({ ...p, scale: Math.min(p.scale * 1.3, 12) })), title: 'Zoom +' },
          { label: '−', action: () => setTransform(p => ({ ...p, scale: Math.max(p.scale * 0.77, 0.4) })), title: 'Zoom -' },
          { label: '↺', action: resetZoom, title: 'Réinitialiser', small: true },
        ].map(({ label, action, title, small }) => (
          <button key={label} onClick={action} title={title} style={{
            width: 28, height: 28, background: 'rgba(0,0,0,0.7)', border: '1px solid #444',
            borderRadius: 4, color: '#fff', fontSize: small ? 11 : 16, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>{label}</button>
        ))}
      </div>

      {transform.scale !== 1 && (
        <div style={{
          position: 'absolute', bottom: 28, right: 8, zIndex: 10,
          background: 'rgba(0,0,0,0.6)', color: '#00d2ff', fontSize: 11,
          padding: '2px 7px', borderRadius: 4,
        }}>×{transform.scale.toFixed(1)}</div>
      )}

      <svg
        ref={svgRef}
        viewBox="0 0 1 1"
        preserveAspectRatio="xMidYMid meet"
        className="network-svg"
        style={{ cursor: isPanning ? 'grabbing' : 'grab', userSelect: 'none' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <defs>
          <radialGradient id="nodeGradient" cx="30%" cy="30%">
            <stop offset="0%" stopColor="#4ade80" />
            <stop offset="100%" stopColor="#16a34a" />
          </radialGradient>
          <radialGradient id="blackoutGradient" cx="30%" cy="30%">
            <stop offset="0%" stopColor="#f87171" />
            <stop offset="100%" stopColor="#dc2626" />
          </radialGradient>
          <filter id="glowGreen">
            <feGaussianBlur stdDeviation="0.008" result="coloredBlur"/>
            <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <filter id="glowRed">
            <feGaussianBlur stdDeviation="0.010" result="coloredBlur"/>
            <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>

        <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.scale})`}>

          {/* ── Lignes ── */}
          {network.A.map((row, i) =>
            row.map((val, j) => {
              if (j <= i || val === 0) return null;
              const c1 = coords[i], c2 = coords[j];
              if (!c1 || !c2) return null;
              const [x1, y1] = c1, [x2, y2] = c2;
              const broken  = isLineBroken(i, j);

              let lineColor = '#374151';
              if (broken) {
                lineColor = '#ef4444';
              } else if (hasResults) {
                if (litNodes.has(i) && litNodes.has(j)) lineColor = '#22c55e';
                else if (blackoutNodes.has(i) || blackoutNodes.has(j)) lineColor = '#1f2937';
              }

              return (
                <g key={`line-${i}-${j}`}>
                  <line
                    x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke={lineColor}
                    strokeWidth={broken ? strokeW * 0.7 : strokeW}
                    strokeDasharray={broken ? '0.025,0.015' : 'none'}
                    opacity={broken ? 0.8 : (hasResults && (blackoutNodes.has(i) || blackoutNodes.has(j)) ? 0.3 : 1)}
                  />
                  {broken && (
                    <text x={(x1+x2)/2} y={(y1+y2)/2}
                      fontSize={fontSize * 0.9} fill="#ef4444"
                      textAnchor="middle" dominantBaseline="middle">✕</text>
                  )}
                </g>
              );
            })
          )}

          {/* ── Nœuds ── */}
          {coords.map(([x, y], i) => {
            if (x === undefined || y === undefined) return null;
            const isBlackout = hasResults && blackoutNodes.has(i);
            const isLit      = hasResults && litNodes.has(i);
            const isSlack    = i === (network.slack_bus ?? 0);
            const solution   = results[selectedMethods[0]]?.solution;

            let fill   = '#1f2937';
            let stroke = '#4b5563';
            let filter = '';

            if (isBlackout) {
              fill   = 'url(#blackoutGradient)';
              stroke = '#991b1b';
              filter = 'url(#glowRed)';
            } else if (isLit) {
              fill   = isSlack ? '#facc15' : 'url(#nodeGradient)';
              stroke = isSlack ? '#ca8a04' : '#4ade80';
              filter = 'url(#glowGreen)';
            }

            return (
              <g key={`node-${i}`}>
                {/* Halo */}
                {(isLit || isBlackout) && (
                  <circle cx={x} cy={y} r={nodeR * 1.6}
                    fill={isBlackout ? '#dc2626' : '#4ade80'}
                    opacity={0.15} />
                )}
                <circle cx={x} cy={y} r={nodeR}
                  fill={fill} stroke={stroke}
                  strokeWidth={strokeW * 0.7}
                  filter={filter}
                />
                <text x={x} y={y} fontSize={fontSize}
                  fill={isBlackout ? '#fff' : 'white'}
                  textAnchor="middle" dominantBaseline="middle" fontWeight="bold">
                  {i}
                </text>
                {/* Angle θ au-dessus si alimenté */}
                {isLit && solution && solution[i] !== null && solution[i] !== undefined && (
                  <text x={x} y={y - nodeR - 0.012}
                    fontSize={fontSize * 0.62} fill="#4ade80"
                    textAnchor="middle" dominantBaseline="auto">
                    θ={(solution[i]).toFixed(2)}
                  </text>
                )}
                {/* Badge blackout */}
                {isBlackout && (
                  <text x={x} y={y - nodeR - 0.010}
                    fontSize={fontSize * 0.58} fill="#fca5a5"
                    textAnchor="middle" dominantBaseline="auto">
                    ✕ off
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      <div style={{ marginTop: 6, fontSize: 11, color: '#6b7280', textAlign: 'center' }}>
        🖱️ Molette pour zoomer · Cliquer-glisser pour déplacer
      </div>
    </div>
  );
};

// ============================================================
// COMPOSANT PRINCIPAL
// ============================================================
const App = () => {
  const [network,        setNetwork]        = useState(null);
  const [selectedMethods, setSelectedMethods] = useState(['lu']);
  const [scenario,       setScenario]       = useState('standard');
  const [loading,        setLoading]        = useState(false);
  const [results,        setResults]        = useState({});
  const [comparison,     setComparison]     = useState(null);
  const [brokenLines,    setBrokenLines]    = useState([]);
  const [litNodes,       setLitNodes]       = useState(new Set());
  const [blackoutNodes,  setBlackoutNodes]  = useState(new Set());
  const [animatedNodes,  setAnimatedNodes]  = useState(new Set()); // ← AJOUTÉ
  const [activeTab,      setActiveTab]      = useState('visualization');
  const [tempBrokenLine, setTempBrokenLine] = useState({ from: '', to: '' });
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [errorMessage,   setErrorMessage]   = useState('');
  const [blackoutSummary, setBlackoutSummary] = useState(null);

  useEffect(() => {
    checkConnection();
    const interval = setInterval(checkConnection, 5000);
    return () => clearInterval(interval);
  }, []);

  const checkConnection = async () => {
    try {
      const res = await fetch(`${API_URL}/api/health`);
      setConnectionStatus(res.ok ? 'connected' : 'error');
      if (res.ok) setErrorMessage('');
    } catch {
      setConnectionStatus('error');
      setErrorMessage('Backend non accessible sur localhost:5000');
    }
  };

  const generateCoords = (n) =>
    Array.from({ length: n }, (_, i) => {
      const angle = (2 * Math.PI * i) / n - Math.PI / 2;
      return [0.5 + 0.4 * Math.cos(angle), 0.5 + 0.4 * Math.sin(angle)];
    });

  const loadIEEE = async (size) => {
    if (connectionStatus !== 'connected') {
      alert('Pas de connexion au backend.');
      return;
    }
    try {
      setLoading(true);
      setErrorMessage('');
      const res  = await fetch(`${API_URL}/api/ieee/${size}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (data.A) data.A = data.A.map(row => row.map(v => Number(v) || 0));
      if (data.b) data.b = data.b.map(v => Number(v) || 0);
      if (!data.coords?.length) data.coords = generateCoords(data.n);
      setNetwork(data);
      setResults({});
      setComparison(null);
      setLitNodes(new Set());
      setAnimatedNodes(new Set()); // ← AJOUTÉ
      setBlackoutNodes(new Set());
      setBrokenLines([]);
      setBlackoutSummary(null);
      setActiveTab('visualization');
    } catch (e) {
      setErrorMessage(`Erreur: ${e.message}`);
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
        const n = data.matrix?.length || 0;
        setNetwork({
          A: data.matrix?.map(row => row.map(v => Number(v) || 0)),
          b: data.vector?.map(v => Number(v) || 0),
          n, name: 'Réseau Importé',
          coords: data.coords || generateCoords(n),
          slack_bus: 0
        });
        setBrokenLines([]); setResults({}); setBlackoutSummary(null);
        setAnimatedNodes(new Set()); // ← AJOUTÉ
      } catch { alert('Format JSON invalide'); }
    };
    reader.readAsText(file);
  };

  const toggleMethod = (method) =>
    setSelectedMethods(prev =>
      prev.includes(method) ? prev.filter(m => m !== method) : [...prev, method]
    );

  const solve = async () => {
    if (!network || selectedMethods.length === 0) return;
    setLoading(true);
    setLitNodes(new Set());
    setAnimatedNodes(new Set()); // ← AJOUTÉ
    setBlackoutNodes(new Set());
    setBlackoutSummary(null);

    const newResults = {};
    let lastBlackout = [];
    let lastLit = [];

    try {
      for (const method of selectedMethods) {
        const res = await fetch(`${API_URL}/api/solve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            A: network.A,
            b: network.b,
            method,
            scenario,
            broken_lines: brokenLines,
            slack_bus: network.slack_bus ?? 0,
          })
        });
        const data = await res.json();
        newResults[method] = data;

        if (!data.error) {
          lastLit     = data.lit_nodes     ?? [];
          lastBlackout = data.blackout_nodes ?? [];
        }
      }

      setResults(newResults);
      setLitNodes(new Set(lastLit));
      setBlackoutNodes(new Set(lastBlackout));

      // ← AJOUTÉ : Animation progressive rapide des nœuds
      if (lastLit.length > 0) {
        setAnimatedNodes(new Set());
        let index = 0;
        const sortedNodes = [...lastLit].sort((a, b) => a - b);
        const interval = setInterval(() => {
          if (index < sortedNodes.length) {
            setAnimatedNodes(prev => new Set([...Array.from(prev), sortedNodes[index]]));
            index++;
          } else {
            clearInterval(interval);
          }
        }, 30); // Rapide : 30ms par nœud
      }

      if (lastBlackout.length > 0) {
        setBlackoutSummary({
          count: lastBlackout.length,
          nodes: lastBlackout,
        });
      }

      if (
        selectedMethods.length >= 2 &&
        Object.values(newResults).filter(r => !r.error).length >= 2
      ) {
        generateComparison(newResults);
      }
    } catch (e) {
      alert('Erreur calcul: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const generateComparison = (resultsData) => {
    const valid = {};
    Object.entries(resultsData).forEach(([m, d]) => {
      if (!d.error) valid[m] = { time: d.time, residual: d.residual, iterations: d.iterations };
    });
    if (Object.keys(valid).length >= 2) {
      const best = Object.entries(valid).sort((a, b) => a[1].time - b[1].time)[0];
      setComparison({
        methods: valid,
        recommendation: {
          method: best[0],
          reason: `Meilleur temps: ${best[1].time.toFixed(4)}s, résidu: ${best[1].residual.toExponential(2)}`
        }
      });
    }
  };

  const addBrokenLine = () => {
    const from = parseInt(tempBrokenLine.from);
    const to   = parseInt(tempBrokenLine.to);
    if (isNaN(from) || isNaN(to) || from === to) return;
    if (!network || from < 0 || from >= network.n || to < 0 || to >= network.n) {
      alert(`Nœuds entre 0 et ${network?.n - 1 ?? '?'}`); return;
    }
    if (network.A[from][to] === 0 && network.A[to][from] === 0) {
      alert("Cette ligne n'existe pas dans le réseau"); return;
    }
    if (brokenLines.some(l => (l.from===from&&l.to===to)||(l.from===to&&l.to===from))) {
      alert('Ligne déjà coupée'); return;
    }
    setBrokenLines([...brokenLines, { from, to }]);
    setTempBrokenLine({ from: '', to: '' });
    setResults({});
    setLitNodes(new Set());
    setAnimatedNodes(new Set()); // ← AJOUTÉ
    setBlackoutNodes(new Set());
    setBlackoutSummary(null);
  };

  const removeBrokenLine = (index) => {
    setBrokenLines(brokenLines.filter((_, i) => i !== index));
    setResults({});
    setLitNodes(new Set());
    setAnimatedNodes(new Set()); // ← AJOUTÉ
    setBlackoutNodes(new Set());
    setBlackoutSummary(null);
  };

  const modifyB = (index, value) => {
    const newB = [...network.b];
    newB[index] = parseFloat(value) || 0;
    setNetwork({ ...network, b: newB });
  };

  const renderConnectionStatus = () => {
    if (connectionStatus === 'connecting') return <span className="status-connecting">🟡 Connexion...</span>;
    if (connectionStatus === 'connected')  return <span className="status-connected">🟢 Connecté</span>;
    return <span className="status-error" onClick={checkConnection}>🔴 Déconnecté (cliquer pour réessayer)</span>;
  };

  const renderFullMatrix = (matrix, title) => {
    if (!matrix || !Array.isArray(matrix)) return null;
    const n = matrix.length;
    return (
      <div className="matrix-full-container">
        <div className="matrix-header">
          <h3>{title}</h3>
          <span className="matrix-dims">{n}×{n}</span>
        </div>
        <div className="matrix-scroll-wrapper">
          <div className="matrix-full">
            {matrix.map((row, i) => (
              <div key={i} className="matrix-row-full">
                {row.map((val, j) => {
                  const numVal = Number(val);
                  const display = Math.abs(numVal) < 0.001 ? numVal.toExponential(2) : numVal.toFixed(3);
                  return (
                    <span key={j}
                      className={`matrix-cell-full ${i===j?'diagonal':''} ${Math.abs(numVal)<0.001?'zero':''}`}
                      title={`[${i},${j}]: ${numVal}`}>
                      {display}
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderFullVector = (vector, title) => {
    if (!vector) return null;
    return (
      <div className="vector-full-container">
        <div className="matrix-header">
          <h3>{title}</h3>
          <span className="matrix-dims">{vector.length}×1</span>
        </div>
        <div className="vector-scroll-wrapper">
          <div className="vector-full">
            {vector.map((val, i) => (
              <div key={i} className="vector-row">
                <span className="vector-index">b[{i}]</span>
                <input type="number" step="0.001" value={val}
                  onChange={(e) => modifyB(i, e.target.value)}
                  className="vector-input" />
                <span className={`vector-type ${val > 0 ? 'prod' : 'cons'}`}>
                  {val > 0 ? '⚡ Prod' : '🔌 Cons'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // ── Écran d'accueil ──────────────────────────────────────
  if (!network) {
    return (
      <div className="app">
        <header className="header">
          <div className="header-left">
            <h1>⚡ Smart Grid Solver</h1>
            <p>Résolution de Ax=b par méthodes directes avancées</p>
          </div>
          <div className="header-right">{renderConnectionStatus()}</div>
        </header>
        {errorMessage && (
          <div className="error-banner">⚠️ {errorMessage}
            <button onClick={checkConnection}>Réessayer</button>
          </div>
        )}
        <div className="main-container">
          <div className="control-panel">
            <div className="section">
              <h2>📁 DONNÉES RÉSEAU</h2>
              <div className="subsection">
                <label>Standards IEEE</label>
                <div className="button-group grid-3">
                  <button onClick={() => loadIEEE(14)}  className="btn ieee">IEEE 14</button>
                  <button onClick={() => loadIEEE(30)}  className="btn ieee">IEEE 30</button>
                  <button onClick={() => loadIEEE(118)} className="btn ieee">IEEE 118</button>
                </div>
              </div>
              <div className="subsection">
                <label>Import/Export</label>
                <label className="btn import-btn">
                  📥 Importer Xij (JSON)
                  <input type="file" accept=".json" onChange={handleFileImport} hidden />
                </label>
              </div>
            </div>
          </div>
          <div className="main-content">
            <div className="welcome-screen">
              <h2>Bienvenue dans Smart Grid Solver</h2>
              <p>Sélectionnez un réseau IEEE pour commencer l'analyse</p>
              <div className="features">
                <div className="feature">⚡ 3 Méthodes directes</div>
                <div className="feature">📊 Visualisation complète</div>
                <div className="feature">✂️ Simulation de coupure</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Interface principale ─────────────────────────────────
  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <h1>⚡ Smart Grid Solver</h1>
          <p>Résolution de Ax=b par méthodes directes avancées</p>
        </div>
        <div className="header-right">{renderConnectionStatus()}</div>
      </header>

      {errorMessage && (
        <div className="error-banner">⚠️ {errorMessage}
          <button onClick={checkConnection}>Réessayer</button>
        </div>
      )}

      <div className="main-container">
        {/* ── Panneau de contrôle ── */}
        <div className="control-panel">
          <div className="section">
            <h2>📁 DONNÉES RÉSEAU</h2>
            <div className="subsection">
              <label>Standards IEEE</label>
              <div className="button-group grid-3">
                <button onClick={() => loadIEEE(14)}  className="btn ieee">IEEE 14</button>
                <button onClick={() => loadIEEE(30)}  className="btn ieee">IEEE 30</button>
                <button onClick={() => loadIEEE(118)} className="btn ieee">IEEE 118</button>
              </div>
            </div>
            <div className="subsection">
              <label>Import/Export</label>
              <label className="btn import-btn">
                📥 Importer Xij (JSON)
                <input type="file" accept=".json" onChange={handleFileImport} hidden />
              </label>
            </div>
          </div>

          <div className="section simulation-section">
            <h2>⚙️ SIMULATION</h2>
            <div className="subsection">
              <label>Méthodes de résolution</label>
              <div className="methods-checkbox">
                {[
                  { id: 'lu',       label: 'Factorisation LU (Stable)' },
                  { id: 'gauss',    label: 'Élimination Gauss' },
                  { id: 'cholesky', label: 'Cholesky (SDP)' }
                ].map(m => (
                  <label key={m.id}
                    className={`checkbox-label ${selectedMethods.includes(m.id) ? 'selected' : ''}`}>
                    <input type="checkbox"
                      checked={selectedMethods.includes(m.id)}
                      onChange={() => toggleMethod(m.id)} />
                    <span>{m.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="subsection">
              <label>Scénario</label>
              <div className="scenario-buttons">
                {[
                  { id: 'standard', label: '☀️ Standard' },
                  { id: 'matin',    label: '🌅 Matin +30%' },
                  { id: 'soir',     label: '🌆 Soir -20%' },
                ].map(s => (
                  <button key={s.id}
                    className={`scenario-btn ${scenario === s.id ? 'active' : ''}`}
                    onClick={() => setScenario(s.id)}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <button onClick={solve} className="btn solve-btn"
              disabled={loading || selectedMethods.length === 0}>
              {loading ? '⏳ Calcul...' : '🚀 Lancer résolution'}
            </button>
            {selectedMethods.length >= 2 && (
              <button onClick={() => generateComparison(results)}
                className="btn compare-btn"
                disabled={Object.keys(results).length < 2}>
                ⚖️ Comparer méthodes
              </button>
            )}
          </div>

          {/* ── Simulation de coupure ── */}
          <div className="section danger-zone">
            <h2>✂️ SIMULATION DE COUPURE</h2>

            {/* Alerte blackout */}
            {blackoutSummary && (
              <div style={{
                background: 'rgba(220,38,38,0.15)', border: '1px solid #dc2626',
                borderRadius: 6, padding: '8px 10px', marginBottom: 10, fontSize: 12,
              }}>
                <strong style={{ color: '#f87171' }}>
                  🔴 {blackoutSummary.count} nœud(s) hors tension
                </strong>
                <div style={{ color: '#fca5a5', marginTop: 3 }}>
                  Nœuds isolés : {blackoutSummary.nodes.join(', ')}
                </div>
              </div>
            )}

            <div className="broken-lines-list">
              {brokenLines.map((line, idx) => (
                <div key={idx} className="broken-line-item">
                  <span>Ligne {line.from} ↔ {line.to}</span>
                  <button onClick={() => removeBrokenLine(idx)} className="remove-line">×</button>
                </div>
              ))}
            </div>

            <div className="add-fault-form">
              <input type="number" placeholder="Départ"
                value={tempBrokenLine.from}
                onChange={(e) => setTempBrokenLine({ ...tempBrokenLine, from: e.target.value })} />
              <input type="number" placeholder="Arrivée"
                value={tempBrokenLine.to}
                onChange={(e) => setTempBrokenLine({ ...tempBrokenLine, to: e.target.value })} />
              <button onClick={addBrokenLine} className="btn add-fault-btn">+ Couper</button>
            </div>

            {brokenLines.length > 0 && (
              <div className="fault-status">
                <span className={blackoutNodes.size > 0 ? 'blackout-badge' : 'stable-badge'}>
                  {blackoutNodes.size > 0
                    ? `🔴 BLACKOUT (${blackoutNodes.size} nœuds)`
                    : '🟢 STABLE'}
                  {' '}— {brokenLines.length} ligne(s) coupée(s)
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ── Contenu principal ── */}
        <div className="main-content">
          <div className="tabs">
            <button className={`tab ${activeTab==='visualization'?'active':''}`}
              onClick={() => setActiveTab('visualization')}>🌐 Visualisation</button>
            <button className={`tab ${activeTab==='matrices'?'active':''}`}
              onClick={() => setActiveTab('matrices')}>🧮 Matrices</button>
            <button className={`tab ${activeTab==='results'?'active':''}`}
              onClick={() => setActiveTab('results')}>
              📊 Résultats {Object.keys(results).length > 0 && `(${Object.keys(results).length})`}
            </button>
            {comparison && (
              <button className={`tab ${activeTab==='comparison'?'active':''}`}
                onClick={() => setActiveTab('comparison')}>⚖️ Comparaison</button>
            )}
          </div>

          <div className="tab-content">
            {/* Visualisation */}
            {activeTab === 'visualization' && (
              <div className="visualization-panel">
                <div className="network-header">
                  <h2>{network.name}</h2>
                  <span className="network-stats">
                    {network.n} nœuds
                    {blackoutNodes.size > 0 && (
                      <span style={{ color: '#f87171', marginLeft: 8 }}>
                        · {blackoutNodes.size} hors tension
                      </span>
                    )}
                  </span>
                </div>
                <div className="network-container" style={{ height: '500px' }}>
                  <NetworkSVG
                    network={network}
                    litNodes={animatedNodes}
                    blackoutNodes={blackoutNodes}
                    brokenLines={brokenLines}
                    results={results}
                    selectedMethods={selectedMethods}
                  />
                </div>
                <div className="legend">
                  <div className="legend-item"><span className="dot lit"></span><span>Alimenté</span></div>
                  <div className="legend-item"><span className="dot unlit"></span><span>Non résolu</span></div>
                  <div className="legend-item"><span className="dot blackout"></span><span>Hors tension</span></div>
                  <div className="legend-item"><span style={{ display:'inline-block', width:24, height:2, background:'#ef4444', marginRight:5, verticalAlign:'middle' }}></span><span>Ligne coupée</span></div>
                </div>
              </div>
            )}

            {/* Matrices */}
            {activeTab === 'matrices' && (
              <div className="matrices-panel">
                <div className="matrix-section">{renderFullMatrix(network.A, 'Matrice A (Admittances/Ybus)')}</div>
                <div className="matrix-section">{renderFullVector(network.b, 'Vecteur b (Puissances nettes P)')}</div>
              </div>
            )}

            {/* Résultats */}
            {activeTab === 'results' && (
              <div className="results-panel">
                {Object.keys(results).length === 0 ? (
                  <div className="empty-state"><p>Lancez la résolution pour voir les résultats</p></div>
                ) : (
                  <div className="results-grid">
                    {Object.entries(results).map(([method, data]) => (
                      <div key={method} className={`result-card ${data.error ? 'error' : ''}`}>
                        <div className="result-header">
                          <h3>{method.toUpperCase()}</h3>
                          {data.error
                            ? <span className="badge error">Erreur</span>
                            : <span className="badge success">OK</span>}
                        </div>
                        {!data.error && (
                          <>
                            {data.isolated_islands && (
                              <div style={{
                                background:'rgba(220,38,38,0.12)', border:'1px solid #ef4444',
                                borderRadius:4, padding:'6px 8px', marginBottom:8, fontSize:11,
                                color:'#fca5a5'
                              }}>
                                ⚠️ Îlot détecté — {data.blackout_nodes?.length} nœud(s) hors tension : {data.blackout_nodes?.join(', ')}
                              </div>
                            )}
                            <div className="result-metrics">
                              <div className="metric"><label>⏱️ Temps</label><value>{data.time?.toFixed(4)}s</value></div>
                              <div className="metric"><label>🔄 Itérations</label><value>{data.iterations}</value></div>
                              <div className="metric"><label>📐 Résidu ‖Ax-b‖</label><value>{data.residual?.toExponential(2)}</value></div>
                              <div className="metric"><label>🔢 Conditionnement κ</label><value>{data.condition_number?.toExponential(2) || 'N/A'}</value></div>
                            </div>
                            <div className="solution-section">
                              <h4>Solution (Angles θ)</h4>
                              <div className="solution-grid">
                                {data.solution?.map((val, i) => (
                                  <div key={i} className="solution-item"
                                    style={data.blackout_nodes?.includes(i) ? { opacity:0.4 } : {}}>
                                    <span className="theta-label">θ<sub>{i}</sub></span>
                                    <span className="theta-value">
                                      {val === null ? '— hors tension' : `${val.toFixed(4)} rad`}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </>
                        )}
                        {data.error && <div className="error-message">⚠️ {data.error}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Comparaison MODIFIÉE */}
            {activeTab === 'comparison' && comparison && (
              <div className="comparison-panel">
                <h2>📊 Analyse comparative</h2>
                <div className="charts-container" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                  
                  {/* Graphique Temps */}
                  <div className="chart" style={{ background: 'rgba(0,0,0,0.3)', padding: '20px', borderRadius: '8px', border: '1px solid #333' }}>
                    <h4 style={{ textAlign: 'center', margin: '0 0 15px 0', color: '#00d2ff' }}>Temps d'exécution (ms)</h4>
                    <div className="bar-chart" style={{ display: 'flex', alignItems: 'flex-end', height: '200px', gap: '40px', justifyContent: 'center', padding: '20px 0' }}>
                      {Object.entries(comparison.methods).map(([method, data]) => {
                        const maxTime = Math.max(...Object.values(comparison.methods).map(m => m.time)) || 1;
                        const heightPercent = (data.time / maxTime) * 100;
                        const isBest = comparison.recommendation.method === method;
                        return (
                          <div key={method} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, maxWidth: '100px' }}>
                            <div style={{ 
                              height: `${Math.max(heightPercent, 5)}%`, 
                              width: '60px',
                              background: isBest ? '#00ff88' : (method === 'lu' ? '#00d2ff' : method === 'gauss' ? '#3b82f6' : '#f59e0b'),
                              borderRadius: '4px 4px 0 0',
                              display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
                              paddingTop: '5px', transition: 'all 0.5s ease',
                              boxShadow: isBest ? '0 0 15px rgba(0,255,136,0.5)' : 'none',
                              border: isBest ? '2px solid #fff' : 'none',
                              minHeight: '20px'
                            }}>
                              <span style={{ color: '#000', fontWeight: 'bold', fontSize: '12px' }}>{(data.time*1000).toFixed(1)}</span>
                            </div>
                            <span style={{ marginTop: '10px', fontSize: '13px', textTransform: 'uppercase', fontWeight: isBest ? 'bold' : 'normal', color: isBest ? '#00ff88' : '#fff' }}>{method}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Graphique Précision */}
                  <div className="chart" style={{ background: 'rgba(0,0,0,0.3)', padding: '20px', borderRadius: '8px', border: '1px solid #333' }}>
                    <h4 style={{ textAlign: 'center', margin: '0 0 15px 0', color: '#00d2ff' }}>Précision (log₁₀ résidu)</h4>
                    <div className="bar-chart" style={{ display: 'flex', alignItems: 'flex-end', height: '200px', gap: '40px', justifyContent: 'center', padding: '20px 0' }}>
                      {Object.entries(comparison.methods).map(([method, data]) => {
                        const logRes = Math.log10(Math.max(data.residual, 1e-16));
                        const maxLog = Math.max(...Object.values(comparison.methods).map(m => Math.abs(Math.log10(Math.max(m.residual, 1e-16))))) || 1;
                        const heightPercent = (Math.abs(logRes) / maxLog) * 100;
                        const isBest = comparison.recommendation.method === method;
                        return (
                          <div key={method} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, maxWidth: '100px' }}>
                            <div style={{ 
                              height: `${Math.max(heightPercent, 5)}%`, 
                              width: '60px',
                              background: isBest ? '#00ff88' : (method === 'lu' ? '#00d2ff' : method === 'gauss' ? '#3b82f6' : '#f59e0b'),
                              borderRadius: '4px 4px 0 0',
                              display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
                              paddingTop: '5px', transition: 'all 0.5s ease',
                              opacity: 0.9,
                              minHeight: '20px'
                            }}>
                              <span style={{ color: '#000', fontWeight: 'bold', fontSize: '11px' }}>{logRes.toFixed(1)}</span>
                            </div>
                            <span style={{ marginTop: '10px', fontSize: '13px', textTransform: 'uppercase', fontWeight: isBest ? 'bold' : 'normal', color: isBest ? '#00ff88' : '#fff' }}>{method}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
                
                {/* Recommandation */}
                <div className="recommendation-box" style={{ marginTop: '20px', background: 'rgba(0,255,136,0.1)', border: '1px solid #00ff88', borderRadius: '8px', padding: '20px' }}>
                  <div className="recommendation-header" style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                    <span style={{ fontSize: '28px' }}>🏆</span>
                    <h3 style={{ margin: 0, color: '#00ff88', fontSize: '20px' }}>Recommandation: {comparison.recommendation.method.toUpperCase()}</h3>
                  </div>
                  <p style={{ margin: 0, opacity: 0.9, fontSize: '14px' }}>{comparison.recommendation.reason}</p>
                </div>

                {/* Cartes méthodes */}
                <div className="methods-details" style={{ marginTop: '20px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px' }}>
                  <div className="method-card" style={{ background: 'rgba(0,0,0,0.3)', padding: '15px', borderRadius: '8px', border: '1px solid #444' }}>
                    <h4 style={{ margin: '0 0 10px 0', color: '#3b82f6' }}>Gauss</h4>
                    <p style={{ fontSize: '12px', margin: 0, opacity: 0.8 }}>Simple mais sans réutilisation de la factorisation. Complexité O(n³).</p>
                    <span style={{ display: 'inline-block', marginTop: '10px', padding: '3px 8px', background: 'rgba(59,130,246,0.2)', color: '#3b82f6', borderRadius: '4px', fontSize: '11px' }}>✓ Stable</span>
                  </div>
                  <div className="method-card recommended" style={{ background: 'rgba(0,255,136,0.1)', padding: '15px', borderRadius: '8px', border: '1px solid #00ff88' }}>
                    <h4 style={{ margin: '0 0 10px 0', color: '#00ff88' }}>LU</h4>
                    <p style={{ fontSize: '12px', margin: 0, opacity: 0.8 }}>Plus stable numériquement grâce au pivot partiel. Recommandé pour matrices générales.</p>
                    <span style={{ display: 'inline-block', marginTop: '10px', padding: '3px 8px', background: 'rgba(0,255,136,0.2)', color: '#00ff88', borderRadius: '4px', fontSize: '11px' }}>✓ Optimal</span>
                  </div>
                  <div className="method-card" style={{ background: 'rgba(0,0,0,0.3)', padding: '15px', borderRadius: '8px', border: '1px solid #444' }}>
                    <h4 style={{ margin: '0 0 10px 0', color: '#f59e0b' }}>Cholesky</h4>
                    <p style={{ fontSize: '12px', margin: 0, opacity: 0.8 }}>2× plus rapide si matrice SDP. Nécessite symétrie définie positive stricte.</p>
                    <span style={{ display: 'inline-block', marginTop: '10px', padding: '3px 8px', background: 'rgba(245,158,11,0.2)', color: '#f59e0b', borderRadius: '4px', fontSize: '11px' }}>✓ Rapide</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;