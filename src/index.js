import fs from 'fs/promises';
import path from 'path';
import readline from 'readline';
import { BrowserHelper } from './browser.js';
import { QueueManager } from './queue.js';
import { resolveStreamInfo, selectTracks } from './parser.js';
import { Downloader } from './downloader.js';

const isCli = process.argv.includes('--cli');

if (isCli) {
  // Helper to ask questions in terminal
  function askQuestion(query) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    return new Promise((resolve) => rl.question(query, (ans) => {
      rl.close();
      resolve(ans.trim());
    }));
  }

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

  /**
   * Interactive track selection for CLI mode.
   * Displays available tracks and lets the user pick by number.
   * @returns {object|null} trackPreferences or null (download all)
   */
  async function promptTrackSelection(streamInfo) {
    const audioTracks = streamInfo.audioTracks || [];
    const subtitleTracks = streamInfo.subtitleTracks || [];

    if (audioTracks.length === 0 && subtitleTracks.length === 0) {
      console.log(`\x1b[33mKhông tìm thấy luồng âm thanh/phụ đề riêng biệt.\x1b[0m`);
      return null;
    }

    const preferences = {};

    // --- Audio track selection ---
    if (audioTracks.length > 0) {
      console.log(`\n\x1b[36m=== LUỒNG ÂM THANH (${audioTracks.length} luồng) ===\x1b[0m`);
      audioTracks.forEach((t, i) => {
        const defaultTag = t.default ? ' [DEFAULT]' : '';
        const dubTag = t.isVietnameseDub ? ' [DUB]' : '';
        console.log(`  ${i + 1}. ${t.name} (${t.langCode})${defaultTag}${dubTag}`);
      });

      const audioAnswer = await askQuestion(
        '\x1b[33mChọn luồng âm thanh (nhập số, cách nhau bởi dấu phẩy, hoặc "all" để tải tất cả) [Mặc định: all]: \x1b[0m'
      );

      if (audioAnswer && audioAnswer.toLowerCase() !== 'all') {
        const indices = audioAnswer.split(',').map(s => parseInt(s.trim(), 10) - 1).filter(i => i >= 0 && i < audioTracks.length);
        if (indices.length > 0) {
          preferences.audioLangCodes = indices.map(i => audioTracks[i].langCode);
          console.log(`\x1b[32mĐã chọn: ${indices.map(i => `${audioTracks[i].name} (${audioTracks[i].langCode})`).join(', ')}\x1b[0m`);
        }
      }
    }

    // --- Subtitle track selection ---
    if (subtitleTracks.length > 0) {
      console.log(`\n\x1b[36m=== LUỒNG PHỤ ĐỀ (${subtitleTracks.length} luồng) ===\x1b[0m`);
      subtitleTracks.forEach((t, i) => {
        const defaultTag = t.default ? ' [DEFAULT]' : '';
        console.log(`  ${i + 1}. ${t.name} (${t.langCode})${defaultTag}`);
      });

      const subAnswer = await askQuestion(
        '\x1b[33mChọn luồng phụ đề (nhập số, cách nhau bởi dấu phẩy, hoặc "all" để tải tất cả) [Mặc định: all]: \x1b[0m'
      );

      if (subAnswer && subAnswer.toLowerCase() !== 'all') {
        const indices = subAnswer.split(',').map(s => parseInt(s.trim(), 10) - 1).filter(i => i >= 0 && i < subtitleTracks.length);
        if (indices.length > 0) {
          preferences.subtitleLangCodes = indices.map(i => subtitleTracks[i].langCode);
          console.log(`\x1b[32mĐã chọn: ${indices.map(i => `${subtitleTracks[i].name} (${subtitleTracks[i].langCode})`).join(', ')}\x1b[0m`);
        }
      }
    }

    return Object.keys(preferences).length > 0 ? preferences : null;
  }

  async function runCli() {
    console.log(`\x1b[35m=== M3U8 DOWNLOADER SYSTEM (CLI MODE) ===\x1b[0m\n`);

    const config = await loadConfig();
    const queueManager = new QueueManager();
    await queueManager.init();

    const url = await askQuestion('\x1b[33mNhập URL tập phim bất kỳ để bắt đầu: \x1b[0m');
    if (!url) {
      console.error('\x1b[31mURL không hợp lệ. Thoát.\x1b[0m');
      return;
    }

    const browserHelper = new BrowserHelper(config);
    const downloader = new Downloader(config);

    try {
      await browserHelper.initBrowser(false);

      console.log(`\x1b[36mĐang tải trang: ${url}\x1b[0m`);
      await browserHelper.page.goto(url, { waitUntil: 'load', timeout: 60000 });

      console.log(`\n\x1b[35m[HƯỚNG DẪN] Vui lòng đăng nhập hoặc kiểm tra trang web đã hiển thị chính xác.\x1b[0m`);
      await askQuestion('\x1b[33mSau khi đã sẵn sàng, nhấn [ENTER] tại đây để bắt đầu cào danh sách tập...\x1b[0m');

      const episodes = await browserHelper.scrapeEpisodes(url);
      if (episodes.length === 0) {
        console.log(`\x1b[33mKhông tìm thấy danh sách tập phim nào tự động. Bạn vẫn có thể tải tập hiện tại.\x1b[0m`);
      } else {
        console.log(`\n\x1b[32mTìm thấy danh sách ${episodes.length} tập phim:\x1b[0m`);
        episodes.slice(0, 10).forEach((ep, i) => {
          console.log(`  ${i + 1}. ${ep.title} (${ep.url.substring(0, 50)}...)`);
        });
        if (episodes.length > 10) {
          console.log(`  ... và ${episodes.length - 10} tập khác.`);
        }
      }

      console.log(`\n\x1b[33m--- CHỌN CHẾ ĐỘ TẢI ---\x1b[0m`);
      console.log(`1. Chỉ tải duy nhất tập hiện tại (${url})`);
      console.log(`2. Tải toàn bộ danh sách tập đã quét được (${episodes.length} tập)`);
      
      const mode = await askQuestion('\x1b[33mLựa chọn của bạn (1 hoặc 2) [Mặc định: 1]: \x1b[0m');
      
      let targetEpisodes = [];
      if (mode === '2' && episodes.length > 0) {
        targetEpisodes = episodes;
      } else {
        let pageTitle = await browserHelper.page.title();
        pageTitle = pageTitle || "Tap_Hien_Tai";
        targetEpisodes = [{ title: pageTitle, url: url }];
      }

      const added = await queueManager.addEpisodes(targetEpisodes);
      console.log(`\x1b[32mĐã đồng bộ hàng chờ. Thêm mới ${added} tập vào danh sách tải.\x1b[0m`);

      let pendingList = queueManager.getPendingOrFailed();
      if (mode !== '2') {
        pendingList = pendingList.filter(item => item.url === url);
      }

      if (pendingList.length === 0) {
        console.log(`\x1b[32mTất cả các tập trong danh sách chọn tải đã được tải thành công trước đó (Success).\x1b[0m`);
        return;
      }

      // --- Analyze streams from first episode for track selection ---
      console.log(`\n\x1b[36mĐang phân tích luồng phát từ tập đầu tiên để phát hiện âm thanh/phụ đề...\x1b[0m`);
      const firstEp = pendingList[0];
      const analyzeIntercepted = await browserHelper.interceptM3U8(firstEp.url);
      const { streamInfo: analyzeStreamInfo } = await resolveStreamInfo(
        analyzeIntercepted.candidates || [{ url: analyzeIntercepted.url, headers: analyzeIntercepted.headers }]
      );

      const trackPreferences = await promptTrackSelection(analyzeStreamInfo);

      console.log(`\n\x1b[35mĐang tiến hành tải ${pendingList.length} tập phim...\x1b[0m`);

      for (let i = 0; i < pendingList.length; i++) {
        const ep = pendingList[i];
        console.log(`\n\x1b[33m[${i + 1}/${pendingList.length}] Đang xử lý: "${ep.title}"\x1b[0m`);
        
        try {
          const MAX_RETRIES = 2;
          let lastError = null;
          let succeeded = false;

          for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
              if (attempt > 0) {
                console.log(`\x1b[33m[${ep.title}] Thử lại lần ${attempt}/${MAX_RETRIES} — đang lấy lại link M3U8...\x1b[0m`);
                // Small delay before retry to let CDN rotate
                await new Promise(r => setTimeout(r, 3000));
              }

              const intercepted = await browserHelper.interceptM3U8(ep.url);
              console.log(`\x1b[36mĐang tải tệp M3U8 để phân tích luồng phát...\x1b[0m`);
              const { streamInfo, headers } = await resolveStreamInfo(
                intercepted.candidates || [{ url: intercepted.url, headers: intercepted.headers }]
              );

              // Apply user track preferences
              const trackSelection = selectTracks(streamInfo, trackPreferences);

              await downloader.download(ep.title, trackSelection, headers, intercepted.subtitles);
              await queueManager.updateStatus(ep.url, 'success', {
                video_url: trackSelection.videoUrl,
                audio_urls: trackSelection.selectedAudioTracks.filter(t => t.uri).map(t => t.uri)
              });
              succeeded = true;
              break; // Exit retry loop on success

            } catch (retryErr) {
              lastError = retryErr;
              console.error(`\x1b[33m[${ep.title}] Lần thử ${attempt + 1} thất bại: ${retryErr.message}\x1b[0m`);
            }
          }

          if (!succeeded) {
            console.error(`\x1b[31m[LỖI] Thất bại khi tải tập "${ep.title}" sau ${MAX_RETRIES + 1} lần thử: ${lastError.message}\x1b[0m`);
            await queueManager.updateStatus(ep.url, 'failed', { error_reason: lastError.message });
          }
        } catch (err) {
          console.error(`\x1b[31m[LỖI] Thất bại khi tải tập "${ep.title}": ${err.message}\x1b[0m`);
          await queueManager.updateStatus(ep.url, 'failed', { error_reason: err.message });
        }
      }

      console.log(`\n\x1b[32m=== HOÀN THÀNH QUÁ TRÌNH TẢI ===\x1b[0m`);
      const all = queueManager.getAll();
      const successCount = all.filter(x => x.status === 'success').length;
      const failedCount = all.filter(x => x.status === 'failed').length;
      console.log(`Tổng số tập: ${all.length}`);
      console.log(`Tải thành công: \x1b[32m${successCount}\x1b[0m`);
      console.log(`Tải lỗi: \x1b[31m${failedCount}\x1b[0m`);

    } catch (error) {
      console.error(`\x1b[31mFatal error: ${error.message}\x1b[0m`);
    } finally {
      await browserHelper.close();
    }
  }

  runCli().catch(console.error);
} else {
  // Start the Web Server
  console.log('\x1b[35m=== KHỞI CHẠY WEB UI DOWNLOADER ===\x1b[0m');
  import('./server.js');
}
