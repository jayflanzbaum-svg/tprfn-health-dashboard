import { Link } from 'react-router-dom';
import { SUPPORT_EMAIL } from '@/lib/smsProgram';

export default function About() {
  return (
    <main className="min-h-screen bg-background">
      <article className="max-w-2xl mx-auto px-4 py-10 space-y-4 text-sm leading-relaxed">
        <Link to="/alerts" className="text-muted-foreground hover:underline">← Sign up for alerts</Link>
        <h1 className="text-2xl font-semibold">About TPRFN Hub Alerts</h1>
        <p><strong>What it is:</strong> TPRFN Hub Alerts provides free, opt-in text alerts to amateur radio TPRFN hub operators when a hub goes down or recovers.</p>
        <p><strong>Double opt-in:</strong> after signing up, you must reply YES to the confirmation text before alerts begin.</p>
        <p><strong>Message frequency:</strong> varies. Msg &amp; data rates may apply.</p>
        <p><strong>Help and opting out:</strong> reply HELP for help or STOP at any time to opt out.</p>
        <p><strong>Who runs it:</strong> Jason Flanzbaum, N8FLA, Delray Beach, Florida.</p>
        <p><strong>Contact:</strong> <a className="underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</p>
        <p>
          Visit the <Link to="/alerts" className="underline">text alert sign-up page</Link>, read the{' '}
          <Link to="/sms-terms" className="underline">SMS Terms</Link>, or see our{' '}
          <Link to="/privacy" className="underline">Privacy Policy</Link>.
        </p>
      </article>
    </main>
  );
}
