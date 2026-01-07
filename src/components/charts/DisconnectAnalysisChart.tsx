import { memo, useMemo, useState } from 'react';
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
import { HubConnection, formatConnectionShort, formatCallsign } from '@/lib/syslogParser';
import { useExpandableList } from '@/hooks/useExpandableList';
import { ExpandCollapseButton } from '@/components/ExpandCollapseButton';
import { HelpCircle, X, Users, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface DisconnectAnalysisChartProps {
  hubConnections: Map<string, HubConnection>;
  dateRangeKey?: string;
}

const DISCONNECT_COLORS = {
  normal: 'hsl(142, 70%, 45%)',    // Green - healthy
  timeout: 'hsl(38, 92%, 50%)',    // Orange - warning
};

type ViewMode = 'partner-sessions' | 'station-activity';

export const DisconnectAnalysisChart = memo(function DisconnectAnalysisChart({ hubConnections, dateRangeKey }: DisconnectAnalysisChartProps) {
  const [showHelp, setShowHelp] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('partner-sessions');

  // Check if we have raw disconnect records
  const hasRawData = useMemo(() => {
    let found = false;
    hubConnections.forEach((hub) => {
      if (hub.disconnectRecords.length > 0) {
        found = true;
      }
    });
    return found;
  }, [hubConnections]);

  // Partner Sessions view - only real connections with data exchanged
  const partnerSessionsData = useMemo(() => {
    if (!hasRawData) {
      // Aggregated mode - use session counts
      const data: {
        name: string;
        connectionId: string;
        normal: number;
        timeout: number;
        total: number;
        healthScore: number;
      }[] = [];

      hubConnections.forEach((hub) => {
        if (hub.sessionCount > 0) {
          data.push({
            name: formatConnectionShort(hub.connectionId),
            connectionId: hub.connectionId,
            normal: hub.sessionCount,
            timeout: 0,
            total: hub.sessionCount,
            healthScore: 100,
          });
        }
      });

      return data.sort((a, b) => b.total - a.total);
    }

    // Raw data mode - only count disconnects where data was actually exchanged
    const data: {
      name: string;
      connectionId: string;
      normal: number;
      timeout: number;
      total: number;
      healthScore: number;
    }[] = [];

    hubConnections.forEach((hub) => {
      // Filter to only real sessions (where data was exchanged)
      const realSessions = hub.disconnectRecords.filter(r => r.txBytes + r.rxBytes > 0);
      
      const normal = realSessions.filter(r => r.disconnectType === 'normal').length;
      const timeout = realSessions.filter(r => r.disconnectType === 'timeout').length;
      const total = realSessions.length;

      if (total > 0) {
        const healthScore = Math.round((normal / total) * 100);
        
        data.push({
          name: formatConnectionShort(hub.connectionId),
          connectionId: hub.connectionId,
          normal,
          timeout,
          total,
          healthScore,
        });
      }
    });

    return data.sort((a, b) => b.total - a.total);
  }, [hubConnections, hasRawData]);

  // Station Activity view - per-station counts including beacons/probes
  const stationActivityData = useMemo(() => {
    if (!hasRawData) {
      return [];
    }

    // Aggregate by station
    const stationStats = new Map<string, { normal: number; timeout: number; beacons: number }>();

    hubConnections.forEach((hub) => {
      hub.disconnectRecords.forEach((record) => {
        const station = record.station;
        if (!stationStats.has(station)) {
          stationStats.set(station, { normal: 0, timeout: 0, beacons: 0 });
        }
        const stats = stationStats.get(station)!;
        
        const isBeacon = record.txBytes + record.rxBytes === 0;
        if (isBeacon) {
          stats.beacons++;
        } else {
          if (record.disconnectType === 'timeout') stats.timeout++;
          else stats.normal++;
        }
      });
    });

    const data: {
      name: string;
      station: string;
      normal: number;
      timeout: number;
      beacons: number;
      total: number;
      realSessions: number;
    }[] = [];

    stationStats.forEach((stats, station) => {
      const total = stats.normal + stats.timeout + stats.beacons;
      const realSessions = stats.normal + stats.timeout;
      
      data.push({
        name: formatCallsign(station),
        station,
        normal: stats.normal,
        timeout: stats.timeout,
        beacons: stats.beacons,
        total,
        realSessions,
      });
    });

    return data.sort((a, b) => b.total - a.total);
  }, [hubConnections, hasRawData]);

  // Separate expandable lists for each view mode
  const partnerExpandable = useExpandableList(partnerSessionsData, { defaultLimit: 10, resetKey: `${dateRangeKey}-partner` });
  const stationExpandable = useExpandableList(stationActivityData, { defaultLimit: 10, resetKey: `${dateRangeKey}-station` });
  
  const currentExpandable = viewMode === 'partner-sessions' ? partnerExpandable : stationExpandable;
  const { displayItems, isExpanded, hasMore, hiddenCount, totalCount, toggle } = currentExpandable;

  // Overall stats for Partner Sessions view
  const partnerStats = useMemo(() => {
    if (!hasRawData) {
      let totalSessions = 0;
      hubConnections.forEach((hub) => {
        totalSessions += hub.sessionCount;
      });
      return {
        normal: totalSessions,
        timeout: 0,
        total: totalSessions,
        healthPercent: totalSessions > 0 ? 100 : 0,
      };
    }

    let totalNormal = 0;
    let totalTimeout = 0;

    hubConnections.forEach((hub) => {
      const realSessions = hub.disconnectRecords.filter(r => r.txBytes + r.rxBytes > 0);
      totalNormal += realSessions.filter(r => r.disconnectType === 'normal').length;
      totalTimeout += realSessions.filter(r => r.disconnectType === 'timeout').length;
    });

    const total = totalNormal + totalTimeout;
    return {
      normal: totalNormal,
      timeout: totalTimeout,
      total,
      healthPercent: total > 0 ? Math.round((totalNormal / total) * 100) : 0,
    };
  }, [hubConnections, hasRawData]);

  // Overall stats for Station Activity view
  const stationStats = useMemo(() => {
    if (!hasRawData) return { beacons: 0, realSessions: 0, total: 0 };

    let totalBeacons = 0;
    let totalReal = 0;

    hubConnections.forEach((hub) => {
      hub.disconnectRecords.forEach((record) => {
        if (record.txBytes + record.rxBytes === 0) {
          totalBeacons++;
        } else {
          totalReal++;
        }
      });
    });

    return {
      beacons: totalBeacons,
      realSessions: totalReal,
      total: totalBeacons + totalReal,
    };
  }, [hubConnections, hasRawData]);

  return (
    <div className="chart-card">
      <div className="mb-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <div>
              <h3 className="text-lg font-semibold text-foreground">
                {!hasRawData 
                  ? 'Sessions by Connection'
                  : viewMode === 'partner-sessions' 
                    ? 'Partner Session Quality' 
                    : 'Station Activity'
                }
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                {!hasRawData 
                  ? 'Session counts per hub pair (detailed breakdown unavailable for large date ranges)'
                  : viewMode === 'partner-sessions'
                    ? 'Real connections with data exchanged between station pairs'
                    : 'All disconnect events per station including beacons/probes'
                }
              </p>
            </div>
            {hasRawData && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                onClick={() => setShowHelp(!showHelp)}
                aria-label="Show disconnect type explanations"
              >
                <HelpCircle className="h-4 w-4" />
              </Button>
            )}
          </div>
          <div className="flex items-center gap-4">
            {hasRawData && (
              <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
                <TabsList className="h-8">
                  <TabsTrigger value="partner-sessions" className="text-xs px-3 h-7 gap-1.5">
                    <Users className="h-3.5 w-3.5" />
                    Partners
                  </TabsTrigger>
                  <TabsTrigger value="station-activity" className="text-xs px-3 h-7 gap-1.5">
                    <Radio className="h-3.5 w-3.5" />
                    Stations
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            )}
            {hasMore && (
              <ExpandCollapseButton
                isExpanded={isExpanded}
                onToggle={toggle}
                hiddenCount={hiddenCount}
                totalCount={totalCount}
              />
            )}
            <div className="text-right">
              {viewMode === 'partner-sessions' ? (
                <>
                  <div className="text-2xl font-bold text-foreground">{partnerStats.healthPercent}%</div>
                  <div className="text-xs text-muted-foreground">Overall Health</div>
                </>
              ) : (
                <>
                  <div className="text-2xl font-bold text-foreground">{stationStats.total}</div>
                  <div className="text-xs text-muted-foreground">Total Events</div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Help panel */}
        {showHelp && (
          <div className="mt-4 p-4 bg-muted/50 rounded-lg border border-border relative">
            <Button
              variant="ghost"
              size="sm"
              className="absolute top-2 right-2 h-6 w-6 p-0"
              onClick={() => setShowHelp(false)}
            >
              <X className="h-4 w-4" />
            </Button>
            <h4 className="font-semibold text-sm mb-3">Understanding the Views</h4>
            <div className="space-y-3 text-sm">
              <div>
                <span className="font-medium">Partner Sessions:</span>
                <span className="text-muted-foreground ml-1">Shows actual connections where data was exchanged between specific station pairs. Beacons/probes (0 bytes) are excluded.</span>
              </div>
              <div>
                <span className="font-medium">Station Activity:</span>
                <span className="text-muted-foreground ml-1">Shows all disconnect events per station, including beacons/probes (grey) and real sessions.</span>
              </div>
                <div className="pt-2 border-t border-border">
                <h5 className="font-medium mb-2">Disconnect Types:</h5>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: DISCONNECT_COLORS.normal }}></div>
                    <span><strong>Normal:</strong> Clean disconnect after data exchange</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: DISCONNECT_COLORS.timeout }}></div>
                    <span><strong>Timeout:</strong> Connection lost (signal fade, QRM)</span>
                  </div>
                  {viewMode === 'station-activity' && (
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full shrink-0 bg-muted-foreground/50"></div>
                      <span><strong>Beacon/Probe:</strong> No data exchanged (0 bytes)</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* Summary stats */}
        {viewMode === 'partner-sessions' ? (
          <div className="flex gap-4 mt-4 text-sm flex-wrap">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: DISCONNECT_COLORS.normal }}></div>
              <span className="text-muted-foreground">Normal: <span className="font-mono font-medium text-foreground">{partnerStats.normal}</span></span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: DISCONNECT_COLORS.timeout }}></div>
              <span className="text-muted-foreground">Timeout: <span className="font-mono font-medium text-foreground">{partnerStats.timeout}</span></span>
            </div>
          </div>
        ) : (
          <div className="flex gap-4 mt-4 text-sm flex-wrap">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-muted-foreground/50"></div>
              <span className="text-muted-foreground">Beacons/Probes: <span className="font-mono font-medium text-foreground">{stationStats.beacons}</span></span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: DISCONNECT_COLORS.normal }}></div>
              <span className="text-muted-foreground">Real Sessions: <span className="font-mono font-medium text-foreground">{stationStats.realSessions}</span></span>
            </div>
          </div>
        )}
      </div>

      <div className={isExpanded ? 'max-h-[500px] overflow-y-auto' : 'h-[350px]'} style={isExpanded ? { height: Math.min(500, displayItems.length * 35 + 50) } : undefined}>
        <ResponsiveContainer width="100%" height={isExpanded ? displayItems.length * 35 + 50 : '100%'}>
          {viewMode === 'partner-sessions' ? (
            <BarChart
              data={displayItems}
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
                  const label = name === 'normal' ? 'Normal' : 'Timeout';
                  return [value, label];
                }}
                labelFormatter={(label) => `Connection: ${label}`}
              />
              <Legend 
                formatter={(value) => value === 'normal' ? 'Normal (Healthy)' : 'Timeout (Poor Signal)'}
              />
              <Bar dataKey="normal" stackId="a" fill={DISCONNECT_COLORS.normal} name="normal" />
              <Bar dataKey="timeout" stackId="a" fill={DISCONNECT_COLORS.timeout} name="timeout" />
            </BarChart>
          ) : (
            <BarChart
              data={displayItems}
              layout="vertical"
              margin={{ top: 5, right: 30, left: 80, bottom: 5 }}
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
                width={75}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  boxShadow: 'var(--shadow-lg)',
                }}
                formatter={(value: number, name: string) => {
                  const labels: Record<string, string> = {
                    beacons: 'Beacons/Probes',
                    normal: 'Normal',
                    timeout: 'Timeout'
                  };
                  return [value, labels[name] || name];
                }}
                labelFormatter={(label) => `Station: ${label}`}
              />
              <Legend 
                formatter={(value) => {
                  const labels: Record<string, string> = {
                    beacons: 'Beacons/Probes (No Data)',
                    normal: 'Normal',
                    timeout: 'Timeout'
                  };
                  return labels[value] || value;
                }}
              />
              <Bar dataKey="beacons" stackId="a" fill="hsl(var(--muted-foreground) / 0.5)" name="beacons" />
              <Bar dataKey="normal" stackId="a" fill={DISCONNECT_COLORS.normal} name="normal" />
              <Bar dataKey="timeout" stackId="a" fill={DISCONNECT_COLORS.timeout} name="timeout" />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
});
