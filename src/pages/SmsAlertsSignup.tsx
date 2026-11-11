import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useHubCallsigns } from '@/hooks/useHubCallsigns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle2, Loader2, MessageSquare } from 'lucide-react';

export default function SmsAlertsSignup() {
  const { callsigns } = useHubCallsigns();
  const [hub, setHub] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!hub) return setError('Pick a hub.');
    if (phone.replace(/\D/g, '').length < 10) return setError('Enter a 10-digit mobile number.');
    setBusy(true);
    // Anonymous call (no session) so it is always recorded as a self sign-up
    const { data, error: err } = await supabase.functions.invoke('send-sms', {
      body: { hub, name: name.trim() || undefined, phone, consent },
      headers: { Authorization: '' },
    });
    setBusy(false);
    if (err || data?.error) {
      let details = typeof data?.error === 'string' ? data.error : null;
      if (err && 'context' in err) { try { details = (await (err as { context: Response }).context.json()).error; } catch { /* ignore */ } }
      return setError(typeof details === 'string' ? details : 'Something went wrong. Please try again.');
    }
    setDone(data.status === 'already_active'
      ? `You're already subscribed to alerts for ${hub}.`
      : data.send === 'pending_approval'
        ? 'You are signed up. Text alerts are pending carrier approval; you will get a confirmation text once they start. Reply YES to it to confirm.'
        : 'Check your phone and reply YES to confirm.');
  };

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-xl mx-auto px-4 py-10">
        <Link to="/" className="text-sm text-muted-foreground hover:underline">← TPRFN Health Dashboard</Link>
        <h1 className="mt-4 text-2xl font-semibold flex items-center gap-2">
          <MessageSquare className="h-6 w-6 text-primary" /> TPRFN Hub Alerts
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Get a text when a TPRFN hub station you care about stops connecting to the network, and another when it recovers.
          Run by Jason Flanzbaum, N8FLA, for The Packet Radio Forwarding Network.
        </p>

        {done ? (
          <div className="mt-6 rounded-lg border bg-card p-5 flex gap-3">
            <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
            <p className="text-sm">{done}</p>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4 rounded-lg border bg-card p-5">
            <div className="space-y-1.5">
              <Label htmlFor="hub">Hub</Label>
              <Select value={hub} onValueChange={setHub}>
                <SelectTrigger id="hub" className="bg-background"><SelectValue placeholder="Choose a hub" /></SelectTrigger>
                <SelectContent className="bg-popover">
                  {callsigns.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="name">Name or callsign</Label>
              <Input id="name" value={name} onChange={e => setName(e.target.value)} maxLength={80} placeholder="e.g. N8FLA" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Mobile number</Label>
              <Input id="phone" type="tel" inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} maxLength={16} placeholder="(555) 123-4567" />
            </div>
            <div className="flex items-start gap-3 rounded-md border p-3">
              <Checkbox id="consent" checked={consent} onCheckedChange={v => setConsent(v === true)} className="mt-0.5" />
              <Label htmlFor="consent" className="text-sm font-normal leading-relaxed">
                I agree to receive automated TPRFN text alerts at this number when the selected hub goes down or recovers.
                Message frequency varies (about 1-10 per month). Msg &amp; data rates may apply. Reply HELP for help, STOP to opt out.
                Consent is not a condition of anything. See <Link to="/sms-terms" className="underline">SMS Terms</Link> and{' '}
                <Link to="/privacy" className="underline">Privacy Policy</Link>.
              </Label>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={!consent || busy} className="w-full gap-2">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Sign up for text alerts
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}
