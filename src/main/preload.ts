import { contextBridge, ipcRenderer } from 'electron';
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
  EpochMetrics,
  PredictedAction,
  MonitorInfo,
  SessionInfo,
  AppConfig,
} from '../shared/types.js';

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
const electronAPI = {
  // Config
  getConfig: (): Promise<AppConfig> => ipcRenderer.invoke('config:get'),
  setConfig: (config: AppConfig): Promise<void> => ipcRenderer.invoke('config:set', config),
  selectDirectory: (title: string): Promise<string | null> =>
    ipcRenderer.invoke('config:select-directory', title),

  // System
  getMonitors: (): Promise<MonitorInfo[]> => ipcRenderer.invoke('system:get-monitors'),
  getSessions: (): Promise<SessionInfo[]> => ipcRenderer.invoke('system:get-sessions'),
  checkDependencies: (): Promise<{ [key: string]: boolean }> =>
    ipcRenderer.invoke('system:check-dependencies'),

  // Collection
  startCollection: (config: VideoCollectionConfig): Promise<void> =>
    ipcRenderer.invoke('collection:start', config),
  stopCollection: (): Promise<SessionInfo> => ipcRenderer.invoke('collection:stop'),
  getCollectionStatus: (): Promise<CollectionStatus> =>
    ipcRenderer.invoke('collection:get-status'),

  // Cleaning
  startCleaning: (config: CleaningConfig): Promise<CleaningResult> =>
    ipcRenderer.invoke('cleaning:start', config),
  getCleaningProgress: (): Promise<CleaningProgress | null> =>
    ipcRenderer.invoke('cleaning:get-progress'),

  // Training
  startTraining: (config: TrainingConfig): Promise<void> =>
    ipcRenderer.invoke('training:start', config),
  stopTraining: (): Promise<void> => ipcRenderer.invoke('training:stop'),
  getTrainingStatus: (): Promise<TrainingStatus> => ipcRenderer.invoke('training:get-status'),

  // Inference
  startInference: (config: InferenceConfig): Promise<void> =>
    ipcRenderer.invoke('inference:start', config),
  stopInference: (): Promise<void> => ipcRenderer.invoke('inference:stop'),
  getInferenceStatus: (): Promise<InferenceStatus> => ipcRenderer.invoke('inference:get-status'),

  // Event listeners (main -> renderer)
  onCollectionEventCount: (callback: (count: number) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, count: number) => callback(count);
    ipcRenderer.on('collection:event-count', listener);
    return () => ipcRenderer.removeListener('collection:event-count', listener);
  },

  onCollectionStopped: (callback: (session: SessionInfo) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, session: SessionInfo) =>
      callback(session);
    ipcRenderer.on('collection:stopped', listener);
    return () => ipcRenderer.removeListener('collection:stopped', listener);
  },

  onCleaningProgress: (callback: (progress: CleaningProgress) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: CleaningProgress) =>
      callback(progress);
    ipcRenderer.on('cleaning:progress', listener);
    return () => ipcRenderer.removeListener('cleaning:progress', listener);
  },

  onTrainingEpoch: (callback: (metrics: EpochMetrics) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, metrics: EpochMetrics) =>
      callback(metrics);
    ipcRenderer.on('training:epoch', listener);
    return () => ipcRenderer.removeListener('training:epoch', listener);
  },

  onTrainingComplete: (callback: (modelPath: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, modelPath: string) =>
      callback(modelPath);
    ipcRenderer.on('training:complete', listener);
    return () => ipcRenderer.removeListener('training:complete', listener);
  },

  onInferenceAction: (callback: (action: PredictedAction) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, action: PredictedAction) =>
      callback(action);
    ipcRenderer.on('inference:action', listener);
    return () => ipcRenderer.removeListener('inference:action', listener);
  },

  onInferenceStats: (callback: (stats: { fps: number; inferenceTimeMs: number }) => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      stats: { fps: number; inferenceTimeMs: number }
    ) => callback(stats);
    ipcRenderer.on('inference:stats', listener);
    return () => ipcRenderer.removeListener('inference:stats', listener);
  },
};

// Expose the API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// Type declaration for the renderer process
export type ElectronAPI = typeof electronAPI;
