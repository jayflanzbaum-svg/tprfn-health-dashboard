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


function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
}

function endOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
}

function addDaysUtc(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function addMonthsUtc(date: Date, months: number): Date {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

function addYearsUtc(date: Date, years: number): Date {
  const d = new Date(date);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d;
}

// Calendar selection is in local time; convert to a UTC day range with the same YYYY-MM-DD.
function startOfUtcDayFromLocalDay(dateLocal: Date): Date {
  return new Date(Date.UTC(dateLocal.getFullYear(), dateLocal.getMonth(), dateLocal.getDate(), 0, 0, 0, 0));
}

function endOfUtcDayFromLocalDay(dateLocal: Date): Date {
  return new Date(Date.UTC(dateLocal.getFullYear(), dateLocal.getMonth(), dateLocal.getDate(), 23, 59, 59, 999));
}

// When dates are UTC-anchored, display them as calendar days without timezone shifting.
function toDisplayDay(date: Date, useUtc: boolean): Date {
  if (!useUtc) return date;
  // Noon local time avoids DST edge cases while keeping the same Y-M-D.
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12, 0, 0, 0);
}

const presetDefs: {
  value: DatePreset;
  label: string;
  getRange: (base: Date, useUtc: boolean) => { start: Date; end: Date };
  requiresLoading?: boolean; // If true, show loading indicator when selected
}[] = [
  {
    value: 'today',
    label: 'Today',
    getRange: (base, useUtc) =>
      useUtc
        ? { start: startOfUtcDay(base), end: endOfUtcDay(base) }
        : { start: startOfDay(base), end: endOfDay(base) },
  },
  {
    value: 'yesterday',
    label: 'Yesterday',
    getRange: (base, useUtc) =>
      useUtc
        ? { start: startOfUtcDay(addDaysUtc(base, -1)), end: endOfUtcDay(addDaysUtc(base, -1)) }
        : { start: startOfDay(subDays(base, 1)), end: endOfDay(subDays(base, 1)) },
  },
  {
    value: 'last7days',
    label: 'Last 7 Days',
    getRange: (base, useUtc) =>
      useUtc
        ? { start: startOfUtcDay(addDaysUtc(base, -6)), end: endOfUtcDay(base) }
        : { start: startOfDay(subDays(base, 6)), end: endOfDay(base) },
  },
  {
    value: 'last30days',
    label: 'Last 30 Days',
    getRange: (base, useUtc) =>
      useUtc
        ? { start: startOfUtcDay(addDaysUtc(base, -29)), end: endOfUtcDay(base) }
        : { start: startOfDay(subDays(base, 29)), end: endOfDay(base) },
  },
  {
    value: 'lastWeek',
    label: 'Last Week',
    getRange: (base, useUtc) =>
      useUtc
        ? { start: startOfUtcDay(addDaysUtc(base, -7)), end: endOfUtcDay(base) }
        : { start: startOfDay(subWeeks(base, 1)), end: endOfDay(base) },
  },
  {
    value: 'lastMonth',
    label: 'Last Month',
    getRange: (base, useUtc) =>
      useUtc
        ? { start: startOfUtcDay(addMonthsUtc(base, -1)), end: endOfUtcDay(base) }
        : { start: startOfDay(subMonths(base, 1)), end: endOfDay(base) },
  },
  {
    value: 'lastQuarter',
    label: 'Last Quarter',
    getRange: (base, useUtc) =>
      useUtc
        ? { start: startOfUtcDay(addMonthsUtc(base, -3)), end: endOfUtcDay(base) }
        : { start: startOfDay(subQuarters(base, 1)), end: endOfDay(base) },
    requiresLoading: true,
  },
  {
    value: 'lastYear',
    label: 'Last Year',
    getRange: (base, useUtc) =>
      useUtc
        ? { start: startOfUtcDay(addYearsUtc(base, -1)), end: endOfUtcDay(base) }
        : { start: startOfDay(subYears(base, 1)), end: endOfDay(base) },
    requiresLoading: true,
  },
];

export function DateRangeFilter({ value, onChange, dataDateRange }: DateRangeFilterProps) {
  const useUtc = true; // Database stores Zulu time
  const [isCustomOpen, setIsCustomOpen] = useState(false);
  const [customStart, setCustomStart] = useState<Date | undefined>(toDisplayDay(value.start, useUtc));
  const [customEnd, setCustomEnd] = useState<Date | undefined>(toDisplayDay(value.end, useUtc));

  // Presets should follow the user's actual calendar (browser local time).
  // If there's no data for the chosen range, the dashboard will show an empty state.
  const baseDate = new Date();

  const handlePresetSelect = (preset: typeof presetDefs[0]) => {
    // Always use the newest available data date as the base
    const range = preset.getRange(baseDate, useUtc);
    onChange(
      {
        start: range.start,
        end: range.end,
        preset: preset.value,
        label: preset.label,
      },
      preset.requiresLoading,
    );
  };

  const handleAllDates = () => {
    if (dataDateRange) {
      // All dates is a large range, requires loading
      const allStart = useUtc ? startOfUtcDay(dataDateRange.start) : startOfDay(dataDateRange.start);
      const allEnd = useUtc ? endOfUtcDay(dataDateRange.end) : endOfDay(dataDateRange.end);
      const durationDays = Math.ceil((allEnd.getTime() - allStart.getTime()) / (1000 * 60 * 60 * 24));
      const requiresLoading = durationDays > 60; // More than 60 days needs loading indicator
      onChange(
        {
          start: allStart,
          end: allEnd,
          preset: 'all',
          label: 'All Dates',
        },
        requiresLoading,
      );
    }
  };

  const handleCustomApply = () => {
    if (customStart && customEnd) {
      const startLabelFormat = customStart.getFullYear() !== customEnd.getFullYear() ? 'MMM d, yyyy' : 'MMM d';

      onChange({
        start: useUtc ? startOfUtcDayFromLocalDay(customStart) : startOfDay(customStart),
        end: useUtc ? endOfUtcDayFromLocalDay(customEnd) : endOfDay(customEnd),
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

      <Dialog
        open={isCustomOpen}
        onOpenChange={(open) => {
          setIsCustomOpen(open);
          if (open) {
            setCustomStart(toDisplayDay(value.start, useUtc));
            setCustomEnd(toDisplayDay(value.end, useUtc));
          }
        }}
      >
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
          {(() => {
            const start = toDisplayDay(value.start, useUtc);
            const end = toDisplayDay(value.end, useUtc);
            const startLabelFormat = start.getFullYear() !== end.getFullYear() ? 'MMM d, yyyy' : 'MMM d';

            return (
              <>
                {format(start, startLabelFormat)} - {format(end, 'MMM d, yyyy')}
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}

export function getComparisonPeriod(current: DateRange): { start: Date; end: Date; label: string } {
  // NOTE: The database timestamps are stored in UTC (Zulu). Our presets are UTC-anchored,
  // so the comparison period must be computed using absolute timestamps (ms), not local
  // calendar setters like setHours()/setDate() that can shift the day unexpectedly.

  // For "today" preset, compare against the same elapsed time window yesterday.
  // Example: if it is 19:54Z, compare 00:00Z–19:54Z today vs 00:00Z–19:54Z yesterday.
  if (current.preset === 'today') {
    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    const now = new Date();

    // Current range is usually end-of-day; clamp to "now" so we're always comparing "so far".
    const currentEnd = now.getTime() < current.end.getTime() ? now : current.end;
    const elapsedMs = Math.max(0, currentEnd.getTime() - current.start.getTime());

    const previousStart = new Date(current.start.getTime() - MS_PER_DAY);
    const previousEnd = new Date(previousStart.getTime() + elapsedMs);

    return { start: previousStart, end: previousEnd, label: 'vs same time yesterday' };
  }

  // For other presets, use the standard previous period comparison
  const duration = current.end.getTime() - current.start.getTime();
  const previousEnd = new Date(current.start.getTime() - 1);
  const previousStart = new Date(previousEnd.getTime() - duration);

  let label = 'vs previous period';
  switch (current.preset) {
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

export function getDefaultDateRange(_dataDateRange?: { start: Date; end: Date }): DateRange {
  // Default to the user's actual current day (local time).
  const today = new Date();
  return {
    start: startOfDay(today),
    end: endOfDay(today),
    preset: 'today',
    label: 'Today',
  };
}
