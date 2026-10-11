import type { Messages } from "../../index";

/**
 * Messages for the "email" area.
 *
 * Flat, dotted keys. A key whose text differs by count is written as
 * "singular|plural" and rendered with `t(key, { count })`, which selects
 * the form with Intl.PluralRules for the active locale.
 *
 * The mail dictionary uses no plurals: every message addresses one recipient.
 * Keys mirror `en/email.ts` exactly — the two lead-line variants exist there
 * because English closes the sentence with a period and the plain-text body
 * with a colon, which Chinese writes as separate full-width marks.
 */
export const email = {
  /* The greeting closes with a full-width colon, as Chinese mail does. */
  "email.greeting": "你好，",
  "email.greetingWithName": "你好，{name}：",

  "email.verification.subject": "验证你的 forte 邮箱",
  "email.verification.heading": "验证邮箱",
  "email.verification.intro": "确认此邮箱地址，即可完成 forte 账户的设置。",
  "email.verification.textIntro": "确认此邮箱地址，即可完成 forte 账户的设置：",
  "email.verification.action": "验证邮箱",
  "email.verification.note": "链接会过期，但验证是可选的，不验证也能正常使用账户。",

  "email.reset.subject": "重置 forte 密码",
  "email.reset.heading": "重置密码",
  "email.reset.intro": "有人请求重置你的 forte 账户密码。请点击下方按钮设置新密码。",
  "email.reset.textIntro": "有人请求重置你的 forte 账户密码。请在此设置新密码：",
  "email.reset.action": "重置密码",
  "email.reset.note": "如果并非你本人操作，请忽略此邮件，密码将保持不变。",

  "email.copyFallback": "如果按钮无法使用，请将以下链接复制到浏览器中打开：",
  "email.footer": "forte —— 训练记录",
} as const satisfies Partial<Messages>;
