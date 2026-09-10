"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function ProgressControls({
  options,
  ranges,
  selectedId,
  range,
}: {
  options: { id: string; title: string }[];
  ranges: { value: string; label: string }[];
  selectedId: string;
  range: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function update(key: string, value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`${pathname}?${next.toString()}`);
  }

  return (
    <div className="mt-6 flex flex-wrap items-end gap-3">
      <label className="flex min-w-56 flex-1 flex-col gap-1">
        <span className="text-sm font-medium">Exercise</span>
        <select
          value={selectedId}
          onChange={(e) => update("exercise", e.target.value)}
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        >
          <option value="">Select an exercise…</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.title}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Range</span>
        <select
          value={range}
          onChange={(e) => update("range", e.target.value)}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
        >
          {ranges.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
