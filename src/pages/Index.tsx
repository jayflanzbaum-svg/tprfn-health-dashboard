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
import { formatBytes, getSignalQuality } from '@/lib/syslogParser';
import { useMemo, useState } from 'react';

const Index = () => {
  const { data, loading, error } = useSyslogData();
  const [logFilter, setLogFilter] = useState<LogFilter>('all');

  const stats = useMemo(() => {
    if (!data) return null;

    const avgSN = data.snRecords.length > 0
      ? data.snRecords.reduce((sum, r) => sum + r.snValue, 0) / data.snRecords.length
      : 0;

    const totalTx = data.disconnectRecords.reduce((sum, r) => sum + r.txBytes, 0);
    const totalRx = data.disconnectRecords.reduce((sum, r) => sum + r.rxBytes, 0);

    const excellentCount = data.snRecords.filter(r => getSignalQuality(r.snValue) === 'excellent' || getSignalQuality(r.snValue) === 'good').length;
    const successRate = data.snRecords.length > 0 
      ? ((excellentCount / data.snRecords.length) * 100).toFixed(1)
      : '0';

    return {
      avgSN: avgSN.toFixed(1),
      totalSessions: data.disconnectRecords.length,
      totalTx: formatBytes(totalTx),
      totalRx: formatBytes(totalRx),
      totalData: formatBytes(totalTx + totalRx),
      successRate,
      snReadings: data.snRecords.length,
    };
  }, [data]);

  const handleFilterClick = (filter: LogFilter) => {
    setLogFilter(prev => prev === filter ? 'all' : filter);
  };

  if (loading) {
    return <LoadingState />;
  }

  if (error || !data) {
    return <ErrorState error={error || 'Failed to load data'} />;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <DashboardHeader 
          dateRange={data.dateRange}
          stationCount={data.stations.size}
          connectionCount={data.hubConnections.size}
          lastUpdated={new Date()}
        />

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatsCard
            title="Average S/N Ratio"
            value={`${stats?.avgSN} dB`}
            subtitle="Across all connections"
            icon="signal"
            delay={0}
            onClick={() => handleFilterClick('sn')}
            isActive={logFilter === 'sn'}
          />
          <StatsCard
            title="Total Sessions"
            value={stats?.totalSessions || 0}
            subtitle="VARAHF Disconnected events"
            icon="activity"
            delay={100}
            onClick={() => handleFilterClick('sessions')}
            isActive={logFilter === 'sessions'}
          />
          <StatsCard
            title="Total Data Transfer"
            value={stats?.totalData || '0 B'}
            subtitle={`TX: ${stats?.totalTx} / RX: ${stats?.totalRx}`}
            icon="wifi"
            delay={200}
            onClick={() => handleFilterClick('data')}
            isActive={logFilter === 'data'}
          />
          <StatsCard
            title="S/N Readings"
            value={stats?.snReadings || 0}
            subtitle={`${stats?.successRate}% good/excellent`}
            icon="radio"
            delay={300}
            onClick={() => handleFilterClick('readings')}
            isActive={logFilter === 'readings'}
          />
        </div>

        {/* Main Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <SNByHubChart hubConnections={data.hubConnections} />
          <TXByHubChart hubConnections={data.hubConnections} />
        </div>

        {/* Secondary Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="lg:col-span-2">
            <SNTimelineChart snRecords={data.snRecords} />
          </div>
          <SignalQualityPieChart snRecords={data.snRecords} />
        </div>

        {/* Session Count Chart */}
        <div className="mb-8">
          <SessionCountChart hubConnections={data.hubConnections} />
        </div>

        {/* Log Entries Table */}
        <div className="mb-8">
          <LogEntriesTable 
            snRecords={data.snRecords}
            disconnectRecords={data.disconnectRecords}
            filter={logFilter}
          />
        </div>

        {/* Detailed Table */}
        <HubConnectionsTable hubConnections={data.hubConnections} />

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
