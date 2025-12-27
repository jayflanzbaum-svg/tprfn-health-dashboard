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
import { useExpandableList } from '@/hooks/useExpandableList';
import { ExpandCollapseButton } from '@/components/ExpandCollapseButton';

interface SessionCountChartProps {
  hubConnections: Map<string, HubConnection>;
  dateRangeKey?: string;
}

export function SessionCountChart({ hubConnections, dateRangeKey }: SessionCountChartProps) {
  const allData = useMemo(() => {
    return Array.from(hubConnections.values())
      .filter(hub => hub.sessionCount > 0)
      .map(hub => ({
        name: hub.connectionId,
        sessions: hub.sessionCount,
      }))
      .sort((a, b) => b.sessions - a.sessions);
  }, [hubConnections]);

  const { displayItems: chartData, isExpanded, toggle, hasMore, hiddenCount, totalCount } = useExpandableList(allData, { resetKey: dateRangeKey });
  const chartHeight = isExpanded ? Math.max(400, chartData.length * 35) : 400;

  return (
    <div className="chart-card">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Session Count by Hub Connection</h3>
          <p className="text-sm text-muted-foreground mt-1">Total VARAHF Disconnected sessions per connection pair</p>
        </div>
        {hasMore && (
          <ExpandCollapseButton 
            isExpanded={isExpanded} 
            onToggle={toggle} 
            hiddenCount={hiddenCount}
            totalCount={totalCount}
          />
        )}
      </div>
      <div className={isExpanded ? 'max-h-[600px] overflow-y-auto' : ''} style={{ height: chartHeight }}>
        <ResponsiveContainer width="100%" height={chartHeight}>
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
