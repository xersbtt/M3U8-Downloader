import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';

/**
 * Sanitizes a filename by replacing invalid characters with underscores
 */
function sanitizeFilename(name) {
  return name.replace(/[<>:"\/\\|?*\x00-\x1F]/g, '_').trim();
}

/**
 * Formats headers for FFmpeg's -headers option.
 * Requires each header line to end with \r\n
 */
function formatFFmpegHeaders(headers) {
  let headerStr = '';
  const allowed = ['cookie', 'user-agent', 'referer', 'authorization', 'origin'];
  for (const [key, val] of Object.entries(headers)) {
    if (allowed.includes(key.toLowerCase())) {
      headerStr += `${key}: ${val}\r\n`;
    }
  }
  return headerStr;
}

export class Downloader {
  constructor(config) {
    this.config = config;
    this.ffmpegPath = config.ffmpeg_path || 'ffmpeg';
    this.downloadDir = path.resolve(config.download_dir || './downloads');
    // Active FFmpeg/N_m3u8DL-RE child processes. On Windows children outlive a
    // killed parent, so these must be terminated explicitly on shutdown.
    this.activeProcesses = new Set();

    // N_m3u8DL-RE binary: explicit paths are resolved; bare names use PATH lookup
    const reConfigured = config.n_m3u8dl_re_path || 'N_m3u8DL-RE';
    this.rePath = /[\\/]/.test(reConfigured) ? path.resolve(reConfigured) : reConfigured;
    this._engineInfo = null;
  }

  /**
   * Resolve which download engine to use. Probes for N_m3u8DL-RE once and caches.
   * config.download_engine: 'auto' (default) | 'n_m3u8dl-re' | 'ffmpeg'
   * @returns {Promise<{engine: 'ffmpeg'|'n_m3u8dl-re', requested: string, fellBack: boolean, rePath: string}>}
   */
  async getEngineInfo() {
    if (this._engineInfo) return this._engineInfo;
    const requested = (this.config.download_engine || 'auto').toLowerCase();
    let engine = 'ffmpeg';
    let fellBack = false;
    if (requested === 'n_m3u8dl-re' || requested === 'auto') {
      if (await this._probeRE()) {
        engine = 'n_m3u8dl-re';
      } else if (requested === 'n_m3u8dl-re') {
        fellBack = true;
      }
    }
    this._engineInfo = { engine, requested, fellBack, rePath: this.rePath };
    return this._engineInfo;
  }

  /** Check whether the N_m3u8DL-RE binary is runnable */
  _probeRE() {
    return new Promise((resolve) => {
      let done = false;
      const finish = (ok) => { if (!done) { done = true; resolve(ok); } };
      try {
        const proc = spawn(this.rePath, ['--version']);
        proc.on('error', () => finish(false));
        proc.on('close', (code) => finish(code === 0));
        setTimeout(() => { try { proc.kill(); } catch { /* gone */ } finish(false); }, 10000);
      } catch {
        finish(false);
      }
    });
  }

  /**
   * Terminate all running downloader child processes (used on server shutdown).
   * @returns {number} number of processes killed
   */
  killAll() {
    let killed = 0;
    for (const proc of this.activeProcesses) {
      try {
        proc.kill(); // TerminateProcess on Windows
        killed++;
      } catch { /* already exited */ }
    }
    this.activeProcesses.clear();
    return killed;
  }

  async init() {
    await fs.mkdir(this.downloadDir, { recursive: true });
  }

  /**
   * Run FFmpeg command to download M3U8 stream
   * @param {string} title Episode title
   * @param {object} trackSelection { videoUrl, selectedAudioTracks, selectedSubtitleTracks }
   * @param {object} headers Original HTTP request headers
   * @param {Array<string>} interceptedSubtitles List of intercepted subtitle URLs
   */
  async download(title, trackSelection, headers = {}, interceptedSubtitles = [], onProgress = null) {
    await this.init();

    const safeTitle = sanitizeFilename(title);
    const { videoUrl, selectedAudioTracks, selectedSubtitleTracks } = trackSelection;

    // Only audio tracks with a real URI become separate inputs
    const audioTracks = (selectedAudioTracks || []).filter(t => t.uri);

    // Determine output format: MKV when multiple audio tracks, MP4 for single/no audio
    const outputExt = audioTracks.length > 1 ? '.mkv' : '.mp4';
    const outputPath = path.join(this.downloadDir, `${safeTitle}${outputExt}`);

    console.log(`\x1b[36mPreparing download for: "${safeTitle}" -> "${outputPath}"\x1b[0m`);

    const { engine } = await this.getEngineInfo();
    if (engine === 'n_m3u8dl-re') {
      await this._downloadWithRE(safeTitle, videoUrl, audioTracks, headers, outputPath, onProgress);
    } else {
      await this._downloadWithFFmpeg(safeTitle, videoUrl, audioTracks, headers, outputPath, onProgress);
    }

    // Download subtitles (same pipeline for both engines)
    await this._downloadSubtitles(safeTitle, selectedSubtitleTracks, interceptedSubtitles, headers);

    console.log(`\x1b[32mSuccessfully downloaded and merged: "${outputPath}"\x1b[0m`);
    return outputPath;
  }

  /**
   * Append -map and per-track metadata args for muxing video (input 0) with
   * separate audio inputs (inputs 1..n). Shared by both engines.
   */
  _appendMuxMaps(args, audioTracks) {
    if (audioTracks.length === 0) return;
    args.push('-map', '0:v');
    for (let i = 0; i < audioTracks.length; i++) {
      args.push('-map', `${i + 1}:a`);
    }
    for (let i = 0; i < audioTracks.length; i++) {
      const track = audioTracks[i];
      if (track.langCode && track.langCode !== 'unknown') {
        args.push(`-metadata:s:a:${i}`, `language=${track.langCode}`);
      }
      if (track.name) {
        args.push(`-metadata:s:a:${i}`, `title=${track.name}`);
      }
    }
  }

  /**
   * Classic engine: FFmpeg downloads all stream URLs and muxes in one pass.
   */
  _downloadWithFFmpeg(safeTitle, videoUrl, audioTracks, headers, outputPath, onProgress) {
    const headerStr = formatFFmpegHeaders(headers);
    const args = ['-y']; // Overwrite output file

    // Helper: add common input options (headers, extensions, network resilience)
    const addInputOptions = () => {
      if (headerStr) {
        args.push('-headers', headerStr);
      }
      args.push('-allowed_extensions', 'ALL');
      args.push(
        '-reconnect', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '5',
        '-http_persistent', '1',
        '-timeout', '30000000'
      );
    };

    // Video input (always input 0), then audio inputs (1, 2, ...)
    addInputOptions();
    args.push('-i', videoUrl);
    for (const track of audioTracks) {
      addInputOptions();
      args.push('-i', track.uri);
    }

    this._appendMuxMaps(args, audioTracks);

    // Use stream copy to avoid re-encoding
    args.push('-c', 'copy', outputPath);

    console.log(`\x1b[36mRunning FFmpeg with ${audioTracks.length} audio track(s)...\x1b[0m`);
    return this._runFFmpeg(args, safeTitle, onProgress);
  }

  /**
   * Fast engine: N_m3u8DL-RE downloads each stream with segment-level parallelism
   * into a temp dir, then FFmpeg muxes the local files (stream copy — instant).
   */
  async _downloadWithRE(safeTitle, videoUrl, audioTracks, headers, outputPath, onProgress) {
    const tmpRoot = path.join(this.downloadDir, `.retmp_${safeTitle}`);
    // Clear stale temp from a previous crashed/killed attempt
    await fs.rm(tmpRoot, { recursive: true, force: true });

    const jobs = [
      { label: 'video', url: videoUrl, dir: path.join(tmpRoot, 'video'), reportProgress: true },
      ...audioTracks.map((t, i) => ({
        label: `audio-${t.langCode || i}`,
        url: t.uri,
        dir: path.join(tmpRoot, `audio${i}`),
        reportProgress: false
      }))
    ];

    console.log(`\x1b[36mRunning N_m3u8DL-RE for ${jobs.length} stream(s) (segment-parallel)...\x1b[0m`);
    try {
      // Download all streams concurrently; only the video stream drives the progress bar
      const results = await Promise.allSettled(jobs.map(job =>
        this._runRE(job.url, job.dir, headers, `${safeTitle} [${job.label}]`, job.reportProgress ? onProgress : null)
      ));
      const failed = results.find(r => r.status === 'rejected');
      if (failed) throw failed.reason;

      const inputFiles = [];
      for (const job of jobs) {
        inputFiles.push(await this._findStreamFile(job.dir, job.label));
      }

      // Mux the local files (stream copy of local input — fast)
      const args = ['-y'];
      for (const f of inputFiles) {
        args.push('-i', f);
      }
      this._appendMuxMaps(args, audioTracks);
      args.push('-c', 'copy', outputPath);
      await this._runFFmpeg(args, `${safeTitle} (mux)`);
    } finally {
      await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
    }
  }

  /**
   * Run one N_m3u8DL-RE process for a single media playlist URL.
   * Progress (percent + speed) is parsed best-effort from its console output.
   */
  _runRE(url, outDir, headers, taskName, onProgress) {
    const args = [
      url,
      '--tmp-dir', outDir,
      '--save-dir', outDir,
      '--save-name', 'stream',
      '--thread-count', String(this.config.re_thread_count || 16),
      '--download-retry-count', '3',
      '--auto-select',
      '--no-log'
    ];

    const allowed = ['cookie', 'user-agent', 'referer', 'authorization', 'origin'];
    for (const [key, val] of Object.entries(headers || {})) {
      if (allowed.includes(key.toLowerCase())) {
        args.push('-H', `${key}: ${val}`);
      }
    }

    return new Promise((resolve, reject) => {
      const proc = spawn(this.rePath, args);
      this.activeProcesses.add(proc);
      let outputLog = '';
      let lastPercent = null; // remembered so speed-only updates still carry a percent

      const handleChunk = (data) => {
        const str = data.toString();
        outputLog += str;
        if (outputLog.length > 200000) outputLog = outputLog.slice(-100000);

        if (onProgress) {
          const pcts = [...str.matchAll(/(\d{1,3}(?:\.\d+)?)%/g)];
          const speedMatch = str.match(/(\d+(?:\.\d+)?\s*[KMG]?i?Bps)/i);
          if (pcts.length > 0) {
            lastPercent = Math.min(100, parseFloat(pcts[pcts.length - 1][1]));
          }
          // Only report when there's something new to show, but always include the
          // last known percent so the bar never drops back to "unknown".
          if (pcts.length > 0 || speedMatch) {
            const progress = {};
            if (lastPercent !== null) progress.percent = lastPercent;
            if (speedMatch) progress.speed = speedMatch[1].replace(/\s+/g, '');
            onProgress(progress);
          }
        }
      };
      proc.stdout.on('data', handleChunk);
      proc.stderr.on('data', handleChunk);

      proc.on('close', (code) => {
        this.activeProcesses.delete(proc);
        if (code === 0) {
          if (onProgress) onProgress({ percent: 100 });
          resolve();
        } else {
          const lastLines = outputLog.split('\n').filter(l => l.trim()).slice(-8).join('\n');
          reject(new Error(`N_m3u8DL-RE (${taskName}) exited with code ${code}. Output:\n${lastLines}`));
        }
      });

      proc.on('error', (err) => {
        this.activeProcesses.delete(proc);
        reject(new Error(`Failed to start N_m3u8DL-RE: ${err.message}`));
      });
    });
  }

  /**
   * Locate the media file N_m3u8DL-RE produced in its save dir
   * (extension varies: .ts / .mp4 / .m4a depending on the source segments).
   */
  async _findStreamFile(dir, label) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const candidates = [];
    for (const e of entries) {
      if (!e.isFile()) continue;
      if (/\.(json|txt|log|m3u8)$/i.test(e.name)) continue;
      const full = path.join(dir, e.name);
      const st = await fs.stat(full);
      candidates.push({ path: full, size: st.size });
    }
    if (candidates.length === 0) {
      throw new Error(`N_m3u8DL-RE produced no output file for ${label}`);
    }
    // Largest file is the media stream (meta files are tiny)
    candidates.sort((a, b) => b.size - a.size);
    return candidates[0].path;
  }

  /**
   * Downloads subtitle tracks as separate .srt files
   */
  async _downloadSubtitles(safeTitle, subtitleTracks, interceptedSubtitles, headers) {
    const headerStr = formatFFmpegHeaders(headers);
    const subtitleCandidates = [];
    const seenSubUrls = new Set();

    const addSubCandidate = (sub) => {
      if (!seenSubUrls.has(sub.url)) {
        seenSubUrls.add(sub.url);
        subtitleCandidates.push(sub);
      }
    };

    // Add parsed subtitles from Master Playlist (already filtered by selectTracks)
    if (subtitleTracks && Array.isArray(subtitleTracks)) {
      subtitleTracks.forEach(addSubCandidate);
    }

    // Add intercepted subtitles
    if (interceptedSubtitles && Array.isArray(interceptedSubtitles)) {
      interceptedSubtitles.forEach(url => {
        addSubCandidate({ url, langCode: 'unknown', language: 'unknown', name: 'Intercepted Subtitle' });
      });
    }

    if (subtitleCandidates.length === 0) return;

    console.log(`\x1b[36mFound ${subtitleCandidates.length} subtitle stream(s) to process.\x1b[0m`);
    const downloadedSubs = [];

    const detectLanguage = (url, languageCode) => {
      const code = (languageCode || '').toLowerCase();
      if (code.startsWith('vi') || code.includes('vie')) return 'vi';
      if (code.startsWith('en') || code.includes('eng')) return 'en';
      if (code.startsWith('ko') || code.includes('kor')) return 'ko';
      if (code.startsWith('ja') || code.includes('jpn') || code.startsWith('jp')) return 'ja';
      if (code.startsWith('zh') || code.includes('chi') || code.includes('zho')) return 'zh';

      const urlLower = url.toLowerCase();
      if (urlLower.includes('viet') || urlLower.includes('/vi/') || urlLower.includes('_vi.') || urlLower.includes('-vi.') || urlLower.includes('.vi.')) return 'vi';
      if (urlLower.includes('eng') || urlLower.includes('/en/') || urlLower.includes('_en.') || urlLower.includes('-en.') || urlLower.includes('.en.')) return 'en';
      if (urlLower.includes('kor') || urlLower.includes('/ko/') || urlLower.includes('_ko.') || urlLower.includes('-ko.') || urlLower.includes('.ko.')) return 'ko';
      if (urlLower.includes('jap') || urlLower.includes('/ja/') || urlLower.includes('_ja.') || urlLower.includes('-ja.') || urlLower.includes('.ja.')) return 'ja';
      if (urlLower.includes('chi') || urlLower.includes('/zh/') || urlLower.includes('_zh.') || urlLower.includes('-zh.') || urlLower.includes('.zh.')) return 'zh';

      const filename = url.split('/').pop().toLowerCase();
      const match = filename.match(/[_-]([a-z]{2})[._-]/);
      if (match) {
        return match[1];
      }
      return 'unknown';
    };

    for (let index = 0; index < subtitleCandidates.length; index++) {
      const sub = subtitleCandidates[index];
      // Use langCode from parsed track if available, otherwise detect from URL
      const lang = sub.langCode && sub.langCode !== 'unknown'
        ? sub.langCode
        : detectLanguage(sub.url, sub.language);
      let subFileName = `${safeTitle}`;
      if (lang !== 'unknown') {
        subFileName += `.${lang}`;
      } else {
        subFileName += `.sub${index + 1}`;
      }
      subFileName += `.srt`;

      const subOutputPath = path.join(this.downloadDir, subFileName);
      console.log(`\x1b[36mDownloading subtitle #${index + 1}: "${sub.name}" (${lang}) -> "${subOutputPath}"\x1b[0m`);

      const subArgs = ['-y'];
      if (headerStr) {
        subArgs.push('-headers', headerStr);
      }
      subArgs.push('-allowed_extensions', 'ALL');
      subArgs.push('-i', sub.url, subOutputPath);

      try {
        await this._runFFmpeg(subArgs, `${safeTitle} Sub #${index + 1}`);
        downloadedSubs.push({ path: subOutputPath, language: lang });
      } catch (err) {
        console.error(`\x1b[33mWarning: Failed to download subtitle #${index + 1}: ${err.message}\x1b[0m`);
      }
    }

    // Copy primary subtitle to Default Subtitle format (safeTitle.srt) for player auto-matching
    if (downloadedSubs.length > 0) {
      let mainSubToCopy = null;

      const viSub = downloadedSubs.find(s => s.language === 'vi');
      if (viSub) {
        mainSubToCopy = viSub.path;
      } else {
        const enSub = downloadedSubs.find(s => s.language === 'en');
        if (enSub) {
          mainSubToCopy = enSub.path;
        } else {
          mainSubToCopy = downloadedSubs[0].path;
        }
      }

      if (mainSubToCopy) {
        const mainSubPath = path.join(this.downloadDir, `${safeTitle}.srt`);
        try {
          await fs.copyFile(mainSubToCopy, mainSubPath);
          console.log(`\x1b[32mCreated player default subtitle: "${mainSubPath}"\x1b[0m`);
        } catch (err) {
          console.error(`\x1b[33mWarning: Failed to copy main subtitle: ${err.message}\x1b[0m`);
        }
      }
    }
  }

  _runFFmpeg(args, taskName, onProgress = null) {
    return new Promise((resolve, reject) => {
      const proc = spawn(this.ffmpegPath, args);
      this.activeProcesses.add(proc);

      let stderrLog = '';

      proc.stderr.on('data', (data) => {
        const str = data.toString();
        stderrLog += str;

        // Parse FFmpeg progress: check for lines containing 'time='
        // Standard FFmpeg output line looks like: frame=  123 fps=0.0 q=-1.0 size=   1234kB time=00:01:23.45 bitrate= 123.4kbits/s speed=1.23x
        const progressMatch = str.match(/time=(\d{2}:\d{2}:\d{2}\.\d{2}).*speed=\s*([\d.]+x)/);
        if (progressMatch) {
          const time = progressMatch[1];
          const speed = progressMatch[2];
          if (onProgress) {
            onProgress({ time, speed });
          }
          process.stdout.write(`\r\x1b[36m[${taskName}] Progress: Time=${time} | Speed=${speed}\x1b[0m`);
        }
      });

      proc.on('close', (code) => {
        this.activeProcesses.delete(proc);
        // Clear progress line
        process.stdout.write('\n');

        if (code === 0) {
          resolve();
        } else {
          // If FFmpeg fails, log the last few lines of stderr
          const lines = stderrLog.split('\n');
          const lastLines = lines.slice(-10).join('\n');
          reject(new Error(`FFmpeg exited with code ${code}. Error log:\n${lastLines}`));
        }
      });

      proc.on('error', (err) => {
        this.activeProcesses.delete(proc);
        reject(new Error(`Failed to start FFmpeg: ${err.message}`));
      });
    });
  }
}
