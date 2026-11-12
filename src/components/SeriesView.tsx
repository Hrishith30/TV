import { useEffect, useMemo, useRef, useState } from 'react';
import type { ApiConfig, Category, PlayItem, SeriesItem } from '../types';
import { xtream } from '../api';
import { useChunkedList } from '../hooks/useChunkedList';
import { CategoryPicker } from './CategoryPicker';
import { Icon } from './Icon';
import { SeriesDetail } from './SeriesDetail';
import { StatePanel } from './StatePanel';
import { Thumb } from './Thumb';
import { cleanName, countLabel } from '../utils';

type SeriesViewProps = {
  config: ApiConfig;
  onPlay: (items: PlayItem[], index: number) => void;
};

export function SeriesView({ config, onPlay }: SeriesViewProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [items, setItems] = useState<SeriesItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selected, setSelected] = useState<SeriesItem | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    xtream
      .categories(config, 'series')
      .then((nextCategories) => {
        if (!alive) return;
        setCategories(nextCategories);
        setCategoryId((current) => current || nextCategories[0]?.category_id || '');
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

  useEffect(() => {
    if (!categoryId) return;
    let alive = true;
    setLoading(true);
    setError(null);
    xtream
      .series(config, categoryId)
      .then((list) => {
        if (!alive) return;
        setItems(list);
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
  }, [config, categoryId]);

  const categoryName = useMemo(
    () => categories.find((category) => category.category_id === categoryId)?.category_name ?? 'Series',
    [categories, categoryId],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) => item.name.toLowerCase().includes(needle));
  }, [items, query]);

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

  return (
    <section className="view">
      <div className="view-head">
        <div className="view-titles">
          <h1>Series</h1>
          <p className="view-sub">
            {loading ? 'Loading…' : `${countLabel(filtered.length, 'show')} · ${categoryName}`}
          </p>
        </div>
        <div className="view-actions">
          <div className="search">
            <Icon name="search" size={18} />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search this category"
              aria-label="Search series"
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
            <span>{categoryName}</span>
            <Icon name="chevronRight" size={16} />
          </button>
        </div>
      </div>

      {loading && (
        <StatePanel tone="loading" title="Loading series" message="Fetching shows in this category." />
      )}

      {!loading && error && <StatePanel tone="error" title="Could not load series" message={error} />}

      {!loading && !error && filtered.length === 0 && (
        <StatePanel tone="empty" title="No shows here" message="Pick another category or adjust your search." />
      )}

      {!loading && !error && filtered.length > 0 && (
        <>
          <div className="grid grid-poster">
            {visible.map((item) => (
              <button
                key={item.series_id}
                type="button"
                className="card card-poster"
                onClick={() => setSelected(item)}
                title={item.name}
              >
                <Thumb src={item.cover} name={item.name} variant="poster" />
                <div className="card-body">
                  <span className="card-name">{cleanName(item.name)}</span>
                  <span className="card-meta">
                    {item.genre ? item.genre.split(',')[0] : item.rating ? `★ ${item.rating}` : 'Series'}
                  </span>
                </div>
              </button>
            ))}
          </div>
          <div ref={sentinelRef} className="sentinel" />
          {hasMore && (
            <button type="button" className="btn btn-ghost load-more" onClick={loadMore}>
              Load more shows
            </button>
          )}
        </>
      )}

      {pickerOpen && (
        <CategoryPicker
          title="Series categories"
          categories={categories}
          activeId={categoryId}
          includeAll={false}
          onSelect={setCategoryId}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {selected && (
        <SeriesDetail
          config={config}
          series={selected}
          onClose={() => setSelected(null)}
          onPlay={onPlay}
        />
      )}
    </section>
  );
}
