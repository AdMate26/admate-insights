"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useV5 } from "../ctx";
import { Empty, Src } from "../bits";
import { n0, pct } from "../core";
import { GoLink } from "../rows";
import { HOW_TO_EXPORT } from "@/lib/analysis/audience";
import type { GeographyData } from "@/lib/data/geography";

// Geography (laid out like Madgicx's): where the money went by location across all
// campaigns, as a share strip and a ranked list, then how each location did for one goal.

const VCH: Record<string, string> = { best: "Best value", costly: "Costly", average: "As expected", small: "Too little data" };
const COLORS = ["var(--cat1)", "var(--cat2)", "var(--cat3)", "var(--cat4)", "var(--cat5)", "var(--cat6)"];

export function Geography({ geo }: { geo: GeographyData }) {
  const { f } = useV5();
  const router = useRouter();
  const path = usePathname();
  const search = useSearchParams();
  const setTarget = (t: string) => {
    const q = new URLSearchParams(search.toString());
    q.set("t", t);
    router.push(`${path}?${q}`, { scroll: false });
  };
  const howto = (
    <details className="small">
      <summary>How to get this from your own account</summary>
      <ul>
        {HOW_TO_EXPORT.location.map((s) => (
          <li key={s}>{s}</li>
        ))}
        <li>Upload it under Upload report; AdMate links it to your campaigns by name.</li>
      </ul>
    </details>
  );
  if (!geo.goal.targets.objectives.length) return <Empty title="No spend in this period" text="Pick another period above." />;
  if (geo.unavailable)
    return (
      <>
        <div className="empty">
          <b>No location export yet</b>
          Export your results broken down by country, region or city from your ads manager and upload it. AdMate then shows where your money goes.
          <div style={{ marginTop: 10 }}>
            <GoLink page="upload" className="link">
              Upload a location export →
            </GoLink>
          </div>
        </div>
        {howto}
      </>
    );
  const top = geo.places.slice(0, 6);
  const rest = geo.places.slice(6);
  const restShare = rest.reduce((s, p) => s + p.share, 0);
  const max = geo.places[0]?.share ?? 1;
  const g = geo.goal.data;
  const k = (x: number | null) => (g ? f.kpi(x, g.mode) : "—");
  const source = geo.simulated ? (
    <span className="src ai" title="The sample has no location export, so this split is simulated from its real totals. With your own location export, this shows your real numbers.">
      Simulated sample split
    </span>
  ) : (
    <Src k="data" />
  );
  return (
    <>
      <section className="section geo" aria-labelledby="geo-h">
        <header>
          <h2 id="geo-h">Where your money went</h2>
          <span className="hint">
            {source} {geo.basis}
          </span>
        </header>
        <p className="geo-say">
          <b>{pct(geo.places[0].share)}</b> of your <span className="num">{f.money(geo.total)}</span> went to <b>{geo.places[0].name}</b>
          {geo.places[1] ? (
            <>
              , then <b>{geo.places[1].name}</b> ({pct(geo.places[1].share)})
            </>
          ) : null}
          . Spread over {geo.places.length} {geo.places.length === 1 ? "location" : "locations"}.
        </p>
        <div className="geo-strip" role="img" aria-label={`Share of spend: ${top.map((p) => `${p.name} ${pct(p.share)}`).join(", ")}${rest.length ? `, other ${pct(restShare)}` : ""}`}>
          {top.map((p, i) => (
            <i key={p.name} style={{ width: `${p.share * 100}%`, background: COLORS[i] }} title={`${p.name}: ${pct(p.share)}`} />
          ))}
          {rest.length > 0 && <i style={{ width: `${restShare * 100}%`, background: "var(--cat7)" }} title={`Other: ${pct(restShare)}`} />}
        </div>
        <div className="geo-key">
          {top.map((p, i) => (
            <span key={p.name}>
              <i style={{ background: COLORS[i] }} /> {p.name}
            </span>
          ))}
          {rest.length > 0 && (
            <span>
              <i style={{ background: "var(--cat7)" }} /> {rest.length} more
            </span>
          )}
        </div>
        <div className="geo-list">
          {geo.places.map((p, i) => (
            <div key={p.name} className="geo-row">
              <span className="num geo-n">{i + 1}</span>
              <span className="geo-name">{p.name}</span>
              <span className="geo-bar">
                <i style={{ width: `${(p.share / max) * 100}%`, background: i < 6 ? COLORS[i] : "var(--cat7)" }} />
              </span>
              <span className="num">{f.money(p.spend)}</span>
              <span className="num muted">{pct(p.share)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="section" aria-labelledby="geo2-h">
        <header>
          <h2 id="geo2-h">How each location did</h2>
          <label className="toggle" style={{ marginLeft: "auto" }}>
            For{" "}
            <select className="sel" aria-label="Campaigns" value={geo.goal.target} onChange={(e) => setTarget(e.target.value)}>
              {geo.goal.targets.objectives.map((o) => (
                <optgroup key={o.objective} label={o.label}>
                  <option value={`obj:${o.objective}`}>All {o.label.toLowerCase()} campaigns</option>
                  {geo.goal.targets.campaigns
                    .filter((c) => c.objective === o.objective)
                    .map((c) => (
                      <option key={c.id} value={`c:${c.id}`}>
                        {c.name}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>
        </header>
        {!g || g.unavailable ? (
          <Empty title="No location results for these campaigns" text="Pick other campaigns, or upload a location export that includes them." />
        ) : (
          <>
            <p className="small-note">
              {g.objectiveLabel} · {n0(g.results)} {g.resultLabel} · average {g.kpiShort} {k(g.avg)}. Results only add up within one goal, so this part is per goal.
            </p>
            <div className="tablewrap">
              <table className="tbl dense" style={{ minWidth: 720 }}>
                <thead>
                  <tr>
                    <th>Location</th>
                    <th className="r">Spend</th>
                    <th className="r">Share of spend</th>
                    <th className="r">{g.resultLabel[0].toUpperCase() + g.resultLabel.slice(1)}</th>
                    <th className="r">Share of {g.resultLabel}</th>
                    <th className="r">{g.kpiShort}</th>
                    <th>Verdict</th>
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((r) => (
                    <tr key={r.name}>
                      <td>
                        <b style={{ fontWeight: 500 }}>{r.name}</b>
                      </td>
                      <td className="r num">{f.money(r.spend)}</td>
                      <td className="r num">{pct(r.spendShare)}</td>
                      <td className="r num">{n0(r.results)}</td>
                      <td className="r num">{pct(r.resultShare)}</td>
                      <td className="r num">{k(r.cost)}</td>
                      <td>
                        <span className={`vchip ${r.verdict}`}>{VCH[r.verdict]}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="caution">A location is only called best value or costly when the difference is statistically clear. Ad platforms already shift delivery toward places that respond, so test changes in one ad set first.</p>
          </>
        )}
        {howto}
      </section>
    </>
  );
}
