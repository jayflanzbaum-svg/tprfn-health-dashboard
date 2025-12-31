import { memo, useMemo, useEffect } from 'react';
import { HubConnection, getSignalQuality, formatConnectionShort } from '@/lib/syslogParser';
import { useExpandableList } from '@/hooks/useExpandableList';
import { ExpandCollapseButton } from '@/components/ExpandCollapseButton';
import { useStationLocations } from '@/hooks/useStationLocations';

interface SNByHubChartProps {
  hubConnections: Map<string, HubConnection>;
  dateRangeKey?: string;
}

export const SNByHubChart = memo(function SNByHubChart({ hubConnections, dateRangeKey }: SNByHubChartProps) {
  const { distances, lookupCallsigns, loading: locationsLoading } = useStationLocations();

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
  }, [callsigns.join(',')]); // Only re-fetch when callsigns change

  const allData = useMemo(() => {
    return Array.from(hubConnections.values())
      // In aggregated mode, snRecords is empty but avgSN is still meaningful (can be negative)
      .filter(hub => hub.snRecords.length > 0 || (hub.snCount ?? 0) > 0 || hub.sessionCount > 0)
      .map(hub => {
        const distanceKey = [hub.station1, hub.station2].sort().join('↔');
        const distance = distances.get(distanceKey);
        return {
          name: formatConnectionShort(hub.connectionId),
          fullName: hub.connectionId,
          avgSN: parseFloat(hub.avgSN.toFixed(1)),
          sessions: hub.sessionCount,
          quality: getSignalQuality(hub.avgSN),
          distance,
        };
      })
      .sort((a, b) => b.avgSN - a.avgSN);
  }, [hubConnections, distances]);

  const { displayItems: chartData, isExpanded, toggle, hasMore, hiddenCount, totalCount } = useExpandableList(allData, { resetKey: dateRangeKey });

  const getBarColor = (quality: string) => {
    const colors: Record<string, string> = {
      excellent: 'bg-signal-excellent',
      good: 'bg-signal-good',
      fair: 'bg-signal-fair',
      poor: 'bg-signal-poor',
      bad: 'bg-signal-bad',
    };
    return colors[quality] || colors.fair;
  };

  // Find the range for scaling bars
  const minSN = Math.min(...chartData.map(d => d.avgSN), 0);
  const maxSN = Math.max(...chartData.map(d => d.avgSN), 1);
  const range = maxSN - minSN;

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
      
      {/* Custom bar chart matching Data Transfer style */}
      <div className={`flex-1 space-y-3 ${isExpanded ? 'max-h-[600px] overflow-y-auto pr-2' : ''}`}>
        {chartData.map((item) => {
          // Calculate bar width as percentage of range
          const barPercent = ((item.avgSN - minSN) / range) * 100;
          
          return (
            <div key={item.name} className="group">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono font-medium text-foreground">{item.name}</span>
                  {item.distance && (
                    <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                      {item.distance} mi
                    </span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">{item.avgSN} dB</span>
              </div>
              <div className="flex gap-0.5 h-6 rounded overflow-hidden bg-muted/30">
                <div 
                  className={`${getBarColor(item.quality)} transition-all duration-300 flex items-center justify-end px-2 rounded-r`}
                  style={{ width: `${Math.max(barPercent, 5)}%` }}
                  title={`${item.avgSN} dB - ${item.quality}${item.distance ? ` - ${item.distance} miles` : ''}`}
                >
                  {barPercent > 15 && (
                    <span className="text-[10px] font-medium text-white/90">{item.quality}</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-6 flex flex-wrap gap-4 justify-center">
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
