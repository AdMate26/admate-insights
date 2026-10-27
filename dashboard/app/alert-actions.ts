"use server";

import { randomBytes, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { alertRules, alertSettings, campaignTargets, telegramLinks } from "@/lib/db/schema";
import { isRuleMetric, parseAlertConfig, RULE_METRICS, type AlertConfig } from "@/lib/analysis/alerts";
import { getAlertConfig } from "@/lib/data/alerts";
import { requireWorkspace } from "@/lib/data/workspaces";

// Alerts (Advanced): every action checks the account belongs to the signed-in user.

export async function saveAlertConfig(workspaceId: string, patch: Partial<AlertConfig>) {
  await requireWorkspace(workspaceId);
  const config = parseAlertConfig({ ...(await getAlertConfig(workspaceId)), ...patch });
  const db = await getDb();
  await db.insert(alertSettings).values({ workspaceId, config }).onConflictDoUpdate({ target: alertSettings.workspaceId, set: { config, updatedAt: new Date() } });
  revalidatePath("/", "layout");
}

export async function addRule(workspaceId: string, rule: { metric: string; op: string; value: number; scope: string }): Promise<{ error?: string }> {
  await requireWorkspace(workspaceId);
  if (!isRuleMetric(rule.metric)) return { error: "Pick a metric." };
  const value = Number(rule.value);
  if (!(value >= 0) || !Number.isFinite(value)) return { error: "Enter a number." };
  if (rule.metric === "worse" && rule.op !== "by") return { error: "Use “is worse by more than” for this one." };
  if (rule.metric !== "worse" && rule.op !== "above" && rule.op !== "below") return { error: "Use “is above” or “is below”." };
  const scope = String(rule.scope ?? "all").slice(0, 200);
  if (!(scope === "all" || /^obj:[a-z_]+$/.test(scope) || /^c:[A-Za-z0-9_-]+$/.test(scope))) return { error: "Pick what the alert applies to." };
  if (RULE_METRICS[rule.metric].needsScope && scope === "all") return { error: "Pick a goal or a campaign: cost per result and ROAS can’t share one limit." };
  const db = await getDb();
  const mine = await db.select({ id: alertRules.id }).from(alertRules).where(eq(alertRules.workspaceId, workspaceId));
  if (mine.length >= 50) return { error: "This account has 50 alerts. Delete one first." };
  await db.insert(alertRules).values({ id: randomUUID(), workspaceId, metric: rule.metric, op: rule.op, value, scope, on: true });
  revalidatePath("/", "layout");
  return {};
}

export async function setRuleOn(workspaceId: string, id: string, on: boolean) {
  await requireWorkspace(workspaceId);
  const db = await getDb();
  await db.update(alertRules).set({ on: !!on }).where(and(eq(alertRules.id, String(id)), eq(alertRules.workspaceId, workspaceId)));
  revalidatePath("/", "layout");
}

export async function deleteRule(workspaceId: string, id: string) {
  await requireWorkspace(workspaceId);
  const db = await getDb();
  await db.delete(alertRules).where(and(eq(alertRules.id, String(id)), eq(alertRules.workspaceId, workspaceId)));
  revalidatePath("/", "layout");
}

// A campaign's own target in the unit it's judged by; 0 or empty removes it.
export async function setCampaignTarget(workspaceId: string, campaignId: string, mode: string, value: number | null) {
  await requireWorkspace(workspaceId);
  if (!["cost", "roas", "cpm"].includes(mode)) return;
  const db = await getDb();
  const id = String(campaignId).slice(0, 200);
  if (value == null || !(Number(value) > 0)) await db.delete(campaignTargets).where(and(eq(campaignTargets.workspaceId, workspaceId), eq(campaignTargets.campaignId, id)));
  else {
    const v = Number(value);
    await db.insert(campaignTargets).values({ workspaceId, campaignId: id, mode, value: v }).onConflictDoUpdate({ target: [campaignTargets.workspaceId, campaignTargets.campaignId], set: { mode, value: v, updatedAt: new Date() } });
  }
  revalidatePath("/", "layout");
}

// ---------- Telegram (per person) ----------
const WHEN = ["now", "daily", "days"];
export async function saveTelegram(patch: { on?: boolean; when?: string; time?: string; days?: number[]; tz?: string }) {
  const user = await requireUser();
  const set: Partial<typeof telegramLinks.$inferInsert> = { updatedAt: new Date() };
  if (typeof patch.on === "boolean") set.on = patch.on;
  if (patch.when && WHEN.includes(patch.when)) set.when = patch.when;
  if (patch.time && /^([01]\d|2[0-3]):[0-5]\d$/.test(patch.time)) set.time = patch.time;
  if (Array.isArray(patch.days)) set.days = [...new Set(patch.days.map(Number).filter((d) => d >= 0 && d <= 6))];
  if (patch.tz && /^[A-Za-z_]+\/[A-Za-z_]+(\/[A-Za-z_]+)?$/.test(patch.tz)) set.tz = patch.tz;
  const db = await getDb();
  await db.insert(telegramLinks).values({ userId: user.id, ...set }).onConflictDoUpdate({ target: telegramLinks.userId, set });
  revalidatePath("/", "layout");
}

// "Connect Telegram": a one-time code the person sends to the AdMate bot (valid 30 minutes).
export async function telegramLinkCode(): Promise<{ code: string; bot: string | null }> {
  const user = await requireUser();
  const code = randomBytes(9).toString("base64url");
  const db = await getDb();
  const expires = new Date(Date.now() + 30 * 60 * 1000);
  await db.insert(telegramLinks).values({ userId: user.id, linkCode: code, linkCodeExpires: expires }).onConflictDoUpdate({ target: telegramLinks.userId, set: { linkCode: code, linkCodeExpires: expires, updatedAt: new Date() } });
  return { code, bot: process.env.TELEGRAM_BOT_USERNAME?.trim() || null };
}

export async function disconnectTelegram() {
  const user = await requireUser();
  const db = await getDb();
  await db.update(telegramLinks).set({ chatId: null, username: null, on: false, linkCode: null, updatedAt: new Date() }).where(eq(telegramLinks.userId, user.id));
  revalidatePath("/", "layout");
}

// "Send a test message now": this account's alerts, to the person's linked chat.
export async function sendTestTelegram(workspaceId: string): Promise<{ error?: string }> {
  const user = await requireUser();
  await requireWorkspace(workspaceId);
  const { accountMessage, sendAccountMessage, telegramEnabled } = await import("@/lib/telegram");
  if (!telegramEnabled()) return { error: "Telegram isn’t set up for AdMate yet." };
  const db = await getDb();
  const [link] = await db.select().from(telegramLinks).where(eq(telegramLinks.userId, user.id));
  if (!link?.chatId) return { error: "Connect Telegram first." };
  const m = await accountMessage(workspaceId);
  if (!m) return { error: "This account has no data yet." };
  return (await sendAccountMessage(link.chatId, m)) ? {} : { error: "Telegram didn’t accept the message. Try again in a minute." };
}
