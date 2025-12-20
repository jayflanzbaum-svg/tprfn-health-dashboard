import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { HubConnection, formatBytes, formatConnectionShort } from '@/lib/syslogParser';

interface TXByHubChartProps {
  hubConnections: Map<string, HubConnection>;
}

export function TXByHubChart({ hubConnections }: TXByHubChartProps) {
  const chartData = useMemo(() => {
    return Array.from(hubConnections.values())
      .filter(hub => hub.disconnectRecords.length > 0)
      .map(hub => ({
        name: formatConnectionShort(hub.connectionId),
        fullName: hub.connectionId,
        txBytes: hub.totalTxBytes,
        rxBytes: hub.totalRxBytes,
        sessions: hub.sessionCount,
      }))
      .sort((a, b) => (b.txBytes + b.rxBytes) - (a.txBytes + a.rxBytes));
  }, [hubConnections]);

  return (
    <div className="chart-card">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-foreground">Total TX/RX by Hub Connection</h3>
        <p className="text-sm text-muted-foreground mt-1">Data transfer volume from VARAHF Disconnected events</p>
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
              tickFormatter={(value) => formatBytes(value)}
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
                formatBytes(value),
                name === 'txBytes' ? 'TX Bytes' : 'RX Bytes'
              ]}
            />
            <Legend 
              wrapperStyle={{ paddingTop: '20px' }}
              formatter={(value) => value === 'txBytes' ? 'TX Bytes' : 'RX Bytes'}
            />
            <Bar dataKey="txBytes" fill="hsl(var(--chart-primary))" radius={[0, 4, 4, 0]} name="txBytes" />
            <Bar dataKey="rxBytes" fill="hsl(var(--chart-info))" radius={[0, 4, 4, 0]} name="rxBytes" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
