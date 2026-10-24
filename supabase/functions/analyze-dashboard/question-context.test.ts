import { describe, it, expect } from 'bun:test';
import { baseCallsign, namedStations, distanceMiles } from './question-context';

describe('station question evidence', () => {
  it('recognizes the requested N4SFL instead of a different dashboard station', () => {
    expect(namedStations('Has N4SFL degraded over time?', ['K1AJD', 'N4SFL'], 'K1AJD')).toEqual(['N4SFL']);
  });
  it('matches SSIDs against the directory base callsign', () => {
    expect(baseCallsign(' n4sfl-1 ')).toBe('N4SFL');
    expect(namedStations('Compare N4SFL-1 and K1AJD', ['N4SFL', 'K1AJD'], null)).toEqual(['N4SFL', 'K1AJD']);
  });
  it('falls back to selected station when none is named', () => {
    expect(namedStations('Is performance cyclical?', ['N4SFL', 'K1AJD'], 'N4SFL')).toEqual(['N4SFL']);
  });
  it('keeps zero coordinates valid for geographic comparisons', () => {
    expect(distanceMiles({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 })).toBe(69);
  });
});