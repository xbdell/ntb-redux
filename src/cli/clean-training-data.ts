#!/usr/bin/env ts-node

import { promises as fs } from 'fs';
import { join, basename } from 'path';
import { fileURLToPath } from 'url';

interface CleaningConfig {
  inputDir: string;
  outputDir: string;
  validationSplit: number;
  testSplit: number;
  minInputEvents: number;
  maxMouseJump: number;
}

interface CollectionMetadata {
  collectionInfo: {
    startTime: string;
    endTime: string;
    duration: number;
    dataPointsCollected: number;
    windowTitle: string;
  };
  dataPoints: TrainingDataFrame[];
}

interface TrainingDataFrame {
  timestamp: number;
  inputEvents?: InputEvent[];
  screenshotFile?: string;
  screenshotPath?: string;
}

interface InputEvent {
  type: 'keyboard' | 'mouse' | 'mousemove';
  action?: 'press' | 'release' | 'move';
  key?: string;
  button?: string;
  x?: number;
  y?: number;
}

interface TrainingSession {
  dir: string;
  metadata: CollectionMetadata['collectionInfo'];
  dataFile: string;
}

class TrainingDataCleaner {
  private config: CleaningConfig;

  constructor(config: CleaningConfig) {
    this.config = config;
  }

  public async clean(): Promise<void> {
    console.log('🧹 Starting training data cleaning process...');
    console.log(`Input directory: ${this.config.inputDir}`);
    console.log(`Output directory: ${this.config.outputDir}`);

    // Find all training sessions
    const sessions = await this.findTrainingSessions();
    console.log(`Found ${sessions.length} training sessions\n`);

    // Create output directory structure
    await this.createOutputDirectories();

    // Process each session
    let totalFrames = 0;
    let validFrames = 0;

    for (const session of sessions) {
      console.log(`📁 Processing session: ${basename(session.dir)}`);

      const { rawData, filteredData } = await this.processSession(session);
      totalFrames += rawData.length;
      validFrames += filteredData.length;

      console.log(`  Raw frames: ${rawData.length}`);
      console.log(`  Valid frames: ${filteredData.length}`);
      console.log(`  Filtered out: ${rawData.length - filteredData.length}\n`);
    }

    console.log('📊 Overall Statistics:');
    console.log(`  Total frames processed: ${totalFrames}`);
    console.log(`  Valid frames kept: ${validFrames}`);
    console.log(`  Filter rate: ${((1 - validFrames / totalFrames) * 100).toFixed(1)}%\n`);

    // Split data into train/val/test sets
    const allData = await this.loadAllProcessedData();
    const splits = this.splitData(allData);

    console.log('📂 Data splits:');
    console.log(`  Training: ${splits.train.length} frames`);
    console.log(`  Validation: ${splits.val.length} frames`);
    console.log(`  Test: ${splits.test.length} frames\n`);

    // Export data in TensorFlow.js format
    await this.exportForTensorFlow(splits);

    console.log('✅ Training data cleaning completed successfully!');
  }

  private async findTrainingSessions(): Promise<TrainingSession[]> {
    const sessions: TrainingSession[] = [];

    try {
      const entries = await fs.readdir(this.config.inputDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.startsWith('session_')) {
          const sessionDir = join(this.config.inputDir, entry.name);
          const metadataPath = join(sessionDir, 'collection_metadata.json');

          try {
            const metadata = JSON.parse(
              await fs.readFile(metadataPath, 'utf8'),
            ) as CollectionMetadata;

            sessions.push({
              dir: sessionDir,
              metadata: metadata.collectionInfo,
              dataFile: metadataPath, // The data is in the metadata file
            });
          } catch {
            console.log(`  ⚠️  Skipping ${entry.name}: unable to read metadata`);
          }
        }
      }
    } catch (error) {
      console.error('Error reading input directory:', error);
    }

