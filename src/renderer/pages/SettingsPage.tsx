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

  return (
    <div>
      <div className="page-header">
        <h2>Settings</h2>
        <p>Configure application settings and check dependencies</p>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">System Dependencies</span>
        </div>
        {loading ? (
          <p className="text-muted">Checking dependencies...</p>
        ) : (
          <div className="flex flex-col gap-2">
            {Object.entries(dependencies).map(([name, installed]) => (
              <div
                key={name}
                className="flex justify-between items-center"
                style={{
                  padding: '0.75rem',
                  backgroundColor: 'var(--bg-primary)',
                  borderRadius: '0.5rem',
                }}
              >
                <div>
                  <div className="text-sm">{name}</div>
                  <div className="text-xs text-muted">{depDescriptions[name] || 'System tool'}</div>
                </div>
                <span className={`status-badge ${installed ? 'success' : 'error'}`}>
                  {installed ? 'Installed' : 'Missing'}
                </span>
              </div>
            ))}
          </div>
        )}
        {!loading && Object.values(dependencies).some((v) => !v) && (
          <div className="mt-4">
            <p className="text-sm text-muted mb-2">Install missing dependencies:</p>
            <code className="text-xs">
              sudo apt install{' '}
              {Object.entries(dependencies)
                .filter(([name, installed]) => !installed && name !== 'input_group')
                .map(([name]) => name)
                .join(' ')}
            </code>
            {!dependencies['input_group'] && (
              <div className="mt-2">
                <code className="text-xs">sudo usermod -aG input $USER</code>
                <p className="text-xs text-muted mt-1">Then log out and back in</p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Paths</span>
        </div>
        <div className="flex flex-col gap-4">
          <div className="form-group">
            <label className="form-label">Training Data Directory</label>
            <input
              type="text"
              className="form-input"
              value="./training_data"
              readOnly
            />
          </div>
          <div className="form-group">
            <label className="form-label">Cleaned Data Directory</label>
            <input
              type="text"
              className="form-input"
              value="./cleaned_data"
              readOnly
            />
          </div>
          <div className="form-group">
            <label className="form-label">Models Directory</label>
            <input
              type="text"
              className="form-input"
              value="./models"
              readOnly
            />
          </div>
        </div>
        <p className="text-xs text-muted mt-2">
          Path configuration will be available in a future update
        </p>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">About</span>
        </div>
        <div className="text-sm text-muted">
          <p className="mb-2">
            <strong>Nuclear Throne Bot</strong> - AI-powered gameplay
          </p>
          <p className="mb-2">
            Train a neural network to play Nuclear Throne by recording your gameplay and using
            imitation learning.
          </p>
          <p>
            <a
              href="https://github.com/github-bdem/ntb-redux"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--accent)' }}
            >
              View on GitHub
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

export default SettingsPage;
