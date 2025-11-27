import { useState } from 'react';

function CleanPage() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  // Configuration
  const [valSplit, setValSplit] = useState(0.2);
  const [testSplit, setTestSplit] = useState(0.1);
  const [minEvents, setMinEvents] = useState(1);
  const [maxMouseJump, setMaxMouseJump] = useState(200);

  const handleStartCleaning = () => {
    setIsProcessing(true);
    setProgress(0);
    // TODO: Implement actual cleaning via IPC
    // Simulate progress for now
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsProcessing(false);
          return 100;
        }
        return prev + 10;
      });
    }, 500);
  };

  return (
    <div>
      <div className="page-header">
        <h2>Clean Training Data</h2>
        <p>Process raw recordings into training-ready datasets</p>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Data Processing</span>
          {isProcessing && (
            <span className="status-badge warning">
              <span className="status-dot pulse" />
              Processing
            </span>
          )}
        </div>

        {isProcessing ? (
          <div>
            <div className="mb-4">
              <div className="flex justify-between text-sm mb-2">
                <span>Processing sessions...</span>
                <span>{progress}%</span>
              </div>
              <div className="progress-bar">
                <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
              </div>
            </div>
            <button className="btn btn-secondary" onClick={() => setIsProcessing(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <div>
            <div className="grid-2 mb-4">
              <div className="form-group">
                <label className="form-label">Validation Split</label>
                <input
                  type="number"
                  className="form-input"
                  value={valSplit}
                  onChange={(e) => setValSplit(parseFloat(e.target.value))}
                  min={0}
                  max={0.5}
                  step={0.05}
                />
                <span className="text-xs text-muted">{(valSplit * 100).toFixed(0)}% of data</span>
              </div>
              <div className="form-group">
                <label className="form-label">Test Split</label>
                <input
                  type="number"
                  className="form-input"
                  value={testSplit}
                  onChange={(e) => setTestSplit(parseFloat(e.target.value))}
                  min={0}
                  max={0.5}
                  step={0.05}
                />
                <span className="text-xs text-muted">{(testSplit * 100).toFixed(0)}% of data</span>
              </div>
            </div>

            <div className="grid-2 mb-4">
              <div className="form-group">
                <label className="form-label">Min Events per Frame</label>
                <input
                  type="number"
                  className="form-input"
                  value={minEvents}
                  onChange={(e) => setMinEvents(parseInt(e.target.value))}
                  min={0}
                  max={10}
                />
                <span className="text-xs text-muted">Filter frames with fewer events</span>
              </div>
              <div className="form-group">
                <label className="form-label">Max Mouse Jump (px)</label>
                <input
                  type="number"
                  className="form-input"
                  value={maxMouseJump}
                  onChange={(e) => setMaxMouseJump(parseInt(e.target.value))}
                  min={50}
                  max={1000}
                />
                <span className="text-xs text-muted">Filter erratic mouse movements</span>
              </div>
            </div>

            <div
              className="mb-4"
              style={{
                padding: '1rem',
                backgroundColor: 'var(--bg-primary)',
                borderRadius: '0.5rem',
              }}
            >
              <div className="text-sm text-muted mb-2">Data Split Preview</div>
              <div className="flex gap-4">
                <div>
                  <span className="text-success">Train:</span>{' '}
                  {((1 - valSplit - testSplit) * 100).toFixed(0)}%
                </div>
                <div>
                  <span className="text-warning">Val:</span> {(valSplit * 100).toFixed(0)}%
                </div>
                <div>
                  <span className="text-error">Test:</span> {(testSplit * 100).toFixed(0)}%
                </div>
              </div>
            </div>

            <button className="btn btn-primary btn-lg" onClick={handleStartCleaning}>
              Start Processing
            </button>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Output</span>
        </div>
        <div className="text-sm text-muted">
          <p>Cleaned data will be saved to:</p>
          <code>./cleaned_data/</code>
          <ul style={{ marginTop: '0.5rem', marginLeft: '1rem' }}>
            <li>train_data.json</li>
            <li>val_data.json</li>
            <li>test_data.json</li>
            <li>screenshots/</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default CleanPage;
