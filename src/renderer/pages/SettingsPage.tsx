import { useState, useEffect } from 'react';
import type { AppConfig } from '../../shared/types';

declare global {
  interface Window {
    electronAPI: {
      checkDependencies: () => Promise<{ [key: string]: boolean }>;
      getConfig: () => Promise<AppConfig>;
      setConfig: (config: AppConfig) => Promise<void>;
      selectDirectory: (title: string) => Promise<string | null>;
    };
  }
}

function SettingsPage() {
  const [dependencies, setDependencies] = useState<{ [key: string]: boolean }>({});
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Editable path state
  const [trainingDataPath, setTrainingDataPath] = useState('');
  const [cleanedDataPath, setCleanedDataPath] = useState('');
  const [modelsPath, setModelsPath] = useState('');

  useEffect(() => {
    async function init() {
      try {
        const [deps, cfg] = await Promise.all([
          window.electronAPI.checkDependencies(),
          window.electronAPI.getConfig(),
        ]);
        setDependencies(deps);
        setConfig(cfg);
        setTrainingDataPath(cfg.paths.trainingData);
        setCleanedDataPath(cfg.paths.cleanedData);
        setModelsPath(cfg.paths.models);
      } catch (error) {
        console.error('Failed to initialize settings:', error);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  const handleSelectDirectory = async (title: string, setter: (path: string) => void) => {
    const selectedPath = await window.electronAPI.selectDirectory(title);
    if (selectedPath) {
      setter(selectedPath);
    }
  };

  const handleSave = async () => {
    if (!config) return;

    setSaving(true);
    setSaveMessage(null);

    try {
      const updatedConfig: AppConfig = {
        ...config,
        paths: {
          trainingData: trainingDataPath,
          cleanedData: cleanedDataPath,
          models: modelsPath,
        },
      };

      await window.electronAPI.setConfig(updatedConfig);
      setConfig(updatedConfig);
      setSaveMessage({ type: 'success', text: 'Settings saved successfully!' });

      // Clear message after 3 seconds
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (error) {
      console.error('Failed to save settings:', error);
      setSaveMessage({ type: 'error', text: 'Failed to save settings. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (config) {
      setTrainingDataPath(config.paths.trainingData);
      setCleanedDataPath(config.paths.cleanedData);
      setModelsPath(config.paths.models);
    }
  };

  const hasChanges =
    config &&
    (trainingDataPath !== config.paths.trainingData ||
      cleanedDataPath !== config.paths.cleanedData ||
      modelsPath !== config.paths.models);

  const depDescriptions: { [key: string]: string } = {
    ffmpeg: 'Video recording and encoding',
    xrandr: 'Display detection',
    xdotool: 'Mouse and keyboard simulation',
    wmctrl: 'Window management',
    scrot: 'Screenshot capture',
    xwininfo: 'Window information',
    input_group: 'Access to input devices',
  };

  const missingDeps = Object.entries(dependencies).filter(
    ([name, installed]) => !installed && name !== 'input_group',
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold mb-1">Settings</h2>
          <p className="text-base-content/60">
            <span className="loading loading-spinner loading-sm mr-2"></span>
            Loading settings...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h2 className="text-2xl font-semibold mb-1">Settings</h2>
        <p className="text-base-content/60">
          Configure application settings and check dependencies
        </p>
      </div>

      {/* Save Message */}
      {saveMessage && (
        <div
          className={`alert ${saveMessage.type === 'success' ? 'alert-success' : 'alert-error'}`}
        >
          <span>{saveMessage.text}</span>
        </div>
      )}

      {/* Paths Card */}
      <div className="card bg-base-200">
        <div className="card-body">
          <h3 className="card-title text-lg mb-4">Data Paths</h3>
          <div className="space-y-4">
            <div className="form-control">
              <label className="label">
                <span className="label-text">Training Data Directory</span>
              </label>
              <div className="join w-full">
                <input
                  type="text"
                  className="input input-bordered join-item flex-1"
                  value={trainingDataPath}
                  onChange={(e) => setTrainingDataPath(e.target.value)}
                  placeholder="./training_data"
                />
                <button
                  className="btn btn-secondary join-item"
                  onClick={() =>
                    handleSelectDirectory('Select Training Data Directory', setTrainingDataPath)
                  }
                >
                  Browse
                </button>
              </div>
              <label className="label">
                <span className="label-text-alt">Where recorded gameplay sessions are stored</span>
              </label>
            </div>

            <div className="form-control">
              <label className="label">
                <span className="label-text">Cleaned Data Directory</span>
              </label>
              <div className="join w-full">
                <input
                  type="text"
                  className="input input-bordered join-item flex-1"
                  value={cleanedDataPath}
                  onChange={(e) => setCleanedDataPath(e.target.value)}
                  placeholder="./cleaned_data"
                />
                <button
                  className="btn btn-secondary join-item"
                  onClick={() =>
                    handleSelectDirectory('Select Cleaned Data Directory', setCleanedDataPath)
                  }
                >
                  Browse
                </button>
              </div>
              <label className="label">
                <span className="label-text-alt">Where preprocessed training data is saved</span>
              </label>
            </div>

            <div className="form-control">
              <label className="label">
                <span className="label-text">Models Directory</span>
              </label>
              <div className="join w-full">
                <input
                  type="text"
                  className="input input-bordered join-item flex-1"
                  value={modelsPath}
                  onChange={(e) => setModelsPath(e.target.value)}
                  placeholder="./models"
                />
                <button
                  className="btn btn-secondary join-item"
                  onClick={() => handleSelectDirectory('Select Models Directory', setModelsPath)}
                >
                  Browse
                </button>
              </div>
              <label className="label">
                <span className="label-text-alt">Where trained model files are saved</span>
              </label>
            </div>
          </div>

          {/* Save/Reset buttons */}
          <div className="flex gap-2 mt-4">
            <button
              className={`btn btn-primary ${saving ? 'loading' : ''}`}
              onClick={handleSave}
              disabled={!hasChanges || saving}
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              className="btn btn-ghost"
              onClick={handleReset}
              disabled={!hasChanges || saving}
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* System Dependencies Card */}
      <div className="card bg-base-200">
        <div className="card-body">
          <h3 className="card-title text-lg mb-4">System Dependencies</h3>

          <div className="space-y-2">
            {Object.entries(dependencies).map(([name, installed]) => (
              <div
                key={name}
                className="flex justify-between items-center bg-base-300 rounded-lg p-3"
              >
                <div>
                  <div className="font-medium text-sm">{name}</div>
                  <div className="text-xs text-base-content/60">
                    {depDescriptions[name] || 'System tool'}
                  </div>
                </div>
                <div className={`badge ${installed ? 'badge-success' : 'badge-error'}`}>
                  {installed ? 'Installed' : 'Missing'}
                </div>
              </div>
            ))}
          </div>

          {Object.values(dependencies).some((v) => !v) && (
            <div className="mt-4 space-y-3">
              {missingDeps.length > 0 && (
                <div>
                  <p className="text-sm text-base-content/60 mb-2">Install missing dependencies:</p>
                  <code className="text-sm block bg-base-300 p-2 rounded">
                    sudo apt install {missingDeps.map(([name]) => name).join(' ')}
                  </code>
                </div>
              )}
              {!dependencies['input_group'] && (
                <div>
                  <p className="text-sm text-base-content/60 mb-2">
                    Add yourself to the input group:
                  </p>
                  <code className="text-sm block bg-base-300 p-2 rounded">
                    sudo usermod -aG input $USER
                  </code>
                  <p className="text-xs text-base-content/60 mt-1">Then log out and back in</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* About Card */}
      <div className="card bg-base-200">
        <div className="card-body">
          <h3 className="card-title text-lg mb-4">About</h3>
          <div className="text-sm text-base-content/60 space-y-2">
            <p>
              <strong className="text-base-content">NTB-Redux</strong> - AI-powered automation
            </p>
            <p>
              Train a neural network to control applications by recording your interactions and
              using imitation learning.
            </p>
            <a
              href="https://github.com/github-bdem/ntb-redux"
              target="_blank"
              rel="noopener noreferrer"
              className="link link-primary"
            >
              View on GitHub
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SettingsPage;
