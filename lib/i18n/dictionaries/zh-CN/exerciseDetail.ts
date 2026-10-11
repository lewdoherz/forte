import type { Messages } from "../../index";

/**
 * Messages for the "exerciseDetail" area: the exercise page and its tabs.
 * Mirrors `en/exerciseDetail.ts` key for key.
 */
export const exerciseDetail = {
  /* Header: identity and catalog metadata, on every tab. */
  "exerciseDetail.badge.custom": "自定义动作",
  "exerciseDetail.badge.library": "内置动作",
  "exerciseDetail.field.primaryMuscle": "主要肌群",
  "exerciseDetail.field.secondaryMuscles": "次要肌群",
  "exerciseDetail.field.equipment": "器械",
  "exerciseDetail.field.type": "类型",

  /* The tab shell. */
  "exerciseDetail.tabs.label": "动作页分区",
  "exerciseDetail.tabs.howTo": "动作要领",
  "exerciseDetail.tabs.statistics": "统计",
  "exerciseDetail.tabs.history": "历史",

  /* The How To panel. The exercise's title is data, so it is a placeholder. */
  "exerciseDetail.howTo.empty": "暂无 {exercise} 的动作要领",
  "exerciseDetail.howTo.emptyBody": "该动作暂无演示视频或文字步骤。",
  "exerciseDetail.howTo.noWritten": "暂无 {exercise} 的文字步骤。",

  /* The Statistics panel: empty states, summary tiles and the records list. */
  "exerciseDetail.stats.empty": "暂无训练记录。完成包含 {exercise} 的训练后，这里会显示统计数据。",
  "exerciseDetail.stats.emptyRange": "在{range}内没有 {exercise} 的已完成组。",
  "exerciseDetail.stats.summary.volume": "总容量",
  "exerciseDetail.stats.summary.reps": "总次数",
  "exerciseDetail.stats.summary.sessions": "训练次数",
  "exerciseDetail.stats.summary.sets": "已完成组数",
  "exerciseDetail.stats.e1rmNote": "按 Epley 公式估算，仅取 12 次及以内的组；单次即为其重量",
  "exerciseDetail.stats.recordsHeading": "个人纪录",
  "exerciseDetail.stats.recordsAllTime": "全部时间",

  /* Chart titles, one per progression metric. */
  "exerciseDetail.chart.e1rm": "每次训练的最佳 e1RM",
  "exerciseDetail.chart.reps": "每次训练的最佳次数",
  "exerciseDetail.chart.addedWeight": "每次训练的最佳额外重量",
  "exerciseDetail.chart.assistance": "每次训练的最小辅助重量",
  "exerciseDetail.chart.fastest": "每次训练的最快用时",
  "exerciseDetail.chart.duration": "每次训练的时长",
  "exerciseDetail.chart.longestHold": "每次训练的最长保持时间",
  "exerciseDetail.chart.weight": "每次训练的最佳重量",
  "exerciseDetail.chart.pace": "每次训练的最佳配速",
  "exerciseDetail.chart.floorsPerMinute": "每次训练的每分钟层数",
  "exerciseDetail.chart.stepsPerMinute": "每次训练的每分钟步数",

  /* Units the shared vocabulary has no key for. */
  "exerciseDetail.unit.metersPerSecond": "米/秒",
  "exerciseDetail.unit.perMinute": "/分钟",
  "exerciseDetail.unit.floorsPerMinute": "层/分钟",
  "exerciseDetail.unit.stepsPerMinute": "步/分钟",

  /* The History panel: the session list and its row labels. */
  "exerciseDetail.history.empty": "暂无包含 {exercise} 的训练。",
  "exerciseDetail.history.limit": "仅显示最近 {count} 次训练。",
  "exerciseDetail.history.pr": "PR",
  "exerciseDetail.setType.warmup": "热身",
  "exerciseDetail.setType.normal": "正常",
  "exerciseDetail.setType.failure": "力竭",
  "exerciseDetail.setType.dropset": "递减组",
} as const satisfies Partial<Messages>;
