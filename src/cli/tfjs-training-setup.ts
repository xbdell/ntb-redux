#!/usr/bin/env ts-node

import * as tf from '@tensorflow/tfjs-node-gpu'; // For GPU support
// Alternative: import * as tf from '@tensorflow/tfjs-node'; // CPU only
import { promises as fs } from 'fs';
import { join } from 'path';
import * as path from 'path';

interface TrainingConfig {
  dataDir: string;
  modelType: 'efficientnet' | 'mobilenet' | 'custom_cnn';
  epochs: number;
  batchSize: number;
  learningRate: number;
  validationSplit: number;
  savePath: string;
  resumeFrom?: string;
}

interface DatasetSample {
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

class TensorFlowTrainer {
  private config: TrainingConfig;
  private model: tf.LayersModel | null = null;
  private trainDataset: tf.data.Dataset<tf.TensorContainer> | null = null;
  private valDataset: tf.data.Dataset<tf.TensorContainer> | null = null;

  constructor(config: TrainingConfig) {
    this.config = config;
  }

  public async initialize(): Promise<void> {
    console.log('🔧 Initializing TensorFlow.js training...');

    // Set memory growth to avoid OOM
    tf.env().set('WEBGL_DELETE_TEXTURE_THRESHOLD', 0);
    tf.env().set('WEBGL_FORCE_F16_TEXTURES', true);

    console.log(`Backend: ${tf.getBackend()}`);
    console.log(`GPU memory info:`, tf.memory());

    // Load datasets
    await this.loadDatasets();

    // Create model
    this.model = this.createModel();

    console.log('✅ Initialization complete');
  }

  private async loadDatasets(): Promise<void> {
    console.log('📁 Loading datasets...');

    await this.loadDatasetInfo(); // Load to verify it exists
    const baseDir = this.config.dataDir;

    // Load training data
    const trainData = await this.loadDatasetFile(join(baseDir, 'train_data.json'));
    const valData = await this.loadDatasetFile(join(baseDir, 'val_data.json'));

    console.log(`  Training samples: ${trainData.samples.length}`);
    console.log(`  Validation samples: ${valData.samples.length}`);

    // Create TensorFlow datasets
    this.trainDataset = this.createTFDataset(trainData.samples, baseDir, true);
    this.valDataset = this.createTFDataset(valData.samples, baseDir, false);
  }

  private async loadDatasetInfo(): Promise<{
    totalSamples: number;
    trainSamples: number;
    valSamples: number;
    dataFormat: string;
  }> {
    const infoPath = join(this.config.dataDir, 'dataset_info.json');
    const content = await fs.readFile(infoPath, 'utf8');
    return JSON.parse(content) as {
      totalSamples: number;
      trainSamples: number;
      valSamples: number;
      dataFormat: string;
    };
  }

  private async loadDatasetFile(filePath: string): Promise<{
    samples: DatasetSample[];
  }> {
    const content = await fs.readFile(filePath, 'utf8');
    return JSON.parse(content) as {
      samples: DatasetSample[];
    };
  }

  private createTFDataset(
    samples: DatasetSample[],
    baseDir: string,
    isTraining: boolean,
  ): tf.data.Dataset<tf.TensorContainer> {
    // Create dataset from generator
    const dataset = tf.data.generator(async function* () {
      for (const sample of samples) {
        try {
          // Load and preprocess image
          const imagePath = path.join(baseDir, sample.screenshot);
          const imageBuffer = await fs.readFile(imagePath);

          // Decode image using TensorFlow.js
          let imageTensor = tf.node.decodeImage(imageBuffer, 3) as tf.Tensor3D;

          // Resize to model input size
          imageTensor = tf.image.resizeBilinear(imageTensor, [240, 320]);

          // Normalize to [0, 1]
          imageTensor = tf.div(imageTensor, 255.0);

          // Create target tensor with default values for undefined
          const target = tf.tensor1d([
            sample.outputs.movement_x ?? 0,
            sample.outputs.movement_y ?? 0,
            sample.outputs.aim_x ?? 0,
            sample.outputs.aim_y ?? 0,
            sample.outputs.shooting ?? 0,
          ]);

          yield { xs: imageTensor, ys: target };
        } catch (error) {
          console.warn(`Failed to load sample: ${sample.screenshot}`, error);
          continue;
        }
      }
    });

    // Apply batching and shuffling
    let processedDataset = dataset;

    if (isTraining) {
      processedDataset = processedDataset.shuffle(1000);
    }

    return processedDataset.batch(this.config.batchSize);
  }

