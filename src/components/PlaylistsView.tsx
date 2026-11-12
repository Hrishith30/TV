import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Category, PlayItem } from '../types';
import {
  channelToItem,
  fetchPlaylist,
  loadPlaylists,
  nameFromFile,
  nameFromLink,
  normalizeLink,
  parsePlaylistText,
  savePlaylists,
  type PlaylistChannel,
  type SavedPlaylist,
} from '../playlist';
import { useChunkedList } from '../hooks/useChunkedList';
import { CategoryPicker } from './CategoryPicker';
import { Icon } from './Icon';
import { StatePanel } from './StatePanel';
import { Thumb } from './Thumb';
import { cleanName, countLabel, cx } from '../utils';

type PlaylistsViewProps = {
  onPlay: (items: PlayItem[], index: number) => void;
};

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function PlaylistsView({ onPlay }: PlaylistsViewProps) {
  const [saved, setSaved] = useState<SavedPlaylist[]>(loadPlaylists);
  const [link, setLink] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [channels, setChannels] = useState<PlaylistChannel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('all');
  const [pickerOpen, setPickerOpen] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const remember = useCallback((next: SavedPlaylist[]) => {
    setSaved(next);
    savePlaylists(next);
  }, []);

  const open = useCallback(
    async (playlist: SavedPlaylist, playStream = false) => {
      setActiveId(playlist.id);
      setLoading(true);
      setError(null);
      setChannels([]);
      setQuery('');
      setGroup('all');
      try {
        const parsed = playlist.text
          ? parsePlaylistText(playlist.text, playlist.name)
          : (await fetchPlaylist(playlist.url)).parsed;
        setChannels(parsed.channels);
        if (parsed.kind === 'stream' || playStream) {
          onPlay(parsed.channels.map(channelToItem), 0);
        }
        setSaved((current) => {
          const next = current.map((item) =>
            item.id === playlist.id ? { ...item, count: parsed.channels.length } : item,
          );
          savePlaylists(next);
          return next;
        });
      } catch (nextError) {
        setError((nextError as Error).message);
        setActiveId(null);
      } finally {
        setLoading(false);
      }
    },
    [onPlay],
  );

  const add = useCallback(async () => {
    const url = normalizeLink(link);
    if (!url) {
      setError('Paste a playlist link first.');
      return;
    }
    const existing = saved.find((item) => item.url === url);
    if (existing) {
      setLink('');
      void open(existing);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const { parsed } = await fetchPlaylist(url);
      const entry: SavedPlaylist = {
        id: newId(),
        name: nameFromLink(url),
        url,
        count: parsed.channels.length,
      };
      remember([entry, ...saved]);
      setLink('');
      setActiveId(entry.id);
      setChannels(parsed.channels);
      setGroup('all');
      setQuery('');
      if (parsed.kind === 'stream') onPlay(parsed.channels.map(channelToItem), 0);
    } catch (nextError) {
      setError((nextError as Error).message);
    } finally {
      setLoading(false);
    }
  }, [link, open, onPlay, remember, saved]);

  const importFile = useCallback(
    async (file: File) => {
      setLoading(true);
      setError(null);
      try {
        const text = await file.text();
        const parsed = parsePlaylistText(text, file.name);
        const entry: SavedPlaylist = {
          id: newId(),
          name: nameFromFile(file.name),
          url: `File · ${file.name}`,
          count: parsed.channels.length,
          text,
        };
        remember([entry, ...saved.filter((item) => item.url !== entry.url)]);
        setActiveId(entry.id);
        setChannels(parsed.channels);
        setGroup('all');
        setQuery('');
      } catch (nextError) {
        setError((nextError as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [remember, saved],
  );

  const remove = useCallback(
    (id: string) => {
      remember(saved.filter((item) => item.id !== id));
      if (activeId === id) {
        setActiveId(null);
        setChannels([]);
      }
    },
    [activeId, remember, saved],
  );

  const groups = useMemo<Category[]>(() => {
    const map = new Map<string, number>();
    channels.forEach((channel) => {
      const name = channel.group || 'Ungrouped';
      map.set(name, (map.get(name) ?? 0) + 1);
    });
    return [...map.entries()].map(([name, count]) => ({
      category_id: name,
      category_name: `${name} (${count})`,
      parent_id: 0,
    }));
  }, [channels]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return channels.filter((channel) => {
      if (group !== 'all' && (channel.group || 'Ungrouped') !== group) return false;
      return !needle || channel.name.toLowerCase().includes(needle);
    });
  }, [channels, group, query]);

  const { visible, hasMore, loadMore } = useChunkedList(filtered, 96);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore();
      },
      { rootMargin: '700px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loadMore, visible.length]);

  const start = (channel: PlaylistChannel) => {
    const queue = filtered.map(channelToItem);
    const index = filtered.findIndex((item) => item.id === channel.id);
    onPlay(queue, index < 0 ? 0 : index);
  };

  const activePlaylist = saved.find((item) => item.id === activeId) ?? null;
  const groupLabel = group === 'all' ? 'All groups' : group;

  return (
    <section className="view">
      <div className="view-head">
        <div className="view-titles">
          <h1>Playlists</h1>
          <p className="view-sub">
            {loading
              ? 'Loading playlist…'
              : channels.length > 0
                ? `${countLabel(filtered.length, 'channel')} · ${activePlaylist?.name ?? 'Playlist'}`
                : `${countLabel(saved.length, 'playlist')} saved`}
          </p>
        </div>
        {channels.length > 0 && (
          <div className="view-actions">
            <div className="search">
              <Icon name="search" size={18} />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search this playlist"
                aria-label="Search playlist channels"
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    document.querySelector<HTMLElement>('.grid button')?.focus();
                  }
                  if (event.key === 'Escape') {
                    setQuery('');
                    event.currentTarget.blur();
                  }
                }}
              />
            </div>
            {groups.length > 1 && (
              <button type="button" className="chip-btn" onClick={() => setPickerOpen(true)}>
                <span>{groupLabel}</span>
                <Icon name="chevronRight" size={16} />
              </button>
            )}
          </div>
        )}
      </div>

      <form
        className="playlist-add"
        onSubmit={(event) => {
          event.preventDefault();
          void add();
        }}
      >
        <input
          type="text"
          value={link}
          onChange={(event) => setLink(event.target.value)}
          placeholder="Paste an .m3u or .m3u8 link"
          aria-label="Playlist link"
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
        />
        <button type="submit" className="btn btn-primary" disabled={loading}>
          <Icon name="list" size={18} /> {loading ? 'Loading…' : 'Add playlist'}
        </button>
      </form>

      <div className="playlist-file">
        <input
          ref={fileRef}
          type="file"
          accept=".m3u,.m3u8,application/vnd.apple.mpegurl,audio/x-mpegurl,text/plain"
          className="playlist-file-input"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void importFile(file);
          }}
        />
        <button
          type="button"
          className="btn btn-ghost"
          disabled={loading}
          onClick={() => fileRef.current?.click()}
        >
          Open .m3u file
        </button>
        <small>Downloaded the playlist already? Open it here — files on your device skip browser CORS.</small>
      </div>

      {error && (
        <p className="playlist-error" role="alert">
          {error}
        </p>
      )}

      {saved.length > 0 && (
        <div className="playlist-list">
          {saved.map((playlist) => (
            <div className="playlist-row" key={playlist.id}>
              <button
                type="button"
                className={cx('list-row', activeId === playlist.id && 'is-active')}
                onClick={() => void open(playlist)}
                title={playlist.url}
              >
                <span className="list-row-title">{playlist.name}</span>
                <small>
                  {playlist.url}
                  {playlist.count ? ` · ${countLabel(playlist.count, 'channel')}` : ''}
                </small>
              </button>
              <button type="button" className="icon-btn" onClick={() => remove(playlist.id)} aria-label="Remove">
                <Icon name="close" size={18} />
              </button>
            </div>
          ))}
        </div>
      )}

      {saved.length === 0 && !loading && !error && (
        <StatePanel
          tone="empty"
          title="No playlists yet"
          message="Paste an .m3u or .m3u8 link above, or open a playlist file from your device. Saved playlists stay in this browser."
        />
      )}

      {loading && (
        <StatePanel tone="loading" title="Loading playlist" message="Downloading the playlist and reading its channels." />
      )}

      {!loading && !error && channels.length > 0 && filtered.length === 0 && (
        <StatePanel tone="empty" title="Nothing found" message="Try a different search or another group." />
      )}

      {!loading && !error && filtered.length > 0 && (
        <>
          <div className="grid grid-live">
            {visible.map((channel) => (
              <button
                key={channel.id}
                type="button"
                className="card card-live"
                onClick={() => start(channel)}
                title={channel.name}
              >
                <Thumb src={channel.logo} name={channel.name} variant="wide" />
                <div className="card-body">
                  <span className="card-name">{cleanName(channel.name)}</span>
                  <span className="card-meta">{channel.group ?? 'Playlist'}</span>
                </div>
              </button>
            ))}
          </div>
          <div ref={sentinelRef} className="sentinel" />
          {hasMore && (
            <button type="button" className="btn btn-ghost load-more" onClick={loadMore}>
              Load more channels
            </button>
          )}
        </>
      )}

      {pickerOpen && (
        <CategoryPicker
          title="Playlist groups"
          categories={groups}
          activeId={group}
          onSelect={setGroup}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </section>
  );
}
