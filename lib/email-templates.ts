/**
 * Transactional email bodies for Better Auth's verification and password-reset
 * flows.
 *
 * Both variants are plain, self-contained documents. Every style is inline
 * because email clients strip `<style>` blocks, and nothing remote is loaded
 * because images are commonly blocked and would leave a broken layout. The
 * plain-text variant carries the same information and the same link, since some
 * clients only render text.
 */

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
 */
function greeting(name: string | null): string {
  return name === null || name.length === 0 ? "Hi," : `Hi ${name},`;
}

/** Shared shell: a centred card on a neutral background, all inline styles. */
function layout(heading: string, body: string[]): string {
  return [
    '<div style="margin:0;padding:24px;background:#f5f5f4;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1c1917;">',
    '  <div style="max-width:520px;margin:0 auto;padding:32px;background:#ffffff;border:1px solid #e7e5e4;border-radius:12px;">',
    `    <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:#1c1917;">${heading}</h1>`,
    ...body.map((line) => `    ${line}`),
    '    <p style="margin:24px 0 0;font-size:13px;color:#78716c;">forte — workout tracking</p>',
    "  </div>",
    "</div>",
  ].join("\n");
}

/** Call-to-action button plus a copyable fallback, both using the same link. */
function action(url: string, label: string): string[] {
  return [
    `<p style="margin:0 0 24px;"><a href="${url}" style="display:inline-block;padding:10px 20px;background:#1c1917;color:#ffffff;border-radius:8px;text-decoration:none;font-size:14px;">${label}</a></p>`,
    '<p style="margin:0 0 8px;font-size:13px;color:#57534e;">If the button does not work, copy this link into your browser:</p>',
    `<p style="margin:0 0 24px;font-size:13px;word-break:break-all;"><a href="${url}" style="color:#1c1917;">${url}</a></p>`,
  ];
}

export function verificationEmail({
  name,
  url,
}: {
  name: string | null;
  url: string;
}): { subject: string; text: string; html: string } {
  const safeName = name === null ? null : escapeHtml(name);
  const safeUrl = escapeHtml(url);

  return {
    subject: "Verify your forte email",
    text: `${greeting(name)}

Confirm this email address to finish setting up your forte account:

${url}

The link expires, but verifying is optional: your account works without it.

— forte`,
    html: layout("Verify your email", [
      `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;">${greeting(safeName)}</p>`,
      '<p style="margin:0 0 24px;font-size:15px;line-height:1.6;">Confirm this email address to finish setting up your forte account.</p>',
      ...action(safeUrl, "Verify email"),
      '<p style="margin:0;font-size:13px;line-height:1.6;color:#57534e;">The link expires, but verifying is optional: your account works without it.</p>',
    ]),
  };
}

export function passwordResetEmail({
  name,
  url,
}: {
  name: string | null;
  url: string;
}): { subject: string; text: string; html: string } {
  const safeName = name === null ? null : escapeHtml(name);
  const safeUrl = escapeHtml(url);

  return {
    subject: "Reset your forte password",
    text: `${greeting(name)}

Someone asked to reset the password for your forte account. Choose a new
password here:

${url}

If this was not you, ignore this email and your password will stay unchanged.

— forte`,
    html: layout("Reset your password", [
      `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;">${greeting(safeName)}</p>`,
      '<p style="margin:0 0 24px;font-size:15px;line-height:1.6;">Someone asked to reset the password for your forte account. Choose a new password with the button below.</p>',
      ...action(safeUrl, "Reset password"),
      '<p style="margin:0;font-size:13px;line-height:1.6;color:#57534e;">If this was not you, ignore this email and your password will stay unchanged.</p>',
    ]),
  };
}
