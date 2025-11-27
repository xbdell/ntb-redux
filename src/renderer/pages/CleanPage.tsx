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

  const trainPercent = ((1 - valSplit - testSplit) * 100).toFixed(0);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h2 className="text-2xl font-semibold mb-1">Clean Training Data</h2>
        <p className="text-base-content/60">Process raw recordings into training-ready datasets</p>
      </div>

      {/* Data Processing Card */}
      <div className="card bg-base-200">
        <div className="card-body">
          <div className="flex items-center justify-between mb-4">
            <h3 className="card-title text-lg">Data Processing</h3>
            {isProcessing && (
              <div className="badge badge-warning gap-2">
                <span className="w-2 h-2 rounded-full bg-warning animate-pulse-opacity"></span>
                Processing
              </div>
            )}
          </div>

          {isProcessing ? (
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span>Processing sessions...</span>
                  <span>{progress}%</span>
                </div>
                <progress
                  className="progress progress-primary w-full"
                  value={progress}
                  max="100"
                ></progress>
              </div>
              <button className="btn btn-ghost" onClick={() => setIsProcessing(false)}>
                Cancel
              </button>
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

              <div className="grid grid-cols-2 gap-4">
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
                    <span className="label-text-alt">Filter frames with fewer events</span>
                  </label>
                </div>
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Max Mouse Jump (px)</span>
                  </label>
                  <input
                    type="number"
                    className="input input-bordered w-full"
                    value={maxMouseJump}
                    onChange={(e) => setMaxMouseJump(parseInt(e.target.value))}
                    min={50}
                    max={1000}
                  />
                  <label className="label">
                    <span className="label-text-alt">Filter erratic mouse movements</span>
                  </label>
                </div>
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

              <button className="btn btn-primary btn-lg w-full" onClick={handleStartCleaning}>
                Start Processing
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Output Card */}
      <div className="card bg-base-200">
        <div className="card-body">
          <h3 className="card-title text-lg mb-4">Output</h3>
          <div className="text-sm text-base-content/60">
            <p className="mb-2">Cleaned data will be saved to:</p>
            <code>./cleaned_data/</code>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>train_data.json</li>
              <li>val_data.json</li>
              <li>test_data.json</li>
              <li>screenshots/</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CleanPage;
