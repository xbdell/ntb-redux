import { promisify } from 'util';
import { exec, spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
import { promises as fs } from 'fs';

const execAsync = promisify(exec);

export interface MonitorInfo {
  name: string; // e.g., "DP-1", "HDMI-1"
  width: number;
  height: number;
  refreshRate: number;
  offsetX: number; // Position in desktop (0 for leftmost)
  offsetY: number;
  isPrimary: boolean;
}

export interface DisplayInfo {
  monitors: MonitorInfo[];
  totalWidth: number;
  totalHeight: number;
}

export interface VideoRecordingOptions {
  outputPath: string;
  framerate: number;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  codec: 'libx264' | 'libx265';
  preset: 'ultrafast' | 'superfast' | 'veryfast' | 'faster' | 'fast';
  crf: number; // Quality: 18-28, lower is better
}

export class DisplayCapture {
  private recordingProcess: ChildProcess | null = null;

  /**
   * Get information about all connected monitors using xrandr
   */
  public async getDisplayInfo(): Promise<DisplayInfo> {
    try {
      const { stdout } = await execAsync('xrandr --query');
      const monitors = this.parseXrandrOutput(stdout);

      // Calculate total desktop dimensions
      const totalWidth = Math.max(...monitors.map((m) => m.offsetX + m.width));
      const totalHeight = Math.max(...monitors.map((m) => m.offsetY + m.height));

      return {
        monitors,
        totalWidth,
        totalHeight,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to get display info: ${errorMessage}`);
    }
  }

  /**
   * Get the leftmost monitor (for dual monitor setup with game on left)
   */
  public async getLeftmostMonitor(): Promise<MonitorInfo> {
    const displayInfo = await this.getDisplayInfo();
    const leftmost = displayInfo.monitors.reduce((left, current) =>
      current.offsetX < left.offsetX ? current : left,
    );

    console.log(`Leftmost monitor: ${leftmost.name} (${leftmost.width}x${leftmost.height} @ ${leftmost.refreshRate}Hz)`);
    return leftmost;
  }

  /**
   * Get the primary monitor
   */
  public async getPrimaryMonitor(): Promise<MonitorInfo> {
    const displayInfo = await this.getDisplayInfo();
    const primary = displayInfo.monitors.find((m) => m.isPrimary);

    if (!primary) {
      console.warn('No primary monitor found, using first monitor');
      return displayInfo.monitors[0] as MonitorInfo;
    }

    console.log(`Primary monitor: ${primary.name} (${primary.width}x${primary.height} @ ${primary.refreshRate}Hz)`);
    return primary;
  }

  /**
   * Parse xrandr output to extract monitor information
   */
  private parseXrandrOutput(output: string): MonitorInfo[] {
    const monitors: MonitorInfo[] = [];
    const lines = output.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;

      // Look for connected monitors: "DP-1 connected primary 1920x1080+0+0 ..."
      const connectedMatch = line.match(
        /^([\w-]+)\s+connected\s+(primary\s+)?(\d+)x(\d+)\+(\d+)\+(\d+)/,
      );

      if (connectedMatch) {
        const [, name, primaryStr, widthStr, heightStr, offsetXStr, offsetYStr] = connectedMatch;

        // Find refresh rate from the next line(s)
        let refreshRate = 60; // Default
        for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
          const modeLine = lines[j];
          if (!modeLine) continue;

          // Look for active mode: "   1920x1080    144.00*+ ..."
          const modeMatch = modeLine.match(/^\s+\d+x\d+\s+(\d+\.?\d*)\*\+?/);
          if (modeMatch && modeMatch[1]) {
            refreshRate = Math.round(parseFloat(modeMatch[1]));
            break;
          }
        }

        monitors.push({
          name: name as string,
          width: parseInt(widthStr as string),
          height: parseInt(heightStr as string),
          refreshRate,
          offsetX: parseInt(offsetXStr as string),
          offsetY: parseInt(offsetYStr as string),
          isPrimary: !!primaryStr,
        });
      }
    }

    if (monitors.length === 0) {
      throw new Error('No connected monitors found');
    }

    return monitors;
  }

  /**
   * Start video recording using FFmpeg x11grab
   */
  public async startRecording(options: VideoRecordingOptions): Promise<ChildProcess> {
    // Verify FFmpeg is installed
    try {
      await execAsync('which ffmpeg');
    } catch {
      throw new Error('FFmpeg is not installed. Please install it: sudo apt install ffmpeg');
    }

    // Ensure output directory exists
    const outputDir = options.outputPath.substring(0, options.outputPath.lastIndexOf('/'));
    await fs.mkdir(outputDir, { recursive: true });

    const args = [
      // Input options
      '-f',
      'x11grab',
      '-framerate',
      options.framerate.toString(),
      '-video_size',
      `${options.width}x${options.height}`,
      '-i',
      `:0.0+${options.offsetX},${options.offsetY}`,

      // Thread queue size for high refresh rate displays
      '-thread_queue_size',
      '512',

      // Video encoding options
      '-c:v',
      options.codec,
      '-preset',
      options.preset,
      '-crf',
      options.crf.toString(),
      '-pix_fmt',
      'yuv420p',

      // Frame timing
      '-vsync',
      'cfr', // Constant frame rate

      // Output
      '-y', // Overwrite output file
      options.outputPath,
    ];

    console.log(`Starting FFmpeg recording: ${options.width}x${options.height} @ ${options.framerate}fps`);
    console.log(`Output: ${options.outputPath}`);
    console.log(`FFmpeg command: ffmpeg ${args.join(' ')}`);

    const process = spawn('ffmpeg', args);

    // Handle FFmpeg output
    process.stderr?.on('data', (data: Buffer) => {
      const output = data.toString();
      // FFmpeg writes progress to stderr
      // Only log errors, not progress updates
      if (output.includes('error') || output.includes('Error')) {
        console.error('FFmpeg error:', output);
      } else if (output.includes('frame=')) {
        // Progress update (can log periodically if needed)
        if (Math.random() < 0.01) {
          // Log ~1% of progress updates
          console.log('Recording:', output.trim().split('\n').pop());
        }
      }
    });

    process.stdout?.on('data', (data: Buffer) => {
      console.log('FFmpeg stdout:', data.toString());
    });

    process.on('error', (error) => {
      console.error('FFmpeg process error:', error.message);
    });

    process.on('exit', (code, signal) => {
      if (code === 0) {
        console.log('Recording completed successfully');
      } else if (signal) {
        console.log(`Recording stopped by signal: ${signal}`);
      } else {
        console.error(`FFmpeg exited with code ${code}`);
      }
    });

    // Wait a bit to ensure FFmpeg has started
    await new Promise((resolve) => setTimeout(resolve, 500));

    this.recordingProcess = process;
    return process;
  }

  /**
   * Stop the current recording
   */
  public async stopRecording(): Promise<void> {
    if (!this.recordingProcess) {
      console.warn('No recording in progress');
      return;
    }

    console.log('Stopping recording...');

    // Send 'q' to FFmpeg for graceful shutdown
    this.recordingProcess.stdin?.write('q');

    // Wait for process to finish
    await new Promise<void>((resolve) => {
      if (!this.recordingProcess) {
        resolve();
        return;
      }

      this.recordingProcess.on('exit', () => {
        resolve();
      });

      // Fallback: force kill after 5 seconds
      setTimeout(() => {
        if (this.recordingProcess && !this.recordingProcess.killed) {
          console.warn('Force killing FFmpeg process');
          this.recordingProcess.kill('SIGTERM');
        }
        resolve();
      }, 5000);
    });

    this.recordingProcess = null;
    console.log('Recording stopped');
  }

  /**
   * Check if recording is in progress
   */
  public isRecording(): boolean {
    return this.recordingProcess !== null && !this.recordingProcess.killed;
  }

  /**
   * Get recording process (for advanced control)
   */
  public getRecordingProcess(): ChildProcess | null {
    return this.recordingProcess;
  }
}
