# ⚡ M3U8 Multi-Stream Downloader

A browser-automation toolkit powered by **Playwright** that scrapes episode lists, intercepts HLS streams (`.m3u8`), analyzes the master playlist for the best quality (highest-resolution video, original-language audio, subtitles), and automatically downloads & muxes everything into a complete MP4/MKV file via **FFmpeg**.

Specially optimized for **TV360.vn** through Next.js hydration-data extraction combined with lazy-load DOM scraping. Supports persistent login sessions so you only need to sign in once.

---

## 🚀 Key Features

### 🌐 Modern Web Dashboard
A premium dark-themed control panel built with glassmorphism aesthetics. Real-time console logs and download progress are streamed live via **WebSocket** — no page refreshes needed.

### 🌍 Bilingual UI (Vietnamese / English)
One-click **VI | EN** language toggle in the header. The entire interface — including the history table, activity log, and even server-originated messages — is translated instantly without reloading. Your preference is saved in `localStorage`.

### ⚡ Smart Launchers (Windows `.bat`)
- **`Quick_Start.bat`**: Checks if the server is already running (via `/api/health`). If so, it simply opens the browser — no duplicate processes. If not, it starts the server in the background, waits until it's ready, and shows **specific error messages** (from `server_err.log`) if startup fails.
- **`Stop_Server.bat`**: Graceful-first shutdown — sends a shutdown API call; only force-kills the process (including children) if the server is unresponsive. Identifies the correct `node` process to avoid affecting other apps on port `3000`.
- **⏻ Shutdown button** on the Dashboard: Gracefully stops all FFmpeg child processes, closes the Playwright browser, and flushes the download queue before exiting.

### 📂 Checkbox Episode Grid
Episodes are displayed in a visual grid with checkboxes, letting you freely select any combination of episodes to download — unlike older CLI tools that only offered "download one" or "download all".

### 🔊 Audio & Subtitle Track Selection
Before downloading, you can **analyze the master playlist** to discover all available audio and subtitle tracks. Pick exactly which languages you want — the selection is applied to every episode in the batch. Multiple audio tracks are muxed into a single **MKV** file.

### 🔑 Original Audio Priority
The parser automatically classifies audio tracks by language (Korean, English, Japanese, Chinese, etc.) and flags Vietnamese dubs/voiceovers, making it easy to select the original-language audio instead of a dubbed version.

### 📝 Automatic Subtitle Download & Matching
Subtitles (`.vtt`, `.srt`) are captured from both the HLS master playlist and network interception. Each subtitle is saved as an `.srt` file matching the video filename (e.g., `Episode 1.vi.srt`), so media players auto-detect them. A "default" subtitle (Vietnamese → English → first available) is also copied as `Episode 1.srt` for maximum compatibility.

### 📊 Real-Time Progress Tracking
- **FFmpeg engine**: Parses `time=` and `speed=` from FFmpeg's stderr output.
- **N_m3u8DL-RE engine**: Parses percentage and speed from console output.
- Progress bars, speed indicators, and per-episode status are pushed to the Dashboard in real time via WebSocket.

