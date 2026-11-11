import { Link } from 'react-router-dom';
import { SUPPORT_EMAIL } from '@/lib/smsProgram';

export default function Privacy() {
  return (
    <main className="min-h-screen bg-background">
      <article className="max-w-2xl mx-auto px-4 py-10 space-y-4 text-sm leading-relaxed">
        <Link to="/alerts" className="text-muted-foreground hover:underline">← Sign up for alerts</Link>
        <h1 className="text-2xl font-semibold">Privacy Policy — TPRFN Hub Alerts</h1>
        <p><strong>What we collect:</strong> your name or callsign, mobile phone number, the hub(s) you chose, and the time you signed up and confirmed (your consent record).</p>
        <p><strong>Why:</strong> only to send you the hub alerts you asked for.</p>
        <p><strong>Sharing:</strong> phone numbers and consent are never sold or shared with third parties for marketing.</p>
        <p><strong>Who processes messages:</strong> text messages are sent through Twilio, which processes your number to deliver them.</p>
        <p><strong>Deleting your data:</strong> reply STOP to stop all messages, or email <a className="underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> to have your number and records deleted.</p>
        <p>Operated by Jason Flanzbaum, N8FLA, for the TPRFN network. See also the <Link to="/sms-terms" className="underline">SMS Terms</Link>.</p>
      </article>
    </main>
  );
}
