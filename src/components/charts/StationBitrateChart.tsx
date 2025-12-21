import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { HubConnection, formatCallsign } from '@/lib/syslogParser';

interface StationBitrateChartProps {
  hubConnections: Map<string, HubConnection>;
}

export function StationBitrateChart({ hubConnections }: StationBitrateChartProps) {
  const stationData = useMemo(() => {
    const stationStats = new Map<string, {
      avgTxBps: number[];
      avgRxBps: number[];
      maxTxBps: number;
      maxRxBps: number;
      sessionCount: number;
    }>();

    hubConnections.forEach((hub) => {
      if (hub.disconnectRecords.length === 0) return;

      // Process each station in the connection
      [hub.station1, hub.station2].forEach((station) => {
        if (!stationStats.has(station)) {
          stationStats.set(station, {
            avgTxBps: [],
            avgRxBps: [],
            maxTxBps: 0,
            maxRxBps: 0,
            sessionCount: 0,
          });
        }

        const stats = stationStats.get(station)!;
        hub.disconnectRecords.forEach((r) => {
          if (r.maxTxBps > 0) stats.avgTxBps.push(r.maxTxBps);
          if (r.maxRxBps > 0) stats.avgRxBps.push(r.maxRxBps);
          stats.maxTxBps = Math.max(stats.maxTxBps, r.maxTxBps);
          stats.maxRxBps = Math.max(stats.maxRxBps, r.maxRxBps);
          stats.sessionCount++;
        });
      });
    });

    const result = Array.from(stationStats.entries()).map(([station, stats]) => ({
      station: formatCallsign(station),
      avgTx: stats.avgTxBps.length > 0 
        ? Math.round(stats.avgTxBps.reduce((a, b) => a + b, 0) / stats.avgTxBps.length)
        : 0,
      avgRx: stats.avgRxBps.length > 0 
        ? Math.round(stats.avgRxBps.reduce((a, b) => a + b, 0) / stats.avgRxBps.length)
        : 0,
      maxTx: stats.maxTxBps,
      maxRx: stats.maxRxBps,
      sessions: stats.sessionCount,
    }));

    // Sort by combined average bitrate
    result.sort((a, b) => (b.avgTx + b.avgRx) - (a.avgTx + a.avgRx));

    return result.slice(0, 12);
  }, [hubConnections]);

  const formatBps = (value: number) => {
    if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
    return `${value}`;
  };

  return (
    <div className="chart-card h-full flex flex-col">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-foreground">Bitrate by Station</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Average and peak bitrates achieved by each station
        </p>
      </div>

      <div className="flex-1 min-h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={stationData}
            margin={{ left: 10, right: 20, top: 5, bottom: 60 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
            <XAxis 
              dataKey="station" 
              tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
              angle={-45}
              textAnchor="end"
              height={60}
            />
            <YAxis 
              tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
              tickFormatter={formatBps}
              label={{ value: 'bps', angle: -90, position: 'insideLeft', fontSize: 10 }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                fontSize: '11px',
              }}
              formatter={(value: number, name: string) => [
                `${value.toLocaleString()} bps`,
                name === 'avgTx' ? 'Avg TX' : name === 'avgRx' ? 'Avg RX' : name === 'maxTx' ? 'Peak TX' : 'Peak RX'
              ]}
              labelFormatter={(label) => `Station: ${label}`}
            />
            <Legend 
              wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }}
              formatter={(value) => {
                const labels: Record<string, string> = {
                  avgTx: 'Avg TX',
                  avgRx: 'Avg RX',
                  maxTx: 'Peak TX',
                  maxRx: 'Peak RX',
                };
                return labels[value] || value;
              }}
            />
            <Bar dataKey="avgTx" fill="hsl(var(--chart-primary))" radius={[4, 4, 0, 0]} />
            <Bar dataKey="avgRx" fill="hsl(var(--chart-secondary))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