### 🚀 High-Speed Download Engine: N_m3u8DL-RE (Optional)
When the [N_m3u8DL-RE](https://github.com/nilaoda/N_m3u8DL-RE) binary is detected, the system downloads **16 segments in parallel** per stream (vastly faster than FFmpeg's sequential approach), then uses FFmpeg to mux the local files (stream copy — instant). If the binary is not found, it falls back to FFmpeg automatically.

### 🔄 Concurrent Downloads with Worker Pool
Up to **3 episodes download simultaneously** by default (configurable via `max_concurrent_downloads`). M3U8 interception is serialized through a browser mutex (single Playwright page), but the actual downloading runs in parallel.

### ⏱️ Smart Retry with Exponential Backoff
Each episode is retried up to **5 times** (configurable via `max_retries`). Wait times between retries increase exponentially (3s → 6s → 12s → 24s → 30s cap), helping survive transient CDN errors and expired tokens.

### 🔄 Resumable JSON Queue
The download queue is persisted in `download_status.json`. On restart, episodes stuck in `downloading` are reset to `pending`, completed episodes are skipped, and failed episodes are retried — all automatically.

### 💪 Force Re-Download
Tick **"Re-download episodes already completed"** before starting to ignore history and re-download selected episodes from scratch, overwriting existing files.

### 📜 Download History Panel
View status, retry count, timestamps, and error reasons for every episode — right on the Dashboard. Supports:
- Retrying individual episodes (even successful ones)
- Retrying all failed episodes at once
- Removing individual items or clearing the entire history
- Filtering by status (All / Failed / Success / Pending)

### 🔑 Persistent Login Sessions
Uses Playwright's `persistentContext` stored in `./user_data`. Sign in manually on the first run — all subsequent runs automatically reuse your session/cookies.

### 📁 Remembered Save Folder
The last-used download directory is saved in `settings.json` and auto-filled on the next launch. The Windows folder picker dialog also opens at that location and is forced to the foreground.

### 🖥️ CLI Mode
Prefer the terminal? Run `npm start -- --cli` for a classic command-line interface with interactive prompts for URL input, episode selection, and audio/subtitle track picking.

---

## 🛠️ Requirements

| Requirement | Details |
|---|---|
| **Node.js** | v18 or later recommended |
| **FFmpeg** | Installed and available in your system `PATH` |
| **N_m3u8DL-RE** *(optional)* | For high-speed segment-parallel downloads. [Download here](https://github.com/nilaoda/N_m3u8DL-RE/releases) |

---

## 📦 Installation

1. **Clone the repository** and navigate to the project directory:
   ```bash
   git clone https://github.com/xersbtt/M3U8-Downloader.git
   cd M3U8-Downloader
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Install the Playwright Chromium browser**:
   ```bash
   npx playwright install chromium
   ```

4. *(Optional)* **Set up N_m3u8DL-RE** for faster downloads:
   - Download the `win-x64` binary from the [N_m3u8DL-RE Releases](https://github.com/nilaoda/N_m3u8DL-RE/releases) page.
   - Extract it to `./tools/N_m3u8DL-RE/` so the binary is at `./tools/N_m3u8DL-RE/N_m3u8DL-RE.exe`.

---

## ⚙️ Configuration (`config.json`)

The `config.json` file in the project root contains all system settings:

```json
{
  "user_data_dir": "./user_data",
  "download_dir": "./downloads",
  "ffmpeg_path": "ffmpeg",
  "download_engine": "auto",
  "n_m3u8dl_re_path": "./tools/N_m3u8DL-RE/N_m3u8DL-RE.exe",
  "re_thread_count": 16,
  "max_concurrent_downloads": 3,
  "max_retries": 5,
  "sites": {
    "default": {
      "episode_selector": "a.episode-link, .episode-list a, .playlist a",
      "play_button_selector": "button.play-btn, .video-player, video"
    },
    "tv360.vn": {
      "episode_selector": "a[href*='/movie/']",
      "play_button_selector": "button[title='Xem ngay'], ..."
    }
  }
}
```

| Key | Description |
|---|---|
| `user_data_dir` | Directory for browser cache, cookies, and login session data |
| `download_dir` | Default directory for downloaded MP4/MKV videos and subtitles |
| `ffmpeg_path` | Path or command name for FFmpeg (default: `ffmpeg` from PATH) |
| `download_engine` | `auto` (default) — uses N_m3u8DL-RE if found, otherwise FFmpeg. Set to `n_m3u8dl-re` to force it (falls back to FFmpeg with a warning if missing), or `ffmpeg` to always use FFmpeg |
| `n_m3u8dl_re_path` | Path to the N_m3u8DL-RE binary |
| `re_thread_count` | Number of parallel segment downloads per stream when using N_m3u8DL-RE (default: `16`) |
| `max_concurrent_downloads` | Maximum number of episodes downloading simultaneously (default: `3`) |
| `max_retries` | Maximum retry attempts per episode on failure, with exponential backoff (default: `5`) |
| `sites` | Per-domain CSS selectors for episode links and play buttons. The `default` entry is used for any domain not explicitly configured |

---

## 🖥️ Usage

### Option 1: Web UI Dashboard (Recommended)

1. **Double-click** `Quick_Start.bat` in the project folder.
2. Your default browser will automatically open `http://localhost:3000`. A Playwright (Chromium) window will also launch.
3. **Paste the movie URL**, choose a save folder (click **📂 Choose folder** for a native Windows dialog), and click **🔍 Scan episode list**.
4. **Select episodes** using the checkbox grid.
5. *(Optional)* Click **🔍 Analyze audio & subtitle tracks** to pick specific audio languages and subtitle tracks.
6. Click **🚀 START DOWNLOAD**.
7. To stop the server, click the **⏻ Shutdown** button in the Dashboard header, or run `Stop_Server.bat`.

### Option 2: Command Line (CLI Mode)

1. Open a terminal in the project directory and run:
   ```bash
   npm start -- --cli
   ```
2. Enter the URL of any episode.
3. If login is required, sign in on the Chromium window that opens, then return to the terminal and press **Enter**.
4. Choose your download mode:
   - `1` — Download only the current episode
   - `2` — Download all scraped episodes
5. Select audio and subtitle tracks when prompted.

---

## 🧪 Mock Testing (Offline)

To test the system without a real streaming site:

1. **Start the mock server**:
   ```bash
   node test/mock_server.js
   ```
   *(Runs at `http://localhost:8080`)*

2. **Launch the Dashboard or CLI** and enter the mock URL:
   ```
   http://localhost:8080/episode1.html
   ```

3. Scan episodes and start a test download. The output MP4 will appear in `./downloads`.

---

## 🏗️ Architecture

```
M3U8-Downloader/
├── src/
│   ├── index.js        # Entry point — CLI mode or Web UI server
│   ├── server.js       # Express + WebSocket server, REST API routes
│   ├── browser.js      # Playwright browser automation (scraping, M3U8 interception)
│   ├── parser.js       # M3U8 master playlist parsing, track detection & selection
│   ├── queue.js        # Persistent JSON download queue manager
│   └── downloader.js   # FFmpeg & N_m3u8DL-RE download engines, subtitle handler
├── public/
│   ├── index.html      # Web Dashboard UI
│   ├── style.css       # Dark glassmorphism theme
│   ├── app.js          # Client-side logic (WebSocket, DOM rendering)
│   └── i18n.js         # Vietnamese/English translation system
├── test/
│   └── mock_server.js  # Local mock streaming server for testing
├── config.json         # System configuration
├── Quick_Start.bat     # One-click Windows launcher
├── Stop_Server.bat     # Graceful/forced shutdown script
└── package.json
```

---

## ⚠️ Technical Notes

- **DRM-Protected Content**: Videos encrypted with DRM (Widevine, FairPlay) will result in a black screen or decryption failure when downloaded via FFmpeg. This tool does not bypass DRM.
- **Token Expiration**: M3U8 URLs from streaming sites often include short-lived authentication tokens. The system is designed to intercept and immediately pass URLs to the download engine to minimize the risk of token expiry.
- **Windows Only**: The folder picker dialog and `.bat` launchers are Windows-specific. The core Node.js server and CLI mode work cross-platform, but the native folder picker requires Windows PowerShell.

---

## 📄 License

This project is provided as-is for educational and personal use.