    return sessions;
  }

  private async createOutputDirectories(): Promise<void> {
    const dirs = [this.config.outputDir, join(this.config.outputDir, 'screenshots')];

    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  private async processSession(session: TrainingSession): Promise<{
    rawData: TrainingDataFrame[];
    filteredData: TrainingDataFrame[];
  }> {
    const fullData = JSON.parse(await fs.readFile(session.dataFile, 'utf8')) as CollectionMetadata;
    const gameData = fullData.dataPoints || [];

    // Filter frames with sufficient input events
    const filteredData = gameData.filter((frame: TrainingDataFrame) => {
      if (!frame.inputEvents || frame.inputEvents.length < this.config.minInputEvents) {
        return false;
      }

      // Check for erratic mouse movements
      const mouseEvents = frame.inputEvents.filter((e: InputEvent) => e.type === 'mousemove');
      for (let i = 1; i < mouseEvents.length; i++) {
        const dx = Math.abs((mouseEvents[i].x ?? 0) - (mouseEvents[i - 1].x ?? 0));
        const dy = Math.abs((mouseEvents[i].y ?? 0) - (mouseEvents[i - 1].y ?? 0));
        if (dx > this.config.maxMouseJump || dy > this.config.maxMouseJump) {
          return false;
        }
      }

      return true;
    });

    return {
      rawData: gameData,
      filteredData,
    };
  }

  private async copyScreenshots(data: TrainingDataFrame[]): Promise<void> {
    const screenshotDir = join(this.config.outputDir, 'screenshots');

    for (const frame of data) {
      if (frame.screenshotFile) {
        const sourcePath = frame.screenshotFile;
        const filename = basename(sourcePath);
        const destPath = join(screenshotDir, filename);

        try {
          await fs.copyFile(sourcePath, destPath);
          // Update path to relative
          frame.screenshotPath = `screenshots/${filename}`;
        } catch {
          console.warn(`Failed to copy screenshot: ${sourcePath}`);
        }
      }
    }
  }

  private async loadAllProcessedData(): Promise<TrainingDataFrame[]> {
    const allData: TrainingDataFrame[] = [];
    const sessions = await this.findTrainingSessions();

    for (const session of sessions) {
      const { filteredData } = await this.processSession(session);

      // First copy screenshots
      await this.copyScreenshots(filteredData);

      // Add filtered data with updated screenshot paths
      for (const frame of filteredData) {
        allData.push(frame);
      }
    }

    return allData;
  }

  private splitData(data: TrainingDataFrame[]): {
    train: TrainingDataFrame[];
    val: TrainingDataFrame[];
    test: TrainingDataFrame[];
  } {
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

  private async exportForTensorFlow(splits: {
    train: TrainingDataFrame[];
    val: TrainingDataFrame[];
    test: TrainingDataFrame[];
  }): Promise<void> {
    console.log('🔄 Creating TensorFlow.js datasets...');

    // Save dataset info
    const datasetInfo = {
      format: 'tensorflow_js',
      created: new Date().toISOString(),
      splits: {
        train: splits.train.length,
        validation: splits.val.length,
        test: splits.test.length,
      },
      config: this.config,
    };

    await fs.writeFile(
      join(this.config.outputDir, 'dataset_info.json'),
      JSON.stringify(datasetInfo, null, 2),
    );

    // Save each split
    for (const [name, data] of Object.entries(splits)) {
      console.log(`  Creating ${name} dataset...`);

      const dataset = {
        samples: data.map((frame) => {
          // Process input events to extract actions
          const actions = this.extractActionsFromEvents(frame.inputEvents || []);

          return {
            screenshot: frame.screenshotPath,
            outputs: {
              movement_x: actions.movement?.x || 0,
              movement_y: actions.movement?.y || 0,
              aim_x: actions.mouseAim?.x || 0,
              aim_y: actions.mouseAim?.y || 0,
              shooting: actions.shooting ? 1 : 0,
            },
            timestamp: frame.timestamp,
          };
        }),
      };

      await fs.writeFile(
        join(this.config.outputDir, `${name}_data.json`),
        JSON.stringify(dataset, null, 2),
      );
    }
  }

  private extractActionsFromEvents(events: InputEvent[]): {
    movement: { x: number; y: number } | null;
    shooting: boolean;
    mouseAim: { x: number; y: number } | null;
  } {
    const actions = {
      movement: null as { x: number; y: number } | null,
      shooting: false,
      mouseAim: null as { x: number; y: number } | null,
    };

    // TODO: rework this, tracking the mouse x, y doesn't really seem to work as all predicted mouse movements are
    // TODO: outside the window.  Might need to rework the data collection bit too
    // Track currently pressed keys
    const pressedKeys = new Set<string>();
    let latestMousePos: { x: number; y: number } | null = null;

    for (const event of events) {
      if (event.type === 'keyboard') {
        if (event.action === 'press' && event.key) {
          pressedKeys.add(event.key.toLowerCase());
        } else if (event.action === 'release' && event.key) {
          pressedKeys.delete(event.key.toLowerCase());
        }
      } else if (event.type === 'mouse') {
        if (event.action === 'press') {
          actions.shooting = true;
        } else if (event.action === 'move' && event.x !== undefined && event.y !== undefined) {
          latestMousePos = { x: event.x, y: event.y };
        }
      }
    }

    // TODO: rework this, it doesn't seem to translate well into the real world behavior of holding down a
    // TODO: WASD key to move.
    // Convert WASD to movement vector
    let moveX = 0,
      moveY = 0;
    if (pressedKeys.has('a')) moveX -= 1;
    if (pressedKeys.has('d')) moveX += 1;
    if (pressedKeys.has('w')) moveY -= 1;
    if (pressedKeys.has('s')) moveY += 1;

    if (moveX !== 0 || moveY !== 0) {
      // Normalize diagonal movement
      const magnitude = Math.sqrt(moveX * moveX + moveY * moveY);
      actions.movement = {
        x: moveX / magnitude,
        y: moveY / magnitude,
      };
    }

    actions.mouseAim = latestMousePos;

    return actions;
  }
}

// CLI interface
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log('Usage: ts-node clean-training-data.ts <input-dir> <output-dir> [options]');
    console.log('');
    console.log('Options:');
    console.log('  --val-split <num>    Validation split ratio (default: 0.2)');
    console.log('  --test-split <num>   Test split ratio (default: 0.1)');
    console.log('  --min-events <num>   Minimum input events per frame (default: 1)');
    console.log('  --max-jump <num>     Maximum mouse jump in pixels (default: 200)');
    process.exit(1);
  }

  const config: CleaningConfig = {
    inputDir: args[0] ?? '',
    outputDir: args[1] ?? '',
    validationSplit: 0.2,
    testSplit: 0.1,
    minInputEvents: 1,
    maxMouseJump: 200,
  };

  // Parse options
  for (let i = 2; i < args.length; i++) {
    switch (args[i]) {
      case '--val-split':
        config.validationSplit = parseFloat(args[++i] ?? '0.2');
        break;
      case '--test-split':
        config.testSplit = parseFloat(args[++i] ?? '0.1');
        break;
      case '--min-events':
        config.minInputEvents = parseInt(args[++i] ?? '1');
        break;
      case '--max-jump':
        config.maxMouseJump = parseInt(args[++i] ?? '200');
        break;
    }
  }

  console.log('📋 Configuration:');
  console.log(`  Validation split: ${(config.validationSplit * 100).toFixed(1)}%`);
  console.log(`  Test split: ${(config.testSplit * 100).toFixed(1)}%`);
  console.log(
    `  Training split: ${((1 - config.validationSplit - config.testSplit) * 100).toFixed(1)}%`,
  );
  console.log(`  Min input events: ${config.minInputEvents}`);
  console.log(`  Max mouse jump: ${config.maxMouseJump}px`);

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
