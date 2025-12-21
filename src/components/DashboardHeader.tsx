import { Radio, Calendar, Wifi, Clock } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface DashboardHeaderProps {
  dateRange: { start: Date; end: Date };
  stationCount: number;
  connectionCount: number;
  lastUpdated?: Date;
  stations: string[];
  selectedStation: string | null;
  onStationChange: (station: string | null) => void;
}

export function DashboardHeader({ 
  dateRange, 
  stationCount, 
  connectionCount, 
  lastUpdated,
  stations,
  selectedStation,
  onStationChange
}: DashboardHeaderProps) {
  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

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
              RF Connection Analytics
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

          <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary border border-border/50">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">
              {formatDate(dateRange.start)} - {formatDate(dateRange.end)}
            </span>
          </div>

          <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary border border-border/50">
            <Wifi className="h-4 w-4 text-accent" />
            <span className="text-sm">
              <span className="font-mono font-semibold text-foreground">{stationCount}</span>
              <span className="text-muted-foreground ml-1">stations</span>
            </span>
          </div>

          <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary border border-border/50">
            <Radio className="h-4 w-4 text-chart-secondary" />
            <span className="text-sm">
              <span className="font-mono font-semibold text-foreground">{connectionCount}</span>
              <span className="text-muted-foreground ml-1">connections</span>
            </span>
          </div>

          {lastUpdated && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span>Last updated: {formatTime(lastUpdated)}</span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
