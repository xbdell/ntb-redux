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
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h2 className="text-2xl font-semibold mb-1">Train Model</h2>
        <p className="text-base-content/60">Train a neural network on your cleaned data</p>
      </div>

      {/* Training Status Card */}
      <div className="card bg-base-200">
        <div className="card-body">
          <div className="flex items-center justify-between mb-4">
            <h3 className="card-title text-lg">Training Status</h3>
            <div className={`badge ${isTraining ? 'badge-warning' : 'badge-ghost'} gap-2`}>
              <span
                className={`w-2 h-2 rounded-full ${isTraining ? 'bg-warning animate-pulse-opacity' : 'bg-base-content/40'}`}
              ></span>
              {isTraining ? 'Training' : 'Idle'}
            </div>
          </div>

          {isTraining ? (
            <div className="space-y-4">
              {/* Stats */}
              <div className="stats bg-base-300 w-full">
                <div className="stat">
                  <div className="stat-title">Epoch</div>
                  <div className="stat-value text-primary">
                    {currentEpoch}/{epochs}
                  </div>
                </div>
                <div className="stat">
                  <div className="stat-title">Train Loss</div>
                  <div className="stat-value text-lg">
                    {epochHistory.length > 0
                      ? epochHistory[epochHistory.length - 1].trainLoss.toFixed(4)
                      : '-'}
                  </div>
                </div>
                <div className="stat">
                  <div className="stat-title">Val Loss</div>
                  <div className="stat-value text-lg">
                    {epochHistory.length > 0
                      ? epochHistory[epochHistory.length - 1].valLoss.toFixed(4)
                      : '-'}
                  </div>
                </div>
              </div>

              {/* Progress Bar */}
              <progress
                className="progress progress-primary w-full"
                value={currentEpoch}
                max={epochs}
              ></progress>

              {/* Training History */}
              <div className="bg-base-300 rounded-lg p-4 max-h-48 overflow-y-auto">
                <div className="text-sm text-base-content/60 mb-2">Training History</div>
                <div className="space-y-1">
                  {epochHistory.map((e) => (
                    <div key={e.epoch} className="text-xs flex gap-4 font-mono">
                      <span className="text-base-content/60">Epoch {e.epoch}</span>
                      <span>
                        Train: <span className="text-success">{e.trainLoss.toFixed(4)}</span>
                      </span>
                      <span>
                        Val: <span className="text-warning">{e.valLoss.toFixed(4)}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <button className="btn btn-error" onClick={handleStopTraining}>
                Stop Training
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Configuration Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Model Architecture</span>
                  </label>
                  <select
                    className="select select-bordered w-full"
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
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Epochs</span>
                  </label>
                  <input
                    type="number"
                    className="input input-bordered w-full"
                    value={epochs}
                    onChange={(e) => setEpochs(parseInt(e.target.value))}
                    min={1}
                    max={100}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Batch Size</span>
                  </label>
                  <select
                    className="select select-bordered w-full"
                    value={batchSize}
                    onChange={(e) => setBatchSize(parseInt(e.target.value))}
                  >
                    <option value={8}>8</option>
                    <option value={16}>16</option>
                    <option value={32}>32</option>
                    <option value={64}>64</option>
                  </select>
                </div>
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Learning Rate</span>
                  </label>
                  <select
                    className="select select-bordered w-full"
                    value={learningRate}
                    onChange={(e) => setLearningRate(parseFloat(e.target.value))}
                  >
                    <option value={0.01}>0.01</option>
                    <option value={0.001}>0.001</option>
                    <option value={0.0001}>0.0001</option>
                  </select>
                </div>
              </div>

              <button className="btn btn-primary btn-lg w-full" onClick={handleStartTraining}>
                Start Training
              </button>

              {epochHistory.length > 0 && (
                <div className="text-sm text-base-content/60">
                  Last training - Best validation loss:{' '}
                  <span className="text-success font-medium">{bestValLoss.toFixed(4)}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Model Output Card */}
      <div className="card bg-base-200">
        <div className="card-body">
          <h3 className="card-title text-lg mb-4">Model Output</h3>
          <div className="text-sm text-base-content/60">
            <p className="mb-2">Trained model will be saved to:</p>
            <code>./models/model/</code>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>model.json - Architecture</li>
              <li>model.weights.bin - Weights</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TrainPage;
