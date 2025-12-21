import { Radio, Activity, Wifi, Signal, ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: 'radio' | 'activity' | 'wifi' | 'signal';
  trend?: {
    value: number;
    label: string;
  };
  className?: string;
  delay?: number;
  onClick?: () => void;
  isActive?: boolean;
  onJumpToLogs?: () => void;
  accentColor?: 'teal' | 'blue' | 'purple' | 'orange';
}

const icons = {
  radio: Radio,
  activity: Activity,
  wifi: Wifi,
  signal: Signal,
};

const accentColors = {
  teal: {
    bg: 'bg-teal-500/10',
    text: 'text-teal-600',
    ring: 'ring-teal-500/50',
    icon: 'text-teal-500',
  },
  blue: {
    bg: 'bg-blue-500/10',
    text: 'text-blue-600',
    ring: 'ring-blue-500/50',
    icon: 'text-blue-500',
  },
  purple: {
    bg: 'bg-purple-500/10',
    text: 'text-purple-600',
    ring: 'ring-purple-500/50',
    icon: 'text-purple-500',
  },
  orange: {
    bg: 'bg-orange-500/10',
    text: 'text-orange-600',
    ring: 'ring-orange-500/50',
    icon: 'text-orange-500',
  },
};

export function StatsCard({ title, value, subtitle, icon, trend, className, delay = 0, onClick, isActive, onJumpToLogs, accentColor = 'teal' }: StatsCardProps) {
  const Icon = icons[icon];
  const colors = accentColors[accentColor];

  return (
    <div 
      className={cn(
        "stat-card animate-slide-up transition-all duration-200",
        onClick && "cursor-pointer hover:ring-2",
        onClick && `hover:${colors.ring}`,
        isActive && `ring-2 ${colors.ring}`,
        className
      )}
      style={{ animationDelay: `${delay}ms` }}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-foreground font-mono">
            {value}
          </p>
          {subtitle && (
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          )}
          {trend && (
            <div className="mt-2 flex items-center gap-1">
              <span className={cn(
                "text-xs font-medium",
                trend.value >= 0 ? "text-chart-success" : "text-chart-danger"
              )}>
                {trend.value >= 0 ? '+' : ''}{trend.value}%
              </span>
              <span className="text-xs text-muted-foreground">{trend.label}</span>
            </div>
          )}
          {isActive && onJumpToLogs && (
            <button 
              onClick={(e) => {
                e.stopPropagation();
                onJumpToLogs();
              }}
              className={cn("mt-2 flex items-center gap-1 hover:underline", colors.text)}
            >
              <ArrowDown className="h-3 w-3" />
              <span className="text-xs font-medium">Jump to Log Entries</span>
            </button>
          )}
        </div>
        <div className={cn("flex h-12 w-12 items-center justify-center rounded-xl", colors.bg)}>
          <Icon className={cn("h-6 w-6", colors.icon)} />
        </div>
      </div>
    </div>
  );
}
