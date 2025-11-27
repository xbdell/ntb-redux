import type { IpcMain, BrowserWindow } from 'electron';
import { dialog } from 'electron';
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
import { TensorFlowTrainer } from '../cli/tfjs-training-setup.js';
import { NuclearThroneAI } from '../cli/nuclear-throne-ai.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import { join } from 'path';

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
      gameProcessName: config.gameProcessName,
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
    };

    // Convert IPC config to cleaner config
    this.cleaner = new TrainingDataCleaner({
      inputDir: config.inputDir,
      outputDir: config.outputDir,
      validationSplit: config.valSplit,
      testSplit: config.testSplit,
      minInputEvents: config.minEventsPerFrame,
      maxMouseJump: config.maxMouseJump,
    });

    try {
      // Run the cleaner
      await this.cleaner.clean();

      // Read the dataset info to get results
      const datasetInfoPath = join(config.outputDir, 'dataset_info.json');
      let trainCount = 0,
        valCount = 0,
        testCount = 0;

      try {
        const datasetInfo = JSON.parse(await fs.readFile(datasetInfoPath, 'utf8'));
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
        totalFrames: this.progress.framesKept + this.progress.framesFiltered,
        filteredFrames: this.progress.framesFiltered,
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
// Training Service - wraps TensorFlowTrainer
// ============================================================================

class TrainingService {
  private trainer: TensorFlowTrainer | null = null;
  private status: TrainingStatus = {
    isTraining: false,
    currentEpoch: 0,
    totalEpochs: 0,
    bestValLoss: Infinity,
    modelPath: null,
  };
  private abortController: AbortController | null = null;

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

    this.abortController = new AbortController();

    // Convert IPC config to trainer config
    this.trainer = new TensorFlowTrainer({
      dataDir: config.dataDir,
      modelType: config.modelType,
      epochs: config.epochs,
      batchSize: config.batchSize,
      learningRate: config.learningRate,
      validationSplit: 0.2, // Default
      savePath: join(config.outputDir, 'model'),
    });

    try {
      await this.trainer.initialize();
      await this.trainer.train();

      // Training completed
      this.status.modelPath = join(config.outputDir, 'model');
      sendToRenderer('training:complete', this.status.modelPath);
    } catch (error) {
      console.error('Training failed:', error);
      throw error;
    } finally {
      this.status.isTraining = false;
      this.trainer?.dispose();
      this.trainer = null;
      this.abortController = null;
    }
  }

  async stop(): Promise<void> {
    if (this.abortController) {
      this.abortController.abort();
    }
    this.status.isTraining = false;
  }

  getStatus(): TrainingStatus {
    return { ...this.status };
  }
}

// ============================================================================
// Inference Service - wraps NuclearThroneAI
// ============================================================================

class InferenceService {
  private ai: NuclearThroneAI | null = null;
  private status: InferenceStatus = {
    isRunning: false,
    fps: 0,
    inferenceTimeMs: 0,
    gameWindowFound: false,
  };

  async start(config: InferenceConfig): Promise<void> {
    if (this.status.isRunning) {
      throw new Error('Inference already running');
    }

    this.ai = new NuclearThroneAI({
      modelPath: config.modelPath,
      gameWindowTitle: 'nuclearthrone',
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
      this.status.gameWindowFound = true;

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
      gameProcessName: appConfig.collection.gameProcessName,
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
        if (rateMatch) {
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
        gameWindowFound: false,
      };
    }
    return inferenceService.getStatus();
  });
}
