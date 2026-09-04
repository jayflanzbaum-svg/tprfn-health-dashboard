import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { BellRing, BellOff, Plus, X, Save, Loader2, MessageSquare, Mail } from 'lucide-react';

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
// Sentinel: threshold 0 = test mode, sends a test message on every 5-minute check
const TEST_THRESHOLD = 0;

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
  callsign: string;
}

export function StationAlertEditor({ callsign: raw }: Props) {
  const callsign = raw.toUpperCase();
  const [open, setOpen] = useState(false);
  const [cfg, setCfg] = useState<AlertConfig>(emptyConfig(callsign));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [emailDraft, setEmailDraft] = useState('');
  const [smsPhone, setSmsPhone] = useState('');
  const [smsCarrier, setSmsCarrier] = useState('');

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const { data, error } = await supabase
        .from('station_alert_configs')
        .select('*')
        .eq('callsign', callsign)
        .maybeSingle();
      if (!alive) return;
      if (!error && data) setCfg(data as AlertConfig);
      setLoading(false);
    };
    load();
    return () => { alive = false; };
  }, [callsign]);

  const patch = (changes: Partial<AlertConfig>) => setCfg(prev => ({ ...prev, ...changes }));

  const save = async () => {
    setSaving(true);
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
    setSaving(false);
    if (error) {
      toast({ title: `Could not save ${callsign}`, description: error.message, variant: 'destructive' });
      return;
    }
    if (data) setCfg(data as AlertConfig);
    toast({ title: `Alert settings saved for ${callsign}` });
    setOpen(false);
  };

  const addEmail = () => {
    const value = emailDraft.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      toast({ title: 'Enter a valid email address', variant: 'destructive' });
      return;
    }
    if (cfg.email_recipients.includes(value)) {
      toast({ title: 'Already added', variant: 'destructive' });
      return;
    }
    patch({ email_recipients: [...cfg.email_recipients, value] });
    setEmailDraft('');
  };

  const addSms = () => {
    const digits = smsPhone.replace(/\D/g, '');
    if (digits.length !== 10) {
      toast({ title: 'Enter a 10-digit mobile number', variant: 'destructive' });
      return;
    }
    if (!smsCarrier) {
      toast({ title: 'Pick a carrier', variant: 'destructive' });
      return;
    }
    const address = `${digits}@${smsCarrier}`;
    if (cfg.sms_recipients.includes(address)) {
      toast({ title: 'Already added', variant: 'destructive' });
      return;
    }
    patch({ sms_recipients: [...cfg.sms_recipients, address] });
    setSmsPhone('');
  };

  const recipients = cfg.email_recipients.length + cfg.sms_recipients.length;
  const active = cfg.enabled && recipients > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          title={active ? `Alerts on · ${cfg.threshold_hours}h · ${recipients} recipient(s)` : 'Alerts off'}
        >
          {active ? <BellRing className="h-4 w-4 text-primary" /> : <BellOff className="h-4 w-4 text-muted-foreground" />}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl bg-background z-[1100]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BellRing className="h-4 w-4 text-primary" />
            <span className="font-mono">{callsign}</span> Down Alerts
            {cfg.current_state === 'down' && <Badge variant="destructive">Down</Badge>}
          </DialogTitle>
          <DialogDescription>
            Notifications sent when this hub goes silent longer than its threshold. Texts are delivered
            through carrier email-to-SMS gateways.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading alert settings…
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-6">
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={cfg.enabled} onCheckedChange={v => patch({ enabled: v })} />
                Alerts enabled
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={cfg.notify_recovery} onCheckedChange={v => patch({ notify_recovery: v })} />
                Recovery notice
              </label>
              <label className="flex items-center gap-2 text-sm">
                Threshold
                <Select value={String(cfg.threshold_hours)} onValueChange={v => patch({ threshold_hours: Number(v) })}>
                  <SelectTrigger className="w-40 h-9 bg-background"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-popover z-[1200]">
                    {THRESHOLDS.map(h => <SelectItem key={h} value={String(h)}>{h} hours</SelectItem>)}
                    <SelectItem value={String(TEST_THRESHOLD)}>TEST · every 5 min</SelectItem>
                  </SelectContent>
                </Select>
              </label>
            </div>

            {cfg.threshold_hours === TEST_THRESHOLD && (
              <p className="text-xs rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-700 dark:text-amber-300">
                Test mode: a test message goes to every recipient below every 5 minutes until you pick a
                real threshold again.
              </p>
            )}

            <div>
              <p className="text-sm font-medium mb-2 flex items-center gap-1.5">
                <Mail className="h-4 w-4" /> Email recipients
              </p>
              <div className="flex flex-wrap gap-2 mb-2">
                {cfg.email_recipients.map(email => (
                  <span key={email} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-muted text-sm">
                    {email}
                    <button type="button" onClick={() => patch({ email_recipients: cfg.email_recipients.filter(e => e !== email) })}>
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
                {cfg.email_recipients.length === 0 && <span className="text-sm text-muted-foreground">None yet</span>}
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="operator@example.com"
                  value={emailDraft}
                  onChange={e => setEmailDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addEmail(); } }}
                  className="flex-1"
                />
                <Button size="sm" variant="secondary" onClick={addEmail} className="gap-1">
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
                    <button type="button" onClick={() => patch({ sms_recipients: cfg.sms_recipients.filter(s => s !== addr) })}>
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
                {cfg.sms_recipients.length === 0 && <span className="text-sm text-muted-foreground">None yet</span>}
              </div>
              <div className="flex flex-wrap gap-2">
                <Input
                  placeholder="5551234567"
                  value={smsPhone}
                  onChange={e => setSmsPhone(e.target.value)}
                  className="w-40 font-mono"
                  maxLength={14}
                />
                <Select value={smsCarrier} onValueChange={setSmsCarrier}>
                  <SelectTrigger className="w-52 bg-background"><SelectValue placeholder="Carrier" /></SelectTrigger>
                  <SelectContent className="bg-popover z-[1200]">
                    {CARRIERS.map(c => <SelectItem key={c.domain} value={c.domain}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="secondary" onClick={addSms} className="gap-1">
                  <Plus className="h-4 w-4" /> Add
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between border-t pt-3">
              <span className="text-xs text-muted-foreground">
                {cfg.last_alert_sent_at
                  ? `Last alert sent ${new Date(cfg.last_alert_sent_at).toUTCString()}`
                  : 'No alerts sent yet'}
              </span>
              <Button size="sm" onClick={save} disabled={saving} className="gap-1">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