  private createModel(): tf.LayersModel {
    console.log(`🤖 Creating ${this.config.modelType} model...`);

    switch (this.config.modelType) {
      case 'custom_cnn':
        return this.createCustomCNN();
      case 'mobilenet':
        return this.createMobileNetModel();
      case 'efficientnet':
        return this.createEfficientNetModel();
      default:
        throw new Error(`Unknown model type: ${String(this.config.modelType)}`);
    }
  }

  private createCustomCNN(): tf.LayersModel {
    const model = tf.sequential({
      layers: [
        // Input layer
        tf.layers.conv2d({
          inputShape: [240, 320, 3],
          filters: 32,
          kernelSize: 3,
          activation: 'relu',
          padding: 'same',
        }),
        tf.layers.maxPooling2d({ poolSize: 2 }),

        // Feature extraction layers
        tf.layers.conv2d({ filters: 64, kernelSize: 3, activation: 'relu', padding: 'same' }),
        tf.layers.maxPooling2d({ poolSize: 2 }),

        tf.layers.conv2d({ filters: 128, kernelSize: 3, activation: 'relu', padding: 'same' }),
        tf.layers.maxPooling2d({ poolSize: 2 }),

        tf.layers.conv2d({ filters: 256, kernelSize: 3, activation: 'relu', padding: 'same' }),
        tf.layers.globalAveragePooling2d({ dataFormat: 'channelsLast' }),

        // Decision layers
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({ units: 256, activation: 'relu' }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({ units: 64, activation: 'relu' }),

        // Output layer
        tf.layers.dense({ units: 5, activation: 'linear' }), // movement_x, movement_y, aim_x, aim_y, shooting
      ],
    });

    return model;
  }

  private createMobileNetModel(): tf.LayersModel {
    // Load MobileNet base (this is a simplified version - TensorFlow.js has limited pre-trained models)
    const baseModel = tf.sequential({
      layers: [
        tf.layers.conv2d({
          inputShape: [240, 320, 3],
          filters: 32,
          kernelSize: 3,
          strides: 2,
          activation: 'relu',
          padding: 'same',
        }),
        tf.layers.depthwiseConv2d({ kernelSize: 3, activation: 'relu', padding: 'same' }),
        tf.layers.conv2d({ filters: 64, kernelSize: 1, activation: 'relu' }),
        tf.layers.maxPooling2d({ poolSize: 2 }),

        tf.layers.depthwiseConv2d({ kernelSize: 3, activation: 'relu', padding: 'same' }),
        tf.layers.conv2d({ filters: 128, kernelSize: 1, activation: 'relu' }),
        tf.layers.maxPooling2d({ poolSize: 2 }),

        tf.layers.depthwiseConv2d({ kernelSize: 3, activation: 'relu', padding: 'same' }),
        tf.layers.conv2d({ filters: 256, kernelSize: 1, activation: 'relu' }),
        tf.layers.globalAveragePooling2d({ dataFormat: 'channelsLast' }),

        // Custom head
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({ units: 128, activation: 'relu' }),
        tf.layers.dense({ units: 5, activation: 'linear' }),
      ],
    });

    return baseModel;
  }

  private createEfficientNetModel(): tf.LayersModel {
    // Simplified EfficientNet-like architecture
    const model = tf.sequential({
      layers: [
        // Stem
        tf.layers.conv2d({
          inputShape: [240, 320, 3],
          filters: 32,
          kernelSize: 3,
          strides: 2,
          activation: 'swish',
          padding: 'same',
        }),

        // Mobile inverted bottleneck blocks (simplified)
        tf.layers.separableConv2d({
          filters: 64,
          kernelSize: 3,
          activation: 'swish',
          padding: 'same',
        }),
        tf.layers.maxPooling2d({ poolSize: 2 }),

        tf.layers.separableConv2d({
          filters: 128,
          kernelSize: 3,
          activation: 'swish',
          padding: 'same',
        }),
        tf.layers.maxPooling2d({ poolSize: 2 }),

        tf.layers.separableConv2d({
          filters: 256,
          kernelSize: 3,
          activation: 'swish',
          padding: 'same',
        }),
        tf.layers.globalAveragePooling2d({ dataFormat: 'channelsLast' }),

        // Head
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({ units: 256, activation: 'swish' }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({ units: 64, activation: 'swish' }),
        tf.layers.dense({ units: 5, activation: 'linear' }),
      ],
    });

    return model;
  }

  private createCustomLoss(): (yTrue: tf.Tensor, yPred: tf.Tensor) => tf.Tensor {
    return (yTrue: tf.Tensor, yPred: tf.Tensor) => {
      return tf.tidy(() => {
        // Split predictions and targets
        const predMovement = tf.slice(yPred, [0, 0], [-1, 2]);
        const predAim = tf.slice(yPred, [0, 2], [-1, 2]);
        const predShoot = tf.slice(yPred, [0, 4], [-1, 1]);

        const trueMovement = tf.slice(yTrue, [0, 0], [-1, 2]);
        const trueAim = tf.slice(yTrue, [0, 2], [-1, 2]);
        const trueShoot = tf.slice(yTrue, [0, 4], [-1, 1]);

        // Different loss components
        const movementLoss = tf.losses.meanSquaredError(trueMovement, predMovement);
        const aimLoss = tf.losses.meanSquaredError(trueAim, predAim);
        const shootLoss = tf.losses.sigmoidCrossEntropy(trueShoot, predShoot);

        // Weighted combination
        const totalLoss = tf.add(
          tf.add(tf.mul(movementLoss, 2.0), tf.mul(aimLoss, 1.5)),
          tf.mul(shootLoss, 1.0),
        );

        return totalLoss;
      });
    };
  }

  public async train(): Promise<void> {
    if (!this.model || !this.trainDataset || !this.valDataset) {
      throw new Error('Model or datasets not initialized');
    }

    console.log('🚀 Starting training...');

    // Compile model
    this.model.compile({
      optimizer: tf.train.adam(this.config.learningRate),
      loss: this.createCustomLoss(),
      metrics: ['mse'],
    });

    // Print model summary
    this.model.summary();

    // Create callbacks
    const getBestValLoss = (): number => this.getBestValLoss();
    const saveModel = (epoch: number, valLoss: number): Promise<void> =>
      this.saveModel(epoch, valLoss);
    const callbacks = [
      new (class extends tf.Callback {
        public override async onEpochEnd(epoch: number, logs?: tf.Logs): Promise<void> {
          const loss = logs?.['loss'];
          const valLoss = logs?.['val_loss'];
          console.log(
            `Epoch ${epoch + 1}: loss=${loss?.toFixed(4)}, val_loss=${valLoss?.toFixed(4)}`,
          );

          // Save model checkpoint
          if (valLoss !== undefined && (epoch === 0 || valLoss < getBestValLoss())) {
            await saveModel(epoch, valLoss);
          }
        }
        public override async onTrainEnd(): Promise<void> {
          console.log('✅ Training completed!');
        }
      })(),
    ];

    // Train the model
    const history = await this.model.fitDataset(this.trainDataset, {
      epochs: this.config.epochs,
      validationData: this.valDataset,
      callbacks,
    });

    console.log('📊 Training history:', history.history);
  }

  private bestValLoss = Infinity;

  private getBestValLoss(): number {
    return this.bestValLoss;
  }

  private async saveModel(epoch: number, valLoss: number): Promise<void> {
    if (!this.model) return;

    this.bestValLoss = valLoss;

    // Ensure the directory exists
    const modelDir = path.dirname(path.resolve(this.config.savePath));
    await fs.mkdir(modelDir, { recursive: true });

    // Save model
    const modelPath = `file://${path.resolve(this.config.savePath)}`;
    await this.model.save(modelPath);

    // Save metadata
    const metadata = {
      epoch,
      valLoss,
      config: this.config,
      savedAt: new Date().toISOString(),
    };

    const metadataPath = path.join(
      path.dirname(this.config.savePath),
      `${path.basename(this.config.savePath)}_metadata.json`,
    );
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

    console.log(`💾 Model saved: epoch ${epoch + 1}, val_loss=${valLoss.toFixed(4)}`);
  }

  public async loadModel(modelPath: string): Promise<void> {
    console.log(`📂 Loading model from: ${modelPath}`);
    this.model = await tf.loadLayersModel(`file://${path.resolve(modelPath)}`);
    console.log('✅ Model loaded successfully');
  }

  // Inference method
  public async predict(imagePath: string): Promise<{
    movement: { x: number; y: number };
    aim: { x: number; y: number };
    shooting: number;
  }> {
    if (!this.model) {
      throw new Error('Model not loaded');
    }

    // Load and preprocess image
    const imageBuffer = await fs.readFile(imagePath);
    let imageTensor = tf.node.decodeImage(imageBuffer, 3) as tf.Tensor3D;
    imageTensor = tf.image.resizeBilinear(imageTensor, [240, 320]);
    imageTensor = tf.div(imageTensor, 255.0);

    // Add batch dimension
    const batchedImage = tf.expandDims(imageTensor, 0);

    // Predict
    const prediction = this.model.predict(batchedImage) as tf.Tensor;
    const predictionData = await prediction.data();

    // Clean up tensors
    imageTensor.dispose();
    batchedImage.dispose();
    prediction.dispose();

    return {
      movement: {
        x: predictionData[0] ?? 0,
        y: predictionData[1] ?? 0,
      },
      aim: {
        x: predictionData[2] ?? 0,
        y: predictionData[3] ?? 0,
      },
      shooting: predictionData[4] ?? 0,
    };
  }

  public dispose(): void {
    if (this.model) {
      this.model.dispose();
    }
  }
}

// CLI interface
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.log('Usage: ts-node tfjs-training-setup.ts <data-dir> [options]');
    console.log('');
    console.log('Options:');
    console.log(
      '  --model <type>          Model type: custom_cnn, mobilenet, efficientnet (default: custom_cnn)',
    );
    console.log('  --epochs <num>          Number of epochs (default: 50)');
    console.log('  --batch-size <num>      Batch size (default: 16)');
    console.log('  --learning-rate <num>   Learning rate (default: 0.001)');
    console.log('  --save-path <path>      Model save path (default: ./model)');
    console.log('  --resume <path>         Resume from saved model');
    console.log('');
    console.log('Example:');
    console.log('  ts-node tfjs-training-setup.ts ./cleaned_data --model mobilenet --epochs 30');
    process.exit(1);
  }

