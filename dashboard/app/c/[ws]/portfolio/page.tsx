import { NoData } from "@/components/v5/NoData";
import { PageHead } from "@/components/v5/PageHead";
import { V5Page } from "@/components/v5/page";
import { pageData } from "@/components/v5/server";
import { Portfolio, type AcctSummary } from "@/components/v5/views/portfolio";
import { alertState } from "@/lib/data/alerts";
import { loadView, selection } from "@/lib/data/view";
import { listWorkspaces } from "@/lib/data/workspaces";

export const metadata = { title: "Portfolio" };

const PRIO_RANK: Record<string, number> = { high: 0, medium: 1, low: 2, monitor: 3 };
const OFF = ["far_off", "off_track", "worse"];

// Advanced: every ad account you own in one table, sorted by money at stake, and the
// high-priority problems across all of them, for the selected period.
export default async function PortfolioPage({ params, searchParams }: PageProps<"/c/[ws]/portfolio">) {
  const { ws } = await params;
  const { data, ask, sp } = await pageData(ws, searchParams);
  const accounts = await listWorkspaces();
  const sel = selection(sp);
  const all: AcctSummary[] = await Promise.all(
    accounts.map(async (w) => {
      const base = { id: w.id, name: w.name, industry: w.industry, country: w.country, currency: w.currency, isSample: w.isSample };
      const [x, st] = await Promise.all([loadView(w.id, sel), alertState(w.id)]);
      if (!x) return { ...base, data: null };
      const v = x.vm;
      const muted = new Set(st.config.muted);
      const open = (s: string) => s === "todo" || s === "in_review";
      const probs = v.problems.filter((d) => open(d.status) && !muted.has(d.detector));
      const high = probs.filter((d) => d.priority === "high");
      const atStake = probs.reduce((s, d) => s + (d.impact?.known ? d.impact.amount : 0), 0);
      const top = [...probs].sort((a, b) => PRIO_RANK[a.priority] - PRIO_RANK[b.priority] || (b.impact?.amount ?? 0) - (a.impact?.amount ?? 0))[0] ?? null;
      const goals = [...v.objectives].sort((a, b) => b.spend - a.spend);
      const main = goals[0] ?? null;
      const off = goals.filter((o) => OFF.includes(o.state)).length;
      const opps = v.opportunities.filter((d) => open(d.status) && !muted.has(d.detector)).length;
      const mainBad = main && (main.state === "far_off" || main.state === "worse");
      const tone = high.length || mainBad ? "bad" : probs.length || off ? "warn" : "good";
      const pick = (d: (typeof probs)[number]) => ({ key: d.key, title: d.title, where: d.where, priority: d.priority, bucket: d.bucket, kind: d.kind, impact: d.impact, confidence: d.confidence });
      return {
        ...base,
        data: {
          spend: v.spend,
          spendChange: v.spendChange,
          main: main ? { label: main.label, kpiShort: main.kpiShort, value: main.value, mode: main.mode, state: main.state, target: main.target } : null,
          goals: goals.length,
          off,
          probs: probs.length,
          high: high.map(pick),
          atStake,
          top: top ? pick(top) : null,
          opps,
          tone,
        },
      } satisfies AcctSummary;
    }),
  );
  if (!data) return <NoData title="Portfolio" />;
  return (
    <V5Page vm={data.vm} page="portfolio" askAvailable={ask}>
      <PageHead title="Portfolio" eyebrow={`${accounts.length} ${accounts.length === 1 ? "account" : "accounts"}`} />
      <div className="page">
        <Portfolio accounts={all.sort((a, b) => (b.data?.atStake ?? -1) - (a.data?.atStake ?? -1))} />
      </div>
    </V5Page>
  );
}
