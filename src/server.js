import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import util from 'util';

import { BrowserHelper } from './browser.js';
import { QueueManager } from './queue.js';
import { resolveStreamInfo, selectTracks } from './parser.js';
import { Downloader } from './downloader.js';

const execPromise = util.promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Persisted UI settings (last used download folder, ...) — survives restarts.
const SETTINGS_FILE = 'settings.json';

async function loadSettings() {
  try {
    const data = await fs.readFile(SETTINGS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

async function saveSettings(settings) {
  try {
    await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
  } catch (err) {
    console.error(`Failed to save settings: ${err.message}`);
  }
}

// Load app configurations
async function loadConfig() {
  try {
    const data = await fs.readFile('config.json', 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    return {
      user_data_dir: "./user_data",
      download_dir: "./downloads",
      ffmpeg_path: "ffmpeg",
      sites: {
        default: {
          episode_selector: "a[href*='/movie/'], a.episode-link, .episode-list a, .playlist a",
          play_button_selector: "button.play-btn, .video-player, video"
        }
      }
    };
  }
}

async function startServer() {
  const config = await loadConfig();
  const queueManager = new QueueManager();
  await queueManager.init();

  const browserHelper = new BrowserHelper(config);
  const downloader = new Downloader(config);

  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '../public')));

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  const clients = new Set();
  wss.on('connection', (ws) => {
    clients.add(ws);
    // Send current status of queue upon connection
    ws.send(JSON.stringify({ type: 'status_update', queue: queueManager.getAll() }));
    ws.on('close', () => clients.delete(ws));
  });

  // Handle upgrade to WebSocket
  server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  // Helper to broadcast messages
  function broadcast(data) {
    const payload = JSON.stringify(data);
    for (const client of clients) {
      if (client.readyState === 1) { // OPEN
        client.send(payload);
      }
    }
  }

  // System log helper.
  // `key` + `params` let the browser translate the line (i18n); `msg` remains the
  // Vietnamese fallback used for the server console and any client without the key.
  function systemLog(msg, level = 'info', key = null, params = null) {
    console.log(`[${level.toUpperCase()}] ${msg}`);
    // Strip ANSI color codes
    const cleanMsg = msg.replace(/\x1b\[\d+m/g, '');
    broadcast({ type: 'log', message: cleanMsg, level, key, params });
  }

  let downloadInProgress = false;
  let shuttingDown = false;

  // Initialize Browser
  try {
    await browserHelper.initBrowser(false); // headful mode
    systemLog('Trình duyệt Playwright đã sẵn sàng ở chế độ có đầu (headful).', 'success', 'slog.browserReady');
  } catch (err) {
    systemLog(`Không khởi động được trình duyệt: ${err.message}`, 'error', 'slog.browserFailed', { error: err.message });
  }

  // Route: Select Directory using Windows PowerShell
  app.post('/api/select-dir', async (req, res) => {
    systemLog('Đang mở hộp thoại chọn thư mục trên Windows...', 'info', 'slog.dirOpening');

    // Open the FolderBrowserDialog owned by an off-screen TOP-MOST form so the
    // dialog is guaranteed to appear in the foreground (it otherwise opens behind
    // the browser window). Pre-selects the last used folder for convenience.
    const initialDir = (lastDownloadDir || '').replace(/'/g, "''");
    const psScript = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -Name FgWin -Namespace Win32 -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
[DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
[DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
[DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
'@
$owner = New-Object System.Windows.Forms.Form
$owner.StartPosition = 'CenterScreen'
$owner.Size = New-Object System.Drawing.Size(1, 1)
$owner.FormBorderStyle = 'None'
$owner.ShowInTaskbar = $false
$owner.TopMost = $true
$owner.Opacity = 0
$owner.Show()
$fgWnd = [Win32.FgWin]::GetForegroundWindow()
$fgPid = 0
$fgThread = [Win32.FgWin]::GetWindowThreadProcessId($fgWnd, [ref]$fgPid)
$ourThread = [Win32.FgWin]::GetCurrentThreadId()
if ($fgThread -ne $ourThread) {
  [Win32.FgWin]::AttachThreadInput($ourThread, $fgThread, $true) | Out-Null
}
[Win32.FgWin]::SetForegroundWindow($owner.Handle) | Out-Null
[Win32.FgWin]::BringWindowToTop($owner.Handle) | Out-Null
if ($fgThread -ne $ourThread) {
  [Win32.FgWin]::AttachThreadInput($ourThread, $fgThread, $false) | Out-Null
}
$owner.Activate()
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = 'Select the folder to save downloaded videos and subtitles'
$dialog.ShowNewFolderButton = $true
$init = '${initialDir}'
if ($init -and (Test-Path $init)) { $dialog.SelectedPath = $init }
$result = $dialog.ShowDialog($owner)
$owner.Close(); $owner.Dispose()
if ($result -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($dialog.SelectedPath) }
`;
    const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
    const command = `powershell -NoProfile -Sta -ExecutionPolicy Bypass -EncodedCommand ${encoded}`;

    try {
      const { stdout } = await execPromise(command);
      const selectedPath = stdout.trim();
      if (selectedPath) {
        await persistLastDir(selectedPath);
        systemLog(`Đã chọn thư mục lưu: ${selectedPath}`, 'success', 'slog.dirSelected', { path: selectedPath });
        res.json({ success: true, path: selectedPath });
      } else {
        systemLog('Đã hủy chọn thư mục.', 'warning', 'slog.dirCancelled');
        res.json({ success: false, message: 'User cancelled' });
      }
    } catch (err) {
      systemLog(`Lỗi khi mở Folder Picker: ${err.message}`, 'error', 'slog.dirError', { error: err.message });
      res.json({ success: false, error: err.message });
    }
  });

  // Route: Scrape Playlist
  app.post('/api/scrape', async (req, res) => {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    systemLog(`Đang cào danh sách tập phim từ URL: ${url}`, 'info', 'slog.scrapeStart', { url });
    try {
      const episodes = await browserHelper.scrapeEpisodes(url);
      systemLog(`Cào thành công. Tìm thấy ${episodes.length} tập phim.`, 'success', 'slog.scrapeSuccess', { count: episodes.length });
      res.json({ success: true, episodes });
    } catch (err) {
      systemLog(`Lỗi cào danh sách tập: ${err.message}`, 'error', 'slog.scrapeError', { error: err.message });
      res.status(500).json({ error: err.message });
    }
  });

  // Route: Analyze streams (intercept first episode to discover audio/subtitle tracks)
  app.post('/api/analyze-streams', async (req, res) => {
    const { episodeUrl } = req.body;
    if (!episodeUrl) {
      return res.status(400).json({ error: 'episodeUrl is required' });
    }

    systemLog(`Đang phân tích luồng phát từ tập: ${episodeUrl}`, 'info', 'slog.analyzeStart', { url: episodeUrl });
    try {
      const intercepted = await browserHelper.interceptM3U8(episodeUrl);
      systemLog('Đã chặn M3U8 thành công. Đang phân tích Master Playlist...', 'info', 'slog.analyzeIntercepted');

      const { streamInfo } = await resolveStreamInfo(intercepted.candidates || [{ url: intercepted.url, headers: intercepted.headers }]);

      systemLog(
        `Phân tích hoàn tất: ${streamInfo.audioTracks.length} luồng âm thanh, ${streamInfo.subtitleTracks.length} luồng phụ đề.`,
        'success',
        'slog.analyzeDone',
        { audio: streamInfo.audioTracks.length, sub: streamInfo.subtitleTracks.length }
      );

      res.json({
        success: true,
        audioTracks: streamInfo.audioTracks.map(t => ({
          name: t.name,
          language: t.language,
          langCode: t.langCode,
          default: t.default,
          isVietnameseDub: t.isVietnameseDub
        })),
        subtitleTracks: streamInfo.subtitleTracks.map(t => ({
          name: t.name,
          language: t.language,
          langCode: t.langCode,
          default: t.default
        }))
      });
    } catch (err) {
      systemLog(`Lỗi phân tích luồng: ${err.message}`, 'error', 'slog.analyzeError', { error: err.message });
      res.status(500).json({ error: err.message });
    }
  });

  // Remember the last used settings so retries from the history panel can reuse them.
  // lastDownloadDir is restored from settings.json so it persists across sessions.
  const settings = await loadSettings();
  let lastDownloadDir = settings.lastDownloadDir || null;
  let lastTrackPreferences = null;

  // Persist the last used download folder so it pre-fills on the next launch
  async function persistLastDir(dir) {
    if (!dir) return;
    lastDownloadDir = dir;
    settings.lastDownloadDir = dir;
    await saveSettings(settings);
  }

  // ========== Shared download job runner (used by /api/download and /api/retry) ==========
  function runDownloadJob(pendingList, trackPreferences) {
    (async () => {
      const MAX_CONCURRENT = config.max_concurrent_downloads || 3;
      systemLog(`Bắt đầu tiến trình tải ${pendingList.length} tập phim (tối đa ${MAX_CONCURRENT} tập đồng thời)...`, 'info', 'slog.jobStart', { count: pendingList.length, concurrent: MAX_CONCURRENT });

      // Announce which download engine this job will use
      const engineInfo = await downloader.getEngineInfo();
      if (engineInfo.fellBack) {
        systemLog(`Không tìm thấy N_m3u8DL-RE tại "${engineInfo.rePath}" — dùng FFmpeg thay thế.`, 'warning', 'slog.engineFallback', { path: engineInfo.rePath });
      }
      const engineName = engineInfo.engine === 'n_m3u8dl-re' ? 'N_m3u8DL-RE (tải song song phân đoạn)' : 'FFmpeg';
      systemLog(`Engine tải xuống: ${engineName}`, 'info', 'slog.engine', { engine: engineInfo.engine === 'n_m3u8dl-re' ? 'N_m3u8DL-RE (segment-parallel)' : 'FFmpeg' });

      broadcast({
        type: 'job_started',
        total: pendingList.length,
        urls: pendingList.map(item => item.url)
      });

      // ========== Browser mutex — serializes M3U8 interception (single browser page) ==========
      let browserLock = Promise.resolve();
      function withBrowserLock(fn) {
        const prevLock = browserLock;
        let releaseLock;
        browserLock = new Promise(resolve => { releaseLock = resolve; });
        return prevLock.then(fn).finally(releaseLock);
      }

      const MAX_RETRIES = config.max_retries !== undefined ? config.max_retries : 5;

      // ========== Per-episode processor (with inline retries) ==========
      async function processEpisode(ep, globalIndex) {
        let attempt = 0;

        while (attempt <= MAX_RETRIES && !shuttingDown) {
          const isRetry = attempt > 0;

          try {
            if (isRetry) {
              systemLog(`[Thử lại ${attempt}/${MAX_RETRIES}] Đang thử lại: "${ep.title}"`, 'warning', 'slog.epRetry', { attempt, max: MAX_RETRIES, title: ep.title });
              broadcast({
                type: 'active_episode',
                url: ep.url,
                title: ep.title,
                phase: 'retry',
                index: globalIndex,
                total: pendingList.length,
                retryAttempt: attempt,
                maxRetries: MAX_RETRIES
              });
              // Exponential backoff before retry: 3s, 6s, 12s, ... capped at 30s
              const backoffMs = Math.min(3000 * 2 ** (attempt - 1), 30000);
              await new Promise(r => setTimeout(r, backoffMs));
            }

            // Step 1: Intercept M3U8 (serial — browser mutex)
            if (!isRetry) {
              systemLog(`[Tập ${globalIndex}/${pendingList.length}] Đang chặn M3U8: "${ep.title}"`, 'info', 'slog.epIntercepting', { index: globalIndex, total: pendingList.length, title: ep.title });
              broadcast({ type: 'active_episode', url: ep.url, title: ep.title, phase: 'intercepting', index: globalIndex, total: pendingList.length });
            }

            await queueManager.updateStatus(ep.url, 'downloading');
            broadcast({ type: 'status_update', queue: queueManager.getAll() });

            const { headers, subtitles, trackSelection } = await withBrowserLock(async () => {
              const intercepted = await browserHelper.interceptM3U8(ep.url);
              systemLog(`[${ep.title}] Đã chặn M3U8 thành công.`, 'info', 'slog.epIntercepted', { title: ep.title });

              // Prefer the master playlist among all captured candidates so we get
              // the highest quality (not whatever variant the player grabbed first).
              const { streamInfo, headers } = await resolveStreamInfo(
                intercepted.candidates || [{ url: intercepted.url, headers: intercepted.headers }]
              );

              // Apply user track preferences (or null for all tracks)
              const trackSelection = selectTracks(streamInfo, trackPreferences || null);
              return { headers, subtitles: intercepted.subtitles, trackSelection };
            });

            // Step 2: Download via FFmpeg (parallel — no lock needed)
            broadcast({ type: 'active_episode', url: ep.url, title: ep.title, phase: 'downloading', index: globalIndex, total: pendingList.length });
            systemLog(`[${ep.title}] Bắt đầu tải video & phụ đề...`, 'info', 'slog.epFfmpeg', { title: ep.title });

            await downloader.download(
              ep.title,
              trackSelection,
              headers,
              subtitles,
              (progress) => {
                broadcast({ type: 'progress', url: ep.url, title: ep.title, ...progress });
              }
            );

            // Success
            await queueManager.updateStatus(ep.url, 'success', {
              video_url: trackSelection.videoUrl,
              audio_urls: trackSelection.selectedAudioTracks.filter(t => t.uri).map(t => t.uri)
            });
            systemLog(
              `${isRetry ? '[Thử lại] ' : ''}Tải thành công tập: "${ep.title}"`,
              'success',
              isRetry ? 'slog.epSuccessRetry' : 'slog.epSuccess',
              { title: ep.title }
            );
            broadcast({ type: 'status_update', queue: queueManager.getAll() });
            return; // done — exit retry loop

          } catch (err) {
            // Server is exiting: don't mark 'failed' (the kill caused the error).
            // Status stays 'downloading' and resets to 'pending' on next start.
            if (shuttingDown) return;

            attempt++;
            const isFinal = attempt > MAX_RETRIES;
            const errContext = isFinal
              ? `Thất bại sau ${MAX_RETRIES} lần thử lại`
              : `Lỗi (sẽ thử lại ${attempt}/${MAX_RETRIES})`;
            systemLog(
              `[${ep.title}] ${errContext}: ${err.message}`,
              'error',
              isFinal ? 'slog.epFailedFinal' : 'slog.epFailedRetry',
              { title: ep.title, max: MAX_RETRIES, attempt, error: err.message }
            );
            await queueManager.updateStatus(ep.url, 'failed', { error_reason: err.message });
            broadcast({ type: 'status_update', queue: queueManager.getAll() });
          }
        }
      }

      // ========== Worker pool — keeps N download slots filled at all times ==========
      async function runWorkerPool() {
        let nextIdx = 0;
        let running = 0;

        return new Promise((resolveAll) => {
          function tryStartNext() {
            while (running < MAX_CONCURRENT && nextIdx < pendingList.length) {
              const idx = nextIdx++;
              const ep = pendingList[idx];
              running++;

              processEpisode(ep, idx + 1).finally(() => {
                running--;
                if (nextIdx >= pendingList.length && running === 0) {
                  resolveAll();
                } else {
                  tryStartNext();
                }
              });
            }

            // Edge case: empty list
            if (nextIdx >= pendingList.length && running === 0) {
              resolveAll();
            }
          }

          tryStartNext();
        });
      }

      await runWorkerPool();

      downloadInProgress = false;
      systemLog('=== Hoàn tất quá trình tải toàn bộ danh sách đã chọn ===', 'success', 'slog.jobDone');
      broadcast({ type: 'job_complete' });
    })().catch((err) => {
      downloadInProgress = false;
      systemLog(`Lỗi nghiêm trọng trong hàng chờ tải: ${err.message}`, 'error', 'slog.jobFatal', { error: err.message });
      broadcast({ type: 'job_complete' });
    });
  }

  // Resolve + prepare the output directory for a job. Falls back to the last used dir.
  async function prepareDownloadDir(downloadDir) {
    const dir = (downloadDir && downloadDir.trim()) || lastDownloadDir;
    if (!dir) return null;
    downloader.downloadDir = path.resolve(dir);
    await fs.mkdir(downloader.downloadDir, { recursive: true });
    await persistLastDir(dir);
    return downloader.downloadDir;
  }

  // Route: persisted UI settings (used to pre-fill the download folder on load)
  app.get('/api/settings', (req, res) => {
    res.json({ lastDownloadDir });
  });

  // Route: Start Download Job
  app.post('/api/download', async (req, res) => {
    // trackPreferences: { audioLangCodes, subtitleLangCodes } or null
    // force: re-download selected episodes even if they were downloaded successfully before
    const { episodes, downloadDir, trackPreferences, force } = req.body;
    if (!episodes || !Array.isArray(episodes) || episodes.length === 0) {
      return res.status(400).json({ error: 'No episodes provided' });
    }
    if (!downloadDir) {
      return res.status(400).json({ error: 'Download directory is required' });
    }

    if (downloadInProgress) {
      return res.status(400).json({ error: 'A download job is already running' });
    }

    await prepareDownloadDir(downloadDir);
    lastTrackPreferences = trackPreferences || null;

    // Sync queue
    await queueManager.addEpisodes(episodes);

    const selectedUrls = [...new Set(episodes.map(ep => ep.url))];

    // Force mode: reset selected episodes (including 'success') back to 'pending'
    if (force) {
      const resetCount = await queueManager.resetItems(selectedUrls);
      if (resetCount > 0) {
        systemLog(`Chế độ tải lại: đã đặt lại trạng thái ${resetCount} tập để tải lại từ đầu.`, 'info', 'slog.forceReset', { count: resetCount });
      }
    }
    broadcast({ type: 'status_update', queue: queueManager.getAll() });

    // Filter pending list to ONLY the episodes the user selected
    const selectedUrlSet = new Set(selectedUrls);
    const pendingList = queueManager.getPendingOrFailed().filter(item => selectedUrlSet.has(item.url));
    const skipped = selectedUrls.length - pendingList.length;

    if (skipped > 0) {
      systemLog(`Bỏ qua ${skipped} tập đã tải thành công trước đó. Tick "Tải lại cả tập đã thành công" nếu muốn tải lại.`, 'warning', 'slog.skip', { skipped });
    }

    if (pendingList.length === 0) {
      systemLog('Tất cả các tập đã chọn đều đã tải thành công trước đó. Không có gì để tải.', 'warning', 'slog.skipAll');
      return res.json({ success: true, started: false, skipped, message: 'All episodes already downloaded.' });
    }

    // Start download process async
    downloadInProgress = true;
    res.json({ success: true, started: true, total: pendingList.length, skipped });
    runDownloadJob(pendingList, lastTrackPreferences);
  });

  // Route: Retry episodes from history (works for failed AND successful items)
  app.post('/api/retry', async (req, res) => {
    const { urls, downloadDir } = req.body;
    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ error: 'No episode URLs provided' });
    }
    if (downloadInProgress) {
      return res.status(400).json({ error: 'A download job is already running' });
    }

    const targetDir = await prepareDownloadDir(downloadDir);
    if (!targetDir) {
      return res.status(400).json({ error: 'Download directory is required (no previous directory to reuse)' });
    }

    await queueManager.resetItems(urls);
    broadcast({ type: 'status_update', queue: queueManager.getAll() });

    const urlSet = new Set(urls);
    const pendingList = queueManager.getAll().filter(item => urlSet.has(item.url));

    if (pendingList.length === 0) {
      return res.status(400).json({ error: 'None of the requested episodes exist in the queue' });
    }

    systemLog(`Tải lại ${pendingList.length} tập từ lịch sử (thư mục lưu: ${targetDir}).`, 'info', 'slog.retryStart', { count: pendingList.length, dir: targetDir });
    downloadInProgress = true;
    res.json({ success: true, started: true, total: pendingList.length });
    runDownloadJob(pendingList, lastTrackPreferences);
  });

  // Route: Get full queue/history
  app.get('/api/queue', (req, res) => {
    res.json({ success: true, queue: queueManager.getAll() });
  });

  // Route: Remove specific items from history
  app.post('/api/queue/remove', async (req, res) => {
    const { urls } = req.body;
    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ error: 'No episode URLs provided' });
    }
    const removed = await queueManager.removeItems(urls);
    systemLog(`Đã xóa ${removed} mục khỏi lịch sử tải xuống.`, 'info', 'slog.historyRemoved', { removed });
    broadcast({ type: 'status_update', queue: queueManager.getAll() });
    res.json({ success: true, removed });
  });

  // Route: Clear entire history (items currently downloading are kept)
  app.post('/api/queue/clear', async (req, res) => {
    const removed = await queueManager.clearHistory();
    systemLog(`Đã xóa toàn bộ lịch sử tải xuống (${removed} mục).`, 'info', 'slog.historyCleared', { removed });
    broadcast({ type: 'status_update', queue: queueManager.getAll() });
    res.json({ success: true, removed });
  });

  // Route: Health check — used by Quick_Start.bat / Stop_Server.bat to identify
  // this specific app (name field) rather than blindly trusting port 3000.
  app.get('/api/health', (req, res) => {
    res.json({ ok: true, name: 'dlm3u8', pid: process.pid, downloadInProgress });
  });

  // Route: Graceful shutdown — kills FFmpeg children, closes the Playwright
  // browser, flushes the queue file, then exits.
  app.post('/api/shutdown', async (req, res) => {
    if (shuttingDown) {
      return res.json({ success: true, message: 'Already shutting down' });
    }
    shuttingDown = true;

    systemLog('Đang tắt server theo yêu cầu... Dừng FFmpeg và đóng trình duyệt.', 'warning', 'slog.shutdown');
    res.json({ success: true });

    // Tell clients this close is intentional (so the UI doesn't try to reconnect)
    broadcast({ type: 'server_shutdown' });

    try {
      const killed = downloader.killAll();
      if (killed > 0) {
        console.log(`[SHUTDOWN] Terminated ${killed} FFmpeg process(es).`);
      }
    } catch (err) {
      console.error(`[SHUTDOWN] FFmpeg cleanup error: ${err.message}`);
    }

    try {
      await browserHelper.close();
      console.log('[SHUTDOWN] Playwright browser closed.');
    } catch (err) {
      console.error(`[SHUTDOWN] Browser close error: ${err.message}`);
    }

    // Flush any in-flight queue writes (save() is serialized)
    try {
      await queueManager.save();
    } catch { /* best effort */ }

    // Give the HTTP response and WS frame a moment to flush, then exit
    setTimeout(() => {
      console.log('[SHUTDOWN] Bye.');
      server.close(() => process.exit(0));
      // Hard fallback if open sockets keep server.close() from returning
      setTimeout(() => process.exit(0), 2000);
    }, 300);
  });

  const port = process.env.PORT || 3000;
  server.listen(port, () => {
    systemLog(`Web UI Server đang chạy tại: http://localhost:${port}`, 'success', 'slog.serverRunning', { port });
    
    // Auto open browser on Windows
    exec(`start http://localhost:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
