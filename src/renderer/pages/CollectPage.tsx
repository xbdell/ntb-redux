import { useState, useEffect } from 'react';
import type { MonitorInfo, CollectionStatus, SessionInfo } from '../../shared/types';

declare global {
  interface Window {
    electronAPI: {
      getMonitors: () => Promise<MonitorInfo[]>;
      getSessions: () => Promise<SessionInfo[]>;
      checkDependencies: () => Promise<{ [key: string]: boolean }>;
      startCollection: (config: unknown) => Promise<void>;
      stopCollection: () => Promise<SessionInfo>;
      getCollectionStatus: () => Promise<CollectionStatus>;
      onCollectionEventCount: (callback: (count: number) => void) => () => void;
      onCollectionStopped: (callback: (session: SessionInfo) => void) => () => void;
    };
  }
}

function CollectPage() {
  const [monitors, setMonitors] = useState<MonitorInfo[]>([]);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [dependencies, setDependencies] = useState<{ [key: string]: boolean }>({});
  const [isRecording, setIsRecording] = useState(false);
  const [eventCount, setEventCount] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loading, setLoading] = useState(true);

  // Configuration state
  const [fps, setFps] = useState<30 | 60>(30);
  const [selectedMonitor, setSelectedMonitor] = useState<string>('leftmost');

  useEffect(() => {
    async function init() {
      try {
        const [monitorsData, sessionsData, depsData] = await Promise.all([
          window.electronAPI.getMonitors(),
          window.electronAPI.getSessions(),
          window.electronAPI.checkDependencies(),
        ]);
        setMonitors(monitorsData);
        setSessions(sessionsData);
        setDependencies(depsData);
      } catch (error) {
        console.error('Failed to initialize:', error);
      } finally {
        setLoading(false);
      }
    }
    init();

    // Subscribe to event count updates
    const unsubscribeEventCount = window.electronAPI.onCollectionEventCount((count) => {
      setEventCount(count);
    });

    const unsubscribeStopped = window.electronAPI.onCollectionStopped((session) => {
      setIsRecording(false);
      setSessions((prev) => [session, ...prev]);
    });

    return () => {
      unsubscribeEventCount();
      unsubscribeStopped();
    };
  }, []);

  // Duration timer
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isRecording) {
      const startTime = Date.now();
      interval = setInterval(() => {
        setDuration(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  const handleStartRecording = async () => {
    try {
      await window.electronAPI.startCollection({
        outputDir: './training_data',
        gameProcessName: 'nuclearthrone',
        recordingFramerate: fps,
        videoCodec: 'libx264',
        compressionQuality: 18,
        targetMonitor: selectedMonitor,
      });
      setIsRecording(true);
      setEventCount(0);
      setDuration(0);
    } catch (error) {
      console.error('Failed to start recording:', error);
    }
  };

  const handleStopRecording = async () => {
    try {
      await window.electronAPI.stopCollection();
      setIsRecording(false);
    } catch (error) {
      console.error('Failed to stop recording:', error);
    }
  };

  const missingDeps = Object.entries(dependencies).filter(([, installed]) => !installed);
  const allDepsInstalled = missingDeps.length === 0;

  if (loading) {
    return (
      <div className="page-header">
        <h2>Collect Training Data</h2>
        <p className="text-muted">Loading...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h2>Collect Training Data</h2>
        <p>Record gameplay video and input events for training</p>
      </div>

      {/* Dependencies check */}
      {!allDepsInstalled && (
        <div className="card" style={{ borderColor: 'var(--error)' }}>
          <div className="card-header">
            <span className="card-title text-error">Missing Dependencies</span>
          </div>
          <p className="text-sm text-muted mb-2">
            Install missing dependencies to enable data collection:
          </p>
          <code className="text-sm">
            sudo apt install {missingDeps.map(([name]) => name).join(' ')}
          </code>
          {!dependencies['input_group'] && (
            <p className="text-sm text-warning mt-2">
              You also need to be in the &quot;input&quot; group: <code>sudo usermod -aG input $USER</code>
            </p>
          )}
        </div>
      )}

      {/* Recording status */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Recording Status</span>
          <span className={`status-badge ${isRecording ? 'success' : 'idle'}`}>
            <span className={`status-dot ${isRecording ? 'pulse' : ''}`} />
            {isRecording ? 'Recording' : 'Idle'}
          </span>
        </div>

        {isRecording ? (
          <div>
            <div className="grid-2 mb-4">
              <div>
                <div className="stat-value">{eventCount.toLocaleString()}</div>
                <div className="stat-label">Events Captured</div>
              </div>
              <div>
                <div className="stat-value">{duration}s</div>
                <div className="stat-label">Duration</div>
              </div>
            </div>
            <button className="btn btn-danger btn-lg" onClick={handleStopRecording}>
              Stop Recording
            </button>
          </div>
        ) : (
          <div>
            <div className="grid-2 mb-4">
              <div className="form-group">
                <label className="form-label">Frame Rate</label>
                <select
                  className="form-select"
                  value={fps}
                  onChange={(e) => setFps(parseInt(e.target.value) as 30 | 60)}
                >
                  <option value={30}>30 FPS</option>
                  <option value={60}>60 FPS</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Target Monitor</label>
                <select
                  className="form-select"
                  value={selectedMonitor}
                  onChange={(e) => setSelectedMonitor(e.target.value)}
                >
                  <option value="leftmost">Leftmost Monitor</option>
                  <option value="primary">Primary Monitor</option>
                </select>
              </div>
            </div>
            {monitors.length > 0 && (
              <p className="text-xs text-muted mb-4">
                Detected: {monitors.map((m) => `${m.name} (${m.width}x${m.height})`).join(', ')}
              </p>
            )}
            <button
              className="btn btn-primary btn-lg"
              onClick={handleStartRecording}
              disabled={!allDepsInstalled}
            >
              Start Recording
            </button>
            <p className="text-xs text-muted mt-2">
              Press <kbd>SHIFT+CTRL+L</kbd> to stop recording
            </p>
          </div>
        )}
      </div>

      {/* Recent sessions */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Recent Sessions</span>
          <span className="text-sm text-muted">{sessions.length} session(s)</span>
        </div>
        {sessions.length === 0 ? (
          <p className="text-muted">No sessions recorded yet</p>
        ) : (
          <div className="flex flex-col gap-2">
            {sessions.slice(0, 5).map((session) => (
              <div
                key={session.sessionId}
                className="flex justify-between items-center"
                style={{
                  padding: '0.75rem',
                  backgroundColor: 'var(--bg-primary)',
                  borderRadius: '0.5rem',
                }}
              >
                <div>
                  <div className="text-sm">{session.sessionId}</div>
                  <div className="text-xs text-muted">
                    {session.duration.toFixed(1)}s | {session.eventCount.toLocaleString()} events
                  </div>
                </div>
                <div className="text-xs text-muted">
                  {(session.videoSize / 1024 / 1024).toFixed(1)} MB
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default CollectPage;
