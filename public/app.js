// i18n shortcut (i18n.js is loaded before this file)
const t = (key, params) => window.i18n.t(key, params);

// Global states
let socket = null;
let scrapedEpisodes = [];
let episodeDurations = {}; // Map of url -> duration string (e.g. "46:14")
let analyzedTracks = null; // { audioTracks, subtitleTracks } from /api/analyze-streams

// Current connection status state, kept so it can be re-translated on language switch
let systemStatusState = 'connecting';

// Set when the server announces an intentional shutdown — stops the WS reconnect loop
let serverShutdown = false;

// Active concurrent streams: Map<url, { title, time, speed, percent, index, total }>
const activeStreams = new Map();

// Track total job size for overall progress
let jobTotalEpisodes = 0;

// URLs belonging to the CURRENT download job (so summary badges don't count old history)
let jobUrls = new Set();

// Latest full queue/history snapshot from the server
let latestQueue = [];

// DOM elements
const elStatus = document.getElementById('system-status');
const elMovieUrl = document.getElementById('movie-url');
const elDownloadDir = document.getElementById('download-dir');
const elBtnBrowseDir = document.getElementById('btn-browse-dir');
const elBtnScrape = document.getElementById('btn-scrape');
const elEpisodesCard = document.getElementById('episodes-card');
const elEpisodesContainer = document.getElementById('episodes-container');
const elBtnSelectAll = document.getElementById('btn-select-all');
const elBtnDeselectAll = document.getElementById('btn-deselect-all');
const elForceRedownload = document.getElementById('force-redownload');
const elBtnStartDownload = document.getElementById('btn-start-download');
const elProgressCard = document.getElementById('progress-card');
const elStreamsContainer = document.getElementById('streams-container');
const elSummaryActive = document.getElementById('summary-active');
const elSummaryCompleted = document.getElementById('summary-completed');
const elSummaryFailed = document.getElementById('summary-failed');
const elOverallProgressBar = document.getElementById('overall-progress-bar');
const elOverallProgressCount = document.getElementById('overall-progress-count');
const elConsoleLogs = document.getElementById('console-logs');
const elBtnClearLogs = document.getElementById('btn-clear-logs');
const elBtnShutdown = document.getElementById('btn-shutdown');

// Track selection elements
const elBtnAnalyze = document.getElementById('btn-analyze-streams');
const elTrackConfig = document.getElementById('track-config');
const elAudioTracksList = document.getElementById('audio-tracks-list');
const elSubtitleTracksList = document.getElementById('subtitle-tracks-list');

// History elements
const elHistoryTbody = document.getElementById('history-tbody');
const elHistoryEmpty = document.getElementById('history-empty');
const elHistoryFilter = document.getElementById('history-filter');
const elBtnRetryFailed = document.getElementById('btn-retry-failed');
const elBtnClearHistory = document.getElementById('btn-clear-history');

// Escape user/scraped strings before inserting into innerHTML templates (incl. attributes)
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Buttons whose <span> label changes with state (idle/busy). We store the active
// i18n key on the element so the label can be re-translated on a language switch.
function setButtonLabel(btn, key) {
  btn.dataset.labelKey = key;
  btn.querySelector('span').textContent = t(key);
}

function setStartButton(key, disabled) {
  elBtnStartDownload.disabled = disabled;
  setButtonLabel(elBtnStartDownload, key);
}

// Initialize WebSockets connection
function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;
  
  updateSystemStatus('connecting');
  socket = new WebSocket(wsUrl);

  socket.onopen = () => {
    updateSystemStatus('connected');
    addLogLine(null, 'system-msg', 'clog.wsConnected');
  };

  socket.onclose = () => {
    if (serverShutdown) {
      // Intentional shutdown — no reconnect loop, no error spam
      updateSystemStatus('shutdown');
      return;
    }
    updateSystemStatus('disconnected');
    addLogLine(null, 'error', 'clog.wsLost');
    setTimeout(connectWebSocket, 3000);
  };

  socket.onerror = () => {
    updateSystemStatus('error');
  };

  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    handleSocketMessage(data);
  };
}

// Map a status state to its CSS class + translation key
const STATUS_STATE_KEYS = {
  connecting: { cls: '', key: 'status.connecting' },
  connected: { cls: 'connected', key: 'status.connected' },
  disconnected: { cls: 'error', key: 'status.disconnected' },
  error: { cls: 'error', key: 'status.error' },
  shutdown: { cls: 'error', key: 'status.shutdown' }
};

