import { useState, useEffect } from 'react';
import type { MonitorInfo, CollectionStatus, SessionInfo, AppConfig } from '../../shared/types';

declare global {
  interface Window {
    electronAPI: {
      getMonitors: () => Promise<MonitorInfo[]>;
      getSessions: () => Promise<SessionInfo[]>;
      checkDependencies: () => Promise<{ [key: string]: boolean }>;
      getConfig: () => Promise<AppConfig>;
      startCollection: (config: unknown) => Promise<void>;
      stopCollection: () => Promise<SessionInfo>;
      getCollectionStatus: () => Promise<CollectionStatus>;
      openDirectory: (dirPath: string) => Promise<boolean>;
      deleteSession: (sessionId: string) => Promise<boolean>;
      onCollectionEventCount: (callback: (count: number) => void) => () => void;
      onCollectionStopped: (callback: (session: SessionInfo) => void) => () => void;
      onCollectionHotkeyToggled: (callback: (isRecording: boolean) => void) => () => void;
    };
  }
}

// Trash icon component
const TrashIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
  </svg>
);

// Folder icon component
const FolderIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
  </svg>
);

function CollectPage() {
  const [monitors, setMonitors] = useState<MonitorInfo[]>([]);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [dependencies, setDependencies] = useState<{ [key: string]: boolean }>({});
  const [trainingDataPath, setTrainingDataPath] = useState<string>('./training_data');
  const [isRecording, setIsRecording] = useState(false);
  const [eventCount, setEventCount] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loading, setLoading] = useState(true);
  const [deletingSession, setDeletingSession] = useState<string | null>(null);

  // Configuration state
  const [fps, setFps] = useState<30 | 60>(30);
  const [selectedMonitor, setSelectedMonitor] = useState<string>('leftmost');

  useEffect(() => {
    async function init() {
      try {
        const [monitorsData, sessionsData, depsData, configData] = await Promise.all([
          window.electronAPI.getMonitors(),
          window.electronAPI.getSessions(),
          window.electronAPI.checkDependencies(),
          window.electronAPI.getConfig(),
        ]);
        setMonitors(monitorsData);
        setSessions(sessionsData);
        setDependencies(depsData);
        setTrainingDataPath(configData.paths.trainingData);
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

    // Subscribe to global hotkey toggle events
    const unsubscribeHotkey = window.electronAPI.onCollectionHotkeyToggled((recording) => {
      setIsRecording(recording);
      if (recording) {
        setEventCount(0);
        setDuration(0);
      }
    });

    return () => {
      unsubscribeEventCount();
      unsubscribeStopped();
      unsubscribeHotkey();
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
        targetWindowName: '',  // Empty = full monitor capture
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

  const handleOpenDirectory = async () => {
    try {
      await window.electronAPI.openDirectory(trainingDataPath);
    } catch (error) {
      console.error('Failed to open directory:', error);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (deletingSession) return; // Prevent multiple deletes

    setDeletingSession(sessionId);
    try {
      const success = await window.electronAPI.deleteSession(sessionId);
      if (success) {
        setSessions((prev) => prev.filter((s) => s.sessionId !== sessionId));
      } else {
        console.error('Failed to delete session');
      }
    } catch (error) {
      console.error('Failed to delete session:', error);
    } finally {
      setDeletingSession(null);
    }
  };

  const missingDeps = Object.entries(dependencies).filter(([, installed]) => !installed);
  const allDepsInstalled = missingDeps.length === 0;

  if (loading) {
    return (
      <div>
        <h2 className="text-2xl font-semibold mb-2">Collect Training Data</h2>
        <p className="text-base-content/60">
          <span className="loading loading-spinner loading-sm mr-2"></span>
          Loading...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h2 className="text-2xl font-semibold mb-1">Collect Training Data</h2>
        <p className="text-base-content/60">Record gameplay video and input events for training</p>
      </div>

      {/* Dependencies Alert */}
      {!allDepsInstalled && (
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
          <div>
            <h3 className="font-bold">Missing Dependencies</h3>
            <p className="text-sm">Install missing dependencies to enable data collection:</p>
            <code className="text-sm mt-1 block">
              sudo apt install {missingDeps.map(([name]) => name).join(' ')}
            </code>
            {!dependencies['input_group'] && (
              <p className="text-sm mt-2">
                You also need to be in the &quot;input&quot; group:{' '}
                <code>sudo usermod -aG input $USER</code>
              </p>
            )}
          </div>
        </div>
      )}

      {/* Recording Status Card */}
      <div className="card bg-base-200">
        <div className="card-body">
          <div className="flex items-center justify-between mb-4">
            <h3 className="card-title text-lg">Recording Status</h3>
            <div className={`badge ${isRecording ? 'badge-success' : 'badge-ghost'} gap-2`}>
              <span
                className={`w-2 h-2 rounded-full ${isRecording ? 'bg-success animate-pulse-opacity' : 'bg-base-content/40'}`}
              ></span>
              {isRecording ? 'Recording' : 'Idle'}
            </div>
          </div>

          {isRecording ? (
            <div className="space-y-4">
              {/* Stats */}
              <div className="stats bg-base-300 w-full">
                <div className="stat">
                  <div className="stat-title">Events Captured</div>
                  <div className="stat-value text-primary">{eventCount.toLocaleString()}</div>
                </div>
                <div className="stat">
                  <div className="stat-title">Duration</div>
                  <div className="stat-value">{duration}s</div>
                </div>
              </div>

              <button className="btn btn-error btn-lg w-full" onClick={handleStopRecording}>
                Stop Recording
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Configuration */}
              <div className="grid grid-cols-2 gap-4">
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Frame Rate</span>
                  </label>
                  <select
                    className="select select-bordered w-full"
                    value={fps}
                    onChange={(e) => setFps(parseInt(e.target.value) as 30 | 60)}
                  >
                    <option value={30}>30 FPS</option>
                    <option value={60}>60 FPS</option>
                  </select>
                </div>
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Target Monitor</span>
                  </label>
                  <select
                    className="select select-bordered w-full"
                    value={selectedMonitor}
                    onChange={(e) => setSelectedMonitor(e.target.value)}
                  >
                    <option value="leftmost">Leftmost Monitor</option>
                    <option value="primary">Primary Monitor</option>
                  </select>
                </div>
              </div>

              {monitors.length > 0 && (
                <p className="text-xs text-base-content/60">
                  Detected: {monitors.map((m) => `${m.name} (${m.width}x${m.height})`).join(', ')}
                </p>
              )}

              <button
                className="btn btn-primary btn-lg w-full"
                onClick={handleStartRecording}
                disabled={!allDepsInstalled}
              >
                Start Recording
              </button>

              <p className="text-xs text-base-content/60 text-center">
                Press <kbd>Ctrl+Shift+L</kbd> to start/stop recording (global hotkey)
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Recent Sessions Card */}
      <div className="card bg-base-200">
        <div className="card-body">
          <div className="flex items-center justify-between mb-4">
            <h3 className="card-title text-lg">Recent Sessions</h3>
            <div className="flex items-center gap-2">
              <span className="text-sm text-base-content/60">{sessions.length} session(s)</span>
              <button
                className="btn btn-ghost btn-sm gap-1"
                onClick={handleOpenDirectory}
                title="Open training data folder"
              >
                <FolderIcon />
                Open Folder
              </button>
            </div>
          </div>

          {sessions.length === 0 ? (
            <p className="text-base-content/60">No sessions recorded yet</p>
          ) : (
            <div className="space-y-2">
              {sessions.slice(0, 10).map((session) => (
                <div
                  key={session.sessionId}
                  className="flex justify-between items-center bg-base-300 rounded-lg p-3"
                >
                  <div className="flex-1">
                    <div className="font-medium text-sm">{session.sessionId}</div>
                    <div className="text-xs text-base-content/60">
                      {session.duration.toFixed(1)}s | {session.eventCount.toLocaleString()} events
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-xs text-base-content/60">
                      {(session.videoSize / 1024 / 1024).toFixed(1)} MB
                    </div>
                    <button
                      className={`btn btn-ghost btn-sm btn-square text-error hover:bg-error hover:text-error-content ${
                        deletingSession === session.sessionId ? 'loading' : ''
                      }`}
                      onClick={() => handleDeleteSession(session.sessionId)}
                      disabled={deletingSession !== null}
                      title="Delete session"
                    >
                      {deletingSession !== session.sessionId && <TrashIcon />}
                    </button>
                  </div>
                </div>
              ))}
              {sessions.length > 10 && (
                <p className="text-xs text-base-content/60 text-center pt-2">
                  Showing 10 of {sessions.length} sessions.{' '}
                  <button className="link link-primary" onClick={handleOpenDirectory}>
                    Open folder
                  </button>{' '}
                  to see all.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default CollectPage;
