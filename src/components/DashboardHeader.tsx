import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Radio, Wifi, Clock, RefreshCw, Globe } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DateRangeFilter, DateRange } from '@/components/DateRangeFilter';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { StationLocationsManager } from '@/components/StationLocationsManager';

interface DashboardHeaderProps {
  stationCount: number;
  connectionCount: number;
  lastUpdated?: Date | null;
  stations: string[];
  selectedStation: string | null;
  onStationChange: (station: string | null) => void;
  dateRange: DateRange;
  onDateRangeChange: (range: DateRange, requiresLoading?: boolean) => void;
  dataDateRange?: { start: Date; end: Date };
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

function useCurrentTime() {
  const [now, setNow] = useState(new Date());
  
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);
  
  return now;
}

function formatZulu(date: Date) {
  return date.toISOString().slice(11, 19) + 'Z';
}

function formatDateMMDDYYYY(date: Date) {
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const year = date.getUTCFullYear();
  return `${month}-${day}-${year}`;
}

function formatLocal(date: Date) {
  return date.toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}

function getTimezoneAbbr() {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  // Try to get a short abbreviation
  const abbr = new Date().toLocaleTimeString('en-US', { timeZoneName: 'short' }).split(' ').pop();
  return abbr || tz;
}

export function DashboardHeader({ 
  stationCount, 
  connectionCount, 
  lastUpdated,
  stations,
  selectedStation,
  onStationChange,
  dateRange,
  onDateRangeChange,
  dataDateRange,
  onRefresh,
  isRefreshing
}: DashboardHeaderProps) {
  const now = useCurrentTime();
  const tzAbbr = getTimezoneAbbr();

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit'
    });
  };

  return (
    <header className="mb-8 animate-fade-in">
      {/* Row 1: Title and controls */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 border border-accent/20">
            <Radio className="h-7 w-7 text-accent" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">
              TPRFN <span className="gradient-text">HEALTH DASHBOARD</span>
            </h1>
            <p className="text-muted-foreground mt-0.5">
              RF Connection Analytics • Auto-refreshes every 5 min
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          {/* Station Filter Dropdown */}
          <Select 
            value={selectedStation || 'all'} 
            onValueChange={(value) => onStationChange(value === 'all' ? null : value)}
          >
            <SelectTrigger className="w-48 bg-card border-border">
              <SelectValue placeholder="All Stations" />
            </SelectTrigger>
            <SelectContent className="bg-card border-border z-50">
              <SelectItem value="all">All Stations</SelectItem>
              {stations.sort().map((station) => (
                <SelectItem key={station} value={station} className="font-mono">
                  {station}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <DateRangeFilter
            value={dateRange}
            onChange={onDateRangeChange}
            dataDateRange={dataDateRange}
          />

          <div 
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary border border-border/50"
            title="Unique stations (callsigns) in the data"
          >
            <Wifi className="h-4 w-4 text-accent" />
            <span className="text-sm">
              <span className="font-mono font-semibold text-foreground">{stationCount}</span>
              <span className="text-muted-foreground ml-1">unique stations</span>
            </span>
          </div>

          <div 
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary border border-border/50"
            title="Unique station pairs that communicated"
          >
            <Radio className="h-4 w-4 text-chart-secondary" />
            <span className="text-sm">
              <span className="font-mono font-semibold text-foreground">{connectionCount}</span>
              <span className="text-muted-foreground ml-1">station pairs</span>
            </span>
          </div>

          {/* Station Locations Manager */}
          <StationLocationsManager callsigns={stations} />

          {/* Refresh button and last updated */}
          <div className="flex items-center gap-2">
            {onRefresh && (
              <Button
                variant="outline"
                size="sm"
                onClick={onRefresh}
                disabled={isRefreshing}
                className="gap-1.5"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
                <span className="hidden sm:inline">Refresh</span>
              </Button>
            )}
            {lastUpdated && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                <span>Updated: {formatTime(lastUpdated)}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Row 2: Prominent Time Display */}
      <div className="mt-3 flex items-center justify-center">
        <div className="inline-flex flex-wrap items-center justify-center gap-4 px-5 py-2.5 rounded-lg bg-gradient-to-r from-accent/10 via-primary/10 to-chart-secondary/10 border border-accent/20 shadow-md">
          <Globe className="h-5 w-5 text-accent" />
          <div className="flex items-center gap-1.5">
            <span className="text-lg font-mono font-bold text-foreground tracking-wide">
              {formatZulu(now)}
            </span>
            <span className="text-xs text-muted-foreground uppercase">UTC</span>
          </div>
          <div className="h-5 w-px bg-border/50" />
          <span className="text-xl font-mono font-bold text-accent tracking-wide">
            {formatDateMMDDYYYY(now)}
          </span>
          <div className="h-5 w-px bg-border/50" />
          <div className="flex items-center gap-1.5">
            <span className="text-lg font-mono font-bold text-foreground tracking-wide">
              {format(now, 'HH:mm:ss')}
            </span>
            <span className="text-xs text-muted-foreground uppercase">{tzAbbr}</span>
          </div>
        </div>
      </div>
    </header>
  );
}
