import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { env } from "@/lib/env";

/**
 * Outbound email transport.
 *
 * Production posts to Resend over `fetch`, so no SDK dependency has to be kept
 * current. Development writes each message to `.mail/` at the repo root instead:
 * the bodies carry sign-in and password-reset links, so capturing them locally is
 * how those flows are actually exercised without a provider account. `.mail/` is
 * gitignored.
 */
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** Directory holding the development transport's messages, relative to the repo root. */
const MAIL_DIR = ".mail";

/**
 * Truncation limit for a provider error body. Enough to identify the problem
 * (Resend echoes the offending field), short enough not to dump a page into a
 * log line.
 */
const MAX_ERROR_BODY = 500;

export async function sendEmail(message: EmailMessage): Promise<void> {
  const apiKey = env.EMAIL_API_KEY;
  if (apiKey === undefined) {
    await deliverToMailDir(message);
    return;
  }

  const from = env.EMAIL_FROM;
  if (from === undefined) {
    throw new Error(
      "EMAIL_API_KEY is set but EMAIL_FROM is missing. Set EMAIL_FROM to the " +
        "verified sender address so sends do not fail at the provider.",
    );
  }

  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      html: message.html,
    }),
  });

  if (!response.ok) {
    // Loud on purpose: a dropped verification or reset email locks the user out
    // while the request still looks successful, so the provider's reason has to
    // reach the logs.
    const detail = (await response.text()).slice(0, MAX_ERROR_BODY);
    throw new Error(`Resend rejected the email (HTTP ${response.status}): ${detail}`);
  }
}

/**
 * Development sink: one openable HTML file per message. The timestamp prefix
 * sorts messages chronologically and the recipient keeps them identifiable when
 * several are on disk, which matters because a reset link is only valid for the
 * request that produced it.
 */
async function deliverToMailDir(message: EmailMessage): Promise<void> {
  const dir = join(process.cwd(), MAIL_DIR);
  await mkdir(dir, { recursive: true });

  // Colons and dots are illegal or awkward in Windows filenames, so the ISO
  // timestamp is flattened. Every field is fixed width, so the names still sort
  // chronologically as plain strings.
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const recipient = message.to.replace(/[^a-zA-Z0-9.@_-]/g, "-");
  const file = join(dir, `${stamp}-${recipient}.html`);

  await writeFile(file, message.html, "utf8");
  console.log(`[email] to ${message.to}: ${message.subject} -> ${file}`);
}
