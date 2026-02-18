import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { DEFAULT_ALLOWED_CALLSIGNS } from '@/lib/syslogParser';

export function useHubCallsigns() {
  const [callsigns, setCallsigns] = useState<string[]>([...DEFAULT_ALLOWED_CALLSIGNS].sort());
  const [loaded, setLoaded] = useState(false);

  // Load from database on mount
  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from('hub_callsigns')
        .select('callsign')
        .order('callsign');
      
      if (!error && data && data.length > 0) {
        setCallsigns(data.map(r => r.callsign));
      }
      setLoaded(true);
    };
    load();
  }, []);

  const updateCallsigns = useCallback(async (newCallsigns: string[]) => {
    const sorted = [...newCallsigns].sort();
    setCallsigns(sorted);

    // Sync to database: delete removed, insert added
    const { data: existing } = await supabase.from('hub_callsigns').select('callsign');
    const existingSet = new Set((existing || []).map(r => r.callsign));
    const newSet = new Set(sorted);

    const toInsert = sorted.filter(c => !existingSet.has(c));
    const toDelete = [...existingSet].filter(c => !newSet.has(c));

    if (toDelete.length > 0) {
      await supabase.from('hub_callsigns').delete().in('callsign', toDelete);
    }
    if (toInsert.length > 0) {
      await supabase.from('hub_callsigns').insert(toInsert.map(c => ({ callsign: c })));
    }
  }, []);

  return { callsigns, updateCallsigns, loaded };
}
