import { memo, useMemo } from 'react';
import { HubConnection, formatConnectionShort, formatBytes, formatDuration } from '@/lib/syslogParser';
import { Trophy, ArrowUp, ArrowDown } from 'lucide-react';
import { useExpandableList } from '@/hooks/useExpandableList';
import { ExpandCollapseButton } from '@/components/ExpandCollapseButton';

interface PeakBitrateLeaderboardProps {
  hubConnections: Map<string, HubConnection>;
  dateRangeKey?: string;
}

interface LeaderboardEntry {
  rank: number;
  connection: string;
  maxBitrate: number;
  type: 'TX' | 'RX';
  timestamp: Date;
  sessionDuration: number;
  bytesTransferred: number;
}

export const PeakBitrateLeaderboard = memo(function PeakBitrateLeaderboard({ hubConnections, dateRangeKey }: PeakBitrateLeaderboardProps) {
  const allEntries = useMemo(() => {
    const entries: LeaderboardEntry[] = [];

    hubConnections.forEach((hub) => {
      hub.disconnectRecords.forEach((record) => {
        if (record.maxTxBps > 0) {
          entries.push({
            rank: 0,
            connection: formatConnectionShort(hub.connectionId),
            maxBitrate: record.maxTxBps,
            type: 'TX',
            timestamp: record.timestamp,
            sessionDuration: record.sessionSeconds,
            bytesTransferred: record.txBytes,
          });
        }
        if (record.maxRxBps > 0) {
          entries.push({
            rank: 0,
            connection: formatConnectionShort(hub.connectionId),
            maxBitrate: record.maxRxBps,
            type: 'RX',
            timestamp: record.timestamp,
            sessionDuration: record.sessionSeconds,
            bytesTransferred: record.rxBytes,
          });
        }
      });
    });

    // Sort by bitrate descending and assign ranks
    entries.sort((a, b) => b.maxBitrate - a.maxBitrate);
    entries.forEach((entry, idx) => {
      entry.rank = idx + 1;
    });

    return entries;
  }, [hubConnections]);

  const { displayItems: leaderboard, isExpanded, toggle, hasMore, hiddenCount, totalCount } = useExpandableList(allEntries, { resetKey: dateRangeKey });

  const formatBps = (value: number) => {
    if (value >= 1000) return `${(value / 1000).toFixed(1)}k bps`;
    return `${value} bps`;
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const getRankStyle = (rank: number) => {
    if (rank === 1) return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    if (rank === 2) return 'bg-slate-400/20 text-slate-300 border-slate-400/30';
    if (rank === 3) return 'bg-orange-600/20 text-orange-400 border-orange-500/30';
    return 'bg-muted/50 text-muted-foreground border-border';
  };

  return (
    <div className="chart-card h-full flex flex-col">
      <div className="mb-4 flex items-start justify-between">
        <div className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-amber-400" />
          <div>
            <h3 className="text-lg font-semibold text-foreground">Peak Bitrate Leaderboard</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Top highest bitrate sessions recorded
            </p>
          </div>
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

      <div className={`flex-1 space-y-2 ${isExpanded ? 'max-h-[600px] overflow-y-auto pr-2' : 'overflow-auto'}`}>
        {leaderboard.map((entry) => (
          <div
            key={`${entry.connection}-${entry.timestamp.getTime()}-${entry.type}`}
            className="flex items-center gap-3 p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
          >
            {/* Rank badge */}
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border ${getRankStyle(entry.rank)}`}>
              {entry.rank}
            </div>

            {/* Connection & details */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground truncate">
                  {entry.connection}
                </span>
                <span className={`text-xs px-1.5 py-0.5 rounded flex items-center gap-0.5 ${
                  entry.type === 'TX' 
                    ? 'bg-chart-primary/20 text-chart-primary' 
                    : 'bg-chart-secondary/20 text-chart-secondary'
                }`}>
                  {entry.type === 'TX' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                  {entry.type}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                {formatDate(entry.timestamp)} • {formatDuration(entry.sessionDuration)} • {formatBytes(entry.bytesTransferred)}
              </div>
            </div>

            {/* Bitrate value */}
            <div className="text-right">
              <div className="text-sm font-semibold text-foreground">
                {formatBps(entry.maxBitrate)}
              </div>
            </div>
          </div>
        ))}

        {leaderboard.length === 0 && (
          <div className="text-center text-muted-foreground py-8">
            No bitrate data available
          </div>
        )}
      </div>
    </div>
  );
});
