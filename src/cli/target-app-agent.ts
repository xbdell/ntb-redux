#!/usr/bin/env ts-node

import type { InferenceConfig, GameAction } from './realtime-inference.js';
import { RealTimeInference } from './realtime-inference.js';
import type { ControllerConfig } from './game-controller.js';
import { SafeGameController } from './game-controller.js';
import { promises as fs } from 'fs';
import { spawn } from 'child_process';
import { join } from 'path';
import { loadConfig, getResolvedPaths } from '../shared/config.js';

interface AIConfig {
  modelPath: string;
  targetWindowTitle: string;
  targetFPS: number;
  enableController: boolean;
  safetyMode: boolean;
  performance: {
    smoothingFactor: number;
    confidenceThreshold: number;
    deadZone: number;
    mouseSpeed: number;
  };
  debug: {
    enabled: boolean;
    logActions: boolean;
    saveSession: boolean;
  };
}

class TargetAppAgent {
  private inference: RealTimeInference;
  private controller: SafeGameController;
  private config: AIConfig;
  private isRunning = false;
  private targetWindowId: string | null = null;
  private sessionStartTime = Date.now();
  private actionCount = 0;

  constructor(config: AIConfig) {
    this.config = config;

    // Initialize inference engine
    const inferenceConfig: InferenceConfig = {
      modelPath: config.modelPath,
      targetWindowTitle: config.targetWindowTitle,
      inferenceIntervalMs: 1000 / config.targetFPS,
      smoothingFactor: config.performance.smoothingFactor,
      confidenceThreshold: config.performance.confidenceThreshold,
      debugMode: config.debug.enabled,
    };

    this.inference = new RealTimeInference(inferenceConfig);

    // Initialize controller
    const controllerConfig: ControllerConfig = {
      deadZone: config.performance.deadZone,
      mouseSpeed: config.performance.mouseSpeed,
      keyPressDelay: 50,
      smoothMouse: true,
      debugMode: config.debug.logActions,
    };

    this.controller = new SafeGameController(controllerConfig);
  }

  public async initialize(): Promise<void> {
    console.log('🤖 Initializing Target App Agent...');
    console.log(`📁 Model: ${this.config.modelPath}`);
    console.log(`🎯 Target FPS: ${this.config.targetFPS}`);
    console.log(`🎮 Controller: ${this.config.enableController ? 'ENABLED' : 'DISABLED'}`);
    console.log(`🛡️  Safety mode: ${this.config.safetyMode ? 'ON' : 'OFF'}`);

    // Install dependencies check
    await this.checkDependencies();

    // Initialize components
    await this.inference.initialize();
    await this.controller.initialize();

    // Find target window
    await this.findTargetWindow();

    console.log('✅ Target App Agent initialized successfully!');
    console.log('');
    console.log('🎮 Controls:');
    console.log('  - Ctrl+C: Stop AI');
    console.log('  - The AI will start playing automatically');
    console.log('');

    if (!this.config.enableController) {
      console.log('⚠️  Controller disabled - AI will only predict actions without executing them');
    }
  }

  private async checkDependencies(): Promise<void> {
    console.log('🔧 Checking dependencies...');

    // Check if xdotool is installed
    try {
      const xdotool = spawn('xdotool', ['version']);

      await new Promise((resolve, reject) => {
        xdotool.on('close', (code: number | null) => {
          if (code === 0) {
            resolve(void 0);
          } else {
            reject(new Error('xdotool not found'));
          }
        });
        xdotool.on('error', reject);
      });

      console.log('✅ xdotool found');
    } catch {
      throw new Error('xdotool is required but not found. Install with: sudo apt install xdotool');
    }
  }

  private async findTargetWindow(): Promise<void> {
    // Get the window ID from the inference engine (which already found it)
    this.targetWindowId = this.inference.getTargetWindowId();

    if (!this.targetWindowId) {
      throw new Error(
        `Target window not found: ${this.config.targetWindowTitle}\nMake sure the target application is running!`,
      );
    }
  }

