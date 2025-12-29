import { memo, useMemo, useEffect } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  ZAxis,
} from 'recharts';
import { HubConnection, formatConnectionShort } from '@/lib/syslogParser';
import { useExpandableList } from '@/hooks/useExpandableList';
import { ExpandCollapseButton } from '@/components/ExpandCollapseButton';
import { useStationLocations } from '@/hooks/useStationLocations';

interface BitrateAnalysisChartProps {
  hubConnections: Map<string, HubConnection>;
  dateRangeKey?: string;
}

export const BitrateAnalysisChart = memo(function BitrateAnalysisChart({ hubConnections, dateRangeKey }: BitrateAnalysisChartProps) {
  const { distances, lookupCallsigns } = useStationLocations();

  // Get unique callsigns from hub connections
  const callsigns = useMemo(() => {
    const set = new Set<string>();
    hubConnections.forEach(hub => {
      set.add(hub.station1);
      set.add(hub.station2);
    });
    return Array.from(set);
  }, [hubConnections]);

  // Fetch locations for callsigns on mount
  useEffect(() => {
    if (callsigns.length > 0) {
      lookupCallsigns(callsigns);
    }
  }, [callsigns.join(',')]);

  const { connectionData, scatterData, stats } = useMemo(() => {
    const connectionStats: {
      name: string;
      avgTxBps: number;
      avgRxBps: number;
      maxTxBps: number;
      maxRxBps: number;
      sessionCount: number;
      distance?: number;
    }[] = [];

    const snBitrateCorrelation: {
      sn: number;
      bitrate: number;
      connection: string;
    }[] = [];

    let totalMaxTx = 0;
    let totalMaxRx = 0;
    let totalSessions = 0;
    let peakBitrate = 0;

    hubConnections.forEach((hub) => {
      if (hub.disconnectRecords.length === 0) return;

      const txBpsValues = hub.disconnectRecords.map(r => r.maxTxBps).filter(v => v > 0);
      const rxBpsValues = hub.disconnectRecords.map(r => r.maxRxBps).filter(v => v > 0);

      if (txBpsValues.length === 0 && rxBpsValues.length === 0) return;

      const avgTxBps = txBpsValues.length > 0 
        ? txBpsValues.reduce((a, b) => a + b, 0) / txBpsValues.length 
        : 0;
      const avgRxBps = rxBpsValues.length > 0 
        ? rxBpsValues.reduce((a, b) => a + b, 0) / rxBpsValues.length 
        : 0;
      const maxTx = Math.max(...txBpsValues, 0);
      const maxRx = Math.max(...rxBpsValues, 0);

      const distanceKey = [hub.station1, hub.station2].sort().join('↔');
      const distance = distances.get(distanceKey);

      connectionStats.push({
        name: formatConnectionShort(hub.connectionId),
        avgTxBps: Math.round(avgTxBps),
        avgRxBps: Math.round(avgRxBps),
        maxTxBps: maxTx,
        maxRxBps: maxRx,
        sessionCount: hub.disconnectRecords.length,
        distance,
      });

      totalMaxTx = Math.max(totalMaxTx, maxTx);
      totalMaxRx = Math.max(totalMaxRx, maxRx);
      totalSessions += hub.disconnectRecords.length;
      peakBitrate = Math.max(peakBitrate, maxTx, maxRx);

      // Build S/N to bitrate correlation data
      hub.disconnectRecords.forEach((disconnect) => {
        const relatedSN = hub.snRecords.filter(sn => {
          const timeDiff = disconnect.timestamp.getTime() - sn.timestamp.getTime();
          return timeDiff >= 0 && timeDiff < 300000;
        });

        if (relatedSN.length > 0) {
          const avgSN = relatedSN.reduce((sum, r) => sum + r.snValue, 0) / relatedSN.length;
          const maxBitrate = Math.max(disconnect.maxTxBps, disconnect.maxRxBps);
          if (maxBitrate > 0) {
            snBitrateCorrelation.push({
              sn: parseFloat(avgSN.toFixed(1)),
              bitrate: maxBitrate,
              connection: formatConnectionShort(hub.connectionId),
            });
          }
        }
      });
    });

    // Sort by average combined bitrate
    connectionStats.sort((a, b) => (b.avgTxBps + b.avgRxBps) - (a.avgTxBps + a.avgRxBps));

    // Calculate overall average
    const allTxBps = connectionStats.flatMap(c => [c.avgTxBps]).filter(v => v > 0);
    const allRxBps = connectionStats.flatMap(c => [c.avgRxBps]).filter(v => v > 0);
    const overallAvgTx = allTxBps.length > 0 
      ? Math.round(allTxBps.reduce((a, b) => a + b, 0) / allTxBps.length)
      : 0;
    const overallAvgRx = allRxBps.length > 0 
      ? Math.round(allRxBps.reduce((a, b) => a + b, 0) / allRxBps.length)
      : 0;

    return {
      connectionData: connectionStats,
      scatterData: snBitrateCorrelation,
      stats: {
        peakBitrate,
        avgTx: overallAvgTx,
        avgRx: overallAvgRx,
        totalSessions,
      },
    };
  }, [hubConnections, distances]);

  const { displayItems, isExpanded, hasMore, hiddenCount, totalCount, toggle } = useExpandableList(connectionData, { defaultLimit: 10, resetKey: dateRangeKey });

  const formatBps = (value: number) => {
    if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
    return `${value}`;
  };

  return (
    <div className="chart-card">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-foreground">Bitrate Analysis</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Peak: {formatBps(stats.peakBitrate)} bps • Avg TX: {formatBps(stats.avgTx)} bps • Avg RX: {formatBps(stats.avgRx)} bps
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Average Bitrate by Connection */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-muted-foreground">
              Average Bitrate by Connection {isExpanded ? `(All ${totalCount})` : '(Top 10)'}
            </h4>
            {hasMore && (
              <ExpandCollapseButton
                isExpanded={isExpanded}
                onToggle={toggle}
                hiddenCount={hiddenCount}
                totalCount={totalCount}
              />
            )}
          </div>
          <div className={isExpanded ? 'max-h-[400px] overflow-y-auto' : 'h-[280px]'} style={isExpanded ? { height: Math.min(400, displayItems.length * 30 + 40) } : undefined}>
            <ResponsiveContainer width="100%" height={isExpanded ? displayItems.length * 30 + 40 : '100%'}>
              <BarChart
                data={displayItems}
                layout="vertical"
                margin={{ left: 10, right: 20, top: 5, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                <XAxis 
                  type="number" 
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  tickFormatter={formatBps}
                  label={{ value: 'bps', position: 'insideBottomRight', offset: -5, fontSize: 10 }}
                />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  tick={({ x, y, payload }: { x: number; y: number; payload: { value: string } }) => {
                    const item = displayItems.find(d => d.name === payload.value);
                    return (
                      <g transform={`translate(${x},${y})`}>
                        <text x={-5} y={0} dy={4} textAnchor="end" fontSize={9} fill="hsl(var(--muted-foreground))">
                          {payload.value}
                          {item?.distance && (
                            <tspan fill="hsl(var(--muted-foreground))" opacity={0.7}> ({item.distance}mi)</tspan>
                          )}
                        </text>
                      </g>
                    );
                  }}
                  width={120}
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
                    name === 'avgTxBps' ? 'Avg TX' : 'Avg RX'
                  ]}
                  labelFormatter={(label, payload) => {
                    const item = payload?.[0]?.payload;
                    if (item?.distance) {
                      return `${label} (${item.distance} mi)`;
                    }
                    return label;
                  }}
                />
                <Legend 
                  wrapperStyle={{ fontSize: '10px' }}
                  formatter={(value) => value === 'avgTxBps' ? 'TX' : 'RX'}
                />
                <Bar dataKey="avgTxBps" fill="hsl(var(--chart-primary))" radius={[0, 4, 4, 0]} />
                <Bar dataKey="avgRxBps" fill="hsl(var(--chart-secondary))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* S/N vs Bitrate Correlation */}
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-2">S/N vs Max Bitrate Correlation</h4>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ left: 0, right: 20, top: 5, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                <XAxis 
                  type="number" 
                  dataKey="sn" 
                  name="S/N"
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  label={{ value: 'S/N (dB)', position: 'insideBottom', offset: -10, fontSize: 10 }}
                />
                <YAxis 
                  type="number" 
                  dataKey="bitrate" 
                  name="Bitrate"
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  tickFormatter={formatBps}
                  label={{ value: 'bps', angle: -90, position: 'insideLeft', fontSize: 10 }}
                />
                <ZAxis range={[30, 80]} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '11px',
                  }}
                  formatter={(value: number, name: string) => [
                    name === 'S/N' ? `${value} dB` : `${value.toLocaleString()} bps`,
                    name
                  ]}
                  labelFormatter={(_, payload) => {
                    if (payload?.[0]?.payload?.connection) {
                      return payload[0].payload.connection;
                    }
                    return '';
                  }}
                />
                <Scatter 
                  data={scatterData} 
                  fill="hsl(var(--chart-success))"
                  fillOpacity={0.6}
                />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
});
