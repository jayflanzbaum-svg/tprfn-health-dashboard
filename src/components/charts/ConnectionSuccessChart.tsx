import { useMemo } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from 'recharts';
import { HubConnection } from '@/lib/syslogParser';

interface ConnectionSuccessChartProps {
  hubConnections: Map<string, HubConnection>;
}

const STATUS_COLORS = {
  success: 'hsl(142, 70%, 45%)',
  failed: 'hsl(0, 84%, 60%)',
};

export function ConnectionSuccessChart({ hubConnections }: ConnectionSuccessChartProps) {
  const { chartData, stats } = useMemo(() => {
    let totalSuccess = 0;
    let totalFailed = 0;

    hubConnections.forEach((hub) => {
      totalSuccess += hub.disconnectRecords.filter(r => r.disconnectType === 'normal').length;
      totalFailed += hub.disconnectRecords.filter(r => r.disconnectType === 'timeout').length;
    });

    const total = totalSuccess + totalFailed;
    const successRate = total > 0 ? ((totalSuccess / total) * 100).toFixed(1) : '0';

    return {
      chartData: [
        { name: 'Success', value: totalSuccess, color: STATUS_COLORS.success },
        { name: 'Failed', value: totalFailed, color: STATUS_COLORS.failed },
      ].filter(d => d.value > 0),
      stats: {
        success: totalSuccess,
        failed: totalFailed,
        total,
        successRate,
      },
    };
  }, [hubConnections]);

  return (
    <div className="chart-card h-full">
      <div className="mb-2">
        <h3 className="text-lg font-semibold text-foreground">Connection Success Rate</h3>
        <p className="text-xs text-muted-foreground mt-0.5">Sessions completed vs failed</p>
      </div>
      <div className="h-[180px] flex items-center justify-center">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={40}
              outerRadius={65}
              paddingAngle={2}
              dataKey="value"
              label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
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
                `${value} sessions (${((value / stats.total) * 100).toFixed(1)}%)`,
                name
              ]}
            />
            <Legend 
              verticalAlign="bottom"
              wrapperStyle={{ fontSize: '11px' }}
              formatter={(value) => (
                <span className="text-xs text-foreground">
                  {value === 'Success' ? 'Completed' : 'Failed'}
                </span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
