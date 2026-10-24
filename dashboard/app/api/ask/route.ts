import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { ask, toolLabel, type AskEvent } from "@/lib/ai/assistant";
import { aiEnabled, ASK_AVAILABLE, ASK_DAILY_LIMIT, logUsage, questionsToday } from "@/lib/ai/client";
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
  if (!(await getWorkspace(body.workspaceId))) return Response.json({ error: "Account not found." }, { status: 404 });
  if ((await questionsToday(body.workspaceId)) >= ASK_DAILY_LIMIT) {
    return Response.json({ error: `You've reached today's limit of ${ASK_DAILY_LIMIT} questions for this account. It resets tomorrow.` }, { status: 429 });
  }
  const a = await loadAnalysis(body.workspaceId, body.selection);
  if (!a) return Response.json({ error: "No data for this account yet — upload an export first." }, { status: 404 });

  const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0 };
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: AskEvent | { type: "status"; text: string }) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
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
          },
        })) {
          if (e.type === "tool") send({ type: "status", text: toolLabel(e.name) });
          else send(e);
          if (e.type === "error") ok = false;
        }
      } catch (err) {
        ok = false;
        const message =
          err instanceof Anthropic.AuthenticationError
            ? "The Anthropic API key is invalid."
            : err instanceof Anthropic.RateLimitError
              ? "The AI service is busy. Try again in a minute."
              : err instanceof Anthropic.APIError
                ? `The AI service returned an error (${err.status}).`
                : "Something went wrong while answering.";
        console.warn("[admate] ask failed:", err);
        send({ type: "error", message });
      } finally {
        await logUsage(body.workspaceId, "ask_question", usage, ok);
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
