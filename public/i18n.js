// ===================================================================
// Lightweight client-side i18n (Vietnamese / English)
// Loaded as a classic script BEFORE app.js — exposes window.i18n.
// Wrapped in an IIFE so helpers like `t` don't leak into the global
// scope (app.js declares its own `const t`, which would otherwise clash).
// ===================================================================

(function () {

const TRANSLATIONS = {
  vi: {
    // Document / header
    'doc.title': 'M3U8 Multi-Stream Downloader',
    'lang.toggleTitle': 'Chuyển đổi ngôn ngữ',

    // Connection status
    'status.connecting': 'Đang kết nối...',
    'status.connected': 'Đã kết nối',
    'status.disconnected': 'Mất kết nối',
    'status.error': 'Lỗi kết nối',
    'status.shutdown': 'Server đã tắt',

    // Shutdown
    'shutdown.label': '⏻ Tắt server',
    'shutdown.title': 'Tắt server hoàn toàn (dừng mọi tiến trình tải và đóng trình duyệt)',
    'confirm.shutdown': 'Tắt server M3U8 Downloader?\nMọi tiến trình tải đang chạy sẽ bị dừng (tập dở dang sẽ tự tải tiếp ở lần khởi động sau).',
    'clog.shutdownSent': 'Đã gửi lệnh tắt server. Hẹn gặp lại!',
    'clog.shutdownError': 'Lỗi gửi lệnh tắt server: {error}',
    'slog.shutdown': 'Đang tắt server theo yêu cầu... Dừng FFmpeg và đóng trình duyệt.',

    // Section 1 — config
    'cfg.heading': '1. Cấu hình tải xuống',
    'cfg.urlLabel': 'Đường dẫn phim (URL)',
    'cfg.urlPlaceholder': 'Nhập link phim (ví dụ: https://tv360.vn/movie/...)',
    'cfg.dirLabel': 'Thư mục lưu video & phụ đề',
    'cfg.browseTitle': 'Chọn thư mục bằng hộp thoại Windows',
    'cfg.browse': '📂 Chọn thư mục',
    'btn.scrape': '🔍 Quét danh sách tập phim',
    'btn.scrape.busy': '⚡ Đang quét dữ liệu, vui lòng đợi...',

    // Section 2 — episodes
    'ep.heading': '2. Chọn tập phim để tải',
    'ep.selectAll': 'Chọn tất cả',
    'ep.deselectAll': 'Bỏ chọn',
    'ep.emptyDom': 'Không tìm thấy tập phim nào trong DOM.',
    'btn.analyze': '🔍 Phân tích luồng âm thanh & phụ đề',
    'btn.analyze.busy': '⚡ Đang phân tích luồng, vui lòng đợi...',

    // Track selection
    'track.audioHeading': 'Luồng âm thanh',
    'track.subHeading': 'Luồng phụ đề',
    'track.all': 'Tất cả',
    'track.none': 'Bỏ chọn',
    'track.emptyAudio': 'Không tìm thấy luồng âm thanh riêng biệt',
    'track.emptySub': 'Không tìm thấy luồng phụ đề',
    'track.info': 'Cấu hình này sẽ áp dụng cho <strong>tất cả</strong> các tập phim đã chọn. Nhiều luồng âm thanh sẽ được gộp vào 1 file MKV.',

    // Download actions
    'force.title': 'Bỏ qua lịch sử: tải lại và ghi đè cả những tập đã tải thành công trước đó',
    'force.label': 'Tải lại cả tập đã thành công (ghi đè file cũ)',
    'btn.start': '🚀 BẮT ĐẦU TẢI XUỐNG',
    'btn.start.starting': '⏳ Đang bắt đầu tải...',
    'btn.start.downloading': '⏳ Đang tải xuống...',

    // Section 3 — progress
    'prog.heading': '3. Tiến độ tải xuống',
    'prog.overallLabel': 'Tiến độ chung',
    'badge.downloading': '{n} đang tải',
    'badge.completed': '{n} hoàn tất',
    'badge.failed': '{n} lỗi',
    'overall.count': '{done} / {total} tập',
    'slot.intercepting': '⏳ Đang lấy link: {title}',
    'slot.retry': '🔄 Thử lại {attempt}/{max}: {title}',
    'slot.loading': 'Đang tải...',
    'slot.time': 'Thời gian:',
    'slot.speed': 'Tốc độ:',
    'slot.namePlaceholder': 'Đang tải...',
    'banner.title': 'Hoàn tất tất cả tiến trình!',
    'banner.subtitle': 'Tất cả các tập đã được xử lý xong.',

    // Section 4 — history
    'hist.heading': '4. Lịch sử tải xuống',
    'hist.filterTitle': 'Lọc theo trạng thái',
    'hist.filterAll': 'Tất cả',
    'hist.filterFailed': 'Chỉ tập lỗi',
    'hist.filterSuccess': 'Chỉ tập thành công',
    'hist.filterPending': 'Đang chờ',
    'hist.retryFailedTitle': 'Đặt lại và tải lại toàn bộ các tập bị lỗi',
    'hist.retryFailed': '🔄 Tải lại tập lỗi',
    'hist.clearTitle': 'Xóa toàn bộ lịch sử (không xóa file video đã tải)',
    'hist.clear': '🗑 Xóa lịch sử',
    'hist.colEpisode': 'Tập phim',
    'hist.colStatus': 'Trạng thái',
    'hist.colAttempts': 'Số lần thử',
    'hist.colLast': 'Lần cuối',
    'hist.colError': 'Lý do lỗi',
    'hist.empty': 'Chưa có lịch sử tải xuống nào.',
    'hist.rowRetryTitle': 'Tải lại tập này (kể cả khi đã thành công)',
    'hist.rowRemoveTitle': 'Xóa mục này khỏi lịch sử',

    // Status pills
    'st.pending': 'Chờ tải',
    'st.downloading': 'Đang tải',
    'st.success': 'Thành công',
    'st.failed': 'Lỗi',

    // Console log section
    'console.heading': 'Nhật ký hoạt động',
    'console.clear': 'Xóa log',
    'console.init': 'Hệ thống đã khởi tạo thành công. Vui lòng nhập link phim và cấu hình để bắt đầu.',

    // Alerts / confirms
    'alert.enterLink': 'Vui lòng nhập link phim để cào!',
    'alert.scrapeError': 'Lỗi khi quét: {error}',
    'alert.selectOneAnalyze': 'Vui lòng chọn ít nhất 1 tập phim trước khi phân tích!',
    'alert.analyzeError': 'Lỗi phân tích: {error}',
    'alert.selectOneDownload': 'Vui lòng chọn ít nhất 1 tập phim để tải!',
    'alert.enterDir': 'Vui lòng chọn hoặc nhập thư mục lưu!',
    'alert.allDone': 'Tất cả các tập đã chọn đều đã tải thành công trước đó.\nTick "Tải lại cả tập đã thành công (ghi đè file cũ)" nếu bạn muốn tải lại.',
    'alert.startError': 'Lỗi bắt đầu tải: {error}',
    'alert.retryFail': 'Không thể tải lại: {error}',
    'alert.removeFail': 'Không thể xóa: {error}',
    'alert.noFailed': 'Không có tập lỗi nào trong lịch sử để tải lại.',
    'confirm.clearHistory': 'Xóa toàn bộ lịch sử tải xuống?\n(Các file video đã tải sẽ KHÔNG bị xóa.)',

    // Client-originated log lines
    'clog.wsConnected': 'Đã kết nối thành công với WebSocket server.',
    'clog.wsLost': 'Mất kết nối với máy chủ. Tự động kết nối lại sau 3 giây...',
    'clog.dirError': 'Lỗi chọn thư mục: {error}',
    'clog.scrapeApiError': 'Lỗi gọi API quét: {error}',
    'clog.analyzeSuccess': 'Phân tích thành công: {audio} luồng âm thanh, {sub} luồng phụ đề.',
    'clog.analyzeError': 'Lỗi phân tích luồng: {error}',
    'clog.analyzeApiError': 'Lỗi gọi API phân tích: {error}',
    'clog.jobActivated': 'Tiến trình tải {total} tập đã được kích hoạt trên máy chủ.',
    'clog.jobActivatedSkip': ' (Bỏ qua {skipped} tập đã tải thành công — tick "Tải lại cả tập đã thành công" để tải lại.)',
    'clog.serverConnError': 'Lỗi kết nối máy chủ tải: {error}',
    'clog.retryStarted': 'Đã bắt đầu tải lại {total} tập từ lịch sử.',
    'clog.retryApiError': 'Lỗi gọi API tải lại: {error}',
    'clog.removeError': 'Lỗi xóa mục lịch sử: {error}',
    'clog.clearError': 'Lỗi xóa lịch sử: {error}',
    'clog.cleared': 'Đã xóa {removed} mục khỏi lịch sử.',

    // Server-originated log lines (broadcast with keys)
    'slog.browserReady': 'Trình duyệt Playwright đã sẵn sàng ở chế độ có đầu (headful).',
    'slog.browserFailed': 'Không khởi động được trình duyệt: {error}',
    'slog.dirOpening': 'Đang mở hộp thoại chọn thư mục trên Windows...',
    'slog.dirSelected': 'Đã chọn thư mục lưu: {path}',
    'slog.dirCancelled': 'Đã hủy chọn thư mục.',
    'slog.dirError': 'Lỗi khi mở Folder Picker: {error}',
    'slog.scrapeStart': 'Đang cào danh sách tập phim từ URL: {url}',
    'slog.scrapeSuccess': 'Cào thành công. Tìm thấy {count} tập phim.',
    'slog.scrapeError': 'Lỗi cào danh sách tập: {error}',
    'slog.analyzeStart': 'Đang phân tích luồng phát từ tập: {url}',
    'slog.analyzeIntercepted': 'Đã chặn M3U8 thành công. Đang phân tích Master Playlist...',
    'slog.analyzeDone': 'Phân tích hoàn tất: {audio} luồng âm thanh, {sub} luồng phụ đề.',
    'slog.analyzeError': 'Lỗi phân tích luồng: {error}',
    'slog.jobStart': 'Bắt đầu tiến trình tải {count} tập phim (tối đa {concurrent} tập đồng thời)...',
    'slog.engine': 'Engine tải xuống: {engine}',
    'slog.engineFallback': 'Không tìm thấy N_m3u8DL-RE tại "{path}" — dùng FFmpeg thay thế.',
    'slog.epRetry': '[Thử lại {attempt}/{max}] Đang thử lại: "{title}"',
    'slog.epIntercepting': '[Tập {index}/{total}] Đang chặn M3U8: "{title}"',
    'slog.epIntercepted': '[{title}] Đã chặn M3U8 thành công.',
    'slog.epFfmpeg': '[{title}] Bắt đầu tải video & phụ đề...',
    'slog.epSuccess': 'Tải thành công tập: "{title}"',
    'slog.epSuccessRetry': '[Thử lại] Tải thành công tập: "{title}"',
    'slog.epFailedFinal': '[{title}] Thất bại sau {max} lần thử lại: {error}',
    'slog.epFailedRetry': '[{title}] Lỗi (sẽ thử lại {attempt}/{max}): {error}',
    'slog.jobDone': '=== Hoàn tất quá trình tải toàn bộ danh sách đã chọn ===',
    'slog.jobFatal': 'Lỗi nghiêm trọng trong hàng chờ tải: {error}',
    'slog.forceReset': 'Chế độ tải lại: đã đặt lại trạng thái {count} tập để tải lại từ đầu.',
    'slog.skip': 'Bỏ qua {skipped} tập đã tải thành công trước đó. Tick "Tải lại cả tập đã thành công" nếu muốn tải lại.',
    'slog.skipAll': 'Tất cả các tập đã chọn đều đã tải thành công trước đó. Không có gì để tải.',
    'slog.retryStart': 'Tải lại {count} tập từ lịch sử (thư mục lưu: {dir}).',
    'slog.historyRemoved': 'Đã xóa {removed} mục khỏi lịch sử tải xuống.',
    'slog.historyCleared': 'Đã xóa toàn bộ lịch sử tải xuống ({removed} mục).',
    'slog.serverRunning': 'Web UI Server đang chạy tại: http://localhost:{port}',
  },

  en: {
    // Document / header
    'doc.title': 'M3U8 Multi-Stream Downloader',
    'lang.toggleTitle': 'Switch language',

    // Connection status
    'status.connecting': 'Connecting...',
    'status.connected': 'Connected',
    'status.disconnected': 'Disconnected',
    'status.error': 'Connection error',
    'status.shutdown': 'Server stopped',

    // Shutdown
    'shutdown.label': '⏻ Shutdown',
    'shutdown.title': 'Shut down the server completely (stops all downloads and closes the browser)',
    'confirm.shutdown': 'Shut down the M3U8 Downloader server?\nAll running downloads will stop (unfinished episodes resume on next start).',
    'clog.shutdownSent': 'Shutdown command sent. See you next time!',
    'clog.shutdownError': 'Error sending shutdown command: {error}',
    'slog.shutdown': 'Shutting down server... stopping FFmpeg and closing the browser.',

    // Section 1 — config
    'cfg.heading': '1. Download Configuration',
    'cfg.urlLabel': 'Movie URL',
    'cfg.urlPlaceholder': 'Enter movie link (e.g. https://tv360.vn/movie/...)',
    'cfg.dirLabel': 'Save folder (video & subtitles)',
    'cfg.browseTitle': 'Pick a folder via the Windows dialog',
    'cfg.browse': '📂 Choose folder',
    'btn.scrape': '🔍 Scan episode list',
    'btn.scrape.busy': '⚡ Scanning, please wait...',

    // Section 2 — episodes
    'ep.heading': '2. Select Episodes to Download',
    'ep.selectAll': 'Select all',
    'ep.deselectAll': 'Deselect',
    'ep.emptyDom': 'No episodes found in the page.',
    'btn.analyze': '🔍 Analyze audio & subtitle tracks',
    'btn.analyze.busy': '⚡ Analyzing streams, please wait...',

    // Track selection
    'track.audioHeading': 'Audio tracks',
    'track.subHeading': 'Subtitle tracks',
    'track.all': 'All',
    'track.none': 'None',
    'track.emptyAudio': 'No separate audio tracks found',
    'track.emptySub': 'No subtitle tracks found',
    'track.info': 'This configuration applies to <strong>all</strong> selected episodes. Multiple audio tracks are merged into a single MKV file.',

    // Download actions
    'force.title': 'Ignore history: re-download and overwrite episodes that already completed successfully',
    'force.label': 'Re-download episodes already completed (overwrite old files)',
    'btn.start': '🚀 START DOWNLOAD',
    'btn.start.starting': '⏳ Starting download...',
    'btn.start.downloading': '⏳ Downloading...',

    // Section 3 — progress
    'prog.heading': '3. Download Progress',
    'prog.overallLabel': 'Overall progress',
    'badge.downloading': '{n} downloading',
    'badge.completed': '{n} completed',
    'badge.failed': '{n} failed',
    'overall.count': '{done} / {total} eps',
    'slot.intercepting': '⏳ Getting link: {title}',
    'slot.retry': '🔄 Retry {attempt}/{max}: {title}',
    'slot.loading': 'Downloading...',
    'slot.time': 'Time:',
    'slot.speed': 'Speed:',
    'slot.namePlaceholder': 'Loading...',
    'banner.title': 'All tasks complete!',
    'banner.subtitle': 'All episodes have been processed.',

    // Section 4 — history
    'hist.heading': '4. Download History',
    'hist.filterTitle': 'Filter by status',
    'hist.filterAll': 'All',
    'hist.filterFailed': 'Failed only',
    'hist.filterSuccess': 'Successful only',
    'hist.filterPending': 'Pending',
    'hist.retryFailedTitle': 'Reset and re-download all failed episodes',
    'hist.retryFailed': '🔄 Retry failed',
    'hist.clearTitle': 'Clear all history (downloaded video files are kept)',
    'hist.clear': '🗑 Clear history',
    'hist.colEpisode': 'Episode',
    'hist.colStatus': 'Status',
    'hist.colAttempts': 'Attempts',
    'hist.colLast': 'Last attempt',
    'hist.colError': 'Error reason',
    'hist.empty': 'No download history yet.',
    'hist.rowRetryTitle': 'Re-download this episode (even if already completed)',
    'hist.rowRemoveTitle': 'Remove this item from history',

    // Status pills
    'st.pending': 'Pending',
    'st.downloading': 'Downloading',
    'st.success': 'Success',
    'st.failed': 'Failed',

    // Console log section
    'console.heading': 'Activity Log',
    'console.clear': 'Clear log',
    'console.init': 'System initialized successfully. Enter a movie link and configuration to begin.',

    // Alerts / confirms
    'alert.enterLink': 'Please enter a movie link to scan!',
    'alert.scrapeError': 'Scan error: {error}',
    'alert.selectOneAnalyze': 'Please select at least 1 episode before analyzing!',
    'alert.analyzeError': 'Analysis error: {error}',
    'alert.selectOneDownload': 'Please select at least 1 episode to download!',
    'alert.enterDir': 'Please choose or enter a save folder!',
    'alert.allDone': 'All selected episodes were already downloaded successfully.\nTick "Re-download episodes already completed (overwrite old files)" if you want to download them again.',
    'alert.startError': 'Failed to start download: {error}',
    'alert.retryFail': 'Could not retry: {error}',
    'alert.removeFail': 'Could not remove: {error}',
    'alert.noFailed': 'No failed episodes in history to retry.',
    'confirm.clearHistory': 'Clear all download history?\n(Downloaded video files will NOT be deleted.)',

    // Client-originated log lines
    'clog.wsConnected': 'Connected to the WebSocket server.',
    'clog.wsLost': 'Lost connection to the server. Reconnecting in 3 seconds...',
    'clog.dirError': 'Folder selection error: {error}',
    'clog.scrapeApiError': 'Scan API error: {error}',
    'clog.analyzeSuccess': 'Analysis complete: {audio} audio track(s), {sub} subtitle track(s).',
    'clog.analyzeError': 'Stream analysis error: {error}',
    'clog.analyzeApiError': 'Analyze API error: {error}',
    'clog.jobActivated': 'Download of {total} episode(s) started on the server.',
    'clog.jobActivatedSkip': ' (Skipped {skipped} already-completed — tick "Re-download episodes already completed" to redo.)',
    'clog.serverConnError': 'Download server connection error: {error}',
    'clog.retryStarted': 'Started re-downloading {total} episode(s) from history.',
    'clog.retryApiError': 'Retry API error: {error}',
    'clog.removeError': 'Error removing history item: {error}',
    'clog.clearError': 'Error clearing history: {error}',
    'clog.cleared': 'Removed {removed} item(s) from history.',

    // Server-originated log lines (broadcast with keys)
    'slog.browserReady': 'Playwright browser is ready in headful mode.',
    'slog.browserFailed': 'Failed to start browser: {error}',
    'slog.dirOpening': 'Opening the Windows folder picker...',
    'slog.dirSelected': 'Save folder selected: {path}',
    'slog.dirCancelled': 'Folder selection cancelled.',
    'slog.dirError': 'Error opening folder picker: {error}',
    'slog.scrapeStart': 'Scanning episode list from URL: {url}',
    'slog.scrapeSuccess': 'Scan complete. Found {count} episode(s).',
    'slog.scrapeError': 'Error scanning episodes: {error}',
    'slog.analyzeStart': 'Analyzing streams from episode: {url}',
    'slog.analyzeIntercepted': 'M3U8 intercepted. Parsing master playlist...',
    'slog.analyzeDone': 'Analysis complete: {audio} audio track(s), {sub} subtitle track(s).',
    'slog.analyzeError': 'Stream analysis error: {error}',
    'slog.jobStart': 'Starting download of {count} episode(s) (up to {concurrent} concurrent)...',
    'slog.engine': 'Download engine: {engine}',
    'slog.engineFallback': 'N_m3u8DL-RE not found at "{path}" — falling back to FFmpeg.',
    'slog.epRetry': '[Retry {attempt}/{max}] Retrying: "{title}"',
    'slog.epIntercepting': '[Episode {index}/{total}] Intercepting M3U8: "{title}"',
    'slog.epIntercepted': '[{title}] M3U8 intercepted.',
    'slog.epFfmpeg': '[{title}] Downloading video & subtitles...',
    'slog.epSuccess': 'Downloaded episode: "{title}"',
    'slog.epSuccessRetry': '[Retry] Downloaded episode: "{title}"',
    'slog.epFailedFinal': '[{title}] Failed after {max} retries: {error}',
    'slog.epFailedRetry': '[{title}] Error (will retry {attempt}/{max}): {error}',
    'slog.jobDone': '=== Finished downloading the entire selected list ===',
    'slog.jobFatal': 'Fatal error in the download queue: {error}',
    'slog.forceReset': 'Force mode: reset {count} episode(s) to download again from scratch.',
    'slog.skip': 'Skipped {skipped} episode(s) already downloaded. Tick "Re-download episodes already completed" to download them again.',
    'slog.skipAll': 'All selected episodes were already downloaded successfully. Nothing to do.',
    'slog.retryStart': 'Re-downloading {count} episode(s) from history (save folder: {dir}).',
    'slog.historyRemoved': 'Removed {removed} item(s) from download history.',
    'slog.historyCleared': 'Cleared all download history ({removed} item(s)).',
    'slog.serverRunning': 'Web UI server running at: http://localhost:{port}',
  },
};

const LANG_STORAGE_KEY = 'm3u8_lang';
const SUPPORTED_LANGS = ['vi', 'en'];

let currentLang = (() => {
  try {
    const saved = localStorage.getItem(LANG_STORAGE_KEY);
    if (saved && SUPPORTED_LANGS.includes(saved)) return saved;
  } catch { /* ignore */ }
  return 'vi';
})();

/**
 * Translate a key with optional {placeholder} interpolation.
 * Falls back to Vietnamese, then to the key itself.
 */
function t(key, params) {
  const dict = TRANSLATIONS[currentLang] || TRANSLATIONS.vi;
  let str = dict[key];
  if (str === undefined) str = TRANSLATIONS.vi[key];
  if (str === undefined) return key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      str = str.split(`{${k}}`).join(String(v));
    }
  }
  return str;
}

