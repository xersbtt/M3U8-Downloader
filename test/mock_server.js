import http from 'http';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const PORT = 8080;
const TEST_DIR = path.resolve('test');

async function ensureDummyTS() {
  await fs.mkdir(TEST_DIR, { recursive: true });
  const tsPath = path.join(TEST_DIR, 'segment.ts');
  
  if (!existsSync(tsPath)) {
    console.log(`\x1b[36mGenerating dummy TS file using FFmpeg...\x1b[0m`);
    try {
      // Generate 1 second of black video and silent audio as a valid TS segment
      execSync(
        `ffmpeg -y -f lavfi -i anullsrc=r=44100:cl=mono -f lavfi -i testsrc=size=320x240:rate=25 -t 1 -c:v libx264 -c:a aac -f mpegts "${tsPath}"`,
        { stdio: 'ignore' }
      );
      console.log(`\x1b[32mGenerated dummy TS segment at: ${tsPath}\x1b[0m`);
    } catch (err) {
      console.error(`\x1b[31mFailed to generate dummy TS file via FFmpeg: ${err.message}. Creating empty file instead.\x1b[0m`);
      await fs.writeFile(tsPath, Buffer.alloc(1024));
    }
  }
}

async function startServer() {
  await ensureDummyTS();

  const server = http.createServer(async (req, res) => {
    const url = req.url;
    console.log(`\x1b[90m[Mock Server] Request: ${url}\x1b[0m`);

    if (url === '/' || url === '/movie.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Mock Movie Website</title>
          <style>
            body { font-family: sans-serif; background: #121212; color: #fff; text-align: center; padding: 50px; }
            h1 { color: #e50914; }
            .playlist { display: flex; justify-content: center; gap: 20px; margin-top: 30px; }
            .episode-link { padding: 15px 30px; background: #333; color: white; text-decoration: none; border-radius: 5px; font-weight: bold; }
            .episode-link:hover { background: #e50914; }
          </style>
        </head>
        <body>
          <h1>Phim Hay Mỗi Ngày</h1>
          <p>Chọn tập để xem:</p>
          <div class="playlist">
            <a class="episode-link" href="/episode1.html">Tập 01</a>
            <a class="episode-link" href="/episode2.html">Tập 02</a>
            <a class="episode-link" href="/episode3.html">Tập 03</a>
          </div>
        </body>
        </html>
      `);
      return;
    }

    if (url.match(/^\/episode\d+\.html$/)) {
      const epNum = url.match(/\d+/)[0];
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Xem Phim Tập ${epNum}</title>
          <style>
            body { font-family: sans-serif; background: #121212; color: #fff; text-align: center; padding: 50px; }
            h1 { color: #e50914; }
            .player-container { width: 480px; height: 270px; background: #000; margin: 30px auto; display: flex; align-items: center; justify-content: center; position: relative; border: 2px solid #333; }
            .play-btn { padding: 15px 30px; background: #e50914; border: none; color: white; font-weight: bold; cursor: pointer; border-radius: 5px; }
            .play-btn:hover { background: #ff1e27; }
            .playlist { margin-top: 30px; }
            .episode-link { color: #aaa; margin: 0 10px; text-decoration: none; }
            .episode-link.active { color: #e50914; font-weight: bold; }
          </style>
        </head>
        <body>
          <h1>Tập ${epNum} - Cuộc Chiến Vô Cực</h1>
          <div class="player-container">
            <button class="play-btn" onclick="startStream()">Click to Play Video</button>
            <div id="status" style="position: absolute; bottom: 10px; color: #aaa; font-size: 12px;"></div>
          </div>
          <div class="playlist">
            <a class="episode-link ${epNum === '1' ? 'active' : ''}" href="/episode1.html">Tập 01</a>
            <a class="episode-link ${epNum === '2' ? 'active' : ''}" href="/episode2.html">Tập 02</a>
            <a class="episode-link ${epNum === '3' ? 'active' : ''}" href="/episode3.html">Tập 03</a>
          </div>
          <script>
            function startStream() {
              document.getElementById('status').innerText = 'Loading stream...';
              // Fetch master m3u8 playlist to simulate a media player launching stream
              fetch('/streams/master.m3u8')
                .then(r => r.text())
                .then(data => {
                  document.getElementById('status').innerText = 'Playing stream...';
                  console.log('Stream loaded!');
                })
                .catch(e => {
                  document.getElementById('status').innerText = 'Error loading stream';
                });
            }
          </script>
        </body>
        </html>
      `);
      return;
    }

    if (url === '/streams/master.m3u8') {
      res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' });
      res.end([
        '#EXTM3U',
        '#EXT-X-VERSION:3',
        '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Chinese",DEFAULT=YES,AUTOSELECT=YES,LANGUAGE="zh",URI="audio_zh.m3u8"',
        '#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360,AUDIO="audio"',
        'video_360p.m3u8',
        '#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720,AUDIO="audio"',
        'video_720p.m3u8',
        '#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080,AUDIO="audio"',
        'video_1080p.m3u8'
      ].join('\n'));
      return;
    }

    if (url === '/streams/video_1080p.m3u8') {
      res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' });
      res.end([
        '#EXTM3U',
        '#EXT-X-VERSION:3',
        '#EXT-X-TARGETDURATION:1',
        '#EXT-X-MEDIA-SEQUENCE:0',
        '#EXTINF:1.0,',
        'segment.ts',
        '#EXTINF:1.0,',
        'segment.ts',
        '#EXT-X-ENDLIST'
      ].join('\n'));
      return;
    }

    if (url === '/streams/video_720p.m3u8' || url === '/streams/video_360p.m3u8') {
      res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' });
      res.end([
        '#EXTM3U',
        '#EXT-X-VERSION:3',
        '#EXT-X-TARGETDURATION:1',
        '#EXT-X-MEDIA-SEQUENCE:0',
        '#EXTINF:1.0,',
        'segment.ts',
        '#EXT-X-ENDLIST'
      ].join('\n'));
      return;
    }

    if (url === '/streams/audio_zh.m3u8') {
      res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' });
      res.end([
        '#EXTM3U',
        '#EXT-X-VERSION:3',
        '#EXT-X-TARGETDURATION:1',
        '#EXT-X-MEDIA-SEQUENCE:0',
        '#EXTINF:1.0,',
        'segment.ts',
        '#EXT-X-ENDLIST'
      ].join('\n'));
      return;
    }

    if (url === '/streams/segment.ts') {
      const tsPath = path.join(TEST_DIR, 'segment.ts');
      const data = await fs.readFile(tsPath);
      res.writeHead(200, { 'Content-Type': 'video/mp2t' });
      res.end(data);
      return;
    }

    res.writeHead(404);
    res.end('Not Found');
  });

  server.listen(PORT, () => {
    console.log(`\x1b[32m[Mock Server] Running at http://localhost:${PORT}\x1b[0m`);
  });

  return server;
}

startServer();
