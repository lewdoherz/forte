import type { Messages } from "../../index";

/**
 * Messages for the "logger" area.
 *
 * Flat, dotted keys. A key whose text differs by count is written as
 * "singular|plural" and rendered with `t(key, { count })`, which selects
 * the form with Intl.PluralRules for the active locale.
 */
export const logger = {
  "logger.session": "训练",
  "logger.minimize": "最小化本次训练",
  "logger.exercise.notes": "动作备注",
  "logger.exercise.emptyTitle": "开始你的训练",
  "logger.rest.setting": "休息 · {value}",
  "logger.rest.off": "关闭",
  "logger.rest.defaults": "休息设置",
  "logger.rest.deviceDefault": "本设备上的默认休息时长",
  "logger.rest.override": "此动作每组结束后的休息",
  "logger.rest.duration": "休息时长",
  "logger.rest.inherit": "使用默认值（{value}）",
  "logger.rest.scope": "默认值按账户保存在本设备上。动作的休息设置随本次训练保存，不会修改原训练计划。",
  "logger.finish.review": "检查本次训练",
  "logger.finish.save": "保存训练",
  "logger.finish.unchecked": "{count} 组未勾选的组仍为未完成状态，不计入历史记录、训练量或个人纪录。|{count} 组未勾选的组仍为未完成状态，不计入历史记录、训练量或个人纪录。",
  "logger.finish.pending": "已结束的草稿保存在本设备上。请重试保存，以确认训练已同步到历史记录；系统不会替你勾选任何组。",
  /* 顶部栏：返回、实时指标和结束操作。 */
  "logger.nav.back": "返回{label}",
  "logger.metric.duration": "时长",
  "logger.metric.volume": "容量",
  "logger.metric.sets": "组数",
  "logger.summary.completed": "已完成 · {duration}",
  "logger.finish.action": "结束",
  "logger.finish.finishing": "结束中…",

  /* 指标下方的同步状态行。显示哪一种状态由存储区的待同步标记决定。 */
  "logger.sync.saved": "已同步 · 所有改动已保存",
  "logger.sync.pending": "已保存在本设备 · 同步中…",
  "logger.sync.offline": "已保存在本设备 · 离线",
  "logger.sync.authRequired": "已保存在本设备 · 登录后同步",

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
