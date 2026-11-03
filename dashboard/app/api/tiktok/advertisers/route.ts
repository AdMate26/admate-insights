import { requireTikTokUser, sameOrigin, tiktokFailure, tiktokJson } from "@/lib/tiktok/http";
import { deleteLink } from "@/lib/tiktok/store";
import { revalidatePath } from "next/cache";
import { createTikTokAccount, linkTikTokAdvertiser, tikTokAdvertiserLinks, tikTokAdvertisers } from "@/lib/tiktok/service";
import { tikTokSyncStatus } from "@/lib/tiktok/sync";

// Read-only list of the advertisers the signed-in person authorized (live from
// TikTok with their own token) and their links to their own ad accounts.
// POST links one advertiser to one of their ad accounts, or with
// {"createAccount": true} creates a new account of their own in the advertiser's
// currency and links it; DELETE removes a link.
const ID = /^\d{5,30}$/;
const WORKSPACE = /^[A-Za-z0-9_-]{1,64}$/;

export async function GET() {
  const guard = await requireTikTokUser();
  if (guard instanceof Response) return guard;
  try {
    const [advertisers, links, syncs] = await Promise.all([tikTokAdvertisers(guard.user.id), tikTokAdvertiserLinks(guard.user.id), tikTokSyncStatus(guard.user.id)]);
    return tiktokJson({
      advertisers,
      links: links.map((l) => ({ advertiserId: l.advertiserId, workspaceId: l.workspaceId, lastSync: syncs.find((s) => s.workspaceId === l.workspaceId && s.advertiserId === l.advertiserId) ?? null })),
    });
  } catch (error) {
    return tiktokFailure(error);
  }
}

export async function POST(request: Request) {
  const guard = await requireTikTokUser();
  if (guard instanceof Response) return guard;
  if (!sameOrigin(request)) return tiktokJson({ error: "forbidden" }, 403);
  const body = (await request.json().catch(() => null)) as { advertiserId?: unknown; workspaceId?: unknown; createAccount?: unknown } | null;
  const advertiserId = typeof body?.advertiserId === "string" ? body.advertiserId : "";
  if (body?.createAccount === true) {
    if (!ID.test(advertiserId)) return tiktokJson({ error: "bad_request" }, 400);
    try {
      const created = await createTikTokAccount(guard.user.id, advertiserId);
      revalidatePath("/", "layout");
      return tiktokJson({ ok: true, workspaceId: created.workspaceId });
    } catch (error) {
      return tiktokFailure(error);
    }
  }
  const workspaceId = typeof body?.workspaceId === "string" ? body.workspaceId : "";
  if (!ID.test(advertiserId) || !WORKSPACE.test(workspaceId)) return tiktokJson({ error: "bad_request" }, 400);
  try {
    await linkTikTokAdvertiser(guard.user.id, advertiserId, workspaceId);
    return tiktokJson({ ok: true });
  } catch (error) {
    return tiktokFailure(error);
  }
}

export async function DELETE(request: Request) {
  const guard = await requireTikTokUser();
  if (guard instanceof Response) return guard;
  if (!sameOrigin(request)) return tiktokJson({ error: "forbidden" }, 403);
  const advertiserId = new URL(request.url).searchParams.get("advertiserId") ?? "";
  if (!ID.test(advertiserId)) return tiktokJson({ error: "bad_request" }, 400);
  await deleteLink(guard.user.id, advertiserId);
  return tiktokJson({ ok: true });
}