  const config: TrainingConfig = {
    dataDir: args[0] || '',
    modelType: 'custom_cnn',
    epochs: 50,
    batchSize: 16,
    learningRate: 0.001,
    validationSplit: 0.2,
    savePath: './models/model',
  };

  // Parse options
  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case '--model':
        config.modelType = args[++i] as 'efficientnet' | 'mobilenet' | 'custom_cnn';
        break;
      case '--epochs':
        config.epochs = parseInt(args[++i] || '');
        break;
      case '--batch-size':
        config.batchSize = parseInt(args[++i] || '');
        break;
      case '--learning-rate':
        config.learningRate = parseFloat(args[++i] || '');
        break;
      case '--save-path':
        config.savePath = args[++i] || '';
        break;
      case '--resume':
        config.resumeFrom = args[++i];
        break;
    }
  }

  console.log('📋 Training configuration:', config);

  try {
    const trainer = new TensorFlowTrainer(config);

    if (config.resumeFrom) {
      await trainer.loadModel(config.resumeFrom);
    }

    await trainer.initialize();
    await trainer.train();

    trainer.dispose();
  } catch (error) {
    console.error('❌ Training failed:', error);
    process.exit(1);
  }
}

// Export for use as module
export { TensorFlowTrainer, TrainingConfig };

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
