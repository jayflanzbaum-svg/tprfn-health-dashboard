import { useState, useEffect, useCallback, useRef } from 'react';
import { parseSyslog, ParsedData, setAllowedCallsigns } from '@/lib/syslogParser';
import { supabase } from '@/integrations/supabase/client';

const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export function useSyslogData(allowedCallsigns: string[]) {
  const [data, setData] = useState<ParsedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rawContent, setRawContent] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const intervalRef = useRef<number | null>(null);

  const fetchData = useCallback(async (isManualRefresh = false) => {
    try {
      if (isManualRefresh) {
        setIsRefreshing(true);
      } else {
        setLoading(true);
      }
      
      console.log('Fetching syslog data...');
      const { data: response, error: fnError } = await supabase.functions.invoke('fetch-syslog');
      
      if (fnError) {
        throw new Error(fnError.message);
      }
      
      if (response?.error) {
        throw new Error(response.error);
      }
      
      setRawContent(response.content);
      setLastUpdated(new Date());
      setError(null);
      console.log('Syslog data updated at:', new Date().toISOString());
    } catch (err) {
      console.error('Error fetching syslog:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // Initial fetch and set up polling
  useEffect(() => {
    fetchData();

    // Set up auto-refresh interval
    intervalRef.current = window.setInterval(() => {
      console.log('Auto-refreshing syslog data...');
      fetchData(true);
    }, REFRESH_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchData]);

  // Re-parse when callsigns change
  useEffect(() => {
    if (rawContent) {
      setAllowedCallsigns(allowedCallsigns);
      const parsed = parseSyslog(rawContent);
      setData(parsed);
    }
  }, [rawContent, allowedCallsigns]);

  const refetch = useCallback(() => {
    return fetchData(true);
  }, [fetchData]);

  return { data, loading, error, refetch, lastUpdated, isRefreshing };
}
