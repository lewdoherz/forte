/**
 * Duration only. Date and time formatting lives in `lib/timezone.ts` as
 * `formatDateTimeInTimeZone`, which takes the owner's zone explicitly: a
 * formatter that uses the ambient zone renders in the server's (UTC in
 * production) rather than the user's, and the two disagree by hours.
 */
export function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
