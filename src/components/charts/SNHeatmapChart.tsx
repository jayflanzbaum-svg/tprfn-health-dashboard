import { memo, useMemo } from 'react';
import { SNRecord } from '@/lib/syslogParser';
import { DateRange, DatePreset } from '@/components/DateRangeFilter';

interface SNHeatmapChartProps {
  snRecords: SNRecord[];
  dateRange: DateRange;
}

type ViewMode = 'hourDay' | 'dayWeek' | 'weekMonth' | 'monthYear';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

// Get ISO week number
function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

// Determine view mode based on date range preset and duration
function getViewModeFromDateRange(dateRange: DateRange): ViewMode {
  const { preset, start, end } = dateRange;
  const durationMs = end.getTime() - start.getTime();
  const durationDays = durationMs / (1000 * 60 * 60 * 24);
  
  // Preset-based logic - hoursXday for short periods
  if (preset === 'today' || preset === 'yesterday' || preset === 'lastWeek' || preset === 'last7days') {
    return 'hourDay';
  }
  // daysXweek for month-range periods
  if (preset === 'lastMonth' || preset === 'last30days') {
    return 'dayWeek';
  }
  // weekXmonth for quarter/year periods
  if (preset === 'lastQuarter' || preset === 'lastYear' || preset === 'all') {
    return 'weekMonth';
  }
  
  // For custom ranges, use duration
  if (durationDays <= 7) {
    return 'hourDay';
  } else if (durationDays <= 31) {
    return 'dayWeek';
  } else {
    return 'weekMonth';
  }
}

// Color scale for S/N values (typically range from -20 to +10 dB)
function getHeatmapColor(value: number | null, minVal: number, maxVal: number): string {
  if (value === null) return 'hsl(var(--muted))';
  
  // Normalize to 0-1 range
  const range = maxVal - minVal;
  const normalized = range > 0 ? (value - minVal) / range : 0.5;
  
  // Color scale from red (poor) -> yellow -> green (excellent)
  if (normalized < 0.25) {
    return `hsl(0, 70%, ${45 + normalized * 40}%)`; // Red
  } else if (normalized < 0.5) {
    return `hsl(${(normalized - 0.25) * 120}, 70%, 50%)`; // Red to Yellow
  } else if (normalized < 0.75) {
    return `hsl(${30 + (normalized - 0.5) * 120}, 70%, 45%)`; // Yellow to Green
  } else {
    return `hsl(120, 70%, ${40 + (1 - normalized) * 20}%)`; // Green
  }
}

