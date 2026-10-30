import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireTikTokUser, sameOrigin, tiktokFailure, tiktokJson } from "@/lib/tiktok/http";
import { startTikTokSync, tikTokSyncStatus } from "@/lib/tiktok/sync";

// Sync Now: imports the last 30 complete days of one linked advertiser into its
// linked ad account (read-only at TikTok).
//
// POST answers within seconds: it runs every check and takes the account's sync
// lock, then the reading and writing continue in the background (`after`), so no
// request is held open for minutes behind the website's /app relay. The page
// polls GET for the outcome. Answers hold counts and dates only.
export const maxDuration = 300; // Vercel's limit for the background run; the sync itself stops at 3 minutes

const ID = /^\d{5,30}$/;

export async function POST(request: Request) {
  const guard = await requireTikTokUser();
  if (guard instanceof Response) return guard;
  if (!sameOrigin(request)) return tiktokJson({ error: "forbidden" }, 403);
  const body = (await request.json().catch(() => null)) as { advertiserId?: unknown } | null;
  const advertiserId = typeof body?.advertiserId === "string" ? body.advertiserId : "";
  if (!ID.test(advertiserId)) return tiktokJson({ error: "bad_request" }, 400);
  try {
    const job = await startTikTokSync(guard.user.id, advertiserId);
    after(async () => {
      try {
        const result = await job.run();
        if (result.outcome === "ok") revalidatePath("/", "layout");
      } catch {
        /* recorded by the run itself (outcome "failed" with a fixed error code) */
      }
    });
    return tiktokJson({ started: true, window: job.window }, 202);
  } catch (error) {
    return tiktokFailure(error);
  }
}

export async function GET(request: Request) {
  const guard = await requireTikTokUser();
  if (guard instanceof Response) return guard;
  const advertiserId = new URL(request.url).searchParams.get("advertiserId") ?? "";
  if (!ID.test(advertiserId)) return tiktokJson({ error: "bad_request" }, 400);
  const status = (await tikTokSyncStatus(guard.user.id)).find((s) => s.advertiserId === advertiserId) ?? null;
  return tiktokJson({ status });
}
