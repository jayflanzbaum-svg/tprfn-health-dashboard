import { cn } from '@/lib/utils';
import { getSignalQuality, getSignalQualityLabel } from '@/lib/syslogParser';

interface SignalBadgeProps {
  snValue: number;
  showValue?: boolean;
  className?: string;
}

export function SignalBadge({ snValue, showValue = true, className }: SignalBadgeProps) {
  const quality = getSignalQuality(snValue);
  const label = getSignalQualityLabel(quality);

  return (
    <span className={cn("signal-indicator", `signal-${quality}`, className)}>
      <span className={cn(
        "h-2 w-2 rounded-full",
        quality === 'excellent' && "bg-emerald-500",
        quality === 'good' && "bg-green-500",
        quality === 'fair' && "bg-amber-500",
        quality === 'poor' && "bg-orange-500",
        quality === 'bad' && "bg-red-500",
      )} />
      {showValue ? `${snValue.toFixed(1)} dB` : label}
    </span>
  );
}
