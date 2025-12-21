import { useMemo } from 'react';
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

export function SignalQualityPieChart({ snRecords }: SignalQualityPieChartProps) {
  const chartData = useMemo(() => {
    const qualityCounts: Record<string, number> = {
      excellent: 0,
      good: 0,
      fair: 0,
      poor: 0,
      bad: 0,
    };

    snRecords.forEach(record => {
      const quality = getSignalQuality(record.snValue);
      qualityCounts[quality]++;
    });

    return Object.entries(qualityCounts)
      .filter(([, count]) => count > 0)
      .map(([name, value]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        value,
        color: QUALITY_COLORS[name as keyof typeof QUALITY_COLORS],
      }));
  }, [snRecords]);

  const totalRecords = snRecords.length;

  return (
    <div className="chart-card">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-foreground">Signal Quality Distribution</h3>
        <p className="text-sm text-muted-foreground mt-1">Breakdown of S/N readings by quality level</p>
      </div>
      <div className="h-[300px] flex items-center justify-center">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={100}
              paddingAngle={2}
              dataKey="value"
              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
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
              formatter={(value) => <span className="text-sm text-foreground">{value}</span>}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
