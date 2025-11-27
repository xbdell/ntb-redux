import type { IpcMain } from 'electron';
import type {
  VideoCollectionConfig,
  CleaningConfig,
  TrainingConfig,
  InferenceConfig,
  CollectionStatus,
  MonitorInfo,
  SessionInfo,
} from '../shared/types.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import { join } from 'path';

const execAsync = promisify(exec);

// Service instances will be initialized lazily
let collectionService: CollectionService | null = null;

class CollectionService {
  private isRecording = false;
  private sessionId: string | null = null;
  private sessionDir: string | null = null;
  private eventCount = 0;
  private startTime = 0;

  async start(config: VideoCollectionConfig): Promise<void> {
    if (this.isRecording) {
      throw new Error('Collection already in progress');
    }
    // TODO: Initialize VideoDataCollector and start recording
    this.isRecording = true;
    this.sessionId = `session_${Date.now()}`;
    this.sessionDir = join(config.outputDir, this.sessionId);
    this.startTime = Date.now();
    this.eventCount = 0;
  }

  async stop(): Promise<SessionInfo> {
    if (!this.isRecording) {
      throw new Error('No collection in progress');
    }
    // TODO: Stop VideoDataCollector and return session info
    const duration = (Date.now() - this.startTime) / 1000;
    const session: SessionInfo = {
      sessionId: this.sessionId!,
      timestamp: this.startTime,
      duration,
      eventCount: this.eventCount,
      videoSize: 0,
      eventsSize: 0,
    };

    this.isRecording = false;
    this.sessionId = null;
    this.sessionDir = null;

    return session;
  }

  getStatus(): CollectionStatus {
    return {
      isRecording: this.isRecording,
      sessionId: this.sessionId,
      sessionDir: this.sessionDir,
      eventCount: this.eventCount,
      duration: this.isRecording ? (Date.now() - this.startTime) / 1000 : 0,
    };
  }
}

async function getMonitors(): Promise<MonitorInfo[]> {
  try {
    const { stdout } = await execAsync('xrandr --query');
    const monitors: MonitorInfo[] = [];
    const lines = stdout.split('\n');

    for (const line of lines) {
      // Match lines like: "DP-0 connected primary 3840x1600+0+0 (normal..."
      // or: "HDMI-0 connected 1920x1080+3840+260 (normal..."
      const match = line.match(
        /^(\S+)\s+connected\s+(primary\s+)?(\d+)x(\d+)\+(\d+)\+(\d+)/
      );
      if (match) {
        const [, name, isPrimary, width, height, offsetX, offsetY] = match;

        // Try to get refresh rate from the mode line
        let refreshRate = 60;
        const rateMatch = line.match(/(\d+\.\d+)\s*\*/);
        if (rateMatch) {
          refreshRate = Math.round(parseFloat(rateMatch[1]));
        }

        monitors.push({
          name: name!,
          width: parseInt(width!),
          height: parseInt(height!),
          offsetX: parseInt(offsetX!),
          offsetY: parseInt(offsetY!),
          refreshRate,
          isPrimary: !!isPrimary,
        });
      }
    }

    // Sort by offsetX to get leftmost first
    monitors.sort((a, b) => a.offsetX - b.offsetX);

    return monitors;
  } catch (error) {
    console.error('Failed to get monitors:', error);
    return [];
  }
}

async function getSessions(): Promise<SessionInfo[]> {
  const trainingDataDir = join(process.cwd(), 'training_data');
  const sessions: SessionInfo[] = [];

  try {
    const entries = await fs.readdir(trainingDataDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith('session_')) {
        const sessionDir = join(trainingDataDir, entry.name);
        const metadataPath = join(sessionDir, 'metadata.json');

        try {
          const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
          sessions.push({
            sessionId: entry.name,
            timestamp: metadata.timestamp || 0,
            duration: metadata.duration || 0,
            eventCount: metadata.events?.count || 0,
            videoSize: metadata.fileSize?.video || 0,
            eventsSize: metadata.fileSize?.events || 0,
          });
        } catch {
          // Skip sessions without valid metadata
        }
      }
    }

    // Sort by timestamp, newest first
    sessions.sort((a, b) => b.timestamp - a.timestamp);
  } catch {
    // training_data directory doesn't exist yet
  }

  return sessions;
}

async function checkDependencies(): Promise<{ [key: string]: boolean }> {
  const deps = ['ffmpeg', 'xrandr', 'xdotool', 'wmctrl', 'scrot', 'xwininfo'];
  const results: { [key: string]: boolean } = {};

  for (const dep of deps) {
    try {
      await execAsync(`which ${dep}`);
      results[dep] = true;
    } catch {
      results[dep] = false;
    }
  }

  // Check if user is in input group
  try {
    const { stdout } = await execAsync('groups');
    results['input_group'] = stdout.includes('input');
  } catch {
    results['input_group'] = false;
  }

  return results;
}

export function registerIpcHandlers(ipcMain: IpcMain): void {
  // System handlers
  ipcMain.handle('system:get-monitors', async () => {
    return getMonitors();
  });

  ipcMain.handle('system:get-sessions', async () => {
    return getSessions();
  });

  ipcMain.handle('system:check-dependencies', async () => {
    return checkDependencies();
  });

  // Collection handlers
  ipcMain.handle('collection:start', async (_event, config: VideoCollectionConfig) => {
    if (!collectionService) {
      collectionService = new CollectionService();
    }
    return collectionService.start(config);
  });

  ipcMain.handle('collection:stop', async () => {
    if (!collectionService) {
      throw new Error('Collection service not initialized');
    }
    return collectionService.stop();
  });

  ipcMain.handle('collection:get-status', async () => {
    if (!collectionService) {
      return {
        isRecording: false,
        sessionId: null,
        sessionDir: null,
        eventCount: 0,
        duration: 0,
      };
    }
    return collectionService.getStatus();
  });

  // Cleaning handlers (placeholder)
  ipcMain.handle('cleaning:start', async (_event, _config: CleaningConfig) => {
    // TODO: Implement cleaning service
    return {
      trainCount: 0,
      valCount: 0,
      testCount: 0,
      totalFrames: 0,
      filteredFrames: 0,
      outputDir: '',
    };
  });

  ipcMain.handle('cleaning:get-progress', async () => {
    return null;
  });

  // Training handlers (placeholder)
  ipcMain.handle('training:start', async (_event, _config: TrainingConfig) => {
    // TODO: Implement training service
  });

  ipcMain.handle('training:stop', async () => {
    // TODO: Implement training stop
  });

  ipcMain.handle('training:get-status', async () => {
    return {
      isTraining: false,
      currentEpoch: 0,
      totalEpochs: 0,
      bestValLoss: Infinity,
      modelPath: null,
    };
  });

  // Inference handlers (placeholder)
  ipcMain.handle('inference:start', async (_event, _config: InferenceConfig) => {
    // TODO: Implement inference service
  });

  ipcMain.handle('inference:stop', async () => {
    // TODO: Implement inference stop
  });

  ipcMain.handle('inference:get-status', async () => {
    return {
      isRunning: false,
      fps: 0,
      inferenceTimeMs: 0,
      gameWindowFound: false,
    };
  });
}
