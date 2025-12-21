import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { HubConnection, formatBytes, formatConnectionShort } from '@/lib/syslogParser';
import { ArrowUp, ArrowDown } from 'lucide-react';

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
        total: hub.totalTxBytes + hub.totalRxBytes,
        txBytes: hub.totalTxBytes,
        rxBytes: hub.totalRxBytes,
        sessions: hub.sessionCount,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10); // Top 10 for readability
  }, [hubConnections]);

  const maxTotal = Math.max(...chartData.map(d => d.total), 1);

  return (
    <div className="chart-card">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-foreground">Data Transfer by Connection</h3>
        <p className="text-sm text-muted-foreground mt-1">Total bytes sent (TX) and received (RX) per hub pair</p>
      </div>
      
      {/* Custom bar chart for better clarity */}
      <div className="space-y-3">
        {chartData.map((item, index) => {
          const txPercent = (item.txBytes / maxTotal) * 100;
          const rxPercent = (item.rxBytes / maxTotal) * 100;
          
          return (
            <div key={item.name} className="group">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-mono font-medium text-foreground">{item.name}</span>
                <span className="text-xs text-muted-foreground">{formatBytes(item.total)} total</span>
              </div>
              <div className="flex gap-0.5 h-6 rounded overflow-hidden bg-muted/30">
                <div 
                  className="bg-chart-primary transition-all duration-300 flex items-center justify-end px-1"
                  style={{ width: `${Math.max(txPercent, 2)}%` }}
                  title={`TX: ${formatBytes(item.txBytes)}`}
                >
                  {txPercent > 10 && (
                    <span className="text-[10px] font-medium text-white/90">{formatBytes(item.txBytes)}</span>
                  )}
                </div>
                <div 
                  className="bg-chart-info transition-all duration-300 flex items-center px-1"
                  style={{ width: `${Math.max(rxPercent, 2)}%` }}
                  title={`RX: ${formatBytes(item.rxBytes)}`}
                >
                  {rxPercent > 10 && (
                    <span className="text-[10px] font-medium text-white/90">{formatBytes(item.rxBytes)}</span>
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
          <span className="text-xs text-muted-foreground">TX (Sent)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <ArrowDown className="h-3 w-3 text-chart-info" />
            <div className="h-3 w-6 rounded bg-chart-info" />
          </div>
          <span className="text-xs text-muted-foreground">RX (Received)</span>
        </div>
      </div>
    </div>
  );
}
