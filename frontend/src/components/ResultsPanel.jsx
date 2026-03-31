import React from 'react';
import { CheckCircle, Clock, Calculator, AlertTriangle } from 'lucide-react';
import './ResultsPanel.css';

const ResultsPanel = ({ results, network }) => {
  const { method, time, residual, iterations, solution, condition_number, scenario } = results;
  
  const formatNumber = (num) => {
    if (Math.abs(num) < 0.01) return num.toExponential(2);
    return num.toFixed(4);
  };

  return (
    <div className="results-panel">
      <div className="results-header">
        <h3><CheckCircle size={20} /> Résolution terminée</h3>
        <span className="method-badge">{method.toUpperCase()}</span>
      </div>
      
      <div className="metrics-grid">
        <div className="metric-card">
          <Clock size={18} className="metric-icon" />
          <div className="metric-info">
            <span className="metric-label">Temps de calcul</span>
            <span className="metric-value">{time.toFixed(4)}s</span>
          </div>
        </div>
        
        <div className="metric-card">
          <Calculator size={18} className="metric-icon" />
          <div className="metric-info">
            <span className="metric-label">Itérations</span>
            <span className="metric-value">{iterations.toLocaleString()}</span>
          </div>
        </div>
        
        <div className="metric-card">
          <AlertTriangle size={18} className="metric-icon" />
          <div className="metric-info">
            <span className="metric-label">Résidu ||Ax-b||</span>
            <span className="metric-value">{residual.toExponential(2)}</span>
          </div>
        </div>
        
        <div className="metric-card">
          <div className="metric-icon">κ</div>
          <div className="metric-info">
            <span className="metric-label">Conditionnement</span>
            <span className={`metric-value ${condition_number > 1e6 ? 'warning' : ''}`}>
              {condition_number.toExponential(2)}
            </span>
          </div>
        </div>
      </div>
      
      {scenario !== 'standard' && (
        <div className="scenario-info">
          Scénario actif: <strong>{scenario === 'matin' ? 'Pic de consommation (+30%)' : 'Soir (-20%)'}</strong>
        </div>
      )}
      
      <div className="solution-section">
        <h4>Solution (Angles de phase θ)</h4>
        <div className="solution-grid">
          {solution.map((val, i) => (
            <div key={i} className="solution-item">
              <span className="node-index">θ<sub>{i}</sub></span>
              <span className={`node-value ${Math.abs(val) > 0.5 ? 'high' : ''}`}>
                {formatNumber(val)} rad
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ResultsPanel;
