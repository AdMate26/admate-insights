import { DemoTikTokDataProvider } from "../src/lib/tiktok/demo-provider";
import { loadNormalizedDailyRows } from "../src/lib/tiktok/normalize";
import { runAnalysis } from "../src/lib/analysis/engine";
const p = new DemoTikTokDataProvider();
const rows = await loadNormalizedDailyRows(p, 28);
for (const f of runAnalysis(rows).findings)
  console.log([f.campaignName, f.statusLabel, f.signalLabel, f.confidence, f.statusReason.slice(0,55)].join(" | "));
