import { useDeferredValue, useMemo, useRef, useState, useEffect } from 'react';
import { useDatabaseData } from '@/hooks/useDatabaseData';
import { useStationLocations } from '@/hooks/useStationLocations';
import { useKpiStats } from '@/hooks/useKpiStats';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { useHubCallsigns } from '@/hooks/useHubCallsigns';
import { DashboardHeader } from '@/components/DashboardHeader';
import { StatsCard } from '@/components/StatsCard';
import { HubConnectionsTable } from '@/components/HubConnectionsTable';
import { HubUptimeCard } from '@/components/HubUptimeCard';
import { LogEntriesTable, LogFilter } from '@/components/LogEntriesTable';
import { LoadingState, ErrorState, EmptyState } from '@/components/LoadingState';
import { formatBytes, getSignalQuality, HubConnection, DEFAULT_ALLOWED_CALLSIGNS } from '@/lib/syslogParser';
import { DateRangeFilter, DateRange, getDefaultDateRange, getComparisonPeriod } from '@/components/DateRangeFilter';
import { CallsignManager } from '@/components/CallsignManager';
import { LoginButton } from '@/components/AuthGuard';
import { ChartSkeleton, PieChartSkeleton, LeaderboardSkeleton } from '@/components/ChartSkeleton';
import { LazySection } from '@/components/LazySection';
import { toast } from '@/hooks/use-toast';
import { LiveStationMap } from '@/components/LiveStationMap';
import { InactiveHubsAlert } from '@/components/InactiveHubsAlert';
import { DashboardAnalysis } from '@/components/DashboardAnalysis';
import { NetSessionManager } from '@/components/NetSessionManager';

// Direct imports - memoized at component level
import { SNByHubChart } from '@/components/charts/SNByHubChart';
import { TXByHubChart } from '@/components/charts/TXByHubChart';
import { SNHeatmapChart } from '@/components/charts/SNHeatmapChart';
import { SignalQualityPieChart } from '@/components/charts/SignalQualityPieChart';
import { ConnectionSuccessChart } from '@/components/charts/ConnectionSuccessChart';
import { DisconnectAnalysisChart } from '@/components/charts/DisconnectAnalysisChart';
import { BitrateAnalysisChart } from '@/components/charts/BitrateAnalysisChart';
import { StationBitrateChart } from '@/components/charts/StationBitrateChart';
import { PeakBitrateLeaderboard } from '@/components/charts/PeakBitrateLeaderboard';

