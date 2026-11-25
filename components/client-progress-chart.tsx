"use client";

import { useI18n } from "@/lib/i18n/context";
import { formatNumber } from "@/lib/i18n/format";

/** Theme-aware client SVG line chart matching Forte's ProgressChart. */
export function ClientProgressChart({
  title,
  unit,
  points,
  formatValue,
}: {
  title: string;
  unit: string;
  points: { label: string; value: number }[];
  formatValue?: (value: number) => string;
}) {
  const { locale, t } = useI18n();
  if (points.length === 0) return null;

  const width = 600;
  const height = 160;
  const pad = 28;
  const values = points.map((p) => p.value);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const step = points.length > 1 ? (width - pad * 2) / (points.length - 1) : 0;
  const scaleY = (value: number) =>
    max > min ? height - pad - ((value - min) / (max - min)) * (height - pad * 2) : height / 2;
  const coords = points.map((p, i) => ({ x: pad + i * step, y: scaleY(p.value) }));
  const polyline = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");

  return (
    <section className="mt-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
        {title}
      </h3>
      <div className="training-panel mt-2 rounded-2xl p-3">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full"
          role="img"
          aria-label={t("progress.chart.ariaLabel", { title, unit })}
        >
          <polyline
            points={polyline}
            fill="none"
            stroke="var(--accent-text)"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {coords.map((c, i) => (
            <circle key={i} cx={c.x} cy={c.y} r={4} fill="var(--accent-text)" />
          ))}
          <text x={pad} y={14} fontSize={11} fill="var(--text-muted)">
            {unit
              ? t("common.quantity", {
                  value: formatValue ? formatValue(max) : formatNumber(locale, max),
                  unit,
                })
              : formatValue
                ? formatValue(max)
                : formatNumber(locale, max)}
          </text>
          <text x={pad} y={height - 6} fontSize={11} fill="var(--text-muted)">
            {unit
              ? t("common.quantity", {
                  value: formatValue ? formatValue(min) : formatNumber(locale, min),
                  unit,
                })
              : formatValue
                ? formatValue(min)
                : formatNumber(locale, min)}
          </text>
        </svg>
        <div className="mt-1 flex justify-between text-[11px] text-[var(--text-muted)]">
          <span>{points[0].label}</span>
          <span>{points[points.length - 1].label}</span>
        </div>
      </div>
    </section>
  );
}
