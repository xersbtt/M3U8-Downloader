import { Parser } from 'm3u8-parser';

/**
 * Normalizes headers for fetch request.
 * Filters out pseudo-headers starting with ':' and keeps essential headers.
 */
function cleanHeaders(headers) {
  const cleaned = {};
  const allowed = ['cookie', 'user-agent', 'referer', 'authorization', 'origin', 'accept', 'accept-language'];
  for (const [key, val] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();
    if (allowed.includes(lowerKey)) {
      cleaned[lowerKey] = val;
    }
  }
  return cleaned;
}

/**
 * Fetches the text content of a URL with custom headers
 */
export async function fetchM3U8Content(url, headers = {}) {
  const clean = cleanHeaders(headers);
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      ...clean
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch M3U8 content. HTTP Status: ${response.status}`);
  }

  return await response.text();
}

/**
 * Detects a normalized language code from raw language/name metadata.
 * Returns a short code like 'vi', 'en', 'ko', 'ja', 'zh', or the raw value.
 */
function detectLanguageCode(language, name) {
  const lang = (language || '').toLowerCase();
  const trackName = (name || '').toLowerCase();

  // Vietnamese detection
  if (
    lang.startsWith('vi') || lang.includes('vnm') ||
    trackName.includes('vietnamese') || trackName.includes('tiếng việt') ||
    trackName.includes('thuyết minh') || trackName.includes('lồng tiếng') ||
    (trackName.includes('dub') && trackName.includes('vi'))
  ) return 'vi';

  if (lang.startsWith('ko') || lang.includes('kor') || trackName.includes('korean') || trackName.includes('한국어')) return 'ko';
  if (lang.startsWith('en') || lang.includes('eng') || trackName.includes('english')) return 'en';
  if (lang.startsWith('ja') || lang.includes('jpn') || lang.startsWith('jp') || trackName.includes('japanese') || trackName.includes('日本語')) return 'ja';
  if (lang.startsWith('zh') || lang.includes('chi') || lang.includes('zho') || trackName.includes('chinese') || trackName.includes('中文')) return 'zh';
  if (lang.startsWith('th') || lang.includes('tha') || trackName.includes('thai')) return 'th';
  if (lang.startsWith('id') || lang.includes('ind') || trackName.includes('indonesian')) return 'id';

  // Return raw language code if available
  if (lang && lang.length >= 2) return lang.substring(0, 2);

  return 'unknown';
}

/**
 * Checks if a track is a Vietnamese dub/voiceover (not original audio).
 */
function isVietnameseDub(track) {
  const lang = (track.language || '').toLowerCase();
  const name = (track.name || '').toLowerCase();
  return (
    lang.startsWith('vi') ||
    lang.includes('vnm') ||
    name.includes('vietnamese') ||
    name.includes('tiếng việt') ||
    name.includes('thuyết minh') ||
    name.includes('lồng tiếng') ||
    (name.includes('dub') && name.includes('vi'))
  );
}

/**
 * Parses a master/media playlist to extract all available streams.
 * Returns all audio tracks and subtitle tracks for user selection.
 * @param {string} manifestText 
 * @param {string} baseUrl 
 */
export function parseM3U8(manifestText, baseUrl) {
  const parser = new Parser();
  parser.push(manifestText);
  parser.end();

  const manifest = parser.manifest;
  
  // If it's not a master playlist (does not contain other playlists)
  if (!manifest.playlists || manifest.playlists.length === 0) {
    return {
      isMaster: false,
      videoUrl: baseUrl,
      audioTracks: [],
      subtitleTracks: []
    };
  }

  console.log(`\x1b[36mFound ${manifest.playlists.length} streams in Master Playlist.\x1b[0m`);

  // 1. Select video stream with highest resolution or bandwidth
  let bestPlaylist = null;
  let maxResolution = 0;
  let maxBandwidth = 0;

  for (const playlist of manifest.playlists) {
    const resolution = playlist.attributes.RESOLUTION;
    const bandwidth = playlist.attributes.BANDWIDTH || 0;
    
    let resScore = 0;
    if (resolution && resolution.width && resolution.height) {
      resScore = resolution.width * resolution.height;
    }

    if (resScore > maxResolution) {
      maxResolution = resScore;
      bestPlaylist = playlist;
      maxBandwidth = bandwidth;
    } else if (resScore === maxResolution && bandwidth > maxBandwidth) {
      bestPlaylist = playlist;
      maxBandwidth = bandwidth;
    }
  }

  // Fallback if no resolutions specified
  if (!bestPlaylist && manifest.playlists.length > 0) {
    bestPlaylist = manifest.playlists[0];
  }

  const videoUrl = bestPlaylist ? new URL(bestPlaylist.uri, baseUrl).href : baseUrl;
  if (bestPlaylist && bestPlaylist.attributes.RESOLUTION) {
    const r = bestPlaylist.attributes.RESOLUTION;
    console.log(`\x1b[32mSelected highest video stream quality: ${r.width}x${r.height} (Bandwidth: ${bestPlaylist.attributes.BANDWIDTH})\x1b[0m`);
  } else {
    console.log(`\x1b[32mSelected first stream from Master Playlist.\x1b[0m`);
  }

  // 2. Extract ALL audio tracks with metadata
  const audioTracks = [];
  if (manifest.mediaGroups && manifest.mediaGroups.AUDIO) {
    const audioGroups = manifest.mediaGroups.AUDIO;

    for (const groupName of Object.keys(audioGroups)) {
      const tracks = audioGroups[groupName];
      for (const trackName of Object.keys(tracks)) {
        const track = tracks[trackName];
        const langCode = detectLanguageCode(track.language, track.name);
        audioTracks.push({
          name: track.name || trackName,
          language: track.language || '',
          langCode,
          uri: track.uri ? new URL(track.uri, baseUrl).href : null,
          default: track.default || false,
          autoselect: track.autoselect || false,
          isVietnameseDub: isVietnameseDub(track),
          group: groupName
        });
      }
    }

    if (audioTracks.length > 0) {
      console.log(`\x1b[36mFound ${audioTracks.length} audio track(s): ${audioTracks.map(t => `${t.name} (${t.langCode})`).join(', ')}\x1b[0m`);
    }
  }

  // 3. Extract ALL subtitle tracks with metadata
  const subtitleTracks = [];
  if (manifest.mediaGroups && manifest.mediaGroups.SUBTITLES) {
    const subGroups = manifest.mediaGroups.SUBTITLES;
    for (const groupName of Object.keys(subGroups)) {
      const tracks = subGroups[groupName];
      for (const trackName of Object.keys(tracks)) {
        const track = tracks[trackName];
        if (track.uri) {
          const langCode = detectLanguageCode(track.language, track.name);
          subtitleTracks.push({
            url: new URL(track.uri, baseUrl).href,
            language: track.language || '',
            langCode,
            name: track.name || trackName,
            default: track.default || false
          });
        }
      }
    }

    if (subtitleTracks.length > 0) {
      console.log(`\x1b[36mFound ${subtitleTracks.length} subtitle track(s): ${subtitleTracks.map(t => `${t.name} (${t.langCode})`).join(', ')}\x1b[0m`);
    }
  }

  return {
    isMaster: true,
    videoUrl,
    audioTracks,
    subtitleTracks
  };
}

/**
 * Extract a resolution height (e.g. 1080) from a variant playlist URL, or 0.
 */
function resolutionFromUrl(url) {
  const m = url.match(/[\/_-](\d{3,4})p[\/_.-]/i);
  return m ? parseInt(m[1], 10) : 0;
}

/**
 * Choose the best stream from all intercepted m3u8 candidates.
 *
 * The video player (adaptive bitrate) sometimes requests a low-quality variant
 * *media* playlist before/instead of the *master*. Using the first captured URL
 * directly can therefore lock us to 480p. This fetches the candidates — masters
 * first — and prefers a MASTER playlist so parseM3U8() can pick the highest
 * quality. If no master is available, it falls back to the highest-resolution
 * media playlist found.
 *
 * @param {Array<{url:string, headers:object}>} candidates
 * @returns {Promise<{ streamInfo: object, headers: object, baseUrl: string }>}
 */
export async function resolveStreamInfo(candidates) {
  if (!candidates || candidates.length === 0) {
    throw new Error('No M3U8 candidates were intercepted');
  }

  // Try likely-master URLs first (fewer path markers) to avoid extra fetches.
  const looksLikeVariant = (u) =>
    resolutionFromUrl(u) > 0 || /\/audio\//i.test(u) || /\/subtitle/i.test(u);
  const ordered = [...candidates].sort(
    (a, b) => Number(looksLikeVariant(a.url)) - Number(looksLikeVariant(b.url))
  );

  const mediaResults = [];

  for (const cand of ordered) {
    let streamInfo;
    try {
      const text = await fetchM3U8Content(cand.url, cand.headers);
      streamInfo = parseM3U8(text, cand.url);
    } catch (err) {
      console.log(`\x1b[33mSkipping unreadable M3U8 candidate: ${err.message}\x1b[0m`);
      continue;
    }

    if (streamInfo.isMaster) {
      // Master playlist → parseM3U8 already selected the highest-quality variant
      return { streamInfo, headers: cand.headers, baseUrl: cand.url };
    }
    mediaResults.push({ streamInfo, cand, res: resolutionFromUrl(cand.url) });
  }

  if (mediaResults.length === 0) {
    throw new Error('Could not fetch any intercepted M3U8 candidate');
  }

  // No master available — take the highest-resolution media playlist we saw.
  mediaResults.sort((a, b) => b.res - a.res);
  const best = mediaResults[0];
  if (best.res > 0) {
    console.log(`\x1b[33mNo master playlist intercepted; using highest media playlist found (~${best.res}p).\x1b[0m`);
  } else {
    console.log(`\x1b[33mNo master playlist intercepted; using first media playlist.\x1b[0m`);
  }
  return { streamInfo: best.streamInfo, headers: best.cand.headers, baseUrl: best.cand.url };
}

/**
 * Filters tracks based on user preferences.
 * @param {object} streamInfo - Output from parseM3U8()
 * @param {object|null} preferences - { audioLangCodes: ['ko','vi'], subtitleLangCodes: ['vi','en'] } or null for all
 * @returns {object} - { videoUrl, selectedAudioTracks: [...], selectedSubtitleTracks: [...] }
 */
export function selectTracks(streamInfo, preferences = null) {
  let selectedAudioTracks = streamInfo.audioTracks || [];
  let selectedSubtitleTracks = streamInfo.subtitleTracks || [];

  if (preferences) {
    // Filter audio tracks by selected language codes
    if (preferences.audioLangCodes && preferences.audioLangCodes.length > 0) {
      const selectedAudio = selectedAudioTracks.filter(t => preferences.audioLangCodes.includes(t.langCode));
      // Only filter if we get results; otherwise keep all (safety fallback)
      if (selectedAudio.length > 0) {
        selectedAudioTracks = selectedAudio;
      } else {
        console.log(`\x1b[33mWarning: No audio tracks matched preferences [${preferences.audioLangCodes.join(', ')}]. Keeping all tracks.\x1b[0m`);
      }
    }

    // Filter subtitle tracks by selected language codes
    if (preferences.subtitleLangCodes && preferences.subtitleLangCodes.length > 0) {
      const selectedSubs = selectedSubtitleTracks.filter(t => preferences.subtitleLangCodes.includes(t.langCode));
      if (selectedSubs.length > 0) {
        selectedSubtitleTracks = selectedSubs;
      } else {
        console.log(`\x1b[33mWarning: No subtitle tracks matched preferences [${preferences.subtitleLangCodes.join(', ')}]. Keeping all tracks.\x1b[0m`);
      }
    }
  }

  // Log final selection
  if (selectedAudioTracks.length > 0) {
    console.log(`\x1b[32mSelected ${selectedAudioTracks.length} audio track(s): ${selectedAudioTracks.map(t => `${t.name} (${t.langCode})`).join(', ')}\x1b[0m`);
  }
  if (selectedSubtitleTracks.length > 0) {
    console.log(`\x1b[32mSelected ${selectedSubtitleTracks.length} subtitle track(s): ${selectedSubtitleTracks.map(t => `${t.name} (${t.langCode})`).join(', ')}\x1b[0m`);
  }

  return {
    videoUrl: streamInfo.videoUrl,
    selectedAudioTracks,
    selectedSubtitleTracks
  };
}