function getLang() {
  return currentLang;
}

/** Locale used for date formatting */
function getLocale() {
  return currentLang === 'en' ? 'en-GB' : 'vi-VN';
}

function setLang(lang) {
  if (!SUPPORTED_LANGS.includes(lang) || lang === currentLang) return;
  currentLang = lang;
  try { localStorage.setItem(LANG_STORAGE_KEY, lang); } catch { /* ignore */ }
  applyStaticTranslations();
  updateToggleUI();
  // Let app.js re-render dynamic content (history, badges, logs, ...)
  document.dispatchEvent(new CustomEvent('langchange', { detail: { lang } }));
}

/** Apply translations to all elements carrying data-i18n* attributes */
function applyStaticTranslations(root = document) {
  document.documentElement.lang = currentLang;

  root.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  root.querySelectorAll('[data-i18n-html]').forEach(el => {
    el.innerHTML = t(el.getAttribute('data-i18n-html'));
  });
  root.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
  });
  root.querySelectorAll('[data-i18n-title]').forEach(el => {
    el.setAttribute('title', t(el.getAttribute('data-i18n-title')));
  });
}

function updateToggleUI() {
  document.querySelectorAll('#lang-toggle .lang-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === currentLang);
  });
}

function initToggle() {
  const toggle = document.getElementById('lang-toggle');
  if (toggle) {
    toggle.addEventListener('click', (e) => {
      const btn = e.target.closest('.lang-btn');
      if (btn) setLang(btn.dataset.lang);
    });
  }
  updateToggleUI();
  applyStaticTranslations();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initToggle);
} else {
  initToggle();
}

window.i18n = { t, getLang, getLocale, setLang, applyStaticTranslations };

})();
