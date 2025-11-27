# ntb-redux

LM powered bot to play the video game nuclear throne. Currently in a very alpha state. There are tons of things that can be done to improve it and some of the design decisions (mainly the data cleaning layer) are questionable to say the least. This works as a decent proof of concept and a way to get all the steps for the project laid out. Next up I look forward to going through and improving/cleaning everything up by hand.

## History

This is a second attempt at a project I started around 7 years ago. I had the basic idea for this project and even got around to creating the data collection portion [os-input-capture](https://github.com/github-bdem/os-input-capture) before life derailed my progess. Fast forward to now, and with all the advances in the LM landscape and tooling, I figured it would be a good time to try out the project again. This time I decided to also try out my new Anthropic subscription and see just how useful claude-code is when writing a project from the ground up.

## OS Dependencies

Currently only tested on Ubuntu 24 LTS. The following command will make sure all os level packages are installed.

- `sudo apt install ffmpeg scrot wmctrl xdotool xinput xev`

**Note:** FFmpeg is required for video-based data collection.

**Note:** User running program must be in the input group

## From beginning to end:

### Collect Data

There are two methods for collecting training data:

#### Method 1: Video-based Collection (Recommended)

Ensure that Nuclear Throne is running fullscreen on your leftmost monitor.

`npm run collect-video`

This will:

- Wait for you to press **SHIFT+CTRL+L** to start recording
- Record video (30fps by default) and all keyboard/mouse input
- Press **SHIFT+CTRL+L** again to stop recording
- Save to `training_data/session_TIMESTAMP/` containing:
  - `video.mp4` - Screen recording of gameplay
  - `events.jsonl` - All keyboard/mouse events with timestamps
  - `metadata.json` - Session information

**Options:**

- `npm run collect-video:60fps` - Record at 60fps (larger files)

**Advantages:**

- More storage efficient (compressed video vs thousands of PNGs)
- Higher temporal fidelity (continuous frames)
- Easier to review and verify training data quality
- Better for 144Hz displays (records at 30/60fps, not full 144fps)

#### Method 2: Screenshot-based Collection (Legacy)

Ensure that nuclearthrone window is running and visible (preferably on the first level so we can skip menus tainting the dataset).

`npm run collect`

This will collect all keyboard and mouse input for 100 seconds along with screenshots of the target window and put them into a `training_data/session_TIMESTAMP` folder

### Clean the data

NOTE: This step is really whacky right now, it really really needs work.

Once you have the desired number of training data sets, we would want to clean those data sets and format them for our tensorflow inference layer training. Right now we have extremely rudimentary cleaning, but this is just a first up proof of concept.

`npm run clean-data`

Will clean data from `training_data` into `cleaned_data`.

### Train the model

Once we have the `cleaned_data` created we will want to finally train our model and save the trained weights.

`npm run train`

looks in `cleaned_data` and uses that info for training our tensorflow inference model, which it will then save in `models/model`

### Run the trained agent

We finally have a happy trained agent, time to allow it to play the game!

`npm run agent-mode`

will find the target window, by default `nuclearthrone`, starts grabbing screenshots of it, and then passes them into our trained tensorflow model (loaded from `models/model`).

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

## Project Structure

```
ntb-redux/
├── src/
│   ├── cli/                     # Standalone CLI tools
│   │   ├── index.ts             # CLI entry point
│   │   ├── video-data-collector.ts   # Video + input recording
│   │   ├── collect-video-data.ts     # Video collection CLI
│   │   ├── clean-training-data.ts    # Data preprocessing
│   │   ├── tfjs-training-setup.ts    # TensorFlow.js training
│   │   ├── nuclear-throne-ai.ts      # Game-playing agent
│   │   ├── display-capture.ts        # FFmpeg screen recording
│   │   ├── event-recorder.ts         # Keyboard/mouse event capture
│   │   ├── screenshot-capture.ts     # Screenshot utilities
│   │   ├── game-controller.ts        # Game input controller
│   │   ├── realtime-inference.ts     # Real-time model inference
│   │   └── ...
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
│ │VideoData │ │TrainingData  │ │ TensorFlow   │ │NuclearThrone │    │     │
│ │Collector │ │   Cleaner    │ │   Trainer    │ │     AI       │    │     │
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
    "gameProcessName": "nuclearthrone"
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
| collection | gameProcessName | Game window name | `nuclearthrone` |
| training | defaultModelType | Default model architecture | `custom_cnn` |
| training | defaultEpochs | Default training epochs | `10` |
| training | defaultBatchSize | Default batch size | `32` |
| training | defaultLearningRate | Default learning rate | `0.001` |
| inference | defaultFps | Default inference FPS | `30` |
| inference | defaultSmoothingFactor | Action smoothing (0-1) | `0.3` |

Paths can be relative (resolved from current working directory) or absolute.
