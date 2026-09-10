"use client";

import { useEffect, useState } from "react";

export function ElapsedTimer({ startedAt, endedAt }: { startedAt: string; endedAt: string | null }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (endedAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [endedAt]);

  const end = endedAt ? new Date(endedAt).getTime() : now;
  const seconds = Math.max(0, Math.floor((end - new Date(startedAt).getTime()) / 1000));
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return <>{m}:{String(s).padStart(2, "0")}</>;
}
