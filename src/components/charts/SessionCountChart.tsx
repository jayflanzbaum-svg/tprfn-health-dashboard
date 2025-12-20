import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { HubConnection } from '@/lib/syslogParser';

interface SessionCountChartProps {
  hubConnections: Map<string, HubConnection>;
}

export function SessionCountChart({ hubConnections }: SessionCountChartProps) {
  const chartData = useMemo(() => {
    return Array.from(hubConnections.values())
      .filter(hub => hub.sessionCount > 0)
      .map(hub => ({
        name: hub.connectionId,
        sessions: hub.sessionCount,
      }))
      .sort((a, b) => b.sessions - a.sessions);
  }, [hubConnections]);

  return (
    <div className="chart-card">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-foreground">Session Count by Hub Connection</h3>
        <p className="text-sm text-muted-foreground mt-1">Total VARAHF Disconnected sessions per connection pair</p>
      </div>
      <div className="h-[400px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis 
              type="number"
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
            />
            <YAxis 
              type="category" 
              dataKey="name" 
              width={90}
              tick={{ fill: 'hsl(var(--foreground))', fontSize: 11, fontFamily: 'JetBrains Mono' }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                boxShadow: 'var(--shadow-lg)',
              }}
              labelStyle={{ color: 'hsl(var(--foreground))', fontWeight: 600 }}
              formatter={(value: number) => [`${value} sessions`, 'Total Sessions']}
            />
            <Bar 
              dataKey="sessions" 
              fill="hsl(var(--chart-secondary))" 
              radius={[0, 4, 4, 0]} 
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
