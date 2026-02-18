import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { DEFAULT_ALLOWED_CALLSIGNS } from '@/lib/syslogParser';
import { toast } from '@/hooks/use-toast';

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
      
      if (error) {
        console.error('Failed to load hub callsigns:', error);
      } else if (data && data.length > 0) {
        setCallsigns(data.map(r => r.callsign));
      }
      setLoaded(true);
    };
    load();
  }, []);

  const updateCallsigns = useCallback(async (newCallsigns: string[]) => {
    const sorted = [...newCallsigns].sort();
    
    // Optimistically update UI
    setCallsigns(sorted);

    // Sync to database: delete removed, insert added
    const { data: existing, error: fetchError } = await supabase
      .from('hub_callsigns')
      .select('callsign');
    
    if (fetchError) {
      console.error('Failed to fetch existing callsigns:', fetchError);
      toast({ title: 'Failed to save callsigns', description: fetchError.message, variant: 'destructive' });
      return;
    }

    const existingSet = new Set((existing || []).map(r => r.callsign));
    const newSet = new Set(sorted);

    const toInsert = sorted.filter(c => !existingSet.has(c));
    const toDelete = [...existingSet].filter(c => !newSet.has(c));

    if (toDelete.length > 0) {
      const { error } = await supabase.from('hub_callsigns').delete().in('callsign', toDelete);
      if (error) {
        console.error('Failed to delete callsigns:', error);
        toast({ title: 'Failed to remove callsigns', description: error.message, variant: 'destructive' });
      }
    }
    if (toInsert.length > 0) {
      const { error } = await supabase.from('hub_callsigns').insert(toInsert.map(c => ({ callsign: c })));
      if (error) {
        console.error('Failed to insert callsigns:', error);
        toast({ title: 'Failed to save callsigns', description: error.message, variant: 'destructive' });
      }
    }
  }, []);

  return { callsigns, updateCallsigns, loaded };
}
