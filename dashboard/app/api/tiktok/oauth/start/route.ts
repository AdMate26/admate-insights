import { requireTikTokUser, sameOrigin, tiktokFailure, tiktokJson } from "@/lib/tiktok/http";
import { startTikTokConnection } from "@/lib/tiktok/service";

// Starts TikTok authorization for the signed-in person: returns the consent URL.
export async function POST(request: Request) {
  const guard = await requireTikTokUser();
  if (guard instanceof Response) return guard;
  if (!sameOrigin(request)) return tiktokJson({ error: "forbidden" }, 403);
  try {
    return tiktokJson({ url: await startTikTokConnection(guard.user.id, guard.sessionToken) });
  } catch (error) {
    return tiktokFailure(error);
  }
}
