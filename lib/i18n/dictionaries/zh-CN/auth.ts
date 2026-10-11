import type { Messages } from "../../index";

/**
 * Messages for the "auth" area.
 *
 * Flat, dotted keys. A key whose text differs by count is written as
 * "singular|plural" and rendered with `t(key, { count })`, which selects
 * the form with Intl.PluralRules for the active locale.
 */
export const auth = {
  "auth.field.email": "邮箱",
  "auth.field.password": "密码",
  "auth.field.newPassword": "新密码",
  "auth.field.confirmPassword": "确认密码",

  "auth.password.rule": "至少 8 个字符。",

  "auth.error.emailRequired": "请输入邮箱。",
  "auth.error.invalidCredentials": "邮箱或密码错误。",
  "auth.error.invalidEmail": "请输入有效的邮箱地址。",
  "auth.error.emailNotVerified": "该邮箱地址尚未验证。",
  "auth.error.userExists": "该邮箱已注册账户。",
  "auth.error.passwordTooShort": "密码至少需要 8 个字符。",
  "auth.error.passwordMismatch": "两次输入的密码不一致。",
  "auth.error.invalidToken": "该链接无效。",
  "auth.error.tokenExpired": "该链接已过期。",
  "auth.error.signUpFailed": "无法创建账户。",
  "auth.error.resetLinkFailed": "无法发送重置链接，请重试。",
  "auth.error.resetFailed": "无法重置密码，请重新获取链接。",
  "auth.error.offlinePreparationFailed": "无法安全地准备离线训练数据，请重试。",
  "auth.error.offlineAfterSignUp": "账户已创建，但无法准备离线训练数据，请重新登录。",
  "auth.error.offlineClearFailed": "无法清除离线训练数据，已停止退出登录。",

  "auth.signIn.missingFields": "请输入邮箱和密码。",
  "auth.signIn.submitting": "登录中…",
  "auth.signIn.noAccount": "还没有账户？",

  "auth.signUp.title": "创建账户",
  "auth.signUp.submitting": "正在创建账户…",
  "auth.signUp.haveAccount": "已有账户？",

  "auth.forgotPassword.title": "重置密码",
  "auth.forgotPassword.submit": "发送重置链接",
  "auth.forgotPassword.sending": "发送中…",
  "auth.forgotPassword.sent": "如果该邮箱对应的账户存在，重置链接正在发送中。",
  "auth.forgotPassword.remembered": "想起来了？",

  "auth.resetPassword.title": "设置新密码",
  "auth.resetPassword.submit": "修改密码",
  "auth.resetPassword.doneTitle": "密码已修改",
  "auth.resetPassword.doneText": "你的密码已修改完成。",
  "auth.resetPassword.invalidTitle": "重置链接无效",
  "auth.resetPassword.invalidText": "该重置链接缺失或已过期。",
  "auth.resetPassword.requestNew": "重新获取链接",

  "auth.verifyEmail.failedTitle": "验证失败",
  "auth.verifyEmail.failedText": "无法验证你的邮箱地址，链接可能已过期或已被使用。",
  "auth.verifyEmail.resend": "重新发送验证邮件",
  "auth.verifyEmail.verifiedTitle": "邮箱已验证",
  "auth.verifyEmail.verifiedText": "你的邮箱地址验证完成。",
} as const satisfies Partial<Messages>;
