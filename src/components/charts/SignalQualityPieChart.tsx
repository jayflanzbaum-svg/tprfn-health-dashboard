import { memo, useMemo } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from 'recharts';
import { SNRecord, getSignalQuality } from '@/lib/syslogParser';

interface SignalQualityPieChartProps {
  snRecords: SNRecord[];
}

const QUALITY_COLORS = {
  excellent: 'hsl(142, 70%, 45%)',
  good: 'hsl(142, 70%, 55%)',
  fair: 'hsl(38, 92%, 50%)',
  poor: 'hsl(25, 95%, 53%)',
  bad: 'hsl(0, 84%, 60%)',
};

const QUALITY_RANGES = {
  Excellent: '≥ 10 dB',
  Good: '5 to 10 dB',
  Fair: '0 to 5 dB',
  Poor: '-10 to 0 dB',
  Bad: '< -10 dB',
};

export const SignalQualityPieChart = memo(function SignalQualityPieChart({ snRecords }: SignalQualityPieChartProps) {
  const { chartData, isAggregated } = useMemo(() => {
    // Check if we're in aggregated mode (synthetic records with station="AGGREGATE")
    const realRecords = snRecords.filter(r => r.station !== 'AGGREGATE');
    const isAggregated = realRecords.length === 0 && snRecords.length > 0;

    // Use real records if available, otherwise use the synthetic ones
    const recordsToUse = realRecords.length > 0 ? realRecords : snRecords;

    const qualityCounts: Record<string, number> = {
      excellent: 0,
      good: 0,
      fair: 0,
      poor: 0,
      bad: 0,
    };

    recordsToUse.forEach(record => {
      const quality = getSignalQuality(record.snValue);
      qualityCounts[quality]++;
    });

    return {
      chartData: Object.entries(qualityCounts)
        .filter(([, count]) => count > 0)
        .map(([name, value]) => ({
          name: name.charAt(0).toUpperCase() + name.slice(1),
          value,
          color: QUALITY_COLORS[name as keyof typeof QUALITY_COLORS],
        })),
      isAggregated,
    };
  }, [snRecords]);

  const totalRecords = snRecords.filter(r => r.station !== 'AGGREGATE').length || snRecords.length;

  return (
    <div className="chart-card h-full">
      <div className="mb-2">
        <h3 className="text-lg font-semibold text-foreground">Signal Quality Distribution</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          {isAggregated 
            ? `Aggregated S/N data (${snRecords.length} hourly averages)`
            : 'S/N readings by quality level'
          }
        </p>
      </div>
      <div className="h-[200px] flex items-center justify-center">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
            <Pie
              data={chartData}
              cx="50%"
              cy="45%"
              innerRadius={35}
              outerRadius={55}
              paddingAngle={2}
              dataKey="value"
              label={({ cx, cy, midAngle, outerRadius, percent }) => {
                const RADIAN = Math.PI / 180;
                const radius = outerRadius + 18;
                const x = cx + radius * Math.cos(-midAngle * RADIAN);
                const y = cy + radius * Math.sin(-midAngle * RADIAN);
                return (
                  <text
                    x={x}
                    y={y}
                    fill="hsl(var(--foreground))"
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={11}
                  >
                    {`${(percent * 100).toFixed(0)}%`}
                  </text>
                );
              }}
              labelLine={false}
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                boxShadow: 'var(--shadow-lg)',
              }}
              formatter={(value: number, name: string) => [
                `${value} readings (${((value / totalRecords) * 100).toFixed(1)}%) — S/N: ${QUALITY_RANGES[name as keyof typeof QUALITY_RANGES]}`,
                name
              ]}
            />
            <Legend 
              verticalAlign="bottom"
              wrapperStyle={{ fontSize: '11px' }}
              formatter={(value) => <span className="text-xs text-foreground">{value}</span>}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
});
