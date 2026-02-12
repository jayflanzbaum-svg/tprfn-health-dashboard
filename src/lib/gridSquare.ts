/**
 * Maidenhead Grid Square ↔ Lat/Long conversion utilities
 */

/**
 * Convert a Maidenhead grid square to latitude/longitude (center of the grid).
 * Supports 4-char (e.g., EM12) and 6-char (e.g., EM12ab) locators.
 */
export function gridToLatLng(grid: string): { lat: number; lng: number } | null {
  const g = grid.trim();
  if (g.length < 4) return null;

  const upper = g.substring(0, 2).toUpperCase();
  const A = 'A'.charCodeAt(0);

  const lon1 = (upper.charCodeAt(0) - A) * 20 - 180;
  const lat1 = (upper.charCodeAt(1) - A) * 10 - 90;

  const d2 = g.substring(2, 4);
  if (!/^\d{2}$/.test(d2)) return null;
  const lon2 = parseInt(d2[0]) * 2;
  const lat2 = parseInt(d2[1]) * 1;

  let lon = lon1 + lon2;
  let lat = lat1 + lat2;

  if (g.length >= 6) {
    const sub = g.substring(4, 6).toLowerCase();
    if (/^[a-x]{2}$/.test(sub)) {
      const a = 'a'.charCodeAt(0);
      lon += ((sub.charCodeAt(0) - a) * 2) / 24 + 1 / 24;
      lat += ((sub.charCodeAt(1) - a) * 1) / 24 + 0.5 / 24;
    } else {
      lon += 1; // center of 2° field
      lat += 0.5;
    }
  } else {
    lon += 1; // center of 2° field
    lat += 0.5;
  }

  return { lat: parseFloat(lat.toFixed(4)), lng: parseFloat(lon.toFixed(4)) };
}

/**
 * Convert latitude/longitude to a 6-character Maidenhead grid square.
 */
export function latLngToGrid(lat: number, lng: number): string {
  const A = 'A'.charCodeAt(0);
  const a = 'a'.charCodeAt(0);

  let lon = lng + 180;
  let la = lat + 90;

  const f1 = Math.floor(lon / 20);
  const f2 = Math.floor(la / 10);
  lon -= f1 * 20;
  la -= f2 * 10;

  const s1 = Math.floor(lon / 2);
  const s2 = Math.floor(la / 1);
  lon -= s1 * 2;
  la -= s2 * 1;

  const t1 = Math.floor(lon / (2 / 24));
  const t2 = Math.floor(la / (1 / 24));

  return (
    String.fromCharCode(A + f1) +
    String.fromCharCode(A + f2) +
    s1.toString() +
    s2.toString() +
    String.fromCharCode(a + Math.min(t1, 23)) +
    String.fromCharCode(a + Math.min(t2, 23))
  );
}

/**
 * Validate a grid square string (4 or 6 characters).
 */
export function isValidGrid(grid: string): boolean {
  return /^[A-Ra-r]{2}\d{2}([A-Xa-x]{2})?$/i.test(grid.trim());
}
