import { useState } from 'react';

function PlayPage() {
  const [isRunning, setIsRunning] = useState(false);
  const [gameFound, setGameFound] = useState(false);
  const [fps, setFps] = useState(0);
  const [inferenceTime, setInferenceTime] = useState(0);

  // Configuration
  const [targetFps, setTargetFps] = useState(30);
  const [smoothingFactor, setSmoothingFactor] = useState(0.3);
  const [useController, setUseController] = useState(true);

  // Simulated action display
  const [currentAction, setCurrentAction] = useState({
    movementX: 0,
    movementY: 0,
    aimX: 0.5,
    aimY: 0.5,
    shooting: false,
  });

  const handleStart = () => {
    setIsRunning(true);
    setGameFound(true);
    // TODO: Implement actual inference via IPC
    // Simulate action updates
    const interval = setInterval(() => {
      setFps(Math.floor(Math.random() * 5 + targetFps - 2));
      setInferenceTime(Math.floor(Math.random() * 10 + 15));
      setCurrentAction({
        movementX: Math.random() * 2 - 1,
        movementY: Math.random() * 2 - 1,
        aimX: Math.random(),
        aimY: Math.random(),
        shooting: Math.random() > 0.7,
      });
    }, 100);

    // Store interval for cleanup
    (window as { inferenceInterval?: ReturnType<typeof setInterval> }).inferenceInterval = interval;
  };

  const handleStop = () => {
    setIsRunning(false);
    const interval = (window as { inferenceInterval?: ReturnType<typeof setInterval> }).inferenceInterval;
    if (interval) {
      clearInterval(interval);
    }
    // TODO: Implement stop via IPC
  };

  const handleEmergencyStop = () => {
    handleStop();
    // TODO: Implement emergency stop that releases all keys
  };

  return (
    <div>
      <div className="page-header">
        <h2>Play Game</h2>
        <p>Let the trained model play Nuclear Throne</p>
      </div>

      {/* Emergency stop - always visible */}
      {isRunning && (
        <div className="card" style={{ borderColor: 'var(--error)' }}>
          <button
            className="btn btn-danger btn-lg"
            onClick={handleEmergencyStop}
            style={{ width: '100%', padding: '1.5rem', fontSize: '1.25rem' }}
          >
            EMERGENCY STOP
          </button>
          <p className="text-xs text-muted text-center mt-2">
            Click or press ESC to immediately stop all inputs
          </p>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <span className="card-title">Inference Status</span>
          <span className={`status-badge ${isRunning ? 'success' : 'idle'}`}>
            <span className={`status-dot ${isRunning ? 'pulse' : ''}`} />
            {isRunning ? 'Running' : 'Stopped'}
          </span>
        </div>

        {isRunning ? (
          <div>
            <div className="grid-3 mb-4">
              <div>
                <div className="stat-value">{fps}</div>
                <div className="stat-label">FPS</div>
              </div>
              <div>
                <div className="stat-value">{inferenceTime}ms</div>
                <div className="stat-label">Inference Time</div>
              </div>
              <div>
                <div className="stat-value text-success">{gameFound ? 'Yes' : 'No'}</div>
                <div className="stat-label">Game Window</div>
              </div>
            </div>

            {/* Action visualization */}
            <div
              className="mb-4"
              style={{
                padding: '1rem',
                backgroundColor: 'var(--bg-primary)',
                borderRadius: '0.5rem',
              }}
            >
              <div className="text-sm text-muted mb-2">Current Actions</div>
              <div className="grid-2">
                <div>
                  <div className="text-xs text-muted">Movement</div>
                  <div className="text-sm">
                    X: {currentAction.movementX.toFixed(2)} | Y: {currentAction.movementY.toFixed(2)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted">Aim</div>
                  <div className="text-sm">
                    X: {(currentAction.aimX * 100).toFixed(0)}% | Y:{' '}
                    {(currentAction.aimY * 100).toFixed(0)}%
                  </div>
                </div>
              </div>
              <div className="mt-2">
                <div className="text-xs text-muted">Shooting</div>
                <span className={`status-badge ${currentAction.shooting ? 'error' : 'idle'}`}>
                  {currentAction.shooting ? 'FIRING' : 'Not firing'}
                </span>
              </div>
            </div>

            <button className="btn btn-secondary" onClick={handleStop}>
              Stop Inference
            </button>
          </div>
        ) : (
          <div>
            <div className="grid-2 mb-4">
              <div className="form-group">
                <label className="form-label">Target FPS</label>
                <input
                  type="number"
                  className="form-input"
                  value={targetFps}
                  onChange={(e) => setTargetFps(parseInt(e.target.value))}
                  min={10}
                  max={60}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Smoothing Factor</label>
                <input
                  type="number"
                  className="form-input"
                  value={smoothingFactor}
                  onChange={(e) => setSmoothingFactor(parseFloat(e.target.value))}
                  min={0}
                  max={1}
                  step={0.1}
                />
                <span className="text-xs text-muted">0 = no smoothing, 1 = max smoothing</span>
              </div>
            </div>

            <div className="form-group mb-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={useController}
                  onChange={(e) => setUseController(e.target.checked)}
                />
                <span className="text-sm">Enable game controller (send inputs to game)</span>
              </label>
              {!useController && (
                <p className="text-xs text-warning mt-1">
                  Safe mode: Model will run but no inputs will be sent to the game
                </p>
              )}
            </div>

            <button className="btn btn-primary btn-lg" onClick={handleStart}>
              Start Playing
            </button>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Requirements</span>
        </div>
        <ul className="text-sm text-muted" style={{ marginLeft: '1rem' }}>
          <li>Nuclear Throne must be running</li>
          <li>Game window must be visible (not minimized)</li>
          <li>Trained model must exist in ./models/model/</li>
          <li>Run with safe mode first to verify model behavior</li>
        </ul>
      </div>
    </div>
  );
}

export default PlayPage;
