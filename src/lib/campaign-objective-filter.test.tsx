import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CampaignsView } from "../components/admate/views/CampaignsView";
import { analyzeCampaigns, PERFORMANCE_ORDER } from "./analysis/engine";
import { getDemoCampaignsForBrand } from "./analysis/demo";
import { BRANDS, brandPlatforms } from "./brands";
import type { AdMateAnalysis } from "./admate.functions";
import { filterCampaignObjectives } from "./campaign-objective-filter";

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

for (const brand of BRANDS) {
  const platforms = brandPlatforms(brand.id);
  const analyses: AdMateAnalysis[] = platforms.map((platform) => ({
    ...analyzeCampaigns(getDemoCampaignsForBrand(brand.id, platform)),
    brand: brand.id,
    brandLabel: brand.label,
    platform,
    provider: "demo",
    providerLabel: "Demo",
    modeLabel: "Synthetic demo",
    aiStatus: "failed",
    aiError: null,
  }));

  for (const analysis of analyses) {
    test(`${brand.label} / ${analysis.platform}: every objective scopes tables, summary, spend and risk together`, () => {
      const original = JSON.stringify(analysis);
      const all = filterCampaignObjectives(analysis.findings, undefined);
      expect(all.findings).toBe(analysis.findings);
      expect(all.options.map((o) => o.id).sort()).toEqual(
        [...new Set(analysis.findings.map((f) => f.objectiveFamily))].sort(),
      );
      const render = (objective: string | undefined) =>
        renderToStaticMarkup(
          <CampaignsView
            analyses={analyses}
            brand={brand.id}
            platform={analysis.platform}
            platforms={platforms}
            objective={objective}
            onSelectObjective={() => {}}
            onSelectPlatform={() => {}}
          />,
        );
      const fullHtml = render(undefined);
      expect(render("invalid-objective")).toBe(fullHtml);
      for (const option of all.options) {
        const expected = analysis.findings.filter((f) => f.objectiveFamily === option.id);
        const selected = filterCampaignObjectives(analysis.findings, option.id);
        expect(selected.findings).toEqual(expected);
        expect(selected.options).toEqual(all.options);
        const html = render(option.id);
        expect(html.match(/class="camp-row"/g) ?? []).toHaveLength(expected.length);
        expect(html.match(/Campaign Objective:/g) ?? []).toHaveLength(1);
        expect(html.match(/<div class="tabs"[\s\S]*?<\/div>/)?.[0]).toBe(
          fullHtml.match(/<div class="tabs"[\s\S]*?<\/div>/)?.[0],
        );
        for (const performance of PERFORMANCE_ORDER) {
          const count = expected.filter((f) => f.performance === performance).length;
          expect(html).toContain(`<b>${count}</b><span>${performance}</span>`);
        }
        expect(html).toContain(
          `<b>${money(expected.reduce((s, f) => s + f.spend, 0))}</b><span>spent in 7 days</span>`,
        );
        const risky = expected.filter((f) => f.performance === "Low" && f.exposure.amount > 0);
        if (risky.length) {
          expect(html).toContain(
            `${money(risky.reduce((s, f) => s + f.exposure.amount, 0))} · ${risky.length} campaign`,
          );
        } else expect(html).toContain("Nothing below target");
        expect(html.match(/class="risk-item"/g) ?? []).toHaveLength(Math.min(6, risky.length));
      }
      expect(JSON.stringify(analysis)).toBe(original);
    });
  }
}

test("empty or unavailable objectives safely fall back to All objectives", () => {
  expect(filterCampaignObjectives([], "sales")).toEqual({
    options: [],
    objective: undefined,
    findings: [],
  });
});
