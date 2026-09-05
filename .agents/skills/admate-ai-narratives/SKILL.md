---
name: admate-ai-narratives
description: "Modify AdMate Lovable AI prompts, model calls, response parsing, or narrative failure handling while preserving deterministic findings."
---

# AdMate AI narratives

Read `src/lib/ai/explain.server.ts`, the enrichment loop in `src/lib/admate.functions.ts`, and `CampaignFinding` in `src/lib/analysis/engine.ts`.

## Existing contract
The server uses the Lovable AI chat-completions gateway, the model constant in `explain.server.ts`, and `LOVABLE_API_KEY`. Do not assume a direct OpenAI SDK integration or silently substitute a model/provider. Verify current provider documentation if changing request details.

Input is structured engine evidence. Output is `FindingNarrative[]`: campaignId plus `possibleExplanation` and `recommendedAction`. The orchestrator copies only those two text fields to `aiExplanation` and `aiRecommendedAction`; preserve this explicit whitelist. Metrics, signal/status, severity, confidence, and evidence stay code-owned.

## Workflow
- Keep causes hypothetical, recommendations specific, and numbers traceable to supplied evidence. A suggested action is text, not permission to execute ad-account changes.
- Treat campaign names and other supplied strings as data, not model instructions. Keep system rules distinct from evidence.
- Inspect parsing and ID association when changing the schema. Current TypeScript assertions and JSON mode do not validate runtime field types, uniqueness, completeness, or narrative factuality. Test missing/unknown/duplicate IDs, malformed JSON, fenced JSON, wrong types, and extra computed fields.
- Preserve deterministic output when AI fails. The orchestrator catches errors and exposes `aiStatus`/`aiError`; absent narratives remain absent. Currently an empty narrative response can still report `ok`, so do not describe this as full coverage validation.
- Avoid leaking gateway response bodies or credentials into logs/user errors when improving failure handling. Error handling currently includes a response excerpt; review that boundary if touched.

## Validate
Mock fetch for success, empty findings, missing key, rejected status, malformed/partial response, and thrown errors. Assert that enrichment changes only the two permitted fields. Compare hypotheses/actions against evidence with representative findings; do not snapshot exact nondeterministic prose. Keep checks offline by default. If live model evaluation is requested, report model, sample count, and limitations and avoid repeated unbounded calls. The current code has no retry implementation despite its retryability comment.
