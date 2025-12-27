import { useState, useMemo } from 'react';

interface UseExpandableListOptions {
  defaultLimit?: number;
}

export function useExpandableList<T>(items: T[], options: UseExpandableListOptions = {}) {
  const { defaultLimit = 10 } = options;
  const [isExpanded, setIsExpanded] = useState(false);

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
