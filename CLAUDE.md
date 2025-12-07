# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an LM-powered bot to control applications via imitation learning. The project uses TypeScript with Node.js and includes both CLI tools and an Electron GUI.

## Development Commands

### CLI Tools

- `npm run collect` - Collect training data (video + input events)
- `npm run collect:60fps` - Collect at 60fps
- `npm run clean-data` - Clean and preprocess training data
- `npm run train` - Train the TensorFlow.js model
- `npm run agent-mode` - Run the trained agent to control the application
- `npm run safe-test` - Test agent without controller (prediction only)

### Electron GUI

- `npm run electron:dev` - Run Electron app in development mode
- `npm run electron:build` - Build both main and renderer
- `npm run electron:preview` - Build and preview production app
- `npm run electron:package` - Package for distribution

### Building and Code Quality

- `npm run build` - Compile TypeScript to JavaScript
- `npm run typecheck` - Run TypeScript type checking without building
- `npm run lint` - Run ESLint to check for code issues
- `npm run lint:fix` - Auto-fix ESLint issues where possible
- `npm run format` - Format code with Prettier
- `npm run format:check` - Check if code is properly formatted

## Architecture

### Project Structure

```
src/
├── cli/                     # Standalone CLI tools
│   ├── index.ts             # CLI entry point
│   ├── video-data-collector.ts   # Video + input recording core
│   ├── collect-video-data.ts     # Video collection CLI entry
│   ├── clean-training-data.ts    # Data preprocessing
│   ├── tfjs-training-setup.ts    # TensorFlow.js training
│   ├── target-app-agent.ts       # Application control agent
│   ├── display-capture.ts        # FFmpeg screen recording
│   ├── event-recorder.ts         # Keyboard/mouse event capture (evdev)
│   ├── input-capture.ts          # Common input event types
│   ├── window-utils.ts           # Window detection utilities (wmctrl/xwininfo)
│   ├── game-controller.ts        # Input controller (xdotool)
│   └── realtime-inference.ts     # Real-time model inference
│
├── main/                    # Electron main process
│   ├── index.ts             # Window creation, app lifecycle
│   ├── ipc-handlers.ts      # IPC handlers wrapping CLI tools
│   └── preload.ts           # Context bridge for renderer
│
├── renderer/                # Electron renderer (React)
│   ├── index.tsx            # React entry point
│   ├── App.tsx              # Main app with routing
│   ├── styles/index.css     # TailwindCSS + DaisyUI (CSS-first config)
│   └── pages/               # Page components
│
└── shared/                  # Shared types
    ├── types.ts             # IPC types, configs, status types
    └── config.ts            # Configuration file manager (ntb-config.json)
```

### Key Technologies

- TypeScript 5.8+ with strict type checking
- Node.js with ES modules
- Electron for desktop GUI
- React with Vite for renderer
- TailwindCSS v4 + DaisyUI for styling
- TensorFlow.js for model training/inference
- FFmpeg for video capture
- evdev for Linux input capture

### IPC Architecture

The Electron app uses secure IPC with context isolation:

- Renderer calls `window.electronAPI.*` methods
- Preload script bridges to `ipcRenderer.invoke()`
- Main process handlers in `ipc-handlers.ts` wrap CLI tools
- Real-time events sent via `webContents.send()`
- Global hotkey (Ctrl+Shift+L) registered via Electron's `globalShortcut` API

## OS Dependencies (Linux only)

```bash
sudo apt install ffmpeg scrot wmctrl xdotool xinput xev
```

User must be in the `input` group for keyboard/mouse capture:

```bash
sudo usermod -aG input $USER
```

## Data Flow

1. **Collect** - Record video + input events to `training_data/`
2. **Clean** - Preprocess and split data to `cleaned_data/`
3. **Train** - Train TensorFlow.js model, save to `models/`
4. **Run Agent** - Load model and control application in real-time

## Configuration

The application uses `ntb-config.json` for user settings. Both CLI tools and the GUI read/write this file.

Key config sections:
- `paths` - trainingData, cleanedData, models directories
- `collection` - defaultFps, defaultMonitor, targetWindowName
- `training` - defaultModelType, defaultEpochs, defaultBatchSize, defaultLearningRate
- `inference` - defaultFps, defaultSmoothingFactor

CLI tools use config values as defaults but allow command-line overrides.

## Project Preferences

- Always keep README.md and CLAUDE.md up to date, include a step to update them if needed in every todo list
- If a multiphase plan is accepted, save the plan in both README.md and CLAUDE.md

## Current Development: Data Cleaning Utility Update

The data cleaning utility (`clean-training-data.ts`) needs to be updated to work with the new video-based data capture paradigm.

### Problem Statement

**Old Screenshot Paradigm (what cleaner expects):**
- `collection_metadata.json` with `dataPoints` array containing per-frame data
- Pre-existing `screenshotFile` paths for each frame
- Input events already grouped per-frame

