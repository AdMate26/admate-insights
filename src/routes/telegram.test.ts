import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

/**
 * /telegram restores the owner's Telegram settings. The screen must stay behind
 * a sign-in and the server's owner answer (getWorkspaceAccess →
 * verifyOwnerAccess); the server functions re-check the owner themselves.
 */
const source = readFileSync(new URL("./telegram.tsx", import.meta.url), "utf8");

test("/telegram requires a session before it loads", () => {
  expect(source).toMatch(/beforeLoad:\s*async \(\) => \{\s*await requireSession\(\);/);
  expect(source).toContain("ssr: false");
});

test("/telegram shows the settings only to the verified owner", () => {
  expect(source).toContain("workspaceAccessQueryOptions(userId)");
  expect(source).toContain(
    'const isOwner = Boolean(access.data?.liveBrands.includes("my_account"));',
  );
  const ownerBranch = source.indexOf("{isOwner ? (");
  const settings = source.indexOf("<BriefingsView");
  const fallback = source.indexOf(") : (", ownerBranch);
  expect(ownerBranch).toBeGreaterThan(-1);
  // The settings render only inside the owner branch, and only once.
  expect(settings).toBeGreaterThan(ownerBranch);
  expect(settings).toBeLessThan(fallback);
  expect(source.indexOf("<BriefingsView", settings + 1)).toBe(-1);
});
