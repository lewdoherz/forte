import { revokeOtherSessionsAction, revokeSessionAction } from "@/lib/account-actions";
import { formatDateTimeInTimeZone } from "@/lib/timezone";

/**
 * One active session, flattened to what the UI shows. `token` is null when
 * Better Auth's output parser withholds it, in which case the session can still
 * be ended via "sign out everywhere else" but not individually.
 */
export interface ActiveSession {
  id: string;
  token: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
  expiresAt: Date;
}

interface SessionListProps {
  sessions: ActiveSession[];
  currentToken: string | null;
  /** The owner's zone, so session times read consistently with the rest of the app. */
  timeZone: string;
}

/**
 * "Where you are signed in". The user-agent is shown verbatim rather than
 * prettified into a device name: guessing "Chrome on macOS" from it would look
 * authoritative while often being wrong, and this is a security-relevant list.
 */
export function SessionList({ sessions, currentToken, timeZone }: SessionListProps) {
  const others = sessions.filter((session) => session.token !== currentToken);

  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold">Where you are signed in</h2>
      <p className="mt-1 text-sm text-zinc-500">
        Devices that can currently reach your account. Signing one out takes effect immediately.
      </p>

      <ul className="mt-4 divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white shadow-sm">
        {sessions.map((session) => {
          const isCurrent = session.token !== null && session.token === currentToken;
          // Better Auth can store an empty user-agent, and represents an
          // unresolved address as the unspecified IPv6 address. Both would
          // otherwise render as blank, which reads as a broken row rather than
          // as "we don't know".
          const device = session.userAgent?.trim() ? session.userAgent : "Unknown device";
          const address =
            session.ipAddress && !/^(0{4}:){7}0{4}$|^::$/.test(session.ipAddress)
              ? session.ipAddress
              : "unknown address";
          return (
            <li
              key={session.id}
              className="flex flex-wrap items-start justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 break-words text-sm font-medium">{device}</span>
                  {isCurrent ? (
                    <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">
                      This device
                    </span>
                  ) : null}
                </div>
                <div className="mt-0.5 text-xs text-zinc-500">
                  {address} · started {formatDateTimeInTimeZone(session.createdAt, timeZone)} ·
                  expires {formatDateTimeInTimeZone(session.expiresAt, timeZone)}
                </div>
              </div>

              {!isCurrent && session.token ? (
                <form action={revokeSessionAction} className="shrink-0">
                  <input type="hidden" name="token" value={session.token} />
                  <button
                    type="submit"
                    className="h-10 rounded-md border border-red-300 px-3 text-sm font-medium text-red-700 hover:bg-red-50"
                  >
                    Sign out
                  </button>
                </form>
              ) : null}
            </li>
          );
        })}
      </ul>

      {others.some((session) => session.token !== null) ? (
        <form action={revokeOtherSessionsAction} className="mt-3">
          <button
            type="submit"
            className="h-11 rounded-md border border-zinc-300 px-4 text-sm font-medium hover:bg-zinc-100"
          >
            Sign out everywhere else
          </button>
        </form>
      ) : null}
    </section>
  );
}
