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
import { HubConnection, formatConnectionShort } from '@/lib/syslogParser';
import { useExpandableList } from '@/hooks/useExpandableList';
import { ExpandCollapseButton } from '@/components/ExpandCollapseButton';
import { HelpCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface DisconnectAnalysisChartProps {
  hubConnections: Map<string, HubConnection>;
  dateRangeKey?: string;
}

const DISCONNECT_COLORS = {
  normal: 'hsl(142, 70%, 45%)',    // Green - healthy
  timeout: 'hsl(38, 92%, 50%)',    // Orange - warning
  command: 'hsl(199, 89%, 48%)',   // Blue - manual
};

export const DisconnectAnalysisChart = memo(function DisconnectAnalysisChart({ hubConnections, dateRangeKey }: DisconnectAnalysisChartProps) {
  const [showHelp, setShowHelp] = useState(false);
  const { chartData, isAggregated } = useMemo(() => {
    // Check if we have raw disconnect records or just aggregated data
    let hasRawData = false;
    hubConnections.forEach((hub) => {
      if (hub.disconnectRecords.length > 0) {
        hasRawData = true;
      }
    });

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
      if (hasRawData) {
        // Raw data mode - use actual disconnect records
        const normal = hub.disconnectRecords.filter(r => r.disconnectType === 'normal').length;
        const timeout = hub.disconnectRecords.filter(r => r.disconnectType === 'timeout').length;
        const command = hub.disconnectRecords.filter(r => r.disconnectType === 'command').length;
        const total = hub.disconnectRecords.length;

        if (total > 0) {
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
      } else {
        // Aggregated mode - we only have session count, show as "sessions"
        if (hub.sessionCount > 0) {
          data.push({
            name: formatConnectionShort(hub.connectionId),
            connectionId: hub.connectionId,
            normal: hub.sessionCount, // Assume all as normal in aggregated mode
            timeout: 0,
            command: 0,
            total: hub.sessionCount,
            healthScore: 100,
          });
        }
      }
    });

    // Sort by total disconnects descending
    return { chartData: data.sort((a, b) => b.total - a.total), isAggregated: !hasRawData };
  }, [hubConnections]);

  const { displayItems, isExpanded, hasMore, hiddenCount, totalCount, toggle } = useExpandableList(chartData, { defaultLimit: 10, resetKey: dateRangeKey });

  // Overall stats
  const overallStats = useMemo(() => {
    if (isAggregated) {
      let totalSessions = 0;
      hubConnections.forEach((hub) => {
        totalSessions += hub.sessionCount;
      });
      return {
        normal: totalSessions,
        timeout: 0,
        command: 0,
        total: totalSessions,
        healthPercent: totalSessions > 0 ? 100 : 0,
      };
    }

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
  }, [hubConnections, isAggregated]);

  return (
    <div className="chart-card">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div>
              <h3 className="text-lg font-semibold text-foreground">
                {isAggregated ? 'Sessions by Connection' : 'Disconnect Analysis by Connection'}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                {isAggregated 
                  ? 'Session counts per hub pair (detailed breakdown unavailable for large date ranges)'
                  : 'RF connection health indicator - breakdown by disconnect reason'
                }
              </p>
            </div>
            {!isAggregated && (
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
            {hasMore && (
              <ExpandCollapseButton
                isExpanded={isExpanded}
                onToggle={toggle}
                hiddenCount={hiddenCount}
                totalCount={totalCount}
              />
            )}
            <div className="text-right">
              <div className="text-2xl font-bold text-foreground">{overallStats.healthPercent}%</div>
              <div className="text-xs text-muted-foreground">Overall Health</div>
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
            <h4 className="font-semibold text-sm mb-3">Understanding Disconnect Types</h4>
            <div className="space-y-2 text-sm">
              <div className="flex items-start gap-2">
                <div className="w-3 h-3 rounded-full mt-1 shrink-0" style={{ backgroundColor: DISCONNECT_COLORS.normal }}></div>
                <div>
                  <span className="font-medium">Normal:</span>
                  <span className="text-muted-foreground ml-1">Connection established → data exchanged → one station initiated proper disconnect → other station acknowledged. This is a healthy, complete session.</span>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <div className="w-3 h-3 rounded-full mt-1 shrink-0" style={{ backgroundColor: DISCONNECT_COLORS.timeout }}></div>
                <div>
                  <span className="font-medium">Timeout:</span>
                  <span className="text-muted-foreground ml-1">Connection was lost without proper handshake—typically due to signal loss, propagation fade, QRM, or equipment issues. The session was interrupted.</span>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <div className="w-3 h-3 rounded-full mt-1 shrink-0" style={{ backgroundColor: DISCONNECT_COLORS.command }}></div>
                <div>
                  <span className="font-medium">Manual:</span>
                  <span className="text-muted-foreground ml-1">Operator-initiated disconnect command. Session ended by user action rather than automatic completion.</span>
                </div>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-border text-xs text-muted-foreground">
              <strong>Note:</strong> Each bar shows a specific station pair (e.g., "N4SFL ↔ KK4DIV"). Times are in UTC. Day starts at 00:00 UTC.
            </div>
          </div>
        )}
        
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

      <div className={isExpanded ? 'max-h-[500px] overflow-y-auto' : 'h-[350px]'} style={isExpanded ? { height: Math.min(500, displayItems.length * 35 + 50) } : undefined}>
        <ResponsiveContainer width="100%" height={isExpanded ? displayItems.length * 35 + 50 : '100%'}>
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
