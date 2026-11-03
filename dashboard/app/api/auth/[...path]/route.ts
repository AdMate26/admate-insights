import { allowedNeonAuthRequest } from "@/lib/auth/neon";
import { neonAuthHandler } from "@/lib/auth/neon-relay";
import { authProvider } from "@/lib/auth/provider";
import { publicOrigin } from "@/lib/integration/paths";

// Neon Auth relay (TikTok staging only, lib/auth/neon.ts). The website's sign-in
// page calls these through /app/api/auth/*; Neon's SDK forwards them to Neon
// Auth and sets its HttpOnly session cookies on our own origin. With Supabase
// (production) or without Neon configuration, every path is 404.

type Context = { params: Promise<{ path: string[] }> };

const noStore = { "cache-control": "no-store" };
const notFound = () => Response.json({ error: "not_found" }, { status: 404, headers: noStore });

async function handle(request: Request, context: Context): Promise<Response> {
  if (authProvider() !== "neon") return notFound();
  const api = neonAuthHandler();
  if (!api) return notFound();
  const { path } = await context.params;
  if (!allowedNeonAuthRequest(request.method, path)) return notFound();
  if (request.method === "POST") {
    // Only the website itself may sign in or out (no cross-site requests).
    const origin = publicOrigin();
    if (!origin || request.headers.get("origin") !== origin) return Response.json({ error: "forbidden" }, { status: 403, headers: noStore });
    // Codes are only ever sent for signing in (not password resets or email changes).
    if (path.join("/") === "email-otp/send-verification-otp") {
      const body = (await request.clone().json().catch(() => null)) as { type?: unknown } | null;
      if (body?.type !== "sign-in") return Response.json({ error: "bad_request" }, { status: 400, headers: noStore });
    }
    return api.POST(request, context);
  }
  return api.GET(request, context);
}

export { handle as GET, handle as POST };
