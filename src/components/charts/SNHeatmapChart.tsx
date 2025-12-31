import { memo, useMemo, useState } from 'react';
import { SNRecord } from '@/lib/syslogParser';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface SNHeatmapChartProps {
  snRecords: SNRecord[];
}

type ViewMode = 'hourDay' | 'monthly';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

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

export const SNHeatmapChart = memo(function SNHeatmapChart({ snRecords }: SNHeatmapChartProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('hourDay');

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

  // Process data for monthly trends
  const monthlyData = useMemo(() => {
    const monthStats: { total: number; count: number; min: number; max: number }[] = 
      Array.from({ length: 12 }, () => ({ total: 0, count: 0, min: Infinity, max: -Infinity }));

    snRecords.forEach(record => {
      const month = record.timestamp.getUTCMonth();
      monthStats[month].total += record.snValue;
      monthStats[month].count++;
      monthStats[month].min = Math.min(monthStats[month].min, record.snValue);
      monthStats[month].max = Math.max(monthStats[month].max, record.snValue);
    });

    return monthStats.map((stat, idx) => ({
      month: MONTHS[idx],
      avg: stat.count > 0 ? stat.total / stat.count : null,
      min: stat.min === Infinity ? null : stat.min,
      max: stat.max === -Infinity ? null : stat.max,
      count: stat.count,
    }));
  }, [snRecords]);

  // Find global min/max for monthly chart
  const monthlyMinMax = useMemo(() => {
    const values = monthlyData.filter(d => d.avg !== null).flatMap(d => [d.min!, d.max!]);
    return {
      min: values.length > 0 ? Math.min(...values) : -10,
      max: values.length > 0 ? Math.max(...values) : 0,
    };
  }, [monthlyData]);

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

  const renderMonthlyChart = () => {
    const chartHeight = 200;
    const barWidth = 40;
    const gap = 8;
    const range = monthlyMinMax.max - monthlyMinMax.min || 1;
    
    const getY = (val: number) => {
      return chartHeight - ((val - monthlyMinMax.min) / range) * chartHeight;
    };

    return (
      <div className="overflow-x-auto">
        <div className="min-w-[600px]">
          <svg width="100%" height={chartHeight + 60} viewBox={`0 0 ${12 * (barWidth + gap) + 40} ${chartHeight + 60}`}>
            {/* Y-axis labels */}
            {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
              const val = monthlyMinMax.min + pct * range;
              const y = getY(val);
              return (
                <g key={pct}>
                  <line x1="35" x2={12 * (barWidth + gap) + 35} y1={y} y2={y} stroke="hsl(var(--border))" strokeDasharray="2,2" />
                  <text x="30" y={y + 4} textAnchor="end" className="fill-muted-foreground text-[10px]">
                    {val.toFixed(0)}
                  </text>
                </g>
              );
            })}

            {/* Bars */}
            {monthlyData.map((d, idx) => {
              const x = 40 + idx * (barWidth + gap);
              if (d.avg === null) {
                return (
                  <g key={idx}>
                    <rect x={x} y={chartHeight / 2 - 2} width={barWidth} height={4} fill="hsl(var(--muted))" rx={2} />
                    <text x={x + barWidth / 2} y={chartHeight + 20} textAnchor="middle" className="fill-muted-foreground text-[11px]">
                      {d.month}
                    </text>
                  </g>
                );
              }

              const avgY = getY(d.avg);
              const minY = getY(d.min!);
              const maxY = getY(d.max!);
              const barColor = getHeatmapColor(d.avg, monthlyMinMax.min, monthlyMinMax.max);

              return (
                <g key={idx} className="group cursor-default">
                  {/* Min-max range line */}
                  <line x1={x + barWidth / 2} x2={x + barWidth / 2} y1={minY} y2={maxY} stroke="hsl(var(--muted-foreground))" strokeWidth={2} />
                  <line x1={x + barWidth / 4} x2={x + (3 * barWidth) / 4} y1={minY} y2={minY} stroke="hsl(var(--muted-foreground))" strokeWidth={2} />
                  <line x1={x + barWidth / 4} x2={x + (3 * barWidth) / 4} y1={maxY} y2={maxY} stroke="hsl(var(--muted-foreground))" strokeWidth={2} />

                  {/* Average bar */}
                  <rect
                    x={x}
                    y={avgY - 8}
                    width={barWidth}
                    height={16}
                    fill={barColor}
                    rx={4}
                    className="transition-all group-hover:opacity-80"
                  />

                  {/* Value label */}
                  <text x={x + barWidth / 2} y={avgY + 4} textAnchor="middle" className="fill-white text-[10px] font-medium pointer-events-none">
                    {d.avg.toFixed(1)}
                  </text>

                  {/* Month label */}
                  <text x={x + barWidth / 2} y={chartHeight + 20} textAnchor="middle" className="fill-muted-foreground text-[11px]">
                    {d.month}
                  </text>

                  {/* Count label */}
                  <text x={x + barWidth / 2} y={chartHeight + 35} textAnchor="middle" className="fill-muted-foreground/60 text-[9px]">
                    n={d.count}
                  </text>

                  {/* Hover tooltip */}
                  <title>{`${d.month}: Avg ${d.avg.toFixed(1)} dB (Min: ${d.min?.toFixed(1)}, Max: ${d.max?.toFixed(1)}, n=${d.count})`}</title>
                </g>
              );
            })}
          </svg>

          {/* Legend */}
          <div className="flex items-center justify-center mt-2 gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded" style={{ backgroundColor: getHeatmapColor(monthlyMinMax.max, monthlyMinMax.min, monthlyMinMax.max) }} />
              <span>Average S/N</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-0.5 bg-muted-foreground" />
              <span>Min/Max range</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="chart-card">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h3 className="text-lg font-semibold text-foreground">S/N Ratio Patterns</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {viewMode === 'hourDay'
              ? 'Average signal quality by hour of day and day of week (UTC)'
              : 'Monthly signal quality trends with min/max range'}
          </p>
        </div>
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="hourDay" className="text-xs">Hour × Day</TabsTrigger>
            <TabsTrigger value="monthly" className="text-xs">Monthly</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="h-[300px] flex items-center justify-center">
        {snRecords.length === 0 ? (
          <p className="text-muted-foreground text-sm">No S/N data available</p>
        ) : viewMode === 'hourDay' ? (
          renderHourDayHeatmap()
        ) : (
          renderMonthlyChart()
        )}
      </div>
    </div>
  );
});
