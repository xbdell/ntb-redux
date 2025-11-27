import { VideoDataCollector } from './video-data-collector.js';
import type { VideoCollectionConfig } from './video-data-collector.js';
import { join } from 'path';
import { readdirSync } from 'fs';
import { createRequire } from 'module';

// Use createRequire for the evdev CommonJS module
const require = createRequire(import.meta.url);
const Evdev = require('evdev');

// Hotkey configuration - using evdev key name strings
const KEY_LEFTSHIFT = 'KEY_LEFTSHIFT';
const KEY_RIGHTSHIFT = 'KEY_RIGHTSHIFT';
const KEY_LEFTCTRL = 'KEY_LEFTCTRL';
const KEY_RIGHTCTRL = 'KEY_RIGHTCTRL';
const KEY_L = 'KEY_L';

async function main(): Promise<void> {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const durationArg = args.find((arg) => arg.startsWith('--duration='));
  const fpsArg = args.find((arg) => arg.startsWith('--fps='));

  const maxDuration = durationArg ? parseInt(durationArg.split('=')[1] as string) : 300; // Default 300 seconds (5 min)
  const fps = fpsArg ? parseInt(fpsArg.split('=')[1] as string) : 30; // Default 30 fps

  if (fps !== 30 && fps !== 60) {
    console.error('Error: FPS must be either 30 or 60');
    process.exit(1);
  }

  // Configuration for video data collection
  const config: VideoCollectionConfig = {
    outputDir: join(process.cwd(), 'training_data'),
    gameProcessName: 'nuclearthrone',
    recordingFramerate: fps as 30 | 60,
    videoCodec: 'libx264',
    compressionQuality: 18, // CRF 18 = high quality
    maxDurationSeconds: maxDuration,
    targetMonitor: 'leftmost', // Game on leftmost monitor
  };

  console.log('\n╔════════════════════════════════════════╗');
  console.log('║  Nuclear Throne Video Data Collector  ║');
  console.log('╚════════════════════════════════════════╝\n');

  console.log('Configuration:');
  console.log(`  Game: ${config.gameProcessName}`);
  console.log(`  Max duration: ${config.maxDurationSeconds} seconds`);
  console.log(`  Frame rate: ${config.recordingFramerate} fps`);
  console.log(`  Output: ${config.outputDir}`);
  console.log(`  Monitor: ${config.targetMonitor}`);
  console.log(`  Hotkey: SHIFT+CTRL+L (toggle recording)`);
  console.log('');

  const collector = new VideoDataCollector(config);

  try {
    // Initialize the collector
    console.log('Initializing...\n');
    await collector.initialize();

    console.log('✅ Ready to record!');
    console.log('\n┌────────────────────────────────────────┐');
    console.log('│  Press SHIFT+CTRL+L to start/stop     │');
    console.log('└────────────────────────────────────────┘\n');

    // Set up hotkey listener using evdev
    await waitForHotkeyToggle(collector, config);
  } catch (error) {
    console.error('\n❌ Error during data collection:', error);

    // Try to save any data collected so far
    try {
      if (collector.isActive()) {
        console.log('\nAttempting to save partial data...');
        await collector.stopCollection();
      }
    } catch (saveError) {
      console.error('Failed to save data on error:', saveError);
    }

    process.exit(1);
  }
}

/**
 * Find keyboard device paths in /dev/input/by-id/
 */
function findKeyboardDevices(): string[] {
  const inputDir = '/dev/input/by-id';
  const devices: string[] = [];

  try {
    const files = readdirSync(inputDir);
    for (const file of files) {
      // Look for keyboard event devices
      if (file.includes('-kbd') || file.includes('-event-kbd')) {
        devices.push(join(inputDir, file));
      }
    }
  } catch (error) {
    console.error('Failed to read /dev/input/by-id:', error);
  }

  return devices;
}

/**
 * Wait for hotkey combo and toggle recording using evdev
 */
