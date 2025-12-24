import { useMemo } from 'react';
import { SNRecord, ConnectRecord, DisconnectRecord, formatBytes } from '@/lib/syslogParser';
import { SignalBadge } from './SignalBadge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

// Format timestamp in Zulu time with Z suffix
function formatTimestampZulu(date: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${months[date.getUTCMonth()]} ${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}Z`;
}

export type LogFilter = 'all' | 'sn' | 'sessions' | 'data' | 'readings';

interface LogEntriesTableProps {
  snRecords: SNRecord[];
  connectRecords: ConnectRecord[];
  disconnectRecords: DisconnectRecord[];
  filter: LogFilter;
  onClearFilter?: () => void;
}

type LogEntry = {
  id: string;
  timestamp: Date;
  type: 'sn' | 'connect' | 'disconnect';
  station: string;
  partner: string;
  snValue?: number;
  txBytes?: number;
  rxBytes?: number;
  sessionTime?: string;
  varaVersion?: string;
};

export function LogEntriesTable({ snRecords, connectRecords, disconnectRecords, filter, onClearFilter }: LogEntriesTableProps) {
  const entries = useMemo(() => {
    let result: LogEntry[] = [];

    // Based on filter, show appropriate entries
    if (filter === 'all' || filter === 'sn' || filter === 'readings') {
      result = [
        ...result,
        ...snRecords.map((r, i) => ({
          id: `sn-${i}`,
          timestamp: r.timestamp,
          type: 'sn' as const,
          station: r.station,
          partner: r.partner,
          snValue: r.snValue,
        })),
      ];
    }

    if (filter === 'all' || filter === 'sessions') {
      result = [
        ...result,
        ...connectRecords.map((r, i) => ({
          id: `conn-${i}`,
          timestamp: r.timestamp,
          type: 'connect' as const,
          station: r.station,
          partner: r.partner,
          varaVersion: r.varaVersion,
        })),
      ];
    }

    if (filter === 'all' || filter === 'data') {
      result = [
        ...result,
        ...disconnectRecords.map((r, i) => ({
          id: `disc-${i}`,
          timestamp: r.timestamp,
          type: 'disconnect' as const,
          station: r.station,
          partner: r.partner,
          txBytes: r.txBytes,
          rxBytes: r.rxBytes,
          sessionTime: r.sessionTime,
        })),
      ];
    }

    return result.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [snRecords, connectRecords, disconnectRecords, filter]);

  const getRowHighlight = (filter: LogFilter) => {
    switch (filter) {
      case 'sn': return 'bg-teal-500/5 hover:bg-teal-500/10';
      case 'sessions': return 'bg-blue-500/5 hover:bg-blue-500/10';
      case 'data': return 'bg-purple-500/5 hover:bg-purple-500/10';
      case 'readings': return 'bg-orange-500/5 hover:bg-orange-500/10';
      default: return '';
    }
  };

  const getFilterTitle = () => {
    switch (filter) {
      case 'sn': return 'Average S/N Readings';
      case 'sessions': return 'Session Connection Events';
      case 'data': return 'Data Transfer Log Entries';
      case 'readings': return 'S/N Signal Readings';
      default: return 'All Log Entries';
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-6 animate-slide-up">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-foreground">
            {getFilterTitle()}
          </h3>
          {filter !== 'all' && onClearFilter && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearFilter}
              className="h-7 px-2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3 mr-1" />
              Clear filter
            </Button>
          )}
        </div>
        <Badge variant="secondary" className="font-mono">
          {entries.length} entries
        </Badge>
      </div>

      <div className="overflow-x-auto max-h-96 overflow-y-auto">
        <Table>
          <TableHeader className="sticky top-0 bg-card">
            <TableRow>
              <TableHead className="w-44">Timestamp (UTC)</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Station</TableHead>
              <TableHead>Partner</TableHead>
              <TableHead className="text-right">S/N (dB)</TableHead>
              <TableHead className="text-right">TX</TableHead>
              <TableHead className="text-right">RX</TableHead>
              <TableHead className="text-right">Session</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.slice(0, 100).map((entry) => {
              const rowHighlight = filter !== 'all' ? getRowHighlight(filter) : '';
              return (
              <TableRow key={entry.id} className={rowHighlight}>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {formatTimestampZulu(entry.timestamp)}
                </TableCell>
                <TableCell>
                  <Badge variant={entry.type === 'sn' ? 'outline' : entry.type === 'connect' ? 'default' : 'secondary'}>
                    {entry.type === 'sn' ? 'S/N' : entry.type === 'connect' ? 'Connected' : 'Disconnect'}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-sm">{entry.station}</TableCell>
                <TableCell className="font-mono text-sm">{entry.partner}</TableCell>
                <TableCell className="text-right">
                  {entry.snValue !== undefined ? (
                    <SignalBadge snValue={entry.snValue} showValue={true} />
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {entry.txBytes !== undefined ? formatBytes(entry.txBytes) : '—'}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {entry.rxBytes !== undefined ? formatBytes(entry.rxBytes) : '—'}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {entry.sessionTime || '—'}
                </TableCell>
              </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {entries.length > 100 && (
          <p className="text-center text-sm text-muted-foreground mt-4">
            Showing 100 of {entries.length} entries
          </p>
        )}
      </div>
    </div>
  );
}
