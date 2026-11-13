import { emailLinkHref, escapeHtml } from "@/lib/email/escape-html";

/**
 * The body of an email an admin writes to one customer by hand (Admin →
 * Customers → a customer → Send email). The admin types plain text: it is
 * escaped, a blank line starts a paragraph, a single line break stays a line
 * break, and a web address becomes a link. Nothing the admin types is read as
 * HTML.
 */

export const CUSTOMER_EMAIL_SUBJECT_MAX = 200;
export const CUSTOMER_EMAIL_MESSAGE_MAX = 10_000;

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/g;

/** One line of the admin's text, escaped, its web addresses made links. */
function linked(line: string): string {
  let html = "";
  let from = 0;
  for (const match of line.matchAll(URL_PATTERN)) {
    const at = match.index ?? 0;
    const href = emailLinkHref(match[0]);
    html += escapeHtml(line.slice(from, at));
    html += href ? `<a href="${href}" style="color:#2563eb">${escapeHtml(match[0])}</a>` : escapeHtml(match[0]);
    from = at + match[0].length;
  }
  return html + escapeHtml(line.slice(from));
}

/** The message as HTML paragraphs, safe to put in an email. */
export function messageHtml(message: string): string {
  return message
    .replace(/\r\n?/g, "\n")
    .trim()
    .split(/\n\s*\n/)
    .map((paragraph) =>
      paragraph
        .split("\n")
        .map((line) => linked(line.trimEnd()))
        .join("<br>"),
    )
    .filter((paragraph) => paragraph.length > 0)
    .map((paragraph) => `<p style="margin:0 0 14px;line-height:1.6">${paragraph}</p>`)
    .join("\n");
}

/** The whole email: the message, then the store's name. */
export function customerEmailHtml({ message, storeName }: { message: string; storeName: string }): string {
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#222;font-size:15px">
      ${messageHtml(message)}
      <p style="color:#666;font-size:13px;margin-top:24px">${escapeHtml(storeName)}</p>
    </div>`;
}

/** The plain-text part: the message as typed, then the store's name. */
export function customerEmailText({ message, storeName }: { message: string; storeName: string }): string {
  return `${message.replace(/\r\n?/g, "\n").trim()}\n\n${storeName}`;
}
