/**
 * Frame Extractor - Extracts frames from video files using FFmpeg
 *
 * Part of the data cleaning pipeline: extracts individual PNG frames from
 * recorded video sessions for use in training data preparation.
 */

import { promisify } from 'util';
import { exec, spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';

const execAsync = promisify(exec);

export interface FrameExtractionConfig {
  /** Path to the input video file */
  videoPath: string;
  /** Directory to output extracted frames */
  outputDir: string;
  /** Framerate to extract at (should match recording framerate) */
  framerate: number;
  /** Session start timestamp (for calculating frame timestamps) */
  sessionStartTime: number;
  /** Optional: frame number to start from (0-based) */
  startFrame?: number;
  /** Optional: number of frames to extract (default: all) */
  frameCount?: number;
  /** Output image format */
  imageFormat?: 'png' | 'jpg';
  /** JPEG quality (1-100, only used if imageFormat is 'jpg') */
  jpegQuality?: number;
}

export interface ExtractedFrame {
  /** Frame index (0-based) */
  index: number;
  /** Calculated timestamp in milliseconds */
  timestamp: number;
  /** Path to the extracted frame image */
  path: string;
  /** Filename of the frame */
  filename: string;
}

export interface ExtractionResult {
  /** Total frames extracted */
  frameCount: number;
  /** List of extracted frames with metadata */
  frames: ExtractedFrame[];
  /** Directory containing extracted frames */
  outputDir: string;
  /** Duration of extraction in milliseconds */
  extractionTimeMs: number;
  /** Framerate used for extraction */
  framerate: number;
}

export interface ExtractionProgress {
  /** Current frame being extracted */
  currentFrame: number;
  /** Total frames to extract (if known) */
  totalFrames: number | null;
  /** Percentage complete (0-100) */
  percentComplete: number;
  /** Elapsed time in milliseconds */
  elapsedMs: number;
}

export type ProgressCallback = (progress: ExtractionProgress) => void;

/**
 * Verify FFmpeg is installed and available
 */
export async function verifyFfmpeg(): Promise<boolean> {
  try {
    await execAsync('which ffmpeg');
    return true;
  } catch {
    return false;
  }
}

/**
 * Get video metadata using ffprobe
 */
export async function getVideoMetadata(videoPath: string): Promise<{
  duration: number;
  frameCount: number;
  framerate: number;
  width: number;
  height: number;
}> {
  try {
    // Get duration and framerate
    const { stdout: probeOutput } = await execAsync(
      `ffprobe -v quiet -print_format json -show_format -show_streams "${videoPath}"`,
    );

    const probeData = JSON.parse(probeOutput) as {
      format?: { duration?: string };
      streams?: Array<{
        codec_type?: string;
        width?: number;
        height?: number;
        r_frame_rate?: string;
        nb_frames?: string;
        duration?: string;
      }>;
    };

    const videoStream = probeData.streams?.find((s) => s.codec_type === 'video');

    if (!videoStream) {
      throw new Error('No video stream found in file');
    }

    // Parse framerate (format: "30/1" or "30000/1001")
    const framerateStr = videoStream.r_frame_rate || '30/1';
    const [num, den] = framerateStr.split('/').map(Number);
    const framerate = num && den ? num / den : 30;

    // Get duration from format or stream
    const duration = parseFloat(probeData.format?.duration || videoStream.duration || '0');

    // Calculate frame count
    const frameCount = videoStream.nb_frames
      ? parseInt(videoStream.nb_frames)
      : Math.floor(duration * framerate);

    return {
      duration,
      frameCount,
      framerate: Math.round(framerate * 100) / 100,
      width: videoStream.width || 0,
      height: videoStream.height || 0,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to get video metadata: ${errorMessage}`);
  }
}

/**
 * Extract frames from a video file
 */
export async function extractFrames(
  config: FrameExtractionConfig,
  onProgress?: ProgressCallback,
): Promise<ExtractionResult> {
  const startTime = Date.now();

  // Verify FFmpeg is available
  if (!(await verifyFfmpeg())) {
    throw new Error('FFmpeg is not installed. Please install it: sudo apt install ffmpeg');
  }

  // Verify video file exists
  try {
    await fs.access(config.videoPath);
  } catch {
    throw new Error(`Video file not found: ${config.videoPath}`);
  }

  // Get video metadata for frame count estimation
  const videoMeta = await getVideoMetadata(config.videoPath);
  const totalFrames = config.frameCount || videoMeta.frameCount;

  // Create output directory
  await fs.mkdir(config.outputDir, { recursive: true });

  const imageFormat = config.imageFormat || 'png';
  const extension = imageFormat === 'jpg' ? 'jpg' : 'png';

  // Build FFmpeg arguments
  const args: string[] = [
    '-i',
    config.videoPath,
    '-vf',
    `fps=${config.framerate}`,
  ];

  // Add start frame if specified
  if (config.startFrame && config.startFrame > 0) {
    const startSeconds = config.startFrame / config.framerate;
    args.unshift('-ss', startSeconds.toString());
  }

  // Add frame count limit if specified
  if (config.frameCount) {
    args.push('-frames:v', config.frameCount.toString());
  }

  // Add format-specific options
  if (imageFormat === 'jpg') {
    args.push('-q:v', (config.jpegQuality || 95).toString());
  }

  // Output pattern
  const outputPattern = join(config.outputDir, `frame_%06d.${extension}`);
  args.push('-y', outputPattern);

  console.log(`Extracting frames from: ${config.videoPath}`);
  console.log(`Output directory: ${config.outputDir}`);
  console.log(`Framerate: ${config.framerate} fps`);
  console.log(`Expected frames: ~${totalFrames}`);

  // Run FFmpeg
  const extractedFrames = await new Promise<ExtractedFrame[]>((resolve, reject) => {
    const process: ChildProcess = spawn('ffmpeg', args);
    let currentFrame = 0;
    let lastProgressUpdate = Date.now();

    process.stderr?.on('data', (data: Buffer) => {
      const output = data.toString();

      // Parse frame progress from FFmpeg output
      const frameMatch = output.match(/frame=\s*(\d+)/);
      if (frameMatch && frameMatch[1]) {
        currentFrame = parseInt(frameMatch[1]);

        // Throttle progress updates to ~10 per second
        const now = Date.now();
        if (onProgress && now - lastProgressUpdate > 100) {
          lastProgressUpdate = now;
          onProgress({
            currentFrame,
            totalFrames,
            percentComplete: totalFrames ? Math.round((currentFrame / totalFrames) * 100) : 0,
            elapsedMs: now - startTime,
          });
        }
      }

      // Log errors
      if (output.toLowerCase().includes('error')) {
        console.error('FFmpeg error:', output);
      }
    });

    process.on('error', (error) => {
      reject(new Error(`FFmpeg process error: ${error.message}`));
    });

    process.on('exit', async (code) => {
      if (code !== 0) {
        reject(new Error(`FFmpeg exited with code ${code}`));
        return;
      }

      // Read extracted frames and build metadata
      try {
        const files = await fs.readdir(config.outputDir);
        const frameFiles = files
          .filter((f) => f.startsWith('frame_') && f.endsWith(`.${extension}`))
          .sort();

        const frames: ExtractedFrame[] = frameFiles.map((filename, index) => {
          // Calculate timestamp for this frame
          const frameIndex = config.startFrame ? config.startFrame + index : index;
          const frameDurationMs = 1000 / config.framerate;
          const timestamp = config.sessionStartTime + frameIndex * frameDurationMs;

          return {
            index: frameIndex,
            timestamp: Math.round(timestamp),
            path: join(config.outputDir, filename),
            filename,
          };
        });

        resolve(frames);
      } catch (err) {
        reject(err);
      }
    });
  });

  const extractionTimeMs = Date.now() - startTime;

  console.log(`Extraction complete: ${extractedFrames.length} frames in ${(extractionTimeMs / 1000).toFixed(1)}s`);

  return {
    frameCount: extractedFrames.length,
    frames: extractedFrames,
    outputDir: config.outputDir,
    extractionTimeMs,
    framerate: config.framerate,
  };
}

/**
 * Calculate frame timestamp based on index and framerate
 */
export function calculateFrameTimestamp(
  frameIndex: number,
  framerate: number,
  sessionStartTime: number,
): number {
  const frameDurationMs = 1000 / framerate;
  return Math.round(sessionStartTime + frameIndex * frameDurationMs);
}

/**
 * Calculate which frame a timestamp belongs to
 */
export function timestampToFrameIndex(
  timestamp: number,
  framerate: number,
  sessionStartTime: number,
): number {
  const frameDurationMs = 1000 / framerate;
  const relativeTime = timestamp - sessionStartTime;
  return Math.floor(relativeTime / frameDurationMs);
}

/**
 * Get the time window for a specific frame
 */
export function getFrameTimeWindow(
  frameIndex: number,
  framerate: number,
  sessionStartTime: number,
): { start: number; end: number } {
  const frameDurationMs = 1000 / framerate;
  const start = sessionStartTime + frameIndex * frameDurationMs;
  const end = start + frameDurationMs;
  return {
    start: Math.round(start),
    end: Math.round(end),
  };
}
