import { DisplayCapture } from './display-capture.js';
import type { MonitorInfo } from './display-capture.js';
import { EventRecorder } from './event-recorder.js';
import { promises as fs } from 'fs';
import { join } from 'path';
import type { ChildProcess } from 'child_process';

export interface VideoCollectionConfig {
  outputDir: string;
  gameProcessName: string;
  recordingFramerate: 30 | 60;
  videoCodec: 'libx264' | 'libx265';
  compressionQuality: number; // CRF: 18-28, lower is better
  targetMonitor: 'leftmost' | 'primary';
}

export interface SessionMetadata {
  sessionId: string;
  timestamp: number;
  gameProcess: string;
  display: {
    monitorName: string;
    resolution: { width: number; height: number };
    refreshRate: number;
    fullscreen: boolean;
  };
  video: {
    filename: string;
    codec: string;
    recordingFramerate: number;
    displayFramerate: number;
    resolution: { width: number; height: number };
  };
  events: {
    filename: string;
    count: number;
  };
  duration: number;
  fileSize?: {
    video: number;
    events: number;
  };
}

export class VideoDataCollector {
  private displayCapture: DisplayCapture;
  private eventRecorder: EventRecorder | null = null;
  private config: VideoCollectionConfig;
  private monitor: MonitorInfo | null = null;
  private isCollecting = false;
  private sessionId: string = '';
  private sessionDir: string = '';
  private startTime: number = 0;
  private recordingProcess: ChildProcess | null = null;

  constructor(config: VideoCollectionConfig) {
    this.config = config;
    this.displayCapture = new DisplayCapture();
  }

  /**
   * Initialize the collector - detect display and verify game
   */
  public async initialize(): Promise<void> {
    console.log('Initializing video data collector...');

    // Get target monitor
    if (this.config.targetMonitor === 'leftmost') {
      this.monitor = await this.displayCapture.getLeftmostMonitor();
    } else {
      this.monitor = await this.displayCapture.getPrimaryMonitor();
    }

    console.log(
      `Target monitor: ${this.monitor.name} (${this.monitor.width}x${this.monitor.height} @ ${this.monitor.refreshRate}Hz)`,
    );

    // Create session ID and directory
    this.sessionId = `session_${Date.now()}`;
    this.sessionDir = join(this.config.outputDir, this.sessionId);
    await fs.mkdir(this.sessionDir, { recursive: true });

    console.log(`Session directory: ${this.sessionDir}`);

    // Initialize event recorder
    const eventsPath = join(this.sessionDir, 'events.jsonl');
    this.eventRecorder = new EventRecorder({
      outputPath: eventsPath,
      screenWidth: this.monitor.width,
      screenHeight: this.monitor.height,
      bufferSize: 100,
      mouseMoveThrottle: 12, // Record 1 out of every 3 mouse move events (~20Hz effective)
    });

    console.log('Initialization complete');
  }

  /**
   * Start data collection
   */
  public async startCollection(): Promise<void> {
    if (this.isCollecting) {
      throw new Error('Collection already in progress');
    }

    if (!this.monitor || !this.eventRecorder) {
      await this.initialize();
    }

    if (!this.monitor || !this.eventRecorder) {
      throw new Error('Failed to initialize collector');
    }

    this.isCollecting = true;
    this.startTime = Date.now();

    console.log('\n========================================');
    console.log('Starting data collection...');
    console.log(`Session: ${this.sessionId}`);
    console.log(`Frame rate: ${this.config.recordingFramerate} fps`);
    console.log('========================================\n');

    // Start event recording
    console.log('Starting event recording...');
    await this.eventRecorder.startRecording();

    // Start video recording
    console.log('Starting video recording...');
    const videoPath = join(this.sessionDir, 'video.mp4');

    this.recordingProcess = await this.displayCapture.startRecording({
      outputPath: videoPath,
      framerate: this.config.recordingFramerate,
      width: this.monitor.width,
      height: this.monitor.height,
      offsetX: this.monitor.offsetX,
      offsetY: this.monitor.offsetY,
      codec: this.config.videoCodec,
      preset: 'ultrafast',
      crf: this.config.compressionQuality,
    });

    console.log('\n✅ Collection started successfully!');
    console.log('Press SHIFT+CTRL+L to stop recording\n');
  }

