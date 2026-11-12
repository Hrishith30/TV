// Vercel serverless proxy for Xtream Codes API. Same-origin, so no CORS/mixed-content issues.
export default async function handler(req, res) {
  const target = req.query.target;
  if (!target || typeof target !== 'string' || !/^https?:\/\//i.test(target)) {
    res.status(400).json({ error: 'Missing ?target=http(s)://...' });
    return;
  }
  try {
    const upstream = await fetch(target, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const body = await upstream.text();
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    res.status(upstream.status).send(body);
  } catch (e) {
    res.status(502).json({ error: 'Proxy fetch failed: ' + (e.message || e) });
  }
}
