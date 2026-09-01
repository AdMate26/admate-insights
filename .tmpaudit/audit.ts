import { DemoTikTokDataProvider } from "../src/lib/tiktok/demo-provider";
import { normalizeRows } from "../src/lib/tiktok/normalize";
import { runAnalysis } from "../src/lib/analysis/engine";
const p = new DemoTikTokDataProvider();
const raw = await p.fetchDailyPerformance({ days: 28 });
const rows = normalizeRows(p, raw);
for (const f of runAnalysis(rows).findings)
  console.log([f.campaignName, f.statusLabel, f.signalLabel, f.confidence, f.statusReason.slice(0,60)].join(" | "));
