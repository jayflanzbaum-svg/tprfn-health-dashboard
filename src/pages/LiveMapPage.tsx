import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDatabaseData } from '@/hooks/useDatabaseData';
import { useStationLocations } from '@/hooks/useStationLocations';
import { LiveStationMap } from '@/components/LiveStationMap';
import { LoadingState } from '@/components/LoadingState';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { DEFAULT_ALLOWED_CALLSIGNS } from '@/lib/syslogParser';

const LiveMapPage = () => {
  const navigate = useNavigate();
  const [allowedCallsigns] = useState<string[]>([...DEFAULT_ALLOWED_CALLSIGNS].sort());
  const { data, loading, error } = useDatabaseData(allowedCallsigns);
  const { locations, distances, lookupCallsigns } = useStationLocations();

  // Auto-fetch locations for all stations when data loads
  useEffect(() => {
    if (data && data.stations.size > 0) {
      const callsigns = Array.from(data.stations);
      lookupCallsigns(callsigns);
    }
  }, [data?.stations.size]);

  if (loading) {
    return <LoadingState message="Loading map data..." />;
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-destructive mb-4">{error || 'Failed to load data'}</p>
          <Button onClick={() => navigate('/')}>Return to Dashboard</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-4 max-w-full">
        <div className="mb-4 flex items-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/')}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Button>
          <h1 className="text-xl font-bold">Live Station Map</h1>
        </div>
        
        <LiveStationMap
          locations={locations}
          hubConnections={data.hubConnections}
          distances={distances}
          hubCallsigns={allowedCallsigns}
          isFullscreen={true}
        />
      </div>
    </div>
  );
};

export default LiveMapPage;