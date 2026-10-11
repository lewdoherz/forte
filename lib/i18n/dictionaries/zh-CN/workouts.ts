import type { Messages } from "../../index";

/**
 * Messages for the "workouts" area.
 *
 * Flat, dotted keys. A key whose text differs by count is written as
 * "singular|plural" and rendered with `t(key, { count })`, which selects
 * the form with Intl.PluralRules for the active locale; Chinese has no plural
 * marking, so both forms carry the same text.
 *
 * `satisfies Partial<Messages>` rejects a misspelled key here while the record
 * stays partial: completeness across areas is enforced by `zh-CN/index.ts`.
 */
export const workouts = {
  /* The history list, its filter and its cursors. */
  "workouts.startEmpty": "开始空白训练",
  "workouts.list.active": "进行中",
  "workouts.list.history": "历史",
  "workouts.list.filterLabel": "按动作筛选",
  "workouts.list.allExercises": "全部动作",
  "workouts.list.emptyForExercise": "没有包含「{title}」的训练。",
  "workouts.list.emptyCompleted": "还没有已完成的训练。",
  /* 空态由链接两侧的两段文字拼成，标点由各语言自己决定。 */
  "workouts.list.emptyLead": "还没有训练，",
  "workouts.list.emptyLink": "从训练计划开始",
  "workouts.list.emptyTail": "。",
  "workouts.history.loadError": "无法加载更早的训练。",
  "workouts.history.loadOlder": "加载更早的训练",
  "workouts.history.end": "已显示全部训练。",

  /* The history card. */
  "workouts.card.inProgress": "进行中",
  "workouts.card.seeMore": "还有 {count} 个动作|还有 {count} 个动作",

  /* Metric labels, shared by the card and the completed workout header. */
  "workouts.metric.duration": "时长",
  "workouts.metric.volume": "容量",
  "workouts.metric.records": "纪录",

  /* The completed workout. */
  "workouts.detail.back": "返回训练记录",
  "workouts.detail.noSets": "这次训练没有完成任何组。",
  "workouts.detail.summaryTitle": "训练小结",
  "workouts.setType.warmup": "热身组",
  "workouts.setType.normal": "正式组",
  "workouts.setType.failure": "力竭组",
  "workouts.setType.dropset": "递减组",

  /* The muscle distribution of a completed workout. */
  "workouts.summary.muscleDistribution": "肌群分布",
  "workouts.summary.noSets": "没有正式组，无法显示肌群分布。",

  /* The per-set entry form. */
  "workouts.setForm.repsLabel": "次数",
  "workouts.setForm.weightLabel": "重量（公斤）",
  "workouts.setForm.rpeLabel": "自觉用力程度",
  "workouts.setForm.rpePlaceholder": "RPE",
  "workouts.setForm.errorReps": "次数必须是不小于 0 的整数。",
  "workouts.setForm.errorRpe": "RPE 必须在 1 到 10 之间。",
  "workouts.setForm.errorWeight": "重量必须是非负数。",

  /* The rest countdown. `{time}` is a stopwatch reading. */
  "workouts.rest.rest": "休息 {time}",
  "workouts.rest.skip": "跳过",
  "workouts.rest.skipLabel": "跳过休息",

  /* Server-action failures the reader sees. */
  "workouts.error.notAuthorized": "你没有执行此操作的权限。",
  "workouts.error.finished": "该训练已结束。",
  "workouts.error.invalidEndedAt": "结束时间不在训练时间范围内。",
  "workouts.error.notFound": "找不到该训练。",
  "workouts.error.discardFailed": "无法丢弃该训练。",
  "workouts.error.syncFailed": "无法同步该训练。",
  "workouts.error.invalidState": "训练数据无效。",

  "workouts.validation.weightInvalid": "重量必须为非负数",
  "workouts.validation.rpeInvalid": "RPE 必须在 1 到 10 之间",
  "workouts.validation.duplicateExerciseId": "动作 id 重复",
  "workouts.validation.exercisePositionTaken": "两个动作的位置相同",
  "workouts.validation.duplicateSetId": "组 id 重复",
  "workouts.validation.setPositionTaken": "两组的组内位置相同",
} as const satisfies Partial<Messages>;
