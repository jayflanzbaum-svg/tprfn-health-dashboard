import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Radio, ArrowLeft, Pencil, Save, X, Loader2, MapPin, Search, Wifi, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { LoginButton } from '@/components/AuthGuard';
import { toast } from '@/hooks/use-toast';

const TRANSPORT_OPTIONS = ['vara-hf', 'vara-fm', 'ax25', 'ardop', 'pactor', 'packet', 'other'];
const MODEM_OPTIONS = ['VARA', 'VARA FM', 'AX.25', 'ARDOP', 'PACTOR', 'Other'];

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
  const [editDraft, setEditDraft] = useState<Partial<HubProfile> | null>(null);
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
    setEditDraft({
      base_callsign: p.base_callsign,
      ssid: p.ssid,
      operator: p.operator,
      city: p.city,
      state: p.state,
      country: p.country,
      latitude: p.latitude,
      longitude: p.longitude,
      network: p.network,
      notes: p.notes,
      frequencies: [...(p.frequencies || [])],
    });
  };

  const updateDraft = (patch: Partial<HubProfile>) => {
    setEditDraft(prev => ({ ...(prev || {}), ...patch }));
  };

  const updateFreq = (idx: number, patch: Partial<HubFrequency>) => {
    setEditDraft(prev => {
      const freqs = [...((prev?.frequencies as HubFrequency[]) || [])];
      freqs[idx] = { ...freqs[idx], ...patch };
      return { ...(prev || {}), frequencies: freqs };
    });
  };

  const addFreq = () => {
    setEditDraft(prev => ({
      ...(prev || {}),
      frequencies: [...(((prev?.frequencies as HubFrequency[]) || [])), { freq_mhz: 0, mode: '', transport: 'vara-hf', modem: 'VARA' }],
    }));
  };

  const removeFreq = (idx: number) => {
    setEditDraft(prev => {
      const freqs = [...((prev?.frequencies as HubFrequency[]) || [])];
      freqs.splice(idx, 1);
      return { ...(prev || {}), frequencies: freqs };
    });
  };

  const addHub = async () => {
    const input = window.prompt('Enter base callsign for the new hub (e.g. K1AJD):');
    if (!input) return;
    const base = input.trim().toUpperCase();
    if (!/^[A-Z0-9]{3,7}$/.test(base)) {
      toast({ title: 'Invalid callsign', description: 'Use letters/numbers only, no SSID.', variant: 'destructive' });
      return;
    }
    if (profiles.some(p => p.base_callsign === base)) {
      toast({ title: 'Already exists', description: `${base} is already in the directory.`, variant: 'destructive' });
      return;
    }
    const { data, error } = await supabase
      .from('hub_profiles')
      .insert({ base_callsign: base, full_callsign: base, frequencies: [] } as any)
      .select()
      .single();
    if (error) {
      toast({ title: 'Failed to add hub', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Hub added', description: `${base} created. Fill in the details and save.` });
    const newProfile = data as unknown as HubProfile;
    setProfiles(prev => [...prev, newProfile].sort((a, b) => a.full_callsign.localeCompare(b.full_callsign)));
    startEdit(newProfile);
  };


  const saveEdit = async (p: HubProfile) => {
    if (!editDraft) return;
    setSaving(true);
    try {
      const base = (editDraft.base_callsign || p.base_callsign || '').trim().toUpperCase();
      const ssid = (editDraft.ssid || '').toString().trim().replace(/^-/, '') || null;
      const full = ssid ? `${base}-${ssid}` : base;
      const payload = {
        base_callsign: base,
        full_callsign: full,
        ssid,
        operator: editDraft.operator ?? null,
        city: editDraft.city ?? null,
        state: editDraft.state ?? null,
        country: editDraft.country ?? null,
        latitude: editDraft.latitude == null || editDraft.latitude === ('' as any) ? null : Number(editDraft.latitude),
        longitude: editDraft.longitude == null || editDraft.longitude === ('' as any) ? null : Number(editDraft.longitude),
        network: editDraft.network ?? null,
        notes: editDraft.notes ?? null,
        frequencies: ((editDraft.frequencies as HubFrequency[]) || []).map(f => ({
          freq_mhz: Number(f.freq_mhz) || 0,
          mode: (f.mode || '').trim(),
          transport: (f.transport || '').trim(),
          modem: (f.modem || '').trim(),
        })),
      };
      const { error } = await supabase
        .from('hub_profiles')
        .update(payload as any)
        .eq('id', p.id);
      if (error) throw error;
      toast({ title: 'Saved', description: `${full} updated.` });
      setEditingId(null);
      setEditDraft(null);
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
          <div className="flex items-center gap-2">
            {user && (
              <Button size="sm" className="gap-1.5" onClick={addHub}>
                <Plus className="h-3.5 w-3.5" />
                Add Hub
              </Button>
            )}
            <Link to="/hubs">
              <Button variant="outline" size="sm" className="gap-1.5">
                <Wifi className="h-3.5 w-3.5" />
                Live Feed
              </Button>
            </Link>
            <LoginButton />
          </div>
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
                          <Button size="sm" variant="ghost" onClick={() => { setEditingId(null); setEditDraft(null); }}><X className="h-4 w-4" /></Button>
                          <Button size="sm" onClick={() => saveEdit(p)} disabled={saving}>
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                          </Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => startEdit(p)}><Pencil className="h-4 w-4" /></Button>
                      )
                    )}
                  </div>

                  {isEditing && editDraft ? (
                    <div className="mt-3 space-y-3 border-t pt-3">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Base Callsign</Label>
                          <Input
                            className="h-8 font-mono"
                            value={editDraft.base_callsign || ''}
                            onChange={e => updateDraft({ base_callsign: e.target.value.toUpperCase() })}
                          />
                        </div>
                        <div>
                          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">SSID (e.g. 4)</Label>
                          <Input
                            className="h-8 font-mono"
                            placeholder="optional"
                            value={editDraft.ssid || ''}
                            onChange={e => updateDraft({ ssid: e.target.value })}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Operator</Label>
                          <Input className="h-8" value={editDraft.operator || ''} onChange={e => updateDraft({ operator: e.target.value })} />
                        </div>
                        <div>
                          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Network</Label>
                          <Input className="h-8" value={editDraft.network || ''} onChange={e => updateDraft({ network: e.target.value })} />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">City</Label>
                          <Input className="h-8" value={editDraft.city || ''} onChange={e => updateDraft({ city: e.target.value })} />
                        </div>
                        <div>
                          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">State</Label>
                          <Input className="h-8" value={editDraft.state || ''} onChange={e => updateDraft({ state: e.target.value })} />
                        </div>
                        <div>
                          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Country</Label>
                          <Input className="h-8" value={editDraft.country || ''} onChange={e => updateDraft({ country: e.target.value })} />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Latitude</Label>
                          <Input className="h-8 font-mono" type="number" step="0.000001" value={editDraft.latitude ?? ''} onChange={e => updateDraft({ latitude: e.target.value === '' ? null : Number(e.target.value) })} />
                        </div>
                        <div>
                          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Longitude</Label>
                          <Input className="h-8 font-mono" type="number" step="0.000001" value={editDraft.longitude ?? ''} onChange={e => updateDraft({ longitude: e.target.value === '' ? null : Number(e.target.value) })} />
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Frequencies & Modes</Label>
                          <Button size="sm" variant="outline" className="h-7 gap-1" onClick={addFreq}>
                            <Plus className="h-3 w-3" /> Add
                          </Button>
                        </div>
                        <div className="space-y-2">
                          {((editDraft.frequencies as HubFrequency[]) || []).map((f, idx) => (
                            <div key={idx} className="grid grid-cols-[1.2fr_1fr_1.1fr_1fr_auto] gap-1 items-center">
                              <Input
                                className="h-8 font-mono"
                                type="number"
                                step="0.0001"
                                placeholder="MHz"
                                value={f.freq_mhz ?? ''}
                                onChange={e => updateFreq(idx, { freq_mhz: e.target.value === '' ? 0 : Number(e.target.value) })}
                              />
                              <Input
                                className="h-8 font-mono"
                                placeholder="Mode"
                                value={f.mode || ''}
                                onChange={e => updateFreq(idx, { mode: e.target.value })}
                              />
                              <Select value={f.transport || ''} onValueChange={v => updateFreq(idx, { transport: v })}>
                                <SelectTrigger className="h-8"><SelectValue placeholder="Transport" /></SelectTrigger>
                                <SelectContent className="bg-popover">
                                  {TRANSPORT_OPTIONS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                                </SelectContent>
                              </Select>
                              <Select value={f.modem || ''} onValueChange={v => updateFreq(idx, { modem: v })}>
                                <SelectTrigger className="h-8"><SelectValue placeholder="Modem" /></SelectTrigger>
                                <SelectContent className="bg-popover">
                                  {MODEM_OPTIONS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                                </SelectContent>
                              </Select>
                              <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => removeFreq(idx)}>
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            </div>
                          ))}
                          {((editDraft.frequencies as HubFrequency[]) || []).length === 0 && (
                            <div className="text-xs text-muted-foreground italic">No frequencies. Click Add to create one.</div>
                          )}
                        </div>
                      </div>

                      <div>
                        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Notes</Label>
                        <Textarea
                          className="text-xs"
                          rows={2}
                          value={editDraft.notes || ''}
                          onChange={e => updateDraft({ notes: e.target.value })}
                        />
                      </div>
                    </div>
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
