import "server-only";
import { headers } from "next/headers";
import { PUBLIC_DEMO_HEADER } from "./public-demo";

// proxy.ts strips browser-supplied values and marks only the reserved demo routes.
export async function isPublicDemoRequest(): Promise<boolean> {
  let h: Awaited<ReturnType<typeof headers>>;
  try {
    h = await headers();
  } catch {
    // Background jobs and local scripts have no request.
    return false;
  }
  return h.get(PUBLIC_DEMO_HEADER) === "1" && !h.has("next-action");
}
