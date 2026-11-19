import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { hasAdminRole } from '@/lib/adminAccess';
import type { User, Session } from '@supabase/supabase-js';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [roleLoading, setRoleLoading] = useState(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let active = true;

    if (!user) {
      setIsAdmin(false);
      setRoleLoading(false);
      return () => { active = false; };
    }

    setRoleLoading(true);
    setIsAdmin(false);

    supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          console.error('Could not load account roles:', error.message);
          setIsAdmin(false);
        } else {
          setIsAdmin(hasAdminRole((data ?? []).map(row => row.role)));
        }
        setRoleLoading(false);
      });

    return () => { active = false; };
  }, [user?.id]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    return { error };
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    return { error };
  };

  const updatePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return {
    user,
    session,
    loading: loading || (user !== null && roleLoading),
    isAdmin: user !== null && isAdmin,
    signIn,
    signUp,
    resetPassword,
    updatePassword,
    signOut,
  };
}
