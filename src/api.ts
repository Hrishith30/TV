import type {
  ApiConfig,
  Category,
  LiveStream,
  LoginResponse,
  SeriesInfo,
  SeriesItem,
  VodInfo,
  VodStream,
} from './types';

/**
 * Optional defaults come from a local .env.local file so that a public build
 * (GitHub Pages) never ships anyone's subscription credentials.
 */
export const DEFAULT_CONFIG: ApiConfig = {
  url: import.meta.env.VITE_IPTV_SERVER ?? '',
  username: import.meta.env.VITE_IPTV_USER ?? '',
  password: import.meta.env.VITE_IPTV_PASS ?? '',
};

const STORAGE_KEY = 'novatv.config';
const cache = new Map<string, Promise<unknown>>();

export function loadConfig(): ApiConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw) as Partial<ApiConfig>;
    if (!parsed.url || !parsed.username || !parsed.password) return DEFAULT_CONFIG;
    return { url: parsed.url, username: parsed.username, password: parsed.password };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveConfig(config: ApiConfig) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    /* storage can be unavailable on locked-down TV browsers */
  }
}

export function clearCache() {
  cache.clear();
}

export function normalizeBase(url: string) {
  let value = url.trim();
  if (!/^https?:\/\//i.test(value)) value = `http://${value}`;
  return value.replace(/\/+$/, '');
}

async function getJson<T>(target: string, timeoutMs = 30000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(target, { signal: controller.signal, cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`The IPTV server replied with status ${response.status}.`);
    }
    const text = await response.text();
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error('The IPTV server returned data we could not read. Check the server address.');
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('The IPTV server took too long to respond.');
    }
    if (error instanceof TypeError) {
      throw new Error('Could not reach the IPTV server. Check the address and your network.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit) return hit as Promise<T>;
  const pending = load().catch((error) => {
    cache.delete(key);
    throw error;
  });
  cache.set(key, pending);
  return pending;
}

function apiUrl(config: ApiConfig, params: Record<string, string | undefined> = {}) {
  const query = new URLSearchParams({
    username: config.username,
    password: config.password,
  });
  Object.entries(params).forEach(([key, value]) => {
    if (value) query.set(key, value);
  });
  return `${normalizeBase(config.url)}/player_api.php?${query.toString()}`;
}

function streamUrl(config: ApiConfig, kind: 'live' | 'movie' | 'series', id: string | number, ext: string) {
  const base = normalizeBase(config.url);
  const user = encodeURIComponent(config.username);
  const pass = encodeURIComponent(config.password);
  return `${base}/${kind}/${user}/${pass}/${id}.${ext}`;
}

export const xtream = {
  async login(config: ApiConfig): Promise<LoginResponse> {
    const data = await getJson<LoginResponse>(apiUrl(config), 20000);
    if (!data || !data.user_info) {
      throw new Error('This address did not return a valid IPTV account.');
    }
    if (Number(data.user_info.auth) !== 1) {
      const reason = data.user_info.message || data.user_info.status || 'Login failed';
      throw new Error(`The provider rejected these credentials (${reason}).`);
    }
    return data;
  },

  categories(config: ApiConfig, kind: 'live' | 'vod' | 'series'): Promise<Category[]> {
    const action =
      kind === 'live' ? 'get_live_categories' : kind === 'vod' ? 'get_vod_categories' : 'get_series_categories';
    return cached(apiUrl(config, { action }), async () => {
      const data = await getJson<Category[]>(apiUrl(config, { action }));
      return Array.isArray(data) ? data : [];
    });
  },

  liveStreams(config: ApiConfig): Promise<LiveStream[]> {
    return cached(apiUrl(config, { action: 'get_live_streams' }), async () => {
      const data = await getJson<LiveStream[]>(apiUrl(config, { action: 'get_live_streams' }), 60000);
      return Array.isArray(data) ? data : [];
    });
  },

  vodStreams(config: ApiConfig, categoryId: string): Promise<VodStream[]> {
    return cached(apiUrl(config, { action: 'get_vod_streams', category_id: categoryId }), async () => {
      const data = await getJson<VodStream[]>(
        apiUrl(config, { action: 'get_vod_streams', category_id: categoryId }),
        60000,
      );
      return Array.isArray(data) ? data : [];
    });
  },

  series(config: ApiConfig, categoryId: string): Promise<SeriesItem[]> {
    return cached(apiUrl(config, { action: 'get_series', category_id: categoryId }), async () => {
      const data = await getJson<SeriesItem[]>(apiUrl(config, { action: 'get_series', category_id: categoryId }), 60000);
      return Array.isArray(data) ? data : [];
    });
  },

  vodInfo(config: ApiConfig, vodId: number): Promise<VodInfo> {
    return cached(apiUrl(config, { action: 'get_vod_info', vod_id: String(vodId) }), () =>
      getJson<VodInfo>(apiUrl(config, { action: 'get_vod_info', vod_id: String(vodId) })),
    );
  },

  seriesInfo(config: ApiConfig, seriesId: number): Promise<SeriesInfo> {
    return cached(apiUrl(config, { action: 'get_series_info', series_id: String(seriesId) }), () =>
      getJson<SeriesInfo>(apiUrl(config, { action: 'get_series_info', series_id: String(seriesId) })),
    );
  },
};

export function liveUrl(config: ApiConfig, streamId: number | string) {
  return streamUrl(config, 'live', streamId, 'm3u8');
}

export function movieUrl(config: ApiConfig, streamId: number | string, ext = 'mp4') {
  return streamUrl(config, 'movie', streamId, ext);
}

export function episodeUrl(config: ApiConfig, episodeId: number | string, ext = 'mp4') {
  return streamUrl(config, 'series', episodeId, ext);
}

export function isHlsExtension(ext?: string) {
  const value = (ext || 'mp4').toLowerCase();
  return value === 'm3u8' || value === 'm3u';
}
