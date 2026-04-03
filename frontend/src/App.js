import React, { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';

const API_URL = 'http://localhost:5000';

// Descriptions de performance par méthode - COULEURS DISTINCTES
const PERFORMANCE_DESC = {
  gauss: { 
    label: 'Classique', 
    detail: 'O(n³) - Simple mais instable',
    color: '#ff6b6b',
    recommendation: 'Bon pour petits systèmes et prototypage rapide'
  },
  lu: { 
    label: 'Stable & Optimal', 
    detail: 'Factorisation réutilisable',
    color: '#4ecdc4',
    recommendation: 'Choix standard pour systèmes de taille moyenne à grande'
  },
  cholesky: { 
    label: 'Ultra-rapide', 
    detail: '2× plus vite (si SDP)',
    color: '#ffe66d',
    recommendation: 'Idéal pour matrices symétriques définies positives'
  }
};

const IEEE14_COORDS = [
  [0.50, 0.90], [0.25, 0.72], [0.75, 0.72], [0.50, 0.54],
  [0.18, 0.38], [0.82, 0.38], [0.67, 0.28], [0.35, 0.28],
  [0.50, 0.16], [0.67, 0.16], [0.18, 0.16], [0.35, 0.08],
  [0.50, 0.08], [0.67, 0.08],
];

// ============================================================
// FONCTIONS DE PROPAGATION RÉALISTE SELON LE CÂBLAGE
// ============================================================

const getConnectedNeighbors = (network, node, brokenLinesSet) => {
  const neighbors = [];
  const n = network.n;
  for (let i = 0; i < n; i++) {
    if (i !== node && network.A[node][i] !== 0) {
      const lineKey1 = `${Math.min(node, i)}-${Math.max(node, i)}`;
      if (!brokenLinesSet.has(lineKey1)) {
        neighbors.push(i);
      }
    }
  }
  return neighbors;
};

const getRealisticPropagationOrder = (network, slackBus, brokenLines) => {
  if (!network || !network.A) return [];
  
  const brokenLinesSet = new Set(
    brokenLines.map(l => `${Math.min(l.from, l.to)}-${Math.max(l.from, l.to)}`)
  );
  
  const n = network.n;
  const visited = new Set([slackBus]);
  const order = [{ node: slackBus, parent: null, depth: 0, lineKey: null }];
  const queue = [{ node: slackBus, depth: 0 }];
  
  while (queue.length > 0) {
    const { node, depth } = queue.shift();
    const neighbors = getConnectedNeighbors(network, node, brokenLinesSet);
    
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        const lineKey = `${Math.min(node, neighbor)}-${Math.max(node, neighbor)}`;
        order.push({ 
          node: neighbor, 
          parent: node, 
          depth: depth + 1,
          lineKey: lineKey
        });
        queue.push({ node: neighbor, depth: depth + 1 });
      }
    }
  }
  
  return order;
};

