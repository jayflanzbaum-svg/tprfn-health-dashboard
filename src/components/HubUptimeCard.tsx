import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Activity } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  allowedCallsigns: string[];
}

type RangeKey = 'all' | '7d' | '30d' | '90d' | '1y';

const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: 'all', label: 'All Time' },
  { key: '1y', label: 'Last 365 days' },
  { key: '90d', label: 'Last 90 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: '7d', label: 'Last 7 days' },
];

const MS_DAY = 86400000;

export function HubUptimeCard({ allowedCallsigns }: Props) {
  const [range, setRange] = useState<RangeKey>('all');
  const [rows, setRows] = useState<{ callsign: string; days: number; lastSeen: Date | null }[]>([]);
  const [totalDays, setTotalDays] = useState(0);
  const [loading, setLoading] = useState(false);

  const hubKey = useMemo(
    () => allowedCallsigns.map(c => c.toUpperCase()).sort().join(','),
    [allowedCallsigns]
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (allowedCallsigns.length === 0) {
        setRows([]);
        setTotalDays(0);
        return;
      }
      setLoading(true);
      try {
        // Resolve range bounds. For "all" use the syslog min/max.
        let startDate: Date;
        let endDate: Date = new Date();

        if (range === 'all') {
          const [{ data: minRow }, { data: maxRow }] = await Promise.all([
            supabase.from('syslog_entries').select('timestamp').order('timestamp', { ascending: true }).limit(1),
            supabase.from('syslog_entries').select('timestamp').order('timestamp', { ascending: false }).limit(1),
          ]);
          if (!minRow?.length || !maxRow?.length) {
            if (!cancelled) { setRows([]); setTotalDays(0); }
            return;
          }
          startDate = new Date(minRow[0].timestamp);
          endDate = new Date(maxRow[0].timestamp);
        } else {
          const days = range === '7d' ? 7 : range === '30d' ? 30 : range === '90d' ? 90 : 365;
          endDate = new Date();
          startDate = new Date(endDate.getTime() - (days - 1) * MS_DAY);
        }

        const hubs = allowedCallsigns.map(c => c.toUpperCase());
        const { data, error } = await supabase.rpc('hub_uptime_days', {
          p_hubs: hubs,
          p_start: startDate.toISOString(),
          p_end: endDate.toISOString(),
        });
        if (error) throw error;

        // Total UTC days inclusive
        const startUTC = Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate());
        const endUTC = Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate());
        const total = Math.floor((endUTC - startUTC) / MS_DAY) + 1;

        const next = (data ?? []).map((r: any) => ({
          callsign: r.callsign as string,
          days: Number(r.days) || 0,
          lastSeen: r.last_seen ? new Date(r.last_seen) : null,
        }));
        next.sort((a, b) => {
          const pa = total > 0 ? a.days / total : 0;
          const pb = total > 0 ? b.days / total : 0;
          return pb - pa || a.callsign.localeCompare(b.callsign);
        });
        if (!cancelled) {
          setRows(next);
          setTotalDays(total);
        }
      } catch (e) {
        console.error('Hub uptime load failed', e);
        if (!cancelled) { setRows([]); setTotalDays(0); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [hubKey, range, allowedCallsigns]);

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
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Hub Uptime
            </CardTitle>
            <CardDescription>
              Distinct UTC days each hub was heard in the syslog over the selected period ({totalDays} day{totalDays === 1 ? '' : 's'}).
            </CardDescription>
          </div>
          <Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
            <SelectTrigger className="w-[170px] bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-background z-50">
              {RANGE_OPTIONS.map(o => (
                <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
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
              {rows.map(row => {
                const pct = totalDays > 0 ? (row.days / totalDays) * 100 : 0;
                return (
                  <tr key={row.callsign} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="py-2 pr-4 font-mono font-medium">{row.callsign}</td>
                    <td className="py-2 pr-4">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full ${colorFor(pct)} transition-all`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="tabular-nums text-xs w-12 text-right">
                          {pct.toFixed(0)}%
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
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-muted-foreground">
                    {loading ? 'Loading…' : 'No hub callsigns configured.'}
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
