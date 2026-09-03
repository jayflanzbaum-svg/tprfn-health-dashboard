// Parses net announcement emails into UTC start/end timestamps.
// Handles lines like:
//   Date: Sat, 15 Aug 2026 17:00:55 PDT
//   STARTS: Now Open   ENDS: Saturday, August 22nd @ 23:59 UTC
//   STARTS: Saturday, August 15th @ 17:00 PDT

const TZ_OFFSET_MINUTES: Record<string, number> = {
  UTC: 0, GMT: 0, Z: 0, ZULU: 0,
  EST: -300, EDT: -240,
  CST: -360, CDT: -300,
  MST: -420, MDT: -360,
  PST: -480, PDT: -420,
  AKST: -540, AKDT: -480,
  HST: -600,
  AST: -240, ADT: -180,
};

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

export interface ParsedNetEmail {
  start?: Date;
  end?: Date;
  name?: string;
  warnings: string[];
}

function monthFrom(token: string): number | undefined {
  return MONTHS[token.slice(0, 3).toLowerCase()];
}

function toUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  tz?: string,
): Date {
  const offset = tz ? TZ_OFFSET_MINUTES[tz.toUpperCase()] ?? 0 : 0;
  return new Date(Date.UTC(year, month, day, hour, minute) - offset * 60_000);
}

/** Parses "Date: Sat, 15 Aug 2026 17:00:55 PDT" style headers. */
function parseHeaderDate(text: string): Date | undefined {
  const m = text.match(
    /^\s*Date:\s*(?:\w{3},\s*)?(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([A-Za-z]{2,4}|[+-]\d{4})?/mi,
  );
  if (!m) return undefined;
  const month = monthFrom(m[2]);
  if (month === undefined) return undefined;
  const tz = m[7];
  if (tz && /^[+-]\d{4}$/.test(tz)) {
    const sign = tz[0] === '-' ? -1 : 1;
    const mins = sign * (parseInt(tz.slice(1, 3), 10) * 60 + parseInt(tz.slice(3, 5), 10));
    return new Date(
      Date.UTC(parseInt(m[3], 10), month, parseInt(m[1], 10), parseInt(m[4], 10), parseInt(m[5], 10)) -
        mins * 60_000,
    );
  }
  return toUtc(parseInt(m[3], 10), month, parseInt(m[1], 10), parseInt(m[4], 10), parseInt(m[5], 10), tz);
}

/**
 * Parses "Saturday, August 22nd @ 23:59 UTC" / "Aug 22 2026 2359Z" style values.
 * Falls back to `fallbackYear` when the year is omitted.
 */
function parseNetMoment(value: string, fallbackYear: number): Date | undefined {
  const cleaned = value.replace(/^[A-Za-z]+day,?\s*/i, '').trim();

  const m = cleaned.match(
    /([A-Za-z]{3,})\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?\s*(?:@|at)?\s*(\d{1,2}):?(\d{2})?\s*([A-Za-z]{1,4})?/,
  );
  if (!m) return undefined;

  let month = monthFrom(m[1]);
  let day = parseInt(m[2], 10);
  // Handle "22 August" ordering too.
  if (month === undefined) {
    const alt = cleaned.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,})/);
    if (!alt) return undefined;
    day = parseInt(alt[1], 10);
    month = monthFrom(alt[2]);
    if (month === undefined) return undefined;
  }

  const year = m[3] ? parseInt(m[3], 10) : fallbackYear;
  const hour = m[4] !== undefined ? parseInt(m[4], 10) : 23;
  const minute = m[5] !== undefined ? parseInt(m[5], 10) : 59;
  const tz = m[6] || 'UTC';
  return toUtc(year, month, day, hour, minute, tz);
}

export function parseNetEmail(text: string): ParsedNetEmail {
  const warnings: string[] = [];
  const headerDate = parseHeaderDate(text);
  const fallbackYear = (headerDate ?? new Date()).getUTCFullYear();

  const startMatch = text.match(/STARTS?\s*:\s*([^\n]*?)(?:\s{2,}|\s*\|\s*|\s+ENDS?\s*:|$)/i);
  const endMatch = text.match(/ENDS?\s*:\s*([^\n]*)/i);

  let start: Date | undefined;
  if (startMatch) {
    const raw = startMatch[1].trim();
    if (/now\s*open|open\s*now|immediately/i.test(raw)) {
      start = headerDate;
      if (!start) warnings.push('"Now Open" found but no email Date header to anchor the start time.');
    } else {
      start = parseNetMoment(raw, fallbackYear);
      if (!start) warnings.push(`Could not read start time from "${raw}".`);
    }
  } else if (headerDate) {
    start = headerDate;
  }

  let end: Date | undefined;
  if (endMatch) {
    const raw = endMatch[1].trim();
    end = parseNetMoment(raw, fallbackYear);
    if (!end) warnings.push(`Could not read end time from "${raw}".`);
  } else {
    warnings.push('No "ENDS:" line found.');
  }

  // Roll the end into the next year if it lands before the start (Dec -> Jan nets).
  if (start && end && end.getTime() < start.getTime()) {
    end = new Date(Date.UTC(end.getUTCFullYear() + 1, end.getUTCMonth(), end.getUTCDate(), end.getUTCHours(), end.getUTCMinutes()));
  }

  let name: string | undefined;
  const monthName = start
    ? start.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' })
    : undefined;
  if (monthName && /month'?s?\s+net|monthly\s+net/i.test(text)) {
    name = `${monthName} Check-in Net`;
  }

  return { start, end, name, warnings };
}
