import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Radio, Wifi, Clock, RefreshCw, Globe, CheckCircle2, Loader2, Share2, Check, BookOpen } from 'lucide-react';
import { Link } from 'react-router-dom';
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
import { useHubActivityStatus } from '@/hooks/useHubActivityStatus';
import { SupportForm } from '@/components/SupportForm';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

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
  allowedCallsigns: string[];
  onShareClick?: () => Promise<boolean>;
  activeStations?: Set<string>;
  onHubAdded?: (callsign: string) => void;
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
  isRefreshing,
  allowedCallsigns,
  onShareClick,
  activeStations,
  onHubAdded
}: DashboardHeaderProps) {
  const now = useCurrentTime();
  const tzAbbr = getTimezoneAbbr();
  const hubStatus = useHubActivityStatus(allowedCallsigns);
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    if (onShareClick) {
      const success = await onShareClick();
      if (success) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit'
    });
  };

  return (
    <header className="mb-4 animate-fade-in">
      {/* Row 1: Title and controls */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 border border-accent/20">
            <Radio className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground tracking-tight">
              TPRFN <span className="gradient-text">HEALTH DASHBOARD</span>
            </h1>
            <p className="text-muted-foreground text-xs">
              RF Connection Analytics • Auto-refreshes every 5 min
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Station Filter Dropdown */}
          <Select 
            value={selectedStation || 'all'} 
            onValueChange={(value) => onStationChange(value === 'all' ? null : value)}
          >
            <SelectTrigger className="w-40 h-8 text-sm bg-card border-border">
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
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-secondary border border-border/50"
            title={selectedStation ? `Selected station: ${selectedStation}` : "Hub stations (callsigns) in the data"}
          >
            <Wifi className="h-3.5 w-3.5 text-accent" />
            <span className="text-xs">
              {selectedStation ? (
                <>
                  <span className="font-mono font-semibold text-foreground">{selectedStation}</span>
                  <span className="text-muted-foreground ml-1">Hub</span>
                </>
              ) : (
                <>
                  <span className="font-mono font-semibold text-foreground">{stationCount}</span>
                  <span className="text-muted-foreground ml-1">Hubs</span>
                </>
              )}
            </span>
          </div>

          <div 
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-secondary border border-border/50"
            title="Unique station pairs that communicated"
          >
            <Radio className="h-3.5 w-3.5 text-chart-secondary" />
            <span className="text-xs">
              <span className="font-mono font-semibold text-foreground">{connectionCount}</span>
              <span className="text-muted-foreground ml-1">pairs</span>
            </span>
          </div>

          {/* Station Locations Manager - visible to all, editing auth-protected */}
          <StationLocationsManager callsigns={allowedCallsigns} activeStations={activeStations} onHubAdded={onHubAdded} />

          {/* Hub Directory link */}
          <Link to="/hubs">
            <Button variant="outline" size="sm" className="h-7 px-2 gap-1">
              <BookOpen className="h-3 w-3" />
              <span className="hidden sm:inline text-xs">Hub Directory</span>
            </Button>
          </Link>


          {/* Share button */}
          {onShareClick && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleShare}
                  className="h-7 px-2 gap-1"
                >
                  {copied ? (
                    <Check className="h-3 w-3 text-green-500" />
                  ) : (
                    <Share2 className="h-3 w-3" />
                  )}
                  <span className="hidden sm:inline text-xs">
                    {copied ? 'Copied!' : 'Share'}
                  </span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Copy shareable URL with current filters</p>
              </TooltipContent>
            </Tooltip>
          )}

          {/* Refresh button and last updated */}
          <div className="flex items-center gap-1.5">
            {onRefresh && (
              <Button
                variant="outline"
                size="sm"
                onClick={onRefresh}
                disabled={isRefreshing}
                className="h-7 px-2 gap-1"
              >
                <RefreshCw className={cn("h-3 w-3", isRefreshing && "animate-spin")} />
                <span className="hidden sm:inline text-xs">Refresh</span>
              </Button>
            )}
            {lastUpdated && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>{formatTime(lastUpdated)}</span>
              </div>
            )}
          </div>

          {/* Compact Time Display - inline */}
          <div className="hidden lg:inline-flex items-center gap-2 px-3 py-1 rounded-md bg-gradient-to-r from-accent/10 via-primary/10 to-chart-secondary/10 border border-accent/20">
            <Globe className="h-3.5 w-3.5 text-accent" />
            <span className="text-sm font-mono font-bold text-foreground">
              {formatZulu(now)}
            </span>
            <span className="text-xs text-muted-foreground">UTC</span>
            <div className="h-3 w-px bg-border/50" />
            <span className="text-sm font-mono font-bold text-accent">
              {formatDateMMDDYYYY(now)}
            </span>
            <div className="h-3 w-px bg-border/50" />
            <span className="text-sm font-mono font-bold text-foreground">
              {format(now, 'HH:mm:ss')}
            </span>
            <span className="text-xs text-muted-foreground">{tzAbbr}</span>
            <div className="h-3 w-px bg-border/50" />
            {hubStatus.loading ? (
              <div className="flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Checking...</span>
              </div>
            ) : hubStatus.allActive ? (
              <div className="flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                <span className="text-xs text-muted-foreground">ALL {hubStatus.totalCount} HUB STATIONS ACTIVE</span>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">{hubStatus.activeCount}/{hubStatus.totalCount} ACTIVE</span>
              </div>
            )}
          </div>

          {/* Contact Support */}
          <SupportForm />
        </div>
      </div>
    </header>
  );
}
