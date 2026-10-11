import type { Messages } from "../../index";

/**
 * Messages for the "metrics" area: shared presentation vocabulary.
 */
export const metrics = {
  /* 动作类型，在动作选择器与动作页上显示。 */
  "metrics.exerciseType.weight_reps": "重量 × 次数",
  "metrics.exerciseType.bodyweight_reps": "自重 × 次数",
  "metrics.exerciseType.bodyweight_weighted": "负重自重",
  "metrics.exerciseType.bodyweight_assisted": "辅助自重",
  "metrics.exerciseType.reps_only": "次数",
  "metrics.exerciseType.duration": "时长",
  "metrics.exerciseType.weight_duration": "重量 × 时长",
  "metrics.exerciseType.distance_duration": "距离 × 时长",
  "metrics.exerciseType.short_distance_weight": "短距离 × 重量",
  "metrics.exerciseType.floors_duration": "层数 × 时长",
  "metrics.exerciseType.steps_duration": "步数 × 时长",

  /* 时间范围，Statistics 标签页与进度选择器共用。 */
  "metrics.range.all": "全部时间",
  "metrics.range.30d": "最近 30 天",
  "metrics.range.90d": "最近 90 天",
  "metrics.range.1y": "最近一年",

  /* 每组可记录的字段，每个字段一个名词。 */
  "metrics.field.weight": "重量",
  "metrics.field.reps": "次数",
  "metrics.field.duration": "时长",
  "metrics.field.distance": "距离",
  "metrics.field.rpe": "RPE",
  "metrics.field.floors": "层数",
  "metrics.field.steps": "步数",

  /* 中文没有单复数，两处填相同文本；PluralRules 只会选中最后一个形式。 */
  "metrics.plural.floors": "{count} 层|{count} 层",
  "metrics.plural.steps": "{count} 步|{count} 步",

  /* 附加在组数据之后的一项推算读数。 */
  "metrics.rpe": "RPE {value}",
} as const satisfies Partial<Messages>;