function updateSystemStatus(state) {
  systemStatusState = state;
  const info = STATUS_STATE_KEYS[state] || STATUS_STATE_KEYS.connecting;
  elStatus.className = 'system-status';
  if (info.cls) elStatus.classList.add(info.cls);
  elStatus.querySelector('.status-text').textContent = t(info.key);
}

// Convert "hh:mm:ss" or "mm:ss" to total seconds
function parseTimeToSeconds(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.split(':').map(parseFloat);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return parseFloat(timeStr) || 0;
}

// ========== Stream Slot Management ==========

/**
 * Create or update a stream slot DOM element for a given episode URL
 */
function getOrCreateStreamSlot(url) {
  const slotId = `stream-${CSS.escape(url)}`;
  let slot = document.getElementById(slotId);
  
  if (!slot) {
    slot = document.createElement('div');
    slot.id = slotId;
    slot.className = 'stream-slot downloading';
    slot.dataset.url = url;
    
    slot.innerHTML = `
      <div class="stream-slot-header">
        <div class="stream-slot-title">
          <span class="stream-slot-icon">⬇️</span>
          <span class="stream-slot-name">${escapeHtml(t('slot.namePlaceholder'))}</span>
        </div>
        <span class="stream-slot-index"></span>
      </div>
      <div class="stream-slot-stats">
        <div class="stream-stat">
          <span class="stream-stat-label" data-i18n="slot.time">${escapeHtml(t('slot.time'))}</span>
          <span class="stream-stat-value time">--:--:--</span>
        </div>
        <div class="stream-stat">
          <span class="stream-stat-label" data-i18n="slot.speed">${escapeHtml(t('slot.speed'))}</span>
          <span class="stream-stat-value speed">0.00x</span>
        </div>
      </div>
      <div class="progress-bar-container">
        <div class="progress-bar-fill animated"></div>
      </div>
    `;
    
    elStreamsContainer.appendChild(slot);
  }
  
  return slot;
}

/**
 * Update the stream slot with new info
 */
function updateStreamSlot(url, { title, index, total, time, speed, percent }) {
  const slot = getOrCreateStreamSlot(url);
  
  if (title !== undefined) {
    slot.querySelector('.stream-slot-name').textContent = title;
  }
  if (index !== undefined && total !== undefined) {
    slot.querySelector('.stream-slot-index').textContent = `${index}/${total}`;
  }
  if (time !== undefined) {
    slot.querySelector('.stream-stat-value.time').textContent = time;
  }
  if (speed !== undefined) {
    slot.querySelector('.stream-stat-value.speed').textContent = speed;
  }
  if (percent !== undefined) {
    const bar = slot.querySelector('.progress-bar-fill');
    bar.style.width = `${percent}%`;
    bar.textContent = percent < 100 ? `${percent}%` : '';
  }
}

/**
 * Transition a stream slot to success/failed state
 */
function finalizeStreamSlot(url, status) {
  const slotId = `stream-${CSS.escape(url)}`;
  const slot = document.getElementById(slotId);
  if (!slot) return;
  
  slot.className = `stream-slot ${status}`;
  
  const icon = slot.querySelector('.stream-slot-icon');
  if (status === 'success') {
    icon.textContent = '✅';
    // Fill the progress bar fully
    const bar = slot.querySelector('.progress-bar-fill');
    bar.style.width = '100%';
    bar.classList.remove('animated');
  } else if (status === 'failed') {
    icon.textContent = '❌';
    const bar = slot.querySelector('.progress-bar-fill');
    bar.classList.remove('animated');
  }
  
  // Remove from active streams
  activeStreams.delete(url);
}

/**
 * Reset a finalized stream slot back to downloading state (for retries)
 */
function resetStreamSlotForRetry(slot) {
  slot.className = 'stream-slot downloading';
  slot.querySelector('.stream-slot-icon').textContent = '🔄';
  // Re-enable the animated progress bar
  const bar = slot.querySelector('.progress-bar-fill');
  bar.classList.add('animated');
  bar.style.width = '0%';
  bar.textContent = '';
  // Reset stat values
  slot.querySelector('.stream-stat-value.time').textContent = '--:--:--';
  slot.querySelector('.stream-stat-value.speed').textContent = '0.00x';
}

/**
 * Update the summary badges in the progress card header
 */