  /**
   * Stop data collection
   */
  public async stopCollection(): Promise<SessionMetadata> {
    if (!this.isCollecting) {
      throw new Error('No collection in progress');
    }

    console.log('\n========================================');
    console.log('Stopping data collection...');
    console.log('========================================\n');

    this.isCollecting = false;

    // Stop video recording
    console.log('Stopping video recording...');
    await this.displayCapture.stopRecording();

    // Stop event recording
    console.log('Stopping event recording...');
    const eventCount = this.eventRecorder ? await this.eventRecorder.stopRecording() : 0;

    const endTime = Date.now();
    const duration = (endTime - this.startTime) / 1000; // seconds

    console.log(`\nCollection complete!`);
    console.log(`Duration: ${duration.toFixed(2)} seconds`);
    console.log(`Events recorded: ${eventCount}`);

    // Generate and save metadata
    const metadata = await this.generateMetadata(duration, eventCount);
    await this.saveMetadata(metadata);

    console.log(`\n✅ Session saved: ${this.sessionDir}`);
    console.log(`Video: ${join(this.sessionDir, 'video.mp4')}`);
    console.log(`Events: ${join(this.sessionDir, 'events.jsonl')}`);
    console.log(`Metadata: ${join(this.sessionDir, 'metadata.json')}`);

    return metadata;
  }

  /**
   * Generate session metadata
   */
  private async generateMetadata(duration: number, eventCount: number): Promise<SessionMetadata> {
    if (!this.monitor) {
      throw new Error('Monitor info not available');
    }

    const videoPath = join(this.sessionDir, 'video.mp4');
    const eventsPath = join(this.sessionDir, 'events.jsonl');

    // Get file sizes
    let videoSize = 0;
    let eventsSize = 0;

    try {
      const videoStat = await fs.stat(videoPath);
      videoSize = videoStat.size;
    } catch {
      console.warn('Could not get video file size');
    }

    try {
      const eventsStat = await fs.stat(eventsPath);
      eventsSize = eventsStat.size;
    } catch {
      console.warn('Could not get events file size');
    }

    const metadata: SessionMetadata = {
      sessionId: this.sessionId,
      timestamp: this.startTime,
      gameProcess: this.config.gameProcessName,
      display: {
        monitorName: this.monitor.name,
        resolution: {
          width: this.monitor.width,
          height: this.monitor.height,
        },
        refreshRate: this.monitor.refreshRate,
        fullscreen: true,
      },
      video: {
        filename: 'video.mp4',
        codec: this.config.videoCodec,
        recordingFramerate: this.config.recordingFramerate,
        displayFramerate: this.monitor.refreshRate,
        resolution: {
          width: this.monitor.width,
          height: this.monitor.height,
        },
      },
      events: {
        filename: 'events.jsonl',
        count: eventCount,
      },
      duration,
      fileSize: {
        video: videoSize,
        events: eventsSize,
      },
    };

    return metadata;
  }

  /**
   * Save metadata to file
   */
  private async saveMetadata(metadata: SessionMetadata): Promise<void> {
    const metadataPath = join(this.sessionDir, 'metadata.json');
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
    console.log(`\nMetadata saved: ${metadataPath}`);
  }

  /**
   * Get current session info
   */
  public getSessionInfo(): { sessionId: string; sessionDir: string; isCollecting: boolean } {
    return {
      sessionId: this.sessionId,
      sessionDir: this.sessionDir,
      isCollecting: this.isCollecting,
    };
  }

  /**
   * Check if collection is in progress
   */
  public isActive(): boolean {
    return this.isCollecting;
  }
}