**New Video-Based Capture (what collector produces):**
- `metadata.json` - session-level metadata (different structure)
- `video.mp4` - continuous video recording at 30/60fps
- `events.jsonl` - timestamped keyboard/mouse events (JSONL format)

**Critical Gap:** No frame extraction step exists - video frames need to be extracted and aligned with events.

### Implementation Plan

#### Phase 1: Video Frame Extraction ✅ COMPLETE
- [x] Add FFmpeg frame extraction from `video.mp4` at the recording framerate
- [x] Calculate frame timestamps: `startTime + (frameIndex / fps) * 1000`
- [x] Output frames as PNGs to `frames/` subdirectory within session
- [x] Handle extraction errors gracefully

**Implementation:** `src/cli/frame-extractor.ts` - New module providing:
- `extractFrames()` - Extracts frames using FFmpeg with progress callback
- `getVideoMetadata()` - Gets video duration, frame count, resolution via ffprobe
- `getFrameTimeWindow()` - Calculates time window for each frame
- `calculateFrameTimestamp()` / `timestampToFrameIndex()` - Timestamp utilities

#### Phase 2: Event-to-Frame Alignment ✅ COMPLETE
- [x] Parse `events.jsonl` - load all events with timestamps
- [x] Assign events to frames using time windows: Frame N covers `[frameTimestamp, frameTimestamp + frameDuration)`
- [x] Handle edge cases: events before first frame, after last frame
- [x] Maintain keyboard state across frame boundaries (key held down spans multiple frames)

**Implementation:** `src/cli/clean-training-data.ts` - Updated cleaner with:
- `parseEvents()` - Streams JSONL file and parses events
- `alignEventsToFrames()` - Assigns events to frames, tracks keyboard/mouse state
- `ProcessedFrame` type with `keyboardState: Set<string>` and `mouseState` object

#### Phase 3: Update Data Structures ✅ COMPLETE
- [x] Read new `metadata.json` format instead of `collection_metadata.json`
- [x] Generate `TrainingDataFrame` objects from extracted frames + aligned events
- [x] Update `CollectionMetadata` interface to match new format
- [x] Add `SessionMetadata` type from video-data-collector

**Implementation:** New types in `clean-training-data.ts`:
- `SessionMetadata` - Matches video-data-collector output
- `RawEvent` - Event from events.jsonl
- `ProcessedFrame` - Frame with aligned events and state
- `VideoSession` - Session ready for processing

#### Phase 4: Improve Action Extraction ✅ COMPLETE
- [x] Fix mouse coordinate handling - normalize to [0,1] range based on screen resolution
- [x] Implement proper key state tracking across frame boundaries
- [x] Mouse coordinates now normalized (was absolute, caused out-of-bounds predictions)
- [x] Removed old TODO comments, replaced with working implementation

**Implementation:** `extractActions()` method now:
- Uses `keyboardState` Set for accurate WASD tracking
- Normalizes mouse position to [0,1] using display resolution from metadata
- Tracks left/right mouse button state properly

#### Phase 5: Output Format & Integration ✅ COMPLETE
- [x] Update screenshot paths to point to extracted frame PNGs
- [x] Ensure output matches what `tfjs-training-setup.ts` expects
- [x] Add frame extraction parameters to `dataset_info.json`
- [x] Updated IPC handlers for GUI compatibility

**Implementation:**
- Frames copied to `cleaned_data/screenshots/` with global unique names
- `dataset_info.json` includes version 2.0, output descriptions, and ranges
- New CLI option `--force-extract` to re-extract frames
- `skipExistingFrames` config for caching extracted frames

### Data Format Reference

**Video Collector Output (`metadata.json`):**
```json
{
  "sessionId": "session_1234567890",
  "timestamp": 1234567890,
  "targetWindow": "GameName",
  "display": { "monitorName": "...", "resolution": {...}, "refreshRate": 144 },
  "video": { "filename": "video.mp4", "codec": "libx264", "recordingFramerate": 30 },
  "events": { "filename": "events.jsonl", "count": 1234 },
  "duration": 60.5
}
```

**Events Format (`events.jsonl`):**
```jsonl
{"timestamp":1234567890,"type":"keyboard","action":"press","key":"w"}
{"timestamp":1234567891,"type":"mouse","action":"move","x":500,"y":300}
{"timestamp":1234567892,"type":"mouse","action":"press","button":"left","x":500,"y":300}
```

**Expected Training Output (`train_data.json`):**
```json
{
  "samples": [{
    "screenshot": "screenshots/frame_0.png",
    "outputs": {
      "movement_x": -0.707,
      "movement_y": 0.0,
      "aim_x": 500,
      "aim_y": 300,
      "shooting": 1
    },
    "timestamp": 1234567890
  }]
}
```
