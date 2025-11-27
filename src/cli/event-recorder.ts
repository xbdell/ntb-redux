import { createWriteStream, readdirSync } from 'fs';
import type { WriteStream } from 'fs';
import { promises as fs } from 'fs';
import { join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { InputEvent } from './input-capture.js';
import { createRequire } from 'module';

const execAsync = promisify(exec);

// Use createRequire for the evdev CommonJS module
const require = createRequire(import.meta.url);
const Evdev = require('evdev');

export interface EventRecorderConfig {
  outputPath: string;
  screenWidth: number;
  screenHeight: number;
  bufferSize?: number; // Number of events to buffer before flushing
  mouseMoveThrottle?: number; // Record 1 out of every N mouse move events (default: 1 = no throttle)
}

export interface RecordedEvent extends InputEvent {
  // All events already have timestamp from InputEvent
}

// evdev key code to key name mapping for common keys
const KEY_CODE_MAP: { [key: string]: string } = {
  KEY_ESC: 'escape',
  KEY_1: '1',
  KEY_2: '2',
  KEY_3: '3',
  KEY_4: '4',
  KEY_5: '5',
  KEY_6: '6',
  KEY_7: '7',
  KEY_8: '8',
  KEY_9: '9',
  KEY_0: '0',
  KEY_MINUS: '-',
  KEY_EQUAL: '=',
  KEY_BACKSPACE: 'backspace',
  KEY_TAB: 'tab',
  KEY_Q: 'q',
  KEY_W: 'w',
  KEY_E: 'e',
  KEY_R: 'r',
  KEY_T: 't',
  KEY_Y: 'y',
  KEY_U: 'u',
  KEY_I: 'i',
  KEY_O: 'o',
  KEY_P: 'p',
  KEY_LEFTBRACE: '[',
  KEY_RIGHTBRACE: ']',
  KEY_ENTER: 'enter',
  KEY_LEFTCTRL: 'ctrl_l',
  KEY_A: 'a',
  KEY_S: 's',
  KEY_D: 'd',
  KEY_F: 'f',
  KEY_G: 'g',
  KEY_H: 'h',
  KEY_J: 'j',
  KEY_K: 'k',
  KEY_L: 'l',
  KEY_SEMICOLON: ';',
  KEY_APOSTROPHE: "'",
  KEY_GRAVE: '`',
  KEY_LEFTSHIFT: 'shift_l',
  KEY_BACKSLASH: '\\',
  KEY_Z: 'z',
  KEY_X: 'x',
  KEY_C: 'c',
  KEY_V: 'v',
  KEY_B: 'b',
  KEY_N: 'n',
  KEY_M: 'm',
  KEY_COMMA: ',',
  KEY_DOT: '.',
  KEY_SLASH: '/',
  KEY_RIGHTSHIFT: 'shift_r',
  KEY_LEFTALT: 'alt_l',
  KEY_SPACE: 'space',
  KEY_CAPSLOCK: 'capslock',
  KEY_F1: 'f1',
  KEY_F2: 'f2',
  KEY_F3: 'f3',
  KEY_F4: 'f4',
  KEY_F5: 'f5',
  KEY_F6: 'f6',
  KEY_F7: 'f7',
  KEY_F8: 'f8',
  KEY_F9: 'f9',
  KEY_F10: 'f10',
  KEY_F11: 'f11',
  KEY_F12: 'f12',
  KEY_RIGHTCTRL: 'ctrl_r',
  KEY_RIGHTALT: 'alt_r',
  KEY_UP: 'up',
  KEY_DOWN: 'down',
  KEY_LEFT: 'left',
  KEY_RIGHT: 'right',
};

// Mouse button mapping
const MOUSE_BUTTON_MAP: { [key: string]: 'left' | 'right' | 'middle' } = {
  BTN_LEFT: 'left',
  BTN_RIGHT: 'right',
  BTN_MIDDLE: 'middle',
};

export class EventRecorder {
  private outputStream: WriteStream | null = null;
  private isRecording = false;
  private config: EventRecorderConfig;
  private eventCount = 0;
  private writeQueue: RecordedEvent[] = [];
  private flushInterval: ReturnType<typeof setInterval> | null = null;
  private mousePositionInterval: ReturnType<typeof setInterval> | null = null;
  private evdevInstances: InstanceType<typeof Evdev>[] = [];
  private lastMouseX = 0;
  private lastMouseY = 0;
  private mouseMoveCounter = 0;
  private lastRecordedMouseX = -1;
  private lastRecordedMouseY = -1;

  constructor(config: EventRecorderConfig) {
    this.config = config;
  }

  /**
   * Find keyboard and mouse device paths in /dev/input/by-id/
   */
  private findInputDevices(): { keyboards: string[]; mice: string[] } {
    const inputDir = '/dev/input/by-id';
    const keyboards: string[] = [];
    const mice: string[] = [];

    try {
      const files = readdirSync(inputDir);
      for (const file of files) {
        const fullPath = join(inputDir, file);
        // Look for keyboard event devices
        if (file.includes('-kbd') || file.includes('-event-kbd')) {
          keyboards.push(fullPath);
        }
        // Look for mouse event devices
        if (file.includes('-mouse') && file.includes('event')) {
          mice.push(fullPath);
        }
      }
    } catch (error) {
      console.error('Failed to read /dev/input/by-id:', error);
    }

    return { keyboards, mice };
  }

  /**
   * Get current mouse position from X11 using xdotool
   */
  private async getMousePosition(): Promise<{ x: number; y: number }> {
    try {
      const { stdout } = await execAsync('xdotool getmouselocation --shell');
      const lines = stdout.split('\n');
      let x = 0;
      let y = 0;

      for (const line of lines) {
        if (line.startsWith('X=')) {
          x = parseInt(line.substring(2));
        } else if (line.startsWith('Y=')) {
          y = parseInt(line.substring(2));
        }
      }

      return { x, y };
    } catch {
      return { x: this.lastMouseX, y: this.lastMouseY };
    }
  }

  /**
   * Start recording events to JSONL file
   */
  public async startRecording(): Promise<void> {
    if (this.isRecording) {
      throw new Error('Event recording already in progress');
    }

    // Ensure output directory exists
    const outputDir = this.config.outputPath.substring(0, this.config.outputPath.lastIndexOf('/'));
    await fs.mkdir(outputDir, { recursive: true });

    // Create write stream for JSONL output
    this.outputStream = createWriteStream(this.config.outputPath, {
      flags: 'w',
      encoding: 'utf8',
    });

    // Find input devices
    const { keyboards, mice } = this.findInputDevices();

    console.log(`Found ${keyboards.length} keyboard(s) and ${mice.length} mouse/mice`);

    // Set up evdev listeners for keyboards
    for (const devicePath of keyboards) {
      this.setupKeyboardDevice(devicePath);
    }

    // Set up evdev listeners for mice (for button clicks)
    for (const devicePath of mice) {
      this.setupMouseDevice(devicePath);
    }

    if (this.evdevInstances.length === 0) {
      throw new Error('Failed to open any input devices. You may need to be in the "input" group.');
    }

    // Get initial mouse position
    const initialPos = await this.getMousePosition();
    this.lastMouseX = initialPos.x;
    this.lastMouseY = initialPos.y;

    this.isRecording = true;
    this.eventCount = 0;
    this.mouseMoveCounter = 0;

    console.log(`Event recording started: ${this.config.outputPath}`);
    console.log(`Screen dimensions: ${this.config.screenWidth}x${this.config.screenHeight}`);
    console.log(`Mouse move throttle: 1 out of every ${this.config.mouseMoveThrottle || 1} events`);

    // Start periodic flush
    this.startPeriodicFlush();

    // Start mouse position polling (for accurate coordinates)
    this.startMousePositionPolling();
  }

  /**
   * Start polling mouse position at regular intervals
   */
  private startMousePositionPolling(): void {
    const throttle = this.config.mouseMoveThrottle || 1;

    // Poll mouse position every 16ms (~60Hz) for smooth tracking
    this.mousePositionInterval = setInterval(() => {
      if (!this.isRecording) return;

      void this.pollMousePosition(throttle);
    }, 16); // ~60Hz polling rate
  }

  /**
   * Poll mouse position and record if changed
   */
  private async pollMousePosition(throttle: number): Promise<void> {
    try {
      const pos = await this.getMousePosition();

      // Constrain to screen bounds
      const x = this.constrainX(pos.x);
      const y = this.constrainY(pos.y);

      // Only record if position has changed
      if (x !== this.lastRecordedMouseX || y !== this.lastRecordedMouseY) {
        this.mouseMoveCounter++;

        // Apply throttling
        if (this.mouseMoveCounter >= throttle) {
          this.mouseMoveCounter = 0;

          const event: RecordedEvent = {
            timestamp: Date.now(),
            type: 'mouse',
            action: 'move',
            x,
            y,
          };

          this.writeQueue.push(event);
          this.eventCount++;

          this.lastRecordedMouseX = x;
          this.lastRecordedMouseY = y;
        }
      }

      this.lastMouseX = x;
      this.lastMouseY = y;
    } catch {
      // Ignore errors in polling
    }
  }

  /**
   * Set up evdev listener for a keyboard device
   */
  private setupKeyboardDevice(devicePath: string): void {
    try {
      const evdev = new Evdev();

      evdev.on('EV_KEY', (data: { code: string; value: number }) => {
        if (!this.isRecording) return;

        const { code, value } = data;

        // Skip mouse button events (they come from mouse device)
        if (code.startsWith('BTN_')) return;

        // value: 0 = release, 1 = press, 2 = repeat (we'll ignore repeat)
        if (value === 0 || value === 1) {
          const keyName = KEY_CODE_MAP[code] || code.toLowerCase().replace('key_', '');

          const event: RecordedEvent = {
            timestamp: Date.now(),
            type: 'keyboard',
            action: value === 1 ? 'press' : 'release',
            key: keyName,
          };

          this.writeQueue.push(event);
          this.eventCount++;
        }
      });

      evdev.on('error', (err: Error) => {
        console.error(`evdev keyboard error on ${devicePath}:`, err.message);
      });

      evdev.open(devicePath);
      this.evdevInstances.push(evdev);
      console.log(`Listening to keyboard: ${devicePath}`);
    } catch (error) {
      console.error(`Failed to open keyboard ${devicePath}:`, error);
    }
  }

  /**
   * Set up evdev listener for a mouse device (buttons only, position from xdotool)
   */
  private setupMouseDevice(devicePath: string): void {
    try {
      const evdev = new Evdev();

      // Handle mouse button events
      evdev.on('EV_KEY', (data: { code: string; value: number }) => {
        if (!this.isRecording) return;

        const { code, value } = data;

        // Only handle mouse buttons
        if (!code.startsWith('BTN_')) return;

        const button = MOUSE_BUTTON_MAP[code];
        if (button && (value === 0 || value === 1)) {
          const event: RecordedEvent = {
            timestamp: Date.now(),
            type: 'mouse',
            action: value === 1 ? 'press' : 'release',
            button,
            x: this.constrainX(this.lastMouseX),
            y: this.constrainY(this.lastMouseY),
          };

          this.writeQueue.push(event);
          this.eventCount++;
        }
      });

      evdev.on('error', (err: Error) => {
        console.error(`evdev mouse error on ${devicePath}:`, err.message);
      });

      evdev.open(devicePath);
      this.evdevInstances.push(evdev);
      console.log(`Listening to mouse buttons: ${devicePath}`);
    } catch (error) {
      console.error(`Failed to open mouse ${devicePath}:`, error);
    }
  }

  /**
   * Constrain X coordinate to screen bounds
   */
  private constrainX(x: number): number {
    return Math.max(0, Math.min(x, this.config.screenWidth));
  }

  /**
   * Constrain Y coordinate to screen bounds
   */
  private constrainY(y: number): number {
    return Math.max(0, Math.min(y, this.config.screenHeight));
  }

  /**
   * Start periodic flush of events to file
   */
  private startPeriodicFlush(): void {
    this.flushInterval = setInterval(() => {
      if (!this.isRecording) return;
      this.flushEvents();
    }, 100); // Flush every 100ms
  }

  /**
   * Flush events from queue to file
   */
  private flushEvents(): void {
    if (!this.outputStream || this.writeQueue.length === 0) {
      return;
    }

    for (const event of this.writeQueue) {
      const jsonLine = JSON.stringify(event) + '\n';
      this.outputStream.write(jsonLine);
    }

    this.writeQueue = [];
  }

  /**
   * Stop recording events
   */
  public async stopRecording(): Promise<number> {
    if (!this.isRecording) {
      console.warn('No event recording in progress');
      return this.eventCount;
    }

    this.isRecording = false;

    // Stop flush interval
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }

    // Stop mouse position polling
    if (this.mousePositionInterval) {
      clearInterval(this.mousePositionInterval);
      this.mousePositionInterval = null;
    }

    // Flush remaining events
    this.flushEvents();

    // Close evdev instances
    for (const evdev of this.evdevInstances) {
      try {
        evdev.close();
      } catch {
        // Ignore close errors
      }
    }
    this.evdevInstances = [];

    // Close output stream
    if (this.outputStream) {
      await new Promise<void>((resolve, reject) => {
        this.outputStream?.end((error: Error | null | undefined) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
      this.outputStream = null;
    }

    console.log(`Event recording stopped. Total events: ${this.eventCount}`);
    return this.eventCount;
  }

  /**
   * Get current event count
   */
  public getEventCount(): number {
    return this.eventCount;
  }

  /**
   * Check if recording is in progress
   */
  public isActive(): boolean {
    return this.isRecording;
  }
}

/**
 * Utility function to read events from JSONL file
 */
export async function readEventsFromFile(filePath: string): Promise<RecordedEvent[]> {
  const content = await fs.readFile(filePath, 'utf8');
  const lines = content.trim().split('\n');
  const events: RecordedEvent[] = [];

  for (const line of lines) {
    if (line.trim()) {
      try {
        const event = JSON.parse(line) as RecordedEvent;
        events.push(event);
      } catch (error) {
        console.error(`Failed to parse event line: ${line}`);
      }
    }
  }

  return events;
}

/**
 * Utility function to get events within a time range
 */
export function getEventsInTimeRange(
  events: RecordedEvent[],
  startTime: number,
  endTime: number,
): RecordedEvent[] {
  return events.filter((event) => event.timestamp >= startTime && event.timestamp <= endTime);
}

/**
 * Utility function to get events by type
 */
export function getEventsByType(
  events: RecordedEvent[],
  type: 'keyboard' | 'mouse',
): RecordedEvent[] {
  return events.filter((event) => event.type === type);
}
