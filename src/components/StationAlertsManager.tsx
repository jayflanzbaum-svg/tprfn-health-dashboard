import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { BellRing, Plus, X, Save, Loader2, MessageSquare, Mail } from 'lucide-react';

interface AlertConfig {
  id?: string;
  callsign: string;
  enabled: boolean;
  threshold_hours: number;
  email_recipients: string[];
  sms_recipients: string[];
  notify_recovery: boolean;
  current_state?: string;
  last_alert_sent_at?: string | null;
}

const THRESHOLDS = [1, 2, 4, 6, 12, 24, 48, 72];

// Carrier email-to-SMS gateways (US/CA)
const CARRIERS: { label: string; domain: string }[] = [
  { label: 'AT&T', domain: 'txt.att.net' },
  { label: 'Verizon', domain: 'vtext.com' },
  { label: 'T-Mobile', domain: 'tmomail.net' },
  { label: 'Sprint', domain: 'messaging.sprintpcs.com' },
  { label: 'US Cellular', domain: 'email.uscc.net' },
  { label: 'Boost Mobile', domain: 'sms.myboostmobile.com' },
  { label: 'Cricket', domain: 'sms.cricketwireless.net' },
  { label: 'Google Fi', domain: 'msg.fi.google.com' },
  { label: 'Metro by T-Mobile', domain: 'mymetropcs.com' },
  { label: 'Mint Mobile', domain: 'mailmymobile.net' },
  { label: 'Bell (CA)', domain: 'txt.bell.ca' },
  { label: 'Rogers (CA)', domain: 'pcs.rogers.com' },
  { label: 'Telus (CA)', domain: 'msg.telus.com' },
  { label: 'Fido (CA)', domain: 'fido.ca' },
];

function emptyConfig(callsign: string): AlertConfig {
  return {
    callsign,
    enabled: true,
    threshold_hours: 24,
    email_recipients: [],
    sms_recipients: [],
    notify_recovery: true,
  };
}

interface Props {
  allowedCallsigns: string[];
}

