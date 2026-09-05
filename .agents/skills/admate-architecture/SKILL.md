---
name: admate-architecture
description: "Plan or implement cross-layer AdMate changes involving data flow, server functions, persistence, routing, or authentication boundaries."
---

# AdMate architecture

## Current map
`DemoTikTokDataProvider` → `loadNormalizedDailyRows` → `runAnalysis` → `explainFindings` → `getAdMateAnalysis` → React Query → routes. Telegram preview/send also call `getAdMateAnalysis`.

Read `src/lib/admate.functions.ts`, `src/lib/tiktok/contract.ts`, `src/lib/analysis/engine.ts`, `src/lib/analysis-query.ts`, `src/start.ts`, and the affected integration before designing a change.

## Work at the owning boundary
- Provider adapters own raw fields. Downstream code consumes `NormalizedDailyRow`.
- The engine owns metrics, comparisons, classification, status, severity, ordering, evidence, and confidence. AI adds only explanation/action text.
- TanStack `createServerFn` handlers orchestrate the current app. Despite the original README proposal, there is no implemented Supabase Edge Function pipeline here.
- Analysis is regenerated in memory from 28 demo days and compared over two seven-day windows. React Query is a UI cache, not durable run storage. Preview/send regenerate analysis, so narratives need not match a cached screen.
- Supabase migrations create demo performance, runs, findings, and profiles. The first three are not wired into analysis persistence. Legacy `ai_confidence` columns are not a mandate to move confidence into AI.

## Implementation workflow
Trace caller → handler → owning module → response consumer. State which contract changes and update all affected consumers in the same scoped change. Keep privileged imports inside handlers or other server-only modules; route modules and `.functions.ts` can enter client bundles. Use TanStack server boundaries, not the Next.js `server-only` package.

For private data, inspect `auth-middleware.ts`, `auth-attacher.ts`, `client.server.ts`, and RLS together. The global attacher supplies a token but does not verify it; current AdMate handlers do not apply `requireSupabaseAuth`. The admin client bypasses RLS. Public demo access is existing behavior, not sufficient authorization for future tenant data.

When implementing persistence, design ownership, run identity, schema mapping, and migrations explicitly; do not silently start storing live data in public demo tables. When changing routing, keep the per-router QueryClient and generated route tree workflow. Update project guidance when architecture actually changes, and report deferred pieces as deferred.
