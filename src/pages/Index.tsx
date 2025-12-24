import { useDatabaseData } from '@/hooks/useDatabaseData';
import { DashboardHeader } from '@/components/DashboardHeader';
import { StatsCard } from '@/components/StatsCard';
import { SNByHubChart } from '@/components/charts/SNByHubChart';
import { TXByHubChart } from '@/components/charts/TXByHubChart';
import { SNTimelineChart } from '@/components/charts/SNTimelineChart';
import { SignalQualityPieChart } from '@/components/charts/SignalQualityPieChart';
import { ConnectionSuccessChart } from '@/components/charts/ConnectionSuccessChart';
import { DisconnectAnalysisChart } from '@/components/charts/DisconnectAnalysisChart';
import { BitrateAnalysisChart } from '@/components/charts/BitrateAnalysisChart';
import { StationBitrateChart } from '@/components/charts/StationBitrateChart';
import { PeakBitrateLeaderboard } from '@/components/charts/PeakBitrateLeaderboard';
import { HubConnectionsTable } from '@/components/HubConnectionsTable';
import { LogEntriesTable, LogFilter } from '@/components/LogEntriesTable';
import { LoadingState, ErrorState, EmptyState } from '@/components/LoadingState';
import { formatBytes, getSignalQuality, HubConnection, DEFAULT_ALLOWED_CALLSIGNS } from '@/lib/syslogParser';
import { DateRangeFilter, DateRange, getDefaultDateRange, getComparisonPeriod } from '@/components/DateRangeFilter';
import { CallsignManager } from '@/components/CallsignManager';
import { useMemo, useRef, useState, useTransition } from 'react';
import { toast } from '@/hooks/use-toast';

