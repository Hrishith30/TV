// Home server: serves this app + same-origin /api/proxy with HOME-IP egress.
// Run on your laptop:  node local_proxy_server.js
// Then on TV/phone/laptop (same WiFi):  http://YOUR-LAPTOP-IP:8000
// Why: your provider allows video from your home IP but 401s cloud (Vercel) IPs.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.PORT, 10) || 8000;
const ROOT = __dirname;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
};

function proxiedAbs(base, ref) {
  try { return '/api/proxy?target=' + encodeURIComponent(new URL(ref, base).href); }
  catch { return ref; }
}

async function handleProxy(req, res, target) {
  if (!target || !/^https?:\/\//i.test(target)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing ?target=http(s)://...' }));
    return;
  }
  try {
    const headers = { 'User-Agent': 'VLC/3.0.20 LibVLC/3.0.20', Accept: '*/*' };
    if (req.headers.range) headers.Range = req.headers.range;
    const upstream = await fetch(target, { headers, redirect: 'follow' });
    const ct = upstream.headers.get('content-type') || '';
    res.setHeader('Access-Control-Allow-Origin', '*');
    const isHls = /mpegurl|m3u8/i.test(ct) || /\.m3u8(\?|$)/i.test(target);
    if (isHls) {
      let text = await upstream.text();
      text = text.split('\n').map((line) => {
        const t = line.trim();
        if (!t) return line;
        if (t.startsWith('#') && t.includes('URI="')) {
          return line.replace(/URI="([^"]+)"/g, (m, u) => 'URI="' + proxiedAbs(target, u) + '"');
        }
        if (t.startsWith('#')) return line;
        return proxiedAbs(target, t);
      }).join('\n');
      res.writeHead(upstream.ok ? 200 : upstream.status, {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'no-cache',
      });
      res.end(text);
      return;
    }
    if (!upstream.ok && upstream.status !== 206) {
      const t = (await upstream.text().catch(() => '')).slice(0, 300);
      res.writeHead(upstream.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Upstream HTTP ' + upstream.status, body: t }));
      return;
    }
    const pass = ['content-type', 'content-length', 'content-range', 'accept-ranges'];
    const out = { 'Cache-Control': 'no-cache' };
    for (const h of pass) {
      const v = upstream.headers.get(h);
      if (v) out[h === 'content-type' ? 'Content-Type' : h] = v;
    }
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.writeHead(upstream.status, out);
    res.end(buf);
  } catch (e) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Proxy fetch failed: ' + (e.message || e) }));
  }
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/api/proxy') {
    handleProxy(req, res, u.searchParams.get('target'));
    return;
  }
  let file = u.pathname === '/' ? '/index.html' : decodeURIComponent(u.pathname);
  file = path.normalize(path.join(ROOT, file));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('Open on this laptop:  http://localhost:' + PORT);
  console.log('Open on TV/phone (same WiFi):  http://YOUR-LAPTOP-IP:' + PORT);
});
