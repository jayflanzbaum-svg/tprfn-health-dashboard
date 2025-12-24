import { useState } from 'react';
import { format, startOfDay, endOfDay, subDays, subWeeks, subMonths, subQuarters, subYears } from 'date-fns';
import { CalendarIcon, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export type DatePreset = 'today' | 'yesterday' | 'last7days' | 'last30days' | 'lastWeek' | 'lastMonth' | 'lastQuarter' | 'lastYear' | 'custom' | 'all';

export interface DateRange {
  start: Date;
  end: Date;
  preset: DatePreset;
  label: string;
}

interface DateRangeFilterProps {
  value: DateRange;
  onChange: (range: DateRange, requiresLoading?: boolean) => void;
  dataDateRange?: { start: Date; end: Date };
}

const presetDefs: {
  value: DatePreset;
  label: string;
  getRange: (base: Date) => { start: Date; end: Date };
  useRealDate?: boolean; // If true, use current date instead of data's end date
  requiresLoading?: boolean; // If true, show loading indicator when selected
}[] = [
  {
    value: 'today',
    label: 'Today',
    getRange: () => ({ start: startOfDay(new Date()), end: endOfDay(new Date()) }),
    useRealDate: true,
  },
  {
    value: 'yesterday',
    label: 'Yesterday',
    getRange: () => ({ start: startOfDay(subDays(new Date(), 1)), end: endOfDay(subDays(new Date(), 1)) }),
    useRealDate: true,
  },
  {
    value: 'last7days',
    label: 'Last 7 Days',
    getRange: (base) => ({ start: startOfDay(subDays(base, 6)), end: endOfDay(base) }),
  },
  {
    value: 'last30days',
    label: 'Last 30 Days',
    getRange: (base) => ({ start: startOfDay(subDays(base, 29)), end: endOfDay(base) }),
  },
  {
    value: 'lastWeek',
    label: 'Last Week',
    getRange: (base) => ({ start: startOfDay(subWeeks(base, 1)), end: endOfDay(base) }),
  },
  {
    value: 'lastMonth',
    label: 'Last Month',
    getRange: (base) => ({ start: startOfDay(subMonths(base, 1)), end: endOfDay(base) }),
  },
  {
    value: 'lastQuarter',
    label: 'Last Quarter',
    getRange: (base) => ({ start: startOfDay(subQuarters(base, 1)), end: endOfDay(base) }),
    requiresLoading: true,
  },
  {
    value: 'lastYear',
    label: 'Last Year',
    getRange: (base) => ({ start: startOfDay(subYears(base, 1)), end: endOfDay(base) }),
    requiresLoading: true,
  },
];

export function DateRangeFilter({ value, onChange, dataDateRange }: DateRangeFilterProps) {
  const [isCustomOpen, setIsCustomOpen] = useState(false);
  const [customStart, setCustomStart] = useState<Date | undefined>(value.start);
  const [customEnd, setCustomEnd] = useState<Date | undefined>(value.end);

  // Anchor preset ranges to the newest available data when provided,
  // so "Today/Last 7 Days" still works for historical datasets.
  const baseDate = dataDateRange?.end ?? new Date();

  const handlePresetSelect = (preset: typeof presetDefs[0]) => {
    // Use real date for today/yesterday, otherwise use data's end date
    const base = preset.useRealDate ? new Date() : baseDate;
    const range = preset.getRange(base);
    onChange({
      start: range.start,
      end: range.end,
      preset: preset.value,
      label: preset.label,
    }, preset.requiresLoading);
  };

  const handleAllDates = () => {
    if (dataDateRange) {
      // All dates is a large range, requires loading
      const durationDays = Math.ceil((dataDateRange.end.getTime() - dataDateRange.start.getTime()) / (1000 * 60 * 60 * 24));
      const requiresLoading = durationDays > 60; // More than 60 days needs loading indicator
      onChange({
        start: dataDateRange.start,
        end: dataDateRange.end,
        preset: 'all',
        label: 'All Dates',
      }, requiresLoading);
    }
  };

  const handleCustomApply = () => {
    if (customStart && customEnd) {
      const startLabelFormat =
        customStart.getFullYear() !== customEnd.getFullYear() ? 'MMM d, yyyy' : 'MMM d';

      onChange({
        start: startOfDay(customStart),
        end: endOfDay(customEnd),
        preset: 'custom',
        label: `${format(customStart, startLabelFormat)} - ${format(customEnd, 'MMM d, yyyy')}`,
      });
      setIsCustomOpen(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="min-w-[180px] justify-between bg-background">
            <div className="flex items-center gap-2">
              <CalendarIcon className="h-4 w-4 text-muted-foreground" />
              <span>{value.label}</span>
            </div>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[200px] bg-popover text-popover-foreground z-50">
          <DropdownMenuItem onClick={handleAllDates} disabled={!dataDateRange} className="cursor-pointer">
            All Dates
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {presetDefs.map((preset) => (
            <DropdownMenuItem
              key={preset.value}
              onClick={() => handlePresetSelect(preset)}
              className={cn(
                "cursor-pointer",
                value.preset === preset.value && "bg-accent"
              )}
            >
              {preset.label}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setIsCustomOpen(true)}
            className="cursor-pointer"
          >
            Custom Range...
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={isCustomOpen} onOpenChange={setIsCustomOpen}>
        <DialogContent className="max-w-[900px] bg-popover text-popover-foreground">
          <DialogHeader>
            <DialogTitle>Select Date Range</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">Start Date</div>
              <Calendar
                mode="single"
                selected={customStart}
                onSelect={setCustomStart}
                className="rounded-md border bg-background pointer-events-auto"
              />
            </div>

            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">End Date</div>
              <Calendar
                mode="single"
                selected={customEnd}
                onSelect={setCustomEnd}
                className="rounded-md border bg-background pointer-events-auto"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsCustomOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleCustomApply} disabled={!customStart || !customEnd}>
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {value.preset !== 'all' && (
        <div className="text-xs text-muted-foreground">
          {format(value.start, value.start.getFullYear() !== value.end.getFullYear() ? 'MMM d, yyyy' : 'MMM d')} -{' '}
          {format(value.end, 'MMM d, yyyy')}
        </div>
      )}
    </div>
  );
}

export function getComparisonPeriod(current: DateRange): { start: Date; end: Date; label: string } {
  const duration = current.end.getTime() - current.start.getTime();
  const previousEnd = new Date(current.start.getTime() - 1);
  const previousStart = new Date(previousEnd.getTime() - duration);

  let label = 'vs previous period';
  switch (current.preset) {
    case 'today':
      label = 'vs yesterday';
      break;
    case 'yesterday':
      label = 'vs day before';
      break;
    case 'last7days':
    case 'lastWeek':
      label = 'vs previous week';
      break;
    case 'last30days':
    case 'lastMonth':
      label = 'vs previous month';
      break;
    case 'lastQuarter':
      label = 'vs previous quarter';
      break;
    case 'lastYear':
      label = 'vs previous year';
      break;
  }

  return { start: previousStart, end: previousEnd, label };
}

export function getDefaultDateRange(dataDateRange?: { start: Date; end: Date }): DateRange {
  // Always default to real "Today" first
  const today = new Date();
  const range = { start: startOfDay(today), end: endOfDay(today) };
  
  // If we have data range, check if today overlaps with the data
  if (dataDateRange) {
    const todayOverlaps = range.start <= dataDateRange.end && range.end >= dataDateRange.start;
    if (todayOverlaps) {
      return {
        start: range.start,
        end: range.end,
        preset: 'today',
        label: 'Today',
      };
    }
    // If today doesn't overlap, use last 7 days of available data
    const end = endOfDay(dataDateRange.end);
    const start = startOfDay(subDays(end, 6));
    return {
      start,
      end,
      preset: 'last7days',
      label: 'Last 7 Days',
    };
  }

  return {
    start: range.start,
    end: range.end,
    preset: 'today',
    label: 'Today',
  };
}
