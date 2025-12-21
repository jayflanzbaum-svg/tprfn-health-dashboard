import { useState, useEffect, useCallback } from 'react';
import { parseSyslog, ParsedData, setAllowedCallsigns } from '@/lib/syslogParser';
import { supabase } from '@/integrations/supabase/client';

export function useSyslogData(allowedCallsigns: string[]) {
  const [data, setData] = useState<ParsedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rawContent, setRawContent] = useState<string | null>(null);

  // Fetch raw data
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
        
        setRawContent(response.content);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  // Re-parse when callsigns change
  useEffect(() => {
    if (rawContent) {
      setAllowedCallsigns(allowedCallsigns);
      const parsed = parseSyslog(rawContent);
      setData(parsed);
    }
  }, [rawContent, allowedCallsigns]);

  const refetch = useCallback(async () => {
    try {
      setLoading(true);
      const { data: response, error: fnError } = await supabase.functions.invoke('fetch-syslog');
      
      if (fnError) throw new Error(fnError.message);
      if (response?.error) throw new Error(response.error);
      
      setRawContent(response.content);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, loading, error, refetch };
}
