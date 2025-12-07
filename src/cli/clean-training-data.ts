#!/usr/bin/env ts-node

/**
 * Training Data Cleaner
 *
 * Processes video-based training data sessions:
 * 1. Extracts frames from video.mp4
 * 2. Parses events from events.jsonl
 * 3. Aligns events to frames by timestamp
 * 4. Converts to TensorFlow.js training format
 */

import { promises as fs } from 'fs';
import { join, basename } from 'path';
import { fileURLToPath } from 'url';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { loadConfig, getResolvedPaths } from '../shared/config.js';
import {
  extractFrames,
  getFrameTimeWindow,
  type ExtractedFrame,
  type ExtractionResult,
} from './frame-extractor.js';

// ============================================================================
// Types
// ============================================================================

interface CleaningConfig {
  inputDir: string;
  outputDir: string;
  validationSplit: number;
  testSplit: number;
  minInputEvents: number;
  maxMouseJump: number;
  /** Skip frame extraction if frames already exist */
  skipExistingFrames: boolean;
}

/** Session metadata from video-data-collector (metadata.json) */
interface SessionMetadata {
  sessionId: string;
  timestamp: number;
  targetWindow: string;
  display: {
    monitorName: string;
    resolution: { width: number; height: number };
    refreshRate: number;
    fullscreen: boolean;
  };
  video: {
    filename: string;
    codec: string;
    recordingFramerate: number;
    displayFramerate: number;
    resolution: { width: number; height: number };
  };
  events: {
    filename: string;
    count: number;
  };
  duration: number;
  fileSize?: {
    video: number;
    events: number;
  };
}

/** Raw event from events.jsonl */
interface RawEvent {
  timestamp: number;
  type: 'keyboard' | 'mouse';
  action: 'press' | 'release' | 'move';
  key?: string;
  button?: string;
  x?: number;
  y?: number;
}

/** Processed frame with aligned events */
interface ProcessedFrame {
  frameIndex: number;
  timestamp: number;
  screenshotPath: string;
  events: RawEvent[];
  /** Keyboard state at this frame (keys currently held down) */
  keyboardState: Set<string>;
  /** Mouse state at this frame */
  mouseState: {
    x: number;
    y: number;
    leftButton: boolean;
    rightButton: boolean;
  };
}

/** Video session ready for processing */
interface VideoSession {
  dir: string;
  metadata: SessionMetadata;
  videoPath: string;
  eventsPath: string;
}

/** Final training sample format */
interface TrainingSample {
  screenshot: string;
  outputs: {
    movement_x: number;
    movement_y: number;
    aim_x: number;
    aim_y: number;
    shooting: number;
  };
  timestamp: number;
}

// ============================================================================
// Main Cleaner Class
// ============================================================================

class TrainingDataCleaner {
  private config: CleaningConfig;
  private globalFrameCounter = 0;

  constructor(config: CleaningConfig) {
    this.config = config;
  }

  public async clean(): Promise<void> {
    console.log('🧹 Starting training data cleaning process...');
    console.log(`Input directory: ${this.config.inputDir}`);
    console.log(`Output directory: ${this.config.outputDir}`);

    // Find all video sessions
    const sessions = await this.findVideoSessions();
    console.log(`Found ${sessions.length} video sessions\n`);

    if (sessions.length === 0) {
      console.log('No sessions found. Make sure you have recorded sessions in the training_data directory.');
      console.log('Each session should contain: metadata.json, video.mp4, events.jsonl');
      return;
    }

    // Create output directory structure
    await this.createOutputDirectories();

    // Process each session
    const allSamples: TrainingSample[] = [];
    let totalFrames = 0;
    let validFrames = 0;

    for (const session of sessions) {
      console.log(`\n📁 Processing session: ${basename(session.dir)}`);
      console.log(`   Duration: ${session.metadata.duration.toFixed(1)}s`);
      console.log(`   Framerate: ${session.metadata.video.recordingFramerate}fps`);
      console.log(`   Events: ${session.metadata.events.count}`);

      try {
        const { samples, rawCount, validCount } = await this.processSession(session);
        allSamples.push(...samples);
        totalFrames += rawCount;
        validFrames += validCount;

        console.log(`   Extracted frames: ${rawCount}`);
        console.log(`   Valid frames: ${validCount}`);
        console.log(`   Filtered out: ${rawCount - validCount}`);
      } catch (error) {
        console.error(`   ❌ Error processing session: ${error}`);
      }
    }

    if (allSamples.length === 0) {
      console.log('\n❌ No valid samples generated. Check your session data.');
      return;
    }

    console.log('\n📊 Overall Statistics:');
    console.log(`  Total frames processed: ${totalFrames}`);
    console.log(`  Valid frames kept: ${validFrames}`);
    console.log(`  Filter rate: ${((1 - validFrames / totalFrames) * 100).toFixed(1)}%`);

    // Split data into train/val/test sets
    const splits = this.splitData(allSamples);

    console.log('\n📂 Data splits:');
    console.log(`  Training: ${splits.train.length} samples`);
    console.log(`  Validation: ${splits.val.length} samples`);
    console.log(`  Test: ${splits.test.length} samples`);

    // Export data in TensorFlow.js format
    await this.exportForTensorFlow(splits);

    console.log('\n✅ Training data cleaning completed successfully!');
  }

