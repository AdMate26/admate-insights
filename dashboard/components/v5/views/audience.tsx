"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useV5 } from "../ctx";
import { usePage } from "../page";
import { Empty, Src, T } from "../bits";
import { higher, n0, pct } from "../core";
import { AUDIENCE_TABS, audienceAdvice, HOW_TO_EXPORT, type AudienceBreakdown } from "@/lib/analysis/audience";
import type { AudienceData } from "@/lib/data/audience";
import { GoLink } from "../rows";

// Audience insight (prototype audienceHtml) and, for Intermediate, Audiences &
// creatives with ads compared inside their ad set (prototype creativesHtml).

const VCH: Record<string, string> = { best: "Best value", costly: "Costly", average: "As expected", small: "Too little data" };

function useParam() {
  const router = useRouter();
  const path = usePathname();
  const search = useSearchParams();
  return (patch: Record<string, string>) => {
    const q = new URLSearchParams(search.toString());
    for (const [k, v] of Object.entries(patch)) q.set(k, v);
    q.delete("open");
    router.push(`${path}?${q}`, { scroll: false });
  };
}

export function AudienceInsight({ aud }: { aud: AudienceData }) {
  const { f, isAdv } = useV5();
  const set = useParam();
  const a = aud.data;
  const bd = aud.bd;
  if (!aud.targets.objectives.length) return <Empty title="No spend in this period" text="Pick another period above." />;
  const controls = (
    <div className="aud-controls">
      <label className="toggle">
        Campaigns{" "}
        <select className="sel" aria-label="Campaigns" value={aud.target} onChange={(e) => set({ t: e.target.value })}>
          {aud.targets.objectives.map((o) => (
            <optgroup key={o.objective} label={o.label}>
              <option value={`obj:${o.objective}`}>All {o.label.toLowerCase()} campaigns</option>
              {aud.targets.campaigns
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
      <div className="filters" role="group" aria-label="Breakdown">
        {AUDIENCE_TABS.map(([k, n]) => (
          <button key={k} type="button" aria-pressed={k === bd} onClick={() => set({ bd: k })}>
            {n}
          </button>
        ))}
      </div>
    </div>
  );
  const howto = (
    <details className="small">
      <summary>How to get this from your own account</summary>
      <ul>
        {HOW_TO_EXPORT[bd].map((s) => (
          <li key={s}>{s}</li>
        ))}
        <li>Upload it under Upload report; AdMate links it to your campaigns by name.</li>
      </ul>
    </details>
  );
  if (!a)
    return (
      <>
        {controls}
        <Empty title="No data" text="Pick other campaigns." />
      </>
    );
  const k = (x: number | null) => f.kpi(x, a.mode);
  if (a.unavailable)
    return (
      <>
        {controls}
        <div className="empty">
          <b>{bd === "weekday" ? "Day of week needs an export with a daily breakdown" : `No ${AUDIENCE_TABS.find(([x]) => x === bd)![1].toLowerCase()} export for these campaigns yet`}</b>
          Export a breakdown from your ads manager and upload it under Upload report. Day of week works with your normal daily export.
          <div style={{ marginTop: 10 }}>
            <GoLink page="upload" className="link">
              Upload a breakdown export →
            </GoLink>
          </div>
        </div>
        {howto}
      </>
    );
  const best = a.rows.filter((r) => r.verdict === "best").sort((x, y) => (y.index ?? 0) - (x.index ?? 0)).slice(0, 2);
  const costly = a.rows.filter((r) => r.verdict === "costly").sort((x, y) => (x.index ?? 0) - (y.index ?? 0)).slice(0, 2);
  const maxShare = Math.max(...a.rows.map((r) => Math.max(r.spendShare, r.resultShare)), 0.01);
  return (
    <>
      {controls}
      <div className="aud-basis">
        <span>
          <b style={{ color: "var(--fg)", fontWeight: 500 }}>{a.objectiveLabel}</b> · {n0(a.results)} {a.resultLabel} · {f.money(a.spend)} · average {a.kpiShort} {k(a.avg)}
        </span>
        <span>
          {a.simulated ? (
            <span className="src ai" title="The sample has no breakdown export, so this split is simulated from its real totals. With your own breakdown export, this shows your real numbers.">
              Simulated sample split
            </span>
          ) : (
            <Src k="data" />
          )}{" "}
          {a.basis}
        </span>
      </div>
      {best.length || costly.length ? (
        <div className="insights">
          {[...best.map((r) => ["best", r] as const), ...costly.map((r) => ["costly", r] as const)].map(([kind, r]) => (
            <div key={kind + r.name} className={`icard ${kind}`}>
              <span>
                <span className={`vchip ${kind}`}>{kind === "best" ? "Best value" : "Costly"}</span> <Src k="read" />
              </span>
              <b style={{ fontWeight: 500 }}>
                {r.name}: {kind === "best" ? "best value" : "costly"}
              </b>
              <p>
                {r.name} brought {pct(r.resultShare)} of {a.resultLabel} on {pct(r.spendShare)} of the spend ({a.kpiShort} {k(r.cost)} vs {k(a.avg)} on average).
              </p>
              <p className="do">
                <b style={{ fontWeight: 500, color: "var(--fg)" }}>Test next:</b> {audienceAdvice(bd, r.name, kind)}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="empty">No group stands out clearly: every group gets about the results you’d expect for its share of spend.</p>
      )}
      <Visual bd={bd} a={a} />
      <div className="segs">
        <div className="segrow head">
          <span className="label">Group</span>
          <span className="label">Share of spend vs share of {a.resultLabel}</span>
          <span className="label">Cost</span>
          <span className="label">Verdict</span>
        </div>
        {a.rows.map((r) => (
          <div key={r.name} className="segrow">
            <span>
              <b style={{ fontWeight: 500 }}>{r.name}</b>
              <br />
              <span className="small-note">
                {n0(r.results)} {a.resultLabel} · {f.money(r.spend)}
                {isAdv && r.index != null ? ` · index ${r.index.toFixed(2)} · z ${r.z.toFixed(1)}` : ""}
              </span>
            </span>
            <span className="segbars">
              <div>
                <span>Spend</span>
                <span className="track">
                  <i className="sp" style={{ width: `${(r.spendShare / maxShare) * 100}%` }} />
                </span>
                <span className="num">{pct(r.spendShare)}</span>
              </div>
              <div>
                <span>{a.resultLabel.split(" ")[0]}</span>
                <span className="track">
                  <i className="rs" style={{ width: `${(r.resultShare / maxShare) * 100}%` }} />
                </span>
                <span className="num">{pct(r.resultShare)}</span>
              </div>
            </span>
            <span className="num">
              {a.kpiShort} {k(r.cost)}
            </span>
            <span>
              <span className={`vchip ${r.verdict}`}>{VCH[r.verdict]}</span>
            </span>
          </div>
        ))}
      </div>
      <p className="caution">Ad platforms already shift delivery toward the people who respond, so a “best value” group may simply be where the platform is doing well. Test changes in one ad set first. A group is only called best or costly when the difference is statistically clear.</p>
      {howto}
    </>
  );
}

function Visual({ bd, a }: { bd: AudienceBreakdown; a: NonNullable<AudienceData["data"]> }) {
  const { f } = useV5();
  const k = (x: number | null) => f.kpi(x, a.mode);
  if (bd === "age_gender") {
    const parsed = a.rows.map((x) => ({ x, m: /^(Women|Men|Unknown gender) (.+)$/.exec(x.name) })).filter((p) => p.m);
    if (parsed.length < 2) return null;
    const ages = [...new Set(parsed.map((p) => p.m![2]))].sort();
    const genders = ["Women", "Men", "Unknown gender"].filter((g) => parsed.some((p) => p.m![1] === g));
    // A combined group ("Men 45+") covers the older ages it includes.
    const find = (g: string, age: string) =>
      parsed.find((p) => p.m![1] === g && p.m![2] === age)?.x ??
      parsed.find((p) => p.m![1] === g && p.m![2].endsWith("+") && parseInt(p.m![2]) <= parseInt(age))?.x;
    const color = (r?: (typeof a.rows)[number]) => {
      if (!r || r.index == null || r.index <= 0) return "var(--surface-2)";
      const kk = Math.max(-1, Math.min(1, Math.log(r.index) / Math.log(2)));
      return kk >= 0 ? `color-mix(in srgb, var(--good) ${Math.round(15 + 70 * kk)}%, var(--bg))` : `color-mix(in srgb, var(--hi) ${Math.round(15 + 70 * -kk)}%, var(--bg))`;
    };
    const cols = { gridTemplateColumns: `70px repeat(${ages.length},1fr)` };
    return (
      <div className="chartbox">
        <span className="title">Cost per result by age and gender</span>
        <div className="heat">
          <div className="hrowx" style={cols}>
            <span />
            {ages.map((x) => (
              <span key={x} className="small-note" style={{ textAlign: "center" }}>
                {x}
              </span>
            ))}
          </div>
          {genders.map((g) => (
            <div key={g} className="hrowx" style={cols}>
              <span className="small-note">{g}</span>
              {ages.map((age) => {
                const r = find(g, age);
                return (
                  <span key={age} className="cell" style={{ background: color(r) }} title={r?.name ?? ""}>
                    {r ? k(r.cost) : "—"}
                  </span>
                );
              })}
            </div>
          ))}
        </div>
        <span className="cap">Green: cheaper than average · red: more expensive.</span>
      </div>
    );
  }
  if (bd === "hour" || bd === "weekday") {
    if (!a.rows.length) return null;
    const maxR = Math.max(...a.rows.map((r) => r.results), 1);
    const top = a.rows.reduce((b, r) => (r.results > b.results ? r : b));
    const wide = bd === "weekday";
    const bw = wide ? 86 : 26;
    const x0 = wide ? 30 : 12;
    const w = wide ? 56 : 20;
    return (
      <div className="chartbox">
        <span className="title">
          {a.resultLabel} by {wide ? "day of week (real data)" : "hour of day (ad account time zone)"}
        </span>
        <svg viewBox="0 0 640 150" role="img" aria-label={`${a.resultLabel} by ${wide ? "weekday" : "hour"}`}>
          {a.rows.map((r, i) => {
            const h = (r.results / maxR) * 100;
            const fill = wide ? (r === top ? "var(--violet)" : "var(--faint)") : r.verdict === "best" ? "var(--good)" : r.verdict === "costly" ? "var(--hi)" : "var(--faint)";
            return (
              <g key={r.name}>
                <rect x={x0 + i * bw} y={118 - h} width={w} height={h} rx="2" fill={fill}>
                  <title>{`${r.name}: ${n0(r.results)} ${a.resultLabel}, ${a.kpiShort} ${k(r.cost)}`}</title>
                </rect>
                {wide ? (
                  <>
                    <text x={x0 + w / 2 + i * bw} y={112 - h} textAnchor="middle" fontSize="10" fill="var(--fg)">
                      {n0(r.results)}
                    </text>
                    <text x={x0 + w / 2 + i * bw} y="136" textAnchor="middle" fontSize="10" fill="var(--muted)">
                      {r.name.slice(0, 3)}
                    </text>
                  </>
                ) : i % 3 === 0 ? (
                  <text x={x0 + w / 2 + i * bw} y="132" textAnchor="middle" fontSize="9.5" fill="var(--muted)">
                    {r.name.slice(0, 2)}h
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
        <span className="cap">
          {wide ? (
            <>
              Most {a.resultLabel}: <b>{top.name}</b> ({pct(top.resultShare)} of the week).
            </>
          ) : (
            "Green: best-value hours · red: costly hours."
          )}
        </span>
      </div>
    );
  }
  return null;
}

// Ads compared only with the other ads in the same ad set, like a creative test.
export function Creatives() {
  const { f } = useV5();
  const { vm, open } = usePage();
  const v = vm!;
  const sets = v.levels.ad_group.filter((s) => v.levels.ad.filter((a) => a.adSetId === s.id).length >= 2).sort((a, b) => b.spend - a.spend);
  if (!sets.length) return <Empty title="No ad sets with two or more ads" text="Creatives are compared within an ad set, where they share the same audience and budget." />;
  type R = (typeof v.levels.ad)[number];
  // Same rule as the engine: ads are compared with their siblings only when the
  // siblings have at least 10 results between them.
  const vsSiblings = (a: R, sib: R[]) => {
    const others = sib.filter((x) => x.id !== a.id);
    const res = others.reduce((s, x) => s + x.results, 0);
    if (res < 10)
      return (
        <span className="muted" title="The other ads in this ad set have fewer than 10 results, so AdMate compares this ad with its own past instead.">
          too few results
        </span>
      );
    const spend = others.reduce((s, x) => s + x.spend, 0);
    const val = a.mode === "roas" ? others.reduce((s, x) => s + x.revenue, 0) / (spend || 1) : spend / res;
    if (!val || a.kpi == null || val <= 0) return "—";
    const idx = higher(a.mode) ? a.kpi / val : val / a.kpi;
    return <span className={`delta ${idx >= 1.1 ? "good" : idx <= 0.9 ? "bad" : "flat"}`}>{idx >= 1 ? `${Math.round((idx - 1) * 100)}% better` : `${Math.round((1 - idx) * 100)}% worse`}</span>;
  };
  return (
    <>
      {v.reuse.length > 0 && (
        <div className="card pad" style={{ display: "grid", gap: 8 }}>
          <span>
            <Src k="read" /> <b style={{ fontWeight: 500 }}>Ads worth copying</b>
          </span>
          <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
            {v.reuse.map((r) => (
              <li key={r.key}>
                <button className="link" type="button" onClick={() => open(r.key)}>
                  {r.name}
                </button>{" "}
                <span className="small-note">({r.where})</span>: {r.why}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="tablewrap">
        <table className="tbl" style={{ minWidth: 820 }}>
          <thead>
            <tr>
              <th>Ad</th>
              <th className="r">Spend</th>
              <th className="r">Main result</th>
              <th className="r">vs others in its ad set</th>
              <th className="r">
                <T s="CTR" />
              </th>
              <th className="r">
                <T s="Conversion rate" />
              </th>
              <th>AdMate’s call</th>
            </tr>
          </thead>
          <tbody>
            {sets.slice(0, 12).flatMap((s) => {
              const ads = v.levels.ad.filter((a) => a.adSetId === s.id).sort((a, b) => b.spend - a.spend);
              return [
                <tr key={`g${s.id}`} className="grouphead">
                  <td colSpan={7}>
                    <span className="lvl">Ad set</span> {s.name} <span className="small-note">· in {s.campaignName}</span>
                  </td>
                </tr>,
                ...ads.map((a) => (
                  <tr key={a.id} className="click" tabIndex={0} onClick={() => open(null, { entity: { level: "ad", id: a.id } })} onKeyDown={(e) => e.key === "Enter" && open(null, { entity: { level: "ad", id: a.id } })}>
                    <td>
                      <div className="nm">{a.name.split(" · ").pop()}</div>
                    </td>
                    <td className="r num">{f.money(a.spend)}</td>
                    <td className="r num">
                      <T s={a.kpiShort} /> {f.kpi(a.kpi, a.mode)}
                    </td>
                    <td className="r">{vsSiblings(a, ads)}</td>
                    <td className="r num">{pct(a.ctr, 2)}</td>
                    <td className="r num">{pct(a.cvr, 1)}</td>
                    <td>
                      {a.stance === "scale" || a.stance === "cut" ? <b style={{ fontWeight: 500 }}>{a.label}</b> : (a.label ?? "")}
                      {a.yardKind && <div className="small-note">{a.yardKind === "others" ? "vs the other ads" : a.yardKind === "target" || a.yardKind === "break_even" ? "vs your target" : "vs its own past"}</div>}
                    </td>
                  </tr>
                )),
              ];
            })}
          </tbody>
        </table>
      </div>
      <p className="small-note">Ads are only compared with the other ads in the same ad set: they share its audience and budget, like a creative test.</p>
    </>
  );
}

export function AudCreatives({ aud }: { aud: AudienceData }) {
  const search = useSearchParams();
  const set = useParam();
  const tab = search.get("tab") === "creatives" ? "creatives" : "audiences";
  return (
    <section className="section">
      <div className="tabs" role="tablist" aria-label="Audiences or creatives">
        {(
          [
            ["audiences", "Audiences"],
            ["creatives", "Creatives (ads)"],
          ] as const
        ).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => set({ tab: k })}>
            {l}
          </button>
        ))}
      </div>
      {tab === "creatives" ? <Creatives /> : <AudienceInsight aud={aud} />}
    </section>
  );
}
