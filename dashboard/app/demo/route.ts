import { BASE_PATH } from "@/lib/integration/paths";
import { PUBLIC_DEMO_WORKSPACE } from "@/lib/integration/public-demo";

export function GET() {
  return new Response(null, {
    status: 307,
    headers: {
      location: `${BASE_PATH}/c/${PUBLIC_DEMO_WORKSPACE}`,
      "cache-control": "private, no-store",
    },
  });
}
