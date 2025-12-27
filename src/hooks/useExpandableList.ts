import { useState, useMemo, useEffect } from 'react';

interface UseExpandableListOptions {
  defaultLimit?: number;
  resetKey?: string | number;
}

export function useExpandableList<T>(items: T[], options: UseExpandableListOptions = {}) {
  const { defaultLimit = 10, resetKey } = options;
  const [isExpanded, setIsExpanded] = useState(false);

  // Reset to collapsed when resetKey changes
  useEffect(() => {
    setIsExpanded(false);
  }, [resetKey]);

  const displayItems = useMemo(() => {
    if (isExpanded) return items;
    return items.slice(0, defaultLimit);
  }, [items, isExpanded, defaultLimit]);

  const hasMore = items.length > defaultLimit;
  const hiddenCount = items.length - defaultLimit;

  return {
    displayItems,
    isExpanded,
    setIsExpanded,
    hasMore,
    hiddenCount,
    totalCount: items.length,
    toggle: () => setIsExpanded(prev => !prev),
  };
}
