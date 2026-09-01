import type { CampaignFinding } from "../analysis/engine";

/**
 * AI EXPLANATION LAYER (Lovable AI) — narrative only.
 *
 * Input: the immutable structured finding produced by the deterministic engine.
 * Output: EXACTLY two natural-language fields per finding —
 *   - possibleExplanation
 *   - recommendedAction
 *
 * This layer must never produce or change: signal/status, severity, evidence,
 * metrics, comparisons or confidence. Those are code-owned. Anything it writes
 * that looks like a number must be quoted from the evidence it was given.
 */

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3.7-flash";

export type FindingNarrative = {
  campaignId: string;
  possibleExplanation: string;
  recommendedAction: string;
};

const SYSTEM_PROMPT = `You are AdMate, a senior TikTok Ads analyst.

Deterministic code has already detected, measured and classified each finding: the signal/status,
severity, evidence, every metric comparison, and the confidence level are FIXED and correct.

Write exactly two fields per finding:
1. "possibleExplanation" — the most plausible cause of the finding, framed as a hypothesis (2-3 sentences).
2. "recommendedAction" — one specific, executable next action for a media buyer today (1-2 sentences).

Hard rules:
- Never restate a different status, severity or confidence, and never contradict them.
- Never invent, recompute or adjust a number. Only reference figures present in the supplied evidence.
- No markdown, no bullets, no emojis. Plain professional prose.

Return JSON only:
{"narratives":[{"campaignId":"...","possibleExplanation":"...","recommendedAction":"..."}]}`;

export async function explainFindings(findings: CampaignFinding[]): Promise<FindingNarrative[]> {
  if (findings.length === 0) return [];
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");

  const payload = findings.map((f) => ({
    campaignId: f.campaignId,
    campaignName: f.campaignName,
    signal: f.signal,
    status: f.statusLabel,
    signalLabel: f.signalLabel,
    severity: f.severity,
    confidence: f.confidence,
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
          content: `Findings JSON (${findings.length} campaigns):\n${JSON.stringify(payload)}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    // Surface gateway status verbatim; only 429/5xx are retryable.
    throw new Error(`Lovable AI error ${response.status}: ${body.slice(0, 400)}`);
  }

  const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content ?? "{}";
  let parsed: { narratives?: FindingNarrative[] } = {};
  try {
    parsed = JSON.parse(content) as { narratives?: FindingNarrative[] };
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (match) parsed = JSON.parse(match[0]) as { narratives?: FindingNarrative[] };
  }
  return parsed.narratives ?? [];
}