function updateSummaryBadges(queue) {
  if (!queue) return;

  // Only count episodes belonging to the current job — the queue also holds
  // history from previous sessions which would skew these numbers.
  let downloading = 0, completed = 0, failed = 0;
  for (const item of queue) {
    if (jobUrls.size > 0 && !jobUrls.has(item.url)) continue;
    if (item.status === 'downloading') downloading++;
    else if (item.status === 'success') completed++;
    else if (item.status === 'failed') failed++;
  }
  
  elSummaryActive.textContent = t('badge.downloading', { n: downloading });
  elSummaryCompleted.textContent = t('badge.completed', { n: completed });
  elSummaryFailed.textContent = t('badge.failed', { n: failed });

  // Update overall progress bar
  const finishedCount = completed + failed;
  if (jobTotalEpisodes > 0) {
    const overallPercent = Math.round((finishedCount / jobTotalEpisodes) * 100);
    elOverallProgressBar.style.width = `${overallPercent}%`;
    elOverallProgressCount.textContent = t('overall.count', { done: finishedCount, total: jobTotalEpisodes });
  }
}

// ========== Download History ==========

const STATUS_LABELS = {
  pending: { key: 'st.pending', cls: 'st-pending' },
  downloading: { key: 'st.downloading', cls: 'st-downloading' },
  success: { key: 'st.success', cls: 'st-success' },
  failed: { key: 'st.failed', cls: 'st-failed' }
};

