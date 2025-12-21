import { useState, useEffect } from 'react';
import { parseSyslog, ParsedData } from '@/lib/syslogParser';
import { supabase } from '@/integrations/supabase/client';

export function useSyslogData() {
  const [data, setData] = useState<ParsedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        
        const { data: response, error: fnError } = await supabase.functions.invoke('fetch-syslog');
        
        if (fnError) {
          throw new Error(fnError.message);
        }
        
        if (response?.error) {
          throw new Error(response.error);
        }
        
        const parsed = parseSyslog(response.content);
        setData(parsed);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  return { data, loading, error };
}
