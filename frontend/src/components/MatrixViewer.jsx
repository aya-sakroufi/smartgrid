import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import './MatrixViewer.css';

const MatrixViewer = ({ matrix, vector, title, type }) => {
  const [showAll, setShowAll] = useState(false);
  
  const data = useMemo(() => {
    return type === 'matrix' ? matrix : vector.map(v => [v]);
  }, [matrix, vector, type]);

  const isLarge = data.length > 20;
  const displayData = showAll || !isLarge ? data : data.slice(0, 15);
  const dimensions = type === 'matrix' ? `${data.length}×${data[0]?.length || 0}` : `${data.length}×1`;

  return (
    <motion.div 
      className="matrix-card"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="matrix-header">
        <div className="matrix-title">
          <h4>{title}</h4>
          <span className="dim-badge">{dimensions}</span>
        </div>
        {isLarge && (
          <button onClick={() => setShowAll(!showAll)} className="btn-toggle">
            {showAll ? 'Réduire' : 'Voir tout'}
          </button>
        )}
      </div>

      <div className="matrix-body">
        <div className="matrix-scroll">
          <table className="matrix-table">
            <tbody>
              {type === 'matrix' ? (
                displayData.map((row, i) => (
                  <tr key={i}>
                    {i === 0 && <td rowSpan={displayData.length} className="bracket">[</td>}
                    {row.map((val, j) => (
                      <td 
                        key={j} 
                        className={`cell ${i === j ? 'diagonal' : ''} ${Math.abs(val) > 10 ? 'high-value' : ''}`}
                      >
                        {Number(val).toFixed(3)}
                      </td>
                    ))}
                    {i === 0 && <td rowSpan={displayData.length} className="bracket">]</td>}
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="bracket">[</td>
                  <td>
                    <div className="vector-col">
                      {displayData.map((val, i) => (
                        <div key={i} className={`vector-cell ${val[0] > 0 ? 'positive' : 'negative'}`}>
                          {Number(val[0]).toFixed(4)}
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="bracket">]</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      {type === 'vector' && (
        <div className="matrix-footer">
          <span className="legend-item positive">● Production (+)</span>
          <span className="legend-item negative">● Consommation (-)</span>
        </div>
      )}
    </motion.div>
  );
};

export default MatrixViewer;
