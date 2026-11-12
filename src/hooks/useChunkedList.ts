import { useCallback, useEffect, useMemo, useState } from 'react';

/** Renders large catalogues in pages so a 20k-channel list stays responsive. */
export function useChunkedList<T>(items: T[], size = 96) {
  const [limit, setLimit] = useState(size);

  useEffect(() => {
    setLimit(size);
  }, [items, size]);

  const visible = useMemo(() => items.slice(0, limit), [items, limit]);
  const hasMore = limit < items.length;
  const loadMore = useCallback(() => setLimit((current) => current + size), [size]);

  return { visible, hasMore, loadMore };
}
