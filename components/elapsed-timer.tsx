"use client";

import { useEffect, useState } from "react";
import { formatStopwatch } from "@/lib/i18n/format";

export function ElapsedTimer({ startedAt, endedAt }: { startedAt: string; endedAt: string | null }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    if (endedAt) return;
    const update = () => setNow(Date.now());
    const initial = window.setTimeout(update, 0);
    const timer = window.setInterval(update, 1000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, [endedAt]);

  const end = endedAt ? Date.parse(endedAt) : now;
  const seconds = end === null ? null : Math.max(0, Math.floor((end - Date.parse(startedAt)) / 1000));
  // Digits and colons only, so the reading is the same in every language; the
  // shared helper keeps it identical to the rest countdown's.
  return <>{seconds === null ? "—" : formatStopwatch(seconds)}</>;
}
