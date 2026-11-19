import { describe, expect, test } from 'bun:test';
import { BANDWIDTH_OPTIONS, MODEM_OPTIONS, MODE_OPTIONS, TRANSPORT_OPTIONS, normalizeHubFrequency } from './hubFrequency';

const frequency = { freq_mhz: 14.1023, mode: 'USB', transport: 'vara-hf', modem: 'vara', scan_times: '24/7' };

describe('hub frequency contract', () => {
  test('transport supports data2g', () => expect(TRANSPORT_OPTIONS).toContain('data2g'));
  test('modem supports data2g and only lowercase vara', () => {
    expect(MODEM_OPTIONS).toContain('data2g');
    expect(MODEM_OPTIONS.filter(value => value.toLowerCase() === 'vara')).toEqual(['vara']);
    expect(normalizeHubFrequency({ ...frequency, modem: 'VARA' }).modem).toBe('vara');
  });
  test('bandwidth is numeric with exactly the supported choices', () => {
    expect(BANDWIDTH_OPTIONS).toEqual([500, 2300, 2750]);
    for (const bandwidth_hz of BANDWIDTH_OPTIONS) {
      expect(normalizeHubFrequency({ ...frequency, bandwidth_hz })).toEqual({ ...frequency, bandwidth_hz });
    }
  });
  test('blank bandwidth is omitted and existing fields stay unchanged', () => {
    expect(normalizeHubFrequency({ ...frequency, bandwidth_hz: null })).toEqual(frequency);
    expect(normalizeHubFrequency(frequency)).toEqual(frequency);
  });
  test('mode suggestions are USB LSB FM and legacy 1200 becomes FM', () => {
    expect(MODE_OPTIONS).toEqual(['USB', 'LSB', 'FM']);
    expect(normalizeHubFrequency({ ...frequency, mode: '1200' }).mode).toBe('FM');
  });
});