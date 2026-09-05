<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->


# AdMate development guide

## Purpose and current implementation
AdMate explains what changed in TikTok campaign performance, what needs attention, the evidence, a possible cause, and a recommended action. Preserve the separation between deterministic analytics and AI prose.

This is a React 19 / TypeScript app using TanStack Start and Router, React Query, Tailwind 4, Radix/shadcn-style components, and the Lovable Vite configuration. Read `package.json` for current versions rather than assuming another framework.

## Architecture map
| Area | Source of truth |
| --- | --- |
| Welcome, demo list, detail, connection placeholder, auth | `src/routes/` and `src/routes/README.md` |
| Root shell and query context | `src/routes/__root.tsx`, `src/router.tsx` |
| Shared AdMate UI and design tokens | `src/components/admate/`, `src/components/ui/`, `src/styles.css` |
| Provider contract, synthetic data, normalization | `src/lib/tiktok/` |
| Metrics, signals, status, severity, evidence, confidence | `src/lib/analysis/engine.ts` |
| Analysis orchestration and manual Telegram preview/send | `src/lib/admate.functions.ts` |
| Lovable AI explanation/action text | `src/lib/ai/explain.server.ts` |
| Shared five-minute analysis query | `src/lib/analysis-query.ts` |
| Auth token attachment, CSRF, request errors | `src/start.ts`, `src/integrations/supabase/` |
| SSR error wrapper and build configuration | `src/server.ts`, `vite.config.ts` |
| Database schema and policies | `supabase/migrations/`, generated `src/integrations/supabase/types.ts` |

Current flow: demo provider → normalization → deterministic analysis → optional AI narrative enrichment → query cache → UI. Briefing preview/send regenerate analysis. Analysis uses 28 synthetic history days and two seven-day comparison windows, with no run persistence wired in.

## Distinguish implemented behavior from plans
- `/` offers public demo and live-connect choices; `/home` and campaign detail currently have no auth guard. Auth/reset pages and session UI exist. The roadmap's `_authenticated` layout description is stale.
- Live TikTok OAuth/report fetching, scheduled briefings, saved analysis history, and charts are deferred. `/connect` is a coming-soon page. Do not claim they work or implement them incidentally.
- Server functions currently implement the pipeline; the README's proposed Edge Function architecture is not the running code.
- Confidence belongs to deterministic code. The README's earlier AI-confidence wording and legacy database `ai_confidence` fields do not override this boundary.
- The demo provider has nine intended scenarios; names do not guarantee actual classification. The engine currently slices available pre-today dates and counts rows for completeness, so sparse/multi-ad data needs explicit treatment before live use.

## Working rules
Read the owning module and callers before editing. Preserve working behavior outside the requested change. Keep `src/routeTree.gen.ts` and marked generated Supabase files generator-owned. Follow TanStack file routing, preserve the root Outlet and SSR shell, and avoid duplicate plugins already supplied by the Lovable Vite wrapper.

AI may add only explanation and recommended-action text. It must not compute or change metrics, classification, status, severity, evidence, or confidence. Preserve useful deterministic output when AI is unavailable. Keep synthetic data clearly labeled.

Do not expose keys, tokens, or environment values in code, screenshots, logs, documentation, or commits. The existing tracked `.env` contains Supabase connection/publishable configuration; do not add private secrets there. Use verified ignored local files or deployment secret storage. Browser `VITE_*` values are public. Attaching a bearer token is not authorization; private data requires verified server identity and tenant-safe policies. Current analytics table SELECT policies are public demo policies.

Do not send real Telegram messages, change live ad accounts, apply remote migrations, or deploy merely to validate unrelated code. Respect explicit task authorization for external actions. Preserve the Lovable history warning above. Stage only requested files; commit or push only when requested.

## Setup and validation
`bun.lock` is the committed lockfile, with installation policy in `bunfig.toml`; prefer `bun install --frozen-lockfile` when available. The README also documents npm. Avoid incidental package-manager migration or a second lockfile. Determine runtime compatibility from the locked tooling; this repository does not pin an engine version.

For relevant application changes, run `npm run lint`, `./node_modules/.bin/tsc --noEmit`, and `npm run build` once dependencies are installed. `npm run dev` starts local development; `build:dev` and `preview` also exist. `npm run format` rewrites the whole repository, so avoid it for narrow edits. There is no committed test suite, test script, or CI workflow at this baseline. Report checks actually run and baseline failures honestly; add focused regression coverage when code changes warrant it.

Documentation-only work needs frontmatter/path/content validation and `git diff --check`, not a live integration call. Never read or print secret values to prove configuration exists.

## Repository skills
Skills live in `.agents/skills/<name>/SKILL.md`, with required YAML `name` and `description`. This is the official repository-scoped location, discoverable when Codex runs inside this Git repository. Use relevant skills rather than loading every skill for every task.

| Skill | Use for |
| --- | --- |
| `admate-frontend` | Routes, campaign screens, shared components, styling |
| `admate-architecture` | Cross-layer changes, contracts, persistence, auth boundaries |
| `admate-analysis-engine` | Metrics, thresholds, status, severity, confidence, evidence |
| `admate-tiktok` | Demo provider and explicitly requested live API integration |
| `admate-telegram` | Briefing formatting, preview, delivery, failure handling |
| `admate-ai-narratives` | Lovable AI prompts, parsing, model calls, narrative fallback |
| `admate-regression` | Scope-appropriate tests and regression evidence |
| `admate-security` | Secrets, authorization, RLS, client/server data exposure |
| `admate-build-validation` | Dependency setup, lint/types/build, deployment readiness |

Example: `$admate-analysis-engine review the CPA classification thresholds`.

Official format references (checked 2026-09-05): [Codex skills](https://developers.openai.com/codex/skills) and [AGENTS.md](https://developers.openai.com/codex/guides/agents-md). Keep these instructions aligned with the code as the project evolves.
