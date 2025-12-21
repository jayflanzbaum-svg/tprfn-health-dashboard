import { useMemo } from 'react';
import { format } from 'date-fns';
import { SNRecord, DisconnectRecord, formatBytes } from '@/lib/syslogParser';
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

export type LogFilter = 'all' | 'sn' | 'sessions' | 'data' | 'readings';

interface LogEntriesTableProps {
  snRecords: SNRecord[];
  disconnectRecords: DisconnectRecord[];
  filter: LogFilter;
}

type LogEntry = {
  id: string;
  timestamp: Date;
  type: 'sn' | 'disconnect';
  station: string;
  partner: string;
  snValue?: number;
  txBytes?: number;
  rxBytes?: number;
  sessionTime?: string;
};

export function LogEntriesTable({ snRecords, disconnectRecords, filter }: LogEntriesTableProps) {
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

    if (filter === 'all' || filter === 'sessions' || filter === 'data') {
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

    // Sort by timestamp descending
    return result.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [snRecords, disconnectRecords, filter]);

  const getFilterTitle = () => {
    switch (filter) {
      case 'sn': return 'Average S/N Readings';
      case 'sessions': return 'Session Disconnect Events';
      case 'data': return 'Data Transfer Records';
      case 'readings': return 'S/N Signal Readings';
      default: return 'All Log Entries';
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-6 animate-slide-up">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-foreground">
          {getFilterTitle()}
        </h3>
        <Badge variant="secondary" className="font-mono">
          {entries.length} entries
        </Badge>
      </div>

      <div className="overflow-x-auto max-h-96 overflow-y-auto">
        <Table>
          <TableHeader className="sticky top-0 bg-card">
            <TableRow>
              <TableHead className="w-40">Timestamp</TableHead>
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
            {entries.slice(0, 100).map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {format(entry.timestamp, 'MMM dd HH:mm:ss')}
                </TableCell>
                <TableCell>
                  <Badge variant={entry.type === 'sn' ? 'outline' : 'secondary'}>
                    {entry.type === 'sn' ? 'S/N' : 'Disconnect'}
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
            ))}
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
