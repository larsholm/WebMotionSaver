# WebMotion Saver

A **privacy-first** motion detection surveillance web camera app. Everything runs in your browser — **camera data never leaves your device**.

## Features

- 🎥 **Live camera preview** with real-time motion detection overlay
- 🎯 **Pixel-based motion detection** — configurable sensitivity threshold
- 🎬 **Automatic clip recording** — starts when motion is detected, stops after a grace period
- 📸 **Snapshot capture** — save a still image at any time
- 💾 **Local storage** — clips saved to IndexedDB (your browser's local database)
- ⬇️ **Download & playback** — watch, download, or delete clips individually or in bulk
- ⚙️ **Full settings control** — resolution, sensitivity, sample rate, quality, format, storage limits

## Privacy Guarantee

| What | Where |
|------|-------|
| Camera frames | Your device only (canvas API) |
| Motion analysis | Your CPU (pixel diffing) |
| Video clips | Your browser's IndexedDB |
| Settings | Your browser's localStorage |

**Zero server communication.** No API calls. No analytics. Your data stays yours.

## Settings

### Camera
- **Resolution**: 320×240 up to 1920×1080
- **Camera device**: Select from available webcams

### Motion Detection
- **Sensitivity** (1–100%): How much change triggers recording
- **Sample rate** (1–10 fps): How often frames are compared
- **Grace period** (1–120s): How long to keep recording after motion stops
- **Min clip duration** (1–60s): Discard clips shorter than this to filter false positives

### Recording
- **Quality**: Low/Medium/High (controls bitrate)
- **Format**: WebM or MP4 (depends on browser support)

### Storage
- **Max clips**: Auto-delete oldest when this limit is reached
- Shows total storage used

## Browser Support

Requires a modern browser with:
- `getUserMedia` API (Chrome 47+, Firefox 38+, Safari 11+, Edge 79+)
- `MediaRecorder` API (Chrome 49+, Firefox 29+, Edge 79+)
- `IndexedDB` (all modern browsers)

Best experience on **Chrome** or **Edge** (full WebM + VP9 support).

## Usage

1. Open `index.html` in your browser (or serve via any static server)
2. Go to the **Camera** tab and click **Start Camera**
3. Adjust **Settings** as needed (resolution, sensitivity, etc.)
4. Walk in front of the camera — motion detection will auto-record
5. View/download clips on the **Clips** tab

## Running Locally

```bash
# Install a simple server
npm install

# Start local server
npm start
# Opens http://localhost:3000
```

> **Note**: `getUserMedia` requires either `https://` or `localhost`. Opening `file://` may not work in all browsers.

## Architecture

```
┌─────────────────────────────────────────────┐
│                  Browser                     │
│  ┌──────────┐  ┌────────────┐  ┌────────┐  │
│  │ getUserMedia │ Motion    │  │IndexedDB│  │
│  │   (Camera) │  │ Detector  │  │ (Clips)│  │
│  └─────┬──────┘  └────┬─────┘  └────┬───┘  │
│        │              │              │       │
│  ┌─────▼──────┐  ┌───▼────────┐     │       │
│  │ MediaRecorder│ │ Canvas    │     │       │
│  │  (Record)   │ │ (Diffing) │     │       │
│  └────────────┘  └────────────┘     │       │
│                                      │       │
└──────────────────────────────────────┼───────┘
                                       │
                            No server connection
```

## License

MIT
