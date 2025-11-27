import { useState, useEffect } from 'react';

function SettingsPage() {
  const [dependencies, setDependencies] = useState<{ [key: string]: boolean }>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkDeps() {
      try {
        const deps = await window.electronAPI.checkDependencies();
        setDependencies(deps);
      } catch (error) {
        console.error('Failed to check dependencies:', error);
      } finally {
        setLoading(false);
      }
    }
    checkDeps();
  }, []);

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
    ([name, installed]) => !installed && name !== 'input_group'
  );

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h2 className="text-2xl font-semibold mb-1">Settings</h2>
        <p className="text-base-content/60">Configure application settings and check dependencies</p>
      </div>

      {/* System Dependencies Card */}
      <div className="card bg-base-200">
        <div className="card-body">
          <h3 className="card-title text-lg mb-4">System Dependencies</h3>

          {loading ? (
            <div className="flex items-center gap-2 text-base-content/60">
              <span className="loading loading-spinner loading-sm"></span>
              Checking dependencies...
            </div>
          ) : (
            <div className="space-y-2">
              {Object.entries(dependencies).map(([name, installed]) => (
                <div key={name} className="flex justify-between items-center bg-base-300 rounded-lg p-3">
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
          )}

          {!loading && Object.values(dependencies).some((v) => !v) && (
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
                  <p className="text-sm text-base-content/60 mb-2">Add yourself to the input group:</p>
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

      {/* Paths Card */}
      <div className="card bg-base-200">
        <div className="card-body">
          <h3 className="card-title text-lg mb-4">Paths</h3>
          <div className="space-y-4">
            <div className="form-control">
              <label className="label">
                <span className="label-text">Training Data Directory</span>
              </label>
              <input
                type="text"
                className="input input-bordered w-full"
                value="./training_data"
                readOnly
              />
            </div>
            <div className="form-control">
              <label className="label">
                <span className="label-text">Cleaned Data Directory</span>
              </label>
              <input
                type="text"
                className="input input-bordered w-full"
                value="./cleaned_data"
                readOnly
              />
            </div>
            <div className="form-control">
              <label className="label">
                <span className="label-text">Models Directory</span>
              </label>
              <input
                type="text"
                className="input input-bordered w-full"
                value="./models"
                readOnly
              />
            </div>
          </div>
          <p className="text-xs text-base-content/60 mt-2">
            Path configuration will be available in a future update
          </p>
        </div>
      </div>

      {/* About Card */}
      <div className="card bg-base-200">
        <div className="card-body">
          <h3 className="card-title text-lg mb-4">About</h3>
          <div className="text-sm text-base-content/60 space-y-2">
            <p>
              <strong className="text-base-content">Nuclear Throne Bot</strong> - AI-powered
              gameplay
            </p>
            <p>
              Train a neural network to play Nuclear Throne by recording your gameplay and using
              imitation learning.
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
