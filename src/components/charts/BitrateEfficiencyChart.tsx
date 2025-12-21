import { useMemo } from 'react';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ZAxis,
} from 'recharts';
import { HubConnection, formatConnectionShort, formatBytes, formatDuration } from '@/lib/syslogParser';

interface BitrateEfficiencyChartProps {
  hubConnections: Map<string, HubConnection>;
}

export function BitrateEfficiencyChart({ hubConnections }: BitrateEfficiencyChartProps) {
  const { efficiencyData, stats } = useMemo(() => {
    const data: {
      maxBitrate: number;
      actualThroughput: number;
      efficiency: number;
      connection: string;
      sessionDuration: number;
      totalBytes: number;
    }[] = [];

    let totalEfficiency = 0;
    let count = 0;

    hubConnections.forEach((hub) => {
      hub.disconnectRecords.forEach((record) => {
        const maxBitrate = Math.max(record.maxTxBps, record.maxRxBps);
        const totalBytes = record.txBytes + record.rxBytes;
        
        if (maxBitrate > 0 && record.sessionSeconds > 0) {
          // Calculate actual throughput in bps
          const actualThroughput = (totalBytes * 8) / record.sessionSeconds;
          // Efficiency = actual throughput / max bitrate capability
          const efficiency = Math.min((actualThroughput / maxBitrate) * 100, 100);

          data.push({
            maxBitrate,
            actualThroughput: Math.round(actualThroughput),
            efficiency: parseFloat(efficiency.toFixed(1)),
            connection: formatConnectionShort(hub.connectionId),
            sessionDuration: record.sessionSeconds,
            totalBytes,
          });

          totalEfficiency += efficiency;
          count++;
        }
      });
    });

    const avgEfficiency = count > 0 ? totalEfficiency / count : 0;

    // Calculate efficiency distribution
    const distribution = {
      high: data.filter(d => d.efficiency >= 50).length,
      medium: data.filter(d => d.efficiency >= 20 && d.efficiency < 50).length,
      low: data.filter(d => d.efficiency < 20).length,
    };

    return {
      efficiencyData: data,
      stats: {
        avgEfficiency: parseFloat(avgEfficiency.toFixed(1)),
        totalSessions: count,
        distribution,
      },
    };
  }, [hubConnections]);

  const formatBps = (value: number) => {
    if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
    return `${value}`;
  };

  return (
    <div className="chart-card">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-foreground">Bitrate Efficiency</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Actual throughput vs max bitrate capability • Avg efficiency: {stats.avgEfficiency}%
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Scatter plot */}
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-2">Max Bitrate vs Actual Throughput</h4>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ left: 0, right: 20, top: 5, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                <XAxis 
                  type="number" 
                  dataKey="maxBitrate" 
                  name="Max Bitrate"
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  tickFormatter={formatBps}
                  label={{ value: 'Max Bitrate (bps)', position: 'insideBottom', offset: -10, fontSize: 10 }}
                />
                <YAxis 
                  type="number" 
                  dataKey="actualThroughput" 
                  name="Actual Throughput"
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  tickFormatter={formatBps}
                  label={{ value: 'Actual (bps)', angle: -90, position: 'insideLeft', fontSize: 10 }}
                />
                <ZAxis type="number" dataKey="efficiency" range={[30, 100]} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '11px',
                  }}
                  formatter={(value: number, name: string) => {
                    if (name === 'Max Bitrate' || name === 'Actual Throughput') {
                      return [`${value.toLocaleString()} bps`, name];
                    }
                    return [`${value}%`, name];
                  }}
                  labelFormatter={(_, payload) => {
                    if (payload?.[0]?.payload) {
                      const d = payload[0].payload;
                      return `${d.connection} • ${formatDuration(d.sessionDuration)} • ${formatBytes(d.totalBytes)}`;
                    }
                    return '';
                  }}
                />
                <Scatter 
                  data={efficiencyData} 
                  fill="hsl(var(--chart-success))"
                  fillOpacity={0.6}
                />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Efficiency distribution */}
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-2">Efficiency Distribution</h4>
          <div className="space-y-4 pt-4">
            {/* High efficiency */}
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-muted-foreground">High (≥50%)</span>
                <span className="font-medium text-chart-success">{stats.distribution.high} sessions</span>
              </div>
              <div className="h-3 bg-muted/50 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-chart-success rounded-full transition-all"
                  style={{ width: `${stats.totalSessions > 0 ? (stats.distribution.high / stats.totalSessions) * 100 : 0}%` }}
                />
              </div>
            </div>

            {/* Medium efficiency */}
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-muted-foreground">Medium (20-50%)</span>
                <span className="font-medium text-chart-warning">{stats.distribution.medium} sessions</span>
              </div>
              <div className="h-3 bg-muted/50 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-chart-warning rounded-full transition-all"
                  style={{ width: `${stats.totalSessions > 0 ? (stats.distribution.medium / stats.totalSessions) * 100 : 0}%` }}
                />
              </div>
            </div>

            {/* Low efficiency */}
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-muted-foreground">Low (&lt;20%)</span>
                <span className="font-medium text-chart-danger">{stats.distribution.low} sessions</span>
              </div>
              <div className="h-3 bg-muted/50 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-chart-danger rounded-full transition-all"
                  style={{ width: `${stats.totalSessions > 0 ? (stats.distribution.low / stats.totalSessions) * 100 : 0}%` }}
                />
              </div>
            </div>

            {/* Summary */}
            <div className="pt-4 border-t border-border">
              <div className="grid grid-cols-2 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold text-foreground">{stats.avgEfficiency}%</div>
                  <div className="text-xs text-muted-foreground">Avg Efficiency</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-foreground">{stats.totalSessions}</div>
                  <div className="text-xs text-muted-foreground">Sessions Analyzed</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
