import { promises as fs } from 'fs';
import { join } from 'path';

interface InputEvent {
  timestamp: number;
  type: 'keyboard' | 'mouse';
  action: 'press' | 'release' | 'move';
  key?: string;
  keyCode?: number;
  x?: number;
  y?: number;
  button?: 'left' | 'right' | 'middle';
}

interface ProcessedGameState {
  timestamp: number;
  screenshotPath: string;
  actions: {
    movement: { x: number; y: number } | null; // WASD -> direction vector
    shooting: boolean; // Any mouse click
    mouseAim: { x: number; y: number } | null; // Mouse position relative to player
    keyPressed: string[]; // Currently held keys
  };
  gameContext: {
    playerPosition?: { x: number; y: number }; // Could extract from screenshot
    enemyCount?: number; // Could extract from screenshot analysis
  };
}

export class GameDataPreprocessor {
  // Clean and filter input events
  private cleanInputEvents(events: InputEvent[]): InputEvent[] {
    const cleaned: InputEvent[] = [];
    let lastMousePos = { x: 0, y: 0 };
    const mouseMoveThreshold = 3; // Minimum pixel movement to record

    for (const event of events) {
      if (event.type === 'mouse' && event.action === 'move') {
        // Filter out micro mouse movements
        if (event.x !== undefined && event.y !== undefined) {
          const distance = Math.sqrt(
            Math.pow(event.x - lastMousePos.x, 2) + Math.pow(event.y - lastMousePos.y, 2),
          );

          if (distance >= mouseMoveThreshold) {
            cleaned.push(event);
            lastMousePos = { x: event.x, y: event.y };
          }
        }
      } else {
        // Keep all keyboard and mouse click events
        cleaned.push(event);
      }
    }

    return cleaned;
  }

  // Convert raw input events to game actions
  private extractGameActions(events: InputEvent[]): ProcessedGameState['actions'] {
    const actions: ProcessedGameState['actions'] = {
      movement: null,
      shooting: false,
      mouseAim: null,
      keyPressed: [],
    };

    // Track currently pressed keys
    const pressedKeys = new Set<string>();
    let latestMousePos: { x: number; y: number } | null = null;

    for (const event of events) {
      if (event.type === 'keyboard') {
        if (event.action === 'press' && event.key) {
          pressedKeys.add(event.key);
        } else if (event.action === 'release' && event.key) {
          pressedKeys.delete(event.key);
        }
      } else if (event.type === 'mouse') {
        if (event.action === 'press') {
          actions.shooting = true;
        } else if (event.action === 'move' && event.x !== undefined && event.y !== undefined) {
          latestMousePos = { x: event.x, y: event.y };
        }
      }
    }

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
    actions.keyPressed = Array.from(pressedKeys);

    return actions;
  }

  // Process a single training session
  public async processTrainingSession(metadataPath: string): Promise<ProcessedGameState[]> {
    const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8')) as {
      dataPoints: Array<{
        timestamp: number;
        screenshotFile: string;
        inputEvents: InputEvent[];
      }>;
    };
    const processed: ProcessedGameState[] = [];

    for (const dataPoint of metadata.dataPoints) {
      // Clean input events
      const cleanedEvents = this.cleanInputEvents(dataPoint.inputEvents);

      // Extract game actions
      const actions = this.extractGameActions(cleanedEvents);

      const processedPoint: ProcessedGameState = {
        timestamp: dataPoint.timestamp,
        screenshotPath: dataPoint.screenshotFile,
        actions,
        gameContext: {}, // TODO: Add computer vision analysis
      };

      processed.push(processedPoint);
    }

