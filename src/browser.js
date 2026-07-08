import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs/promises';

export class BrowserHelper {
  constructor(config) {
    this.config = config;
    this.context = null;
    this.browser = null;
  }

  async initBrowser(headless = false) {
    const userDataDir = path.resolve(this.config.user_data_dir);
    // Ensure user data dir exists
    await fs.mkdir(userDataDir, { recursive: true });

    console.log(`\x1b[36mInitializing Playwright with persistent context: ${userDataDir}\x1b[0m`);

    this.context = await chromium.launchPersistentContext(userDataDir, {
      headless: headless,
      viewport: null, // Open full window size
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-web-security',
        '--mute-audio' // Mute audio to avoid noise during background/batch downloads
      ]
    });

    // Add stealth cookies/properties
    const pages = this.context.pages();
    this.page = pages.length > 0 ? pages[0] : await this.context.newPage();

    // Bypass webdriver detection
    await this.page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });
  }

  async close() {
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
  }

  /**
   * Scrapes episode links from the movie page
   * @param {string} pageUrl 
   */
  async scrapeEpisodes(pageUrl) {
    if (!this.page) throw new Error('Browser not initialized');

    console.log(`\x1b[36mNavigating to page for scraping: ${pageUrl}\x1b[0m`);
    await this.page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // 1. Scroll down to trigger lazy loading
    console.log(`\x1b[36mScrolling page to load lazy-loaded content (waiting 2.5s per scroll)...\x1b[0m`);
    let lastCount = 0;
    let stableScrolls = 0;
    const maxScrolls = 25; // Increased max scrolls

    for (let i = 0; i < maxScrolls; i++) {
      await this.page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
        // Also scroll any potential scrollable containers
        const scrollables = Array.from(document.querySelectorAll('div, section, ul, ol'));
        scrollables.forEach(el => {
          if (el.scrollHeight > el.clientHeight) {
            el.scrollTop = el.scrollHeight;
          }
        });
      });

      // Wait for content rendering (increased to 2.5s to let slow network calls resolve)
      await this.page.waitForTimeout(2500);

      // Scroll shake (scroll up by 50px and down again) to trigger scroll observers/listeners
      await this.page.evaluate(() => {
        window.scrollBy(0, -50);
        const scrollables = Array.from(document.querySelectorAll('div, section, ul, ol'));
        scrollables.forEach(el => {
          if (el.scrollHeight > el.clientHeight) {
            el.scrollTop -= 20;
          }
        });
      });
      await this.page.waitForTimeout(200);
      await this.page.evaluate(() => {
        window.scrollBy(0, 50);
        const scrollables = Array.from(document.querySelectorAll('div, section, ul, ol'));
        scrollables.forEach(el => {
          if (el.scrollHeight > el.clientHeight) {
            el.scrollTop = el.scrollHeight;
          }
        });
      });

      // Count current episodes in DOM to check stability
      const currentCount = await this.page.evaluate(() => {
        return document.querySelectorAll('a[href*="/movie/"], a.episode-link, .episode-list a, .playlist a').length;
      });

      console.log(`  Scroll #${i + 1}: Found ${currentCount} potential episode links...`);
      if (currentCount === lastCount && currentCount > 0) {
        stableScrolls++;
        if (stableScrolls >= 4) { // Stabilize for 4 scrolls before stopping
          console.log(`  Episode count stabilized at ${currentCount}. Stop scrolling.`);
          break;
        }
      } else {
        stableScrolls = 0;
        lastCount = currentCount;
      }
    }

    // 2. Extract movie ID (m) for filtering
    const currentM = await this.page.evaluate(() => {
      try {
        const nextData = window.__NEXT_DATA__;
        const filmDetail = nextData?.props?.pageProps?.filmDetail;
        const filmId = filmDetail?.detail?.id || filmDetail?.film?.id || (filmDetail?.parts?.content && filmDetail.parts.content[0]?.parentId);
        if (filmId) return String(filmId);
      } catch (e) { }

      try {
        const params = new URLSearchParams(window.location.search);
        const m = params.get('m');
        if (m) return m;
      } catch (e) { }
      return null;
    });

    console.log(`\x1b[36mTarget movie ID for filtering: ${currentM || 'None'}\x1b[0m`);

    // 3. Try Next.js hydration data extraction
    console.log(`\x1b[36mChecking for Next.js hydration data...\x1b[0m`);
    const nextJsEpisodes = await this.page.evaluate(() => {
      try {
        const nextData = window.__NEXT_DATA__;
        const filmDetail = nextData?.props?.pageProps?.filmDetail;
        const parts = filmDetail?.parts;
        const film = filmDetail?.film;
        const detail = filmDetail?.detail;

        const filmSlug = film?.slug || detail?.slug;
        const filmId = detail?.id || film?.id || (parts && parts.content && parts.content[0]?.parentId);

        if (parts && Array.isArray(parts.content) && parts.content.length > 0) {
          return parts.content.map((item, index) => {
            const slug = item.slug || `${filmSlug}-tap-${item.position || index + 1}-${item.id}`;
            const url = `https://tv360.vn/movie/${slug}?m=${filmId}&e=${item.id}`;
            let duration = null;
            if (item.duration) {
              const secs = parseInt(item.duration, 10);
              if (!isNaN(secs)) {
                const hrs = Math.floor(secs / 3600);
                const mins = Math.floor((secs % 3600) / 60);
                const remainingSecs = secs % 60;
                duration = hrs > 0 
                  ? `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(remainingSecs).padStart(2, '0')}`
                  : `${String(mins).padStart(2, '0')}:${String(remainingSecs).padStart(2, '0')}`;
              }
            }
            return {
              title: item.name || `Tập ${item.position || index + 1}`,
              url: url,
              duration: duration
            };
          });
        }
      } catch (e) {
        // Ignore
      }
      return null;
    });

    if (nextJsEpisodes && nextJsEpisodes.length > 0) {
      console.log(`\x1b[32mFound ${nextJsEpisodes.length} episodes in Next.js state.\x1b[0m`);
    }

    // 4. Scrape using DOM selectors with movie ID filtering
    const urlObj = new URL(pageUrl.startsWith('file://') ? 'http://localhost' : pageUrl);
    const domain = urlObj.hostname;
    const siteConfig = this.config.sites[domain] || this.config.sites['default'];
    const selector = siteConfig.episode_selector;
    const isTv360 = domain.includes('tv360.vn') || pageUrl.includes('demo.html');

    console.log(`\x1b[36mScraping DOM using selector: "${selector}"...\x1b[0m`);
    const domEpisodes = await this.page.evaluate(({ sel, currentUrl, currentM, isTv360 }) => {
      const elements = Array.from(document.querySelectorAll(sel));
      const results = [];
      const seenUrls = new Set();

      const cleanText = (txt) => txt ? txt.trim().replace(/\s+/g, ' ') : '';

      const isEpisodeLink = (el, text, href) => {
        if (!href || href.startsWith('javascript:') || href.startsWith('#')) return false;

        if (isTv360) {
          // 1. Must belong to the current movie (has correct movie ID query param 'm=')
          const hasCorrectM = currentM ? (href.includes(`m=${currentM}`) || href.includes(`m%3D${currentM}`)) : true;
          if (!hasCorrectM) return false;

          // 2. Must contain episode ID param 'e='
          const hasEpParam = href.includes('e=') || href.includes('e%3D');
          if (!hasEpParam) return false;

          // 3. Relaxed text or attribute checks to ensure it is an episode link
          const lowerText = text.toLowerCase().trim();
          const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
          const isEp = /(?:tập\s+)?\d+/i.test(lowerText) || /(?:tập\s+)?\d+/i.test(ariaLabel);
          return isEp;
        }

        if (el.matches(sel)) return true;
        return /\btập\b|\bep\b|\bch\b|\bepisode\b|\bpart\b|\bchapter\b|\d+/i.test(text.toLowerCase());
      };

      const processElement = (el) => {
        const href = el.getAttribute('href');
        if (!href) return;
        const fullUrl = new URL(href, currentUrl).href;
        let text = cleanText(el.innerText || el.textContent);
        if (isEpisodeLink(el, text, href)) {
          if (!seenUrls.has(fullUrl)) {
            seenUrls.add(fullUrl);
            
            let duration = null;
            if (isTv360) {
              // Try to find the exact "Tập X" title from an inner element (like h3 on TV360)
              const h3 = el.querySelector('h3, h4, .episode-title, [class*="title"]');
              if (h3) {
                text = cleanText(h3.innerText || h3.textContent);
              } else {
                // Try to extract "Tập X" using regex from text or aria-label
                const match = text.match(/tập\s+\d+/i) || (el.getAttribute('aria-label') || '').match(/tập\s+\d+/i);
                if (match) {
                  text = match[0];
                }
              }

              // Extract duration (like 46:14) from inner divs/spans
              const durationEl = el.querySelector('div[title*=":"], div[class*="duration"], span[class*="duration"]');
              if (durationEl) {
                duration = cleanText(durationEl.innerText || durationEl.textContent);
              } else {
                const allDivs = Array.from(el.querySelectorAll('div, span'));
                for (const d of allDivs) {
                  const t = cleanText(d.innerText || d.textContent);
                  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(t)) {
                    duration = t;
                    break;
                  }
                }
              }
            }

            // Format standard episode title "Tập N" if it's just raw number
            const formattedTitle = /^\d+$/.test(text) ? `Tập ${text}` : text;
            results.push({ title: formattedTitle, url: fullUrl, duration: duration });
          }
        }
      };

      elements.forEach(processElement);

      if (results.length === 0) {
        const allLinks = Array.from(document.querySelectorAll('a'));
        allLinks.forEach(processElement);
      }
      return results;
    }, { sel: selector, currentUrl: pageUrl, currentM, isTv360 });

    console.log(`\x1b[32mFound ${domEpisodes.length} matching episodes in DOM.\x1b[0m`);

    // 5. Merge results with advanced deduplication on episode ID parameter 'e'
    const finalEpisodes = [];
    const seenKeys = new Set();

    const getUniqueKey = (url) => {
      try {
        const u = new URL(url);
        const e = u.searchParams.get('e');
        if (e) return `e_${e}`;
      } catch (err) { }
      return url;
    };

    const addEpisode = (ep) => {
      const key = getUniqueKey(ep.url);
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        finalEpisodes.push(ep);
      }
    };

    // First add from Next.js state (preferred cleaner titles)
    if (nextJsEpisodes) {
      nextJsEpisodes.forEach(addEpisode);
    }
    // Then append from DOM
    if (domEpisodes) {
      domEpisodes.forEach(addEpisode);
    }

    console.log(`\x1b[32mSuccessfully scraped and merged ${finalEpisodes.length} unique episodes.\x1b[0m`);
    return finalEpisodes;
  }

  /**
   * Intercepts m3u8 requests on the episode page
   * @param {string} episodeUrl 
   * @param {number} timeoutMs Max wait time in ms
   */
  async interceptM3U8(episodeUrl, timeoutMs = 45000) {
    if (!this.page) throw new Error('Browser not initialized');

    console.log(`\x1b[36mNavigating to episode: ${episodeUrl}\x1b[0m`);

    // We start listening for requests BEFORE navigation to not miss early m3u8 requests
    const capturedRequests = [];
    const subtitleUrls = [];
    let m3u8Captured = null;
    let resolveIntercept;
    let rejectIntercept;

    const interceptPromise = new Promise((resolve, reject) => {
      resolveIntercept = resolve;
      rejectIntercept = reject;
    });

    const onRequest = (request) => {
      const url = request.url();
      // Look for m3u8 URLs, filter out ads
      if (url.includes('.m3u8') && !url.includes('/ads/') && !url.includes('google-ads')) {
        const headers = request.headers();
        const cap = { url, headers };
        capturedRequests.push(cap);
        console.log(`\x1b[32m[Intercepted M3U8] -> ${url.substring(0, 80)}...\x1b[0m`);

        if (!m3u8Captured) {
          m3u8Captured = cap;
          // Wait 3 seconds to capture the master playlist + any late subtitles
          // (the player often requests a low-quality variant before the master),
          // then resolve with ALL captured m3u8 candidates.
          setTimeout(() => {
            resolveIntercept({
              url: m3u8Captured.url,
              headers: m3u8Captured.headers,
              candidates: capturedRequests.slice(),
              subtitles: subtitleUrls
            });
          }, 3000);
        }
      } else if ((url.includes('.vtt') || url.includes('.srt') || url.includes('subtitle') || url.includes('/sub/')) && !url.includes('/ads/') && !url.includes('google-ads')) {
        if (!subtitleUrls.includes(url)) {
          subtitleUrls.push(url);
          console.log(`\x1b[32m[Intercepted Subtitle] -> ${url.substring(0, 80)}...\x1b[0m`);
        }
      }
    };

    this.page.on('request', onRequest);

    try {
      await this.page.goto(episodeUrl, { waitUntil: 'load', timeout: 60000 });

      // Click play if needed
      const urlObj = new URL(episodeUrl);
      const domain = urlObj.hostname;
      const siteConfig = this.config.sites[domain] || this.config.sites['default'];
      const playBtnSel = siteConfig.play_button_selector;

      // Setup a timer to check and click play button if no m3u8 is intercepted yet
      const playTimer = setTimeout(async () => {
        try {
          const isPlayBtnVisible = await this.page.isVisible(playBtnSel);
          if (isPlayBtnVisible) {
            console.log(`\x1b[33mNo M3U8 captured yet. Clicking Play button using selector "${playBtnSel}"...\x1b[0m`);
            await this.page.click(playBtnSel);
          }
        } catch (err) {
          // Play button might not be present or visible, ignore
        }
      }, 5000);

      // Setup overall timeout
      const timeoutTimer = setTimeout(() => {
        if (m3u8Captured) {
          // If we captured an m3u8 but the 3s timeout wasn't hit before the overall timeout, resolve immediately
          resolveIntercept({
            url: m3u8Captured.url,
            headers: m3u8Captured.headers,
            candidates: capturedRequests.slice(),
            subtitles: subtitleUrls
          });
        } else {
          rejectIntercept(new Error('Timeout waiting for M3U8 stream request'));
        }
      }, timeoutMs);

      // Wait for interception
      const result = await interceptPromise;

      clearTimeout(playTimer);
      clearTimeout(timeoutTimer);

      return result;
    } catch (error) {
      if (capturedRequests.length > 0) {
        console.log(`\x1b[33mNavigation error or timeout, but captured ${capturedRequests.length} m3u8 request(s). Using them.\x1b[0m`);
        return {
          url: capturedRequests[0].url,
          headers: capturedRequests[0].headers,
          candidates: capturedRequests.slice(),
          subtitles: subtitleUrls
        };
      }
      throw error;
    } finally {
      // Cleanup listener
      this.page.off('request', onRequest);
    }
  }
}
