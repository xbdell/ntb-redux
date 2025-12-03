#!/usr/bin/env ts-node

import * as tf from '@tensorflow/tfjs-node-gpu';
import { WindowUtils } from './window-utils.js';
import { promises as fs } from 'fs';

interface GameAction {
  movement: { x: number; y: number };
  aim: { x: number; y: number };
  shooting: boolean;
  confidence: number;
}

interface InferenceConfig {
  modelPath: string;
  targetWindowTitle: string;
  inferenceIntervalMs: number;
  smoothingFactor: number; // For action smoothing
  confidenceThreshold: number;
  debugMode: boolean;
}

class RealTimeInference {
  private model: tf.LayersModel | null = null;
  private windowUtils: WindowUtils;
  private targetWindowId: string | null = null;
  private config: InferenceConfig;
  private isRunning = false;
  private lastAction: GameAction | null = null;
  private actionHistory: GameAction[] = [];
  private performanceStats = {
    totalInferences: 0,
    totalTime: 0,
    averageFPS: 0,
    lastFPSUpdate: Date.now(),
  };

  constructor(config: InferenceConfig) {
    this.config = config;
    this.windowUtils = new WindowUtils();
  }

  public async initialize(): Promise<void> {
    console.log('🤖 Initializing real-time inference engine...');

    // Load the trained model
    await this.loadModel();

    // Find target window
    await this.findTargetWindow();

    // Warm up the model with a dummy prediction
    this.warmUpModel();

    console.log('✅ Inference engine ready!');
    console.log(`🎯 Target FPS: ${1000 / this.config.inferenceIntervalMs}`);
  }

