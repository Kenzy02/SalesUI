/** Display formatting. Amounts and dates come from Salesforce; nothing here calculates business values. */

const moneyCache = new Map<string, Intl.NumberFormat>();

export function money(value: number | null | undefined, currency: string, fractionDigits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const key = `${currency}:${fractionDigits}`;
  let f = moneyCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
    moneyCache.set(key, f);
  }
  return f.format(value);
}

const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
let dateTimeFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * Use the Salesforce user's time zone for timestamps (e.g. created dates), so they
 * match Salesforce rather than the device. Date-only values are calendar days and
 * are never shifted.
 */
export function setDisplayTimeZone(timeZone: string | undefined) {
  if (!timeZone) return;
  try {
    dateTimeFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone });
  } catch {
    /* unknown zone: keep the device zone */
  }
}

/** Parses Salesforce dates ('2026-10-05') as local calendar days, datetimes as instants. */
export function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function date(value: string | null | undefined): string {
  const d = parseDate(value);
  if (!d) return '—';
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? dateFormat.format(d) : dateTimeFormat.format(d);
}

/** Whole days from `today` to `value` (negative = in the past). */
export function daysUntil(value: string | null | undefined, today: string): number | null {
  const d = parseDate(value);
  const t = parseDate(today);
  if (!d || !t) return null;
  const day = 24 * 60 * 60 * 1000;
  return Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - t.getTime()) / day);
}

export function relativeDays(value: string | null | undefined, today: string): string {
  const n = daysUntil(value, today);
  if (n === null) return '';
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}

export function area(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : `${new Intl.NumberFormat('en-US').format(value)} m²`;
}

export function percent(value: number | null | undefined, fractionDigits = 0): string {
  if (value === null || value === undefined) return '—';
  return `${value.toFixed(fractionDigits)}%`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0]!.toUpperCase())
    .join('');
}

export function fileSize(bytes: number | null | undefined): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
