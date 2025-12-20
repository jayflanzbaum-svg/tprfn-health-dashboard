import { useState, useEffect } from 'react';
import { parseSyslog, ParsedData } from '@/lib/syslogParser';

export function useSyslogData() {
  const [data, setData] = useState<ParsedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const response = await fetch('/data/syslog.txt');
        if (!response.ok) {
          throw new Error('Failed to load syslog data');
        }
        const content = await response.text();
        const parsed = parseSyslog(content);
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
