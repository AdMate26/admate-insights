import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { BriefingsView } from "./BriefingsView";

// The UI only hides controls; the server functions enforce the owner check.
// These tests pin what each kind of visitor is offered.

const CONTROLS = ["Preview Message", "Telegram Schedule &amp; Send", "Telegram chat ID"];

test("signed-out demo visitors see an owner-only note and a sign-in link, no Telegram controls", () => {
  const html = renderToStaticMarkup(
    <BriefingsView brand="northlane" canManage={false} signedIn={false} />,
  );
  expect(html).toContain("Owner only");
  expect(html).toContain('href="/login"');
  for (const control of CONTROLS) expect(html).not.toContain(control);
  // The explanatory content of the page is unchanged.
  expect(html).toContain("Briefings, on your schedule");
  expect(html).toContain("What goes in the briefing");
});

test("signed-in non-owners see the owner-only note without a sign-in link", () => {
  const html = renderToStaticMarkup(
    <BriefingsView brand="olive" canManage={false} signedIn={true} />,
  );
  expect(html).toContain("Owner only");
  expect(html).not.toContain('href="/login"');
  for (const control of CONTROLS) expect(html).not.toContain(control);
});

test("the verified owner gets the full Telegram controls", () => {
  const html = renderToStaticMarkup(
    <BriefingsView brand="kite" canManage={true} signedIn={true} />,
  );
  for (const control of CONTROLS) expect(html).toContain(control);
  expect(html).not.toContain("Owner only");
});
