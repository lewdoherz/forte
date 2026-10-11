"use client";

import { useEffect, useState } from "react";
import { formatStopwatch } from "@/lib/i18n/format";

export function ElapsedTimer({ startedAt, endedAt }: { startedAt: string; endedAt: string | null }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (endedAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [endedAt]);

  const end = endedAt ? new Date(endedAt).getTime() : now;
  const seconds = Math.max(0, Math.floor((end - new Date(startedAt).getTime()) / 1000));
  // Digits and colons only, so the reading is the same in every language; the
  // shared helper keeps it identical to the rest countdown's.
  return <>{formatStopwatch(seconds)}</>;
}
