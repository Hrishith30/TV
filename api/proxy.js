// Vercel serverless proxy: Xtream API (JSON) + HLS (.m3u8 rewrite) + MP4 (Range passthrough).
export default async function handler(req, res) {
  const target = req.query.target;
  if (!target || typeof target !== 'string' || !/^https?:\/\//i.test(target)) {
    res.status(400).json({ error: 'Missing ?target=http(s)://...' });
    return;
  }
  try {
    const headers = { 'User-Agent': 'Mozilla/5.0' };
    if (req.headers.range) headers.Range = req.headers.range;
    const upstream = await fetch(target, { headers });
    const ct = upstream.headers.get('content-type') || '';
    const isHls = /mpegurl|m3u8/i.test(ct) || /\.m3u8(\?|$)/i.test(target);
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (isHls) {
      let text = await upstream.text();
      const base = new URL(target);
      const prox = (abs) => '/api/proxy?target=' + encodeURIComponent(abs);
      text = text.split('\n').map((line) => {
        const t = line.trim();
        if (!t) return line;
        // Rewrite URI="..." inside tags (KEY/MAP)
        if (t.startsWith('#') && t.includes('URI="')) {
          return line.replace(/URI="([^"]+)"/g, (m, u) => {
            try { return 'URI="' + prox(new URL(u, base).href) + '"'; } catch { return m; }
          });
        }
        if (t.startsWith('#')) return line;
        try { return prox(new URL(t, base).href); } catch { return line; }
      }).join('\n');
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Cache-Control', 'no-cache');
      res.status(200).send(text);
      return;
    }
    // Video / API bytes: pass through status + range headers
    ['content-type', 'content-length', 'content-range', 'accept-ranges'].forEach((h) => {
      const v = upstream.headers.get(h);
      if (v) res.setHeader(h, v);
    });
    res.setHeader('Cache-Control', 'no-cache');
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.status(upstream.status).send(buf);
  } catch (e) {
    res.status(502).json({ error: 'Proxy fetch failed: ' + (e.message || e) });
  }
}
