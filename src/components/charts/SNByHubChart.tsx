import { memo, useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from 'recharts';
import { HubConnection, getSignalQuality, formatConnectionShort } from '@/lib/syslogParser';
import { useExpandableList } from '@/hooks/useExpandableList';
import { ExpandCollapseButton } from '@/components/ExpandCollapseButton';

interface SNByHubChartProps {
  hubConnections: Map<string, HubConnection>;
  dateRangeKey?: string;
}

export const SNByHubChart = memo(function SNByHubChart({ hubConnections, dateRangeKey }: SNByHubChartProps) {
  const allData = useMemo(() => {
    return Array.from(hubConnections.values())
      .filter(hub => hub.snRecords.length > 0)
      .map(hub => ({
        name: formatConnectionShort(hub.connectionId),
        fullName: hub.connectionId,
        avgSN: parseFloat(hub.avgSN.toFixed(1)),
        sessions: hub.sessionCount,
        quality: getSignalQuality(hub.avgSN),
      }))
      .sort((a, b) => b.avgSN - a.avgSN);
  }, [hubConnections]);

  const { displayItems: chartData, isExpanded, toggle, hasMore, hiddenCount, totalCount } = useExpandableList(allData, { resetKey: dateRangeKey });

  const getBarColor = (quality: string) => {
    const colors: Record<string, string> = {
      excellent: 'hsl(142, 70%, 45%)',
      good: 'hsl(142, 70%, 55%)',
      fair: 'hsl(38, 92%, 50%)',
      poor: 'hsl(25, 95%, 53%)',
      bad: 'hsl(0, 84%, 60%)',
    };
    return colors[quality] || colors.fair;
  };

  // Match Data Transfer chart sizing: ~50px per item for consistent visual height
  const chartHeight = chartData.length * 50;

  return (
    <div className="chart-card h-full flex flex-col">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Average S/N by Hub Connection</h3>
          <p className="text-sm text-muted-foreground mt-1">Signal-to-noise ratio indicates connection quality</p>
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
      <div className={`flex-1 ${isExpanded ? 'max-h-[600px] overflow-y-auto' : ''}`}>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis 
              type="number" 
              domain={['dataMin - 5', 'dataMax + 5']}
              tickFormatter={(value) => `${value} dB`}
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
              formatter={(value: number, name: string) => [
                `${value} dB`,
                name === 'avgSN' ? 'Average S/N' : name
              ]}
            />
            <ReferenceLine x={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
            <Bar dataKey="avgSN" radius={[0, 4, 4, 0]}>
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={getBarColor(entry.quality)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-4 flex flex-wrap gap-4 justify-center">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-signal-excellent" />
          <span className="text-xs text-muted-foreground">Excellent (≥10 dB)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-signal-good" />
          <span className="text-xs text-muted-foreground">Good (5-10 dB)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-signal-fair" />
          <span className="text-xs text-muted-foreground">Fair (0-5 dB)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-signal-poor" />
          <span className="text-xs text-muted-foreground">Poor (-10-0 dB)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-signal-bad" />
          <span className="text-xs text-muted-foreground">Bad (&lt;-10 dB)</span>
        </div>
      </div>
    </div>
  );
});
