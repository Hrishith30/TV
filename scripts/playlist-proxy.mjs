#!/usr/bin/env node
/**
 * Tiny playlist relay.
 *
 * Browsers cannot read a playlist from a host that sends no CORS headers, and
 * some hosts only serve the real list to certain countries. This process does
 * the download instead and hands the text to the page with CORS allowed, so the
 * player works without a backend of its own.
 *
 * Start it anywhere that has the network position you want:
 *   node scripts/playlist-proxy.mjs
 *
 * Then point the player's "Playlist proxy" setting at this machine, e.g.
 *   http://192.168.1.142:8787     (same Wi-Fi)
 *   http://100.78.9.26:8787       (over Tailscale)
 *
 * Environment: PORT (default 8787), HOST (default 0.0.0.0).
 */
import http from 'node:http';
import os from 'node:os';

const PORT = Number(process.env.PORT) || 8787;
const HOST = process.env.HOST || '0.0.0.0';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Private-Network': 'true',
  'Cache-Control': 'no-store',
};

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { ...CORS, 'Content-Type': type });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    res.end();
    return;
  }

  if (requestUrl.pathname === '/health') {
    send(res, 200, 'ok');
    return;
  }

  if (req.method !== 'GET') {
    send(res, 405, 'This relay only handles GET.');
    return;
  }

  const target = requestUrl.searchParams.get('url');
  if (!target) {
    send(res, 400, 'Add the playlist link as ?url=<encoded link>.');
    return;
  }

  let upstreamUrl;
  try {
    upstreamUrl = new URL(target);
  } catch {
    send(res, 400, 'That is not a valid link.');
    return;
  }
  if (!/^https?:$/.test(upstreamUrl.protocol)) {
    send(res, 400, 'Only http and https links can be relayed.');
    return;
  }

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: { 'User-Agent': USER_AGENT, Accept: '*/*' },
      redirect: 'follow',
    });
    const body = await upstream.text();
    console.log(`${upstream.status} ${body.length}b ${upstreamUrl.host}${upstreamUrl.pathname.slice(0, 40)}`);
    const type = upstream.headers.get('content-type') || 'application/vnd.apple.mpegurl';
    send(res, upstream.ok ? 200 : upstream.status, body, `${type}; charset=utf-8`);
  } catch (error) {
    console.error('upstream failed:', error.message);
    send(res, 502, `The relay could not reach that link: ${error.message}`);
  }
});

server.listen(PORT, HOST, () => {
  const port = server.address().port;
  const addresses = Object.values(os.networkInterfaces())
    .flat()
    .filter((entry) => entry && entry.family === 'IPv4' && !entry.internal)
    .map((entry) => `http://${entry.address}:${port}`);
  console.log(`Playlist relay listening on port ${port}`);
  for (const address of addresses) console.log(`  ${address}`);
  console.log('Put one of those addresses into the player: Playlists -> Playlist proxy.');
});
