import { DisplayCapture } from '../src/display-capture.js';
import { join } from 'path';

async function main(): Promise<void> {
  console.log('=== Display Capture Test ===\n');

  const displayCapture = new DisplayCapture();

  try {
    // 1. Get display information
    console.log('1. Detecting displays...');
    const displayInfo = await displayCapture.getDisplayInfo();

    console.log(`\nTotal desktop: ${displayInfo.totalWidth}x${displayInfo.totalHeight}`);
    console.log(`\nConnected monitors (${displayInfo.monitors.length}):`);

    displayInfo.monitors.forEach((monitor, index) => {
      console.log(`\n  Monitor ${index + 1}: ${monitor.name}`);
      console.log(`    Resolution: ${monitor.width}x${monitor.height}`);
      console.log(`    Refresh Rate: ${monitor.refreshRate}Hz`);
      console.log(`    Position: +${monitor.offsetX}+${monitor.offsetY}`);
      console.log(`    Primary: ${monitor.isPrimary ? 'Yes' : 'No'}`);
    });

    // 2. Get leftmost monitor (for game)
    console.log('\n2. Getting leftmost monitor (game screen)...');
    const leftMonitor = await displayCapture.getLeftmostMonitor();

    console.log(`\nGame will be captured from: ${leftMonitor.name}`);
    console.log(`  Resolution: ${leftMonitor.width}x${leftMonitor.height}`);
    console.log(`  Refresh Rate: ${leftMonitor.refreshRate}Hz`);
    console.log(`  Position: +${leftMonitor.offsetX}+${leftMonitor.offsetY}`);

    // 3. Test video recording
    console.log('\n3. Testing video recording...');
    console.log('Recording 5 seconds of video from leftmost monitor...\n');

    const outputPath = join(process.cwd(), 'test_output', `test_recording_${Date.now()}.mp4`);

    const recordingProcess = await displayCapture.startRecording({
      outputPath,
      framerate: 30,
      width: leftMonitor.width,
      height: leftMonitor.height,
      offsetX: leftMonitor.offsetX,
      offsetY: leftMonitor.offsetY,
      codec: 'libx264',
      preset: 'ultrafast',
      crf: 18,
    });

    console.log(`Recording started (PID: ${recordingProcess.pid})...`);

    // Record for 5 seconds
    await new Promise((resolve) => setTimeout(resolve, 5000));

    console.log('\nStopping recording...');
    await displayCapture.stopRecording();

    console.log(`\n✅ Test complete! Video saved to: ${outputPath}`);
    console.log('\nYou can verify the recording with:');
    console.log(`  ffplay ${outputPath}`);
    console.log(`  vlc ${outputPath}`);
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', async () => {
  console.log('\n\n🛑 Received interrupt signal, stopping...');
  const displayCapture = new DisplayCapture();
  await displayCapture.stopRecording();
  process.exit(0);
});

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
