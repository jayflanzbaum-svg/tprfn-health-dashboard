import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import type { SNRecord, ConnectRecord, DisconnectRecord } from '@/lib/syslogParser';
import type { DateRange } from '@/components/DateRangeFilter';
import { Activity } from 'lucide-react';

interface Props {
  allowedCallsigns: string[];
  dateRange: DateRange;
  snRecords: SNRecord[];
  connectRecords: ConnectRecord[];
  disconnectRecords: DisconnectRecord[];
}

function utcDayKey(d: Date): string {
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
}

export function HubUptimeCard({
  allowedCallsigns,
  dateRange,
  snRecords,
  connectRecords,
  disconnectRecords,
}: Props) {
  const { rows, totalDays } = useMemo(() => {
    // Build set of UTC day keys in range
    const dayKeys = new Set<string>();
    const startUTC = Date.UTC(
      dateRange.start.getUTCFullYear(),
      dateRange.start.getUTCMonth(),
      dateRange.start.getUTCDate()
    );
    const endUTC = Date.UTC(
      dateRange.end.getUTCFullYear(),
      dateRange.end.getUTCMonth(),
      dateRange.end.getUTCDate()
    );
    const msDay = 86400000;
    for (let t = startUTC; t <= endUTC; t += msDay) {
      const d = new Date(t);
      dayKeys.add(`${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`);
    }
    const totalDays = dayKeys.size;

    const hubSet = new Set(allowedCallsigns.map(c => c.toUpperCase()));
    const seen = new Map<string, Set<string>>();
    hubSet.forEach(h => seen.set(h, new Set()));
    const lastSeen = new Map<string, Date>();

    const consider = (ts: Date, station: string, partner: string) => {
      const key = utcDayKey(ts);
      if (!dayKeys.has(key)) return;
      for (const cs of [station, partner]) {
        const up = (cs || '').toUpperCase();
        if (hubSet.has(up)) {
          seen.get(up)!.add(key);
          const prev = lastSeen.get(up);
          if (!prev || ts > prev) lastSeen.set(up, ts);
        }
      }
    };

    snRecords.forEach(r => consider(r.timestamp, r.station, r.partner));
    connectRecords.forEach(r => consider(r.timestamp, r.station, r.partner));
    disconnectRecords.forEach(r => consider(r.timestamp, r.station, r.partner));

    const rows = Array.from(hubSet).map(callsign => {
      const days = seen.get(callsign)!.size;
      const pct = totalDays > 0 ? (days / totalDays) * 100 : 0;
      return { callsign, days, pct, lastSeen: lastSeen.get(callsign) || null };
    });
    rows.sort((a, b) => b.pct - a.pct || a.callsign.localeCompare(b.callsign));

    return { rows, totalDays };
  }, [allowedCallsigns, dateRange, snRecords, connectRecords, disconnectRecords]);

  const formatLastSeen = (d: Date | null) => {
    if (!d) return '—';
    return d.toISOString().replace('T', ' ').slice(0, 16) + 'Z';
  };

  const colorFor = (pct: number) => {
    if (pct >= 80) return 'bg-green-500';
    if (pct >= 50) return 'bg-amber-500';
    if (pct > 0) return 'bg-orange-500';
    return 'bg-red-500';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Hub Uptime
        </CardTitle>
        <CardDescription>
          Distinct UTC days each hub was heard in the syslog over the selected range ({totalDays} day{totalDays === 1 ? '' : 's'}).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground text-xs uppercase tracking-wide">
                <th className="text-left py-2 pr-4 font-medium">Hub</th>
                <th className="text-left py-2 pr-4 font-medium w-1/2">Uptime</th>
                <th className="text-right py-2 pr-4 font-medium">Days</th>
                <th className="text-right py-2 font-medium">Last Heard (UTC)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.callsign} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="py-2 pr-4 font-mono font-medium">{row.callsign}</td>
                  <td className="py-2 pr-4">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full ${colorFor(row.pct)} transition-all`}
                          style={{ width: `${row.pct}%` }}
                        />
                      </div>
                      <span className="tabular-nums text-xs w-12 text-right">
                        {row.pct.toFixed(0)}%
                      </span>
                    </div>
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {row.days} / {totalDays}
                  </td>
                  <td className="py-2 text-right tabular-nums text-muted-foreground text-xs">
                    {formatLastSeen(row.lastSeen)}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-muted-foreground">
                    No hub callsigns configured.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
