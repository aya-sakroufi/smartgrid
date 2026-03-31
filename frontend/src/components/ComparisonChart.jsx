import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Trophy, AlertCircle, Zap } from 'lucide-react';
import './ComparisonChart.css';

const ComparisonChart = ({ comparison }) => {
  const methods = ['gauss', 'lu', 'cholesky'];
  
  const data = methods.map(method => {
    const result = comparison[method];
    return {
      name: method.toUpperCase(),
      time: result?.success ? result.time * 1000 : 0, // Convertir en ms
      residual: result?.success ? Math.log10(result.residual) : -15,
      success: result?.success,
      iterations: result?.iterations || 0
    };
  });

  const recommendation = comparison.recommendation;
  const bestMethod = recommendation?.method;

  return (
    <div className="comparison-panel">
      <div className="comparison-header">
        <h3><Trophy size={20} /> Analyse comparative</h3>
      </div>
      
      <div className="charts-grid">
        <div className="chart-container">
          <h4>Temps d'exécution (ms)</h4>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="name" stroke="#666" />
              <YAxis stroke="#666" />
              <Tooltip 
                contentStyle={{ background: '#1a1a2e', border: '1px solid #333' }}
                itemStyle={{ color: '#e0e0e0' }}
              />
              <Bar dataKey="time" fill="#00d4ff" radius={[4, 4, 0, 0]}>
                {data.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={entry.name.toLowerCase() === bestMethod ? '#00ff88' : '#00d4ff'} 
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-container">
          <h4>Précision (log₁₀ résidu)</h4>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="name" stroke="#666" />
              <YAxis stroke="#666" />
              <Tooltip 
                contentStyle={{ background: '#1a1a2e', border: '1px solid #333' }}
                formatter={(value) => value.toFixed(2)}
              />
              <Bar dataKey="residual" fill="#ffaa00" radius={[4, 4, 0, 0]}>
                {data.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={entry.name.toLowerCase() === bestMethod ? '#00ff88' : '#ffaa00'} 
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="recommendation-box">
        <div className="recommendation-header">
          <Zap size={24} className="recommendation-icon" />
          <div>
            <h4>Recommandation: {recommendation?.method?.toUpperCase()}</h4>
            <p>{recommendation?.reason}</p>
          </div>
        </div>
        
        <div className="methods-analysis">
          <div className="method-card">
            <strong>Gauss</strong>
            <p>Simple mais sans réutilisation de la factorisation. Complexité O(n³).</p>
            <span className={`status ${comparison.gauss?.success ? 'ok' : 'fail'}`}>
              {comparison.gauss?.success ? '✓ Stable' : '✗ Échec'}
            </span>
          </div>
          
          <div className="method-card recommended">
            <strong>LU</strong>
            <p>Plus stable numériquement grâce au pivot partiel. Recommandé pour matrices générales.</p>
            <span className="status ok">✓ Optimal</span>
          </div>
          
          <div className="method-card">
            <strong>Cholesky</strong>
            <p>2x plus rapide si matrice SDP. Nécessite symétrie définie positive stricte.</p>
            <span className={`status ${comparison.cholesky?.success ? 'ok' : 'fail'}`}>
              {comparison.cholesky?.success ? '✓ Rapide' : '✗ Non applicable'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ComparisonChart;