async function waitForHotkeyToggle(
  collector: VideoDataCollector,
  config: VideoCollectionConfig,
): Promise<void> {
  return new Promise((_resolve, reject) => {
    const keyState = new Set<string>();
    let isRecording = false;
    let isProcessingHotkey = false; // Debounce flag
    const evdevInstances: InstanceType<typeof Evdev>[] = [];

    // Find keyboard devices
    const devicePaths = findKeyboardDevices();

    if (devicePaths.length === 0) {
      reject(new Error('No keyboard devices found in /dev/input/by-id/'));
      return;
    }

    console.log(`Found ${devicePaths.length} keyboard device(s):`);
    devicePaths.forEach((d) => console.log(`  - ${d}`));
    console.log('');

    // Create evdev instance for each keyboard
    for (const devicePath of devicePaths) {
      try {
        const evdev = new Evdev();

        evdev.on('EV_KEY', (data: { code: string; value: number }) => {
          const { code, value } = data;

          // value: 0 = release, 1 = press, 2 = repeat
          if (value === 1) {
            // Key press
            keyState.add(code);
            void checkHotkey();
          } else if (value === 0) {
            // Key release
            keyState.delete(code);
          }
          // Ignore value === 2 (key repeat)
        });

        evdev.on('error', (err: Error) => {
          console.error(`evdev error on ${devicePath}:`, err.message);
        });

        // Open the device
        evdev.open(devicePath);
        evdevInstances.push(evdev);
        console.log(`Listening on: ${devicePath}`);
      } catch (error) {
        console.error(`Failed to open ${devicePath}:`, error);
      }
    }

    if (evdevInstances.length === 0) {
      reject(
        new Error('Failed to open any keyboard devices. You may need to be in the "input" group.'),
      );
      return;
    }

    console.log('\nWaiting for hotkey (SHIFT+CTRL+L)...\n');

    async function checkHotkey(): Promise<void> {
      // Check if SHIFT + CTRL + L are all pressed
      const shiftPressed = keyState.has(KEY_LEFTSHIFT) || keyState.has(KEY_RIGHTSHIFT);
      const ctrlPressed = keyState.has(KEY_LEFTCTRL) || keyState.has(KEY_RIGHTCTRL);
      const lPressed = keyState.has(KEY_L);

      if (!shiftPressed || !ctrlPressed || !lPressed || isProcessingHotkey) {
        return;
      }

      // Set debounce flag
      isProcessingHotkey = true;

      try {
        if (isRecording) {
          // Stop recording
          console.log('\n🛑 Hotkey detected - Stopping recording...');
          await collector.stopCollection();
          isRecording = false;
          console.log('\n┌────────────────────────────────────────┐');
          console.log('│  Press SHIFT+CTRL+L to start again    │');
          console.log('│  Press Ctrl+C to exit                 │');
          console.log('└────────────────────────────────────────┘\n');
        } else {
          // Start recording
          console.log('\n🎬 Hotkey detected - Starting recording...');
          console.log(`Max duration: ${config.maxDurationSeconds} seconds`);
          console.log('Press SHIFT+CTRL+L again to stop, or wait for auto-stop\n');

          await collector.startCollection();
          isRecording = true;
        }
      } catch (error) {
        console.error('Error toggling recording:', error);
      } finally {
        // Clear debounce after a delay
        setTimeout(() => {
          isProcessingHotkey = false;
        }, 500);
      }
    }

    // Cleanup function
    function cleanup(): void {
      for (const evdev of evdevInstances) {
        try {
          evdev.close();
        } catch {
          // Ignore close errors
        }
      }
    }

    // Handle Ctrl+C
    process.on('SIGINT', async () => {
      console.log('\n\n🛑 Received interrupt signal (Ctrl+C)');

      if (isRecording) {
        try {
          console.log('Stopping collection...');
          await collector.stopCollection();
          console.log('\n✅ Data saved successfully');
        } catch (error) {
          console.error('Error during graceful shutdown:', error);
        }
      }

      cleanup();
      process.exit(0);
    });

    // Handle process exit
    process.on('exit', cleanup);
  });
}

// Run the main function
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
