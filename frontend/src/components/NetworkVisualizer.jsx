import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './NetworkVisualizer.css';

const NetworkVisualizer = ({ network, results, loading, progress, brokenLine, blackoutMode, litNodes }) => {
  const { coords, A, n } = network;

  const nodeStatus = useMemo(() => {
    return coords.map((_, i) => {
      if (blackoutMode) return 'blackout';
      if (results && !loading) return 'solved';
      if (loading && litNodes.has(i)) return 'active';
      return 'idle';
    });
  }, [blackoutMode, results, loading, litNodes, coords]);

  return (
    <div className="network-container">
      <div className="network-header">
        <h3>{network.name}</h3>
        <div className="network-stats">
          <span className="stat-item">
            <span className="stat-value">{n}</span> nœuds
          </span>
          <span className="stat-divider">|</span>
          <span className="stat-item">
            <span className="stat-value">
              {Math.floor(A.flat().filter(x => x !== 0).length / 2)}
            </span> lignes
          </span>
        </div>
      </div>

      <div className="svg-wrapper">
        <svg viewBox="0 0 1 1" className="network-svg">
          <defs>
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="0.015" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
            <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.2" />
              <stop offset="50%" stopColor="#00d4ff" stopOpacity="1" />
              <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.2" />
            </linearGradient>
          </defs>

          {/* Lignes */}
          <g className="lines-layer">
            {A.map((row, i) => 
              row.map((val, j) => {
                if (j <= i || val === 0) return null;
                const [x1, y1] = coords[i];
                const [x2, y2] = coords[j];
                const isBroken = brokenLine?.from === i && brokenLine?.to === j;
                const isLit = litNodes.has(i) && litNodes.has(j) && !blackoutMode;
                
                return (
                  <motion.line
                    key={`line-${i}-${j}`}
                    x1={x1} y1={y1} x2={x2} y2={y2}
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ 
                      pathLength: 1, 
                      opacity: isBroken ? 0.3 : isLit ? 1 : 0.3,
                      stroke: isBroken ? '#ef4444' : isLit ? 'url(#lineGradient)' : '#1e293b'
                    }}
                    transition={{ duration: 0.5, delay: i * 0.01 }}
                    strokeWidth={isBroken ? 0.008 : isLit ? 0.006 : 0.004}
                    strokeDasharray={isBroken ? "0.02,0.02" : "none"}
                    className={isLit ? 'flowing' : ''}
                  />
                );
              })
            )}
          </g>

          {/* Nœuds */}
          <g className="nodes-layer">
            {coords.map(([x, y], i) => (
              <motion.g 
                key={`node-${i}`}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: i * 0.02, type: "spring" }}
              >
                <circle
                  cx={x} cy={y} r="0.02"
                  className={`node-circle ${nodeStatus[i]}`}
                  filter={nodeStatus[i] !== 'idle' ? 'url(#glow)' : ''}
                />
                
                {nodeStatus[i] === 'active' && (
                  <circle
                    cx={x} cy={y} r="0.035"
                    fill="none"
                    stroke="#00d4ff"
                    strokeWidth="0.005"
                    opacity="0.5"
                  >
                    <animate
                      attributeName="r"
                      values="0.02;0.04;0.02"
                      dur="2s"
                      repeatCount="indefinite"
                    />
                    <animate
                      attributeName="opacity"
                      values="0.8;0;0.8"
                      dur="2s"
                      repeatCount="indefinite"
                    />
                  </circle>
                )}

                <text x={x} y={y - 0.04} fontSize="0.022" fill="white" textAnchor="middle" fontWeight="600">
                  {i}
                </text>
                
                {results?.solution && (
                  <text x={x} y={y + 0.045} fontSize="0.018" fill="#10b981" textAnchor="middle" fontFamily="monospace">
                    {results.solution[i].toFixed(2)}rad
                  </text>
                )}
              </motion.g>
            ))}
          </g>
        </svg>
      </div>

      <div className="network-legend">
        <div className="legend-item">
          <span className="dot idle" /> Hors tension
        </div>
        <div className="legend-item">
          <span className="dot active" /> Calcul en cours
        </div>
        <div className="legend-item">
          <span className="dot solved" /> Alimenté
        </div>
        <div className="legend-item">
          <span className="dot blackout" /> Blackout
        </div>
      </div>
    </div>
  );
};

export default NetworkVisualizer;