const findIslandsAfterBreaks = (network, slackBus, brokenLines) => {
  const brokenLinesSet = new Set(
    brokenLines.map(l => `${Math.min(l.from, l.to)}-${Math.max(l.from, l.to)}`)
  );
  
  const n = network.n;
  const visited = new Set([slackBus]);
  const queue = [slackBus];
  
  while (queue.length > 0) {
    const node = queue.shift();
    const neighbors = getConnectedNeighbors(network, node, brokenLinesSet);
    
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
  
  const blackoutNodes = [];
  for (let i = 0; i < n; i++) {
    if (!visited.has(i)) blackoutNodes.push(i);
  }
  
  return { connected: Array.from(visited), blackout: blackoutNodes };
};

// ============================================================
// COMPOSANT NetworkSVG
// ============================================================

const NetworkSVG = ({ network, modifiedA, litNodes, blackoutNodes, brokenLines, animatingNodes, activeLines, currentLine }) => {
  const svgRef = useRef(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });
  const [startTransform, setStartTransform] = useState({ x: 0, y: 0 });
  const lastTouchDist = useRef(null);

  useEffect(() => { setTransform({ x: 0, y: 0, scale: 1 }); }, [network?.name]);

  const isLineBroken = useCallback((i, j) =>
    brokenLines.some(l => (l.from === i && l.to === j) || (l.from === j && l.to === i)),
    [brokenLines]
  );

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.85 : 1.18;
    const rect = svgRef.current.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / rect.width;
    const my = (e.clientY - rect.top) / rect.height;
    setTransform(prev => {
      const ns = Math.min(Math.max(prev.scale * delta, 0.4), 12);
      const r = ns / prev.scale;
      return { scale: ns, x: mx - r * (mx - prev.x), y: my - r * (my - prev.y) };
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
      setTransform(prev => ({ ...prev, scale: Math.min(Math.max(prev.scale * dist / lastTouchDist.current, 0.4), 12) }));
      lastTouchDist.current = dist;
    }
  };
  
  const handleTouchEnd = () => { setIsPanning(false); lastTouchDist.current = null; };
  const resetZoom = () => setTransform({ x: 0, y: 0, scale: 1 });

  if (!network?.coords) return null;

  const coords = network.n === 14 ? IEEE14_COORDS : network.coords;
  const displayA = network.A;
  const nodeR = network.n <= 14 ? 0.038 : network.n <= 30 ? 0.030 : 0.022;
  const fontSize = network.n <= 14 ? 0.040 : network.n <= 30 ? 0.032 : 0.024;
  const strokeW = network.n <= 30 ? 0.008 : 0.005;
  const hasResults = litNodes.size > 0 || animatingNodes.size > 0;

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {[
          { label: '+', fn: () => setTransform(p => ({ ...p, scale: Math.min(p.scale * 1.3, 12) })), title: 'Zoom +' },
          { label: '−', fn: () => setTransform(p => ({ ...p, scale: Math.max(p.scale * 0.77, 0.4) })), title: 'Zoom -' },
          { label: '↺', fn: resetZoom, title: 'Réinitialiser', small: true },
        ].map(({ label, fn, title, small }) => (
          <button key={label} onClick={fn} title={title} style={{
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
          <radialGradient id="nodeGradientAnimating" cx="30%" cy="30%">
            <stop offset="0%" stopColor="#86efac" />
            <stop offset="100%" stopColor="#22c55e" />
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
          <filter id="glowAnimating">
            <feGaussianBlur stdDeviation="0.015" result="coloredBlur"/>
            <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <filter id="glowLine">
            <feGaussianBlur stdDeviation="0.008" result="coloredBlur"/>
            <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <filter id="glowCurrent">
            <feGaussianBlur stdDeviation="0.012" result="coloredBlur"/>
            <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <linearGradient id="lineFlowGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#22c55e" stopOpacity="0.2" />
            <stop offset="50%" stopColor="#86efac" stopOpacity="1" />
            <stop offset="100%" stopColor="#22c55e" stopOpacity="0.2" />
          </linearGradient>
        </defs>

        <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.scale})`}>
          {displayA.map((row, i) =>
            row.map((val, j) => {
              if (j <= i || val === 0) return null;
              const c1 = coords[i], c2 = coords[j];
              if (!c1 || !c2) return null;
              const [x1, y1] = c1, [x2, y2] = c2;
              const broken = isLineBroken(i, j);
              
              const lineKey = `${Math.min(i,j)}-${Math.max(i,j)}`;
              const isActive = activeLines.has(lineKey);
              const isCurrentLine = currentLine === lineKey;
              const bothNodesLit = litNodes.has(i) && litNodes.has(j);
              const oneNodeAnimating = animatingNodes.has(i) || animatingNodes.has(j);
              
              let lineColor = '#374151';
              let lineWidth = strokeW;
              let lineOpacity = 0.6;
              let filter = '';
              let glowEffect = false;
              
              if (broken) {
                lineColor = '#ef4444';
                lineWidth = strokeW * 0.8;
                lineOpacity = 0.9;
              } else if (isCurrentLine) {
                lineColor = '#86efac';
                lineWidth = strokeW * 3;
                lineOpacity = 1;
                filter = 'url(#glowCurrent)';
                glowEffect = true;
              } else if (isActive) {
                lineColor = '#22c55e';
                lineWidth = strokeW * 2;
                lineOpacity = 0.9;
                filter = 'url(#glowLine)';
              } else if (bothNodesLit) {
                lineColor = '#22c55e';
                lineWidth = strokeW * 1.2;
                lineOpacity = 0.7;
              } else if (oneNodeAnimating) {
                lineColor = '#4ade80';
                lineWidth = strokeW * 1.5;
                lineOpacity = 0.5;
              } else if (blackoutNodes.has(i) || blackoutNodes.has(j)) {
                lineColor = '#1f2937';
                lineOpacity = 0.2;
              }
              
              return (
                <g key={`line-${i}-${j}`}>
                  <line x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke="#1f2937" strokeWidth={strokeW} opacity={0.4} />
                  <line x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke={lineColor} strokeWidth={lineWidth}
                    strokeDasharray={broken ? '0.025,0.015' : 'none'}
                    opacity={lineOpacity} filter={filter}
                    style={glowEffect ? { animation: 'electricPulse 0.3s ease-in-out infinite alternate' } : 
                           isActive ? { animation: 'linePulse 0.8s ease-in-out infinite alternate' } : {}} />
                  {(isCurrentLine || isActive) && !broken && (
                    <>
                      <line x1={x1} y1={y1} x2={x2} y2={y2}
                        stroke="url(#lineFlowGradient)" strokeWidth={lineWidth * 1.5}
                        opacity={0.6} filter="url(#glowCurrent)" />
                      <circle r={nodeR * 0.25} fill="#ffffff" filter="url(#glowCurrent)">
                        <animateMotion dur={isCurrentLine ? "0.4s" : "1s"} repeatCount="indefinite"
                          path={`M${x1},${y1} L${x2},${y2}`} />
                      </circle>
                      {isCurrentLine && (
                        <circle r={nodeR * 0.15} fill="#ffffff" opacity="0.8">
                          <animateMotion dur="0.4s" begin="0.2s" repeatCount="indefinite"
                            path={`M${x1},${y1} L${x2},${y2}`} />
                        </circle>
                      )}
                    </>
                  )}
                </g>
              );
            })
          )}

          {coords.map(([x, y], i) => {
            if (x === undefined || y === undefined) return null;
            const isBlackout = hasResults && blackoutNodes.has(i);
            const isLit = hasResults && litNodes.has(i);
            const isAnimating = animatingNodes.has(i);
            const isSlack = i === (network.slack_bus ?? 0);
            
            let fill = '#1f2937';
            let stroke = '#4b5563';
            let filter = '';
            let r = nodeR;
            let pulseAnim = false;
            
            if (isBlackout) { 
              fill = 'url(#blackoutGradient)'; 
              stroke = '#991b1b'; 
              filter = 'url(#glowRed)'; 
            } else if (isLit)  { 
              fill = isSlack ? '#facc15' : 'url(#nodeGradient)'; 
              stroke = isSlack ? '#ca8a04' : '#4ade80'; 
              filter = 'url(#glowGreen)'; 
              r = nodeR * 1.15;
            } else if (isAnimating) {
              fill = 'url(#nodeGradientAnimating)';
              stroke = '#4ade80';
              filter = 'url(#glowAnimating)';
              r = nodeR * 1.4;
              pulseAnim = true;
            }

            return (
              <g key={`node-${i}`}>
                {(isLit || isAnimating) && !isBlackout && (
                  <circle cx={x} cy={y} r={r * 2}
                    fill={isAnimating ? '#22c55e' : '#4ade80'} 
                    opacity={isAnimating ? 0.3 : 0.15}>
                    {isAnimating && (
                      <>
                        <animate attributeName="r" values={`${r*2};${r*2.8};${r*2}`} dur="0.5s" repeatCount="indefinite" />
                        <animate attributeName="opacity" values="0.3;0.05;0.3" dur="0.5s" repeatCount="indefinite" />
                      </>
                    )}
                  </circle>
                )}
                {(isLit || isAnimating) && !isBlackout && (
                  <circle cx={x} cy={y} r={r * 1.4}
                    fill={isAnimating ? '#4ade80' : '#22c55e'} 
                    opacity={isAnimating ? 0.4 : 0.2}>
                    {isAnimating && (
                      <animate attributeName="opacity" values="0.4;0.1;0.4" dur="0.4s" repeatCount="indefinite" />
                    )}
                  </circle>
                )}
                <circle cx={x} cy={y} r={r}
                  fill={fill} stroke={stroke} 
                  strokeWidth={isAnimating ? strokeW * 2 : strokeW * 0.8} 
                  filter={filter}
                  style={pulseAnim ? { animation: 'nodeElectricPulse 0.4s ease-in-out infinite alternate' } : {}} />
                <text x={x} y={y} dy="0.35em" fontSize={fontSize} fill="white"
                  textAnchor="middle" fontWeight="bold"
                  style={{ userSelect: 'none', pointerEvents: 'none' }}>
                  {i + 1}
                </text>
                {isBlackout && (
                  <g>
                    <rect x={x - 0.04} y={y - nodeR - 0.038}
                      width={0.08} height={0.024} rx={0.003} fill="rgba(220, 38, 38, 0.9)" />
                    <text x={x} y={y - nodeR - 0.026} fontSize={fontSize * 0.50} fill="#fff"
                      textAnchor="middle" dy="0.35em" fontWeight="bold">OFF</text>
                  </g>
                )}
                {isAnimating && (
                  <>
                    <circle cx={x} cy={y} r={r * 0.5} fill="#ffffff" opacity="0.9">
                      <animate attributeName="opacity" values="0.9;0.3;0.9" dur="0.3s" repeatCount="indefinite" />
                    </circle>
                    <circle cx={x} cy={y} r={r * 0.25} fill="#ffffff" />
                  </>
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

const ComparisonCharts = ({ comparison }) => {
  if (!comparison) return null;
  const methods = Object.entries(comparison.methods);
  const times = methods.map(([, d]) => d.time * 1000);
  const maxTime = Math.max(...times, 0.01);
  const residuals = methods.map(([, d]) => d.residual);
  const logMin = -16;
  const logMax = 0;
  const logBar = (r) => {
    const l = Math.log10(Math.max(r, 1e-16));
    return Math.min(100, Math.max(2, ((logMax - l) / (logMax - logMin)) * 100));
  };
  const BAR_MAX_PX = 160;
  
  const methodColors = { 
    gauss: '#ff6b6b',
    lu: '#4ecdc4',
    cholesky: '#ffe66d'
  };
  
  const getColor = (m) => methodColors[m] || '#888';

  return (
    <div className="charts-container">
      <div className="chart">
        <h4>Temps d'exécution (ms)</h4>
        <div className="bar-chart" style={{ alignItems: 'flex-end', height: BAR_MAX_PX + 40 }}>
          {methods.map(([method, data]) => {
            const heightPx = Math.max(4, (data.time * 1000 / maxTime) * BAR_MAX_PX);
            const isBest = comparison.recommendation.method === method;
            const color = getColor(method);
            return (
              <div key={method} className="bar-wrapper">
                <span className="bar-value" style={{ fontSize: 11, marginBottom: 2 }}>
                  {(data.time * 1000).toFixed(2)}
                </span>
                <div style={{
                  width: 44, height: heightPx,
                  background: isBest
                    ? `linear-gradient(180deg, ${color} 0%, ${color}dd 100%)`
                    : `linear-gradient(180deg, ${color}aa 0%, ${color}66 100%)`,
                  borderRadius: '4px 4px 0 0',
                  border: isBest ? `2px solid ${color}` : `1px solid ${color}`,
                  position: 'relative',
                  transition: 'height 0.4s ease',
                }}>
                  {isBest && (
                    <span style={{
                      position: 'absolute', top: -18, left: '50%',
                      transform: 'translateX(-50%)', fontSize: 13,
                    }}>🏆</span>
                  )}
                </div>
                <span className="bar-label">{method.toUpperCase()}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="chart">
        <h4>Précision (résidu ‖Ax-b‖)</h4>
        <div className="bar-chart" style={{ alignItems: 'flex-end', height: BAR_MAX_PX + 40 }}>
          {methods.map(([method, data]) => {
            const heightPx = (logBar(data.residual) / 100) * BAR_MAX_PX;
            const isBest = comparison.recommendation.method === method;
            const logVal = Math.log10(Math.max(data.residual, 1e-16));
            const color = getColor(method);
            return (
              <div key={method} className="bar-wrapper">
                <span className="bar-value" style={{ fontSize: 10, marginBottom: 2 }}>
                  {data.residual.toExponential(1)}
                </span>
                <div style={{
                  width: 44, height: Math.max(4, heightPx),
                  background: isBest
                    ? `linear-gradient(180deg, ${color} 0%, ${color}dd 100%)`
                    : `linear-gradient(180deg, ${color}aa 0%, ${color}66 100%)`,
                  borderRadius: '4px 4px 0 0',
                  border: isBest ? `2px solid ${color}` : `1px solid ${color}`,
                  transition: 'height 0.4s ease',
                }} />
                <span className="bar-label">{method.toUpperCase()}</span>
                <span style={{ fontSize: 9, color: '#6b7280', marginTop: 1 }}>
                  10<sup>{logVal.toFixed(0)}</sup>
                </span>
              </div>
            );
          })}
        </div>
        <p style={{ fontSize: 10, color: '#6b7280', textAlign: 'center', marginTop: 4 }}>
          Barre haute = meilleure précision
        </p>
      </div>
    </div>
  );
};

const App = () => {
  const [network, setNetwork] = useState(null);
  const [modifiedA, setModifiedA] = useState(null);
  const [selectedMethods, setSelectedMethods] = useState(['lu']);
  const [scenario, setScenario] = useState('standard');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState({});
  const [comparison, setComparison] = useState(null);
  const [brokenLines, setBrokenLines] = useState([]);
  const [litNodes, setLitNodes] = useState(new Set());
  const [blackoutNodes, setBlackoutNodes] = useState(new Set());
  const [activeTab, setActiveTab] = useState('visualization');
  const [tempBrokenLine, setTempBrokenLine] = useState({ from: '', to: '' });
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [errorMessage, setErrorMessage] = useState('');
  const [blackoutSummary, setBlackoutSummary] = useState(null);
  const [animatingNodes, setAnimatingNodes] = useState(new Set());
  const [activeLines, setActiveLines] = useState(new Set());
  const [currentLine, setCurrentLine] = useState(null);

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

  const calculateModifiedMatrix = useCallback((originalA, lines) => {
    if (!originalA || lines.length === 0) return originalA;
    
    const n = originalA.length;
    const A_mod = originalA.map(row => row.map(val => Number(val) || 0));
    
    lines.forEach(line => {
      const i = parseInt(line.from);
      const j = parseInt(line.to);
      if (i >= 0 && i < n && j >= 0 && j < n && i !== j) {
        const bij = -A_mod[i][j];
        if (bij !== 0) {
          A_mod[i][j] = 0;
          A_mod[j][i] = 0;
          A_mod[i][i] = A_mod[i][i] - bij;
          A_mod[j][j] = A_mod[j][j] - bij;
        }
      }
    });
    
    return A_mod;
  }, []);

  const loadIEEE = async (size) => {
    if (connectionStatus !== 'connected') { alert('Pas de connexion au backend.'); return; }
    try {
      setLoading(true);
      setErrorMessage('');
      const res = await fetch(`${API_URL}/api/ieee/${size}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (data.A) data.A = data.A.map(row => row.map(v => Number(v) || 0));
      if (data.b) data.b = data.b.map(v => Number(v) || 0);
      if (!data.coords?.length) data.coords = generateCoords(data.n);
      setNetwork(data);
      setModifiedA(null);
      setResults({});
      setComparison(null);
      setLitNodes(new Set());
      setBlackoutNodes(new Set());
      setBrokenLines([]);
      setBlackoutSummary(null);
      setActiveLines(new Set());
      setCurrentLine(null);
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
        const newNetwork = {
          A: data.matrix?.map(row => row.map(v => Number(v) || 0)),
          b: data.vector?.map(v => Number(v) || 0),
          n, name: 'Réseau Importé',
          coords: data.coords || generateCoords(n),
          slack_bus: 0,
        };
        setNetwork(newNetwork);
        setModifiedA(null);
        setBrokenLines([]);
        setResults({});
        setBlackoutSummary(null);
        setActiveLines(new Set());
        setCurrentLine(null);
      } catch { alert('Format JSON invalide'); }
    };
    reader.readAsText(file);
  };

  const toggleMethod = (method) => {
    setSelectedMethods(prev => {
      const newMethods = prev.includes(method) ? prev.filter(m => m !== method) : [...prev, method];
      if (newMethods.length < 2) {
        setComparison(null);
        if (activeTab === 'comparison') {
          setActiveTab('results');
        }
      }
      return newMethods;
    });
  };

  const addBrokenLine = () => {
    const from = parseInt(tempBrokenLine.from) - 1;
    const to = parseInt(tempBrokenLine.to) - 1;
    
    if (isNaN(from) || isNaN(to) || from === to) return;
    if (!network || from < 0 || from >= network.n || to < 0 || to >= network.n) {
      alert(`Nœuds entre 1 et ${network?.n}`); return;
    }
    if (network.A[from][to] === 0 && network.A[to][from] === 0) {
      alert("Cette ligne n'existe pas dans le réseau"); return;
    }
    if (brokenLines.some(l => (l.from===from&&l.to===to)||(l.from===to&&l.to===from))) {
      alert('Ligne déjà coupée'); return;
    }
    
    const newBrokenLines = [...brokenLines, { from, to }];
    setBrokenLines(newBrokenLines);
    setModifiedA(calculateModifiedMatrix(network.A, newBrokenLines));
    setTempBrokenLine({ from: '', to: '' });
    
    const slackBus = network.slack_bus ?? 0;
    const { connected, blackout } = findIslandsAfterBreaks(network, slackBus, newBrokenLines);
    
    setLitNodes(new Set());
    setBlackoutNodes(new Set(blackout));
    if (blackout.length > 0) {
      setBlackoutSummary({ count: blackout.length, nodes: blackout });
    } else {
      setBlackoutSummary(null);
    }
    setResults({});
    setActiveLines(new Set());
    setCurrentLine(null);
  };

  const removeBrokenLine = (index) => {
    const newBrokenLines = brokenLines.filter((_, i) => i !== index);
    setBrokenLines(newBrokenLines);
    setModifiedA(calculateModifiedMatrix(network.A, newBrokenLines));
    
    const slackBus = network.slack_bus ?? 0;
    const { connected, blackout } = findIslandsAfterBreaks(network, slackBus, newBrokenLines);
    
    setLitNodes(new Set());
    setBlackoutNodes(new Set(blackout));
    if (blackout.length > 0) {
      setBlackoutSummary({ count: blackout.length, nodes: blackout });
    } else {
      setBlackoutSummary(null);
    }
    setResults({});
    setActiveLines(new Set());
    setCurrentLine(null);
  };

  const resetMatrix = () => {
    setBrokenLines([]);
    setModifiedA(null);
    setResults({});
    setLitNodes(new Set());
    setBlackoutNodes(new Set());
    setBlackoutSummary(null);
    setActiveLines(new Set());
    setCurrentLine(null);
  };

  const animateRealisticPropagation = async (propagationOrder, slackBus) => {
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    
    setLitNodes(new Set([slackBus]));
    setAnimatingNodes(new Set());
    setActiveLines(new Set());
    setCurrentLine(null);
    
    await delay(400);
    
    for (let i = 1; i < propagationOrder.length; i++) {
      const { node, parent, depth, lineKey } = propagationOrder[i];
      
      setCurrentLine(lineKey);
      setActiveLines(prev => new Set([...prev, lineKey]));
      
      await delay(350);
      
      setAnimatingNodes(prev => new Set([...prev, node]));
      
      await delay(250);
      
      setAnimatingNodes(prev => {
        const newSet = new Set(prev);
        newSet.delete(node);
        return newSet;
      });
      
      setLitNodes(prev => new Set([...prev, node]));
      setCurrentLine(null);
      
      await delay(150);
    }
    
    await delay(800);
    setActiveLines(new Set());
    setCurrentLine(null);
  };

  const solve = async () => {
    if (!network || selectedMethods.length === 0) return;
    setLoading(true);
    setLitNodes(new Set());
    setBlackoutNodes(new Set());
    setBlackoutSummary(null);
    setActiveLines(new Set());
    setCurrentLine(null);

    const newResults = {};
    let lastLit = [], lastBlackout = [];
    
    const matrixToSolve = modifiedA || network.A;

    try {
      for (const method of selectedMethods) {
        const res = await fetch(`${API_URL}/api/solve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            A: matrixToSolve,
            b: network.b,
            method,
            scenario,
            broken_lines: [],
            slack_bus: network.slack_bus ?? 0,
          })
        });
        const data = await res.json();
        newResults[method] = data;
        if (!data.error) {
          lastLit = data.lit_nodes ?? [];
          lastBlackout = data.blackout_nodes ?? [];
        }
      }

      const slackBus = network.slack_bus ?? 0;
      const propagationOrder = getRealisticPropagationOrder(network, slackBus, brokenLines);
      
      await animateRealisticPropagation(propagationOrder, slackBus);
      
      setResults(newResults);
      setBlackoutNodes(new Set(lastBlackout));
      if (lastBlackout.length > 0) {
        setBlackoutSummary({ count: lastBlackout.length, nodes: lastBlackout });
      }

      if (selectedMethods.length >= 2 &&
          Object.values(newResults).filter(r => !r.error).length >= 2) {
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
          reason: `Meilleur temps: ${(best[1].time * 1000).toFixed(2)}ms — résidu: ${best[1].residual.toExponential(2)}`
        }
      });
    }
  };

  const modifyB = (index, value) => {
    const newB = [...network.b];
    newB[index] = parseFloat(value) || 0;
    setNetwork({ ...network, b: newB });
  };

  const renderConnectionStatus = () => {
    if (connectionStatus === 'connecting') return <span className="status-connecting">🟡 Connexion...</span>;
    if (connectionStatus === 'connected') return <span className="status-connected">🟢 Connecté</span>;
    return <span className="status-error" onClick={checkConnection}>🔴 Déconnecté (cliquer pour réessayer)</span>;
  };

  const renderFullMatrix = (title) => {
    const matrix = modifiedA || (network?.A);
    if (!matrix || !Array.isArray(matrix)) return null;
    const n = matrix.length;
    const isModified = modifiedA !== null;
    
    return (
      <div className="matrix-full-container">
        <div className="matrix-header">
          <h3>{title}{isModified && <span style={{color: '#ef4444', marginLeft: 8, fontSize: 12}}>(Modifiée)</span>}</h3>
          <span className="matrix-dims">{n}×{n}</span>
        </div>
        <div className="matrix-scroll-wrapper">
          <div className="matrix-full">
            {matrix.map((row, i) => (
              <div key={i} className="matrix-row-full">
                {row.map((val, j) => {
                  const numVal = Number(val);
                  const display = Math.abs(numVal) < 0.001 ? numVal.toExponential(2) : numVal.toFixed(3);
                  const isBrokenLine = brokenLines.some(l => 
                    (l.from === i && l.to === j) || (l.from === j && l.to === i)
                  );
                  return (
                    <span key={j}
                      className={`matrix-cell-full ${i===j?'diagonal':''} ${Math.abs(numVal)<0.001?'zero':''} ${isBrokenLine?'broken':''}`}
                      title={`[${i+1},${j+1}]: ${numVal}`}
                      style={isBrokenLine ? {background: 'rgba(239,68,68,0.3)', color: '#fca5a5'} : {}}>
                      {display}
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        {isModified && (
          <div style={{marginTop: 8, fontSize: 11, color: '#fca5a5', textAlign: 'center'}}>
            ⚠️ Matrice modifiée par {brokenLines.length} coupure(s) de ligne
          </div>
        )}
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
                <span className="vector-index">b[{i+1}]</span>
                <input type="number" step="0.001" value={val}
                  onChange={(e) => modifyB(i, e.target.value)} className="vector-input" />
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
                  <button onClick={() => loadIEEE(14)} className="btn ieee">IEEE 14</button>
                  <button onClick={() => loadIEEE(30)} className="btn ieee">IEEE 30</button>
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
                <button onClick={() => loadIEEE(14)} className="btn ieee">IEEE 14</button>
                <button onClick={() => loadIEEE(30)} className="btn ieee">IEEE 30</button>
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
                  { id: 'lu', label: 'Factorisation LU (Stable)' },
                  { id: 'gauss', label: 'Élimination Gauss' },
                  { id: 'cholesky', label: 'Cholesky (SDP)' },
                ].map(m => (
                  <label key={m.id}
                    className={`checkbox-label ${selectedMethods.includes(m.id) ? 'selected' : ''}`}>
                    <input type="checkbox" checked={selectedMethods.includes(m.id)}
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
                  { id: 'matin', label: '🌅 Matin +30%' },
                  { id: 'soir', label: '🌆 Soir -20%' },
                ].map(s => (
                  <button key={s.id}
                    className={`scenario-btn ${scenario === s.id ? 'active' : ''}`}
                    onClick={() => setScenario(s.id)}>{s.label}</button>
                ))}
              </div>
            </div>
            <button onClick={solve} className="btn solve-btn"
              disabled={loading || selectedMethods.length === 0}>
              {loading ? '⏳ Calcul...' : '🚀 Lancer résolution'}
            </button>
          </div>

          <div className="section danger-zone">
            <h2>✂️ SIMULATION DE COUPURE</h2>
            {blackoutSummary && (
              <div style={{
                background: 'rgba(220,38,38,0.15)', border: '1px solid #dc2626',
                borderRadius: 6, padding: '8px 10px', marginBottom: 10, fontSize: 12,
              }}>
                <strong style={{ color: '#f87171' }}>🔴 {blackoutSummary.count} nœud(s) hors tension</strong>
                <div style={{ color: '#fca5a5', marginTop: 3 }}>
                  Nœuds isolés : {blackoutSummary.nodes.map(n => n + 1).join(', ')}
                </div>
              </div>
            )}
            <div className="broken-lines-list">
              {brokenLines.map((line, idx) => (
                <div key={idx} className="broken-line-item">
                  <span>Ligne {line.from + 1} ↔ {line.to + 1}</span>
                  <button onClick={() => removeBrokenLine(idx)} className="remove-line">×</button>
                </div>
              ))}
            </div>
            <div className="add-fault-form">
              <input type="number" placeholder={`Départ (1-${network.n})`}
                value={tempBrokenLine.from}
                onChange={(e) => setTempBrokenLine({ ...tempBrokenLine, from: e.target.value })} />
              <input type="number" placeholder={`Arrivée (1-${network.n})`}
                value={tempBrokenLine.to}
                onChange={(e) => setTempBrokenLine({ ...tempBrokenLine, to: e.target.value })} />
              <button onClick={addBrokenLine} className="btn add-fault-btn">+ Couper</button>
            </div>
            {brokenLines.length > 0 && (
              <div className="fault-status" style={{display: 'flex', gap: 8, flexDirection: 'column'}}>
                <span className={blackoutNodes.size > 0 ? 'blackout-badge' : 'stable-badge'}>
                  {blackoutNodes.size > 0 ? `🔴 BLACKOUT (${blackoutNodes.size} nœuds)` : '🟢 STABLE'}
                  {' '}— {brokenLines.length} ligne(s) coupée(s)
                </span>
                <button onClick={resetMatrix} className="btn" style={{
                  background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.5)',
                  color: '#fca5a5', padding: '6px', fontSize: 11, borderRadius: 6, cursor: 'pointer'
                }}>
                  🔄 Réinitialiser la matrice
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="main-content">
          <div className="tabs">
            <button className={`tab ${activeTab==='visualization'?'active':''}`} onClick={() => setActiveTab('visualization')}>🌐 Visualisation</button>
            <button className={`tab ${activeTab==='matrices'?'active':''}`} onClick={() => setActiveTab('matrices')}>🧮 Matrices</button>
            <button className={`tab ${activeTab==='results'?'active':''}`} onClick={() => setActiveTab('results')}>
              📊 Résultats {Object.keys(results).length > 0 && `(${Object.keys(results).length})`}
            </button>
            {comparison && selectedMethods.length >= 2 && (
              <button className={`tab ${activeTab==='comparison'?'active':''}`} onClick={() => setActiveTab('comparison')}>⚖️ Comparaison</button>
            )}
          </div>

          <div className="tab-content">
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
                    {modifiedA && (
                      <span style={{ color: '#facc15', marginLeft: 8 }}>
                        · ⚡ Matrice modifiée
                      </span>
                    )}
                  </span>
                </div>
                <div className="network-container">
                  <NetworkSVG
                    network={network}
                    modifiedA={modifiedA}
                    litNodes={litNodes}
                    blackoutNodes={blackoutNodes}
                    brokenLines={brokenLines}
                    animatingNodes={animatingNodes}
                    activeLines={activeLines}
                    currentLine={currentLine}
                  />
                </div>
                <div className="legend">
                  <div className="legend-item">
                    <span className="dot lit"></span>
                    <span>Alimenté</span>
                  </div>
                  <div className="legend-item">
                    <span style={{
                      display: 'inline-block',
                      width: 14,
                      height: 14,
                      borderRadius: '50%',
                      background: '#facc15',
                      boxShadow: '0 0 10px #facc15',
                      border: '2px solid #ca8a04',
                      marginRight: 8,
                      verticalAlign: 'middle'
                    }}></span>
                    <span>Bus Slack (Réf.)</span>
                  </div>
                  <div className="legend-item">
                    <span className="dot unlit"></span>
                    <span>Non résolu</span>
                  </div>
                  <div className="legend-item">
                    <span className="dot blackout"></span>
                    <span>Hors tension</span>
                  </div>
                  <div className="legend-item">
                    <span style={{ display:'inline-block', width:24, height:2, background:'#ef4444', marginRight:5, verticalAlign:'middle' }}></span>
                    <span>Ligne interrompue</span>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'matrices' && (
              <div className="matrices-panel">
                <div className="matrix-section">{renderFullMatrix('Matrice A (Admittances/Ybus)')}</div>
                <div className="matrix-section">{renderFullVector(network.b, 'Vecteur b (Puissances nettes P)')}</div>
              </div>
            )}

            {activeTab === 'results' && (
              <div className="results-panel">
                {Object.keys(results).length === 0 ? (
                  <div className="empty-state"><p>Lancez la résolution pour voir les résultats</p></div>
                ) : (
                  <div className="results-grid">
                    {Object.entries(results).map(([method, data]) => {
                      const perf = PERFORMANCE_DESC[method] || { label: 'Inconnu', detail: '', color: '#888' };
                      return (
                        <div key={method} className={`result-card ${data.error ? 'error' : ''}`}>
                          <div className="result-header">
                            <h3>{method.toUpperCase()}</h3>
                            {data.error ? <span className="badge error">Erreur</span> : <span className="badge success">OK</span>}
                          </div>
                          {!data.error && (
                            <>
                              {data.isolated_islands && (
                                <div style={{
                                  background:'rgba(220,38,38,0.12)', border:'1px solid #ef4444',
                                  borderRadius:4, padding:'6px 8px', marginBottom:8, fontSize:11, color:'#fca5a5'
                                }}>
                                  ⚠️ Îlot détecté — {data.blackout_nodes?.length} nœud(s) hors tension : {data.blackout_nodes?.map(n => n + 1).join(', ')}
                                </div>
                              )}
                              <div className="result-metrics">
                                <div className="metric">
                                  <label>⏱️ Temps d'exécution</label>
                                  <value>{(data.time * 1000).toFixed(3)} ms</value>
                                </div>
                                <div className="metric">
                                  <label>⚡ Performance</label>
                                  <value style={{ color: perf.color, fontSize: '14px', fontWeight: 'bold' }}>
                                    {perf.label}
                                  </value>
                                </div>
                                <div className="metric">
                                  <label>🎯 Précision</label>
                                  <value>{data.residual?.toExponential(2)}</value>
                                </div>
                              </div>
                              <div className="solution-section">
                                <h4>Solution — Angles de phase θ (rad)</h4>
                                <div className="solution-grid">
                                  {data.solution?.map((val, i) => (
                                    <div key={i} className="solution-item"
                                      style={data.blackout_nodes?.includes(i) ? { opacity: 0.35 } : {}}>
                                      <span className="theta-label">θ<sub>{i+1}</sub></span>
                                      <span className="theta-value">
                                        {val === null || val === undefined
                                          ? '— hors tension'
                                          : `${val.toFixed(6)} rad`}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </>
                          )}
                          {data.error && <div className="error-message">⚠️ {data.error}</div>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'comparison' && comparison && selectedMethods.length >= 2 && (
              <div className="comparison-panel">
                <h2>📊 Analyse comparative</h2>

                <ComparisonCharts comparison={comparison} />

                <h3 style={{ marginTop: 24, marginBottom: 16, color: '#00d2ff', fontSize: '16px' }}>
                  Recommandations par méthode
                </h3>
                <div style={{ 
                  display: 'flex', 
                  flexDirection: 'column',
                  gap: '16px',
                  marginTop: 16
                }}>
                  {Object.entries(comparison.methods)
                    .sort(([,a], [,b]) => a.time - b.time)
                    .map(([method, data]) => {
                    const perf = PERFORMANCE_DESC[method] || { label: 'Inconnu', color: '#888', recommendation: '' };
                    const isBest = comparison.recommendation.method === method;
                    return (
                      <div key={method} style={{
                        background: isBest ? `${perf.color}15` : 'rgba(30,41,59,0.6)',
                        border: `1px solid ${isBest ? perf.color : 'rgba(255,255,255,0.1)'}`,
                        borderRadius: '12px',
                        padding: '16px',
                        position: 'relative'
                      }}>
                        {isBest && (
                          <span style={{
                            position: 'absolute',
                            top: -10,
                            right: 10,
                            background: perf.color,
                            color: '#0f172a',
                            padding: '2px 8px',
                            borderRadius: '12px',
                            fontSize: '10px',
                            fontWeight: 'bold'
                          }}>
                            RECOMMANDÉ
                          </span>
                        )}
                        <div style={{ 
                          fontSize: '16px', 
                          fontWeight: 'bold', 
                          color: perf.color,
                          marginBottom: '8px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px'
                        }}>
                          {method.toUpperCase()}
                          <span style={{ 
                            fontSize: '10px', 
                            background: `${perf.color}20`,
                            color: perf.color,
                            padding: '2px 6px',
                            borderRadius: '4px'
                          }}>
                            {perf.label}
                          </span>
                        </div>
                        <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '12px' }}>
                          {(data.time * 1000).toFixed(3)} ms · Résidu {data.residual.toExponential(2)}
                        </div>
                        <div style={{ 
                          fontSize: '13px', 
                          color: '#e2e8f0',
                          lineHeight: '1.5'
                        }}>
                          {perf.recommendation}
                        </div>
                      </div>
                    );
                  })}
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