  /**
   * Find all video sessions in the input directory
   */
  private async findVideoSessions(): Promise<VideoSession[]> {
    const sessions: VideoSession[] = [];

    try {
      const entries = await fs.readdir(this.config.inputDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.startsWith('session_')) {
          const sessionDir = join(this.config.inputDir, entry.name);

          // Check for new video-based format (metadata.json)
          const metadataPath = join(sessionDir, 'metadata.json');
          const videoPath = join(sessionDir, 'video.mp4');
          const eventsPath = join(sessionDir, 'events.jsonl');

          try {
            // Verify all required files exist
            await Promise.all([
              fs.access(metadataPath),
              fs.access(videoPath),
              fs.access(eventsPath),
            ]);

            const metadata = JSON.parse(
              await fs.readFile(metadataPath, 'utf8'),
            ) as SessionMetadata;

            sessions.push({
              dir: sessionDir,
              metadata,
              videoPath,
              eventsPath,
            });
          } catch {
            // Try legacy format (collection_metadata.json)
            const legacyPath = join(sessionDir, 'collection_metadata.json');
            try {
              await fs.access(legacyPath);
              console.log(`  ⚠️  Skipping ${entry.name}: legacy format not supported`);
              console.log(`      Please re-record using the new video-based collector`);
            } catch {
              console.log(`  ⚠️  Skipping ${entry.name}: missing required files`);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error reading input directory:', error);
    }

    return sessions;
  }

  /**
   * Create output directory structure
   */
  private async createOutputDirectories(): Promise<void> {
    const dirs = [
      this.config.outputDir,
      join(this.config.outputDir, 'screenshots'),
    ];

    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  /**
   * Process a single video session
   */
  private async processSession(session: VideoSession): Promise<{
    samples: TrainingSample[];
    rawCount: number;
    validCount: number;
  }> {
    // Step 1: Extract frames from video
    const framesDir = join(session.dir, 'frames');
    let extractionResult: ExtractionResult;

    // Check if frames already exist
    const framesExist = await this.checkFramesExist(framesDir);

    if (framesExist && this.config.skipExistingFrames) {
      console.log('   Using existing extracted frames...');
      extractionResult = await this.loadExistingFrames(framesDir, session.metadata);
    } else {
      console.log('   Extracting frames from video...');
      extractionResult = await extractFrames(
        {
          videoPath: session.videoPath,
          outputDir: framesDir,
          framerate: session.metadata.video.recordingFramerate,
          sessionStartTime: session.metadata.timestamp,
        },
        (progress) => {
          if (progress.currentFrame % 100 === 0) {
            process.stdout.write(`\r   Progress: ${progress.percentComplete}% (${progress.currentFrame} frames)`);
          }
        },
      );
      console.log(''); // New line after progress
    }

    // Step 2: Parse events from JSONL
    console.log('   Parsing events...');
    const events = await this.parseEvents(session.eventsPath);

    // Step 3: Align events to frames
    console.log('   Aligning events to frames...');
    const processedFrames = this.alignEventsToFrames(
      extractionResult.frames,
      events,
      extractionResult.framerate,
      session.metadata.timestamp,
    );

    // Step 4: Filter frames
    const validFrames = this.filterFrames(processedFrames);

    // Step 5: Copy valid frames to output and create samples
    console.log('   Creating training samples...');
    const samples = await this.createSamples(validFrames, session.metadata);

    return {
      samples,
      rawCount: extractionResult.frameCount,
      validCount: validFrames.length,
    };
  }

  /**
   * Check if extracted frames already exist
   */
  private async checkFramesExist(framesDir: string): Promise<boolean> {
    try {
      const files = await fs.readdir(framesDir);
      return files.some((f) => f.startsWith('frame_') && f.endsWith('.png'));
    } catch {
      return false;
    }
  }

  /**
   * Load existing extracted frames
   */
  private async loadExistingFrames(
    framesDir: string,
    metadata: SessionMetadata,
  ): Promise<ExtractionResult> {
    const files = await fs.readdir(framesDir);
    const frameFiles = files
      .filter((f) => f.startsWith('frame_') && f.endsWith('.png'))
      .sort();

    const frameDurationMs = 1000 / metadata.video.recordingFramerate;

    const frames: ExtractedFrame[] = frameFiles.map((filename, index) => ({
      index,
      timestamp: Math.round(metadata.timestamp + index * frameDurationMs),
      path: join(framesDir, filename),
      filename,
    }));

    return {
      frameCount: frames.length,
      frames,
      outputDir: framesDir,
      extractionTimeMs: 0,
      framerate: metadata.video.recordingFramerate,
    };
  }

  /**
   * Parse events from JSONL file
   */
  private async parseEvents(eventsPath: string): Promise<RawEvent[]> {
    const events: RawEvent[] = [];

    const fileStream = createReadStream(eventsPath);
    const rl = createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      if (line.trim()) {
        try {
          const event = JSON.parse(line) as RawEvent;
          events.push(event);
        } catch {
          // Skip malformed lines
        }
      }
    }

    return events;
  }

  /**
   * Align events to frames based on timestamps
   */
  private alignEventsToFrames(
    frames: ExtractedFrame[],
    events: RawEvent[],
    framerate: number,
    sessionStartTime: number,
  ): ProcessedFrame[] {
    const processedFrames: ProcessedFrame[] = [];

    // Sort events by timestamp
    const sortedEvents = [...events].sort((a, b) => a.timestamp - b.timestamp);

    // Track keyboard and mouse state across frames
    const keyboardState = new Set<string>();
    let mouseState = {
      x: 0,
      y: 0,
      leftButton: false,
      rightButton: false,
    };

    let eventIndex = 0;

    for (const frame of frames) {
      const timeWindow = getFrameTimeWindow(frame.index, framerate, sessionStartTime);
      const frameEvents: RawEvent[] = [];

      // Collect all events within this frame's time window
      while (eventIndex < sortedEvents.length) {
        const event = sortedEvents[eventIndex]!;

        if (event.timestamp < timeWindow.start) {
          // Event is before this frame - update state but don't include in frame events
          this.updateState(event, keyboardState, mouseState);
          eventIndex++;
        } else if (event.timestamp < timeWindow.end) {
          // Event is within this frame's window
          frameEvents.push(event);
          this.updateState(event, keyboardState, mouseState);
          eventIndex++;
        } else {
          // Event is after this frame - stop processing
          break;
        }
      }

      processedFrames.push({
        frameIndex: frame.index,
        timestamp: frame.timestamp,
        screenshotPath: frame.path,
        events: frameEvents,
        keyboardState: new Set(keyboardState),
        mouseState: { ...mouseState },
      });
    }

    return processedFrames;
  }

  /**
   * Update keyboard and mouse state based on an event
   */
  private updateState(
    event: RawEvent,
    keyboardState: Set<string>,
    mouseState: { x: number; y: number; leftButton: boolean; rightButton: boolean },
  ): void {
    if (event.type === 'keyboard') {
      if (event.action === 'press' && event.key) {
        keyboardState.add(event.key.toLowerCase());
      } else if (event.action === 'release' && event.key) {
        keyboardState.delete(event.key.toLowerCase());
      }
    } else if (event.type === 'mouse') {
      if (event.x !== undefined) mouseState.x = event.x;
      if (event.y !== undefined) mouseState.y = event.y;

      if (event.action === 'press') {
        if (event.button === 'left') mouseState.leftButton = true;
        if (event.button === 'right') mouseState.rightButton = true;
      } else if (event.action === 'release') {
        if (event.button === 'left') mouseState.leftButton = false;
        if (event.button === 'right') mouseState.rightButton = false;
      }
    }
  }

  /**
   * Filter frames based on quality criteria
   */
  private filterFrames(frames: ProcessedFrame[]): ProcessedFrame[] {
    return frames.filter((frame, index) => {
      // Check minimum events (including carried-over state)
      const hasActivity =
        frame.events.length >= this.config.minInputEvents ||
        frame.keyboardState.size > 0 ||
        frame.mouseState.leftButton ||
        frame.mouseState.rightButton;

      if (!hasActivity) {
        return false;
      }

      // Check for erratic mouse movements
      if (index > 0) {
        const prevFrame = frames[index - 1]!;
        const dx = Math.abs(frame.mouseState.x - prevFrame.mouseState.x);
        const dy = Math.abs(frame.mouseState.y - prevFrame.mouseState.y);

        if (dx > this.config.maxMouseJump || dy > this.config.maxMouseJump) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Create training samples from processed frames
   */
  private async createSamples(
    frames: ProcessedFrame[],
    metadata: SessionMetadata,
  ): Promise<TrainingSample[]> {
    const samples: TrainingSample[] = [];
    const screenshotDir = join(this.config.outputDir, 'screenshots');

    for (const frame of frames) {
      // Copy frame to output directory with global unique name
      const newFilename = `frame_${this.globalFrameCounter.toString().padStart(8, '0')}.png`;
      const destPath = join(screenshotDir, newFilename);

      try {
        await fs.copyFile(frame.screenshotPath, destPath);
      } catch (error) {
        console.warn(`   Failed to copy frame: ${frame.screenshotPath}`);
        continue;
      }

      // Extract actions from frame state
      const actions = this.extractActions(frame, metadata);

      samples.push({
        screenshot: `screenshots/${newFilename}`,
        outputs: actions,
        timestamp: frame.timestamp,
      });

      this.globalFrameCounter++;
    }

    return samples;
  }

  /**
   * Extract action outputs from a processed frame
   */
  private extractActions(
    frame: ProcessedFrame,
    metadata: SessionMetadata,
  ): TrainingSample['outputs'] {
    // Convert WASD to movement vector
    let moveX = 0;
    let moveY = 0;

    if (frame.keyboardState.has('a')) moveX -= 1;
    if (frame.keyboardState.has('d')) moveX += 1;
    if (frame.keyboardState.has('w')) moveY -= 1;
    if (frame.keyboardState.has('s')) moveY += 1;

    // Normalize diagonal movement
    if (moveX !== 0 || moveY !== 0) {
      const magnitude = Math.sqrt(moveX * moveX + moveY * moveY);
      moveX /= magnitude;
      moveY /= magnitude;
    }

    // Normalize mouse position to [0, 1] range
    const screenWidth = metadata.display.resolution.width;
    const screenHeight = metadata.display.resolution.height;
    const normalizedAimX = Math.max(0, Math.min(1, frame.mouseState.x / screenWidth));
    const normalizedAimY = Math.max(0, Math.min(1, frame.mouseState.y / screenHeight));

    return {
      movement_x: moveX,
      movement_y: moveY,
      aim_x: normalizedAimX,
      aim_y: normalizedAimY,
      shooting: frame.mouseState.leftButton ? 1 : 0,
    };
  }

  /**
   * Split data into train/validation/test sets
   */
  private splitData(data: TrainingSample[]): {
    train: TrainingSample[];
    val: TrainingSample[];
    test: TrainingSample[];
  } {
    // Shuffle data
    const shuffled = [...data].sort(() => Math.random() - 0.5);

    const trainSize = Math.floor(
      shuffled.length * (1 - this.config.validationSplit - this.config.testSplit),
    );
    const valSize = Math.floor(shuffled.length * this.config.validationSplit);

    return {
      train: shuffled.slice(0, trainSize),
      val: shuffled.slice(trainSize, trainSize + valSize),
      test: shuffled.slice(trainSize + valSize),
    };
  }

  /**
   * Export data in TensorFlow.js format
   */
  private async exportForTensorFlow(splits: {
    train: TrainingSample[];
    val: TrainingSample[];
    test: TrainingSample[];
  }): Promise<void> {
    console.log('\n🔄 Creating TensorFlow.js datasets...');

    // Save dataset info
    const datasetInfo = {
      format: 'tensorflow_js',
      version: '2.0', // New video-based format
      created: new Date().toISOString(),
      splits: {
        train: splits.train.length,
        validation: splits.val.length,
        test: splits.test.length,
      },
      config: {
        validationSplit: this.config.validationSplit,
        testSplit: this.config.testSplit,
        minInputEvents: this.config.minInputEvents,
        maxMouseJump: this.config.maxMouseJump,
      },
      outputs: {
        movement_x: { type: 'continuous', range: [-1, 1], description: 'Horizontal movement (A/D)' },
        movement_y: { type: 'continuous', range: [-1, 1], description: 'Vertical movement (W/S)' },
        aim_x: { type: 'continuous', range: [0, 1], description: 'Normalized mouse X position' },
        aim_y: { type: 'continuous', range: [0, 1], description: 'Normalized mouse Y position' },
        shooting: { type: 'binary', range: [0, 1], description: 'Left mouse button pressed' },
      },
    };

    await fs.writeFile(
      join(this.config.outputDir, 'dataset_info.json'),
      JSON.stringify(datasetInfo, null, 2),
    );

    // Save each split
    for (const [name, data] of Object.entries(splits)) {
      console.log(`  Creating ${name} dataset (${data.length} samples)...`);

      const dataset = { samples: data };

      await fs.writeFile(
        join(this.config.outputDir, `${name}_data.json`),
        JSON.stringify(dataset, null, 2),
      );
    }
  }
}

// ============================================================================
// CLI Interface
// ============================================================================

async function main(): Promise<void> {
  // Load app configuration
  const appConfig = loadConfig();
  const resolvedPaths = getResolvedPaths(appConfig);

  const args = process.argv.slice(2);

  // Use config paths as defaults, allow override via CLI args
  let inputDir = resolvedPaths.trainingData;
  let outputDir = resolvedPaths.cleanedData;

  // If positional args are provided, use them
  if (args.length >= 1 && !args[0]?.startsWith('--')) {
    inputDir = args[0] ?? inputDir;
  }
  if (args.length >= 2 && !args[1]?.startsWith('--')) {
    outputDir = args[1] ?? outputDir;
  }

  const config: CleaningConfig = {
    inputDir,
    outputDir,
    validationSplit: 0.2,
    testSplit: 0.1,
    minInputEvents: 0, // Allow frames with just keyboard state
    maxMouseJump: 200,
    skipExistingFrames: true,
  };

  // Parse options
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--val-split':
        config.validationSplit = parseFloat(args[++i] ?? '0.2');
        break;
      case '--test-split':
        config.testSplit = parseFloat(args[++i] ?? '0.1');
        break;
      case '--min-events':
        config.minInputEvents = parseInt(args[++i] ?? '0');
        break;
      case '--max-jump':
        config.maxMouseJump = parseInt(args[++i] ?? '200');
        break;
      case '--force-extract':
        config.skipExistingFrames = false;
        break;
      case '--help':
        console.log('Usage: npx ts-node clean-training-data.ts [input-dir] [output-dir] [options]');
        console.log('');
        console.log('Processes video-based training sessions into TensorFlow.js format.');
        console.log('');
        console.log('Paths default to values from ntb-config.json if not specified.');
        console.log('');
        console.log('Options:');
        console.log('  --val-split <num>    Validation split ratio (default: 0.2)');
        console.log('  --test-split <num>   Test split ratio (default: 0.1)');
        console.log('  --min-events <num>   Minimum input events per frame (default: 0)');
        console.log('  --max-jump <num>     Maximum mouse jump in pixels (default: 200)');
        console.log('  --force-extract      Re-extract frames even if they exist');
        console.log('  --help               Show this help message');
        process.exit(0);
    }
  }

  console.log('📋 Configuration:');
  console.log(`  Input: ${config.inputDir}`);
  console.log(`  Output: ${config.outputDir}`);
  console.log(`  Validation split: ${(config.validationSplit * 100).toFixed(1)}%`);
  console.log(`  Test split: ${(config.testSplit * 100).toFixed(1)}%`);
  console.log(`  Training split: ${((1 - config.validationSplit - config.testSplit) * 100).toFixed(1)}%`);
  console.log(`  Min input events: ${config.minInputEvents}`);
  console.log(`  Max mouse jump: ${config.maxMouseJump}px`);
  console.log(`  Skip existing frames: ${config.skipExistingFrames}`);
  console.log('');

  try {
    const cleaner = new TrainingDataCleaner(config);
    await cleaner.clean();
  } catch (error) {
    console.error('❌ Error cleaning training data:', error);
    process.exit(1);
  }
}

// Run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main();
}

export { TrainingDataCleaner, CleaningConfig };
