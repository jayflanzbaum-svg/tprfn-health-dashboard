import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Radio, ArrowLeft, Pencil, Save, X, Loader2, MapPin, Search, Wifi } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { LoginButton } from '@/components/AuthGuard';
import { toast } from '@/hooks/use-toast';

interface HubFrequency {
  freq_mhz: number;
  mode: string;
  transport: string;
  modem: string;
}

interface HubProfile {
  id: string;
  full_callsign: string;
  base_callsign: string;
  ssid: string | null;
  operator: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  network: string | null;
  notes: string | null;
  frequencies: HubFrequency[];
  updated_at: string;
}

function bandFor(freq: number): string {
  if (freq < 4) return '80m';
  if (freq < 8) return '40m';
  if (freq < 11) return '30m';
  if (freq < 15) return '20m';
  if (freq < 22) return '15m';
  if (freq < 55) return '6m';
  if (freq < 150) return '2m';
  if (freq < 470) return '70cm';
  return `${freq.toFixed(3)} MHz`;
}

function freqBadgeClass(transport: string): string {
  if (transport?.startsWith('vara')) return 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30';
  if (transport?.startsWith('ax25')) return 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30';
  return 'bg-secondary text-foreground border-border';
}

export default function HubDirectory() {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<HubProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<string>('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const { data, error } = await supabase
        .from('hub_profiles')
        .select('*')
        .order('full_callsign');
      if (!alive) return;
      if (error) {
        toast({ title: 'Failed to load hub directory', description: error.message, variant: 'destructive' });
      } else {
        setProfiles(((data || []) as unknown) as HubProfile[]);
      }
      setLoading(false);
    };
    load();

    const channel = supabase
      .channel('hub_profiles_feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hub_profiles' }, () => {
        load();
      })
      .subscribe();

    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter(p =>
      p.full_callsign.toLowerCase().includes(q) ||
      (p.operator || '').toLowerCase().includes(q) ||
      (p.city || '').toLowerCase().includes(q) ||
      (p.state || '').toLowerCase().includes(q) ||
      p.frequencies.some(f => String(f.freq_mhz).includes(q) || f.mode.toLowerCase().includes(q) || f.transport.toLowerCase().includes(q))
    );
  }, [profiles, query]);

  const startEdit = (p: HubProfile) => {
    setEditingId(p.id);
    setEditDraft(JSON.stringify({
      operator: p.operator,
      city: p.city,
      state: p.state,
      country: p.country,
      latitude: p.latitude,
      longitude: p.longitude,
      ssid: p.ssid,
      notes: p.notes,
      frequencies: p.frequencies,
    }, null, 2));
  };

  const saveEdit = async (p: HubProfile) => {
    setSaving(true);
    try {
      const parsed = JSON.parse(editDraft);
      const { error } = await supabase
        .from('hub_profiles')
        .update(parsed)
        .eq('id', p.id);
      if (error) throw error;
      toast({ title: 'Saved', description: `${p.full_callsign} updated.` });
      setEditingId(null);
    } catch (err: any) {
      toast({ title: 'Save failed', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-6xl py-6 px-4">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link to="/">
              <Button variant="ghost" size="sm" className="gap-1.5"><ArrowLeft className="h-4 w-4" /> Dashboard</Button>
            </Link>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 border border-accent/20">
              <Radio className="h-5 w-5 text-accent" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">TPRFN <span className="gradient-text">HUB DIRECTORY</span></h1>
              <p className="text-xs text-muted-foreground">Live feed of hub stations, SSIDs, frequencies, and modes</p>
            </div>
          </div>
          <LoginButton />
        </div>

        <div className="flex items-center gap-2 mb-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search callsign, operator, city, freq, mode..."
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>
          <Badge variant="outline" className="gap-1">
            <Wifi className="h-3 w-3" /> {filtered.length} hubs
          </Badge>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="h-5 w-5 mr-2 animate-spin" /> Loading hub directory...
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map(p => {
              const isEditing = editingId === p.id;
              const sortedFreqs = [...p.frequencies].sort((a, b) => a.freq_mhz - b.freq_mhz);
              const loc = [p.city, p.state, p.country].filter(Boolean).join(', ');
              return (
                <div key={p.id} className="rounded-lg border border-border bg-card p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <div className="flex items-baseline gap-2">
                        <span className="font-mono text-lg font-bold">{p.full_callsign}</span>
                        {p.ssid && (
                          <Badge variant="secondary" className="text-[10px]">SSID -{p.ssid}</Badge>
                        )}
                      </div>
                      {p.operator && <div className="text-sm text-foreground/80">{p.operator}</div>}
                      {loc && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                          <MapPin className="h-3 w-3" /> {loc}
                          {p.latitude != null && p.longitude != null && (
                            <span className="ml-1 font-mono">({p.latitude.toFixed(3)}, {p.longitude.toFixed(3)})</span>
                          )}
                        </div>
                      )}
                    </div>
                    {user && (
                      isEditing ? (
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}><X className="h-4 w-4" /></Button>
                          <Button size="sm" onClick={() => saveEdit(p)} disabled={saving}>
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                          </Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => startEdit(p)}><Pencil className="h-4 w-4" /></Button>
                      )
                    )}
                  </div>

                  {isEditing ? (
                    <Textarea
                      className="font-mono text-xs h-64"
                      value={editDraft}
                      onChange={e => setEditDraft(e.target.value)}
                    />
                  ) : (
                    <div className="mt-2">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                        Frequencies & Modes ({sortedFreqs.length})
                      </div>
                      <div className="grid grid-cols-1 gap-1">
                        {sortedFreqs.map((f, idx) => (
                          <div
                            key={idx}
                            className={`flex items-center justify-between rounded border px-2 py-1 text-xs ${freqBadgeClass(f.transport)}`}
                          >
                            <span className="font-mono font-semibold">{f.freq_mhz.toFixed(4)} MHz</span>
                            <span className="text-[10px] opacity-80">{bandFor(f.freq_mhz)}</span>
                            <span className="font-mono">{f.mode}</span>
                            <span className="text-[10px] uppercase opacity-80">{f.transport}</span>
                            <span className="text-[10px] uppercase opacity-80">{f.modem}</span>
                          </div>
                        ))}
                      </div>
                      {p.notes && <div className="mt-2 text-xs text-muted-foreground italic">{p.notes}</div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
