/**
 * User-timezone handling.
 *
 * Instants are stored as `timestamptz` (an absolute point in time). Every place
 * the application turns an instant into a *calendar* concept — a day boundary,
 * a range lower bound, a displayed date — must do so in the user's own IANA
 * timezone rather than the server's. This module is the single implementation
 * of that conversion.
 *
 * The user's zone is a stored preference (`app_user.timezone`), deliberately not
 * inferred per request from the browser: analytics bucketing must be stable and
 * server-computable (a user moving between devices must not change their own
 * historical grouping).
 */

export const DEFAULT_TIME_ZONE = "UTC";

const partsFormatters = new Map<string, Intl.DateTimeFormat>();
const displayFormatters = new Map<string, Intl.DateTimeFormat>();
const validity = new Map<string, boolean>();

/**
 * Formatter exposing the calendar fields of an instant in a given zone.
 * `hourCycle: "h23"` avoids the "24:00" midnight representation.
 */
function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = partsFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    partsFormatters.set(timeZone, formatter);
  }
  return formatter;
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** Calendar fields of `date` as observed in `timeZone`. */
function zonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = partsFormatter(timeZone).formatToParts(date);
  const out: ZonedParts = { year: 0, month: 1, day: 1, hour: 0, minute: 0, second: 0 };
  for (const part of parts) {
    switch (part.type) {
      case "year":
        out.year = Number(part.value);
        break;
      case "month":
        out.month = Number(part.value);
        break;
      case "day":
        out.day = Number(part.value);
        break;
      case "hour":
        out.hour = Number(part.value);
        break;
      case "minute":
        out.minute = Number(part.value);
        break;
      case "second":
        out.second = Number(part.value);
        break;
      default:
        break;
    }
  }
  return out;
}

/** Offset of `timeZone` from UTC in milliseconds at the given instant. */
function zoneOffsetMs(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Converts a local calendar date in `timeZone` to the instant the day begins. */
function localMidnightUtc(
  year: number,
  month: number,
  day: number,
  timeZone: string,
): Date {
  // `Date.UTC` normalises out-of-range day/month values (e.g. day 0 or 32).
  const guess = Date.UTC(year, month - 1, day);
  // First pass: correct by the offset in effect at the naive instant.
  const firstPass = guess - zoneOffsetMs(new Date(guess), timeZone);
  // Second pass: the correction can itself cross a DST transition, which moves
  // the offset; re-evaluating at the corrected instant settles it. Zones whose
  // DST jump happens exactly at midnight may have no 00:00 local time at all —
  // this then yields the first valid instant of that day, which is the intended
  // "start of day" semantics.
  const secondPass = guess - zoneOffsetMs(new Date(firstPass), timeZone);
  return new Date(secondPass);
}

/**
 * Validates an IANA timezone name (e.g. `America/Chicago`) the way the runtime
 * itself resolves it. Results are memoised: the check relies on `Intl`
 * throwing, and exceptions are expensive on a hot validation path.
 */
export function isValidTimeZone(timeZone: string): boolean {
  const cached = validity.get(timeZone);
  if (cached !== undefined) return cached;

  let valid = true;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
  } catch {
    valid = false;
  }
  validity.set(timeZone, valid);
  return valid;
}

/**
 * The instant at which a local calendar day begins, in `timeZone`.
 *
 * `offset` shifts the day in CALENDAR space, not by a fixed number of
 * milliseconds, so "30 days ago" lands on the same local boundary even when the
 * interval spans a DST transition (23- or 25-hour days).
 */
export function startOfLocalDay(
  date: Date,
  timeZone: string,
  offset: { days?: number; years?: number } = {},
): Date {
  const p = zonedParts(date, timeZone);
  if (!offset.days && !offset.years) return localMidnightUtc(p.year, p.month, p.day, timeZone);

  // Shift in pure calendar space: build the target y/m/d and let Date.UTC
  // normalise month and year rollover. Negative offsets move backwards.
  const shifted = new Date(
    Date.UTC(p.year + (offset.years ?? 0), p.month - 1, p.day + (offset.days ?? 0)),
  );
  return localMidnightUtc(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth() + 1,
    shifted.getUTCDate(),
    timeZone,
  );
}

/**
 * Formats an instant as a date and time in the user's zone. Same Medium/Short
 * shape as `format.ts`'s server-local `formatDateTime`, but timezone-correct.
 */
export function formatDateTimeInTimeZone(date: Date, timeZone: string): string {
  let formatter = displayFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone,
    });
    displayFormatters.set(timeZone, formatter);
  }
  return formatter.format(date);
}
