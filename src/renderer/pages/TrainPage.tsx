import { useState } from 'react';

function TrainPage() {
  const [isTraining, setIsTraining] = useState(false);
  const [currentEpoch, setCurrentEpoch] = useState(0);
  const [epochHistory, setEpochHistory] = useState<
    Array<{ epoch: number; trainLoss: number; valLoss: number }>
  >([]);

  // Configuration
  const [modelType, setModelType] = useState<'custom_cnn' | 'mobilenet' | 'efficientnet'>(
    'custom_cnn'
  );
  const [epochs, setEpochs] = useState(10);
  const [batchSize, setBatchSize] = useState(32);
  const [learningRate, setLearningRate] = useState(0.001);

  const handleStartTraining = () => {
    setIsTraining(true);
    setCurrentEpoch(0);
    setEpochHistory([]);
    // TODO: Implement actual training via IPC
    // Simulate epochs for now
    let epoch = 0;
    const interval = setInterval(() => {
      epoch++;
      setCurrentEpoch(epoch);
      setEpochHistory((prev) => [
        ...prev,
        {
          epoch,
          trainLoss: Math.random() * 0.5 + 0.1 * (epochs - epoch),
          valLoss: Math.random() * 0.5 + 0.15 * (epochs - epoch),
        },
      ]);
      if (epoch >= epochs) {
        clearInterval(interval);
        setIsTraining(false);
      }
    }, 1000);
  };

  const handleStopTraining = () => {
    setIsTraining(false);
    // TODO: Implement training stop via IPC
  };

  const bestValLoss = epochHistory.length > 0 ? Math.min(...epochHistory.map((e) => e.valLoss)) : 0;

  return (
    <div>
      <div className="page-header">
        <h2>Train Model</h2>
        <p>Train a neural network on your cleaned data</p>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Training Status</span>
          <span className={`status-badge ${isTraining ? 'warning' : 'idle'}`}>
            <span className={`status-dot ${isTraining ? 'pulse' : ''}`} />
            {isTraining ? 'Training' : 'Idle'}
          </span>
        </div>

        {isTraining ? (
          <div>
            <div className="grid-3 mb-4">
              <div>
                <div className="stat-value">
                  {currentEpoch}/{epochs}
                </div>
                <div className="stat-label">Epoch</div>
              </div>
              <div>
                <div className="stat-value">
                  {epochHistory.length > 0 ? epochHistory[epochHistory.length - 1].trainLoss.toFixed(4) : '-'}
                </div>
                <div className="stat-label">Train Loss</div>
              </div>
              <div>
                <div className="stat-value">
                  {epochHistory.length > 0 ? epochHistory[epochHistory.length - 1].valLoss.toFixed(4) : '-'}
                </div>
                <div className="stat-label">Val Loss</div>
              </div>
            </div>

            <div className="mb-4">
              <div className="progress-bar">
                <div
                  className="progress-bar-fill"
                  style={{ width: `${(currentEpoch / epochs) * 100}%` }}
                />
              </div>
            </div>

            {/* Simple loss history */}
            <div
              className="mb-4"
              style={{
                padding: '1rem',
                backgroundColor: 'var(--bg-primary)',
                borderRadius: '0.5rem',
                maxHeight: '200px',
                overflowY: 'auto',
              }}
            >
              <div className="text-sm text-muted mb-2">Training History</div>
              {epochHistory.map((e) => (
                <div key={e.epoch} className="text-xs flex gap-4">
                  <span>Epoch {e.epoch}</span>
                  <span>Train: {e.trainLoss.toFixed(4)}</span>
                  <span>Val: {e.valLoss.toFixed(4)}</span>
                </div>
              ))}
            </div>

            <button className="btn btn-danger" onClick={handleStopTraining}>
              Stop Training
            </button>
          </div>
        ) : (
          <div>
            <div className="grid-2 mb-4">
              <div className="form-group">
                <label className="form-label">Model Architecture</label>
                <select
                  className="form-select"
                  value={modelType}
                  onChange={(e) =>
                    setModelType(e.target.value as 'custom_cnn' | 'mobilenet' | 'efficientnet')
                  }
                >
                  <option value="custom_cnn">Custom CNN (Default)</option>
                  <option value="mobilenet">MobileNet</option>
                  <option value="efficientnet">EfficientNet</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Epochs</label>
                <input
                  type="number"
                  className="form-input"
                  value={epochs}
                  onChange={(e) => setEpochs(parseInt(e.target.value))}
                  min={1}
                  max={100}
                />
              </div>
            </div>

            <div className="grid-2 mb-4">
              <div className="form-group">
                <label className="form-label">Batch Size</label>
                <select
                  className="form-select"
                  value={batchSize}
                  onChange={(e) => setBatchSize(parseInt(e.target.value))}
                >
                  <option value={8}>8</option>
                  <option value={16}>16</option>
                  <option value={32}>32</option>
                  <option value={64}>64</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Learning Rate</label>
                <select
                  className="form-select"
                  value={learningRate}
                  onChange={(e) => setLearningRate(parseFloat(e.target.value))}
                >
                  <option value={0.01}>0.01</option>
                  <option value={0.001}>0.001</option>
                  <option value={0.0001}>0.0001</option>
                </select>
              </div>
            </div>

            <button className="btn btn-primary btn-lg" onClick={handleStartTraining}>
              Start Training
            </button>

            {epochHistory.length > 0 && (
              <div className="mt-4">
                <span className="text-sm text-muted">
                  Last training - Best validation loss: {bestValLoss.toFixed(4)}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Model Output</span>
        </div>
        <div className="text-sm text-muted">
          <p>Trained model will be saved to:</p>
          <code>./models/model/</code>
          <ul style={{ marginTop: '0.5rem', marginLeft: '1rem' }}>
            <li>model.json - Architecture</li>
            <li>model.weights.bin - Weights</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default TrainPage;
