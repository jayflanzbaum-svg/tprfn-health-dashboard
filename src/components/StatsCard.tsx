import { Radio, Activity, Wifi, Signal } from 'lucide-react';
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
}

const icons = {
  radio: Radio,
  activity: Activity,
  wifi: Wifi,
  signal: Signal,
};

export function StatsCard({ title, value, subtitle, icon, trend, className, delay = 0 }: StatsCardProps) {
  const Icon = icons[icon];

  return (
    <div 
      className={cn("stat-card animate-slide-up", className)}
      style={{ animationDelay: `${delay}ms` }}
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
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10">
          <Icon className="h-6 w-6 text-accent" />
        </div>
      </div>
    </div>
  );
}
