import { useEffect, useMemo, useRef, useState } from 'react';
import type { ApiConfig, Category, LiveStream, PlayItem } from '../types';
import { liveUrl, xtream } from '../api';
import { useChunkedList } from '../hooks/useChunkedList';
import { CategoryPicker } from './CategoryPicker';
import { Icon } from './Icon';
import { StatePanel } from './StatePanel';
import { Thumb } from './Thumb';
import { cleanName, countLabel } from '../utils';

type LiveViewProps = {
  config: ApiConfig;
  onPlay: (items: PlayItem[], index: number) => void;
};

export function LiveView({ config, onPlay }: LiveViewProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [streams, setStreams] = useState<LiveStream[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState('all');
  const [query, setQuery] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    Promise.all([xtream.categories(config, 'live'), xtream.liveStreams(config)])
      .then(([nextCategories, nextStreams]) => {
        if (!alive) return;
        setCategories(nextCategories);
        setStreams(nextStreams);
        setLoading(false);
      })
      .catch((nextError: Error) => {
        if (!alive) return;
        setError(nextError.message);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [config]);

  const categoryNames = useMemo(() => {
    const map = new Map<string, string>();
    categories.forEach((category) => map.set(category.category_id, category.category_name));
    return map;
  }, [categories]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const scoped = categoryId === 'all' ? streams : streams.filter((item) => item.category_id === categoryId);
    if (!needle) return scoped;
    return scoped.filter((item) => item.name.toLowerCase().includes(needle));
  }, [streams, categoryId, query]);

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

  const startPlayback = (channel: LiveStream) => {
    const queue: PlayItem[] = filtered.map((item) => ({
      title: cleanName(item.name),
      subtitle: item.category_id ? categoryNames.get(item.category_id) : undefined,
      poster: item.stream_icon,
      url: liveUrl(config, item.stream_id),
      live: true,
      hls: true,
    }));
    const index = filtered.findIndex((item) => item.stream_id === channel.stream_id);
    onPlay(queue, index < 0 ? 0 : index);
  };

  const categoryLabel = categoryId === 'all' ? 'All categories' : (categoryNames.get(categoryId) ?? 'Category');

  return (
    <section className="view">
      <div className="view-head">
        <div className="view-titles">
          <h1>Live TV</h1>
          <p className="view-sub">
            {loading ? 'Loading channels…' : `${countLabel(filtered.length, 'channel')} · ${categoryLabel}`}
          </p>
        </div>
        <div className="view-actions">
          <div className="search">
            <Icon name="search" size={18} />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={categoryId === 'all' ? 'Search all channels' : 'Search this category'}
              aria-label="Search channels"
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
          <button type="button" className="chip-btn" onClick={() => setPickerOpen(true)}>
            <span>{categoryLabel}</span>
            <Icon name="chevronRight" size={16} />
          </button>
        </div>
      </div>

      {loading && (
        <StatePanel
          tone="loading"
          title="Loading your channels"
          message="Pulling the channel list from your provider. This can take a moment."
        />
      )}

      {!loading && error && (
        <StatePanel
          tone="error"
          title="Could not load channels"
          message={error}
          action={
            <button type="button" className="btn btn-ghost" onClick={() => setCategoryId((value) => value)}>
              <Icon name="retry" size={18} /> Try again
            </button>
          }
        />
      )}

      {!loading && !error && filtered.length === 0 && (
        <StatePanel tone="empty" title="Nothing found" message="Try a different search or another category." />
      )}

      {!loading && !error && filtered.length > 0 && (
        <>
          <div className="grid grid-live">
            {visible.map((channel) => (
              <button
                key={channel.stream_id}
                type="button"
                className="card card-live"
                onClick={() => startPlayback(channel)}
                title={channel.name}
              >
                <Thumb src={channel.stream_icon} name={channel.name} variant="wide" />
                <div className="card-body">
                  <span className="card-name">{cleanName(channel.name)}</span>
                  <span className="card-meta">
                    {categoryId === 'all' ? (categoryNames.get(channel.category_id ?? '') ?? 'Live') : `CH ${channel.num ?? '—'}`}
                  </span>
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
          title="Live categories"
          categories={categories}
          activeId={categoryId}
          onSelect={setCategoryId}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </section>
  );
}
