import { canAccessSample } from "@/lib/access/policy";
import { getCurrentUser } from "@/lib/auth/session";
import { listWorkspaces } from "@/lib/data/workspaces";
import { BASE_PATH, websiteUrl } from "@/lib/integration/paths";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.redirect(websiteUrl("/home"), 307);
  if (!canAccessSample(user.id)) return new Response(null, { status: 404, headers: { "cache-control": "no-store" } });

  const sample = (await listWorkspaces()).find((workspace) => workspace.isSample);
  const path = sample ? `${BASE_PATH}/c/${sample.id}` : BASE_PATH;
  return new Response(null, { status: 307, headers: { location: websiteUrl(path), "cache-control": "no-store" } });
}