    return processed;
  }

  // Create training data for different ML approaches
  public createTrainingData(
    processedData: ProcessedGameState[],
    approach: 'classification' | 'regression' | 'sequence',
  ):
    | ReturnType<typeof this.createClassificationData>
    | ReturnType<typeof this.createRegressionData>
    | ReturnType<typeof this.createSequenceData> {
    switch (approach) {
      case 'classification':
        return this.createClassificationData(processedData);
      case 'regression':
        return this.createRegressionData(processedData);
      case 'sequence':
        return this.createSequenceData(processedData);
    }
  }

  private createClassificationData(data: ProcessedGameState[]): {
    format: string;
    classes: string[];
    samples: Array<{ screenshot: string; actionClass: string; timestamp: number }>;
  } {
    // Convert to discrete action classes
    const samples = data.map((point) => ({
      screenshot: point.screenshotPath,
      actionClass: this.actionsToClass(point.actions),
      timestamp: point.timestamp,
    }));

    return {
      format: 'classification',
      classes: this.getActionClasses(),
      samples,
    };
  }

  private createRegressionData(data: ProcessedGameState[]): {
    format: string;
    outputDimensions: string[];
    samples: Array<{
      screenshot: string;
      outputs: {
        movement_x: number;
        movement_y: number;
        aim_x: number;
        aim_y: number;
        shooting: number;
      };
      timestamp: number;
    }>;
  } {
    // Convert to continuous values
    const samples = data.map((point) => ({
      screenshot: point.screenshotPath,
      outputs: {
        movement_x: point.actions.movement?.x || 0,
        movement_y: point.actions.movement?.y || 0,
        aim_x: point.actions.mouseAim?.x || 0,
        aim_y: point.actions.mouseAim?.y || 0,
        shooting: point.actions.shooting ? 1 : 0,
      },
      timestamp: point.timestamp,
    }));

    return {
      format: 'regression',
      outputDimensions: ['movement_x', 'movement_y', 'aim_x', 'aim_y', 'shooting'],
      samples,
    };
  }

  private createSequenceData(
    data: ProcessedGameState[],
    sequenceLength: number = 5,
  ): {
    format: string;
    sequenceLength: number;
    sequences: Array<{
      input_sequence: Array<{ screenshot: string; actions: ProcessedGameState['actions'] }>;
      target_action: ProcessedGameState['actions'];
      sequence_start: number;
      target_timestamp: number;
    }>;
  } {
    // Create sequences for RNN/LSTM training
    const sequences = [];

    for (let i = 0; i < data.length - sequenceLength; i++) {
      const sequence = data.slice(i, i + sequenceLength);
      const target = data[i + sequenceLength];

      if (target && sequence[0]) {
        sequences.push({
          input_sequence: sequence.map((s) => ({
            screenshot: s.screenshotPath,
            actions: s.actions,
          })),
          target_action: target.actions,
          sequence_start: sequence[0].timestamp,
          target_timestamp: target.timestamp,
        });
      }
    }

    return {
      format: 'sequence',
      sequenceLength,
      sequences,
    };
  }

  private actionsToClass(actions: ProcessedGameState['actions']): string {
    // Convert actions to discrete class labels
    const parts = [];

    // Movement (9 classes: 8 directions + no movement)
    if (actions.movement) {
      const angle = Math.atan2(actions.movement.y, actions.movement.x);
      const direction = Math.round(angle / (Math.PI / 4)) % 8;
      parts.push(`move_${direction}`);
    } else {
      parts.push('no_move');
    }

    // Shooting
    if (actions.shooting) {
      parts.push('shoot');
    }

    return parts.join('_');
  }

  private getActionClasses(): string[] {
    // Define all possible action classes
    const moveClasses = ['no_move', ...Array.from({ length: 8 }, (_, i) => `move_${i}`)];
    const shootClasses = ['', 'shoot'];

    const classes = [];
    for (const move of moveClasses) {
      for (const shoot of shootClasses) {
        if (shoot) {
          classes.push(`${move}_${shoot}`);
        } else {
          classes.push(move);
        }
      }
    }

    return classes;
  }

  // Export for different ML frameworks
  public async exportForFramework(
    data:
      | ReturnType<typeof this.createClassificationData>
      | ReturnType<typeof this.createRegressionData>
      | ReturnType<typeof this.createSequenceData>,
    framework: 'tensorflow' | 'sklearn',
    outputDir: string,
  ): Promise<void> {
    await fs.mkdir(outputDir, { recursive: true });

    switch (framework) {
      case 'tensorflow':
        await this.exportTensorFlow(data, outputDir);
        break;
      case 'sklearn':
        await this.exportSklearn(data, outputDir);
        break;
    }
  }

  private async exportTensorFlow(
    data:
      | ReturnType<typeof this.createClassificationData>
      | ReturnType<typeof this.createRegressionData>
      | ReturnType<typeof this.createSequenceData>,
    outputDir: string,
  ): Promise<void> {
    // Create TensorFlow dataset structure
    const tfData = {
      format: 'tensorflow',
      samples: 'samples' in data ? data.samples : data.sequences,
      metadata: {
        image_shape: [240, 320, 3],
        output_shape: data.format === 'regression' ? [5] : [1],
      },
    };

    await fs.writeFile(join(outputDir, 'tf_dataset.json'), JSON.stringify(tfData, null, 2));
  }

  private async exportSklearn(
    data:
      | ReturnType<typeof this.createClassificationData>
      | ReturnType<typeof this.createRegressionData>
      | ReturnType<typeof this.createSequenceData>,
    outputDir: string,
  ): Promise<void> {
    // For sklearn, we'd need to extract image features first
    const sklearnData = {
      format: 'sklearn',
      note: 'Images need to be converted to feature vectors',
      samples: 'samples' in data ? data.samples : undefined,
      suggested_features: ['image_histogram', 'edge_features', 'corner_detection', 'hog_features'],
    };

    await fs.writeFile(join(outputDir, 'sklearn_data.json'), JSON.stringify(sklearnData, null, 2));
  }
}

// Usage example
export async function processGameData(
  sessionDir: string,
  outputDir: string,
): Promise<{
  processed: ProcessedGameState[];
  classification: ReturnType<GameDataPreprocessor['createTrainingData']>;
  regression: ReturnType<GameDataPreprocessor['createTrainingData']>;
  sequence: ReturnType<GameDataPreprocessor['createTrainingData']>;
}> {
  const preprocessor = new GameDataPreprocessor();

  // Process the raw training data
  const metadataPath = join(sessionDir, 'collection_metadata.json');
  const processedData = await preprocessor.processTrainingSession(metadataPath);

  // Create different formats for different approaches
  const classificationData = preprocessor.createTrainingData(processedData, 'classification');
  const regressionData = preprocessor.createTrainingData(processedData, 'regression');
  const sequenceData = preprocessor.createTrainingData(processedData, 'sequence');

  // Export for TensorFlow.js
  await preprocessor.exportForFramework(
    regressionData,
    'tensorflow',
    join(outputDir, 'tensorflow'),
  );

  console.log(`Processed ${processedData.length} frames`);

  return {
    processed: processedData,
    classification: classificationData,
    regression: regressionData,
    sequence: sequenceData,
  };
}
