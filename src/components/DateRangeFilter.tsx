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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
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
  onChange: (range: DateRange) => void;
  dataDateRange?: { start: Date; end: Date };
}

const presets: { value: DatePreset; label: string; getRange: () => { start: Date; end: Date } }[] = [
  {
    value: 'today',
    label: 'Today',
    getRange: () => ({ start: startOfDay(new Date()), end: endOfDay(new Date()) }),
  },
  {
    value: 'yesterday',
    label: 'Yesterday',
    getRange: () => ({ start: startOfDay(subDays(new Date(), 1)), end: endOfDay(subDays(new Date(), 1)) }),
  },
  {
    value: 'last7days',
    label: 'Last 7 Days',
    getRange: () => ({ start: startOfDay(subDays(new Date(), 6)), end: endOfDay(new Date()) }),
  },
  {
    value: 'last30days',
    label: 'Last 30 Days',
    getRange: () => ({ start: startOfDay(subDays(new Date(), 29)), end: endOfDay(new Date()) }),
  },
  {
    value: 'lastWeek',
    label: 'Last Week',
    getRange: () => ({ start: startOfDay(subWeeks(new Date(), 1)), end: endOfDay(new Date()) }),
  },
  {
    value: 'lastMonth',
    label: 'Last Month',
    getRange: () => ({ start: startOfDay(subMonths(new Date(), 1)), end: endOfDay(new Date()) }),
  },
  {
    value: 'lastQuarter',
    label: 'Last Quarter',
    getRange: () => ({ start: startOfDay(subQuarters(new Date(), 1)), end: endOfDay(new Date()) }),
  },
  {
    value: 'lastYear',
    label: 'Last Year',
    getRange: () => ({ start: startOfDay(subYears(new Date(), 1)), end: endOfDay(new Date()) }),
  },
];

export function DateRangeFilter({ value, onChange, dataDateRange }: DateRangeFilterProps) {
  const [isCustomOpen, setIsCustomOpen] = useState(false);
  const [customStart, setCustomStart] = useState<Date | undefined>(value.start);
  const [customEnd, setCustomEnd] = useState<Date | undefined>(value.end);

  const handlePresetSelect = (preset: typeof presets[0]) => {
    const range = preset.getRange();
    onChange({
      start: range.start,
      end: range.end,
      preset: preset.value,
      label: preset.label,
    });
  };

  const handleAllDates = () => {
    if (dataDateRange) {
      onChange({
        start: dataDateRange.start,
        end: dataDateRange.end,
        preset: 'all',
        label: 'All Dates',
      });
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
        <DropdownMenuContent align="start" className="w-[200px] bg-white dark:bg-slate-900 z-50">
          <DropdownMenuItem onClick={handleAllDates} className="cursor-pointer">
            All Dates
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {presets.map((preset) => (
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

      {isCustomOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/50" onClick={() => setIsCustomOpen(false)}>
          <div 
            className="bg-white dark:bg-slate-900 border rounded-lg p-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-4">
              <div className="text-sm font-medium">Select Date Range</div>
              <div className="flex gap-4">
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground">Start Date</div>
                  <Calendar
                    mode="single"
                    selected={customStart}
                    onSelect={setCustomStart}
                    className="rounded-md border pointer-events-auto"
                  />
                </div>
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground">End Date</div>
                  <Calendar
                    mode="single"
                    selected={customEnd}
                    onSelect={setCustomEnd}
                    className="rounded-md border pointer-events-auto"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setIsCustomOpen(false)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleCustomApply} disabled={!customStart || !customEnd}>
                  Apply
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

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

export function getDefaultDateRange(_dataDateRange?: { start: Date; end: Date }): DateRange {
  // Default to Today
  const range = presets[0].getRange(); // Today
  return {
    start: range.start,
    end: range.end,
    preset: 'today',
    label: 'Today',
  };
}
