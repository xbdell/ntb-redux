import { useState, useEffect, useRef } from 'react';
import type { AppConfig, CleaningProgress, CleaningResult } from '../../shared/types';

declare global {
  interface Window {
    electronAPI: {
      getConfig: () => Promise<AppConfig>;
      selectDirectory: (title: string) => Promise<string | null>;
      startCleaning: (config: {
        inputDir: string;
        outputDir: string;
        valSplit: number;
        testSplit: number;
        minEventsPerFrame: number;
      }) => Promise<CleaningResult>;
      getCleaningProgress: () => Promise<CleaningProgress | null>;
      onCleaningProgress: (callback: (progress: CleaningProgress) => void) => () => void;
    };
  }
}

function CleanPage() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<CleaningProgress | null>(null);
  const [result, setResult] = useState<CleaningResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Paths
  const [inputDir, setInputDir] = useState('./training_data');
  const [outputDir, setOutputDir] = useState('./cleaned_data');

  // Configuration
  const [valSplit, setValSplit] = useState(0.2);
  const [testSplit, setTestSplit] = useState(0.1);
  const [minEvents, setMinEvents] = useState(0);

  // Load config on mount
  useEffect(() => {
    async function loadConfig() {
      try {
        const config = await window.electronAPI.getConfig();
        setInputDir(config.paths.trainingData);
        setOutputDir(config.paths.cleanedData);
      } catch (err) {
        console.error('Failed to load config:', err);
      } finally {
        setLoading(false);
      }
    }
    loadConfig();
  }, []);

  // Subscribe to cleaning progress events
  useEffect(() => {
    const unsubscribe = window.electronAPI.onCleaningProgress((progressUpdate) => {
      setProgress(progressUpdate);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Auto-scroll log container
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [progress?.logs]);

  const handleSelectDirectory = async (
    title: string,
    setter: (path: string) => void
  ) => {
    const selectedPath = await window.electronAPI.selectDirectory(title);
    if (selectedPath) {
      setter(selectedPath);
    }
  };

  const handleStartCleaning = async () => {
    setIsProcessing(true);
    setProgress(null);
    setResult(null);
    setError(null);

    try {
      const cleaningResult = await window.electronAPI.startCleaning({
        inputDir,
        outputDir,
        valSplit,
        testSplit,
        minEventsPerFrame: minEvents,
      });

      setResult(cleaningResult);
    } catch (err) {
      console.error('Cleaning failed:', err);
      setError(err instanceof Error ? err.message : 'Cleaning failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const trainPercent = ((1 - valSplit - testSplit) * 100).toFixed(0);

  // Get phase display name
  const getPhaseDisplay = (phase: CleaningProgress['phase']) => {
    const phases: Record<CleaningProgress['phase'], string> = {
      scanning: 'Scanning',
      extracting: 'Extracting Frames',
      aligning: 'Aligning Events',
      filtering: 'Filtering',
      splitting: 'Splitting Data',
      complete: 'Complete',
    };
    return phases[phase] || phase;
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold mb-1">Clean Training Data</h2>
          <p className="text-base-content/60">
            <span className="loading loading-spinner loading-sm mr-2"></span>
            Loading configuration...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h2 className="text-2xl font-semibold mb-1">Clean Training Data</h2>
        <p className="text-base-content/60">
          Process raw video recordings into training-ready datasets
        </p>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="alert alert-error">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="stroke-current shrink-0 h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span>{error}</span>
          <button className="btn btn-sm btn-ghost" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      {/* Result Alert */}
      {result && !isProcessing && (
        <div className="alert alert-success">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="stroke-current shrink-0 h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <div>
            <div className="font-medium">Cleaning completed successfully!</div>
            <div className="text-sm">
              Train: {result.trainCount} | Val: {result.valCount} | Test: {result.testCount}
            </div>
          </div>
        </div>
      )}

      {/* Directory Selection Card */}
      <div className="card bg-base-200">
        <div className="card-body">
          <h3 className="card-title text-lg mb-4">Data Directories</h3>

          <div className="space-y-4">
            {/* Input Directory */}
            <div className="form-control">
              <label className="label">
                <span className="label-text">Input Directory (Raw Sessions)</span>
              </label>
              <div className="join w-full">
                <input
                  type="text"
                  className="input input-bordered join-item flex-1"
                  value={inputDir}
                  onChange={(e) => setInputDir(e.target.value)}
                  placeholder="./training_data"
                  disabled={isProcessing}
                />
                <button
                  className="btn btn-secondary join-item"
                  onClick={() =>
                    handleSelectDirectory('Select Training Data Directory', setInputDir)
                  }
                  disabled={isProcessing}
                >
                  Browse
                </button>
              </div>
              <label className="label">
                <span className="label-text-alt">
                  Directory containing session_* folders with video.mp4 and events.jsonl
                </span>
              </label>
            </div>

            {/* Output Directory */}
            <div className="form-control">
              <label className="label">
                <span className="label-text">Output Directory (Cleaned Data)</span>
              </label>
              <div className="join w-full">
                <input
                  type="text"
                  className="input input-bordered join-item flex-1"
                  value={outputDir}
                  onChange={(e) => setOutputDir(e.target.value)}
                  placeholder="./cleaned_data"
                  disabled={isProcessing}
                />
                <button
                  className="btn btn-secondary join-item"
                  onClick={() =>
                    handleSelectDirectory('Select Output Directory', setOutputDir)
                  }
                  disabled={isProcessing}
                >
                  Browse
                </button>
              </div>
              <label className="label">
                <span className="label-text-alt">
                  Where cleaned training data will be saved
                </span>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Data Processing Card */}
      <div className="card bg-base-200">
        <div className="card-body">
          <div className="flex items-center justify-between mb-4">
            <h3 className="card-title text-lg">Processing Options</h3>
            {isProcessing && (
              <div className="badge badge-warning gap-2">
                <span className="w-2 h-2 rounded-full bg-warning animate-pulse"></span>
                Processing
              </div>
            )}
          </div>

          {isProcessing ? (
            <div className="space-y-4">
              {/* Phase and Status */}
              <div className="flex items-center gap-4">
                <div className="badge badge-primary badge-lg">
                  {progress ? getPhaseDisplay(progress.phase) : 'Starting'}
                </div>
                <span className="text-sm text-base-content/80">
                  {progress?.currentStep || 'Initializing...'}
                </span>
              </div>

              {/* Session Progress */}
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span>
                    {progress?.currentSession
                      ? `Session: ${progress.currentSession}`
                      : 'Scanning for sessions...'}
                  </span>
                  <span>
                    {progress?.totalSessions
                      ? `${progress.processedSessions}/${progress.totalSessions} sessions`
                      : ''}
                  </span>
                </div>
                <progress
                  className="progress progress-primary w-full"
                  value={progress?.processedSessions || 0}
                  max={progress?.totalSessions || 100}
                ></progress>
              </div>

              {/* Frame Extraction Progress */}
              {progress?.extractionProgress && (
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span>Extracting frames...</span>
                    <span>
                      {progress.extractionProgress.currentFrame}/
                      {progress.extractionProgress.totalFrames} (
                      {progress.extractionProgress.percentComplete}%)
                    </span>
                  </div>
                  <progress
                    className="progress progress-secondary w-full"
                    value={progress.extractionProgress.percentComplete}
                    max={100}
                  ></progress>
                </div>
              )}

              {/* Stats */}
              {progress && (
                <div className="stats stats-horizontal bg-base-300 w-full">
                  <div className="stat py-2 px-4">
                    <div className="stat-title text-xs">Frames Kept</div>
                    <div className="stat-value text-lg text-success">{progress.framesKept}</div>
                  </div>
                  <div className="stat py-2 px-4">
                    <div className="stat-title text-xs">Filtered Out</div>
                    <div className="stat-value text-lg text-error">{progress.framesFiltered}</div>
                  </div>
                  {progress.eventCount !== undefined && (
                    <div className="stat py-2 px-4">
                      <div className="stat-title text-xs">Events</div>
                      <div className="stat-value text-lg">{progress.eventCount}</div>
                    </div>
                  )}
                </div>
              )}

              {/* Log Output */}
              {progress?.logs && progress.logs.length > 0 && (
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Processing Log</span>
                    <span className="label-text-alt">{progress.logs.length} lines</span>
                  </label>
                  <div
                    ref={logContainerRef}
                    className="bg-base-300 rounded-lg p-3 h-48 overflow-y-auto font-mono text-xs"
                  >
                    {progress.logs.map((log, i) => (
                      <div key={i} className="whitespace-pre-wrap text-base-content/80">
                        {log}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Configuration Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Validation Split</span>
                  </label>
                  <input
                    type="number"
                    className="input input-bordered w-full"
                    value={valSplit}
                    onChange={(e) => setValSplit(parseFloat(e.target.value))}
                    min={0}
                    max={0.5}
                    step={0.05}
                  />
                  <label className="label">
                    <span className="label-text-alt">{(valSplit * 100).toFixed(0)}% of data</span>
                  </label>
                </div>
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Test Split</span>
                  </label>
                  <input
                    type="number"
                    className="input input-bordered w-full"
                    value={testSplit}
                    onChange={(e) => setTestSplit(parseFloat(e.target.value))}
                    min={0}
                    max={0.5}
                    step={0.05}
                  />
                  <label className="label">
                    <span className="label-text-alt">{(testSplit * 100).toFixed(0)}% of data</span>
                  </label>
                </div>
              </div>

              <div className="form-control">
                <label className="label">
                  <span className="label-text">Min Events per Frame</span>
                </label>
                <input
                  type="number"
                  className="input input-bordered w-full"
                  value={minEvents}
                  onChange={(e) => setMinEvents(parseInt(e.target.value))}
                  min={0}
                  max={10}
                />
                <label className="label">
                  <span className="label-text-alt">0 = allow frames with just key state</span>
                </label>
              </div>

              {/* Data Split Preview */}
              <div className="bg-base-300 rounded-lg p-4">
                <div className="text-sm text-base-content/60 mb-2">Data Split Preview</div>
                <div className="flex gap-6">
                  <div>
                    <span className="text-success font-medium">Train:</span> {trainPercent}%
                  </div>
                  <div>
                    <span className="text-warning font-medium">Val:</span>{' '}
                    {(valSplit * 100).toFixed(0)}%
                  </div>
                  <div>
                    <span className="text-error font-medium">Test:</span>{' '}
                    {(testSplit * 100).toFixed(0)}%
                  </div>
                </div>
              </div>

              <button
                className="btn btn-primary btn-lg w-full"
                onClick={handleStartCleaning}
                disabled={isProcessing}
              >
                Start Processing
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Output Info Card - only show when not processing */}
      {!isProcessing && (
        <div className="card bg-base-200">
          <div className="card-body">
            <h3 className="card-title text-lg mb-4">Pipeline Info</h3>
            <div className="text-sm text-base-content/60 space-y-3">
              <p>The cleaning pipeline will:</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Extract frames from video.mp4 files (cached for reuse)</li>
                <li>Parse and align events from events.jsonl to each frame</li>
                <li>Track keyboard state across frames (for held keys like WASD)</li>
                <li>Filter frames based on activity and mouse movement</li>
                <li>Normalize mouse coordinates to [0,1] range</li>
                <li>Split into train/validation/test sets</li>
              </ol>
              <div className="divider my-2"></div>
              <p>
                <strong>Output files:</strong>
              </p>
              <code className="block bg-base-300 p-2 rounded text-xs">
                {outputDir}/
                <br />
                ├── train_data.json
                <br />
                ├── val_data.json
                <br />
                ├── test_data.json
                <br />
                ├── dataset_info.json
                <br />
                └── screenshots/
              </code>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CleanPage;
