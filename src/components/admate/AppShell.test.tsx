import { expect, test } from "bun:test";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { renderToStaticMarkup } from "react-dom/server";

import { AppShell, type ShellMode } from "./AppShell";
import { LIVE_BRANDS, type LiveBrand, type WorkspaceBrand } from "@/lib/brands";
import { canOfferTelegramControls } from "@/lib/telegram/controls-access";

// The header's "Send briefing now" is offered only to the server-verified
// owner, and never on the live Meta account. (sendTelegramBriefing refuses
// everyone else on the server regardless — see owner-actions.test.ts.)

const SEND = "Send briefing now";

/** Render the real AppShell header the way DashboardScreen wires it. */
async function header(opts: {
  mode: ShellMode;
  serverLiveBrands: readonly LiveBrand[] | undefined;
  brand: WorkspaceBrand;
}) {
  const canSend = canOfferTelegramControls(opts.mode, opts.serverLiveBrands);
  const liveBrands = LIVE_BRANDS.filter((b) => opts.serverLiveBrands?.some((id) => id === b.id));
  const rootRoute = createRootRoute({
    component: () => (
      <AppShell
        mode={opts.mode}
        active="overview"
        brand={opts.brand}
        platform="meta"
        onSelectBrand={() => {}}
        liveBrands={liveBrands}
        canSendBriefing={canSend}
      >
        <p>content</p>
      </AppShell>
    ),
  });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  return renderToStaticMarkup(<RouterProvider router={router} />);
}

test("public demo (signed out): no 'Send briefing now'", async () => {
  const html = await header({ mode: "demo", serverLiveBrands: undefined, brand: "northlane" });
  expect(html).toContain("Demo Mode");
  expect(html).not.toContain(SEND);
});

test("public demo, even for the owner's session: no 'Send briefing now'", async () => {
  // /demo never asks the server who is signed in, so it can't offer the button.
  const html = await header({ mode: "demo", serverLiveBrands: ["my_account"], brand: "olive" });
  expect(html).not.toContain(SEND);
});

test("signed-in non-owner: no 'Send briefing now' on any demo brand", async () => {
  for (const brand of ["northlane", "olive", "kite"] as const) {
    const html = await header({ mode: "workspace", serverLiveBrands: [], brand });
    expect(html).toContain("Sample data");
    expect(html).not.toContain(SEND);
  }
});

test("owner check still loading: no 'Send briefing now' yet", async () => {
  const html = await header({ mode: "workspace", serverLiveBrands: undefined, brand: "kite" });
  expect(html).not.toContain(SEND);
});

test("verified owner on a demo brand: 'Send briefing now' is offered", async () => {
  const html = await header({
    mode: "workspace",
    serverLiveBrands: ["my_account"],
    brand: "northlane",
  });
  expect(html).toContain(SEND);
});

test("verified owner on the live Meta account: still hidden (live Telegram not ready)", async () => {
  const html = await header({
    mode: "workspace",
    serverLiveBrands: ["my_account"],
    brand: "my_account",
  });
  expect(html).toContain("Live · Meta");
  expect(html).not.toContain(SEND);
});

test("canOfferTelegramControls: only the workspace with the server-granted live brand", () => {
  expect(canOfferTelegramControls("workspace", ["my_account"])).toBe(true);
  expect(canOfferTelegramControls("workspace", [])).toBe(false);
  expect(canOfferTelegramControls("workspace", undefined)).toBe(false);
  expect(canOfferTelegramControls("demo", ["my_account"])).toBe(false);
  expect(canOfferTelegramControls("demo", undefined)).toBe(false);
});
