// IPC Channel types for type-safe communication between main and renderer

export interface VideoCollectionConfig {
  outputDir: string;
  gameProcessName: string;
  recordingFramerate: 30 | 60;
  videoCodec: 'libx264' | 'libx265';
  compressionQuality: number;
  targetMonitor: 'leftmost' | 'primary';
}

export interface CleaningConfig {
  inputDir: string;
  outputDir: string;
  valSplit: number;
  testSplit: number;
  minEventsPerFrame: number;
  maxMouseJump: number;
}

export interface TrainingConfig {
  dataDir: string;
  modelType: 'custom_cnn' | 'mobilenet' | 'efficientnet';
  epochs: number;
  batchSize: number;
  learningRate: number;
  outputDir: string;
}

export interface InferenceConfig {
  modelPath: string;
  targetFps: number;
  smoothingFactor: number;
  useController: boolean;
  debug: boolean;
}

// Status and progress types

export interface CollectionStatus {
  isRecording: boolean;
  sessionId: string | null;
  sessionDir: string | null;
  eventCount: number;
  duration: number;
}

export interface CleaningProgress {
  phase: 'scanning' | 'processing' | 'splitting' | 'complete';
  currentSession: string;
  processedSessions: number;
  totalSessions: number;
  framesKept: number;
  framesFiltered: number;
}

export interface CleaningResult {
  trainCount: number;
  valCount: number;
  testCount: number;
  totalFrames: number;
  filteredFrames: number;
  outputDir: string;
}

export interface EpochMetrics {
  epoch: number;
  totalEpochs: number;
  trainLoss: number;
  valLoss: number;
  trainAccuracy?: number;
  valAccuracy?: number;
  learningRate: number;
  timeMs: number;
}

export interface TrainingStatus {
  isTraining: boolean;
  currentEpoch: number;
  totalEpochs: number;
  bestValLoss: number;
  modelPath: string | null;
}

export interface InferenceStatus {
  isRunning: boolean;
  fps: number;
  inferenceTimeMs: number;
  gameWindowFound: boolean;
}

export interface PredictedAction {
  movementX: number;
  movementY: number;
  aimX: number;
  aimY: number;
  shooting: boolean;
  confidence: number;
  timestamp: number;
}

export interface MonitorInfo {
  name: string;
  width: number;
  height: number;
  refreshRate: number;
  offsetX: number;
  offsetY: number;
  isPrimary: boolean;
}

export interface SessionInfo {
  sessionId: string;
  timestamp: number;
  duration: number;
  eventCount: number;
  videoSize: number;
  eventsSize: number;
}

// IPC Channel definitions
export type IpcChannels = {
  // System
  'system:get-monitors': () => Promise<MonitorInfo[]>;
  'system:get-sessions': () => Promise<SessionInfo[]>;
  'system:check-dependencies': () => Promise<{ [key: string]: boolean }>;

  // Collection
  'collection:start': (config: VideoCollectionConfig) => Promise<void>;
  'collection:stop': () => Promise<SessionInfo>;
  'collection:get-status': () => Promise<CollectionStatus>;

  // Cleaning
  'cleaning:start': (config: CleaningConfig) => Promise<CleaningResult>;
  'cleaning:get-progress': () => Promise<CleaningProgress | null>;

  // Training
  'training:start': (config: TrainingConfig) => Promise<void>;
  'training:stop': () => Promise<void>;
  'training:get-status': () => Promise<TrainingStatus>;

  // Inference
  'inference:start': (config: InferenceConfig) => Promise<void>;
  'inference:stop': () => Promise<void>;
  'inference:get-status': () => Promise<InferenceStatus>;
};

// Event types for real-time updates (main -> renderer)
export type IpcEvents = {
  'collection:event-count': (count: number) => void;
  'collection:stopped': (session: SessionInfo) => void;
  'cleaning:progress': (progress: CleaningProgress) => void;
  'training:epoch': (metrics: EpochMetrics) => void;
  'training:complete': (modelPath: string) => void;
  'inference:action': (action: PredictedAction) => void;
  'inference:stats': (stats: { fps: number; inferenceTimeMs: number }) => void;
};
