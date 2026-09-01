import type { Finding } from "../analysis/engine";

/**
 * AI EXPLANATION LAYER (Lovable AI).
 *
 * This layer ONLY explains. It receives findings that the deterministic engine
 * has already computed and classified, and returns natural language:
 *   - a possible explanation
 *   - a recommended action
 *   - a confidence level + reasoning
 *
 * It must never produce numbers, metrics, severities or classifications. Any
 * figure it mentions has to be quoted from the structured evidence it was given.
 */

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3.7-flash";

export type FindingNarrative = {
  code: string;
  entityId: string;
  explanation: string;
  recommendedAction: string;
  confidence: "high" | "medium" | "low";
  confidenceReason: string;
};

const SYSTEM_PROMPT = `You are AdMate, a senior TikTok Ads analyst.

You receive findings that were already detected, measured and severity-classified by deterministic code.
Your job is ONLY to write natural-language interpretation:
1. "explanation" — the most plausible causal explanation for the finding (2-3 sentences). Frame it as a hypothesis.
2. "recommendedAction" — one concrete, specific next action a media buyer can execute today (1-2 sentences).
3. "confidence" — "high" | "medium" | "low", reflecting how strongly the supplied evidence supports your explanation.
4. "confidenceReason" — one sentence on why (sample size, spend volume, whether corroborating metrics agree).

Hard rules:
- Never invent, recompute or contradict any number. Only quote figures present in the finding's evidence.
- Never change the severity or claim a different metric moved.
- No markdown, no bullet lists, no emojis. Plain prose.

Return JSON only: {"narratives":[{"code","entityId","explanation","recommendedAction","confidence","confidenceReason"}]}`;

export async function explainFindings(findings: Finding[]): Promise<FindingNarrative[]> {
  if (findings.length === 0) return [];
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");

  const payload = findings.map((f) => ({
    code: f.code,
    entityId: f.entityId,
    entityLevel: f.entityLevel,
    entityName: f.entityName,
    metric: f.metric,
    severity: f.severity,
    whatChanged: f.whatChanged,
    whyItMatters: f.whyItMatters,
    evidence: f.evidence,
  }));

  const response = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Write narratives for these ${findings.length} findings (JSON):\n${JSON.stringify(payload)}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    // Surface the gateway status verbatim; only 429/5xx are worth retrying.
    throw new Error(`Lovable AI error ${response.status}: ${body.slice(0, 500)}`);
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content ?? "{}";
  let parsed: { narratives?: FindingNarrative[] };
  try {
    parsed = JSON.parse(content) as { narratives?: FindingNarrative[] };
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    parsed = match ? (JSON.parse(match[0]) as { narratives?: FindingNarrative[] }) : {};
  }
  return parsed.narratives ?? [];
}
