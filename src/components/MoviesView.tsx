import { useEffect, useMemo, useRef, useState } from 'react';
import type { ApiConfig, Category, PlayItem, VodStream } from '../types';
import { xtream } from '../api';
import { useChunkedList } from '../hooks/useChunkedList';
import { CategoryPicker } from './CategoryPicker';
import { Icon } from './Icon';
import { MovieDetail } from './MovieDetail';
import { StatePanel } from './StatePanel';
import { Thumb } from './Thumb';
import { cleanName, countLabel } from '../utils';

type MoviesViewProps = {
  config: ApiConfig;
  onPlay: (items: PlayItem[], index: number) => void;
};

export function MoviesView({ config, onPlay }: MoviesViewProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [movies, setMovies] = useState<VodStream[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selected, setSelected] = useState<VodStream | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    xtream
      .categories(config, 'vod')
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
      .vodStreams(config, categoryId)
      .then((list) => {
        if (!alive) return;
        setMovies(list);
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
    () => categories.find((category) => category.category_id === categoryId)?.category_name ?? 'Movies',
    [categories, categoryId],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return movies;
    return movies.filter((movie) => movie.name.toLowerCase().includes(needle));
  }, [movies, query]);

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
          <h1>Movies</h1>
          <p className="view-sub">
            {loading ? 'Loading…' : `${countLabel(filtered.length, 'title')} · ${categoryName}`}
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
              aria-label="Search movies"
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
        <StatePanel tone="loading" title="Loading movies" message="Fetching the titles in this category." />
      )}

      {!loading && error && <StatePanel tone="error" title="Could not load movies" message={error} />}

      {!loading && !error && filtered.length === 0 && (
        <StatePanel tone="empty" title="No movies here" message="Pick another category or adjust your search." />
      )}

      {!loading && !error && filtered.length > 0 && (
        <>
          <div className="grid grid-poster">
            {visible.map((movie) => (
              <button
                key={movie.stream_id}
                type="button"
                className="card card-poster"
                onClick={() => setSelected(movie)}
                title={movie.name}
              >
                <Thumb src={movie.stream_icon} name={movie.name} variant="poster" />
                <div className="card-body">
                  <span className="card-name">{cleanName(movie.name)}</span>
                  <span className="card-meta">{movie.rating ? `★ ${movie.rating}` : 'Movie'}</span>
                </div>
              </button>
            ))}
          </div>
          <div ref={sentinelRef} className="sentinel" />
          {hasMore && (
            <button type="button" className="btn btn-ghost load-more" onClick={loadMore}>
              Load more movies
            </button>
          )}
        </>
      )}

      {pickerOpen && (
        <CategoryPicker
          title="Movie categories"
          categories={categories}
          activeId={categoryId}
          includeAll={false}
          onSelect={setCategoryId}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {selected && (
        <MovieDetail
          config={config}
          movie={selected}
          onClose={() => setSelected(null)}
          onPlay={onPlay}
        />
      )}
    </section>
  );
}
