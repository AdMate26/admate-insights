import "server-only";
import { createHash } from "node:crypto";
import { and, desc, eq, gt, isNotNull } from "drizzle-orm";
import { getDb } from "./db/client";
import { alertSends, telegramLinks, workspaces } from "./db/schema";
import { alertDigest, alertLines, digestHtml } from "./analysis/alerts";
import { viewModel } from "./analysis/viewModel";
import { makeFmt } from "./fmt5";
import { alertStateTrusted } from "./data/alerts";
import { loadAnalysisTrusted } from "./data/workspaces";

// AdMate's Telegram bot. The bot token is the founder's (TELEGRAM_BOT_TOKEN in Vercel),
// never stored in code. People link their chat by sending the bot a one-time code
// ("/start <code>"); AdMate reads that with getUpdates, so no webhook is needed.

const token = () => process.env.TELEGRAM_BOT_TOKEN?.trim() || null;
export const telegramEnabled = () => !!token();

async function api<T>(method: string, body: Record<string, unknown>): Promise<T | null> {
  const t = token();
  if (!t) return null;
  try {
    const res = await fetch(`https://api.telegram.org/bot${t}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = (await res.json()) as { ok: boolean; result?: T; description?: string };
    if (!j.ok) console.warn(`[admate] telegram ${method} failed: ${j.description ?? res.status}`);
    return j.ok ? (j.result ?? null) : null;
  } catch (err) {
    console.warn(`[admate] telegram ${method} failed:`, err);
    return null;
  }
}

// Plain text, or Telegram HTML (<b>, <i>) with link buttons under the message.
export async function sendTelegram(chatId: string, text: string, opts: { html?: boolean; buttons?: { text: string; url: string }[] } = {}) {
  return !!(await api("sendMessage", {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
    ...(opts.html ? { parse_mode: "HTML" } : {}),
    ...(opts.buttons?.length ? { reply_markup: { inline_keyboard: [opts.buttons] } } : {}),
  }));
}

// The public address for links in messages (Telegram only accepts https links).
function siteLink(path: string) {
  const host = process.env.ADMATE_SITE_URL?.trim().replace(/\/+$/, "") || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  return host.startsWith("https://") ? host + path : null;
}

// Looks for "/start <code>" sent to the bot by this person, and links their chat.
export async function checkTelegramLink(userId: string): Promise<{ linked: boolean; username: string | null }> {
  const db = await getDb();
  const [link] = await db.select().from(telegramLinks).where(eq(telegramLinks.userId, userId));
  if (!link) return { linked: false, username: null };
  if (link.chatId) return { linked: true, username: link.username };
  if (!link.linkCode || !link.linkCodeExpires || link.linkCodeExpires < new Date()) return { linked: false, username: null };
  type Update = { message?: { text?: string; chat: { id: number }; from?: { username?: string; first_name?: string } } };
  const updates = (await api<Update[]>("getUpdates", { limit: 100, allowed_updates: ["message"] })) ?? [];
  const hit = updates.reverse().find((u) => u.message?.text?.trim() === `/start ${link.linkCode}`);
  if (!hit?.message) return { linked: false, username: null };
  const username = hit.message.from?.username ? `@${hit.message.from.username}` : (hit.message.from?.first_name ?? null);
  await db.update(telegramLinks).set({ chatId: String(hit.message.chat.id), username, on: true, linkCode: null, linkCodeExpires: null, updatedAt: new Date() }).where(eq(telegramLinks.userId, userId));
  await sendTelegram(String(hit.message.chat.id), "AdMate is connected. Your alerts will arrive here. You can change when in AdMate → Alerts → Send alerts.");
  return { linked: true, username };
}

// The alert message for one account and its latest data, as on the Alerts page.
// Callers pass only account ids AdMate looked up itself (the owner's, or the job's).
export async function accountMessage(workspaceId: string) {
  const a = await loadAnalysisTrusted(workspaceId);
  if (!a) return null;
  const vm = viewModel(a, a.coverage.dailyFrom ?? a.coverage.minDate ?? a.selection.b.from);
  const st = await alertStateTrusted(workspaceId);
  const f = makeFmt(a.workspace.currency);
  const lines = alertLines(vm, st.config, st.rules, st.targets, f);
  const digest = alertDigest(a.workspace.name, vm, st.config, st.rules, st.targets, f);
  const open = siteLink(`/c/${workspaceId}/actions`);
  const settings = siteLink(`/c/${workspaceId}/alerts`);
  const buttons = [...(open ? [{ text: "🔎 Open in AdMate", url: open }] : []), ...(settings ? [{ text: "⚙️ Alert settings", url: settings }] : [])];
  return { lines, text: digestHtml(digest), buttons };
}

const digest = (lines: string[]) => createHash("sha256").update(lines.join("\n")).digest("hex");

// Right after an upload: send the account's alerts when there are any and the same
// alerts weren't already sent.
export async function sendAfterUpload(userId: string, workspaceId: string) {
  if (!telegramEnabled()) return;
  const db = await getDb();
  const [link] = await db.select().from(telegramLinks).where(eq(telegramLinks.userId, userId));
  if (!link?.on || !link.chatId || link.when !== "now") return;
  const m = await accountMessage(workspaceId);
  if (!m || !m.lines.length) return;
  const d = digest(m.lines);
  const [last] = await db.select().from(alertSends).where(and(eq(alertSends.userId, userId), eq(alertSends.workspaceId, workspaceId))).orderBy(desc(alertSends.sentAt)).limit(1);
  if (last?.digest === d) return;
  if (await sendTelegram(link.chatId, m.text, { html: true, buttons: m.buttons })) await db.insert(alertSends).values({ userId, workspaceId, digest: d, kind: "now" });
}

// On a schedule (called every hour): people whose chosen day and hour is now, in their time zone.
export async function sendScheduled(now = new Date()) {
  if (!telegramEnabled()) return { sent: 0 };
  const db = await getDb();
  const links = await db.select().from(telegramLinks).where(and(eq(telegramLinks.on, true), isNotNull(telegramLinks.chatId)));
  let sent = 0;
  for (const l of links) {
    if (l.when === "now" || !l.chatId) continue;
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: l.tz, weekday: "short", hour: "2-digit", hourCycle: "h23" }).formatToParts(now).map((p) => [p.type, p.value]));
    const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
    if (Number(parts.hour) !== Number(l.time.slice(0, 2))) continue;
    if (l.when === "days" && !(l.days as number[]).includes(day)) continue;
    const accounts = await db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.ownerId, l.userId));
    for (const w of accounts) {
      // Once per hour slot at most, even if the trigger runs twice.
      const recent = await db.select({ id: alertSends.id }).from(alertSends).where(and(eq(alertSends.userId, l.userId), eq(alertSends.workspaceId, w.id), eq(alertSends.kind, "scheduled"), gt(alertSends.sentAt, new Date(now.getTime() - 50 * 60 * 1000)))).limit(1);
      if (recent.length) continue;
      const m = await accountMessage(w.id);
      if (!m) continue;
      if (await sendTelegram(l.chatId, m.text, { html: true, buttons: m.buttons })) {
        await db.insert(alertSends).values({ userId: l.userId, workspaceId: w.id, digest: digest(m.lines), kind: "scheduled" });
        sent++;
      }
    }
  }
  return { sent };
}
