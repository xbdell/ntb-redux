import type { IpcMain, BrowserWindow } from 'electron';
import { dialog, shell } from 'electron';
import type {
  VideoCollectionConfig,
  CleaningConfig,
  TrainingConfig,
  InferenceConfig,
  CollectionStatus,
  CleaningProgress,
  CleaningResult,
  TrainingStatus,
  InferenceStatus,
  MonitorInfo,
  SessionInfo,
  AppConfig,
} from '../shared/types.js';
import { loadConfig, saveConfig, getResolvedPaths } from '../shared/config.js';
import { VideoDataCollector } from '../cli/video-data-collector.js';
import { TrainingDataCleaner } from '../cli/clean-training-data.js';
import { TargetAppAgent } from '../cli/target-app-agent.js';
import { exec, spawn, type ChildProcess } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import { join } from 'path';
import { createInterface } from 'readline';

// App config (loaded at startup)
let appConfig: AppConfig = loadConfig();

const execAsync = promisify(exec);

// Reference to the main window for sending events
let mainWindow: BrowserWindow | null = null;

export function setMainWindow(window: BrowserWindow | null): void {
  mainWindow = window;
}

// Send event to renderer process
function sendToRenderer(channel: string, ...args: unknown[]): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args);
  }
}

// ============================================================================
// Collection Service - wraps VideoDataCollector
// ============================================================================

class CollectionService {
  private collector: VideoDataCollector | null = null;
  private eventCountInterval: ReturnType<typeof setInterval> | null = null;
  private lastEventCount = 0;

  async start(config: VideoCollectionConfig): Promise<void> {
    if (this.collector) {
      throw new Error('Collection already in progress');
    }

    // Convert shared config to VideoDataCollector config
    this.collector = new VideoDataCollector({
      outputDir: config.outputDir,
      targetWindowName: config.targetWindowName,
      recordingFramerate: config.recordingFramerate,
      videoCodec: config.videoCodec,
      compressionQuality: config.compressionQuality,
      targetMonitor: config.targetMonitor,
    });

    await this.collector.initialize();
    await this.collector.startCollection();

    // Start polling for event count updates (every 500ms)
    this.lastEventCount = 0;
    this.eventCountInterval = setInterval(() => {
      // The VideoDataCollector doesn't expose event count directly during recording
      // We'll send periodic updates based on duration as a proxy
      // In a full implementation, we'd need to modify VideoDataCollector to expose this
      const status = this.collector?.getSessionInfo();
      if (status?.isCollecting) {
        // Estimate events based on ~60 events per second average
        const estimatedEvents = Math.floor(
          ((Date.now() - (this.collector as unknown as { startTime: number }).startTime) / 1000) *
            60
        );
        if (estimatedEvents !== this.lastEventCount) {
          this.lastEventCount = estimatedEvents;
          sendToRenderer('collection:event-count', estimatedEvents);
        }
      }
    }, 500);
  }

  async stop(): Promise<SessionInfo> {
    if (!this.collector) {
      throw new Error('No collection in progress');
    }

    // Clear the event count interval
    if (this.eventCountInterval) {
      clearInterval(this.eventCountInterval);
      this.eventCountInterval = null;
    }

    const metadata = await this.collector.stopCollection();

    const session: SessionInfo = {
      sessionId: metadata.sessionId,
      timestamp: metadata.timestamp,
      duration: metadata.duration,
      eventCount: metadata.events.count,
      videoSize: metadata.fileSize?.video || 0,
      eventsSize: metadata.fileSize?.events || 0,
    };

    // Send stopped event to renderer
    sendToRenderer('collection:stopped', session);

    this.collector = null;

    return session;
  }

  getStatus(): CollectionStatus {
    if (!this.collector) {
      return {
        isRecording: false,
        sessionId: null,
        sessionDir: null,
        eventCount: 0,
        duration: 0,
      };
    }

    const info = this.collector.getSessionInfo();
    const startTime = (this.collector as unknown as { startTime: number }).startTime || Date.now();

    return {
      isRecording: info.isCollecting,
      sessionId: info.sessionId,
      sessionDir: info.sessionDir,
      eventCount: this.lastEventCount,
      duration: info.isCollecting ? (Date.now() - startTime) / 1000 : 0,
    };
  }
}

// ============================================================================
// Cleaning Service - wraps TrainingDataCleaner
// ============================================================================

class CleaningService {
  private cleaner: TrainingDataCleaner | null = null;
  private progress: CleaningProgress | null = null;
  private isRunning = false;

