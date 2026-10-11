import type { Messages } from "../../index";

/**
 * Messages for the "account" area.
 *
 * Flat, dotted keys. A key whose text differs by count is written as
 * "singular|plural" and rendered with `t(key, { count })`, which selects
 * the form with Intl.PluralRules for the active locale.
 *
 * The typed deletion token stays the literal "DELETE" in every language: it is
 * the value the action compares against, not copy.
 */
export const account = {
  "account.subtitle": "显示名称会出现在应用各处；时区决定日期与进度的划分方式。",

  "account.form.email": "邮箱",
  "account.form.displayName": "显示名称",
  "account.form.timeZone": "时区",
  "account.form.timeZonePlaceholder": "America/Chicago",
  "account.form.timeZoneHelp": "IANA 时区名称（例如 America/Chicago），用于划分日期与进度。",

  "account.email.title": "邮箱",
  "account.email.verifiedBadge": "已验证。",
  "account.email.verifiedBody": "{email} 已确认。",
  "account.email.notVerifiedBadge": "未验证。",
  "account.email.notVerifiedBody":
    "{email} 尚未确认。即使未确认，账户也能正常使用，不会受到任何限制；但确认邮箱可以证明我们能联系到你。注册时输错的邮箱，密码重置邮件将永远无法送达。",
  "account.email.resend": "重新发送验证邮件",

  "account.sessions.title": "已登录的设备",
  "account.sessions.description": "当前可以访问你账户的设备。退出某一设备后立即生效。",
  "account.sessions.unknownDevice": "未知设备",
  "account.sessions.unknownAddress": "未知地址",
  "account.sessions.thisDevice": "本设备",
  "account.sessions.meta": "{address} · 登录于 {started} · 有效期至 {expires}",
  "account.sessions.signOutOthers": "退出其他所有设备",

  "account.data.title": "你的数据",
  "account.data.description":
    "将这里记录的全部内容导出为 JSON 文件，包括训练计划、训练、组数以及自定义动作。",
  "account.data.download": "下载你的数据",

  "account.danger.title": "删除账户",
  "account.danger.description":
    "删除账户及其中的全部内容，包括训练计划、训练和历史记录。此操作无法撤销，如需保留数据请先下载。",
  "account.danger.confirmLabel": "输入 DELETE 以确认",
  "account.danger.confirmSubmit": "删除账户",
  "account.danger.offlineError": "无法清除离线训练数据，账户删除已中止。",

  "account.signOut.description": "结束此设备上的本次会话，并返回登录页。",

  "account.errors.invalidInput": "输入无效。",
  "account.errors.saveFailed": "无法保存设置。",
  "account.errors.confirmation": "请输入大写的 DELETE 以确认。",
  "account.errors.deleteFailed": "无法删除账户，请重试。",

  "account.validation.displayNameRequired": "请填写显示名称",
  "account.validation.displayNameTooLong": "显示名称过长",
  "account.validation.timeZoneRequired": "请填写时区",
  "account.validation.timeZoneInvalid": "请输入有效的 IANA 时区，例如 America/Chicago",
} as const satisfies Partial<Messages>;
