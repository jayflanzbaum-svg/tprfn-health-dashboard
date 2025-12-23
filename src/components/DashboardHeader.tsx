import { Radio, Wifi, Clock, RefreshCw } from 'lucide-react';
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

interface DashboardHeaderProps {
  stationCount: number;
  connectionCount: number;
  lastUpdated?: Date | null;
  stations: string[];
  selectedStation: string | null;
  onStationChange: (station: string | null) => void;
  dateRange: DateRange;
  onDateRangeChange: (range: DateRange) => void;
  dataDateRange?: { start: Date; end: Date };
  onRefresh?: () => void;
  isRefreshing?: boolean;
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
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit'
    });
  };

  return (
    <header className="mb-8 animate-fade-in">
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
    </header>
  );
}
