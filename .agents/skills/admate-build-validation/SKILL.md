---
name: admate-build-validation
description: "Validate AdMate dependency setup, lint/type/build output, and deployment readiness with its Lovable TanStack Vite configuration."
---

# AdMate build and deployment validation

Read `package.json`, `bun.lock`, `bunfig.toml`, `vite.config.ts`, `src/server.ts`, `src/start.ts`, `tsconfig.json`, and the Lovable block in `AGENTS.md`.

## Setup and commands
The README shows npm setup, but `bun.lock` is the committed lockfile and `bunfig.toml` configures installation policy. Prefer `bun install --frozen-lockfile` for a reproducible installation when Bun is available. Check the chosen runtime against the locked tools' engine requirements. Do not invent a pinned Node/Bun version or generate a second lockfile incidentally. Preserve the minimum-release-age policy; its comment requires user confirmation before adding exclusions.

Available package scripts are `dev`, `build`, `build:dev`, `preview`, `lint`, and repository-wide `format`. With dependencies installed, use `npm run lint`, `./node_modules/.bin/tsc --noEmit`, and `npm run build` as applicable (or the equivalent Bun script invocation). Do not use the mutating whole-repository format script for a narrow change. There is no separate test script or committed CI deployment workflow at this baseline.

## Configuration constraints
`@lovable.dev/vite-tanstack-config` already provides React, TanStack Start, Tailwind, path aliases, deduplication, devtools, and build-time Nitro with a default Cloudflare target. Do not register duplicate plugins or replace this setup casually. Preserve the custom `server: { entry: "server" }` setting and SSR error wrapper. Generated `src/routeTree.gen.ts` must remain generator-owned.

## Readiness checks
A successful build is not a deployment or proof of configured secrets. Verify server and client output separately where a bundling change warrants it; privileged modules/values must not ship in the client. Do not print secret-bearing bundles or environment values. Confirm required variable names for the target: Supabase URL/publishable client config and corresponding server config, Lovable AI key for narratives, Telegram bot/recipient for sends. Missing AI configuration should retain deterministic results; real delivery requires separate verification.

Review `git status` after installation/build for lockfile/generated-file drift. Report existing failures without broad repairs outside scope. Publishing, running remote migrations, and pushing the Lovable-connected branch require task authorization; local build validation alone does not authorize them. Do not rewrite published Git history. For a deployment request, identify the actual configured target and current instructions instead of assuming the plugin's default is the deployed environment.