  async start(config: CleaningConfig): Promise<CleaningResult> {
    if (this.isRunning) {
      throw new Error('Cleaning already in progress');
    }

    this.isRunning = true;
    this.progress = {
      phase: 'scanning',
      currentSession: '',
      processedSessions: 0,
      totalSessions: 0,
      framesKept: 0,
      framesFiltered: 0,
      currentStep: 'Initializing...',
      logs: [],
    };

    // Progress callback that updates internal state and sends to renderer
    const onProgress = (progressInfo: CleaningProgress): void => {
      this.progress = progressInfo;
      sendToRenderer('cleaning:progress', progressInfo);
    };

    // Convert IPC config to cleaner config
    this.cleaner = new TrainingDataCleaner(
      {
        inputDir: config.inputDir,
        outputDir: config.outputDir,
        validationSplit: config.valSplit,
        testSplit: config.testSplit,
        minInputEvents: config.minEventsPerFrame,
        skipExistingFrames: true, // Default to skipping for GUI
      },
      onProgress,
    );

    try {
      // Run the cleaner
      await this.cleaner.clean();

      // Read the dataset info to get results
      const datasetInfoPath = join(config.outputDir, 'dataset_info.json');
      let trainCount = 0,
        valCount = 0,
        testCount = 0;

      try {
        const datasetInfo = JSON.parse(await fs.readFile(datasetInfoPath, 'utf8')) as {
          splits?: { train?: number; validation?: number; test?: number };
        };
        trainCount = datasetInfo.splits?.train || 0;
        valCount = datasetInfo.splits?.validation || 0;
        testCount = datasetInfo.splits?.test || 0;
      } catch {
        // Dataset info may not exist if no valid frames
      }

      const result: CleaningResult = {
        trainCount,
        valCount,
        testCount,
        totalFrames: this.progress?.framesKept ?? 0 + (this.progress?.framesFiltered ?? 0),
        filteredFrames: this.progress?.framesFiltered ?? 0,
        outputDir: config.outputDir,
      };

      this.isRunning = false;
      this.progress = null;
      this.cleaner = null;

      return result;
    } catch (error) {
      this.isRunning = false;
      this.progress = null;
      this.cleaner = null;
      throw error;
    }
  }

  getProgress(): CleaningProgress | null {
    return this.progress;
  }
}

// ============================================================================
// Training Service - spawns training as a child process to avoid GPU conflicts
// ============================================================================

class TrainingService {
  private trainingProcess: ChildProcess | null = null;
  private status: TrainingStatus = {
    isTraining: false,
    currentEpoch: 0,
    totalEpochs: 0,
    bestValLoss: Infinity,
    modelPath: null,
  };

  async start(config: TrainingConfig): Promise<void> {
    if (this.status.isTraining) {
      throw new Error('Training already in progress');
    }

    this.status = {
      isTraining: true,
      currentEpoch: 0,
      totalEpochs: config.epochs,
      bestValLoss: Infinity,
      modelPath: null,
    };

    return new Promise((resolve, reject) => {
      // Spawn the training CLI as a separate process
      // This avoids GPU library conflicts with Electron
      const args = [
        config.dataDir,
        '--model',
        config.modelType,
        '--epochs',
        String(config.epochs),
        '--batch-size',
        String(config.batchSize),
        '--learning-rate',
        String(config.learningRate),
        '--save-path',
        config.outputDir,
        '--json-output',
      ];

      console.log('🚀 Spawning training process:', 'npm', ['run', 'train', '--', ...args].join(' '));

      this.trainingProcess = spawn('npm', ['run', 'train', '--', ...args], {
        cwd: process.cwd(),
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true,
      });

      // Parse JSON output from the training process
      const rl = createInterface({
        input: this.trainingProcess.stdout!,
        crlfDelay: Infinity,
      });

      rl.on('line', (line: string) => {
        // Try to parse as JSON
        try {
          const data = JSON.parse(line) as Record<string, unknown>;

          switch (data['type']) {
            case 'epoch': {
              const epoch = data['epoch'] as number;
              const totalEpochs = data['totalEpochs'] as number;
              const trainLoss = data['trainLoss'] as number;
              const valLoss = data['valLoss'] as number;

              this.status.currentEpoch = epoch;
              if (valLoss < this.status.bestValLoss) {
                this.status.bestValLoss = valLoss;
              }

              sendToRenderer('training:epoch', {
                epoch,
                totalEpochs,
                trainLoss,
                valLoss,
                learningRate: config.learningRate,
                timeMs: 0,
              });
              break;
            }
            case 'complete': {
              const modelPath = data['modelPath'] as string;
              this.status.modelPath = modelPath;
              this.status.isTraining = false;
              sendToRenderer('training:complete', modelPath);
              resolve();
              break;
            }
            case 'error': {
              const message = data['message'] as string;
              this.status.isTraining = false;
              reject(new Error(message));
              break;
            }
            case 'start':
              console.log('📊 Training started with config:', data['config']);
              break;
          }
        } catch {
          // Not JSON, log as regular output
          console.log('[train]', line);
        }
      });

      // Handle stderr
      this.trainingProcess.stderr?.on('data', (data: Buffer) => {
        console.error('[train:err]', data.toString());
      });

      // Handle process exit
      this.trainingProcess.on('close', (code: number | null) => {
        console.log(`Training process exited with code ${code}`);
        this.status.isTraining = false;
        this.trainingProcess = null;

        if (code !== 0 && this.status.modelPath === null) {
          reject(new Error(`Training process exited with code ${code}`));
        }
      });

      this.trainingProcess.on('error', (error: Error) => {
        console.error('Training process error:', error);
        this.status.isTraining = false;
        this.trainingProcess = null;
        reject(error);
      });
    });
  }

