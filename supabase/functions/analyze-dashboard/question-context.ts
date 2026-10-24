export function baseCallsign(value: string) {
  return value.trim().toUpperCase().replace(/-[0-9A-Z]+$/, '');
}

export function namedStations(question: string, available: string[], selected: string | null) {
  const tokens = new Set((question.toUpperCase().match(/[A-Z0-9]+(?:-[A-Z0-9]+)?/g) || []).map(baseCallsign));
  const named = available.filter(cs => tokens.has(baseCallsign(cs)));
  return [...new Set(named.length ? named.map(baseCallsign) : selected ? [baseCallsign(selected)] : available.map(baseCallsign))];
}

export function distanceMiles(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const radians = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * radians;
  const dLon = (b.longitude - a.longitude) * radians;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * radians) * Math.cos(b.latitude * radians) * Math.sin(dLon / 2) ** 2;
  return Math.round(3959 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
}