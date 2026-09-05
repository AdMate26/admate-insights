---
name: admate-regression
description: "Choose and perform scoped AdMate regression checks for engine, provider, UI, auth, and integration changes; distinguish real tests from build checks."
---

# AdMate regression checking

## Establish the baseline
Read `package.json`, `tsconfig.json`, `eslint.config.js`, and `git status --short`. This checkout has no test script, test runner configuration, committed test suite, or CI workflow. Do not claim `npm test` works or equate a passing bundle with a type check. Use an existing harness if one has since been added; introduce one only as justified by the requested code work.

## Select checks by changed behavior
- Engine/provider: freeze time; use normalized fixtures; check threshold boundaries, overlapping signals, status vs severity, confidence caps, missing dates, multiple ad rows, zeros, and deterministic ordering. Compare actual demo results, not scenario labels alone.
- AI: mock the gateway; ensure computed findings are unchanged on success, failure, or partial narratives.
- Telegram: mock delivery and assert recipient precedence, HTML escaping, selection limit, and failure UI. Preview can call AI; stub that too for offline checks.
- UI: welcome/demo/detail/back navigation, unknown campaign, narrow widths, keyboard controls, AI-unavailable state, and preserved evidence/confidence.
- Auth/private-data work: test absent/invalid credentials and cross-user access at the server boundary, not only route redirects. Verify logout clears query state. Current demo routes are public.

## Run and report
With dependencies installed, use `npm run lint`, the local compiler `./node_modules/.bin/tsc --noEmit`, and `npm run build` for relevant code changes. See the build skill for lockfile/setup guidance. Record baseline failures and distinguish newly introduced failures; do not run broad formatting fixes or rewrite unrelated application code to make a scoped task green.

For documentation-only changes, validate skill frontmatter, referenced paths, factual accuracy, preserved project instructions, `git diff --check`, and the exact staged file list. Application build/runtime tests are not required solely for Markdown changes. Report commands actually run, outcomes, checks skipped, and environment limits. Never claim a live integration passed based on a mock or missing-secret fallback.
