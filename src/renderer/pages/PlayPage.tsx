import { useState, useEffect } from 'react';
import type { AppConfig } from '../../shared/types';

declare global {
  interface Window {
    electronAPI: {
      getConfig: () => Promise<AppConfig>;
      selectDirectory: (title: string) => Promise<string | null>;
    };
  }
}

function PlayPage() {
  const [isRunning, setIsRunning] = useState(false);
  const [gameFound, setGameFound] = useState(false);
  const [fps, setFps] = useState(0);
  const [inferenceTime, setInferenceTime] = useState(0);
  const [loading, setLoading] = useState(true);

  // Model and target configuration
  const [modelPath, setModelPath] = useState('./models/model');
  const [targetWindow, setTargetWindow] = useState('');

  // Inference configuration
  const [targetFps, setTargetFps] = useState(30);
  const [smoothingFactor, setSmoothingFactor] = useState(0.3);
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.4);
  const [useController, setUseController] = useState(false); // Default to safe mode

  // Simulated action display
  const [currentAction, setCurrentAction] = useState({
    movementX: 0,
    movementY: 0,
    aimX: 0.5,
    aimY: 0.5,
    shooting: false,
  });

  // Load config on mount
  useEffect(() => {
    async function loadConfig() {
      try {
        const config = await window.electronAPI.getConfig();
        setModelPath(config.paths.models + '/model');
        setTargetWindow(config.collection.targetWindowName);
        setTargetFps(config.inference.defaultFps);
        setSmoothingFactor(config.inference.defaultSmoothingFactor);
      } catch (err) {
        console.error('Failed to load config:', err);
      } finally {
        setLoading(false);
      }
    }
    loadConfig();
  }, []);

  const handleSelectModel = async () => {
    const selectedPath = await window.electronAPI.selectDirectory('Select Model Directory');
    if (selectedPath) {
      setModelPath(selectedPath);
    }
  };

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    );
  }

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
                    {gameFound ? 'Found' : 'Not Found'}
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

              {/* Controller Status */}
              <div className={`alert ${useController ? 'alert-warning' : 'alert-info'}`}>
                <span className="text-sm">
                  {useController
                    ? '⚠️ Controller ENABLED - inputs are being sent to the application'
                    : '🔒 Safe mode - predictions only, no inputs sent'}
                </span>
              </div>

              <button className="btn btn-ghost" onClick={handleStop}>
                Stop Inference
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Model Selection */}
              <div className="form-control">
                <label className="label">
                  <span className="label-text">Model Path</span>
                </label>
                <div className="join w-full">
                  <input
                    type="text"
                    className="input input-bordered join-item flex-1"
                    value={modelPath}
                    onChange={(e) => setModelPath(e.target.value)}
                    placeholder="Path to trained model directory"
                  />
                  <button className="btn btn-secondary join-item" onClick={handleSelectModel}>
                    Browse
                  </button>
                </div>
                <label className="label">
                  <span className="label-text-alt">
                    Directory containing model.json and weights
                  </span>
                </label>
              </div>

              {/* Target Window */}
              <div className="form-control">
                <label className="label">
                  <span className="label-text">Target Window Name</span>
                </label>
                <input
                  type="text"
                  className="input input-bordered w-full"
                  value={targetWindow}
                  onChange={(e) => setTargetWindow(e.target.value)}
                  placeholder="e.g., MyGame, Firefox"
                />
                <label className="label">
                  <span className="label-text-alt">Partial match of window title</span>
                </label>
              </div>

              <div className="divider">Inference Settings</div>

              {/* Configuration Grid */}
              <div className="grid grid-cols-3 gap-4">
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
                    <span className="label-text">Smoothing</span>
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
                </div>
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Confidence</span>
                  </label>
                  <input
                    type="number"
                    className="input input-bordered w-full"
                    value={confidenceThreshold}
                    onChange={(e) => setConfidenceThreshold(parseFloat(e.target.value))}
                    min={0}
                    max={1}
                    step={0.1}
                  />
                </div>
              </div>

              {/* Controller Toggle */}
              <div className="form-control">
                <label className="label cursor-pointer justify-start gap-3">
                  <input
                    type="checkbox"
                    className="toggle toggle-warning"
                    checked={useController}
                    onChange={(e) => setUseController(e.target.checked)}
                  />
                  <span className="label-text">Enable controller (send inputs to application)</span>
                </label>
                {!useController && (
                  <div className="alert alert-info mt-2">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      className="stroke-current shrink-0 w-5 h-5"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      ></path>
                    </svg>
                    <span className="text-sm">
                      Safe mode: Model will run but no inputs will be sent to the application.
                      Recommended for first-time testing.
                    </span>
                  </div>
                )}
                {useController && (
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
                      Warning: The agent will send keyboard and mouse inputs to the target window.
                      Make sure you can reach the emergency stop button!
                    </span>
                  </div>
                )}
              </div>

              <button
                className={`btn btn-lg w-full ${useController ? 'btn-warning' : 'btn-primary'}`}
                onClick={handleStart}
                disabled={!modelPath || !targetWindow}
              >
                {useController ? 'Start Agent (Controller Enabled)' : 'Start Agent (Safe Mode)'}
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
            <li>Target application must be running and visible</li>
            <li>
              Model directory must contain <code>model.json</code> and weights
            </li>
            <li>Run in safe mode first to verify model behavior</li>
            <li>Keep the emergency stop button accessible</li>
          </ul>

          <div className="mt-4 p-3 bg-base-300 rounded-lg">
            <p className="text-xs font-semibold mb-2">Model Output Format:</p>
            <ul className="text-xs text-base-content/50 space-y-1">
              <li>
                <code>movement_x/y</code>: [-1, 1] - WASD movement
              </li>
              <li>
                <code>aim_x/y</code>: [0, 1] - Normalized cursor position
              </li>
              <li>
                <code>shooting</code>: 0/1 - Left mouse button
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PlayPage;
