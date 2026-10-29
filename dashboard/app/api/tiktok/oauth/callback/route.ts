import { websiteUrl } from "@/lib/integration/paths";
import { NO_STORE, requireTikTokUser } from "@/lib/tiktok/http";
import { completeTikTokConnection, TikTokConnectError } from "@/lib/tiktok/service";

// TikTok sends the browser back here with ?code=&state=. The code and state are
// never shown again: the person is redirected to the TikTok page with a fixed
// result label only.
function back(result: string) {
  return new Response(null, { status: 303, headers: { ...NO_STORE, location: websiteUrl(`/app/connect/tiktok?result=${result}`) } });
}

export async function GET(request: Request) {
  const guard = await requireTikTokUser();
  if (guard instanceof Response) return guard;
  const q = new URL(request.url).searchParams;
  if (q.get("error")) return back("cancelled");
  try {
    await completeTikTokConnection(guard.user.id, guard.sessionToken, q.get("state") ?? "", q.get("code") ?? "");
    return back("connected");
  } catch (error) {
    return back(error instanceof TikTokConnectError ? error.code : "provider");
  }
}
