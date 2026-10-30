import { requireTikTokUser, sameOrigin, tiktokFailure, tiktokJson } from "@/lib/tiktok/http";
import { startTikTokConnection } from "@/lib/tiktok/service";

// Starts TikTok authorization for the signed-in person: returns the consent URL.
// In the self-service beta the body must carry {"consent": true} (the notice on
// the Connect page was accepted).
export async function POST(request: Request) {
  const guard = await requireTikTokUser();
  if (guard instanceof Response) return guard;
  if (!sameOrigin(request)) return tiktokJson({ error: "forbidden" }, 403);
  try {
    const body = (await request.json().catch(() => null)) as { consent?: unknown } | null;
    return tiktokJson({ url: await startTikTokConnection(guard.user.id, guard.sessionToken, { consent: body?.consent === true }) });
  } catch (error) {
    return tiktokFailure(error);
  }
}
