import { revalidatePath } from "next/cache";
import { requireTikTokUser, sameOrigin, tiktokFailure, tiktokJson } from "@/lib/tiktok/http";
import { syncTikTokAdvertiser } from "@/lib/tiktok/sync";

// Sync Now: imports the last 30 complete days of one linked advertiser into its
// linked ad account (read-only at TikTok). Answers with counts and dates only.
const ID = /^\d{5,30}$/;

export async function POST(request: Request) {
  const guard = await requireTikTokUser();
  if (guard instanceof Response) return guard;
  if (!sameOrigin(request)) return tiktokJson({ error: "forbidden" }, 403);
  const body = (await request.json().catch(() => null)) as { advertiserId?: unknown } | null;
  const advertiserId = typeof body?.advertiserId === "string" ? body.advertiserId : "";
  if (!ID.test(advertiserId)) return tiktokJson({ error: "bad_request" }, 400);
  try {
    const result = await syncTikTokAdvertiser(guard.user.id, advertiserId);
    if (result.outcome === "ok") revalidatePath("/", "layout");
    return tiktokJson(result);
  } catch (error) {
    return tiktokFailure(error);
  }
}
