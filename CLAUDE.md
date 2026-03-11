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

## Completed Development

### Data Cleaning Utility ✅ COMPLETE

The data cleaning utility (`clean-training-data.ts`) has been updated to work with the video-based data capture paradigm:

- FFmpeg frame extraction from `video.mp4`
- Event-to-frame alignment with keyboard/mouse state tracking
- Mouse coordinates normalized to [0,1] range
- TensorFlow.js-compatible output format

### GUI Enhancements ✅ COMPLETE

**Train Model Page:**
- Directory selection for training data and model output
- Model naming support (save to `models/<model_name>/`)
- Real-time epoch progress with train/val loss display
- Model architecture, epochs, batch size, learning rate configuration

**Play/Run Agent Page:**
- Model selection with directory browser
- Target window configuration
- Inference settings (FPS, smoothing, confidence threshold)
- Safe mode toggle (predictions only vs. actual input control)
- Real-time inference stats display

### Training Architecture ✅ COMPLETE

**Problem:** TensorFlow.js GPU bindings (`@tensorflow/tfjs-node-gpu`) conflict with Electron's native module loading, causing SIGTRAP errors when training via the GUI.

**Solution:** Training is spawned as a separate child process:
- `TrainingService` in `ipc-handlers.ts` spawns `npm run train` with `--json-output` flag
- Training CLI outputs progress as JSON lines to stdout
- Main process parses JSON and forwards epoch events to renderer
- Avoids GPU library conflicts while maintaining real-time progress updates

**Key files:**
- `src/cli/tfjs-training-setup.ts` - Added `--json-output` flag and `outputJson()` function
- `src/main/ipc-handlers.ts` - `TrainingService` uses `spawn()` + `readline` for IPC

### Inference Integration ✅ COMPLETE

**Real-time inference:**
- `RealTimeInference.predictOnce()` - On-demand single prediction
- `RealTimeInference.getTargetWindowId()` - Window ID for controller
- Proper aim coordinate denormalization using actual window geometry
- `TargetAppAgent` uses real model inference instead of mock data

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
