/**
 * Transactional email bodies for Better Auth's verification and password-reset
 * flows.
 *
 * Both variants are plain, self-contained documents. Every style is inline
 * because email clients strip `<style>` blocks, and nothing remote is loaded
 * because images are commonly blocked and would leave a broken layout. The
 * plain-text variant carries the same information and the same link, since some
 * clients only render text.
 *
 * The copy comes from the `email` dictionary in the recipient's own language.
 * Mail is built from a background task with no request scope, so no cookie can
 * supply that language: the locale is required and resolved by the send site
 * from the account row.
 */

import { createTranslator, getMessages, type Locale, type Translate } from "@/lib/i18n";

/** Escapes a value for HTML text and for a double-quoted attribute context. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Greets the recipient by display name when one is set. The app's display name
 * is nullable, so an absent name falls back to a neutral greeting rather than
 * interpolating "null" into the message.
 *
 * `name` is passed in ready for its target: the HTML body hands over an escaped
 * name, the plain-text body the raw one.
 */
function greeting(t: Translate, name: string | null): string {
  return name === null || name.length === 0
    ? t("email.greeting")
    : t("email.greetingWithName", { name });
}

/** Shared shell: a centred card on a neutral background, all inline styles. */
function layout(heading: string, body: string[], footer: string): string {
  return [
    '<div style="margin:0;padding:24px;background:#f5f5f4;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1c1917;">',
    '  <div style="max-width:520px;margin:0 auto;padding:32px;background:#ffffff;border:1px solid #e7e5e4;border-radius:12px;">',
    `    <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:#1c1917;">${heading}</h1>`,
    ...body.map((line) => `    ${line}`),
    `    <p style="margin:24px 0 0;font-size:13px;color:#78716c;">${footer}</p>`,
    "  </div>",
    "</div>",
  ].join("\n");
}

/** Call-to-action button plus a copyable fallback, both using the same link. */
function action(url: string, label: string, fallback: string): string[] {
  return [
    `<p style="margin:0 0 24px;"><a href="${url}" style="display:inline-block;padding:10px 20px;background:#1c1917;color:#ffffff;border-radius:8px;text-decoration:none;font-size:14px;">${label}</a></p>`,
    `<p style="margin:0 0 8px;font-size:13px;color:#57534e;">${fallback}</p>`,
    `<p style="margin:0 0 24px;font-size:13px;word-break:break-all;"><a href="${url}" style="color:#1c1917;">${url}</a></p>`,
  ];
}

export function verificationEmail({
  name,
  url,
  locale,
}: {
  name: string | null;
  url: string;
  locale: Locale;
}): { subject: string; text: string; html: string } {
  const t = createTranslator(locale, getMessages(locale));
  const safeName = name === null ? null : escapeHtml(name);
  const safeUrl = escapeHtml(url);

  return {
    subject: t("email.verification.subject"),
    text: `${greeting(t, name)}

${t("email.verification.textIntro")}

${url}

${t("email.verification.note")}

— forte`,
    html: layout(
      t("email.verification.heading"),
      [
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;">${greeting(t, safeName)}</p>`,
        `<p style="margin:0 0 24px;font-size:15px;line-height:1.6;">${t("email.verification.intro")}</p>`,
        ...action(safeUrl, t("email.verification.action"), t("email.copyFallback")),
        `<p style="margin:0;font-size:13px;line-height:1.6;color:#57534e;">${t("email.verification.note")}</p>`,
      ],
      t("email.footer"),
    ),
  };
}

export function passwordResetEmail({
  name,
  url,
  locale,
}: {
  name: string | null;
  url: string;
  locale: Locale;
}): { subject: string; text: string; html: string } {
  const t = createTranslator(locale, getMessages(locale));
  const safeName = name === null ? null : escapeHtml(name);
  const safeUrl = escapeHtml(url);

  return {
    subject: t("email.reset.subject"),
    text: `${greeting(t, name)}

${t("email.reset.textIntro")}

${url}

${t("email.reset.note")}

— forte`,
    html: layout(
      t("email.reset.heading"),
      [
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;">${greeting(t, safeName)}</p>`,
        `<p style="margin:0 0 24px;font-size:15px;line-height:1.6;">${t("email.reset.intro")}</p>`,
        ...action(safeUrl, t("email.reset.action"), t("email.copyFallback")),
        `<p style="margin:0;font-size:13px;line-height:1.6;color:#57534e;">${t("email.reset.note")}</p>`,
      ],
      t("email.footer"),
    ),
  };
}
