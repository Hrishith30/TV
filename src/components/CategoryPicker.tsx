import { useEffect, useMemo, useRef, useState } from 'react';
import type { Category } from '../types';
import { useSpatialNav } from '../hooks/useSpatialNav';
import { Icon } from './Icon';
import { cx } from '../utils';

type CategoryPickerProps = {
  title: string;
  categories: Category[];
  activeId: string;
  includeAll?: boolean;
  onSelect: (id: string) => void;
  onClose: () => void;
};

export function CategoryPicker({
  title,
  categories,
  activeId,
  includeAll = true,
  onSelect,
  onClose,
}: CategoryPickerProps) {
  const [query, setQuery] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  useSpatialNav(true, panelRef);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return categories;
    return categories.filter((category) => category.category_name.toLowerCase().includes(needle));
  }, [categories, query]);

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={title} ref={panelRef}>
      <div className="overlay-head">
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
          <Icon name="back" />
        </button>
        <h2>{title}</h2>
        <div className="search search-compact">
          <Icon name="search" size={18} />
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a category"
            aria-label="Find a category"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                setQuery('');
                event.currentTarget.blur();
                onClose();
              }
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                panelRef.current?.querySelector<HTMLElement>('.picker-row')?.focus();
              }
            }}
          />
        </div>
      </div>

      <div className="picker-list">
        {includeAll && (
          <button
            type="button"
            className={cx('picker-row', activeId === 'all' && 'is-active')}
            onClick={() => {
              onSelect('all');
              onClose();
            }}
          >
            <span>All categories</span>
          </button>
        )}
        {filtered.map((category) => (
          <button
            key={category.category_id}
            type="button"
            className={cx('picker-row', activeId === category.category_id && 'is-active')}
            onClick={() => {
              onSelect(category.category_id);
              onClose();
            }}
          >
            <span>{category.category_name}</span>
          </button>
        ))}
        {filtered.length === 0 && <p className="picker-empty">No categories match “{query}”.</p>}
      </div>
    </div>
  );
}
