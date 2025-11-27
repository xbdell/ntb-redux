import { createWriteStream } from 'fs';
import type { WriteStream } from 'fs';
import { promises as fs } from 'fs';
import type { InputEvent } from './input-capture.js';
import { XInputCapture } from './xinput-capture.js';

export interface EventRecorderConfig {
  outputPath: string;
  screenWidth: number;
  screenHeight: number;
  bufferSize?: number; // Number of events to buffer before flushing
}

export interface RecordedEvent extends InputEvent {
  // All events already have timestamp from InputEvent
}

export class EventRecorder {
  private inputCapture: XInputCapture;
  private outputStream: WriteStream | null = null;
  private isRecording = false;
  private config: EventRecorderConfig;
  private eventCount = 0;
  private writeQueue: RecordedEvent[] = [];
  private flushInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: EventRecorderConfig) {
    this.config = config;
    this.inputCapture = new XInputCapture();
  }

  /**
   * Start recording events to JSONL file
   */
  public async startRecording(): Promise<void> {
    if (this.isRecording) {
      throw new Error('Event recording already in progress');
    }

    // Ensure output directory exists
    const outputDir = this.config.outputPath.substring(
      0,
      this.config.outputPath.lastIndexOf('/'),
    );
    await fs.mkdir(outputDir, { recursive: true });

    // Create write stream for JSONL output
    this.outputStream = createWriteStream(this.config.outputPath, {
      flags: 'w',
      encoding: 'utf8',
    });

    // Set screen dimensions for coordinate constraining
    this.inputCapture.setScreenDimensions(this.config.screenWidth, this.config.screenHeight);

    // Start input capture
    await this.inputCapture.startCapturing();

    this.isRecording = true;
    this.eventCount = 0;

    console.log(`Event recording started: ${this.config.outputPath}`);
    console.log(
      `Screen dimensions: ${this.config.screenWidth}x${this.config.screenHeight}`,
    );

    // Start periodic event collection and writing
    this.startEventCollection();
  }

  /**
   * Periodically collect events from input capture and write to file
   */
  private startEventCollection(): void {
    // Collect events every 100ms
    this.flushInterval = setInterval(() => {
      if (!this.isRecording) {
        return;
      }

      const newEvents = this.inputCapture.getNewEvents();

      if (newEvents.length > 0) {
        this.writeQueue.push(...newEvents);
        this.eventCount += newEvents.length;

        // Flush if buffer size reached or every interval
        const bufferSize = this.config.bufferSize || 100;
        if (this.writeQueue.length >= bufferSize) {
          this.flushEvents();
        }
      }
    }, 100);
  }

  /**
   * Flush events from queue to file
   */
  private flushEvents(): void {
    if (!this.outputStream || this.writeQueue.length === 0) {
      return;
    }

    for (const event of this.writeQueue) {
      // Write as JSONL (one JSON object per line)
      const jsonLine = JSON.stringify(event) + '\n';
      this.outputStream.write(jsonLine);
    }

    // Clear the queue
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

    // Stop collection interval
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }

    // Get any remaining events
    const remainingEvents = this.inputCapture.getNewEvents();
    if (remainingEvents.length > 0) {
      this.writeQueue.push(...remainingEvents);
      this.eventCount += remainingEvents.length;
    }

    // Flush remaining events
    this.flushEvents();

    // Stop input capture
    this.inputCapture.stopCapturing();

    // Close output stream
    if (this.outputStream) {
      await new Promise<void>((resolve, reject) => {
        this.outputStream?.end((error) => {
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
