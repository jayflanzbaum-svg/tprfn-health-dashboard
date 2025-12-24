import { memo, useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from 'recharts';
import { HubConnection, formatConnectionShort } from '@/lib/syslogParser';

interface DisconnectAnalysisChartProps {
  hubConnections: Map<string, HubConnection>;
}

const DISCONNECT_COLORS = {
  normal: 'hsl(142, 70%, 45%)',    // Green - healthy
  timeout: 'hsl(38, 92%, 50%)',    // Orange - warning
  command: 'hsl(199, 89%, 48%)',   // Blue - manual
};

export const DisconnectAnalysisChart = memo(function DisconnectAnalysisChart({ hubConnections }: DisconnectAnalysisChartProps) {
  const chartData = useMemo(() => {
    const data: {
      name: string;
      connectionId: string;
      normal: number;
      timeout: number;
      command: number;
      total: number;
      healthScore: number;
    }[] = [];

    hubConnections.forEach((hub) => {
      const normal = hub.disconnectRecords.filter(r => r.disconnectType === 'normal').length;
      const timeout = hub.disconnectRecords.filter(r => r.disconnectType === 'timeout').length;
      const command = hub.disconnectRecords.filter(r => r.disconnectType === 'command').length;
      const total = hub.disconnectRecords.length;

      if (total > 0) {
        // Health score: % of normal disconnects (higher is better)
        const healthScore = total > 0 ? Math.round((normal / total) * 100) : 0;
        
        data.push({
          name: formatConnectionShort(hub.connectionId),
          connectionId: hub.connectionId,
          normal,
          timeout,
          command,
          total,
          healthScore,
        });
      }
    });

    // Sort by total disconnects descending, take top 10
    return data.sort((a, b) => b.total - a.total).slice(0, 10);
  }, [hubConnections]);

  // Overall stats
  const overallStats = useMemo(() => {
    let totalNormal = 0;
    let totalTimeout = 0;
    let totalCommand = 0;

    hubConnections.forEach((hub) => {
      totalNormal += hub.disconnectRecords.filter(r => r.disconnectType === 'normal').length;
      totalTimeout += hub.disconnectRecords.filter(r => r.disconnectType === 'timeout').length;
      totalCommand += hub.disconnectRecords.filter(r => r.disconnectType === 'command').length;
    });

    const total = totalNormal + totalTimeout + totalCommand;
    return {
      normal: totalNormal,
      timeout: totalTimeout,
      command: totalCommand,
      total,
      healthPercent: total > 0 ? Math.round((totalNormal / total) * 100) : 0,
    };
  }, [hubConnections]);

  return (
    <div className="chart-card">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Disconnect Analysis by Connection</h3>
            <p className="text-sm text-muted-foreground mt-1">RF connection health indicator - breakdown by disconnect reason</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-foreground">{overallStats.healthPercent}%</div>
            <div className="text-xs text-muted-foreground">Overall Health</div>
          </div>
        </div>
        
        {/* Summary stats */}
        <div className="flex gap-4 mt-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: DISCONNECT_COLORS.normal }}></div>
            <span className="text-muted-foreground">Normal: <span className="font-mono font-medium text-foreground">{overallStats.normal}</span></span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: DISCONNECT_COLORS.timeout }}></div>
            <span className="text-muted-foreground">Timeout: <span className="font-mono font-medium text-foreground">{overallStats.timeout}</span></span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: DISCONNECT_COLORS.command }}></div>
            <span className="text-muted-foreground">Manual: <span className="font-mono font-medium text-foreground">{overallStats.command}</span></span>
          </div>
        </div>
      </div>

      <div className="h-[350px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={true} vertical={false} />
            <XAxis 
              type="number"
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
            />
            <YAxis 
              type="category"
              dataKey="name"
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
              width={95}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                boxShadow: 'var(--shadow-lg)',
              }}
              formatter={(value: number, name: string) => {
                const label = name === 'normal' ? 'Normal' : name === 'timeout' ? 'Timeout' : 'Manual';
                return [value, label];
              }}
              labelFormatter={(label) => `Connection: ${label}`}
            />
            <Legend 
              formatter={(value) => value === 'normal' ? 'Normal (Healthy)' : value === 'timeout' ? 'Timeout (Poor Signal)' : 'Manual'}
            />
            <Bar dataKey="normal" stackId="a" fill={DISCONNECT_COLORS.normal} name="normal" />
            <Bar dataKey="timeout" stackId="a" fill={DISCONNECT_COLORS.timeout} name="timeout" />
            <Bar dataKey="command" stackId="a" fill={DISCONNECT_COLORS.command} name="command" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
});
