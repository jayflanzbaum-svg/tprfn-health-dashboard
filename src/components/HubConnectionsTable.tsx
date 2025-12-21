import { useMemo, useState } from 'react';
import { HubConnection, formatBytes, formatCallsign } from '@/lib/syslogParser';
import { SignalBadge } from '@/components/SignalBadge';
import { ArrowUp, ArrowDown, ArrowUpDown, TrendingUp, TrendingDown } from 'lucide-react';

interface HubConnectionsTableProps {
  hubConnections: Map<string, HubConnection>;
}

type SortKey = 'connection' | 'avgSN' | 'minSN' | 'maxSN' | 'sessions' | 'totalTx' | 'totalRx' | 'snReadings';
type SortDirection = 'asc' | 'desc';

export function HubConnectionsTable({ hubConnections }: HubConnectionsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('avgSN');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const tableData = useMemo(() => {
    const data = Array.from(hubConnections.values())
      .filter(hub => hub.snRecords.length > 0 || hub.disconnectRecords.length > 0)
      .map(hub => {
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
      });

    // Sort the data
    data.sort((a, b) => {
      let comparison = 0;
      
      switch (sortKey) {
        case 'connection':
          comparison = a.connectionId.localeCompare(b.connectionId);
          break;
        case 'avgSN':
          comparison = a.avgSN - b.avgSN;
          break;
        case 'minSN':
          comparison = a.minSN - b.minSN;
          break;
        case 'maxSN':
          comparison = a.maxSN - b.maxSN;
          break;
        case 'sessions':
          comparison = a.sessions - b.sessions;
          break;
        case 'totalTx':
          comparison = a.totalTx - b.totalTx;
          break;
        case 'totalRx':
          comparison = a.totalRx - b.totalRx;
          break;
        case 'snReadings':
          comparison = a.snReadings - b.snReadings;
          break;
      }
      
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return data;
  }, [hubConnections, sortKey, sortDirection]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('desc');
    }
  };

  const SortIcon = ({ columnKey }: { columnKey: SortKey }) => {
    if (sortKey !== columnKey) {
      return <ArrowUpDown className="h-3 w-3 opacity-50" />;
    }
    return sortDirection === 'asc' 
      ? <ArrowUp className="h-3 w-3 text-primary" />
      : <ArrowDown className="h-3 w-3 text-primary" />;
  };

  const SortableHeader = ({ 
    columnKey, 
    children, 
    className = '' 
  }: { 
    columnKey: SortKey; 
    children: React.ReactNode;
    className?: string;
  }) => (
    <th 
      className={`px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground hover:bg-muted/50 transition-colors select-none ${className}`}
      onClick={() => handleSort(columnKey)}
    >
      <div className="flex items-center justify-center gap-1">
        {children}
        <SortIcon columnKey={columnKey} />
      </div>
    </th>
  );

  return (
    <div className="chart-card overflow-hidden">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-foreground">Hub Connection Details</h3>
        <p className="text-sm text-muted-foreground mt-1">Detailed RF health metrics for each station pair • Click headers to sort</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <SortableHeader columnKey="connection" className="text-left">
                Connection
              </SortableHeader>
              <SortableHeader columnKey="avgSN">
                Avg S/N
              </SortableHeader>
              <SortableHeader columnKey="minSN">
                Min S/N
              </SortableHeader>
              <SortableHeader columnKey="maxSN">
                Max S/N
              </SortableHeader>
              <SortableHeader columnKey="sessions">
                Sessions
              </SortableHeader>
              <SortableHeader columnKey="totalTx">
                Total TX
              </SortableHeader>
              <SortableHeader columnKey="totalRx">
                Total RX
              </SortableHeader>
              <SortableHeader columnKey="snReadings">
                S/N Readings
              </SortableHeader>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {tableData.map((row, index) => (
              <tr 
                key={row.connectionId}
                className="hover:bg-muted/50 transition-colors"
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
                  <span className="inline-flex items-center gap-1 text-sm font-mono">
                    <TrendingDown className="h-3 w-3 text-chart-danger" />
                    {row.minSN.toFixed(1)}
                  </span>
                </td>
                <td className="px-4 py-4 text-center">
                  <span className="inline-flex items-center gap-1 text-sm font-mono">
                    <TrendingUp className="h-3 w-3 text-chart-success" />
                    {row.maxSN.toFixed(1)}
                  </span>
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
