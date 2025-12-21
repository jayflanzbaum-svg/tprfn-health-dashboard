import { useSyslogData } from '@/hooks/useSyslogData';
import { DashboardHeader } from '@/components/DashboardHeader';
import { StatsCard } from '@/components/StatsCard';
import { SNByHubChart } from '@/components/charts/SNByHubChart';
import { TXByHubChart } from '@/components/charts/TXByHubChart';
import { SNTimelineChart } from '@/components/charts/SNTimelineChart';
import { SignalQualityPieChart } from '@/components/charts/SignalQualityPieChart';
import { SessionCountChart } from '@/components/charts/SessionCountChart';
import { HubConnectionsTable } from '@/components/HubConnectionsTable';
import { LogEntriesTable, LogFilter } from '@/components/LogEntriesTable';
import { LoadingState, ErrorState } from '@/components/LoadingState';
import { formatBytes, getSignalQuality, HubConnection } from '@/lib/syslogParser';
import { useMemo, useState, useRef } from 'react';

const Index = () => {
  const { data, loading, error } = useSyslogData();
  const [logFilter, setLogFilter] = useState<LogFilter>('all');
  const [selectedStation, setSelectedStation] = useState<string | null>(null);
  const logTableRef = useRef<HTMLDivElement>(null);

  // Filter data based on selected station
  const filteredData = useMemo(() => {
    if (!data) return null;
    if (!selectedStation) return data;

    // Filter S/N records where station or partner matches
    const snRecords = data.snRecords.filter(
      r => r.station === selectedStation || r.partner === selectedStation
    );

    // Filter connect records where station or partner matches
    const connectRecords = data.connectRecords.filter(
      r => r.station === selectedStation || r.partner === selectedStation
    );

    // Filter disconnect records where station or partner matches
    const disconnectRecords = data.disconnectRecords.filter(
      r => r.station === selectedStation || r.partner === selectedStation
    );

    // Filter hub connections that involve the selected station
    const hubConnections = new Map<string, HubConnection>();
    data.hubConnections.forEach((hub, id) => {
      if (hub.station1 === selectedStation || hub.station2 === selectedStation) {
        hubConnections.set(id, hub);
      }
    });

    return {
      ...data,
      snRecords,
      connectRecords,
      disconnectRecords,
      hubConnections,
    };
  }, [data, selectedStation]);

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

  const handleFilterClick = (filter: LogFilter) => {
    setLogFilter(prev => prev === filter ? 'all' : filter);
  };

  const handleJumpToLogs = (filter: LogFilter) => {
    setLogFilter(filter);
    logTableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (loading) {
    return <LoadingState />;
  }

  if (error || !data || !filteredData) {
    return <ErrorState error={error || 'Failed to load data'} />;
  }

  const stationsList = Array.from(data.stations);

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <DashboardHeader 
          dateRange={data.dateRange}
          stationCount={selectedStation ? 1 : data.stations.size}
          connectionCount={filteredData.hubConnections.size}
          lastUpdated={new Date()}
          stations={stationsList}
          selectedStation={selectedStation}
          onStationChange={setSelectedStation}
        />

        {/* Stats Cards */}
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
          />
          <StatsCard
            title="Total Sessions"
            value={stats?.totalSessions || 0}
            subtitle="VARAHF Connected events"
            icon="activity"
            delay={100}
            onClick={() => handleFilterClick('sessions')}
            isActive={logFilter === 'sessions'}
            onJumpToLogs={() => handleJumpToLogs('sessions')}
            accentColor="blue"
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
          />
        </div>

        {/* S/N Charts - Top Priority */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="lg:col-span-2">
            <SNTimelineChart snRecords={filteredData.snRecords} />
          </div>
          <SignalQualityPieChart snRecords={filteredData.snRecords} />
        </div>

        {/* Hub Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <SNByHubChart hubConnections={filteredData.hubConnections} />
          <TXByHubChart hubConnections={filteredData.hubConnections} />
        </div>

        {/* Session Count Chart */}
        <div className="mb-8">
          <SessionCountChart hubConnections={filteredData.hubConnections} />
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