function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString(window.i18n.getLocale(), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/**
 * Render the download history table from the latest queue snapshot
 */
function renderHistory() {
  const filter = elHistoryFilter.value;
  const items = filter === 'all' ? latestQueue : latestQueue.filter(i => i.status === filter);

  elHistoryTbody.innerHTML = '';
  elHistoryEmpty.style.display = items.length === 0 ? '' : 'none';

  for (const item of items) {
    const st = STATUS_LABELS[item.status] || { key: null, cls: '' };
    const statusText = st.key ? t(st.key) : item.status;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="hist-title" title="${escapeHtml(item.url)}">${escapeHtml(item.title)}</td>
      <td><span class="status-pill ${st.cls}">${escapeHtml(statusText)}</span></td>
      <td class="hist-retries">${item.retry_count || 0}</td>
      <td class="hist-date">${escapeHtml(formatDateTime(item.last_attempt))}</td>
      <td class="hist-error" title="${escapeHtml(item.error_reason || '')}">${escapeHtml(item.error_reason || '—')}</td>
      <td class="hist-actions">
        <button class="btn btn-xs btn-outline" data-hist-action="retry" data-url="${escapeHtml(item.url)}" title="${escapeHtml(t('hist.rowRetryTitle'))}">🔄</button>
        <button class="btn btn-xs btn-outline btn-outline-danger" data-hist-action="remove" data-url="${escapeHtml(item.url)}" title="${escapeHtml(t('hist.rowRemoveTitle'))}">🗑</button>
      </td>
    `;
    elHistoryTbody.appendChild(tr);
  }
}

/**
 * Reset the given episodes to 'pending' on the server and start downloading them again.
 * Reuses the directory in the input box, or the server's last used directory.
 */
async function retryEpisodes(urls) {
  if (!urls || urls.length === 0) return;
  try {
    const res = await fetch('/api/retry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls, downloadDir: elDownloadDir.value.trim() || undefined })
    });
    const data = await res.json();
    if (data.success) {
      addLogLine(null, 'success', 'clog.retryStarted', { total: data.total });
    } else {
      alert(t('alert.retryFail', { error: data.error }));
    }
  } catch (err) {
    addLogLine(null, 'error', 'clog.retryApiError', { error: err.message });
  }
}

// Per-row actions (retry / remove) via event delegation
elHistoryTbody.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-hist-action]');
  if (!btn) return;
  const url = btn.dataset.url;

  if (btn.dataset.histAction === 'retry') {
    await retryEpisodes([url]);
  } else if (btn.dataset.histAction === 'remove') {
    try {
      const res = await fetch('/api/queue/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: [url] })
      });
      const data = await res.json();
      if (!data.success) alert(t('alert.removeFail', { error: data.error }));
    } catch (err) {
      addLogLine(null, 'error', 'clog.removeError', { error: err.message });
    }
  }
});

elBtnRetryFailed.addEventListener('click', () => {
  const failedUrls = latestQueue.filter(i => i.status === 'failed').map(i => i.url);
  if (failedUrls.length === 0) {
    alert(t('alert.noFailed'));
    return;
  }
  retryEpisodes(failedUrls);
});

elBtnClearHistory.addEventListener('click', async () => {
  if (!confirm(t('confirm.clearHistory'))) return;
  try {
    const res = await fetch('/api/queue/clear', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      addLogLine(null, 'success', 'clog.cleared', { removed: data.removed });
    }
  } catch (err) {
    addLogLine(null, 'error', 'clog.clearError', { error: err.message });
  }
});

elHistoryFilter.addEventListener('change', renderHistory);

// ========== Track Selection ==========

/**
 * Get human-readable language name from lang code
 */
function getLangDisplayName(langCode) {
  const names = {
    'vi': 'Tiếng Việt',
    'en': 'English',
    'ko': '한국어 (Korean)',
    'ja': '日本語 (Japanese)',
    'zh': '中文 (Chinese)',
    'th': 'ไทย (Thai)',
    'id': 'Bahasa Indonesia',
  };
  return names[langCode] || langCode;
}

/**
 * Render audio and subtitle track checkboxes from analyzed data
 */
function renderTrackSelection(data) {
  analyzedTracks = data;

  // Audio tracks
  elAudioTracksList.innerHTML = '';
  if (data.audioTracks.length === 0) {
    elAudioTracksList.innerHTML = `<div class="track-empty">${escapeHtml(t('track.emptyAudio'))}</div>`;
  } else {
    data.audioTracks.forEach((track, i) => {
      const item = document.createElement('label');
      item.className = 'track-item';
      const dubBadge = track.isVietnameseDub ? '<span class="track-badge dub">DUB</span>' : '';
      const defaultBadge = track.default ? '<span class="track-badge default">DEFAULT</span>' : '';
      item.innerHTML = `
        <input type="checkbox" value="${escapeHtml(track.langCode)}" data-index="${i}" checked>
        <div class="track-item-info">
          <span class="track-item-name">${escapeHtml(track.name)}</span>
          <span class="track-item-lang">${escapeHtml(getLangDisplayName(track.langCode))}</span>
        </div>
        <div class="track-item-badges">${defaultBadge}${dubBadge}</div>
      `;
      elAudioTracksList.appendChild(item);
    });
  }

  // Subtitle tracks
  elSubtitleTracksList.innerHTML = '';
  if (data.subtitleTracks.length === 0) {
    elSubtitleTracksList.innerHTML = `<div class="track-empty">${escapeHtml(t('track.emptySub'))}</div>`;
  } else {
    data.subtitleTracks.forEach((track, i) => {
      const item = document.createElement('label');
      item.className = 'track-item';
      const defaultBadge = track.default ? '<span class="track-badge default">DEFAULT</span>' : '';
      item.innerHTML = `
        <input type="checkbox" value="${escapeHtml(track.langCode)}" data-index="${i}" checked>
        <div class="track-item-info">
          <span class="track-item-name">${escapeHtml(track.name)}</span>
          <span class="track-item-lang">${escapeHtml(getLangDisplayName(track.langCode))}</span>
        </div>
        <div class="track-item-badges">${defaultBadge}</div>
      `;
      elSubtitleTracksList.appendChild(item);
    });
  }

  elTrackConfig.classList.remove('hidden');
}

/**
 * Collect selected track preferences from checkboxes
 * @returns {object|null} { audioLangCodes, subtitleLangCodes } or null if all selected
 */
function getTrackPreferences() {
  if (!analyzedTracks) return null;

  const audioCheckboxes = Array.from(elAudioTracksList.querySelectorAll('input[type="checkbox"]'));
  const subCheckboxes = Array.from(elSubtitleTracksList.querySelectorAll('input[type="checkbox"]'));

  const allAudioChecked = audioCheckboxes.every(cb => cb.checked);
  const allSubChecked = subCheckboxes.every(cb => cb.checked);

  // If everything is checked, return null (no filter = download all)
  if (allAudioChecked && allSubChecked) return null;

  const prefs = {};

  if (!allAudioChecked) {
    prefs.audioLangCodes = audioCheckboxes.filter(cb => cb.checked).map(cb => cb.value);
  }
  if (!allSubChecked) {
    prefs.subtitleLangCodes = subCheckboxes.filter(cb => cb.checked).map(cb => cb.value);
  }

  return Object.keys(prefs).length > 0 ? prefs : null;
}

// ========== WebSocket Message Handlers ==========

/**
 * Compute the localized display label for a stream slot from its stored state.
 * The server sends the raw episode title + a phase; the language is applied here.
 */
function streamLabel(stream) {
  if (!stream) return '';
  if (stream.phase === 'intercepting') return t('slot.intercepting', { title: stream.title });
  if (stream.phase === 'retry') return t('slot.retry', { attempt: stream.retryAttempt, max: stream.maxRetries, title: stream.title });
  return stream.title;
}

function handleSocketMessage(data) {
  switch (data.type) {
    case 'log':
      addLogLine(data.message, data.level, data.key, data.params);
      break;

    case 'status_update':
      latestQueue = data.queue || [];
      updateQueueStates(latestQueue);
      updateSummaryBadges(latestQueue);
      renderHistory();
      break;

    case 'job_started':
      // Reset progress UI for the new job (also fires for retry jobs from history)
      jobTotalEpisodes = data.total || 0;
      jobUrls = new Set(data.urls || []);
      activeStreams.clear();
      elStreamsContainer.innerHTML = '';
      elProgressCard.classList.remove('hidden');
      elOverallProgressBar.style.width = '0%';
      elOverallProgressCount.textContent = t('overall.count', { done: 0, total: jobTotalEpisodes });
      elSummaryActive.textContent = t('badge.downloading', { n: 0 });
      elSummaryCompleted.textContent = t('badge.completed', { n: 0 });
      elSummaryFailed.textContent = t('badge.failed', { n: 0 });
      setStartButton('btn.start.downloading', true);
      break;

    case 'active_episode':
      elProgressCard.classList.remove('hidden');

      // Track total episodes for the job
      if (data.total && data.total > jobTotalEpisodes) {
        jobTotalEpisodes = data.total;
      }

      // Resilience: if the page was reloaded mid-job, rebuild the job URL set
      jobUrls.add(data.url);

      // Register this stream as active (store raw fields so the label can be
      // re-localized on language switch)
      activeStreams.set(data.url, {
        title: data.title,
        phase: data.phase,
        retryAttempt: data.retryAttempt,
        maxRetries: data.maxRetries,
        index: data.index,
        total: data.total,
        time: '--:--:--',
        speed: '0.00x',
        percent: 0
      });

      // Create/update the stream slot UI
      const slot = getOrCreateStreamSlot(data.url);

      // If slot was finalized (failed/success), reset it for retry
      if (slot.classList.contains('failed') || slot.classList.contains('success')) {
        resetStreamSlotForRetry(slot);
      }

      updateStreamSlot(data.url, {
        title: streamLabel(activeStreams.get(data.url)),
        index: data.index,
        total: data.total,
        time: '--:--:--',
        speed: '0.00x',
        percent: 0
      });
      
      // Update episode list styling
      document.querySelectorAll('.episode-item').forEach(item => {
        if (item.dataset.url === data.url) {
          item.classList.remove('success', 'failed');
          item.classList.add('downloading');
        }
      });
      break;

    case 'progress': {
      // Update only the matching stream's slot
      const stream = activeStreams.get(data.url);
      if (!stream) break;

      if (data.time !== undefined) stream.time = data.time;
      if (data.speed !== undefined) stream.speed = data.speed;

      // Percent: direct from the engine (N_m3u8DL-RE) or estimated from the
      // episode duration vs FFmpeg's processed time.
      let percent = null;
      if (typeof data.percent === 'number') {
        percent = Math.min(100, Math.round(data.percent));
      } else {
        const totalDurationStr = episodeDurations[data.url];
        if (totalDurationStr && data.time) {
          const totalSecs = parseTimeToSeconds(totalDurationStr);
          const currentSecs = parseTimeToSeconds(data.time);
          if (totalSecs > 0) {
            percent = Math.min(100, Math.round((currentSecs / totalSecs) * 100));
          }
        }
      }
      if (percent !== null) {
        stream.percent = percent;
        stream.determinate = true; // this stream can report real progress
      }

      updateStreamSlot(data.url, {
        time: data.time,
        speed: data.speed,
        percent: percent !== null && percent > 0 ? percent : undefined
      });

      // Show the indeterminate ("Loading...") bar ONLY for streams that have never
      // reported a real percentage (e.g. FFmpeg with no known episode duration).
      // A determinate stream keeps its last bar position on a speed-only update
      // instead of flickering back to 100%.
      if (percent === null && !stream.determinate) {
        const slotId = `stream-${CSS.escape(data.url)}`;
        const progressSlot = document.getElementById(slotId);
        if (progressSlot) {
          const bar = progressSlot.querySelector('.progress-bar-fill');
          bar.style.width = '100%';
          bar.textContent = t('slot.loading');
        }
      }
      break;
    }

    case 'job_complete':
      // Show completion banner
      const banner = document.createElement('div');
      banner.className = 'job-complete-banner';
      banner.innerHTML = `
        <div class="banner-icon">🎉</div>
        <div class="banner-title">${escapeHtml(t('banner.title'))}</div>
        <div class="banner-subtitle">${escapeHtml(t('banner.subtitle'))}</div>
      `;
      elStreamsContainer.appendChild(banner);

      // Fill overall progress bar
      elOverallProgressBar.style.width = '100%';

      // Clear active streams
      activeStreams.clear();

      // Re-enable download button
      setStartButton('btn.start', false);

      // Remove downloading class from all episode items
      document.querySelectorAll('.episode-item').forEach(item => item.classList.remove('downloading'));
      break;

    case 'server_shutdown':
      // Server is exiting on purpose — stop reconnect attempts and lock the UI
      serverShutdown = true;
      updateSystemStatus('shutdown');
      elBtnShutdown.disabled = true;
      elBtnStartDownload.disabled = true;
      break;
  }
}

// Update DOM checkboxes representing download status
function updateQueueStates(queue) {
  queue.forEach(item => {
    const elItem = document.querySelector(`.episode-item[data-url="${CSS.escape(item.url)}"]`);
    if (elItem) {
      elItem.classList.remove('downloading', 'success', 'failed');
      if (item.status === 'success') {
        elItem.classList.add('success');
        finalizeStreamSlot(item.url, 'success');
      } else if (item.status === 'failed') {
        elItem.classList.add('failed');
        finalizeStreamSlot(item.url, 'failed');
      } else if (item.status === 'downloading') {
        elItem.classList.add('downloading');
      }
    }
  });
}

/**
 * Print a log line to the console box.
 * @param {string|null} text  Fallback/plain text (used when no i18nKey, or key is unknown).
 * @param {string} level      Log level class.
 * @param {string|null} i18nKey  Translation key; when set the line re-localizes on language switch.
 * @param {object|null} i18nParams  Interpolation params for the key.
 */
function addLogLine(text, level = 'info', i18nKey = null, i18nParams = null) {
  const line = document.createElement('div');
  line.className = `log-line ${level}`;

  // Format timestamp
  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  line.dataset.ts = timeStr;

  if (i18nKey) {
    line.dataset.i18nKey = i18nKey;
    if (i18nParams) line.dataset.i18nParams = JSON.stringify(i18nParams);
    if (text != null) line.dataset.fallback = text;
  }

  line.textContent = `[${timeStr}] ${renderLogText(line, text)}`;
  elConsoleLogs.appendChild(line);

  // Cap log length so long download sessions don't bloat the DOM
  while (elConsoleLogs.children.length > 500) {
    elConsoleLogs.removeChild(elConsoleLogs.firstChild);
  }

  // Scroll to bottom
  elConsoleLogs.scrollTop = elConsoleLogs.scrollHeight;
}

/**
 * Resolve the message text for a log line: translate its key if present and known,
 * otherwise fall back to the provided/stored plain text.
 */
function renderLogText(line, fallbackText) {
  const key = line.dataset.i18nKey;
  if (key) {
    const params = line.dataset.i18nParams ? JSON.parse(line.dataset.i18nParams) : undefined;
    // If the current language lacks this key, t() falls back to Vietnamese, which
    // for server logs equals the fallback text — so translation is always safe.
    return t(key, params);
  }
  return fallbackText != null ? fallbackText : (line.dataset.fallback || '');
}

/** Re-translate all log lines that carry an i18n key (called on language switch) */
function retranslateLogs() {
  elConsoleLogs.querySelectorAll('.log-line[data-i18n-key]').forEach(line => {
    line.textContent = `[${line.dataset.ts}] ${renderLogText(line, null)}`;
  });
}

// ========== Event Listeners ==========

// Browse directory
elBtnBrowseDir.addEventListener('click', async () => {
  try {
    const res = await fetch('/api/select-dir', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      elDownloadDir.value = data.path;
    }
  } catch (err) {
    addLogLine(null, 'error', 'clog.dirError', { error: err.message });
  }
});

// Scrape episodes
elBtnScrape.addEventListener('click', async () => {
  const url = elMovieUrl.value.trim();
  if (!url) {
    alert(t('alert.enterLink'));
    return;
  }

  elBtnScrape.disabled = true;
  setButtonLabel(elBtnScrape, 'btn.scrape.busy');

  // Reset track analysis when re-scraping
  analyzedTracks = null;
  elTrackConfig.classList.add('hidden');

  try {
    const res = await fetch('/api/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });

    const data = await res.json();
    if (data.success) {
      scrapedEpisodes = data.episodes;
      renderEpisodesGrid(scrapedEpisodes);
    } else {
      alert(t('alert.scrapeError', { error: data.error }));
    }
  } catch (err) {
    addLogLine(null, 'error', 'clog.scrapeApiError', { error: err.message });
  } finally {
    elBtnScrape.disabled = false;
    setButtonLabel(elBtnScrape, 'btn.scrape');
  }
});

function renderEpisodesGrid(episodes) {
  elEpisodesContainer.innerHTML = '';
  episodeDurations = {};

  if (episodes.length === 0) {
    elEpisodesContainer.innerHTML = `<div style="grid-column: 1/-1; padding: 1.5rem; text-align: center; color: var(--text-secondary);">${escapeHtml(t('ep.emptyDom'))}</div>`;
    elEpisodesCard.classList.remove('hidden');
    return;
  }

  // Map history statuses so already-downloaded episodes are visible immediately
  const statusByUrl = new Map(latestQueue.map(i => [i.url, i.status]));

  episodes.forEach((ep) => {
    // Record duration
    if (ep.duration) {
      episodeDurations[ep.url] = ep.duration;
    }

    // Build via DOM APIs so titles with quotes/angle brackets can't break the markup
    const item = document.createElement('label');
    item.className = 'episode-item selected';
    item.dataset.url = ep.url;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = ep.url;
    checkbox.checked = true;

    const span = document.createElement('span');
    span.textContent = ep.title;
    span.title = `${ep.title} (${ep.duration || 'N/A'})`;

    item.appendChild(checkbox);
    item.appendChild(span);

    const st = statusByUrl.get(ep.url);
    if (st === 'success' || st === 'failed') {
      item.classList.add(st);
    }

    checkbox.addEventListener('change', () => {
      item.classList.toggle('selected', checkbox.checked);
    });

    elEpisodesContainer.appendChild(item);
  });

  elEpisodesCard.classList.remove('hidden');
}

// Select/Deselect All episodes
elBtnSelectAll.addEventListener('click', () => {
  document.querySelectorAll('#episodes-container input[type="checkbox"]').forEach(cb => {
    cb.checked = true;
    cb.parentElement.classList.add('selected');
  });
});

elBtnDeselectAll.addEventListener('click', () => {
  document.querySelectorAll('#episodes-container input[type="checkbox"]').forEach(cb => {
    cb.checked = false;
    cb.parentElement.classList.remove('selected');
  });
});

// Analyze Streams button
elBtnAnalyze.addEventListener('click', async () => {
  // Get first selected episode URL for analysis
  const selectedCbs = Array.from(document.querySelectorAll('#episodes-container input[type="checkbox"]:checked'));
  if (selectedCbs.length === 0) {
    alert(t('alert.selectOneAnalyze'));
    return;
  }

  const firstEpUrl = selectedCbs[0].value;

  elBtnAnalyze.disabled = true;
  setButtonLabel(elBtnAnalyze, 'btn.analyze.busy');

  try {
    const res = await fetch('/api/analyze-streams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ episodeUrl: firstEpUrl })
    });

    const data = await res.json();
    if (data.success) {
      renderTrackSelection(data);
      addLogLine(null, 'success', 'clog.analyzeSuccess', { audio: data.audioTracks.length, sub: data.subtitleTracks.length });
    } else {
      alert(t('alert.analyzeError', { error: data.error }));
      addLogLine(null, 'error', 'clog.analyzeError', { error: data.error });
    }
  } catch (err) {
    addLogLine(null, 'error', 'clog.analyzeApiError', { error: err.message });
  } finally {
    elBtnAnalyze.disabled = false;
    setButtonLabel(elBtnAnalyze, 'btn.analyze');
  }
});

// Track panel select/deselect all buttons
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;

  const action = btn.dataset.action;
  let targetList = null;

  if (action === 'select-all-audio' || action === 'deselect-all-audio') {
    targetList = elAudioTracksList;
  } else if (action === 'select-all-subs' || action === 'deselect-all-subs') {
    targetList = elSubtitleTracksList;
  }

  if (targetList) {
    const checked = action.startsWith('select');
    targetList.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.checked = checked;
    });
  }
});

// Start Download
elBtnStartDownload.addEventListener('click', async () => {
  const selectedCbs = Array.from(document.querySelectorAll('#episodes-container input[type="checkbox"]:checked'));
  const downloadDir = elDownloadDir.value.trim();
  const force = elForceRedownload.checked;

  if (selectedCbs.length === 0) {
    alert(t('alert.selectOneDownload'));
    return;
  }
  if (!downloadDir) {
    alert(t('alert.enterDir'));
    return;
  }

  // Map to target episode objects
  const episodesToDownload = selectedCbs.map(cb => {
    const parent = cb.parentElement;
    const title = parent.querySelector('span').textContent;
    return { title, url: cb.value };
  });

  // Collect track preferences
  const trackPreferences = getTrackPreferences();

  // Disable button immediately; the 'job_started' WS message resets the progress UI
  setStartButton('btn.start.starting', true);

  try {
    const res = await fetch('/api/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        episodes: episodesToDownload,
        downloadDir,
        trackPreferences,
        force
      })
    });

    const data = await res.json();
    if (data.success && data.started) {
      addLogLine(null, 'success', 'clog.jobActivated', { total: data.total });
      if (data.skipped > 0) {
        addLogLine(null, 'warning', 'clog.jobActivatedSkip', { skipped: data.skipped });
      }
    } else if (data.success && !data.started) {
      alert(t('alert.allDone'));
      setStartButton('btn.start', false);
    } else {
      alert(t('alert.startError', { error: data.error }));
      setStartButton('btn.start', false);
    }
  } catch (err) {
    addLogLine(null, 'error', 'clog.serverConnError', { error: err.message });
    setStartButton('btn.start', false);
  }
});

elBtnClearLogs.addEventListener('click', () => {
  elConsoleLogs.innerHTML = '';
});

// Shutdown server button
elBtnShutdown.addEventListener('click', async () => {
  if (!confirm(t('confirm.shutdown'))) return;
  elBtnShutdown.disabled = true;
  try {
    const res = await fetch('/api/shutdown', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      addLogLine(null, 'warning', 'clog.shutdownSent');
    } else {
      elBtnShutdown.disabled = false;
    }
  } catch (err) {
    addLogLine(null, 'error', 'clog.shutdownError', { error: err.message });
    elBtnShutdown.disabled = false;
  }
});

// ========== Language switch — re-render everything dynamic ==========
document.addEventListener('langchange', () => {
  // applyStaticTranslations() (run inside setLang) resets [data-i18n] nodes, so
  // here we fix up everything that is state-dependent.

  // Connection status reflects the live state, not the static default
  updateSystemStatus(systemStatusState);

  // State-dependent button labels (idle vs busy/downloading)
  [elBtnScrape, elBtnAnalyze, elBtnStartDownload].forEach(btn => {
    if (btn.dataset.labelKey) setButtonLabel(btn, btn.dataset.labelKey);
  });

  // Dynamic panels
  updateSummaryBadges(latestQueue);
  renderHistory();
  retranslateLogs();

  // Re-localize any live download slots
  for (const [url, stream] of activeStreams) {
    updateStreamSlot(url, { title: streamLabel(stream) });
  }
});

// Initialize idle button label keys so the switch handler can re-translate them
elBtnScrape.dataset.labelKey = 'btn.scrape';
elBtnAnalyze.dataset.labelKey = 'btn.analyze';
elBtnStartDownload.dataset.labelKey = 'btn.start';

// Restore the last used download folder from the previous session
async function restoreSavedSettings() {
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();
    if (data.lastDownloadDir && !elDownloadDir.value.trim()) {
      elDownloadDir.value = data.lastDownloadDir;
    }
  } catch { /* ignore — nothing saved yet */ }
}
restoreSavedSettings();

// Start WebSockets
connectWebSocket();
