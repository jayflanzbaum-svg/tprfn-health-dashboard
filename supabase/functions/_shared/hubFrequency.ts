export const TRANSPORT_OPTIONS = ['vara-hf', 'vara-fm', 'ax25', 'ax25-vhf', 'ax25-uhf', 'ardop', 'pactor', 'packet', 'data2g', 'other'];
export const MODEM_OPTIONS = ['vara', 'VARA FM', 'afsk1200', 'afsk9600', 'gfsk9600', 'AX.25', 'ARDOP', 'PACTOR', 'data2g', 'Other'];
export const MODE_OPTIONS = ['USB', 'LSB', 'FM'];
export const BANDWIDTH_OPTIONS = [500, 2300, 2750] as const;

export interface HubFrequency {
  freq_mhz: number;
  mode: string;
  transport: string;
  modem: string;
  scan_times?: string | null;
  bandwidth_hz?: number | null;
}

export function normalizeHubFrequency(f: HubFrequency): HubFrequency {
  const { bandwidth_hz, ...rest } = f;
  return {
    ...rest,
    modem: f.modem === 'VARA' ? 'vara' : f.modem,
    mode: f.mode === '1200' ? 'FM' : f.mode,
    ...(typeof bandwidth_hz === 'number' && BANDWIDTH_OPTIONS.some(value => value === bandwidth_hz)
      ? { bandwidth_hz } : {}),
  };
}