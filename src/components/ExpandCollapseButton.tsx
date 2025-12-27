import { ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ExpandCollapseButtonProps {
  isExpanded: boolean;
  onToggle: () => void;
  hiddenCount: number;
  totalCount: number;
}

export function ExpandCollapseButton({ 
  isExpanded, 
  onToggle, 
  hiddenCount,
  totalCount 
}: ExpandCollapseButtonProps) {
  if (hiddenCount <= 0) return null;

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onToggle}
      className="text-xs text-muted-foreground hover:text-foreground gap-1 h-7 px-2"
    >
      {isExpanded ? (
        <>
          <ChevronUp className="h-3 w-3" />
          Show top 10 only
        </>
      ) : (
        <>
          <ChevronDown className="h-3 w-3" />
          Show all {totalCount} ({hiddenCount} more)
        </>
      )}
    </Button>
  );
}
