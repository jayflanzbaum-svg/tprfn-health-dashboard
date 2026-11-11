import { Link } from 'react-router-dom';
import { SUPPORT_EMAIL } from '@/lib/smsProgram';

export default function SmsTerms() {
  return (
    <main className="min-h-screen bg-background">
      <article className="max-w-2xl mx-auto px-4 py-10 space-y-4 text-sm leading-relaxed">
        <Link to="/alerts" className="text-muted-foreground hover:underline">← Sign up for alerts</Link>
        <h1 className="text-2xl font-semibold">SMS Terms — TPRFN Hub Alerts</h1>
        <p><strong>Program name:</strong> TPRFN Hub Alerts.</p>
        <p><strong>What we send:</strong> automated down and recovery notices for the TPRFN amateur radio hub stations you choose. No marketing or promotions.</p>
        <p><strong>How you sign up:</strong> on the <Link to="/alerts" className="underline">sign-up page</Link>, then by replying YES to our confirmation text. Nothing else is sent before you confirm.</p>
        <p><strong>Message frequency:</strong> varies, about 1-10 messages per month.</p>
        <p><strong>Cost:</strong> Msg &amp; data rates may apply.</p>
        <p><strong>Help:</strong> reply HELP to any message, or email <a className="underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</p>
        <p><strong>Opt out:</strong> reply STOP at any time. You will get one final confirmation and no further messages. Reply START to sign up again.</p>
        <p>Carriers are not liable for delayed or undelivered messages.</p>
        <p><strong>Who runs it:</strong> Jason Flanzbaum, N8FLA, for the TPRFN (The Packet Radio Forwarding Network) network.</p>
        <p>See also our <Link to="/privacy" className="underline">Privacy Policy</Link>.</p>
      </article>
    </main>
  );
}