  private async loadModel(): Promise<void> {
    console.log(`📂 Loading model from: ${this.config.modelPath}`);

    try {
      this.model = await tf.loadLayersModel(`file://${this.config.modelPath}/model.json`);
      console.log('✅ Model loaded successfully');
      console.log(`📊 Model input shape: ${JSON.stringify(this.model.inputs[0]?.shape)}`);
      console.log(`📊 Model output shape: ${JSON.stringify(this.model.outputs[0]?.shape)}`);
    } catch (error) {
      throw new Error(
        `Failed to load model: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async findTargetWindow(): Promise<void> {
    console.log(`🔍 Looking for target window: ${this.config.targetWindowTitle}`);

    const windows = await this.windowUtils.getWindows();
    const targetWindow = windows.find((w) =>
      w.title.toLowerCase().includes(this.config.targetWindowTitle.toLowerCase()),
    );

    if (!targetWindow) {
      throw new Error(`Target window not found: ${this.config.targetWindowTitle}`);
    }

    this.targetWindowId = targetWindow.id;
    console.log(`✅ Found target window: ${targetWindow.title} (ID: ${targetWindow.id})`);
  }

  private warmUpModel(): void {
    if (!this.model) throw new Error('Model not loaded');

    console.log('🔥 Warming up model...');

    // Create dummy input matching expected shape
    const dummyInput = tf.zeros([1, 240, 320, 3]);

    // Run a few warm-up predictions
    for (let i = 0; i < 3; i++) {
      const prediction = this.model.predict(dummyInput) as tf.Tensor;
      prediction.dispose();
    }

    dummyInput.dispose();
    console.log('✅ Model warmed up');
  }

  public async startInference(): Promise<void> {
    if (this.isRunning) {
      console.log('⚠️  Inference already running');
      return;
    }

    if (!this.model || !this.targetWindowId) {
      throw new Error('Inference engine not initialized');
    }

    console.log('🚀 Starting real-time inference...');
    console.log('🛑 Press Ctrl+C to stop');

    this.isRunning = true;
    this.performanceStats.lastFPSUpdate = Date.now();

    // Main inference loop
    while (this.isRunning) {
      const startTime = Date.now();

      try {
        // Capture screenshot
        const screenshot = await this.captureTargetScreen();

        // Run inference
        const action = await this.predict(screenshot);

        // Apply smoothing
        const smoothedAction = this.smoothAction(action);

        // Execute action (we'll implement this next)
        this.executeAction(smoothedAction);

        // Update performance stats
        this.updatePerformanceStats(startTime);

        // Debug output
        if (this.config.debugMode) {
          this.logDebugInfo(smoothedAction, Date.now() - startTime);
        }

        // Wait for next frame
        const elapsed = Date.now() - startTime;
        const waitTime = Math.max(0, this.config.inferenceIntervalMs - elapsed);

        if (waitTime > 0) {
          await new Promise((resolve) => setTimeout(resolve, waitTime));
        }
      } catch (error) {
        console.error(
          '❌ Inference error:',
          error instanceof Error ? error.message : String(error),
        );

        // Brief pause before retrying
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    console.log('🛑 Inference stopped');
  }

  public stopInference(): void {
    this.isRunning = false;
  }

  private async captureTargetScreen(): Promise<tf.Tensor3D> {
    if (!this.targetWindowId) throw new Error('Target window not found');

    // Capture screenshot as buffer
    const imageBuffer = await this.windowUtils.captureWindowToBuffer(this.targetWindowId);

    // Convert to tensor
    let imageTensor = tf.node.decodeImage(imageBuffer, 3) as tf.Tensor3D;

    // Resize to model input size
    const resized = tf.image.resizeBilinear(imageTensor, [240, 320]);
    imageTensor.dispose();

    // Normalize to [0, 1]
    const normalized = tf.div(resized, 255.0);
    resized.dispose();

    return normalized as tf.Tensor3D;
  }

  private async predict(imageTensor: tf.Tensor3D): Promise<GameAction> {
    if (!this.model) throw new Error('Model not loaded');

    // Add batch dimension
    const batchedInput = tf.expandDims(imageTensor, 0);

    // Run prediction
    const prediction = this.model.predict(batchedInput) as tf.Tensor;
    const predictionData = await prediction.data();

    // Clean up tensors
    batchedInput.dispose();
    prediction.dispose();
    imageTensor.dispose();

    // Extract action components
    const action: GameAction = {
      movement: {
        x: predictionData[0] ?? 0, // -1 to 1
        y: predictionData[1] ?? 0, // -1 to 1
      },
      aim: {
        x: (predictionData[2] ?? 0) * 320, // Denormalize to screen coordinates
        y: (predictionData[3] ?? 0) * 240, // Denormalize to screen coordinates
      },
      shooting: (predictionData[4] ?? 0) > 0.5, // Threshold for shooting
      confidence: this.calculateConfidence(predictionData as Float32Array),
    };

    return action;
  }

  private calculateConfidence(predictionData: Float32Array): number {
    // Simple confidence calculation based on prediction magnitudes
    const movementMagnitude = Math.sqrt(
      (predictionData[0] ?? 0) * (predictionData[0] ?? 0) +
        (predictionData[1] ?? 0) * (predictionData[1] ?? 0),
    );

    const shootingConfidence = Math.abs((predictionData[4] ?? 0) - 0.5) * 2; // 0-1 scale

    return Math.min(1.0, (movementMagnitude + shootingConfidence) / 2);
  }

  private smoothAction(action: GameAction): GameAction {
    if (!this.lastAction) {
      this.lastAction = action;
      return action;
    }

    const alpha = this.config.smoothingFactor;

    const smoothedAction: GameAction = {
      movement: {
        x: alpha * action.movement.x + (1 - alpha) * this.lastAction.movement.x,
        y: alpha * action.movement.y + (1 - alpha) * this.lastAction.movement.y,
      },
      aim: {
        x: alpha * action.aim.x + (1 - alpha) * this.lastAction.aim.x,
        y: alpha * action.aim.y + (1 - alpha) * this.lastAction.aim.y,
      },
      shooting: action.shooting, // No smoothing for discrete actions
      confidence: action.confidence,
    };

    this.lastAction = smoothedAction;

    // Store in history for analysis
    this.actionHistory.push(smoothedAction);
    if (this.actionHistory.length > 100) {
      this.actionHistory.shift(); // Keep only recent actions
    }

    return smoothedAction;
  }

  private executeAction(action: GameAction): void {
    // Only execute if confidence is above threshold
    if (action.confidence < this.config.confidenceThreshold) {
      return;
    }

    // We'll implement actual input execution in the next component
    // For now, just log the action
    if (this.config.debugMode) {
      console.log(
        `🎮 Action: move(${action.movement.x.toFixed(2)}, ${action.movement.y.toFixed(2)}) aim(${action.aim.x.toFixed(0)}, ${action.aim.y.toFixed(0)}) shoot=${action.shooting}`,
      );
    }
  }

  private updatePerformanceStats(startTime: number): void {
    const elapsed = Date.now() - startTime;
    this.performanceStats.totalInferences++;
    this.performanceStats.totalTime += elapsed;

    // Update FPS every second
    const now = Date.now();
    if (now - this.performanceStats.lastFPSUpdate > 1000) {
      const fps = 1000 / (this.performanceStats.totalTime / this.performanceStats.totalInferences);
      this.performanceStats.averageFPS = fps;
      this.performanceStats.lastFPSUpdate = now;

      if (this.config.debugMode) {
        console.log(
          `📊 Performance: ${fps.toFixed(1)} FPS, avg inference: ${(this.performanceStats.totalTime / this.performanceStats.totalInferences).toFixed(1)}ms`,
        );
      }
    }
  }

  private logDebugInfo(action: GameAction, inferenceTime: number): void {
    console.log(
      `⏱️  ${inferenceTime}ms | 🎯 conf:${action.confidence.toFixed(2)} | 🏃 move:(${action.movement.x.toFixed(2)},${action.movement.y.toFixed(2)}) | 🎯 aim:(${action.aim.x.toFixed(0)},${action.aim.y.toFixed(0)}) | 💥 shoot:${action.shooting}`,
    );
  }

  public getPerformanceStats(): typeof this.performanceStats {
    return { ...this.performanceStats };
  }

  public getActionHistory(): GameAction[] {
    return [...this.actionHistory];
  }

  // Method to save recent gameplay for analysis
  public async saveGameplaySession(outputPath: string): Promise<void> {
    const session = {
      timestamp: new Date().toISOString(),
      config: this.config,
      performanceStats: this.performanceStats,
      actionHistory: this.actionHistory,
    };

    await fs.writeFile(outputPath, JSON.stringify(session, null, 2));
    console.log(`💾 Gameplay session saved to: ${outputPath}`);
  }
}

// CLI interface
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.log('Usage: ts-node realtime-inference.ts <model-path> [options]');
    console.log('');
    console.log('Options:');
    console.log('  --window <title>        Target window title');
    console.log('  --fps <number>          Target FPS (default: 10)');
    console.log('  --smoothing <number>    Action smoothing factor 0-1 (default: 0.3)');
    console.log('  --confidence <number>   Confidence threshold 0-1 (default: 0.3)');
    console.log('  --debug                 Enable debug output');
    console.log('');
    console.log('Example:');
    console.log('  ts-node realtime-inference.ts ./models/model --window myapp --fps 20 --debug');
    process.exit(1);
  }

  const config: InferenceConfig = {
    modelPath: args[0] ?? '',
    targetWindowTitle: '',
    inferenceIntervalMs: 100, // 10 FPS
    smoothingFactor: 0.3,
    confidenceThreshold: 0.3,
    debugMode: false,
  };

  // Parse options
  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case '--window':
        config.targetWindowTitle = args[++i] ?? '';
        break;
      case '--fps':
        config.inferenceIntervalMs = 1000 / parseInt(args[++i] ?? '10');
        break;
      case '--smoothing':
        config.smoothingFactor = parseFloat(args[++i] ?? '0.3');
        break;
      case '--confidence':
        config.confidenceThreshold = parseFloat(args[++i] ?? '0.3');
        break;
      case '--debug':
        config.debugMode = true;
        break;
    }
  }

  console.log('🎮 Real-time Inference Engine');
  console.log('Configuration:', config);

  const inference = new RealTimeInference(config);

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down...');
    inference.stopInference();

    // Save session data
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    void inference.saveGameplaySession(`gameplay_session_${timestamp}.json`).then(() => {
      process.exit(0);
    });
  });

  try {
    await inference.initialize();
    await inference.startInference();
  } catch (error) {
    console.error('❌ Inference failed:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Export for use as module
export { RealTimeInference, InferenceConfig, GameAction };

// Run CLI if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
