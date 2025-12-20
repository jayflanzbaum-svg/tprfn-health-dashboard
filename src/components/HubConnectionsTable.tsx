import { useMemo } from 'react';
import { HubConnection, formatBytes, formatCallsign } from '@/lib/syslogParser';
import { SignalBadge } from '@/components/SignalBadge';
import { ArrowUpDown, TrendingUp, TrendingDown } from 'lucide-react';

interface HubConnectionsTableProps {
  hubConnections: Map<string, HubConnection>;
}

export function HubConnectionsTable({ hubConnections }: HubConnectionsTableProps) {
  const tableData = useMemo(() => {
    return Array.from(hubConnections.values())
      .filter(hub => hub.snRecords.length > 0 || hub.disconnectRecords.length > 0)
      .map(hub => {
        // Calculate min/max S/N
        const snValues = hub.snRecords.map(r => r.snValue);
        const minSN = snValues.length > 0 ? Math.min(...snValues) : 0;
        const maxSN = snValues.length > 0 ? Math.max(...snValues) : 0;
        
        return {
          connectionId: hub.connectionId,
          station1: hub.station1,
          station2: hub.station2,
          avgSN: hub.avgSN,
          minSN,
          maxSN,
          sessions: hub.sessionCount,
          totalTx: hub.totalTxBytes,
          totalRx: hub.totalRxBytes,
          snReadings: hub.snRecords.length,
        };
      })
      .sort((a, b) => b.avgSN - a.avgSN);
  }, [hubConnections]);

  return (
    <div className="chart-card overflow-hidden">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-foreground">Hub Connection Details</h3>
        <p className="text-sm text-muted-foreground mt-1">Detailed RF health metrics for each station pair</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Connection
              </th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <div className="flex items-center justify-center gap-1">
                  Avg S/N
                  <ArrowUpDown className="h-3 w-3" />
                </div>
              </th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Min/Max S/N
              </th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Sessions
              </th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Total TX
              </th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Total RX
              </th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                S/N Readings
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {tableData.map((row, index) => (
              <tr 
                key={row.connectionId}
                className="hover:bg-muted/50 transition-colors"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <td className="px-4 py-4">
                  <div className="connection-pair">
                    <span className="callsign-badge">{formatCallsign(row.station1)}</span>
                    <span className="text-muted-foreground text-xs">↔</span>
                    <span className="callsign-badge">{formatCallsign(row.station2)}</span>
                  </div>
                </td>
                <td className="px-4 py-4 text-center">
                  <SignalBadge snValue={row.avgSN} />
                </td>
                <td className="px-4 py-4 text-center">
                  <div className="flex items-center justify-center gap-3">
                    <span className="inline-flex items-center gap-1 text-sm font-mono">
                      <TrendingDown className="h-3 w-3 text-chart-danger" />
                      {row.minSN.toFixed(1)}
                    </span>
                    <span className="text-muted-foreground">/</span>
                    <span className="inline-flex items-center gap-1 text-sm font-mono">
                      <TrendingUp className="h-3 w-3 text-chart-success" />
                      {row.maxSN.toFixed(1)}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-4 text-center">
                  <span className="font-mono text-sm font-medium">{row.sessions}</span>
                </td>
                <td className="px-4 py-4 text-center">
                  <span className="font-mono text-sm text-chart-primary">{formatBytes(row.totalTx)}</span>
                </td>
                <td className="px-4 py-4 text-center">
                  <span className="font-mono text-sm text-chart-info">{formatBytes(row.totalRx)}</span>
                </td>
                <td className="px-4 py-4 text-center">
                  <span className="font-mono text-sm text-muted-foreground">{row.snReadings}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