export const SNHeatmapChart = memo(function SNHeatmapChart({ snRecords, dateRange }: SNHeatmapChartProps) {
  const viewMode = useMemo(() => getViewModeFromDateRange(dateRange), [dateRange]);

  // Process data for hour x day-of-week heatmap
  const hourDayData = useMemo(() => {
    const grid: { total: number; count: number }[][] = Array.from({ length: 7 }, () =>
      Array.from({ length: 24 }, () => ({ total: 0, count: 0 }))
    );

    snRecords.forEach(record => {
      const day = record.timestamp.getUTCDay();
      const hour = record.timestamp.getUTCHours();
      grid[day][hour].total += record.snValue;
      grid[day][hour].count++;
    });

    // Calculate averages and find min/max
    let minVal = Infinity;
    let maxVal = -Infinity;
    const avgGrid: (number | null)[][] = grid.map(row =>
      row.map(cell => {
        if (cell.count === 0) return null;
        const avg = cell.total / cell.count;
        minVal = Math.min(minVal, avg);
        maxVal = Math.max(maxVal, avg);
        return avg;
      })
    );

    return { avgGrid, minVal: minVal === Infinity ? 0 : minVal, maxVal: maxVal === -Infinity ? 0 : maxVal };
  }, [snRecords]);

  // Process data for week x day-of-week heatmap (weeks as rows, days as columns)
  const dayWeekData = useMemo(() => {
    // Calculate weeks relative to the start of the date range
    const rangeStart = dateRange.start.getTime();
    const msPerDay = 1000 * 60 * 60 * 24;
    
    // Group by week-of-range (0-4) and day-of-week
    const weekDayGrid: { total: number; count: number }[][] = Array.from({ length: 5 }, () =>
      Array.from({ length: 7 }, () => ({ total: 0, count: 0 }))
    );
    
    snRecords.forEach(record => {
      const daysFromStart = Math.floor((record.timestamp.getTime() - rangeStart) / msPerDay);
      const weekOfRange = Math.min(Math.floor(daysFromStart / 7), 4); // 0-4 index (cap at week 5)
      const dayOfWeek = record.timestamp.getUTCDay(); // 0=Sun, 1=Mon, etc.
      
      if (weekOfRange >= 0) {
        weekDayGrid[weekOfRange][dayOfWeek].total += record.snValue;
        weekDayGrid[weekOfRange][dayOfWeek].count++;
      }
    });

    let minVal = Infinity;
    let maxVal = -Infinity;
    
    const grid: (number | null)[][] = weekDayGrid.map(week =>
      week.map(cell => {
        if (cell.count === 0) return null;
        const avg = cell.total / cell.count;
        minVal = Math.min(minVal, avg);
        maxVal = Math.max(maxVal, avg);
        return avg;
      })
    );

    return { grid, minVal: minVal === Infinity ? 0 : minVal, maxVal: maxVal === -Infinity ? 0 : maxVal };
  }, [snRecords, dateRange.start]);

  // Process data for week x month heatmap
  const weekMonthData = useMemo(() => {
    // Group by month and week-of-month
    const monthMap = new Map<string, { total: number; count: number }[]>();
    
    snRecords.forEach(record => {
      const year = record.timestamp.getUTCFullYear();
      const month = record.timestamp.getUTCMonth();
      const day = record.timestamp.getUTCDate();
      const weekOfMonth = Math.ceil(day / 7); // 1-5
      const key = `${year}-${month.toString().padStart(2, '0')}`;
      
      if (!monthMap.has(key)) {
        monthMap.set(key, Array.from({ length: 5 }, () => ({ total: 0, count: 0 })));
      }
      const monthData = monthMap.get(key)!;
      monthData[weekOfMonth - 1].total += record.snValue;
      monthData[weekOfMonth - 1].count++;
    });

    // Sort months and take the most recent ones
    const sortedMonths = Array.from(monthMap.keys()).sort();
    const displayMonths = sortedMonths.slice(-12); // Show last 12 months max

    let minVal = Infinity;
    let maxVal = -Infinity;
    
    const grid: { month: string; label: string; values: (number | null)[] }[] = displayMonths.map(monthKey => {
      const [year, monthNum] = monthKey.split('-');
      const monthData = monthMap.get(monthKey)!;
      const values = monthData.map(cell => {
        if (cell.count === 0) return null;
        const avg = cell.total / cell.count;
        minVal = Math.min(minVal, avg);
        maxVal = Math.max(maxVal, avg);
        return avg;
      });
      return { 
        month: monthKey, 
        label: `${MONTHS[parseInt(monthNum)]} '${year.slice(-2)}`,
        values 
      };
    });

    return { grid, minVal: minVal === Infinity ? 0 : minVal, maxVal: maxVal === -Infinity ? 0 : maxVal };
  }, [snRecords]);

  // Process data for month x year heatmap
  const monthYearData = useMemo(() => {
    const yearMap = new Map<number, { total: number; count: number }[]>();
    
    snRecords.forEach(record => {
      const year = record.timestamp.getUTCFullYear();
      const month = record.timestamp.getUTCMonth();
      
      if (!yearMap.has(year)) {
        yearMap.set(year, Array.from({ length: 12 }, () => ({ total: 0, count: 0 })));
      }
      const yearData = yearMap.get(year)!;
      yearData[month].total += record.snValue;
      yearData[month].count++;
    });

    const sortedYears = Array.from(yearMap.keys()).sort((a, b) => a - b);

    let minVal = Infinity;
    let maxVal = -Infinity;
    
    const grid: { year: number; values: (number | null)[] }[] = sortedYears.map(year => {
      const yearData = yearMap.get(year)!;
      const values = yearData.map(cell => {
        if (cell.count === 0) return null;
        const avg = cell.total / cell.count;
        minVal = Math.min(minVal, avg);
        maxVal = Math.max(maxVal, avg);
        return avg;
      });
      return { year, values };
    });

    return { grid, minVal: minVal === Infinity ? 0 : minVal, maxVal: maxVal === -Infinity ? 0 : maxVal };
  }, [snRecords]);

  const renderHourDayHeatmap = () => (
    <div className="overflow-x-auto">
      <div className="min-w-[600px]">
        {/* Header row with hours */}
        <div className="flex">
          <div className="w-12 shrink-0" /> {/* Empty corner */}
          {HOURS.map(hour => (
            <div
              key={hour}
              className="flex-1 text-center text-[10px] text-muted-foreground font-medium pb-1"
            >
              {hour.toString().padStart(2, '0')}
            </div>
          ))}
        </div>

        {/* Heatmap rows */}
        {DAYS.map((day, dayIdx) => (
          <div key={day} className="flex items-center">
            <div className="w-12 shrink-0 text-xs text-muted-foreground font-medium pr-2 text-right">
              {day}
            </div>
            {HOURS.map(hour => {
              const value = hourDayData.avgGrid[dayIdx][hour];
              const bgColor = getHeatmapColor(value, hourDayData.minVal, hourDayData.maxVal);
              return (
                <div
                  key={hour}
                  className="flex-1 aspect-square m-[1px] rounded-sm cursor-default transition-transform hover:scale-110 hover:z-10 relative group"
                  style={{ backgroundColor: bgColor }}
                  title={value !== null ? `${day} ${hour}:00 UTC: ${value.toFixed(1)} dB` : `${day} ${hour}:00 UTC: No data`}
                >
                  {/* Tooltip on hover */}
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-popover border border-border rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-20 shadow-lg">
                    {value !== null ? `${value.toFixed(1)} dB` : 'No data'}
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        {/* Legend */}
        <div className="flex items-center justify-center mt-4 gap-2">
          <span className="text-xs text-muted-foreground">Poor</span>
          <div className="flex h-3 w-32 rounded overflow-hidden">
            {Array.from({ length: 20 }, (_, i) => (
              <div
                key={i}
                className="flex-1"
                style={{ backgroundColor: getHeatmapColor(hourDayData.minVal + (i / 19) * (hourDayData.maxVal - hourDayData.minVal), hourDayData.minVal, hourDayData.maxVal) }}
              />
            ))}
          </div>
          <span className="text-xs text-muted-foreground">Excellent</span>
          <span className="text-xs text-muted-foreground ml-2">
            ({hourDayData.minVal.toFixed(1)} to {hourDayData.maxVal.toFixed(1)} dB)
          </span>
        </div>
      </div>
    </div>
  );

  const renderDayWeekHeatmap = () => {
    const DAYS_REORDERED = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const DAY_INDEX_MAP = [1, 2, 3, 4, 5, 6, 0]; // Maps display order to JS day index (Mon=1, Sun=0)
    
    return (
      <div className="overflow-x-auto">
        <div className="min-w-[400px]">
          {/* Header row with days Mon-Sun */}
          <div className="flex">
            <div className="w-16 shrink-0" />
            {DAYS_REORDERED.map(day => (
              <div
                key={day}
                className="flex-1 text-center text-[10px] text-muted-foreground font-medium pb-1"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Heatmap rows by week (Week 1-4) */}
          {['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5'].map((weekLabel, weekIdx) => (
            <div key={weekIdx} className="flex items-center">
              <div className="w-16 shrink-0 text-xs text-muted-foreground font-medium pr-2 text-right">
                {weekLabel}
              </div>
              {DAY_INDEX_MAP.map((dayIdx, displayIdx) => {
                const value = dayWeekData.grid[weekIdx]?.[dayIdx] ?? null;
                const bgColor = getHeatmapColor(value, dayWeekData.minVal, dayWeekData.maxVal);
                return (
                  <div
                    key={displayIdx}
                    className="flex-1 h-8 m-[1px] rounded-sm cursor-default transition-transform hover:scale-105 hover:z-10 relative group"
                    style={{ backgroundColor: bgColor }}
                    title={value !== null ? `${weekLabel}, ${DAYS_REORDERED[displayIdx]}: ${value.toFixed(1)} dB` : `${weekLabel}, ${DAYS_REORDERED[displayIdx]}: No data`}
                  >
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-popover border border-border rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-20 shadow-lg">
                      {value !== null ? `${value.toFixed(1)} dB` : 'No data'}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

          {/* Legend */}
          <div className="flex items-center justify-center mt-4 gap-2">
            <span className="text-xs text-muted-foreground">Poor</span>
            <div className="flex h-3 w-32 rounded overflow-hidden">
              {Array.from({ length: 20 }, (_, i) => (
                <div
                  key={i}
                  className="flex-1"
                  style={{ backgroundColor: getHeatmapColor(dayWeekData.minVal + (i / 19) * (dayWeekData.maxVal - dayWeekData.minVal), dayWeekData.minVal, dayWeekData.maxVal) }}
                />
              ))}
            </div>
            <span className="text-xs text-muted-foreground">Excellent</span>
            <span className="text-xs text-muted-foreground ml-2">
              ({dayWeekData.minVal.toFixed(1)} to {dayWeekData.maxVal.toFixed(1)} dB)
            </span>
          </div>
        </div>
      </div>
    );
  };

  const renderWeekMonthHeatmap = () => (
    <div className="overflow-x-auto">
      <div className="min-w-[500px]">
        {/* Header row with months */}
        <div className="flex">
          <div className="w-16 shrink-0" />
          {weekMonthData.grid.map((item, idx) => (
            <div
              key={idx}
              className="flex-1 text-center text-[9px] text-muted-foreground font-medium pb-1"
              style={{ minWidth: '40px' }}
            >
              {item.label}
            </div>
          ))}
        </div>

        {/* Heatmap rows by week of month */}
        {['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5'].map((weekLabel, weekIdx) => (
          <div key={weekIdx} className="flex items-center">
            <div className="w-16 shrink-0 text-xs text-muted-foreground font-medium pr-2 text-right">
              {weekLabel}
            </div>
            {weekMonthData.grid.map((monthItem, monthIdx) => {
              const value = monthItem.values[weekIdx];
              const bgColor = getHeatmapColor(value, weekMonthData.minVal, weekMonthData.maxVal);
              return (
                <div
                  key={monthIdx}
                  className="flex-1 h-8 m-[1px] rounded-sm cursor-default transition-transform hover:scale-105 hover:z-10 relative group"
                  style={{ backgroundColor: bgColor, minWidth: '40px' }}
                  title={value !== null ? `${weekLabel}, ${monthItem.label}: ${value.toFixed(1)} dB` : `${weekLabel}, ${monthItem.label}: No data`}
                >
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-popover border border-border rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-20 shadow-lg">
                    {value !== null ? `${value.toFixed(1)} dB` : 'No data'}
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        {/* Legend */}
        <div className="flex items-center justify-center mt-4 gap-2">
          <span className="text-xs text-muted-foreground">Poor</span>
          <div className="flex h-3 w-32 rounded overflow-hidden">
            {Array.from({ length: 20 }, (_, i) => (
              <div
                key={i}
                className="flex-1"
                style={{ backgroundColor: getHeatmapColor(weekMonthData.minVal + (i / 19) * (weekMonthData.maxVal - weekMonthData.minVal), weekMonthData.minVal, weekMonthData.maxVal) }}
              />
            ))}
          </div>
          <span className="text-xs text-muted-foreground">Excellent</span>
          <span className="text-xs text-muted-foreground ml-2">
            ({weekMonthData.minVal.toFixed(1)} to {weekMonthData.maxVal.toFixed(1)} dB)
          </span>
        </div>
      </div>
    </div>
  );

  const renderMonthYearHeatmap = () => (
    <div className="overflow-x-auto">
      <div className="min-w-[600px]">
        {/* Header row with months */}
        <div className="flex">
          <div className="w-16 shrink-0" />
          {MONTHS.map(month => (
            <div
              key={month}
              className="flex-1 text-center text-[10px] text-muted-foreground font-medium pb-1"
            >
              {month}
            </div>
          ))}
        </div>

        {/* Heatmap rows by year */}
        {monthYearData.grid.map(({ year, values }) => (
          <div key={year} className="flex items-center">
            <div className="w-16 shrink-0 text-xs text-muted-foreground font-medium pr-2 text-right">
              {year}
            </div>
            {MONTHS.map((month, monthIdx) => {
              const value = values[monthIdx];
              const bgColor = getHeatmapColor(value, monthYearData.minVal, monthYearData.maxVal);
              return (
                <div
                  key={monthIdx}
                  className="flex-1 h-10 m-[1px] rounded-sm cursor-default transition-transform hover:scale-105 hover:z-10 relative group"
                  style={{ backgroundColor: bgColor }}
                  title={value !== null ? `${month} ${year}: ${value.toFixed(1)} dB` : `${month} ${year}: No data`}
                >
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-popover border border-border rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-20 shadow-lg">
                    {value !== null ? `${value.toFixed(1)} dB` : 'No data'}
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        {/* Legend */}
        <div className="flex items-center justify-center mt-4 gap-2">
          <span className="text-xs text-muted-foreground">Poor</span>
          <div className="flex h-3 w-32 rounded overflow-hidden">
            {Array.from({ length: 20 }, (_, i) => (
              <div
                key={i}
                className="flex-1"
                style={{ backgroundColor: getHeatmapColor(monthYearData.minVal + (i / 19) * (monthYearData.maxVal - monthYearData.minVal), monthYearData.minVal, monthYearData.maxVal) }}
              />
            ))}
          </div>
          <span className="text-xs text-muted-foreground">Excellent</span>
          <span className="text-xs text-muted-foreground ml-2">
            ({monthYearData.minVal.toFixed(1)} to {monthYearData.maxVal.toFixed(1)} dB)
          </span>
        </div>
      </div>
    </div>
  );

  const getDescription = () => {
    switch (viewMode) {
      case 'hourDay':
        return 'Average S/N by hour of day and day of week (UTC)';
      case 'dayWeek':
        return 'Average S/N by day of week across calendar weeks';
      case 'weekMonth':
        return 'Average S/N by week of month across months';
      case 'monthYear':
        return 'Average S/N by month across years';
    }
  };

  return (
    <div className="chart-card">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-foreground">S/N Ratio Patterns</h3>
        <p className="text-sm text-muted-foreground mt-1">{getDescription()}</p>
      </div>

      <div className="flex items-center justify-center">
        {snRecords.length === 0 ? (
          <p className="text-muted-foreground text-sm">No S/N data available</p>
        ) : viewMode === 'hourDay' ? (
          renderHourDayHeatmap()
        ) : viewMode === 'dayWeek' ? (
          renderDayWeekHeatmap()
        ) : viewMode === 'weekMonth' ? (
          renderWeekMonthHeatmap()
        ) : (
          renderMonthYearHeatmap()
        )}
      </div>
    </div>
  );
});