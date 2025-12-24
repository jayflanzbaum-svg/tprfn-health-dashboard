import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Upload, CheckCircle, AlertCircle } from 'lucide-react';

interface ImportStats {
  processed: number;
  inserted: number;
  errors: number;
}

interface ImportResponse {
  success: boolean;
  stats: ImportStats;
  nextByte: number | null;
  totalSize: number;
  complete: boolean;
  error?: string;
}

export default function ImportSyslog() {
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [totalStats, setTotalStats] = useState<ImportStats>({ processed: 0, inserted: 0, errors: 0 });
  const [currentByte, setCurrentByte] = useState(0);
  const [totalSize, setTotalSize] = useState(0);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [dropboxUrl, setDropboxUrl] = useState('https://www.dropbox.com/scl/fi/14dart6eh5kjt163agkks/2025.txt?rlkey=wbvrn7r2hgz184avxcvaon9wg&st=uh5zoro1&dl=0');
  const [forcedYear, setForcedYear] = useState(2025);
  const chunkSize = 5000000; // 5MB chunks

  const importChunk = useCallback(async (startByte: number): Promise<ImportResponse | null> => {
    try {
      const { data, error } = await supabase.functions.invoke('import-syslog', {
        body: { url: dropboxUrl, startByte, chunkSize, year: forcedYear }
      });

      if (error) throw error;
      return data as ImportResponse;
    } catch (err) {
      console.error('Import chunk error:', err);
      return null;
    }
  }, [dropboxUrl, forcedYear]);

  const startImport = async () => {
    setImporting(true);
    setProgress(0);
    setTotalStats({ processed: 0, inserted: 0, errors: 0 });
    setCurrentByte(0);
    setComplete(false);
    setError(null);

    let nextByte: number | null = 0;
    let accumulatedStats: ImportStats = { processed: 0, inserted: 0, errors: 0 };

    while (nextByte !== null) {
      const result = await importChunk(nextByte);
      
      if (!result) {
        setError('Import failed - check console for details');
        break;
      }

      if (result.error) {
        setError(result.error);
        break;
      }

      accumulatedStats = {
        processed: accumulatedStats.processed + result.stats.processed,
        inserted: accumulatedStats.inserted + result.stats.inserted,
        errors: accumulatedStats.errors + result.stats.errors,
      };

      setTotalStats(accumulatedStats);
      setTotalSize(result.totalSize);
      setCurrentByte(result.nextByte || result.totalSize);
      setProgress(((result.nextByte || result.totalSize) / result.totalSize) * 100);

      if (result.complete) {
        setComplete(true);
        nextByte = null;
      } else {
        nextByte = result.nextByte;
      }
    }

    setImporting(false);
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Import Historical Syslog Data
            </CardTitle>
            <CardDescription>
              Import 2 years of syslog data from Dropbox (261MB file)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {!importing && !complete && (
              <Button onClick={startImport} size="lg" className="w-full">
                Start Import
              </Button>
            )}

            {importing && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Importing data...</span>
                </div>
                <Progress value={progress} className="h-3" />
                <div className="text-sm text-muted-foreground">
                  {(currentByte / 1024 / 1024).toFixed(1)} MB / {(totalSize / 1024 / 1024).toFixed(1)} MB
                </div>
              </div>
            )}

            {complete && (
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="h-5 w-5" />
                <span>Import complete!</span>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-5 w-5" />
                <span>{error}</span>
              </div>
            )}

            {(importing || complete) && (
              <div className="grid grid-cols-3 gap-4 pt-4 border-t">
                <div className="text-center">
                  <div className="text-2xl font-bold">{totalStats.processed.toLocaleString()}</div>
                  <div className="text-sm text-muted-foreground">Processed</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{totalStats.inserted.toLocaleString()}</div>
                  <div className="text-sm text-muted-foreground">Inserted</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-destructive">{totalStats.errors.toLocaleString()}</div>
                  <div className="text-sm text-muted-foreground">Errors</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}