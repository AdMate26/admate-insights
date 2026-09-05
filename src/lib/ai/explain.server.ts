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

function toPayload(f: CampaignFinding) {
  return {
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
  };
}

function parseNarratives(content: string): FindingNarrative[] {
  let parsed: { narratives?: FindingNarrative[] } = {};
  try {
    parsed = JSON.parse(content) as { narratives?: FindingNarrative[] };
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (match) parsed = JSON.parse(match[0]) as { narratives?: FindingNarrative[] };
  }
  return parsed.narratives ?? [];
}

async function explainOne(
  finding: CampaignFinding,
  apiKey: string,
): Promise<FindingNarrative[]> {
  const response = await fetch(GATEWAY_URL, {
    method: "POST",
    // Cap the wait: the deterministic findings must reach the UI even if the
    // gateway is slow. A timeout here only drops this campaign's narrative.
    signal: AbortSignal.timeout(20_000),
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
          content: `Findings JSON (1 campaign):\n${JSON.stringify([toPayload(finding)])}`,
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
  return parseNarratives(data.choices?.[0]?.message?.content ?? "{}");
}

/**
 * One small request per finding, issued in parallel: a single batched call for
 * every campaign is slow enough that the page can time out. Individual failures
 * are tolerated — the deterministic finding stands on its own.
 */
export async function explainFindings(findings: CampaignFinding[]): Promise<FindingNarrative[]> {
  if (findings.length === 0) return [];
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");

  const results = await Promise.allSettled(findings.map((f) => explainOne(f, apiKey)));
  const narratives: FindingNarrative[] = [];
  let failures = 0;
  for (const result of results) {
    if (result.status === "fulfilled") narratives.push(...result.value);
    else failures++;
  }
  if (narratives.length === 0) {
    throw new Error(
      failures > 0 ? "Lovable AI did not return any narratives" : "No narratives returned",
    );
  }
  return narratives;
}

