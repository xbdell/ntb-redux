# app-training-bot

LM powered bot to control applications via imitation learning. Currently in a very alpha state. There are tons of things that can be done to improve it and some of the design decisions (mainly the data cleaning layer) are questionable to say the least. This works as a decent proof of concept and a way to get all the steps for the project laid out. Next up I look forward to going through and improving/cleaning everything up by hand.

## History

This is a second attempt at a project I started around 7 years ago. I had the basic idea for this project and even got around to creating the data collection portion [os-input-capture](https://github.com/github-bdem/os-input-capture) before life derailed my progess. Fast forward to now, and with all the advances in the LM landscape and tooling, I figured it would be a good time to try out the project again. This time I decided to also try out my new Anthropic subscription and see just how useful claude-code is when writing a project from the ground up.

## OS Dependencies

Currently only tested on Ubuntu 24 LTS. The following command will make sure all os level packages are installed.

- `sudo apt install ffmpeg scrot wmctrl xdotool xinput xev`

**Note:** FFmpeg is required for video-based data collection.

**Note:** User running program must be in the input group

## From beginning to end:

### Collect Data

Ensure the target application is running fullscreen on your leftmost monitor.

`npm run collect`

This will:

- Wait for you to press **SHIFT+CTRL+L** to start recording
- Record video (30fps by default) and all keyboard/mouse input
- Press **SHIFT+CTRL+L** again to stop recording
- Save to `training_data/session_TIMESTAMP/` containing:
  - `video.mp4` - Screen recording
  - `events.jsonl` - All keyboard/mouse events with timestamps
  - `metadata.json` - Session information

**Options:**

- `npm run collect:60fps` - Record at 60fps (larger files)

### Clean the data

Once you have the desired number of training data sets, clean and format them for TensorFlow training.

`npm run clean-data`

Will clean data from `training_data` into `cleaned_data`.

**What this step does:**
1. Extracts frames from recorded video at the capture framerate (cached for reuse)
2. Aligns input events (keyboard/mouse) to each frame by timestamp
3. Tracks keyboard state across frames (for held keys like WASD)
4. Converts raw events into training labels (movement vectors, aim position, actions)
5. Splits data into train/validation/test sets (70/20/10 by default)
6. Outputs in TensorFlow.js-compatible format

See [Data Cleaning Pipeline](#data-cleaning-pipeline) for detailed documentation.

### Train the model

Once we have the `cleaned_data` created we will want to finally train our model and save the trained weights.

`npm run train`

looks in `cleaned_data` and uses that info for training our tensorflow inference model, which it will then save in `models/model`

### Run the trained agent

We finally have a happy trained agent, time to allow it to control the application!

`npm run agent-mode`

will find the target window (configured in settings), starts grabbing screenshots of it, and then passes them into our trained tensorflow model (loaded from `models/model`).

## Electron GUI

In addition to the CLI tools, there is an Electron-based GUI that provides a unified interface for all operations.

### Running the GUI

**Development mode:**
```bash
npm run electron:dev
```

**Production preview:**
```bash
npm run electron:preview
```

**Package for distribution:**
```bash
npm run electron:package
```

### Global Hotkey

The Electron GUI supports a global hotkey for recording:

- **Ctrl+Shift+L** - Toggle recording on/off (works even when the app is in the background)

This allows you to start/stop recording without switching to the GUI window, which is useful when the target application is fullscreen.

## Project Structure

```
app-training-bot/
├── src/
│   ├── cli/                     # Standalone CLI tools
│   │   ├── index.ts             # CLI entry point
│   │   ├── video-data-collector.ts   # Video + input recording
│   │   ├── collect-video-data.ts     # Video collection CLI
│   │   ├── clean-training-data.ts    # Data preprocessing
│   │   ├── tfjs-training-setup.ts    # TensorFlow.js training
│   │   ├── target-app-agent.ts       # Application control agent
│   │   ├── display-capture.ts        # FFmpeg screen recording
│   │   ├── event-recorder.ts         # Keyboard/mouse event capture (evdev)
│   │   ├── input-capture.ts          # Common input event types
│   │   ├── window-utils.ts           # Window detection utilities (wmctrl/xwininfo)
│   │   ├── game-controller.ts        # Input controller (xdotool)
│   │   └── realtime-inference.ts     # Real-time model inference
│   │
│   ├── main/                    # Electron main process
│   │   ├── index.ts             # Main entry point, window creation
│   │   ├── ipc-handlers.ts      # IPC handlers wrapping CLI tools
│   │   └── preload.ts           # Preload script exposing APIs to renderer
│   │
│   ├── renderer/                # Electron renderer process (React)
│   │   ├── index.tsx            # React entry point
│   │   ├── App.tsx              # Main app with routing
│   │   ├── styles/index.css     # TailwindCSS + DaisyUI styles
│   │   └── pages/               # React page components
│   │       ├── CollectPage.tsx  # Data collection UI
│   │       ├── CleanPage.tsx    # Data cleaning UI
│   │       ├── TrainPage.tsx    # Model training UI
│   │       ├── PlayPage.tsx     # Agent/inference UI
│   │       └── SettingsPage.tsx # Settings UI
│   │
│   └── shared/                  # Shared types between main/renderer
│       ├── types.ts             # IPC channel types, configs, status types
│       └── config.ts            # Configuration file manager
│
├── dist/                        # Compiled output
│   ├── main/                    # Compiled main process (includes cli/)
│   └── renderer/                # Compiled renderer (Vite build)
│
├── training_data/               # Raw collected sessions
├── cleaned_data/                # Preprocessed training data
├── models/                      # Trained model weights
├── ntb-config.json              # User configuration (paths, defaults)
│
├── tsconfig.json                # Base TypeScript config
├── tsconfig.main.json           # Main process TypeScript config
├── vite.config.ts               # Vite config for renderer
├── postcss.config.js            # PostCSS config for TailwindCSS
├── electron-builder.json        # Electron packaging config
└── package.json
```

## IPC Architecture

The Electron app uses a secure IPC (Inter-Process Communication) architecture with context isolation:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Renderer Process (React)                        │
│                                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ CollectPage  │  │  CleanPage   │  │  TrainPage   │  │   PlayPage   │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘ │
│         │                 │                 │                 │          │
│         └─────────────────┴────────┬────────┴─────────────────┘          │
│                                    │                                     │
│                          window.electronAPI                              │
│                                    │                                     │
└────────────────────────────────────┼─────────────────────────────────────┘
                                     │ contextBridge
┌────────────────────────────────────┼─────────────────────────────────────┐
│                              Preload Script                              │
│                                    │                                     │
│              ipcRenderer.invoke() / ipcRenderer.on()                     │
└────────────────────────────────────┼─────────────────────────────────────┘
                                     │ IPC
┌────────────────────────────────────┼─────────────────────────────────────┐
│                           Main Process (Node.js)                         │
│                                    │                                     │
│                          ┌─────────┴─────────┐                           │
│                          │   IPC Handlers    │                           │
│                          └─────────┬─────────┘                           │
│                                    │                                     │
│    ┌───────────────┬───────────────┼───────────────┬───────────────┐     │
│    ▼               ▼               ▼               ▼               │     │
│ ┌──────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐    │     │
│ │Collection│ │   Cleaning   │ │   Training   │ │  Inference   │    │     │
│ │ Service  │ │   Service    │ │   Service    │ │   Service    │    │     │
│ └────┬─────┘ └──────┬───────┘ └──────┬───────┘ └──────┬───────┘    │     │
│      │              │                │                │            │     │
│      ▼              ▼                ▼                ▼            │     │
│ ┌──────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐    │     │
│ │VideoData │ │TrainingData  │ │ TensorFlow   │ │ TargetApp    │    │     │
│ │Collector │ │   Cleaner    │ │   Trainer    │ │   Agent      │    │     │
│ └──────────┘ └──────────────┘ └──────────────┘ └──────────────┘    │     │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### IPC Channels

| Channel | Direction | Description |
|---------|-----------|-------------|
| `system:get-monitors` | Request | Get list of connected monitors |
| `system:get-sessions` | Request | Get list of recorded sessions |
| `system:check-dependencies` | Request | Check if OS dependencies are installed |
| `collection:start` | Request | Start video + input recording |
| `collection:stop` | Request | Stop recording, return session info |
| `collection:get-status` | Request | Get current recording status |
| `collection:event-count` | Event | Real-time event count updates |
| `collection:stopped` | Event | Notification when recording stops |
| `cleaning:start` | Request | Start data cleaning/preprocessing |
| `cleaning:get-progress` | Request | Get cleaning progress |
| `cleaning:progress` | Event | Real-time cleaning progress updates |
| `training:start` | Request | Start model training |
| `training:stop` | Request | Stop training |
| `training:get-status` | Request | Get training status |
| `training:epoch` | Event | Epoch completion metrics |
| `training:complete` | Event | Training completed notification |
| `inference:start` | Request | Start AI agent |
| `inference:stop` | Request | Stop AI agent |
| `inference:get-status` | Request | Get inference status |
| `inference:stats` | Event | Real-time FPS and latency stats |
| `config:get` | Request | Get application configuration |
| `config:set` | Request | Save application configuration |
| `config:select-directory` | Request | Open directory picker dialog |

## Configuration

The application uses a configuration file (`ntb-config.json`) to store user preferences and paths. This file is created automatically when you first save settings in the GUI or can be created manually.

### Configuration File Structure

```json
{
  "paths": {
    "trainingData": "./training_data",
    "cleanedData": "./cleaned_data",
    "models": "./models"
  },
  "collection": {
    "defaultFps": 30,
    "defaultMonitor": "leftmost",
    "targetWindowName": ""
  },
  "training": {
    "defaultModelType": "custom_cnn",
    "defaultEpochs": 10,
    "defaultBatchSize": 32,
    "defaultLearningRate": 0.001
  },
  "inference": {
    "defaultFps": 30,
    "defaultSmoothingFactor": 0.3
  }
}
```

### Configuration Options

| Section | Option | Description | Default |
|---------|--------|-------------|---------|
| paths | trainingData | Directory for raw recorded sessions | `./training_data` |
| paths | cleanedData | Directory for preprocessed data | `./cleaned_data` |
| paths | models | Directory for trained models | `./models` |
| collection | defaultFps | Default recording frame rate | `30` |
| collection | defaultMonitor | Which monitor to record | `leftmost` |
| collection | targetWindowName | Target window name (empty = full monitor) | `` |
| training | defaultModelType | Default model architecture | `custom_cnn` |
| training | defaultEpochs | Default training epochs | `10` |
| training | defaultBatchSize | Default batch size | `32` |
| training | defaultLearningRate | Default learning rate | `0.001` |
| inference | defaultFps | Default inference FPS | `30` |
| inference | defaultSmoothingFactor | Action smoothing (0-1) | `0.3` |

Paths can be relative (resolved from current working directory) or absolute.

## Data Cleaning Pipeline

The data cleaning utility (`src/cli/clean-training-data.ts`) processes video-based training sessions into TensorFlow.js format.

### How It Works

```
training_data/session_*/
├── video.mp4          ──┐
├── events.jsonl       ──┼──► clean-training-data.ts ──► cleaned_data/
└── metadata.json      ──┘                               ├── train_data.json
                                                         ├── val_data.json
                                                         ├── test_data.json
                                                         ├── screenshots/
                                                         │   ├── frame_00000000.png
                                                         │   ├── frame_00000001.png
                                                         │   └── ...
                                                         └── dataset_info.json
```

### Pipeline Steps

1. **Frame Extraction** - Uses FFmpeg to extract PNG frames from `video.mp4` at the recording framerate. Frames are cached in `training_data/session_*/frames/` for reuse.

2. **Event Parsing** - Streams `events.jsonl` and parses timestamped keyboard/mouse events.

3. **Event-to-Frame Alignment** - Assigns events to frames based on time windows. Tracks keyboard state (held keys) and mouse state across frame boundaries.

4. **Filtering** - Removes frames without activity (no keyboard/mouse input).

5. **Action Extraction** - Converts frame state to training outputs:
   - `movement_x/y`: WASD keys mapped to [-1, 1] normalized vector
   - `aim_x/y`: Mouse position normalized to [0, 1] screen coordinates
   - `shooting`: Left mouse button state (0 or 1)

6. **Train/Val/Test Split** - Shuffles and splits data (default: 70% train, 20% val, 10% test).

### CLI Options

```bash
npm run clean-data -- [options]

Options:
  --val-split <num>    Validation split ratio (default: 0.2)
  --test-split <num>   Test split ratio (default: 0.1)
  --min-events <num>   Minimum input events per frame (default: 0)
  --force-extract      Re-extract frames even if they exist
  --help               Show help message
```

### Output Format

The cleaner produces TensorFlow.js-compatible JSON files:

**train_data.json / val_data.json / test_data.json:**
```json
{
  "samples": [{
    "screenshot": "screenshots/frame_00000000.png",
    "outputs": {
      "movement_x": 0.707,
      "movement_y": -0.707,
      "aim_x": 0.52,
      "aim_y": 0.48,
      "shooting": 1
    },
    "timestamp": 1234567890123
  }]
}
```

**dataset_info.json:**
```json
{
  "format": "tensorflow_js",
  "version": "2.0",
  "splits": { "train": 1000, "validation": 200, "test": 100 },
  "outputs": {
    "movement_x": { "type": "continuous", "range": [-1, 1] },
    "movement_y": { "type": "continuous", "range": [-1, 1] },
    "aim_x": { "type": "continuous", "range": [0, 1] },
    "aim_y": { "type": "continuous", "range": [0, 1] },
    "shooting": { "type": "binary", "range": [0, 1] }
  }
}
```
