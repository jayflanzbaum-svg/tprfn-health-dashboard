import { useMemo } from 'react';
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

interface SNTimelineChartProps {
  snRecords: SNRecord[];
}

export function SNTimelineChart({ snRecords }: SNTimelineChartProps) {
  const chartData = useMemo(() => {
    // Group by hour
    const hourlyData = new Map<string, { total: number; count: number; min: number; max: number }>();
    
    snRecords.forEach(record => {
      const hour = new Date(record.timestamp);
      hour.setMinutes(0, 0, 0);
      const key = hour.toISOString();
      
      if (!hourlyData.has(key)) {
        hourlyData.set(key, { total: 0, count: 0, min: Infinity, max: -Infinity });
      }
      
      const data = hourlyData.get(key)!;
      data.total += record.snValue;
      data.count++;
      data.min = Math.min(data.min, record.snValue);
      data.max = Math.max(data.max, record.snValue);
    });
    
    return Array.from(hourlyData.entries())
      .map(([hour, data]) => ({
        hour: new Date(hour),
        avg: parseFloat((data.total / data.count).toFixed(1)),
        min: data.min === Infinity ? 0 : data.min,
        max: data.max === -Infinity ? 0 : data.max,
        count: data.count,
      }))
      .sort((a, b) => a.hour.getTime() - b.hour.getTime());
  }, [snRecords]);

  const formatHour = (date: Date) => {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  return (
    <div className="chart-card">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-foreground">S/N Ratio Over Time</h3>
        <p className="text-sm text-muted-foreground mt-1">Hourly average signal-to-noise across all connections</p>
      </div>
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis 
              dataKey="hour"
              tickFormatter={formatHour}
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
              labelFormatter={(label) => formatHour(label as Date)}
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
}
