import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Lock, LogOut, Loader2, KeyRound } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';

interface AuthGuardProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function AuthGuard({ children, fallback }: AuthGuardProps) {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (!user) return <>{fallback}</> || null;
  return <>{children}</>;
}

export function LoginButton() {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);

  if (user) {
    return (
      <>
        <Button variant="ghost" size="sm" onClick={() => setPwOpen(true)} className="gap-1.5 text-xs">
          <KeyRound className="h-3.5 w-3.5" />
          Change Password
        </Button>
        <Button variant="ghost" size="sm" onClick={signOut} className="gap-1.5 text-xs">
          <LogOut className="h-3.5 w-3.5" />
          Sign Out
        </Button>
        <ChangePasswordDialog open={pwOpen} onOpenChange={setPwOpen} />
      </>
    );
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="gap-1.5 text-xs">
        <Lock className="h-3.5 w-3.5" />
        Admin Login
      </Button>
      <LoginDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

function LoginDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { signIn, signUp, resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset'>('signin');
  const [submitting, setSubmitting] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    let error: Error | null = null;
    if (mode === 'reset') {
      const result = await resetPassword(email);
      error = result.error;
    } else if (mode === 'signup') {
      const result = await signUp(email, password);
      error = result.error;
    } else {
      const result = await signIn(email, password);
      error = result.error;
    }

    setSubmitting(false);

    if (error) {
      toast({
        title: mode === 'reset' ? 'Reset failed' : mode === 'signup' ? 'Sign up failed' : 'Login failed',
        description: error.message,
        variant: 'destructive',
      });
    } else if (mode === 'reset') {
      setResetSent(true);
      toast({ title: 'Check your email', description: 'A password reset link has been sent.' });
    } else {
      toast({ title: mode === 'signup' ? 'Account created!' : 'Logged in!' });
      onOpenChange(false);
      setEmail('');
      setPassword('');
      setMode('signin');
      setResetSent(false);
    }
  };

  const title = mode === 'reset' ? 'Reset Password' : mode === 'signup' ? 'Create Admin Account' : 'Admin Login';
  const description = mode === 'reset'
    ? 'Enter your email to receive a password reset link.'
    : mode === 'signup'
      ? 'Create an account to manage hub callsigns and station locations.'
      : 'Sign in to manage hub callsigns and station locations.';

  return (
    <Dialog open={open} onOpenChange={(open) => { onOpenChange(open); if (!open) { setMode('signin'); setResetSent(false); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {resetSent ? (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              If an account exists for <strong>{email}</strong>, you will receive an email with a link to reset your password.
            </p>
            <Button type="button" variant="outline" className="w-full" onClick={() => { setMode('signin'); setResetSent(false); }}>
              Back to Sign In
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            {mode !== 'reset' && (
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
              </div>
            )}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {mode === 'reset' ? 'Send Reset Link' : mode === 'signup' ? 'Create Account' : 'Sign In'}
            </Button>
            <div className="text-center text-xs text-muted-foreground space-y-1">
              {mode === 'signin' ? (
                <>
                  <p>
                    <button type="button" className="text-accent underline" onClick={() => setMode('reset')}>Forgot password?</button>
                  </p>
                  <p>
                    Don't have an account?{' '}
                    <button type="button" className="text-accent underline" onClick={() => setMode('signup')}>Sign up</button>
                  </p>
                </>
              ) : mode === 'signup' ? (
                <p>
                  Already have an account?{' '}
                  <button type="button" className="text-accent underline" onClick={() => setMode('signin')}>Sign in</button>
                </p>
              ) : (
                <p>
                  Remember your password?{' '}
                  <button type="button" className="text-accent underline" onClick={() => setMode('signin')}>Sign in</button>
                </p>
              )}
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function ChangePasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { updatePassword } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast({ title: 'Passwords do not match', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    const { error } = await updatePassword(password);
    setSubmitting(false);
    if (error) {
      toast({ title: 'Could not update password', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Password updated' });
    setPassword('');
    setConfirm('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change Password</DialogTitle>
          <DialogDescription>Set a new password for your admin account.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-password">New password</Label>
            <Input id="new-password" type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm new password</Label>
            <Input id="confirm-password" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required minLength={8} autoComplete="new-password" />
          </div>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Update Password
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
