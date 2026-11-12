import type { PlayItem } from './types';

export type SavedPlaylist = {
  id: string;
  name: string;
  url: string;
  count: number;
  /** Channel list read from a file on the device, so no network fetch is needed. */
  text?: string;
};

export type PlaylistChannel = {
  id: string;
  name: string;
  logo?: string;
  group?: string;
  url: string;
  hls: boolean;
};

export type ParsedPlaylist = {
  kind: 'channels' | 'stream';
  channels: PlaylistChannel[];
};

const STORAGE_KEY = 'novatv.playlists';
const PROXY_KEY = 'novatv.playlistProxy';

export function loadPlaylists(): SavedPlaylist[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedPlaylist[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && (item.url || item.text));
  } catch {
    return [];
  }
}

export function savePlaylists(playlists: SavedPlaylist[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(playlists));
  } catch {
    /* storage can be unavailable on locked-down TV browsers */
  }
}

/** Optional relay address; empty means playlists are downloaded straight from the link. */
export function loadPlaylistProxy() {
  try {
    return localStorage.getItem(PROXY_KEY) ?? '';
  } catch {
    return '';
  }
}

export function savePlaylistProxy(value: string) {
  try {
    const trimmed = value.trim().replace(/\/+$/, '');
    if (trimmed) localStorage.setItem(PROXY_KEY, trimmed);
    else localStorage.removeItem(PROXY_KEY);
  } catch {
    /* storage can be unavailable on locked-down TV browsers */
  }
}

export function normalizeLink(url: string) {
  const value = url.trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

function looksLikeHls(url: string) {
  return /\.m3u8?(\?|#|$)/i.test(url);
}

export function nameFromLink(url: string) {
  try {
    const parsed = new URL(url);
    const file = parsed.pathname.split('/').filter(Boolean).pop() ?? '';
    const base = file.replace(/\.(m3u8?|txt)$/i, '').replace(/[_-]+/g, ' ').trim();
    return base || parsed.hostname;
  } catch {
    return 'Playlist';
  }
}

/** Reads `key="value"` pairs from an #EXTINF line. */
function attributes(line: string) {
  const result: Record<string, string> = {};
  const pattern = /([a-zA-Z0-9-]+)="([^"]*)"/g;
  let match = pattern.exec(line);
  while (match) {
    result[match[1].toLowerCase()] = match[2];
    match = pattern.exec(line);
  }
  return result;
}

/** Title is everything after the first comma that is outside quotes. */
function titleOf(line: string) {
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) return line.slice(index + 1).trim();
  }
  return '';
}

export function parsePlaylist(text: string, sourceUrl: string): ParsedPlaylist {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').map((line) => line.trim());

  // A media or master HLS manifest is one stream, not a channel list.
  const isManifest = lines.some(
    (line) => line.startsWith('#EXT-X-STREAM-INF') || line.startsWith('#EXT-X-TARGETDURATION'),
  );
  if (isManifest) {
    return {
      kind: 'stream',
      channels: [
        {
          id: sourceUrl,
          name: nameFromLink(sourceUrl),
          url: sourceUrl,
          hls: true,
        },
      ],
    };
  }

  const channels: PlaylistChannel[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.startsWith('#EXTINF')) continue;

    let target = '';
    for (let next = index + 1; next < lines.length; next += 1) {
      const candidate = lines[next];
      if (!candidate) continue;
      if (candidate.startsWith('#')) continue;
      target = candidate;
      index = next;
      break;
    }
    if (!target || !/^(https?:)?\/\//i.test(target)) continue;

    let url = target;
    try {
      url = new URL(target, sourceUrl).toString();
    } catch {
      continue;
    }

    const attrs = attributes(line);
    const title = titleOf(line);
    channels.push({
      id: `${channels.length}-${url}`,
      name: attrs['tvg-name'] || title || `Channel ${channels.length + 1}`,
      logo: attrs['tvg-logo'] || undefined,
      group: attrs['group-title'] || undefined,
      url,
      hls: looksLikeHls(url),
    });
  }

  return { kind: 'channels', channels };
}

/** Parses playlist text that came from a local file instead of a network fetch. */
export function parsePlaylistText(text: string, fileName: string): ParsedPlaylist {
  if (!text.trim()) throw new Error('That file is empty.');
  if (!/#EXTM3U|#EXTINF|#EXT-X/i.test(text)) throw new Error('That file is not an M3U playlist.');
  // A dummy absolute base keeps absolute stream URLs intact without a real link.
  const parsed = parsePlaylist(text, `https://file.local/${encodeURIComponent(fileName)}`);
  if (parsed.kind === 'stream') {
    throw new Error(
      'That file is a single stream, not a channel list. Add its link instead of the file.',
    );
  }
  if (parsed.channels.length === 0) throw new Error('No playable channels were found in that file.');
  return parsed;
}

export function nameFromFile(fileName: string) {
  const base = fileName.replace(/\.(m3u8?|txt)$/i, '').replace(/[_-]+/g, ' ').trim();
  return base || 'Imported playlist';
}

async function download(target: string, base: string): Promise<ParsedPlaylist> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch(target, { signal: controller.signal, cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`That link replied with status ${response.status}. Check it opens in a browser tab.`);
    }
    const text = await response.text();
    if (!text.trim()) throw new Error('That link returned an empty file.');
    if (!/#EXTM3U|#EXTINF|#EXT-X/i.test(text)) {
      throw new Error('That link is not an M3U playlist.');
    }
    const parsed = parsePlaylist(text, response.url || base);
    if (parsed.kind === 'channels' && parsed.channels.length === 0) {
      throw new Error('No playable channels were found in that playlist.');
    }
    return parsed;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('That playlist link took too long to respond.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/** Wraps a link for the relay, which returns it with CORS headers attached. */
export function viaProxy(proxy: string, link: string) {
  return `${proxy.trim().replace(/\/+$/, '')}/?url=${encodeURIComponent(link)}`;
}

export async function fetchPlaylist(
  link: string,
  proxy = '',
): Promise<{ parsed: ParsedPlaylist; url: string }> {
  const url = normalizeLink(link);
  if (!url) throw new Error('Paste a playlist link first.');

  try {
    return { parsed: await download(url, url), url };
  } catch (error) {
    // A TypeError here almost always means the browser blocked a CORS-less host,
    // so retry through the relay when one is configured.
    if (!(error instanceof TypeError)) throw error;
    if (!proxy.trim()) {
      throw new Error(
        'Could not download that playlist: the host does not allow browser downloads (CORS). Add a playlist proxy below, or open a saved .m3u file.',
      );
    }
    try {
      return { parsed: await download(viaProxy(proxy, url), url), url };
    } catch (relayError) {
      const detail = relayError instanceof Error ? relayError.message : String(relayError);
      throw new Error(`Neither the link nor your playlist proxy could deliver it. ${detail}`);
    }
  }
}

export function channelToItem(channel: PlaylistChannel): PlayItem {
  return {
    title: channel.name,
    subtitle: channel.group,
    poster: channel.logo,
    url: channel.url,
    live: true,
    hls: channel.hls,
  };
}