const Index = () => {
  const [allowedCallsigns, setAllowedCallsigns] = useState<string[]>([...DEFAULT_ALLOWED_CALLSIGNS].sort());
  const { data, loading, error, refetch, lastUpdated, isRefreshing } = useDatabaseData(allowedCallsigns);
  const [logFilter, setLogFilter] = useState<LogFilter>('sn');
  const [selectedStation, setSelectedStation] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>(getDefaultDateRange());
  const [isLoadingLargeRange, setIsLoadingLargeRange] = useState(false);
  const logTableRef = useRef<HTMLDivElement>(null);

  // Filter data based on selected station and date range
  const filteredData = useMemo(() => {
    if (!data) return null;

    const isInDateRange = (timestamp: Date) => {
      return timestamp >= dateRange.start && timestamp <= dateRange.end;
    };

    // Filter S/N records by date and station
    let snRecords = data.snRecords.filter(r => isInDateRange(r.timestamp));
    if (selectedStation) {
      snRecords = snRecords.filter(r => r.station === selectedStation || r.partner === selectedStation);
    }

    // Filter connect records by date and station
    let connectRecords = data.connectRecords.filter(r => isInDateRange(r.timestamp));
    if (selectedStation) {
      connectRecords = connectRecords.filter(r => r.station === selectedStation || r.partner === selectedStation);
    }

    // Filter disconnect records by date and station
    let disconnectRecords = data.disconnectRecords.filter(r => isInDateRange(r.timestamp));
    if (selectedStation) {
      disconnectRecords = disconnectRecords.filter(r => r.station === selectedStation || r.partner === selectedStation);
    }

    // Rebuild hub connections from filtered records
    const hubConnections = new Map<string, HubConnection>();
    
    // Process filtered S/N records
    snRecords.forEach(record => {
      const sorted = [record.station, record.partner].sort();
      const connectionId = `${sorted[0]}↔${sorted[1]}`;
      
      if (!hubConnections.has(connectionId)) {
        hubConnections.set(connectionId, {
          station1: sorted[0],
          station2: sorted[1],
          connectionId,
          snRecords: [],
          connectRecords: [],
          disconnectRecords: [],
          avgSN: 0,
          totalTxBytes: 0,
          totalRxBytes: 0,
          sessionCount: 0
        });
      }
      hubConnections.get(connectionId)!.snRecords.push(record);
    });

    // Process filtered connect records
    connectRecords.forEach(record => {
      const sorted = [record.station, record.partner].sort();
      const connectionId = `${sorted[0]}↔${sorted[1]}`;
      
      if (!hubConnections.has(connectionId)) {
        hubConnections.set(connectionId, {
          station1: sorted[0],
          station2: sorted[1],
          connectionId,
          snRecords: [],
          connectRecords: [],
          disconnectRecords: [],
          avgSN: 0,
          totalTxBytes: 0,
          totalRxBytes: 0,
          sessionCount: 0
        });
      }
      const hub = hubConnections.get(connectionId)!;
      hub.connectRecords.push(record);
      hub.sessionCount++;
    });

    // Process filtered disconnect records
    disconnectRecords.forEach(record => {
      const sorted = [record.station, record.partner].sort();
      const connectionId = `${sorted[0]}↔${sorted[1]}`;
      
      if (hubConnections.has(connectionId)) {
        const hub = hubConnections.get(connectionId)!;
        hub.disconnectRecords.push(record);
        hub.totalTxBytes += record.txBytes;
        hub.totalRxBytes += record.rxBytes;
      }
    });

    // Calculate averages
    hubConnections.forEach(hub => {
      if (hub.snRecords.length > 0) {
        hub.avgSN = hub.snRecords.reduce((sum, r) => sum + r.snValue, 0) / hub.snRecords.length;
      }
    });

    return {
      ...data,
      snRecords,
      connectRecords,
      disconnectRecords,
      hubConnections,
    };
  }, [data, selectedStation, dateRange]);

  // Calculate comparison period data
  const comparisonData = useMemo(() => {
    if (!data || !dateRange || dateRange.preset === 'all') return null;

    const comparison = getComparisonPeriod(dateRange);
    const isInPeriod = (timestamp: Date) => {
      return timestamp >= comparison.start && timestamp <= comparison.end;
    };

    const snRecords = data.snRecords.filter(r => isInPeriod(r.timestamp));
    const connectRecords = data.connectRecords.filter(r => isInPeriod(r.timestamp));
    const disconnectRecords = data.disconnectRecords.filter(r => isInPeriod(r.timestamp));

    const avgSN = snRecords.length > 0
      ? snRecords.reduce((sum, r) => sum + r.snValue, 0) / snRecords.length
      : 0;

    const totalTx = disconnectRecords.reduce((sum, r) => sum + r.txBytes, 0);
    const totalRx = disconnectRecords.reduce((sum, r) => sum + r.rxBytes, 0);

    const excellentCount = snRecords.filter(r => 
      getSignalQuality(r.snValue) === 'excellent' || getSignalQuality(r.snValue) === 'good'
    ).length;
    const successRate = snRecords.length > 0 
      ? (excellentCount / snRecords.length) * 100
      : 0;

    return {
      label: comparison.label,
      avgSN,
      totalSessions: connectRecords.length,
      totalData: totalTx + totalRx,
      snReadings: snRecords.length,
      successRate,
    };
  }, [data, dateRange]);

  const stats = useMemo(() => {
    if (!filteredData) return null;

    const avgSN = filteredData.snRecords.length > 0
      ? filteredData.snRecords.reduce((sum, r) => sum + r.snValue, 0) / filteredData.snRecords.length
      : 0;

    const totalTx = filteredData.disconnectRecords.reduce((sum, r) => sum + r.txBytes, 0);
    const totalRx = filteredData.disconnectRecords.reduce((sum, r) => sum + r.rxBytes, 0);

    const excellentCount = filteredData.snRecords.filter(r => getSignalQuality(r.snValue) === 'excellent' || getSignalQuality(r.snValue) === 'good').length;
    const successRate = filteredData.snRecords.length > 0 
      ? ((excellentCount / filteredData.snRecords.length) * 100).toFixed(1)
      : '0';

    return {
      avgSN: avgSN.toFixed(1),
      totalSessions: filteredData.connectRecords.length,
      totalTx: formatBytes(totalTx),
      totalRx: formatBytes(totalRx),
      totalData: formatBytes(totalTx + totalRx),
      successRate,
      snReadings: filteredData.snRecords.length,
    };
  }, [filteredData]);

  // Calculate change percentages
  const changes = useMemo(() => {
    if (!comparisonData || !stats) return null;

    const calcChange = (current: number, previous: number) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return ((current - previous) / Math.abs(previous)) * 100;
    };

    return {
      avgSN: calcChange(parseFloat(stats.avgSN), comparisonData.avgSN),
      sessions: calcChange(stats.totalSessions, comparisonData.totalSessions),
      snReadings: calcChange(stats.snReadings, comparisonData.snReadings),
      label: comparisonData.label,
    };
  }, [stats, comparisonData]);

  const handleFilterClick = (filter: LogFilter) => {
    setLogFilter(prev => prev === filter ? 'all' : filter);
  };

  const handleJumpToLogs = (filter: LogFilter) => {
    setLogFilter(filter);
    logTableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleDateRangeChange = (range: DateRange, requiresLoading?: boolean) => {
    if (data?.dateRange && (range.end < data.dateRange.start || range.start > data.dateRange.end)) {
      toast({
        title: 'No data for that date range',
        description: 'There are no log entries available for the dates you selected.',
      });
    }

    if (requiresLoading) {
      setIsLoadingLargeRange(true);
      // Use setTimeout to allow the loading state to render before heavy computation
      setTimeout(() => {
        setDateRange(range);
        setIsLoadingLargeRange(false);
      }, 100);
    } else {
      setDateRange(range);
    }
  };

  if (loading || isLoadingLargeRange) {
    return <LoadingState message={isLoadingLargeRange ? "Loading large date range..." : undefined} />;
  }

  if (error) {
    return <ErrorState error={error} />;
  }

  if (!data || !filteredData) {
    return (
      <EmptyState
        title="No recent log data"
        description="No database entries were found for the current fetch window (last 30 days) and callsign filter."
        onRefresh={refetch}
        isRefreshing={isRefreshing}
      />
    );
  }

  const hasAnyEvents =
    filteredData.snRecords.length > 0 ||
    filteredData.connectRecords.length > 0 ||
    filteredData.disconnectRecords.length > 0;

  // Station dropdown should only show callsigns from the managed callsigns list
  const stationsList = Array.from(data.stations).filter(s => 
    allowedCallsigns.map(c => c.toUpperCase().trim()).includes(s.toUpperCase().trim())
  );

  if (!hasAnyEvents) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          <DashboardHeader
            stationCount={selectedStation ? 1 : data.stations.size}
            connectionCount={filteredData.hubConnections.size}
            lastUpdated={lastUpdated}
            stations={stationsList}
            selectedStation={selectedStation}
            onStationChange={setSelectedStation}
            dateRange={dateRange}
            onDateRangeChange={handleDateRangeChange}
            dataDateRange={data.dateRange}
            onRefresh={refetch}
            isRefreshing={isRefreshing}
          />

          <main className="mt-8">
            <EmptyState
              title="No data for selected date range"
              description="Try selecting “All Dates” or choose a range near the newest available data."
              onRefresh={refetch}
              isRefreshing={isRefreshing}
            />
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <DashboardHeader 
          stationCount={selectedStation ? 1 : data.stations.size}
          connectionCount={filteredData.hubConnections.size}
          lastUpdated={lastUpdated}
          stations={stationsList}
          selectedStation={selectedStation}
          onStationChange={setSelectedStation}
          dateRange={dateRange}
          onDateRangeChange={handleDateRangeChange}
          dataDateRange={data.dateRange}
          onRefresh={refetch}
          isRefreshing={isRefreshing}
        />

        {/* Comparison Label */}
        {changes && (
          <div className="mb-6">
            <div className="text-xs text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-full inline-block">
              Comparing {changes.label}
            </div>
          </div>
        )}

        {/* Stats Cards */}
        <div className="relative">
          {logFilter !== 'all' && (
            <div className="mb-3">
              <button
                onClick={() => setLogFilter('all')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
              >
                <span>Clear filter</span>
                <span className="text-lg leading-none">&times;</span>
              </button>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <StatsCard
              title="Average S/N Ratio"
              value={`${stats?.avgSN} dB`}
              subtitle={selectedStation ? `For ${selectedStation}` : "Across all connections"}
              icon="signal"
              delay={0}
              onClick={() => handleFilterClick('sn')}
              isActive={logFilter === 'sn'}
              onJumpToLogs={() => handleJumpToLogs('sn')}
              accentColor="teal"
              trend={changes ? { value: Math.round(changes.avgSN * 10) / 10, label: changes.label } : undefined}
            />
            <StatsCard
              title="Connect Events"
              value={stats?.totalSessions || 0}
              subtitle="VARAHF Connected events (session starts)"
              icon="activity"
              delay={100}
              onClick={() => handleFilterClick('sessions')}
              isActive={logFilter === 'sessions'}
              onJumpToLogs={() => handleJumpToLogs('sessions')}
              accentColor="blue"
              trend={changes ? { value: Math.round(changes.sessions * 10) / 10, label: changes.label } : undefined}
            />
            <StatsCard
              title="Total Data Transfer"
              value={stats?.totalData || '0 B'}
              subtitle={`TX: ${stats?.totalTx} / RX: ${stats?.totalRx} (per-station view)`}
              icon="wifi"
              delay={200}
              onClick={() => handleFilterClick('data')}
              isActive={logFilter === 'data'}
              onJumpToLogs={() => handleJumpToLogs('data')}
              accentColor="purple"
            />
            <StatsCard
              title="S/N Readings"
              value={stats?.snReadings || 0}
              subtitle={`${stats?.successRate}% good/excellent`}
              icon="radio"
              delay={300}
              onClick={() => handleFilterClick('readings')}
              isActive={logFilter === 'readings'}
              onJumpToLogs={() => handleJumpToLogs('readings')}
              accentColor="orange"
              trend={changes ? { value: Math.round(changes.snReadings * 10) / 10, label: changes.label } : undefined}
            />
          </div>
        </div>

        {/* Signal Quality & Session Outcomes - Balanced Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <SignalQualityPieChart snRecords={filteredData.snRecords} />
          <ConnectionSuccessChart hubConnections={filteredData.hubConnections} />
        </div>

        {/* Disconnect Analysis by Connection */}
        <div className="mb-8">
          <DisconnectAnalysisChart hubConnections={filteredData.hubConnections} />
        </div>

        {/* S/N Timeline - Full Width */}
        <div className="mb-8">
          <SNTimelineChart snRecords={filteredData.snRecords} dateRange={dateRange} />
        </div>

        {/* Hub Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <SNByHubChart hubConnections={filteredData.hubConnections} />
          <TXByHubChart hubConnections={filteredData.hubConnections} />
        </div>

        {/* Bitrate Analysis */}
        <div className="mb-8">
          <BitrateAnalysisChart hubConnections={filteredData.hubConnections} />
        </div>

        {/* Station Bitrate Comparison */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <StationBitrateChart hubConnections={filteredData.hubConnections} />
          <PeakBitrateLeaderboard hubConnections={filteredData.hubConnections} />
        </div>


        {/* Detailed Table */}
        <HubConnectionsTable hubConnections={filteredData.hubConnections} />

        {/* Log Entries Table */}
        <div className="mt-8 mb-8" ref={logTableRef}>
          <LogEntriesTable 
            snRecords={filteredData.snRecords}
            connectRecords={filteredData.connectRecords}
            disconnectRecords={filteredData.disconnectRecords}
            filter={logFilter}
            onClearFilter={() => setLogFilter('all')}
          />
        </div>

        {/* Callsign Manager */}
        <div className="mt-8 mb-8">
          <CallsignManager 
            callsigns={allowedCallsigns} 
            onChange={setAllowedCallsigns} 
          />
        </div>

        {/* Footer */}
        <footer className="mt-12 pt-8 border-t border-border text-center">
          <p className="text-sm text-muted-foreground">
            TPRFN Multi-Station RF Analytics Dashboard • 
            Data parsed from syslog • 
            Monitoring VARAHF connections
          </p>
        </footer>
      </div>
    </div>
  );
};

export default Index;
