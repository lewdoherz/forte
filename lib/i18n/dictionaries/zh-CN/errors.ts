import type { Messages } from "../../index";

/**
 * Messages for the "errors" area: the route error boundary, both not-found
 * screens and the root fatal-error page. Mirrors `en/errors.ts` key for key —
 * the root boundary reads both files directly, because it renders outside the
 * root layout and so has no locale.
 *
 * `satisfies Partial<Messages>` rather than `: Messages`: this file holds one
 * area of the whole dictionary, so a misspelled key is still rejected here,
 * while completeness across every area is enforced by `zh-CN/index.ts`.
 *
 * Flat, dotted keys. A key whose text differs by count is written as
 * "singular|plural" and rendered with `t(key, { count })`, which selects
 * the form with Intl.PluralRules for the active locale.
 */
export const errors = {
  "errors.app.title": "页面加载失败",
  "errors.app.body": "加载此页面时出现问题。已保存的训练记录和训练计划不受影响。",

  "errors.notFound.title": "未找到",
  "errors.app.notFound.body": "该训练记录、训练计划或动作不存在，或属于其他账户。",
  "errors.root.notFound.body": "该页面不存在，或你的账户无权访问。",
  "errors.notFound.back": "返回首页",

  "errors.global.title": "出现问题",
  "errors.global.body": "forte 遇到意外错误，无法完成加载。通常重试即可恢复。",
  "errors.global.retry": "重试",

  /* Label and hint stay separate so the monospaced reference can sit between
     them; the leading punctuation differs from English. */
  "errors.reference.label": "编号",
  "errors.reference.hint": " —— 反馈问题时请提供此编号。",
} as const satisfies Partial<Messages>;
