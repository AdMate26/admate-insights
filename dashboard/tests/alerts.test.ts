import { describe, expect, it } from "vitest";
import { analyze } from "@/lib/analysis/analyze";
import { ALERT_DEFAULT, alertCount, alertDigest, digestHtml, alertLines, alertsFired, autoAlerts, campaignTarget, parseAlertConfig, ruleTemplates, telegramMessage, type Rule } from "@/lib/analysis/alerts";
import { viewModel } from "@/lib/analysis/viewModel";
import { addDays } from "@/lib/dates";
import { makeFmt } from "@/lib/fmt5";
import { SAMPLE_ACCOUNT } from "@/lib/sample/generate";
import { END, inputFor } from "./helpers";

const v = viewModel(analyze(inputFor(SAMPLE_ACCOUNT, {}, true)), addDays(END, -89));
const f = makeFmt("USD");
const rule = (r: Partial<Rule>): Rule => ({ id: "r", metric: "frequency", op: "above", value: 3, scope: "all", on: true, ...r });

describe("alerts", () => {
  it("bad settings fall back to the defaults", () => {
    expect(parseAlertConfig(null)).toEqual(ALERT_DEFAULT);
    expect(parseAlertConfig({ sens: "loud", pct: 9000, on: "yes", muted: ["cpm_spike", 4] })).toEqual({ ...ALERT_DEFAULT, muted: ["cpm_spike"] });
    expect(parseAlertConfig({ sens: "pct", pct: 35.4, good: true }).pct).toBe(35);
  });

  it("automatic alerts: the sample has the six the prototype shows, worst first", () => {
    const auto = autoAlerts(v, ALERT_DEFAULT, {});
    expect(auto.filter((a) => !a.good)).toHaveLength(6);
    const w = auto.map((a) => a.w);
    expect(w).toEqual([...w].sort((x, y) => y - x));
    expect(autoAlerts(v, { ...ALERT_DEFAULT, on: false }, {})).toEqual([]);
    // Good news only when asked for.
    expect(autoAlerts(v, ALERT_DEFAULT, {}).some((a) => a.good)).toBe(false);
    expect(autoAlerts(v, { ...ALERT_DEFAULT, good: true }, {}).some((a) => a.good)).toBe(true);
  });

  it("a campaign's own target wins, but only in its own unit", () => {
    const r = v.levels.campaign.find((x) => x.mode === "cost")!;
    expect(campaignTarget(r, v, { [r.id]: { mode: "cost", value: 1.5 } })).toEqual({ value: 1.5, own: true });
    expect(campaignTarget(r, v, { [r.id]: { mode: "roas", value: 3 } })?.own ?? false).toBe(false);
  });

  it("your own KPI alerts fire on the campaigns in their scope", () => {
    const hi = Math.max(...v.levels.campaign.map((r) => r.spend));
    expect(alertsFired(v, [rule({ metric: "spend", op: "above", value: hi - 1 })])).toHaveLength(1);
    expect(alertsFired(v, [rule({ metric: "spend", op: "above", value: hi - 1, on: false })])).toHaveLength(0);
    const sales = alertsFired(v, [rule({ metric: "spend", op: "above", value: 0, scope: "obj:sales" })]);
    expect(sales.every((x) => x.r.objective === "sales")).toBe(true);
    expect(ruleTemplates(v).map((t) => t.name)).toContain("Main result 30%+ worse");
  });

  it("the badge and the Telegram message agree with the lists", () => {
    const rules = [rule({ metric: "spend", op: "above", value: 0 })];
    const n = alertCount(v, ALERT_DEFAULT, rules, {});
    const lines = alertLines(v, ALERT_DEFAULT, rules, {}, f);
    expect(lines.filter((l) => !l.startsWith("Good news"))).toHaveLength(n);
    const msg = telegramMessage("Lotus Skincare", v, lines);
    expect(msg.startsWith("AdMate · Lotus Skincare · ")).toBe(true);
    expect(msg).toContain(`…and ${lines.length - 6} more in AdMate.`);
    expect(telegramMessage("X", v, [])).toContain("No alerts");
  });

  it("the Telegram digest: headline first, grouped by urgency, at most five, safe HTML", () => {
    const d = alertDigest("Lotus <Skincare>", v, ALERT_DEFAULT, [], {}, f);
    expect(d.headline).toMatch(/campaigns? needs? attention$/);
    expect(d.groups.flatMap((g) => g.items).length).toBeLessThanOrEqual(5);
    const sev = d.groups.map((g) => g.sev);
    expect(sev).toEqual([...sev].sort((a, b) => ["urgent", "watch", "good"].indexOf(a) - ["urgent", "watch", "good"].indexOf(b)));
    const html = digestHtml(d);
    expect(html.split("\n")[0]).toContain("Lotus &lt;Skincare&gt;");
    expect(html).not.toMatch(/<(?!\/?[bi]>)/);
    // One block per campaign, even when it is off both its past and its target.
    const names = d.groups.flatMap((g) => g.items.map((i) => i.name));
    expect(new Set(names).size).toBe(names.length);
    expect(alertDigest("X", v, { ...ALERT_DEFAULT, on: false }, [], {}, f).allClear).toBe(true);
  });

  it("the digest also names the campaigns doing great enough to consider more budget", () => {
    expect(v.great.length).toBeGreaterThan(0);
    const d = alertDigest("Lotus", v, { ...ALERT_DEFAULT, good: true }, [], {}, f);
    expect(d.scale.length).toBeGreaterThan(0);
    expect(d.scale.length).toBeLessThanOrEqual(2);
    expect(d.scale[0].name).toBe(v.great[0].campaign);
    // Listed once: a budget candidate is not repeated as good news.
    const good = d.groups.filter((g) => g.sev === "good").flatMap((g) => g.items.map((i) => i.name));
    for (const g of d.scale) expect(good).not.toContain(g.name);
    expect(digestHtml(d)).toContain("CONSIDER MORE BUDGET");
    expect(d.sub).toContain("to grow");
    expect(alertDigest("X", v, { ...ALERT_DEFAULT, on: false }, [], {}, f).scale).toEqual([]);
  });
});
