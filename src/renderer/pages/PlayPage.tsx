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
    const interval = (window as { inferenceInterval?: ReturnType<typeof setInterval> })
      .inferenceInterval;
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
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h2 className="text-2xl font-semibold mb-1">Run Agent</h2>
        <p className="text-base-content/60">Let the trained model control the target application</p>
      </div>

      {/* Emergency Stop - Always visible when running */}
      {isRunning && (
        <div className="alert alert-error">
          <button
            className="btn btn-error btn-lg w-full text-xl font-bold py-6"
            onClick={handleEmergencyStop}
          >
            EMERGENCY STOP
          </button>
          <p className="text-xs text-center mt-2">
            Click or press ESC to immediately stop all inputs
          </p>
        </div>
      )}

      {/* Inference Status Card */}
      <div className="card bg-base-200">
        <div className="card-body">
          <div className="flex items-center justify-between mb-4">
            <h3 className="card-title text-lg">Inference Status</h3>
            <div className={`badge ${isRunning ? 'badge-success' : 'badge-ghost'} gap-2`}>
              <span
                className={`w-2 h-2 rounded-full ${isRunning ? 'bg-success animate-pulse-opacity' : 'bg-base-content/40'}`}
              ></span>
              {isRunning ? 'Running' : 'Stopped'}
            </div>
          </div>

          {isRunning ? (
            <div className="space-y-4">
              {/* Stats */}
              <div className="stats bg-base-300 w-full">
                <div className="stat">
                  <div className="stat-title">FPS</div>
                  <div className="stat-value text-primary">{fps}</div>
                </div>
                <div className="stat">
                  <div className="stat-title">Inference Time</div>
                  <div className="stat-value text-lg">{inferenceTime}ms</div>
                </div>
                <div className="stat">
                  <div className="stat-title">Target Window</div>
                  <div className={`stat-value text-lg ${gameFound ? 'text-success' : 'text-error'}`}>
                    {gameFound ? 'Yes' : 'No'}
                  </div>
                </div>
              </div>

              {/* Action Visualization */}
              <div className="bg-base-300 rounded-lg p-4">
                <div className="text-sm text-base-content/60 mb-3">Current Actions</div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-base-content/60 mb-1">Movement</div>
                    <div className="text-sm font-mono">
                      X: {currentAction.movementX.toFixed(2)} | Y:{' '}
                      {currentAction.movementY.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-base-content/60 mb-1">Aim</div>
                    <div className="text-sm font-mono">
                      X: {(currentAction.aimX * 100).toFixed(0)}% | Y:{' '}
                      {(currentAction.aimY * 100).toFixed(0)}%
                    </div>
                  </div>
                </div>
                <div className="mt-3">
                  <div className="text-xs text-base-content/60 mb-1">Shooting</div>
                  <div className={`badge ${currentAction.shooting ? 'badge-error' : 'badge-ghost'}`}>
                    {currentAction.shooting ? 'FIRING' : 'Not firing'}
                  </div>
                </div>
              </div>

              <button className="btn btn-ghost" onClick={handleStop}>
                Stop Inference
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Configuration Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Target FPS</span>
                  </label>
                  <input
                    type="number"
                    className="input input-bordered w-full"
                    value={targetFps}
                    onChange={(e) => setTargetFps(parseInt(e.target.value))}
                    min={10}
                    max={60}
                  />
                </div>
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Smoothing Factor</span>
                  </label>
                  <input
                    type="number"
                    className="input input-bordered w-full"
                    value={smoothingFactor}
                    onChange={(e) => setSmoothingFactor(parseFloat(e.target.value))}
                    min={0}
                    max={1}
                    step={0.1}
                  />
                  <label className="label">
                    <span className="label-text-alt">0 = no smoothing, 1 = max smoothing</span>
                  </label>
                </div>
              </div>

              {/* Controller Toggle */}
              <div className="form-control">
                <label className="label cursor-pointer justify-start gap-3">
                  <input
                    type="checkbox"
                    className="toggle toggle-primary"
                    checked={useController}
                    onChange={(e) => setUseController(e.target.checked)}
                  />
                  <span className="label-text">Enable controller (send inputs to application)</span>
                </label>
                {!useController && (
                  <div className="alert alert-warning mt-2">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="stroke-current shrink-0 h-5 w-5"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                      />
                    </svg>
                    <span className="text-sm">
                      Safe mode: Model will run but no inputs will be sent to the application
                    </span>
                  </div>
                )}
              </div>

              <button className="btn btn-primary btn-lg w-full" onClick={handleStart}>
                Start Agent
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Requirements Card */}
      <div className="card bg-base-200">
        <div className="card-body">
          <h3 className="card-title text-lg mb-4">Requirements</h3>
          <ul className="list-disc list-inside text-sm text-base-content/60 space-y-1">
            <li>Target application must be running</li>
            <li>Target window must be visible (not minimized)</li>
            <li>Trained model must exist in ./models/model/</li>
            <li>Run with safe mode first to verify model behavior</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default PlayPage;