  public async start(): Promise<void> {
    if (this.isRunning) {
      console.log('⚠️  AI already running');
      return;
    }

    if (!this.targetWindowId) {
      throw new Error('Target window not found');
    }

    console.log('🚀 Starting Target App Agent...');
    console.log('🎯 The AI will now control the application!');

    this.isRunning = true;
    this.sessionStartTime = Date.now();
    this.actionCount = 0;

    // Main AI loop with integrated inference and control
    while (this.isRunning) {
      const loopStartTime = Date.now();

      try {
        // Get action from inference engine
        const action = await this.getNextAction();

        if (!action) {
          // Skip this frame if prediction failed
          continue;
        }

        // Execute action if controller is enabled
        if (this.config.enableController && this.targetWindowId) {
          await this.controller.executeAction(action, this.targetWindowId);
          this.actionCount++;
        }

        // Log debug info
        if (this.config.debug.enabled) {
          this.logAIState(action, Date.now() - loopStartTime);
        }

        // Wait for next frame
        const elapsed = Date.now() - loopStartTime;
        const frameTime = 1000 / this.config.targetFPS;
        const waitTime = Math.max(0, frameTime - elapsed);

        if (waitTime > 0) {
          await new Promise((resolve) => setTimeout(resolve, waitTime));
        }
      } catch (error) {
        console.error('❌ AI loop error:', error instanceof Error ? error.message : String(error));

        if (this.config.safetyMode) {
          console.log('🛡️  Safety mode: stopping AI due to error');
          await this.emergencyStop();
          break;
        }

        // Brief pause before retrying
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    console.log('🛑 Target App Agent stopped');
  }

  private async getNextAction(): Promise<GameAction | null> {
    try {
      // Get real prediction from inference engine
      const action = await this.inference.predictOnce();
      return action;
    } catch (error) {
      console.error('❌ Prediction failed:', error instanceof Error ? error.message : String(error));
      return null;
    }
  }

  public async stop(): Promise<void> {
    if (!this.isRunning) return;

    console.log('🛑 Stopping Target App Agent...');
    this.isRunning = false;

    // Emergency stop controller
    await this.controller.emergencyStop();

    // Save session if enabled
    if (this.config.debug.saveSession) {
      await this.saveSession();
    }

    // Cleanup
    this.controller.destroy();

    this.logSessionSummary();
  }

  public async emergencyStop(): Promise<void> {
    console.log('🚨 EMERGENCY STOP');
    await this.controller.emergencyStop();
    this.isRunning = false;
  }

  private logAIState(action: GameAction, processingTime: number): void {
    const runtime = ((Date.now() - this.sessionStartTime) / 1000).toFixed(1);
    console.log(
      `[${runtime}s] ⚡${processingTime}ms | 🎯${action.confidence.toFixed(2)} | 🏃(${action.movement.x.toFixed(2)},${action.movement.y.toFixed(2)}) | 🎯(${action.aim.x.toFixed(0)},${action.aim.y.toFixed(0)}) | 💥${action.shooting ? '🔥' : '⭕'}`,
    );
  }

  private logSessionSummary(): void {
    const duration = (Date.now() - this.sessionStartTime) / 1000;
    const actionsPerSecond = this.actionCount / duration;

    console.log('\n📊 Session Summary:');
    console.log(`  Duration: ${duration.toFixed(1)}s`);
    console.log(`  Actions executed: ${this.actionCount}`);
    console.log(`  Average APS: ${actionsPerSecond.toFixed(1)}`);
    console.log(`  Controller enabled: ${this.config.enableController}`);
  }

  private async saveSession(): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const sessionData = {
      config: this.config,
      sessionStartTime: this.sessionStartTime,
      duration: Date.now() - this.sessionStartTime,
      actionCount: this.actionCount,
      performanceStats: this.inference.getPerformanceStats(),
      actionHistory: this.inference.getActionHistory().slice(-100), // Last 100 actions
    };

    const filename = `agent_session_${timestamp}.json`;
    await fs.writeFile(filename, JSON.stringify(sessionData, null, 2));
    console.log(`💾 Session saved: ${filename}`);
  }
}

// CLI interface
async function main(): Promise<void> {
  // Load app configuration
  const appConfig = loadConfig();
  const resolvedPaths = getResolvedPaths(appConfig);

  const args = process.argv.slice(2);

  // Use config paths as defaults
  let modelPath = join(resolvedPaths.models, 'model');

  // If positional arg provided, use it
  if (args.length >= 1 && !args[0]?.startsWith('--')) {
    modelPath = args[0] ?? modelPath;
  }

  const config: AIConfig = {
    modelPath,
    targetWindowTitle: appConfig.collection.targetWindowName,
    targetFPS: appConfig.inference.defaultFps,
    enableController: true,
    safetyMode: true,
    performance: {
      smoothingFactor: appConfig.inference.defaultSmoothingFactor,
      confidenceThreshold: 0.4,
      deadZone: 0.1,
      mouseSpeed: 0.8,
    },
    debug: {
      enabled: false,
      logActions: false,
      saveSession: false,
    },
  };

  // Parse options
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--window':
        config.targetWindowTitle = args[++i] ?? '';
        break;
      case '--fps':
        config.targetFPS = parseInt(args[++i] ?? '20');
        break;
      case '--no-controller':
        config.enableController = false;
        break;
      case '--no-safety':
        config.safetyMode = false;
        break;
      case '--smoothing':
        config.performance.smoothingFactor = parseFloat(args[++i] ?? '0.3');
        break;
      case '--confidence':
        config.performance.confidenceThreshold = parseFloat(args[++i] ?? '0.3');
        break;
      case '--dead-zone':
        config.performance.deadZone = parseFloat(args[++i] ?? '0.1');
        break;
      case '--mouse-speed':
        config.performance.mouseSpeed = parseFloat(args[++i] ?? '1.5');
        break;
      case '--debug':
        config.debug.enabled = true;
        config.debug.logActions = true;
        break;
      case '--save-session':
        config.debug.saveSession = true;
        break;
      case '--help':
        console.log('Target App Agent - Autonomous Application Control');
        console.log('');
        console.log('Usage: ts-node target-app-agent.ts [model-path] [options]');
        console.log('');
        console.log('Model path defaults to models/model from config.');
        console.log('');
        console.log('Options:');
        console.log('  --window <title>        Target window title (from config by default)');
        console.log('  --fps <number>          Target FPS (default: 20)');
        console.log('  --no-controller         Disable controller (prediction only)');
        console.log('  --no-safety             Disable safety mode');
        console.log('  --smoothing <number>    Action smoothing 0-1 (default: 0.3)');
        console.log('  --confidence <number>   Confidence threshold 0-1 (default: 0.4)');
        console.log('  --dead-zone <number>    Movement dead zone 0-1 (default: 0.1)');
        console.log('  --mouse-speed <number>  Mouse speed multiplier (default: 0.8)');
        console.log('  --debug                 Enable debug mode');
        console.log('  --save-session          Save session data');
        console.log('  --help                  Show this help message');
        console.log('');
        console.log('Examples:');
        console.log('  ts-node target-app-agent.ts --fps 30 --debug');
        console.log('  ts-node target-app-agent.ts --no-controller --debug');
        process.exit(0);
    }
  }

  console.log('🎮 Target App Agent v1.0');
  console.log('========================================');

  const ai = new TargetAppAgent(config);

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🛑 Received interrupt signal...');
    void ai.stop().then(() => process.exit(0));
  });

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    console.error('\n💥 Uncaught exception:', error);
    void ai.emergencyStop().then(() => process.exit(1));
  });

  try {
    await ai.initialize();
    await ai.start();
  } catch (error) {
    console.error('❌ AI failed to start:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Export for use as module
export { TargetAppAgent, AIConfig };

// Run CLI if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
