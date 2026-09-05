---
name: admate-frontend
description: "Develop AdMate routes, campaign screens, shared UI, and styling with TanStack Router, React Query, and the existing design system."
---

# AdMate frontend

## Read first
- `src/routes/README.md`, the affected route, `src/routes/__root.tsx`, and `src/router.tsx`.
- `src/lib/analysis-query.ts`, `src/components/admate/`, and `src/styles.css`.

## Workflow
1. Trace the current route loader and data consumer before changing rendering. The campaign list and detail share `analysisQueryOptions` with key `["admate", "analysis"]` and a five-minute stale time; avoid independent fetches that show different runs.
2. Use file-based TanStack routes and typed `Link` params. Keep the root `Outlet`, `HeadContent`, `Scripts`, query provider, and error boundaries. Do not introduce Next.js pages or layouts. Let the router generate `src/routeTree.gen.ts`.
3. Reuse `src/components/ui/` primitives and the AdMate header/badges. Use semantic Tailwind tokens. New color tokens need OKLCH values in both light/dark blocks and registration in `@theme inline`.
4. Preserve the campaign detail hierarchy: status, what changed, possible explanation, recommended action as the focal point, evidence, confidence. Status, signal, severity, and confidence are different concepts; render engine values instead of inferring them from names or colors.
5. Keep synthetic-data labels and `/connect` coming-soon messaging truthful. AI failure must leave deterministic findings and evidence usable; do not invent fallback recommendations or numbers.

## Validate
Check welcome → demo → detail → back navigation, unknown campaign IDs, loading/error states, missing narratives, keyboard access, and narrow-screen tables. For auth-related UI, check session updates and query-cache clearing on logout in `AdMateHeader.tsx`. Current demo routes are public; do not add login gating as an incidental UI change. Use the repository regression/build skills for code changes.
