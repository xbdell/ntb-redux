import { VideoDataCollector } from './video-data-collector.js';
import type { VideoCollectionConfig } from './video-data-collector.js';
import { join } from 'path';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Hotkey configuration
const HOTKEY_COMBO = ['shift', 'ctrl', 'l'] as const; // SHIFT+CTRL+L

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

    // Set up hotkey listener
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
 * Find keyboard device IDs for xinput
 */
async function findKeyboardDevices(): Promise<string[]> {
  const { stdout } = await execAsync('xinput list --short');
  const devices: string[] = [];
  const lines = stdout.split('\n');

  for (const line of lines) {
    // Look for keyboard devices, excluding virtual ones
    if (
      line.includes('keyboard') &&
      !line.includes('Virtual') &&
      !line.includes('XTEST') &&
      line.includes('id=')
    ) {
      const idMatch = line.match(/id=(\d+)/);
      if (idMatch && idMatch[1]) {
        devices.push(idMatch[1]);
      }
    }
  }

  return devices;
}

/**
 * Wait for hotkey combo and toggle recording
 */
async function waitForHotkeyToggle(
  collector: VideoDataCollector,
  config: VideoCollectionConfig,
): Promise<void> {
  return new Promise((_resolve, reject) => {
    const keyState = new Set<string>();
    let isRecording = false;
    let isProcessingHotkey = false; // Debounce flag
    const processes: ReturnType<typeof spawn>[] = [];

    // Find keyboard devices and listen to each
    findKeyboardDevices()
      .then((deviceIds) => {
        if (deviceIds.length === 0) {
          reject(new Error('No keyboard devices found'));
          return;
        }

        console.log(`Listening to ${deviceIds.length} keyboard device(s) for hotkey...`);

        for (const deviceId of deviceIds) {
          const xinputProcess = spawn('xinput', ['test', deviceId]);
          processes.push(xinputProcess);

          xinputProcess.stdout?.on('data', (data: Buffer) => {
            const output = data.toString();
            const lines = output.split('\n');

            for (const line of lines) {
              // Parse xinput test output format:
              // "key press   50" or "key release 50"
              if (line.includes('key press')) {
                const keyMatch = line.match(/key press\s+(\d+)/);
                if (keyMatch && keyMatch[1]) {
                  const keycode = parseInt(keyMatch[1]);
                  const keyName = keycodeToName(keycode);
                  if (keyName) {
                    keyState.add(keyName);
                    // Check hotkey combo
                    void handleHotkeyCheck();
                  }
                }
              } else if (line.includes('key release')) {
                const keyMatch = line.match(/key release\s+(\d+)/);
                if (keyMatch && keyMatch[1]) {
                  const keycode = parseInt(keyMatch[1]);
                  const keyName = keycodeToName(keycode);
                  if (keyName) {
                    keyState.delete(keyName);
                  }
                }
              }
            }
          });

          xinputProcess.stderr?.on('data', (data: Buffer) => {
            const output = data.toString();
            if (output.includes('error') || output.includes('Error')) {
              console.error(`xinput error (device ${deviceId}):`, output);
            }
          });

          xinputProcess.on('error', (error) => {
            console.error(`Failed to start xinput for device ${deviceId}:`, error.message);
          });
        }

        async function handleHotkeyCheck(): Promise<void> {
          // Check if all hotkey combo keys are pressed
          const allPressed = HOTKEY_COMBO.every((key) => keyState.has(key));

          if (!allPressed || isProcessingHotkey) {
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
      })
      .catch(reject);

    // Cleanup function
    function cleanup(): void {
      for (const proc of processes) {
        if (!proc.killed) {
          proc.kill('SIGTERM');
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

/**
 * Convert X11 keycode to key name
 */
function keycodeToName(keycode: number): string | null {
  const keyMap: { [key: number]: string } = {
    50: 'shift', // Left Shift
    62: 'shift', // Right Shift
    37: 'ctrl', // Left Ctrl
    105: 'ctrl', // Right Ctrl
    64: 'alt', // Left Alt
    108: 'alt', // Right Alt
    46: 'l', // L key
    // Add more keys as needed
  };

  return keyMap[keycode] || null;
}

// Run the main function
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
