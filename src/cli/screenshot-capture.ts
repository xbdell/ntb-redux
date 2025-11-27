import { spawn } from 'child_process';
import { promisify } from 'util';
import { exec } from 'child_process';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const execAsync = promisify(exec);

export interface WindowInfo {
  id: string;
  title: string;
  class: string;
  geometry: string;
}

export interface WindowGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class ScreenshotCapture {
  // Get window geometry by ID
  public async getWindowGeometry(windowId: string): Promise<WindowGeometry> {
    try {
      const { stdout } = await execAsync(
        `xwininfo -id ${windowId} | grep -E "(Absolute upper-left X:|Absolute upper-left Y:|Width:|Height:)"`,
      );
      const lines = stdout.trim().split('\n');

      let x = 0,
        y = 0,
        width = 0,
        height = 0;

      for (const line of lines) {
        if (line.includes('Absolute upper-left X:')) {
          const value = line.split(':')[1];
          if (value) x = parseInt(value.trim());
        } else if (line.includes('Absolute upper-left Y:')) {
          const value = line.split(':')[1];
          if (value) y = parseInt(value.trim());
        } else if (line.includes('Width:')) {
          const value = line.split(':')[1];
          if (value) width = parseInt(value.trim());
        } else if (line.includes('Height:')) {
          const value = line.split(':')[1];
          if (value) height = parseInt(value.trim());
        }
      }

      return { x, y, width, height };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to get window geometry: ${errorMessage}`);
    }
  }

  // Get list of windows
  public async getWindows(): Promise<WindowInfo[]> {
    try {
      const { stdout } = await execAsync('wmctrl -l -G');
      const windows: WindowInfo[] = [];

      const lines = stdout.trim().split('\n');
      for (const line of lines) {
        const parts = line.split(/\s+/);
        if (parts.length >= 7) {
          windows.push({
            id: parts[0] as string,
            title: parts.slice(6).join(' '),
            class: parts[3] as string,
            geometry: `${parts[2]}x${parts[3]}+${parts[4]}+${parts[5]}`,
          });
        }
      }

      return windows;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to get windows: ${errorMessage}`);
    }
  }

  // Take screenshot of specific window by ID
  public async captureWindowById(windowId: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const process = spawn('scrot', ['--window', windowId, outputPath]);

      process.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`scrot failed with exit code: ${code}`));
        }
      });

      process.on('error', (error) => {
        reject(new Error(`scrot spawn error: ${error.message}`));
      });
    });
  }

  // Find window by title and capture
  public async captureWindowByTitle(titlePattern: string, outputPath: string): Promise<void> {
    const windows = await this.getWindows();
    const targetWindow = windows.find((w) =>
      w.title.toLowerCase().includes(titlePattern.toLowerCase()),
    );

    if (!targetWindow) {
      throw new Error(`Window with title containing "${titlePattern}" not found`);
    }

    await this.captureWindowById(targetWindow.id, outputPath);
  }

  // Capture to buffer instead of file
  public async captureWindowToBuffer(windowId: string): Promise<Buffer> {
    // Create temporary file path
    const tempFile = join(tmpdir(), `screenshot-${Date.now()}.png`);

    try {
      // Capture to temporary file
      await this.captureWindowById(windowId, tempFile);

      // Read file into buffer
      const buffer = await fs.readFile(tempFile);

      // Clean up temporary file
      await fs.unlink(tempFile).catch(() => {}); // Ignore errors on cleanup

      return buffer;
    } catch (error) {
      // Ensure cleanup even on error
      await fs.unlink(tempFile).catch(() => {});
      throw error;
    }
  }
}
