import type { DataCollectionConfig } from './training-data-collector.js';
import { TrainingDataCollector } from './training-data-collector.js';
import { join } from 'path';

async function main(): Promise<void> {
  // Configuration for data collection
  const config: DataCollectionConfig = {
    outputDir: join(process.cwd(), 'training_data', `session_${Date.now()}`),
    captureIntervalMs: 500, // Capture every 500ms
    saveScreenshotsToFiles: true, // Save screenshots as files for easier inspection
    gameWindowTitle: 'nuclearthrone',
    maxDataPoints: 100, // Collect 100 data points (50 seconds at 500ms intervals)
  };

  console.log('Starting training data collection...');
  console.log('Configuration:', config);

  const collector = new TrainingDataCollector(config);

  try {
    // Initialize the collector (find window, create directories)
    await collector.initialize();

    // Start collection
    console.log('\n🎮 Starting data collection in 3 seconds...');
    console.log('Make sure the game window is visible and start playing!');

    // Give user time to prepare
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // TODO: May want to set mouse input to top left of game screen on collection and agent play to have consistent
    // TODO: mouse movement
    await collector.startCollection();

    // The collection will run until maxDataPoints is reached
    // or you can manually stop it with Ctrl+C
  } catch (error) {
    console.error('❌ Error during data collection:', error);

    // Try to save any data we've collected so far
    try {
      const dataPoints = await collector.stopCollection();
      console.log(`💾 Saved ${dataPoints.length} data points before error`);
    } catch (saveError) {
      console.error('Failed to save data on error:', saveError);
    }
  }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\n🛑 Received interrupt signal, stopping data collection...');

  // Note: You'll need to store the collector instance globally or use a different approach
  // for graceful shutdown. For now, the process will exit.
  process.exit(0);
});

// Run the main function
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

// Alternative approach with manual control
export async function collectDataSession(
  gameTitle: string,
  durationSeconds: number = 60,
  outputDir?: string,
): Promise<void> {
  const config: DataCollectionConfig = {
    outputDir: outputDir || join(process.cwd(), 'training_data', `session_${Date.now()}`),
    captureIntervalMs: 200, // 5 FPS
    saveScreenshotsToFiles: true,
    gameWindowTitle: gameTitle,
    maxDataPoints: Math.floor(durationSeconds * 5), // 5 FPS * duration
  };

  const collector = new TrainingDataCollector(config);

  console.log(`🎯 Collecting data for "${gameTitle}" for ${durationSeconds} seconds...`);

  await collector.initialize();
  await collector.startCollection();

  console.log(`✅ Collection complete! Data saved to: ${config.outputDir}`);

  // Export in multiple formats
  await collector.exportToFormat('json');
  await collector.exportToFormat('csv');
}
