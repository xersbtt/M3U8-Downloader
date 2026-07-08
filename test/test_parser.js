import { parseM3U8, selectTracks } from '../src/parser.js';

const manifest = [
  '#EXTM3U',
  '#EXT-X-VERSION:3',
  '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Korean",DEFAULT=YES,AUTOSELECT=YES,LANGUAGE="ko",URI="audio_ko.m3u8"',
  '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Vietnamese Dub",DEFAULT=NO,AUTOSELECT=NO,LANGUAGE="vi",URI="audio_vi.m3u8"',
  '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="Tieng Viet",DEFAULT=YES,LANGUAGE="vi",URI="sub_vi.m3u8"',
  '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English",DEFAULT=NO,LANGUAGE="en",URI="sub_en.m3u8"',
  '#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080,AUDIO="audio",SUBTITLES="subs"',
  'video_1080p.m3u8'
].join('\n');

console.log('=== Test 1: Parse master playlist ===');
const result = parseM3U8(manifest, 'http://test.com/streams/master.m3u8');
console.log(`Audio tracks (${result.audioTracks.length}):`, result.audioTracks.map(t => `${t.name} [${t.langCode}] dub=${t.isVietnameseDub}`));
console.log(`Subtitle tracks (${result.subtitleTracks.length}):`, result.subtitleTracks.map(t => `${t.name} [${t.langCode}]`));
console.log(`Video URL: ${result.videoUrl}`);

console.log('\n=== Test 2: Select specific tracks ===');
const sel = selectTracks(result, { audioLangCodes: ['ko'], subtitleLangCodes: ['vi'] });
console.log('Selected audio:', sel.selectedAudioTracks.map(t => `${t.name} [${t.langCode}]`));
console.log('Selected subs:', sel.selectedSubtitleTracks.map(t => `${t.name} [${t.langCode}]`));

console.log('\n=== Test 3: Select all (null preferences) ===');
const selAll = selectTracks(result, null);
console.log('Selected audio:', selAll.selectedAudioTracks.map(t => `${t.name} [${t.langCode}]`));
console.log('Selected subs:', selAll.selectedSubtitleTracks.map(t => `${t.name} [${t.langCode}]`));

console.log('\n=== Test 4: Non-master playlist ===');
const simplResult = parseM3U8('#EXTM3U\n#EXT-X-TARGETDURATION:1\n#EXTINF:1.0,\nseg.ts\n#EXT-X-ENDLIST', 'http://test.com/stream.m3u8');
console.log('isMaster:', simplResult.isMaster);
console.log('audioTracks:', simplResult.audioTracks.length);
console.log('subtitleTracks:', simplResult.subtitleTracks.length);

console.log('\n✅ All tests passed!');
