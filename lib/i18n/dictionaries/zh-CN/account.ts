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
  "account.form.noEmailProvided": "未提供邮箱",
  "account.providerFallbackName": "关联账户",
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
  "account.email.noContactBody":
    "你的登录方式未提供联系邮箱。身份标识地址不是联系邮箱，无法接收密码重置邮件。",

  "account.methods.title": "登录方式",
  "account.methods.description": "以下方式均可访问同一账户及其训练数据。",
  "account.methods.emailPassword": "邮箱和密码",
  "account.methods.otherProvider": "已关联的第三方登录方式",
  "account.methods.connected": "已关联",
  "account.methods.resetPassword": "通过邮箱重置密码",
  "account.methods.setPassword": "通过邮箱设置密码",
  "account.methods.passwordNeedsEmail": "找回或设置密码需要真实且已验证的联系邮箱，第三方身份标识地址不能用于找回密码。",
  "account.methods.linkDescription": "登录当前账户后，可关联其他提供商。你必须通过该提供商的身份验证，仅凭邮箱相同不会自动合并账户。",
  "account.methods.link": "关联 {provider}",
  "account.methods.linking": "正在打开 {provider}…",
  "account.methods.linkFailed": "关联已取消或未能完成，已有的登录方式未被移除，请重试。",
  "account.methods.nativeInstructions": "请在系统浏览器中打开账户，先登录同一个 Forte 账户，再关联提供商。应用登录状态不会共享给浏览器。完成后返回应用并刷新列表，或使用新关联的方式登录。",
  "account.methods.manageInBrowser": "在浏览器中管理登录方式",
  "account.methods.refresh": "刷新登录方式",
  "account.methods.addEmailDescription": "为当前账户添加联系邮箱，以便找回密码。只有确认新邮箱后，账户邮箱才会更改；已关联的登录方式会保留。",
  "account.methods.contactEmail": "联系邮箱",
  "account.methods.sendEmailVerification": "发送验证邮件",
  "account.methods.emailSending": "正在发送…",
  "account.methods.emailSent": "如果该邮箱可以使用，验证链接正在发送中。请确认新邮箱，然后刷新此页面，通过邮箱为同一个账户设置密码。",
  "account.methods.emailError": "无法发送验证请求，请重试。已有的登录方式未发生更改。",
  "account.methods.emailReauth": "需要重新验证登录状态。请先退出登录，再使用已有的登录方式重新登录，然后重试此请求。",
  "account.methods.refreshEmail": "验证邮箱后刷新",

  "account.sessions.title": "已登录的设备",
  "account.sessions.description": "当前可以访问你账户的设备。退出某一设备后立即生效。",
  "account.sessions.unknownDevice": "未知设备",
  "account.sessions.unknownAddress": "未知地址",
  "account.sessions.thisDevice": "本设备",
  "account.sessions.meta": "{address} · 登录于 {started} · 有效期至 {expires}",
  "account.sessions.signOutOthers": "退出其他所有设备",
  "account.sessions.freshRequired":
    "出于安全原因，请重新登录以查看或退出其他设备。本设备上的当前会话仍然有效。",
  "account.sessions.unavailable": "暂时无法加载完整设备列表，请在联网后重试。",
  "account.methods.unavailable": "暂时无法加载已关联的登录方式，请在联网后重试。",

  "account.preferences.title": "设备偏好设置",
  "account.preferences.description": "保存在本设备上，离线时也可用。",
  "account.appearance.title": "外观主题",
  "account.appearance.description": "选择 forte 在本设备上的显示外观。",
  "account.appearance.system": "跟随系统",
  "account.appearance.light": "浅色",
  "account.appearance.dark": "深色",

  "account.rest.title": "组间休息计时",
  "account.rest.description": "设置默认休息时长和结束提醒。保存在本设备上，离线时也可用。",
  "account.rest.defaultDuration": "默认休息时长",
  "account.rest.sound": "结束提示音",
  "account.rest.soundHint": "休息倒计时结束时播放提示音。",
  "account.rest.vibration": "结束震动",
  "account.rest.vibrationHint": "休息倒计时结束时触发震动（需设备支持）。",
  "account.rest.preview": "试听 / 测试提醒",
  "account.rest.previewed": "已触发提醒预览。",
  "account.rest.previewMuted": "请先开启提示音或震动后再预览。",

  "account.offline.banner": "当前处于离线状态。外观与组间休息偏好仍可正常使用；账户操作需要网络连接。",
  "account.offline.requiresConnection": "需要网络连接。",

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
