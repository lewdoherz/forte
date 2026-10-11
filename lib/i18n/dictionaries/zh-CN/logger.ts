import type { Messages } from "../../index";

/**
 * Messages for the "logger" area.
 *
 * Flat, dotted keys. A key whose text differs by count is written as
 * "singular|plural" and rendered with `t(key, { count })`, which selects
 * the form with Intl.PluralRules for the active locale.
 */
export const logger = {
  /* 顶部栏：返回、实时指标和结束操作。 */
  "logger.nav.back": "返回{label}",
  "logger.metric.duration": "时长",
  "logger.metric.volume": "容量",
  "logger.metric.sets": "组数",
  "logger.summary.completed": "已完成 · {duration}",
  "logger.finish.action": "结束",
  "logger.finish.finishing": "结束中…",

  /* 指标下方的同步状态行。显示哪一种状态由存储区的待同步标记决定。 */
  "logger.sync.saved": "所有改动已保存",
  "logger.sync.pending": "有改动未同步 · 保存在本设备",
  "logger.sync.offline": "离线 · 改动保存在本设备",

  /* 动作列表上方的失败提示。`{message}` 是服务器给出的原因，因此文案拆成前缀与后缀。 */
  "logger.sync.unreachable": "无法连接服务器。改动已保存在本设备上。",
  "logger.sync.keptSuffix": "{message} 改动已保存在本设备上。",
  "logger.sync.permanentSuffix": "{message} 改动已保存在本设备上，但不会重试同步。",
  "logger.sync.storageUnavailable": "离线存储不可用。本页面的改动在重新加载后可能丢失。",

  /* 组类型名称，显示在每一组上。 */
  "logger.setType.warmup": "热身组",
  "logger.setType.normal": "常规组",
  "logger.setType.failure": "力竭组",
  "logger.setType.dropset": "递减组",

  /* 组控件与标签。 */
  "logger.set.previous": "上次",
  "logger.set.add": "添加一组",
  "logger.set.undoLabel": "撤销该组完成状态",
  "logger.set.removeLabel": "移除该组",

  /* 动作卡片、选择器及空状态。 */
  "logger.exercise.add": "添加动作",
  "logger.exercise.removeLabel": "移除 {title}",
  "logger.exercise.rest": "休息 {duration}",
  "logger.exercise.removeTitle": "移除动作",
  "logger.exercise.removeConfirm": "移除 {title}？{tail}",
  "logger.exercise.removeSets": "该动作的 {count} 组也会一并移除。|该动作的 {count} 组也会一并移除。",
  "logger.exercise.emptyActive": "还没有动作。添加一个动作即可开始记录组。",
  "logger.exercise.emptyCompleted": "本次训练没有进行任何动作。",

  "logger.superset.title": "超级组",
  "logger.superset.hint": "交替完成这些动作，然后休息",

  /* 结束确认。第一句与总组数一致，第二句与未完成组数一致，因此拆成两个键。 */
  "logger.finish.title": "结束训练",
  "logger.finish.keep": "继续记录",
  "logger.finish.openSets": "{count} 组中有 {incomplete} 组未完成。{tail}|{count} 组中有 {incomplete} 组未完成。{tail}",
  "logger.finish.openTail":
    "未完成的组会按原样保存，不会自动标记为已完成。|未完成的组会按原样保存，不会自动标记为已完成。",

  /* 放弃确认。 */
  "logger.discard.action": "放弃",
  "logger.discard.title": "放弃本次训练",
  "logger.discard.confirming": "放弃中…",
  "logger.discard.body": "本次训练将被删除，不会保存为已完成的训练。此操作无法撤销。",
} as const satisfies Partial<Messages>;
