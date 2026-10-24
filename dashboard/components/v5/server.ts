import "server-only";
import { ASK_AVAILABLE } from "@/lib/ai/client";
import { alertState } from "@/lib/data/alerts";
import { getLevel } from "@/lib/data/settings";
import { badges, forBrowser, loadView, selection } from "@/lib/data/view";
import { DEFAULT_LEVEL } from "@/lib/levels";

// What every v5 account page loads: the person's view, the page-ready analysis for
// the selected period and the account's alert settings.
export async function pageData(ws: string, searchParams: Promise<Record<string, string | string[] | undefined>>) {
  const sp = await searchParams;
  const [level, full, st] = await Promise.all([getLevel().then((l) => l ?? DEFAULT_LEVEL), loadView(ws, selection(sp)), alertState(ws)]);
  // Badges count from the full view; the page gets the lighter one.
  const data = full ? { a: full.a, vm: forBrowser(full.vm), alerts: badges(full.vm, st).alerts } : null;
  return { level, data, st, sp, ask: ASK_AVAILABLE };
}