export function StationAlertsManager({ allowedCallsigns }: Props) {
  const { user } = useAuth();
  const [configs, setConfigs] = useState<Record<string, AlertConfig>>({});
  const [loading, setLoading] = useState(true);
  const [savingCallsign, setSavingCallsign] = useState<string | null>(null);
  const [emailDrafts, setEmailDrafts] = useState<Record<string, string>>({});
  const [smsPhone, setSmsPhone] = useState<Record<string, string>>({});
  const [smsCarrier, setSmsCarrier] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    const load = async () => {
      const { data, error } = await supabase
        .from('station_alert_configs')
        .select('*');
      if (error) {
        console.error('Failed to load alert configs', error);
      } else {
        const map: Record<string, AlertConfig> = {};
        for (const row of data ?? []) {
          map[row.callsign.toUpperCase()] = row as AlertConfig;
        }
        setConfigs(map);
      }
      setLoading(false);
    };
    load();
  }, [user]);

  const stations = useMemo(
    () => [...allowedCallsigns].map(c => c.toUpperCase()).sort(),
    [allowedCallsigns]
  );

  const getConfig = (callsign: string) => configs[callsign] ?? emptyConfig(callsign);

  const patch = (callsign: string, changes: Partial<AlertConfig>) => {
    setConfigs(prev => ({
      ...prev,
      [callsign]: { ...getConfig(callsign), ...changes },
    }));
  };

  const save = async (callsign: string) => {
    const cfg = getConfig(callsign);
    setSavingCallsign(callsign);
    const { data, error } = await supabase
      .from('station_alert_configs')
      .upsert(
        {
          callsign,
          enabled: cfg.enabled,
          threshold_hours: cfg.threshold_hours,
          email_recipients: cfg.email_recipients,
          sms_recipients: cfg.sms_recipients,
          notify_recovery: cfg.notify_recovery,
        },
        { onConflict: 'callsign' }
      )
      .select()
      .maybeSingle();
    setSavingCallsign(null);
    if (error) {
      toast({ title: `Could not save ${callsign}`, description: error.message, variant: 'destructive' });
      return;
    }
    if (data) setConfigs(prev => ({ ...prev, [callsign]: data as AlertConfig }));
    toast({ title: `Alert settings saved for ${callsign}` });
  };

  const addEmail = (callsign: string) => {
    const value = (emailDrafts[callsign] ?? '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      toast({ title: 'Enter a valid email address', variant: 'destructive' });
      return;
    }
    const cfg = getConfig(callsign);
    if (cfg.email_recipients.includes(value)) {
      toast({ title: 'Already added', variant: 'destructive' });
      return;
    }
    patch(callsign, { email_recipients: [...cfg.email_recipients, value] });
    setEmailDrafts(prev => ({ ...prev, [callsign]: '' }));
  };

  const addSms = (callsign: string) => {
    const digits = (smsPhone[callsign] ?? '').replace(/\D/g, '');
    const domain = smsCarrier[callsign];
    if (digits.length !== 10) {
      toast({ title: 'Enter a 10-digit mobile number', variant: 'destructive' });
      return;
    }
    if (!domain) {
      toast({ title: 'Pick a carrier', variant: 'destructive' });
      return;
    }
    const address = `${digits}@${domain}`;
    const cfg = getConfig(callsign);
    if (cfg.sms_recipients.includes(address)) {
      toast({ title: 'Already added', variant: 'destructive' });
      return;
    }
    patch(callsign, { sms_recipients: [...cfg.sms_recipients, address] });
    setSmsPhone(prev => ({ ...prev, [callsign]: '' }));
  };

  if (!user) return null;

  return (
    <div className="chart-card">
      <div className="mb-4 flex items-start gap-2">
        <BellRing className="h-5 w-5 text-primary mt-0.5" />
        <div>
          <h3 className="text-lg font-semibold text-foreground">Station Down Alerts</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Configure per-station notifications sent when a hub goes silent longer than its threshold.
            Text messages are delivered through carrier email-to-SMS gateways.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading alert settings…
        </div>
      ) : (
        <div className="space-y-2">
          {stations.map(callsign => {
            const cfg = getConfig(callsign);
            const isOpen = expanded === callsign;
            const recipients = cfg.email_recipients.length + cfg.sms_recipients.length;
            return (
              <div key={callsign} className="border border-border rounded-lg bg-background">
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : callsign)}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left"
                >
                  <span className="flex items-center gap-2">
                    <span className="font-mono font-semibold">{callsign}</span>
                    {cfg.enabled && recipients > 0 ? (
                      <Badge variant="secondary">{cfg.threshold_hours}h · {recipients} recipient{recipients === 1 ? '' : 's'}</Badge>
                    ) : (
                      <Badge variant="outline">Alerts off</Badge>
                    )}
                    {cfg.current_state === 'down' && (
                      <Badge variant="destructive">Down</Badge>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">{isOpen ? 'Hide' : 'Edit'}</span>
                </button>

                {isOpen && (
                  <div className="px-3 pb-3 pt-1 space-y-4 border-t border-border">
                    <div className="flex flex-wrap items-center gap-6 pt-3">
                      <label className="flex items-center gap-2 text-sm">
                        <Switch
                          checked={cfg.enabled}
                          onCheckedChange={v => patch(callsign, { enabled: v })}
                        />
                        Alerts enabled
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <Switch
                          checked={cfg.notify_recovery}
                          onCheckedChange={v => patch(callsign, { notify_recovery: v })}
                        />
                        Send recovery notice
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        Silence threshold
                        <Select
                          value={String(cfg.threshold_hours)}
                          onValueChange={v => patch(callsign, { threshold_hours: Number(v) })}
                        >
                          <SelectTrigger className="w-28 h-9 bg-background">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-background z-50">
                            {THRESHOLDS.map(h => (
                              <SelectItem key={h} value={String(h)}>{h} hours</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </label>
                    </div>

                    <div>
                      <p className="text-sm font-medium mb-2 flex items-center gap-1.5">
                        <Mail className="h-4 w-4" /> Email recipients
                      </p>
                      <div className="flex flex-wrap gap-2 mb-2">
                        {cfg.email_recipients.map(email => (
                          <span key={email} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-muted text-sm">
                            {email}
                            <button
                              type="button"
                              onClick={() => patch(callsign, { email_recipients: cfg.email_recipients.filter(e => e !== email) })}
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </span>
                        ))}
                        {cfg.email_recipients.length === 0 && (
                          <span className="text-sm text-muted-foreground">None yet</span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Input
                          placeholder="operator@example.com"
                          value={emailDrafts[callsign] ?? ''}
                          onChange={e => setEmailDrafts(prev => ({ ...prev, [callsign]: e.target.value }))}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addEmail(callsign); } }}
                          className="flex-1"
                        />
                        <Button size="sm" variant="secondary" onClick={() => addEmail(callsign)} className="gap-1">
                          <Plus className="h-4 w-4" /> Add
                        </Button>
                      </div>
                    </div>

                    <div>
                      <p className="text-sm font-medium mb-2 flex items-center gap-1.5">
                        <MessageSquare className="h-4 w-4" /> Text message recipients
                      </p>
                      <div className="flex flex-wrap gap-2 mb-2">
                        {cfg.sms_recipients.map(addr => (
                          <span key={addr} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-muted text-sm font-mono">
                            {addr}
                            <button
                              type="button"
                              onClick={() => patch(callsign, { sms_recipients: cfg.sms_recipients.filter(s => s !== addr) })}
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </span>
                        ))}
                        {cfg.sms_recipients.length === 0 && (
                          <span className="text-sm text-muted-foreground">None yet</span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Input
                          placeholder="5551234567"
                          value={smsPhone[callsign] ?? ''}
                          onChange={e => setSmsPhone(prev => ({ ...prev, [callsign]: e.target.value }))}
                          className="w-40 font-mono"
                          maxLength={14}
                        />
                        <Select
                          value={smsCarrier[callsign] ?? ''}
                          onValueChange={v => setSmsCarrier(prev => ({ ...prev, [callsign]: v }))}
                        >
                          <SelectTrigger className="w-52 bg-background">
                            <SelectValue placeholder="Carrier" />
                          </SelectTrigger>
                          <SelectContent className="bg-background z-50">
                            {CARRIERS.map(c => (
                              <SelectItem key={c.domain} value={c.domain}>{c.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button size="sm" variant="secondary" onClick={() => addSms(callsign)} className="gap-1">
                          <Plus className="h-4 w-4" /> Add
                        </Button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        {cfg.last_alert_sent_at
                          ? `Last alert sent ${new Date(cfg.last_alert_sent_at).toUTCString()}`
                          : 'No alerts sent yet'}
                      </span>
                      <Button size="sm" onClick={() => save(callsign)} disabled={savingCallsign === callsign} className="gap-1">
                        {savingCallsign === callsign ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Save
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {stations.length === 0 && (
            <p className="text-sm text-muted-foreground">Add hub callsigns first to configure alerts.</p>
          )}
        </div>
      )}
    </div>
  );
}
