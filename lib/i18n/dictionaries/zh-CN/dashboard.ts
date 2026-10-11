import type { Messages } from "../../index";

/**
 * Messages for the "dashboard" area: the home page's greeting, next-session
 * hero, seven-day activity strip, weekly totals, quick start, recent history
 * and recent PRs.
 *
 * Flat, dotted keys. A key whose text differs by count is written as
 * "singular|plural" and rendered with `t(key, { count })`, which selects
 * the form with Intl.PluralRules for the active locale; Chinese has no plural
 * marking, so both forms carry the same text.
 *
 * `satisfies Partial<Messages>` rather than the full `Messages`: this object
 * holds one area's keys, and completeness across areas is checked where they
 * are merged, by `zhCN: Messages` in `./index`.
 */
export const dashboard = {
  /* The page header and its greeting. */
  "dashboard.title": "概览",
  "dashboard.greeting.named": "你好，{name}。你的下一次训练从这里开始。",
  "dashboard.greeting.guest": "欢迎使用 forte。你的下一次训练从这里开始。",
  "dashboard.viewProgress": "查看进度",

  /* The next-session hero. */
  "dashboard.hero.eyebrowActive": "训练进行中",
  "dashboard.hero.eyebrowIdle": "为下一次训练留出时间",
  "dashboard.hero.titleIdle": "随时可以开始。",
  "dashboard.hero.bodyActive": "从中断的地方继续，训练已经准备好。",
  "dashboard.hero.bodyIdle": "直接开始一次空训练，或在下方选择训练计划，带上预设动作。",
  "dashboard.hero.started": "开始于 {date}",
  "dashboard.hero.resume": "继续训练",
  "dashboard.hero.startEmpty": "开始空训练",
  "dashboard.hero.chooseRoutine": "选择训练计划",

  /* The seven-day strip and the week's totals. */
  "dashboard.activity.title": "最近 7 天",
  "dashboard.activity.listLabel": "按天统计的已完成训练",
  /* 日期格的无障碍名称：星期、日期，然后是次数。{today} 是本地化的“,今天”，
     其余各天为空字符串。 */
  "dashboard.activity.dayLabel":
    "{weekday}，{date}{today}：已完成 {count} 次训练|{weekday}，{date}{today}：已完成 {count} 次训练",
  "dashboard.activity.todaySuffix": "，今天",
  "dashboard.activity.footnote": "已完成的训练 · {timeZone}",
  "dashboard.metric.workouts": "训练次数",
  "dashboard.metric.sets": "完成组数",
  "dashboard.metric.volume": "总容量",
  "dashboard.metric.records": "纪录",
  "dashboard.moreActive.label": "其他进行中的训练",

  /* Quick start: the routines offered as one-tap starts. */
  "dashboard.quickStart.title": "快速开始",
  "dashboard.quickStart.subtitle": "你的训练计划，随时可以开练。",
  "dashboard.quickStart.allRoutines": "全部训练计划",
  "dashboard.quickStart.routineHint": "为这个训练计划添加动作，或直接开始，边练边加。",
  "dashboard.quickStart.start": "开始计划",
  "dashboard.quickStart.startLabel": "开始 {title}",
  "dashboard.quickStart.emptyTitle": "制定适合自己的训练计划",
  "dashboard.quickStart.emptyBody": "先把动作选好，下次训练就能按计划直接开始。",
  "dashboard.quickStart.emptyCta": "创建第一个训练计划",

  /* Recent history. */
  "dashboard.recent.title": "最近训练",
  "dashboard.recent.all": "全部训练记录",
  "dashboard.recent.emptyTitle": "训练历史从这里开始",
  "dashboard.recent.emptyBody":
    "完成一次训练后，这里会显示动作、已完成组数和总结。进行中的训练会固定在概览页顶部。",
  "dashboard.recent.emptyCta": "为第一次训练挑选动作",

  /* Recent PRs. 类别名称来自共享的纪录词表。 */
  "dashboard.records.title": "最近个人纪录",
  "dashboard.records.subtitle": "来自最近的训练",
  "dashboard.records.unknownExercise": "动作",
  "dashboard.records.viewWorkout": "查看训练",
  "dashboard.records.viewWorkoutLabel": "查看 {title} 的训练：{category}",
  "dashboard.records.emptyTitle": "值得记录的进步",
  "dashboard.records.emptyBody":
    "当一次已完成的训练超过同一动作以往的成绩时，就会产生新的个人纪录。首次成绩只作为基准，不算纪录。",
  "dashboard.records.emptyCta": "查看动作数据统计",

  /* The shortcut list at the foot of the page. */
  "dashboard.tools.title": "让下次训练更省心",
  "dashboard.tools.createRoutine.title": "新建训练计划",
  "dashboard.tools.createRoutine.body": "为下次训练规划好动作与组数。",
  "dashboard.tools.browseExercises.title": "浏览动作",
  "dashboard.tools.browseExercises.body": "查找动作，查看标准做法。",
} as const satisfies Partial<Messages>;
