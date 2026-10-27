import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { ask, toolLabel, type AskEvent } from "@/lib/ai/assistant";
import { aiEnabled, ASK_AVAILABLE, ASK_DAILY_LIMIT, logUsage, questionsToday } from "@/lib/ai/client";
import { getCurrentUser } from "@/lib/auth/session";
import { BUY_AVAILABLE, chargeAnswer, creditBalance } from "@/lib/ai/credits";
import type { TokenUsage } from "@/lib/ai/pricing";
import { getWorkspace, loadAnalysis } from "@/lib/data/workspaces";

const Body = z.object({
  workspaceId: z.string(),
  selection: z.record(z.string(), z.string().optional()).default({}),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(8000) })).max(40).default([]),
  question: z.string().min(1).max(2000),
  findingKey: z.string().optional(),
  aboutTitle: z.string().max(300).optional(),
  level: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  page: z.string().max(40).optional(),
});

// Streams the assistant's answer as newline-delimited JSON events.
export async function POST(request: Request) {
  if (!ASK_AVAILABLE) return Response.json({ error: "Ask AdMate is still in development and not available yet." }, { status: 503 });
  if (!aiEnabled()) return Response.json({ error: "Ask AdMate needs an Anthropic API key (ANTHROPIC_API_KEY in .env.local)." }, { status: 503 });
  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Invalid request." }, { status: 400 });
  const body = parsed.data;
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401 });
  if (!(await getWorkspace(body.workspaceId))) return Response.json({ error: "Account not found." }, { status: 404 });
  // Credits: answering needs a balance above zero; the answer's real cost is charged after.
  if ((await creditBalance(user.id)) <= 0) {
    const error = "Your credits ran out.";
    return Response.json({ error, code: "no_credits", canBuy: BUY_AVAILABLE, balance: 0 }, { status: 402 });
  }
  if ((await questionsToday(body.workspaceId)) >= ASK_DAILY_LIMIT) {
    return Response.json({ error: `You've reached today's limit of ${ASK_DAILY_LIMIT} questions for this account. It resets tomorrow.` }, { status: 429 });
  }
  const a = await loadAnalysis(body.workspaceId, body.selection);
  if (!a) return Response.json({ error: "No data for this account yet — upload an export first." }, { status: 404 });

  const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  const steps: TokenUsage[] = [];
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: AskEvent | { type: "status"; text: string } | { type: "credits"; used: number; balance: number }) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      let ok = true;
      try {
        for await (const e of ask({
          a,
          history: body.history,
          question: body.question,
          findingKey: body.findingKey,
          aboutTitle: body.aboutTitle,
          page: body.page,
          style: body.level,
          onUsage: (u) => {
            usage.input_tokens += u.input_tokens;
            usage.output_tokens += u.output_tokens;
            usage.cache_read_input_tokens += u.cache_read_input_tokens;
            usage.cache_creation_input_tokens += u.cache_creation_input_tokens;
            steps.push({ model: u.model, input: u.input_tokens, output: u.output_tokens, cacheRead: u.cache_read_input_tokens, cacheWrite: u.cache_creation_input_tokens });
          },
        })) {
          if (e.type === "tool") send({ type: "status", text: toolLabel(e.name) });
          else send(e);
          if (e.type === "error") ok = false;
        }
      } catch (err) {
        ok = false;
        const message =
          // People see a plain message; the exact reason (e.g. AdMate's Anthropic account
          // out of funds) is in the server log below. Only AI work that ran is charged.
          err instanceof Anthropic.RateLimitError
            ? "The AdMate Assistant is busy. Try again in a minute."
            : err instanceof Anthropic.APIError
              ? "The AdMate Assistant can’t answer right now. Please try again later."
              : "Something went wrong while answering. Please try again.";
        console.warn("[admate] ask failed:", err);
        send({ type: "error", message });
      } finally {
        // Whatever was used is charged, also when the answer stopped early.
        let cost = 0;
        try {
          const charged = await chargeAnswer(user.id, body.workspaceId, steps);
          cost = charged.costUsd;
          send({ type: "credits", used: charged.units, balance: await creditBalance(user.id) });
        } catch (err) {
          console.warn("[admate] credit charge failed:", err);
        }
        await logUsage(body.workspaceId, "ask_question", usage, ok, cost);
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
