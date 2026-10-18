import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { and, count, eq, gte } from "drizzle-orm";
import { getDb } from "../db/client";
import { aiUsage } from "../db/schema";

// One place for AI settings. The model can be switched without code changes
// (e.g. ADMATE_MODEL=claude-sonnet-5-5 for lower cost); everything else stays the same.
export const MODEL = process.env.ADMATE_MODEL ?? "claude-opus-5-5";

// Ask AdMate is still in development: off unless ADMATE_ASK_ENABLED=true.
export const ASK_AVAILABLE = process.env.ADMATE_ASK_ENABLED === "true";

// Questions to the assistant per account per day (cost control).
export const ASK_DAILY_LIMIT = Number(process.env.ADMATE_ASK_DAILY_LIMIT ?? 40);

// Refusals are retried server-side on the model Anthropic recommends.
export const FALLBACK = { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const };

export function aiEnabled(): boolean {
  return !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

let client: Anthropic | null = null;
export function anthropic(): Anthropic {
  client ??= new Anthropic();
  return client;
}

export async function logUsage(
  workspaceId: string | null,
  route: string,
  usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null } | null,
  ok: boolean,
) {
  const db = await getDb();
  await db.insert(aiUsage).values({
    workspaceId, route, model: MODEL,
    inputTokens: usage?.input_tokens ?? 0, outputTokens: usage?.output_tokens ?? 0,
    cacheReadTokens: usage?.cache_read_input_tokens ?? 0, ok,
  });
}

// How many questions this account asked today (one "ask_question" row per question).
export async function questionsToday(workspaceId: string): Promise<number> {
  const db = await getDb();
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  const [row] = await db
    .select({ n: count() })
    .from(aiUsage)
    .where(and(eq(aiUsage.workspaceId, workspaceId), eq(aiUsage.route, "ask_question"), gte(aiUsage.createdAt, since)));
  return row?.n ?? 0;
}
