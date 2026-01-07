import { memo, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { DisconnectRecord, formatBytes, formatCallsign } from '@/lib/syslogParser';
import { format } from 'date-fns';

interface SessionDrilldownModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connectionId: string;
  records: DisconnectRecord[];
  filterType: 'all' | 'normal' | 'noData' | 'timeout';
}

export const SessionDrilldownModal = memo(function SessionDrilldownModal({
  open,
  onOpenChange,
  connectionId,
  records,
  filterType,
}: SessionDrilldownModalProps) {
  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      const isNoData = r.txBytes + r.rxBytes === 0;
      switch (filterType) {
        case 'normal':
          return !isNoData && r.disconnectType === 'normal';
        case 'noData':
          return isNoData;
        case 'timeout':
          return !isNoData && r.disconnectType === 'timeout';
        default:
          return true;
      }
    }).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [records, filterType]);

  const getTypeLabel = () => {
    switch (filterType) {
      case 'normal':
        return 'Data Exchanged';
      case 'noData':
        return 'No Data (Probes)';
      case 'timeout':
        return 'Timeout';
      default:
        return 'All Sessions';
    }
  };

  const getTypeBadge = (record: DisconnectRecord) => {
    const isNoData = record.txBytes + record.rxBytes === 0;
    if (isNoData) {
      return <Badge variant="secondary" className="text-xs">No Data</Badge>;
    }
    if (record.disconnectType === 'timeout') {
      return <Badge variant="destructive" className="text-xs bg-orange-500">Timeout</Badge>;
    }
    return <Badge className="text-xs bg-green-600">Data</Badge>;
  };

  // Parse the connection ID to get station names
  const [station1, station2] = connectionId.split('↔').map(formatCallsign);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>{station1} ↔ {station2}</span>
            <Badge variant="outline">{getTypeLabel()}</Badge>
            <Badge variant="secondary">{filteredRecords.length} sessions</Badge>
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 overflow-auto">
          {filteredRecords.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No sessions found for this filter.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[180px]">Timestamp (UTC)</TableHead>
                  <TableHead>Station</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">TX</TableHead>
                  <TableHead className="text-right">RX</TableHead>
                  <TableHead className="text-right">Max TX bps</TableHead>
                  <TableHead className="text-right">Max RX bps</TableHead>
                  <TableHead className="text-right">Duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRecords.map((record, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-mono text-xs">
                      {format(record.timestamp, 'MMM dd HH:mm:ss')}Z
                    </TableCell>
                    <TableCell>{formatCallsign(record.station)}</TableCell>
                    <TableCell>{getTypeBadge(record)}</TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {formatBytes(record.txBytes)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {formatBytes(record.rxBytes)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {record.maxTxBps.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {record.maxRxBps.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {record.sessionTime}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
});
