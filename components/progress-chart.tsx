import { formatNumber } from "@/lib/i18n/format";
import { getI18n } from "@/lib/i18n/server";

/** A single-series line chart. Values arrive already computed by the canonical
 * statistics layer; this component only draws them. */
export async function ProgressChart({
  title,
  unit,
  points,
  formatValue,
}: {
  title: string;
  unit: string;
  points: { label: string; value: number }[];
  /** Axis labels; fractional metrics provide their own formatter. */
  formatValue?: (value: number) => string;
}) {
  if (points.length === 0) return null;

  const { locale, t } = await getI18n();

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
    <section className="mt-6">
      <h2 className="text-sm font-medium text-zinc-500">{title}</h2>
      <div className="mt-2 rounded-xl border border-zinc-200 bg-white p-3">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full"
          role="img"
          aria-label={t("progress.chart.ariaLabel", { title, unit })}
        >
          <polyline points={polyline} fill="none" stroke="#18181b" strokeWidth={2} />
          {coords.map((c, i) => (
            <circle key={i} cx={c.x} cy={c.y} r={3} fill="#18181b" />
          ))}
          <text x={pad} y={14} fontSize={10} fill="#a1a1aa">
            {t("common.quantity", {
              value: formatValue ? formatValue(max) : formatNumber(locale, max),
              unit,
            })}
          </text>
          <text x={pad} y={height - 6} fontSize={10} fill="#a1a1aa">
            {t("common.quantity", {
              value: formatValue ? formatValue(min) : formatNumber(locale, min),
              unit,
            })}
          </text>
        </svg>
        <div className="flex justify-between text-[10px] text-zinc-400">
          <span>{points[0].label}</span>
          <span>{points[points.length - 1].label}</span>
        </div>
      </div>
    </section>
  );
}
