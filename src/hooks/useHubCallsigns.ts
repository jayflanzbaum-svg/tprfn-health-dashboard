import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Single source of truth for tracked hub callsigns: the Hub Directory (hub_profiles).
 * Callsigns are the base callsign (SSID stripped), uppercased and de-duplicated.
 */
export function useHubCallsigns() {
  const [callsigns, setCallsigns] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('hub_profiles')
      .select('base_callsign')
      .eq('is_active', true)
      .order('base_callsign');

    if (error) {
      console.error('Failed to load hub directory callsigns:', error);
    } else {
      const unique = Array.from(
        new Set((data || []).map(r => (r.base_callsign || '').toUpperCase().trim()).filter(Boolean))
      ).sort();
      setCallsigns(unique);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    load();

    const channel = supabase
      .channel('hub_profiles_callsigns')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hub_profiles' }, () => {
        load();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  return { callsigns, loaded, refresh: load };
}
