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

const SYSTEM_PROMPT = `You are AdMate, a senior paid-media analyst covering Meta, TikTok and Google Ads.

Deterministic code has already judged each campaign ON THE METRIC ITS OBJECTIVE WAS BOUGHT AGAINST.
The platform, objective, performance verdict, signal (the analytical condition), the diagnosis ("why"),
the recommended action, the primary KPI, the comparison source and every evidence figure are FIXED and correct.

Write exactly two fields per campaign, rephrasing the supplied analysis for a busy marketer:
1. "possibleExplanation" — restate the given diagnosis and why, in 2-3 plain sentences. Do not introduce a new cause.
2. "recommendedAction" — one specific next action, consistent with the given action (1-2 sentences).

Hard rules:
- Never change the performance verdict, signal, objective or confidence, and never contradict them.
- Never invent, recompute or adjust a number, a target, a tracking failure or a metric. Only reference the supplied figures.
- Judge upper-funnel objectives (awareness, video, traffic) on their own KPI — never on ROAS/CPA.
- No markdown, no bullets, no emojis. Plain professional prose.

Return JSON only:
{"narratives":[{"campaignId":"...","possibleExplanation":"...","recommendedAction":"..."}]}`;

function toPayload(f: CampaignFinding) {
  return {
    campaignId: f.campaignId,
    campaignName: f.campaignName,
    platform: f.platform,
    objective: f.objectiveLabel,
    performance: f.performance,
    primaryMetric: f.primaryMetric,
    primaryMetricValue: f.primaryMetricValue,
    comparison: f.comparisonLabel,
    target: f.targetOrBaseline,
    signal: f.signal,
    why: f.why,
    action: f.action,
    confidence: f.diagnosticConfidence,
    evidence: f.evidence.map((e) => ({ label: e.label, current: e.current, previous: e.previous, change: e.changePct })),
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

