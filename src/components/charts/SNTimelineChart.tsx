import { memo, useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { SNRecord } from '@/lib/syslogParser';
import { DateRange } from '@/components/DateRangeFilter';
import { format, differenceInDays, differenceInMonths, differenceInYears, startOfHour, startOfDay, startOfWeek, startOfMonth, startOfYear } from 'date-fns';

interface SNTimelineChartProps {
  snRecords: SNRecord[];
  dateRange?: DateRange | null;
}

type Granularity = 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly';

function getGranularity(dateRange?: DateRange | null): Granularity {
  if (!dateRange) return 'hourly';
  
  const { preset, start, end } = dateRange;
  
  // Based on preset
  if (preset === 'today' || preset === 'yesterday') {
    return 'hourly';
  }
  if (preset === 'last7days' || preset === 'lastWeek') {
    return 'daily';
  }
  if (preset === 'lastMonth' || preset === 'last30days') {
    return 'weekly';
  }
  if (preset === 'lastQuarter') {
    return 'monthly';
  }
  if (preset === 'lastYear') {
    return 'monthly';
  }
  
  // For custom or all, calculate based on duration
  const days = differenceInDays(end, start);
  const months = differenceInMonths(end, start);
  const years = differenceInYears(end, start);
  
  if (days <= 1) return 'hourly';
  if (days <= 7) return 'daily';
  if (months <= 1) return 'weekly';
  if (years < 2) return 'monthly';
  return 'yearly';
}

function getGroupKey(timestamp: Date, granularity: Granularity): string {
  switch (granularity) {
    case 'hourly':
      return startOfHour(timestamp).toISOString();
    case 'daily':
      return startOfDay(timestamp).toISOString();
    case 'weekly':
      return startOfWeek(timestamp).toISOString();
    case 'monthly':
      return startOfMonth(timestamp).toISOString();
    case 'yearly':
      return startOfYear(timestamp).toISOString();
  }
}

function formatLabel(date: Date, granularity: Granularity): string {
  switch (granularity) {
    case 'hourly':
      return format(date, 'HH:mm');
    case 'daily':
      return format(date, 'MMM d');
    case 'weekly':
      return format(date, 'MMM d');
    case 'monthly':
      return format(date, 'MMM yyyy');
    case 'yearly':
      return format(date, 'yyyy');
  }
}

function getSubtitle(granularity: Granularity): string {
  switch (granularity) {
    case 'hourly':
      return 'Hourly average signal-to-noise across all connections';
    case 'daily':
      return 'Daily average signal-to-noise across all connections';
    case 'weekly':
      return 'Weekly average signal-to-noise across all connections';
    case 'monthly':
      return 'Monthly average signal-to-noise across all connections';
    case 'yearly':
      return 'Yearly average signal-to-noise across all connections';
  }
}

export const SNTimelineChart = memo(function SNTimelineChart({ snRecords, dateRange }: SNTimelineChartProps) {
  const granularity = getGranularity(dateRange);
  
  const chartData = useMemo(() => {
    const groupedData = new Map<string, { total: number; count: number; min: number; max: number }>();
    
    snRecords.forEach(record => {
      const key = getGroupKey(record.timestamp, granularity);
      
      if (!groupedData.has(key)) {
        groupedData.set(key, { total: 0, count: 0, min: Infinity, max: -Infinity });
      }
      
      const data = groupedData.get(key)!;
      data.total += record.snValue;
      data.count++;
      data.min = Math.min(data.min, record.snValue);
      data.max = Math.max(data.max, record.snValue);
    });
    
    return Array.from(groupedData.entries())
      .map(([key, data]) => ({
        date: new Date(key),
        avg: parseFloat((data.total / data.count).toFixed(1)),
        min: data.min === Infinity ? 0 : data.min,
        max: data.max === -Infinity ? 0 : data.max,
        count: data.count,
      }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [snRecords, granularity]);

  const formatTick = (date: Date) => {
    return formatLabel(date, granularity);
  };

  return (
    <div className="chart-card">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-foreground">S/N Ratio Over Time</h3>
        <p className="text-sm text-muted-foreground mt-1">{getSubtitle(granularity)}</p>
      </div>
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis 
              dataKey="date"
              tickFormatter={formatTick}
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
            />
            <YAxis 
              tickFormatter={(value) => `${value} dB`}
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                boxShadow: 'var(--shadow-lg)',
              }}
              labelFormatter={(label) => formatTick(label as Date)}
              formatter={(value: number, name: string) => [
                `${value} dB`,
                name === 'avg' ? 'Average' : name === 'min' ? 'Min' : 'Max'
              ]}
            />
            <Legend 
              wrapperStyle={{ paddingTop: '10px' }}
              formatter={(value) => value === 'avg' ? 'Average' : value === 'min' ? 'Minimum' : 'Maximum'}
            />
            <Line 
              type="monotone" 
              dataKey="avg" 
              stroke="hsl(var(--chart-info))" 
              strokeWidth={2}
              dot={{ fill: 'hsl(var(--chart-info))', strokeWidth: 0, r: 3 }}
              activeDot={{ r: 5 }}
            />
            <Line 
              type="monotone" 
              dataKey="max" 
              stroke="hsl(var(--chart-success))" 
              strokeWidth={2}
              dot={false}
            />
            <Line 
              type="monotone" 
              dataKey="min" 
              stroke="hsl(var(--chart-danger))" 
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
});