const Index = () => {
  // Database-backed hub callsigns (single source of truth)
  const { callsigns: allowedCallsigns, updateCallsigns: setAllowedCallsigns, loaded: callsignsLoaded } = useHubCallsigns();
  
  // URL-based filter state (date range and station only - callsigns come from DB)
  const { filters, setFilters, copyShareableUrl, hasUrlFilters } = useUrlFilters(DEFAULT_ALLOWED_CALLSIGNS);
  
  const [dateRange, setDateRange] = useState<DateRange>(filters.dateRange);
  const [selectedStation, setSelectedStation] = useState<string | null>(filters.selectedStation);
  const [isLoadingLargeRange, setIsLoadingLargeRange] = useState(false);

  // Sync date/station to URL (but NOT callsigns - those live in the database)
  useEffect(() => {
    setFilters({ dateRange, selectedStation });
  }, [dateRange, selectedStation, setFilters]);

  const fetchDays = useMemo(() => {
    const msPerDay = 1000 * 60 * 60 * 24;
    const days = Math.ceil((dateRange.end.getTime() - dateRange.start.getTime()) / msPerDay) + 1;
    // Always fetch at least 2 days to allow comparison with previous period (e.g., today vs yesterday)
    return Math.max(2, days);
  }, [dateRange]);

  const { data, loading, error, refetch, lastUpdated, isRefreshing } = useDatabaseData(allowedCallsigns, fetchDays);
  const { locations, distances, lookupCallsigns } = useStationLocations();
  const [logFilter, setLogFilter] = useState<LogFilter>('sn');
  const logTableRef = useRef<HTMLDivElement>(null);
  
  // Accurate KPI stats from database function
  const { kpiComparison, loading: kpiLoading } = useKpiStats(dateRange, allowedCallsigns, selectedStation);

  // Auto-fetch locations for all stations when data loads
  useEffect(() => {
    if (data && data.stations.size > 0) {
      const callsigns = Array.from(data.stations);
      lookupCallsigns(callsigns);
    }
  }, [data?.stations.size]);

  // Create a stable key for resetting chart expanded states when date range changes
  const dateRangeKey = `${dateRange.start.getTime()}-${dateRange.end.getTime()}`;

  // Filter data based on selected station and date range
  const filteredData = useMemo(() => {
    if (!data) return null;

    const isInDateRange = (timestamp: Date) => {
      return timestamp >= dateRange.start && timestamp <= dateRange.end;
    };

    const isAggregatedMode = !!data.aggregatedData;

    // Aggregated mode: keep server-built hubConnections (do NOT rebuild from empty per-event arrays)
    if (isAggregatedMode) {
      const snRecords = data.snRecords.filter(r => isInDateRange(r.timestamp));

      // Optional station filter: filter connection map only
      let hubConnections = data.hubConnections;
      if (selectedStation) {
        const next = new Map<string, HubConnection>();
        hubConnections.forEach((hub, key) => {
          if (hub.station1 === selectedStation || hub.station2 === selectedStation) {
            next.set(key, hub);
          }
        });
        hubConnections = next;
      }

      return {
        ...data,
        snRecords,
        connectRecords: [],
        disconnectRecords: [],
        hubConnections,
      };
    }

    // Raw mode: rebuild hub connections from filtered events

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
          sessionCount: 0,
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
          sessionCount: 0,
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

  // Defer filtered data for charts to keep UI responsive during filtering
  const deferredFilteredData = useDeferredValue(filteredData);

  // Calculate comparison period data
  const comparisonData = useMemo(() => {
    if (!data || !dateRange || dateRange.preset === 'all') return null;

    const comparison = getComparisonPeriod(dateRange);
    const isInPeriod = (timestamp: Date) => {
      return timestamp >= comparison.start && timestamp <= comparison.end;
    };

    const isAggregatedMode = !!data.aggregatedData;

    // In aggregated mode, we don't have individual connectRecords - they're empty.
    // We need to use the hubConnections data which has sessionCount, but those are
    // already filtered to the current period. For comparison, we need to query
    // the raw snRecords (which do exist) to approximate comparison stats.
    
    const snRecords = data.snRecords.filter(r => isInPeriod(r.timestamp));
    
    let totalSessions = 0;
    let avgSN = 0;
    let totalData = 0;
    
    if (isAggregatedMode) {
      // In aggregated mode, we can't get exact session counts for the comparison period
      // because hubConnections are pre-aggregated for the entire fetch window.
      // Best approximation: use snRecords as a proxy for activity level.
      // The snRecords ARE available per-timestamp, so we can filter them accurately.
      
      avgSN = snRecords.length > 0
        ? snRecords.reduce((sum, r) => sum + r.snValue, 0) / snRecords.length
        : 0;
      
      // For sessions in aggregated mode, we estimate based on unique station pairs
      // seen in the comparison period's snRecords
      const stationPairs = new Set<string>();
      snRecords.forEach(r => {
        const sorted = [r.station, r.partner].sort();
        stationPairs.add(`${sorted[0]}↔${sorted[1]}`);
      });
      // This is an approximation - we count unique connection pairs as "sessions"
      // This won't be perfect but is better than 0
      totalSessions = stationPairs.size > 0 ? Math.max(stationPairs.size, Math.floor(snRecords.length / 10)) : 0;
      
      // Data transfer isn't available for comparison in aggregated mode
      totalData = 0;
    } else {
      // Raw mode: use actual connect/disconnect records
      const connectRecords = data.connectRecords.filter(r => isInPeriod(r.timestamp));
      const disconnectRecords = data.disconnectRecords.filter(r => isInPeriod(r.timestamp));
      
      avgSN = snRecords.length > 0
        ? snRecords.reduce((sum, r) => sum + r.snValue, 0) / snRecords.length
        : 0;
      
      totalSessions = connectRecords.length;
      
      const totalTx = disconnectRecords.reduce((sum, r) => sum + r.txBytes, 0);
      const totalRx = disconnectRecords.reduce((sum, r) => sum + r.rxBytes, 0);
      totalData = totalTx + totalRx;
    }

    const excellentCount = snRecords.filter(r => 
      getSignalQuality(r.snValue) === 'excellent' || getSignalQuality(r.snValue) === 'good'
    ).length;
    const successRate = snRecords.length > 0 
      ? (excellentCount / snRecords.length) * 100
      : 0;

    return {
      label: comparison.label,
      avgSN,
      totalSessions,
      totalData,
      snReadings: snRecords.length,
      successRate,
    };
  }, [data, dateRange]);

  const stats = useMemo(() => {
    if (!filteredData) return null;

    const isAggregatedMode = !!filteredData.aggregatedData;

    let avgSNNum = 0;
    let totalSessions = 0;
    let totalTx = 0;
    let totalRx = 0;
    let snReadings = 0;

    if (isAggregatedMode) {
      // Use weighted averages from aggregated connection stats.
      let snWeightedSum = 0;
      let snWeight = 0;

      filteredData.hubConnections.forEach((hub) => {
        const c = hub.snCount ?? 0;
        if (c > 0) {
          snWeightedSum += hub.avgSN * c;
          snWeight += c;
          snReadings += c;
        }

        totalSessions += hub.sessionCount ?? 0;
        totalTx += hub.totalTxBytes ?? 0;
        totalRx += hub.totalRxBytes ?? 0;
      });

      avgSNNum = snWeight > 0
        ? snWeightedSum / snWeight
        : (filteredData.snRecords.length > 0
            ? filteredData.snRecords.reduce((sum, r) => sum + r.snValue, 0) / filteredData.snRecords.length
            : 0);

      // Fallback when no snCount is provided (should be rare)
      if (snReadings === 0) snReadings = filteredData.snRecords.length;
    } else {
      avgSNNum = filteredData.snRecords.length > 0
        ? filteredData.snRecords.reduce((sum, r) => sum + r.snValue, 0) / filteredData.snRecords.length
        : 0;

      totalSessions = filteredData.connectRecords.length;
      totalTx = filteredData.disconnectRecords.reduce((sum, r) => sum + r.txBytes, 0);
      totalRx = filteredData.disconnectRecords.reduce((sum, r) => sum + r.rxBytes, 0);
      snReadings = filteredData.snRecords.length;
    }

    const excellentCount = filteredData.snRecords.filter(r =>
      getSignalQuality(r.snValue) === 'excellent' || getSignalQuality(r.snValue) === 'good'
    ).length;
    const successRate = filteredData.snRecords.length > 0
      ? ((excellentCount / filteredData.snRecords.length) * 100).toFixed(1)
      : '0';

    return {
      avgSN: avgSNNum.toFixed(1),
      totalSessions,
      totalTx: formatBytes(totalTx),
      totalRx: formatBytes(totalRx),
      totalData: formatBytes(totalTx + totalRx),
      successRate,
      snReadings,
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
    filteredData.disconnectRecords.length > 0 ||
    filteredData.hubConnections.size > 0;

  // Station dropdown should only show callsigns from the managed callsigns list
  const stationsList = Array.from(data.stations).filter(s => 
    allowedCallsigns.map(c => c.toUpperCase().trim()).includes(s.toUpperCase().trim())
  );

  if (!hasAnyEvents) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          <DashboardHeader
            stationCount={stationsList.length}
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
            allowedCallsigns={allowedCallsigns}
            onShareClick={copyShareableUrl}
            activeStations={data.stations}
            onHubAdded={(callsign) => setAllowedCallsigns([...allowedCallsigns, callsign])}
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
          stationCount={stationsList.length}
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
          allowedCallsigns={allowedCallsigns}
          onShareClick={copyShareableUrl}
          activeStations={data.stations}
          onHubAdded={(callsign) => setAllowedCallsigns([...allowedCallsigns, callsign])}
        />

        {/* Inactive Hubs Alert */}
        <InactiveHubsAlert allowedCallsigns={allowedCallsigns} />

        {/* Stats Cards */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Key Metrics</span>
          <div className="flex items-center gap-1.5">
            <NetSessionManager />
            <DashboardAnalysis
              dateRange={dateRange}
              allowedCallsigns={allowedCallsigns}
              selectedStation={selectedStation}
            />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <StatsCard
              title="Average S/N Ratio"
              value={kpiComparison ? `${kpiComparison.current.avgSn.toFixed(1)} dB` : `${stats?.avgSN} dB`}
              subtitle={selectedStation ? `For ${selectedStation}` : "Across all connections"}
              icon="signal"
              delay={0}
              onClick={() => handleFilterClick('sn')}
              isActive={logFilter === 'sn'}
              onJumpToLogs={() => handleJumpToLogs('sn')}
              onClearFilter={() => setLogFilter('all')}
              accentColor="teal"
              trend={kpiComparison?.label ? { 
                value: kpiComparison.changes.avgSn, 
                label: kpiComparison.label,
                previousValue: `${kpiComparison.previous.avgSn.toFixed(1)} dB`
              } : undefined}
            />
            <StatsCard
              title="Connect Events"
              value={kpiComparison ? kpiComparison.current.sessions : (stats?.totalSessions || 0)}
              subtitle="VARAHF Connected events (session starts)"
              icon="activity"
              delay={100}
              onClick={() => handleFilterClick('sessions')}
              isActive={logFilter === 'sessions'}
              onJumpToLogs={() => handleJumpToLogs('sessions')}
              onClearFilter={() => setLogFilter('all')}
              accentColor="blue"
              trend={kpiComparison?.label ? { 
                value: kpiComparison.changes.sessions, 
                label: kpiComparison.label,
                previousValue: kpiComparison.previous.sessions
              } : undefined}
            />
            <StatsCard
              title="Total Data Transfer"
              value={kpiComparison ? formatBytes(kpiComparison.current.totalData) : (stats?.totalData || '0 B')}
              subtitle={`TX: ${stats?.totalTx} / RX: ${stats?.totalRx} (per-station view)`}
              icon="wifi"
              delay={200}
              onClick={() => handleFilterClick('data')}
              isActive={logFilter === 'data'}
              onJumpToLogs={() => handleJumpToLogs('data')}
              onClearFilter={() => setLogFilter('all')}
              accentColor="purple"
              trend={kpiComparison?.label ? { 
                value: kpiComparison.changes.totalData, 
                label: kpiComparison.label,
                previousValue: formatBytes(kpiComparison.previous.totalData)
              } : undefined}
            />
            <StatsCard
              title="S/N Readings"
              value={kpiComparison ? kpiComparison.current.snReadings : (stats?.snReadings || 0)}
              subtitle={`${kpiComparison ? kpiComparison.current.successRate.toFixed(1) : stats?.successRate}% good/excellent`}
              icon="radio"
              delay={300}
              onClick={() => handleFilterClick('readings')}
              isActive={logFilter === 'readings'}
              onJumpToLogs={() => handleJumpToLogs('readings')}
              onClearFilter={() => setLogFilter('all')}
              accentColor="orange"
              trend={kpiComparison?.label ? { 
                value: kpiComparison.changes.snReadings, 
                label: kpiComparison.label,
                previousValue: kpiComparison.previous.snReadings
              } : undefined}
            />
          </div>

        {/* Station Map */}
        <div className="mb-8">
          <LiveStationMap 
            locations={locations}
            hubConnections={filteredData.hubConnections}
            distances={distances}
            hubCallsigns={allowedCallsigns}
            lookupCallsigns={lookupCallsigns}
          />
        </div>

        {/* Signal Quality & Session Outcomes - Balanced Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <LazySection fallback={<PieChartSkeleton />}>
            <SignalQualityPieChart snRecords={deferredFilteredData?.snRecords ?? []} />
          </LazySection>
          <LazySection fallback={<PieChartSkeleton />}>
            <ConnectionSuccessChart hubConnections={deferredFilteredData?.hubConnections ?? new Map()} />
          </LazySection>
        </div>

        {/* Disconnect Analysis by Connection */}
        <div className="mb-8">
          <LazySection fallback={<ChartSkeleton height="h-[350px]" title="Disconnect Analysis" />}>
            <DisconnectAnalysisChart hubConnections={deferredFilteredData?.hubConnections ?? new Map()} dateRangeKey={dateRangeKey} />
          </LazySection>
        </div>

        {/* S/N Patterns Heatmap - Full Width */}
        <div className="mb-8">
          <LazySection fallback={<ChartSkeleton height="h-[300px]" title="S/N Patterns" />}>
            <SNHeatmapChart snRecords={deferredFilteredData?.snRecords ?? []} dateRange={dateRange} aggregatedData={deferredFilteredData?.aggregatedData} />
          </LazySection>
        </div>

        {/* Hub Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <LazySection fallback={<ChartSkeleton height="h-[300px]" title="S/N by Hub" />}>
            <SNByHubChart hubConnections={deferredFilteredData?.hubConnections ?? new Map()} dateRangeKey={dateRangeKey} />
          </LazySection>
          <LazySection fallback={<ChartSkeleton height="h-[300px]" title="Data Transfer" />}>
            <TXByHubChart hubConnections={deferredFilteredData?.hubConnections ?? new Map()} dateRangeKey={dateRangeKey} />
          </LazySection>
        </div>

        {/* Bitrate Analysis */}
        <div className="mb-8">
          <LazySection fallback={<ChartSkeleton height="h-[280px]" title="Bitrate Analysis" />}>
            <BitrateAnalysisChart hubConnections={deferredFilteredData?.hubConnections ?? new Map()} dateRangeKey={dateRangeKey} />
          </LazySection>
        </div>

        {/* Station Bitrate Comparison */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <LazySection fallback={<ChartSkeleton height="h-[280px]" title="Station Bitrate" />}>
            <StationBitrateChart hubConnections={deferredFilteredData?.hubConnections ?? new Map()} dateRangeKey={dateRangeKey} />
          </LazySection>
          <LazySection fallback={<LeaderboardSkeleton />}>
            <PeakBitrateLeaderboard hubConnections={deferredFilteredData?.hubConnections ?? new Map()} dateRangeKey={dateRangeKey} />
          </LazySection>
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

        {/* Callsign Manager - visible to all, editing auth-protected */}
        <div className="mt-8 mb-8">
          <CallsignManager 
            callsigns={allowedCallsigns} 
            onChange={setAllowedCallsigns} 
          />
        </div>

        {/* Footer */}
        <footer className="mt-12 pt-8 border-t border-border text-center space-y-2">
          <p className="text-sm text-muted-foreground">
            TPRFN Multi-Station RF Analytics Dashboard • 
            Data parsed from syslog • 
            Monitoring VARAHF connections
          </p>
          <div className="flex justify-center">
            <LoginButton />
          </div>
        </footer>
      </div>
    </div>
  );
};

export default Index;
