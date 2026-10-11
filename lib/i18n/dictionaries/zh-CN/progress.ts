import type { Messages } from "../../index";

/**
 * Messages for the "progress" area: the exercise picker that routes to the
 * canonical Statistics view. Mirrors `en/progress.ts` key for key.
 *
 * Flat, dotted keys. A key whose text differs by count is written as
 * "singular|plural" and rendered with `t(key, { count })`.
 *
 * 时间范围标签与 Statistics 标签页共用，放在 `lib/progress.ts` 的 `rangeLabel` 里。
 */
export const progress = {
  "progress.intro": "选择一个动作即可查看它的统计数据、进展和个人记录。结果来自已完成训练中的已完成组。",
  "progress.picker.exercise": "动作",
  "progress.picker.placeholder": "选择动作…",
  "progress.picker.range": "时间范围",
  "progress.empty": "暂无可选动作。",
  "progress.footnote": "动作统计使用与动作类型对应的指标，因此跑步、静力支撑与负重动作不会用同一套通用汇总进行比较。",

  /* 图表无障碍名称，括号按中文全角书写。 */
  "progress.chart.ariaLabel": "{title}（{unit}）",
} as const satisfies Partial<Messages>;