  async stop(): Promise<void> {
    if (this.trainingProcess) {
      this.trainingProcess.kill('SIGTERM');
      this.trainingProcess = null;
    }
    this.status.isTraining = false;
  }

  getStatus(): TrainingStatus {
    return { ...this.status };
  }
}

// ============================================================================
// Inference Service - wraps TargetAppAgent
// ============================================================================

class InferenceService {
  private ai: TargetAppAgent | null = null;
  private status: InferenceStatus = {
    isRunning: false,
    fps: 0,
    inferenceTimeMs: 0,
    targetWindowFound: false,
  };

  async start(config: InferenceConfig): Promise<void> {
    if (this.status.isRunning) {
      throw new Error('Inference already running');
    }

    this.ai = new TargetAppAgent({
      modelPath: config.modelPath,
      targetWindowTitle: appConfig.collection.targetWindowName,
      targetFPS: config.targetFps,
      enableController: config.useController,
      safetyMode: true,
      performance: {
        smoothingFactor: config.smoothingFactor,
        confidenceThreshold: 0.4,
        deadZone: 0.1,
        mouseSpeed: 0.8,
      },
      debug: {
        enabled: config.debug,
        logActions: config.debug,
        saveSession: false,
      },
    });

    try {
      await this.ai.initialize();
      this.status.isRunning = true;
      this.status.targetWindowFound = true;

      // Start the AI (this runs in a loop)
      this.ai.start().catch((error) => {
        console.error('AI loop error:', error);
        this.status.isRunning = false;
      });
    } catch (error) {
      this.ai = null;
      this.status.isRunning = false;
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (this.ai) {
      await this.ai.stop();
      this.ai = null;
    }
    this.status.isRunning = false;
    this.status.fps = 0;
    this.status.inferenceTimeMs = 0;
  }

  getStatus(): InferenceStatus {
    return { ...this.status };
  }
}

// ============================================================================
// Service instances (lazy initialization)
// ============================================================================

let collectionService: CollectionService | null = null;
let cleaningService: CleaningService | null = null;
let trainingService: TrainingService | null = null;
let inferenceService: InferenceService | null = null;

// ============================================================================
// Exported functions for global hotkey support
// ============================================================================

/**
 * Get the collection service instance (for status checks)
 */
export function getCollectionService(): CollectionService | null {
  return collectionService;
}

/**
 * Toggle collection on/off via global hotkey
 * Returns the new recording state
 */
export async function toggleCollection(): Promise<boolean> {
  if (!collectionService) {
    collectionService = new CollectionService();
  }

  const status = collectionService.getStatus();

  if (status.isRecording) {
    // Stop recording
    console.log('🛑 Global hotkey: Stopping recording...');
    await collectionService.stop();
    sendToRenderer('collection:hotkey-toggled', false);
    return false;
  } else {
    // Start recording with current config
    console.log('🎬 Global hotkey: Starting recording...');
    const resolvedPaths = getResolvedPaths(appConfig);
    await collectionService.start({
      outputDir: resolvedPaths.trainingData,
      targetWindowName: appConfig.collection.targetWindowName,
      recordingFramerate: appConfig.collection.defaultFps,
      videoCodec: 'libx264',
      compressionQuality: 18,
      targetMonitor: appConfig.collection.defaultMonitor,
    });
    sendToRenderer('collection:hotkey-toggled', true);
    return true;
  }
}

// ============================================================================
// Helper functions
// ============================================================================

async function getMonitors(): Promise<MonitorInfo[]> {
  try {
    const { stdout } = await execAsync('xrandr --query');
    const monitors: MonitorInfo[] = [];
    const lines = stdout.split('\n');

    for (const line of lines) {
      // Match lines like: "DP-0 connected primary 3840x1600+0+0 (normal..."
      // or: "HDMI-0 connected 1920x1080+3840+260 (normal..."
      const match = line.match(/^(\S+)\s+connected\s+(primary\s+)?(\d+)x(\d+)\+(\d+)\+(\d+)/);
      if (match) {
        const name = match[1];
        const isPrimary = match[2];
        const width = match[3];
        const height = match[4];
        const offsetX = match[5];
        const offsetY = match[6];

        if (!name || !width || !height || !offsetX || !offsetY) {
          continue;
        }

        // Try to get refresh rate from the mode line
        let refreshRate = 60;
        const rateMatch = line.match(/(\d+\.\d+)\s*\*/);
        if (rateMatch && rateMatch[1]) {
          refreshRate = Math.round(parseFloat(rateMatch[1]));
        }

        monitors.push({
          name,
          width: parseInt(width),
          height: parseInt(height),
          offsetX: parseInt(offsetX),
          offsetY: parseInt(offsetY),
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
  const resolvedPaths = getResolvedPaths(appConfig);
  const trainingDataDir = resolvedPaths.trainingData;
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

// ============================================================================
// Register all IPC handlers
// ============================================================================

export function registerIpcHandlers(ipcMain: IpcMain): void {
  // Config handlers
  ipcMain.handle('config:get', async () => {
    // Always load fresh from disk to pick up any changes
    appConfig = loadConfig();
    return appConfig;
  });

  ipcMain.handle('config:set', async (_event, config: AppConfig) => {
    appConfig = config;
    saveConfig(config);
  });

  ipcMain.handle('config:select-directory', async (_event, title: string) => {
    if (!mainWindow) {
      return null;
    }
    const result = await dialog.showOpenDialog(mainWindow, {
      title,
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

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

  ipcMain.handle('system:open-directory', async (_event, dirPath: string) => {
    try {
      await shell.openPath(dirPath);
      return true;
    } catch (error) {
      console.error('Failed to open directory:', error);
      return false;
    }
  });

  ipcMain.handle('system:delete-session', async (_event, sessionId: string) => {
    const resolvedPaths = getResolvedPaths(appConfig);
    const sessionDir = join(resolvedPaths.trainingData, sessionId);

    try {
      // Verify it's a valid session directory
      const stat = await fs.stat(sessionDir);
      if (!stat.isDirectory() || !sessionId.startsWith('session_')) {
        throw new Error('Invalid session directory');
      }

      // Delete the directory recursively
      await fs.rm(sessionDir, { recursive: true, force: true });
      console.log(`🗑️ Deleted session: ${sessionId}`);
      return true;
    } catch (error) {
      console.error(`Failed to delete session ${sessionId}:`, error);
      return false;
    }
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

  // Cleaning handlers
  ipcMain.handle('cleaning:start', async (_event, config: CleaningConfig) => {
    if (!cleaningService) {
      cleaningService = new CleaningService();
    }
    return cleaningService.start(config);
  });

  ipcMain.handle('cleaning:get-progress', async () => {
    if (!cleaningService) {
      return null;
    }
    return cleaningService.getProgress();
  });

  // Training handlers
  ipcMain.handle('training:start', async (_event, config: TrainingConfig) => {
    if (!trainingService) {
      trainingService = new TrainingService();
    }
    return trainingService.start(config);
  });

  ipcMain.handle('training:stop', async () => {
    if (!trainingService) {
      return;
    }
    return trainingService.stop();
  });

  ipcMain.handle('training:get-status', async () => {
    if (!trainingService) {
      return {
        isTraining: false,
        currentEpoch: 0,
        totalEpochs: 0,
        bestValLoss: Infinity,
        modelPath: null,
      };
    }
    return trainingService.getStatus();
  });

  // Inference handlers
  ipcMain.handle('inference:start', async (_event, config: InferenceConfig) => {
    if (!inferenceService) {
      inferenceService = new InferenceService();
    }
    return inferenceService.start(config);
  });

  ipcMain.handle('inference:stop', async () => {
    if (!inferenceService) {
      return;
    }
    return inferenceService.stop();
  });

  ipcMain.handle('inference:get-status', async () => {
    if (!inferenceService) {
      return {
        isRunning: false,
        fps: 0,
        inferenceTimeMs: 0,
        targetWindowFound: false,
      };
    }
    return inferenceService.getStatus();
  });
}
