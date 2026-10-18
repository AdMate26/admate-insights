import { and, asc, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { workspaces } from "@/lib/db/schema";
import { BASE_PATH, websiteUrl } from "@/lib/integration/paths";
import { currentDemo } from "@/lib/integration/public-demo";

// /app/demo (AdMate integration, INTEGRATION.md): the website's /demo lands here.
// Signed in → your own interactive sample account. Not signed in → the shared,
// read-only public demo.
export async function GET() {
  const user = await getCurrentUser();
  let target: string | null = null;
  if (user && !user.readOnly) {
    const db = await getDb();
    const [own] = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(and(eq(workspaces.ownerId, user.id), eq(workspaces.isSample, true)))
      .orderBy(asc(workspaces.createdAt))
      .limit(1);
    target = own ? `/c/${own.id}` : "/";
  } else {
    const demo = await currentDemo();
    if (demo) target = `/c/${demo.id}`;
  }
  if (target) return Response.redirect(websiteUrl(`${BASE_PATH}${target}`), 307);
  return new Response(
    "<!doctype html><meta charset=utf-8><title>AdMate demo</title><body style=\"font-family:system-ui;padding:3rem;max-width:36rem\"><h1>The demo is being prepared</h1><p>Please try again in a few minutes. <a href=\"/\">Back to AdMate</a></p></body>",
    { status: 503, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "retry-after": "120" } },
  );
}
