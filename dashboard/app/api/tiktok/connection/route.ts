import { requireTikTokUser, sameOrigin, tiktokFailure, tiktokJson } from "@/lib/tiktok/http";
import { disconnectTikTok, tikTokConnectionStatus } from "@/lib/tiktok/service";

// The signed-in person's TikTok connection: status (GET) or disconnect (DELETE).
export async function GET() {
  const guard = await requireTikTokUser();
  if (guard instanceof Response) return guard;
  return tiktokJson(await tikTokConnectionStatus(guard.user.id));
}

export async function DELETE(request: Request) {
  const guard = await requireTikTokUser();
  if (guard instanceof Response) return guard;
  if (!sameOrigin(request)) return tiktokJson({ error: "forbidden" }, 403);
  try {
    await disconnectTikTok(guard.user.id);
    return tiktokJson({ ok: true });
  } catch (error) {
    return tiktokFailure(error);
  }
}
