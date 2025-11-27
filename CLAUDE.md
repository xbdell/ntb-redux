# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an LM-powered bot for playing the video game Nuclear Throne. The project uses TypeScript with Node.js and includes both CLI tools and an Electron GUI.

## Development Commands

### CLI Tools

- `npm run collect` - Collect training data (screenshot-based, legacy)
- `npm run collect-video` - Collect training data (video-based, recommended)
- `npm run collect-video:60fps` - Collect at 60fps
- `npm run clean-data` - Clean and preprocess training data
- `npm run train` - Train the TensorFlow.js model
- `npm run agent-mode` - Run the trained agent to play the game
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
│   ├── nuclear-throne-ai.ts      # Game-playing agent
│   ├── display-capture.ts        # FFmpeg screen recording
│   ├── event-recorder.ts         # Keyboard/mouse event capture
│   ├── screenshot-capture.ts     # Screenshot utilities
│   ├── game-controller.ts        # Game input controller
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

## OS Dependencies (Linux only)

```bash
sudo apt install ffmpeg scrot wmctrl xdotool xinput xev
```

User must be in the `input` group for keyboard/mouse capture:

```bash
sudo usermod -aG input $USER
```

## Data Flow

1. **Collect** - Record gameplay video + input events to `training_data/`
2. **Clean** - Preprocess and split data to `cleaned_data/`
3. **Train** - Train TensorFlow.js model, save to `models/`
4. **Play** - Load model and control game in real-time

## Configuration

The application uses `ntb-config.json` for user settings. Both CLI tools and the GUI read/write this file.

Key config sections:
- `paths` - trainingData, cleanedData, models directories
- `collection` - defaultFps, defaultMonitor, gameProcessName
- `training` - defaultModelType, defaultEpochs, defaultBatchSize, defaultLearningRate
- `inference` - defaultFps, defaultSmoothingFactor

CLI tools use config values as defaults but allow command-line overrides.

## Project Preferences

- Always keep README.md and CLAUDE.md up to date, include a step to update them if needed in every todo list
- If a multiphase plan is accepted, save the plan in both README.md and CLAUDE.md
