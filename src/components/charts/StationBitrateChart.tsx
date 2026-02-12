import { memo, useMemo, useEffect } from 'react';
import { HubConnection, formatCallsign } from '@/lib/syslogParser';
import { useExpandableList } from '@/hooks/useExpandableList';
import { ExpandCollapseButton } from '@/components/ExpandCollapseButton';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { useStationLocations } from '@/hooks/useStationLocations';

interface StationBitrateChartProps {
  hubConnections: Map<string, HubConnection>;
  dateRangeKey?: string;
}

export const StationBitrateChart = memo(function StationBitrateChart({ hubConnections, dateRangeKey }: StationBitrateChartProps) {
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

  // Fetch locations for callsigns
  useEffect(() => {
    if (callsigns.length > 0) {
      lookupCallsigns(callsigns);
    }
  }, [callsigns.join(',')]);

  // Build a map of station -> list of peers
  const stationPeers = useMemo(() => {
    const peers = new Map<string, Set<string>>();
    hubConnections.forEach((hub) => {
      if (!peers.has(hub.station1)) peers.set(hub.station1, new Set());
      if (!peers.has(hub.station2)) peers.set(hub.station2, new Set());
      peers.get(hub.station1)!.add(hub.station2);
      peers.get(hub.station2)!.add(hub.station1);
    });
    return peers;
  }, [hubConnections]);

  const { stationData, isAggregated } = useMemo(() => {
    // Check if we have raw disconnect records
    let hasRawData = false;
    hubConnections.forEach((hub) => {
      if (hub.disconnectRecords.length > 0) {
        hasRawData = true;
      }
    });

    // Aggregated mode fallback: estimate station bitrates from per-connection aggregated stats
    if (!hasRawData) {
      const stationStats = new Map<string, {
        avgBps: number[];
        maxBps: number;
        sessionCount: number;
      }>();

      hubConnections.forEach((hub) => {
        const avg = hub.avgBitrate ?? 0;
        const max = hub.maxBitrate ?? 0;
        if (avg <= 0 && max <= 0) return;

        [hub.station1, hub.station2].forEach((station) => {
          if (!stationStats.has(station)) {
            stationStats.set(station, { avgBps: [], maxBps: 0, sessionCount: 0 });
          }
          const s = stationStats.get(station)!;
          if (avg > 0) s.avgBps.push(avg);
          s.maxBps = Math.max(s.maxBps, max);
          s.sessionCount += hub.sessionCount;
        });
      });

      const result = Array.from(stationStats.entries()).map(([station, stats]) => {
        const peers = stationPeers.get(station) || new Set();
        const peerDistances: number[] = [];
        peers.forEach(peer => {
          const key = [station, peer].sort().join('↔');
          const dist = distances.get(key);
          if (dist) peerDistances.push(dist);
        });
        const avgDistance = peerDistances.length > 0 
          ? Math.round(peerDistances.reduce((a, b) => a + b, 0) / peerDistances.length)
          : undefined;

        const avg = stats.avgBps.length > 0 ? Math.round(stats.avgBps.reduce((a, b) => a + b, 0) / stats.avgBps.length) : 0;

        return {
          station: formatCallsign(station),
          avgTx: avg,
          avgRx: 0,
          maxTx: stats.maxBps,
          maxRx: 0,
          sessions: stats.sessionCount,
          avgDistance,
        };
      });

      result.sort((a, b) => (b.avgTx + b.avgRx) - (a.avgTx + a.avgRx));

      return { stationData: result, isAggregated: true };
    }

    const stationStats = new Map<string, {
      avgTxBps: number[];
      avgRxBps: number[];
      maxTxBps: number;
      maxRxBps: number;
      sessionCount: number;
    }>();

    hubConnections.forEach((hub) => {
      if (hub.disconnectRecords.length === 0) return;

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

    const result = Array.from(stationStats.entries()).map(([station, stats]) => {
      // Calculate average distance to peers
      const peers = stationPeers.get(station) || new Set();
      const peerDistances: number[] = [];
      peers.forEach(peer => {
        const key = [station, peer].sort().join('↔');
        const dist = distances.get(key);
        if (dist) peerDistances.push(dist);
      });
      const avgDistance = peerDistances.length > 0 
        ? Math.round(peerDistances.reduce((a, b) => a + b, 0) / peerDistances.length)
        : undefined;

      return {
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
        avgDistance,
      };
    });

    result.sort((a, b) => (b.avgTx + b.avgRx) - (a.avgTx + a.avgRx));

    return { stationData: result, isAggregated: false };
  }, [hubConnections, stationPeers, distances]);

  const { displayItems, isExpanded, hasMore, hiddenCount, totalCount, toggle } = useExpandableList(stationData, { defaultLimit: 10, resetKey: dateRangeKey });

  const maxBitrate = Math.max(...displayItems.map(d => d.avgTx + d.avgRx), 1);

  const formatBps = (value: number) => {
    if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
    return `${value}`;
  };


  const subtitle = isAggregated
    ? 'Aggregated station bitrate estimates (no per-session detail for large date ranges)'
    : 'Average TX and RX bitrates achieved by each station';

  return (
    <div className="chart-card h-full flex flex-col">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Bitrate by Station</h3>
          <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
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

      <div className={`flex-1 space-y-3 ${isExpanded ? 'max-h-[600px] overflow-y-auto pr-2' : ''}`}>
        {displayItems.map((item) => {
          const txPercent = (item.avgTx / maxBitrate) * 100;
          const rxPercent = (item.avgRx / maxBitrate) * 100;
          
          return (
            <div key={item.station} className="group">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-mono font-medium text-foreground">{item.station}</span>
                <span className="text-xs text-muted-foreground">
                  {formatBps(item.avgTx + item.avgRx)} bps avg{item.avgDistance ? ` • ~${item.avgDistance} mi to peers` : ''}
                </span>
              </div>
              <div className="flex gap-0.5 h-6 rounded overflow-hidden bg-muted/30">
                <div 
                  className="bg-chart-primary transition-all duration-300 flex items-center justify-end px-1"
                  style={{ width: `${Math.max(txPercent, 2)}%` }}
                  title={`Avg TX: ${formatBps(item.avgTx)} bps`}
                >
                  {txPercent > 15 && (
                    <span className="text-[10px] font-medium text-white/90">{formatBps(item.avgTx)}</span>
                  )}
                </div>
                <div 
                  className="bg-chart-info transition-all duration-300 flex items-center px-1"
                  style={{ width: `${Math.max(rxPercent, 2)}%` }}
                  title={`Avg RX: ${formatBps(item.avgRx)} bps`}
                >
                  {rxPercent > 15 && (
                    <span className="text-[10px] font-medium text-white/90">{formatBps(item.avgRx)}</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-6 flex items-center justify-center gap-6">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <ArrowUp className="h-3 w-3 text-chart-primary" />
            <div className="h-3 w-6 rounded bg-chart-primary" />
          </div>
          <span className="text-xs text-muted-foreground">Avg TX</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <ArrowDown className="h-3 w-3 text-chart-info" />
            <div className="h-3 w-6 rounded bg-chart-info" />
          </div>
          <span className="text-xs text-muted-foreground">Avg RX</span>
        </div>
      </div>
    </div>
  );
});
