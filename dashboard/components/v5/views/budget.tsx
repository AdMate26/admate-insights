"use client";

import { Fragment, useState } from "react";
import { useV5 } from "../ctx";
import { usePage } from "../page";
import { Empty, Plat, SectionHead, Src } from "../bits";
import { byGoalSpend, firstSentence, fmtDate, fmtDay, n0, pct, plural, ROLE, STATE, type Row } from "../core";

// Advanced · Budget (prototype advBudget): where the money goes, goal by goal. Click a
// goal and every campaign with that goal shows its spending, daily spend and AdMate's call.

const CAT = ["var(--cat1)", "var(--cat2)", "var(--cat3)", "var(--cat4)", "var(--cat5)", "var(--cat6)", "var(--cat7)"];
const BUDGET_CALL: Record<string, [string, string]> = {
  scale: ["good", "Add budget"],
  cut: ["bad", "Spend less"],
  fix: ["warn", "Fix first, then add"],
  keep: ["flat", "Keep as is"],
  average: ["flat", "Keep as is"],
  learn: ["flat", "Too early to tell"],
  wait: ["flat", "Too early to tell"],
  watch: ["flat", "Watch"],
  reuse: ["flat", "Ended: reuse"],
  avoid: ["flat", "Ended: avoid"],
};

export function Budget({ daily }: { daily: { dates: string[]; by: Record<string, number[]> } }) {
  const { f } = useV5();
  const { vm, open } = usePage();
  const v = vm!;
  const goals = byGoalSpend(v).filter((o) => v.levels.campaign.some((r) => r.objective === o.objective));
  const [obj, setObj] = useState<string | null>(null);
  if (!goals.length) return <Empty title="No spend in this period" text="Pick another period above." />;
  const o = goals.find((g) => g.objective === obj) ?? goals[0];
  const total = goals.reduce((s, g) => s + g.spend, 0);
  const rows = v.levels.campaign.filter((r) => r.objective === o.objective).sort((a, b) => b.spend - a.spend);
  const gSpend = rows.reduce((s, r) => s + r.spend, 0);
  const maxSpend = Math.max(...rows.map((r) => r.spend), 1);
  const val = (r: Row) => (r.mode === "roas" ? r.revenue : r.mode === "cpm" ? r.impressions : r.results) ?? 0;
  const totV = rows.reduce((s, r) => s + val(r), 0);
  const unit = o.mode === "roas" ? "sales value" : o.mode === "cpm" ? "impressions" : o.resultLabel;
  const grp = (st: string[]) => rows.filter((r) => st.includes(r.stance ?? ""));
  const openC = (r: Row) => open(null, { entity: { level: "campaign", id: r.id } });
  const li = (list: Row[], none: string) =>
    list.length ? (
      <ul>
        {list.map((r) => (
          <li key={r.id}>
            <button className="link" type="button" onClick={() => openC(r)}>
              {r.name}
            </button>{" "}
            <span className="small-note">· {f.money(r.spend / v.days)}/day</span>
            <div className="small-note">{firstSentence(r.action ?? "")}</div>
          </li>
        ))}
      </ul>
    ) : (
      <p className="small-note">{none}</p>
    );
  const [gc, gw] = STATE[o.state] ?? STATE.unknown;
  return (
    <>
      <section className="section">
        <SectionHead title="Where your money goes" hint={`${v.label} · ${f.money(total)} across ${plural(goals.length, "goal")}. Click a goal to see all its campaigns’ spending.`} />
        <div className="bstack" role="group" aria-label="Spend by goal">
          {goals.map((g, i) => (
            <button
              key={g.objective}
              type="button"
              aria-pressed={g.objective === o.objective}
              onClick={() => setObj(g.objective)}
              style={{ width: `${(g.spend / total) * 100}%`, background: CAT[i % CAT.length] }}
              title={`${g.label}: ${f.money(g.spend)} (${pct(g.spend / total)})`}
              aria-label={`${g.label}: ${f.money(g.spend)}`}
            />
          ))}
        </div>
        <div className="bcards">
          {goals.map((g, i) => {
            const n = v.levels.campaign.filter((r) => r.objective === g.objective).length;
            const [c2, w2] = STATE[g.state] ?? STATE.unknown;
            return (
              <button key={g.objective} className="bcard" type="button" aria-pressed={g.objective === o.objective} onClick={() => setObj(g.objective)}>
                <span className="top">
                  <i className="sw" style={{ background: CAT[i % CAT.length] }} />
                  <b>{g.label}</b>
                </span>
                <span className="amt">{f.money(g.spend)}</span>
                <span className="small-note">
                  {pct(g.spend / total)} of all spend · {plural(n, "campaign")}
                </span>
                <span className="small-note">
                  {g.kpiShort} {f.kpi(g.value, g.mode)} <span className={`state ${c2}`}>{w2}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>
      <section className="section">
        <SectionHead
          title={`${o.label}: ${plural(rows.length, "campaign")}`}
          hint={
            <>
              {f.money(gSpend)} spent in {v.label} · {o.kpiShort} {f.kpi(o.value, o.mode)} <span className={`state ${gc}`}>{gw}</span> · click a campaign for its full analysis
            </>
          }
        />
        <div className="brows">
          {rows.map((r, i) => {
            const [tone, word] = BUDGET_CALL[r.stance ?? ""] ?? ["flat", r.label ?? "—"];
            const ss = gSpend ? r.spend / gSpend : 0;
            const rs = totV ? val(r) / totV : 0;
            return (
              <button key={r.id} className="brow" type="button" onClick={() => openC(r)}>
                <span>
                  <span className="nm">
                    <i className="sw" style={{ background: CAT[i % CAT.length] }} />
                    {r.name}
                  </span>
                  <span className="meta2">
                    <Plat p={r.platform} />
                    <span>{ROLE[r.role] ?? r.role}</span>
                  </span>
                </span>
                <span>
                  <span className="bar">
                    <i style={{ width: `${(r.spend / maxSpend) * 100}%`, background: CAT[i % CAT.length] }} />
                  </span>
                  <span className="meta2">
                    <span>
                      <b className="num" style={{ color: "var(--fg)", fontWeight: 500 }}>
                        {f.money(r.spend)}
                      </b>{" "}
                      · {pct(ss)} of {o.label.toLowerCase()} spend · {f.money(r.spend / v.days)}/day
                    </span>
                    <span>
                      {r.mode === "cpm" ? `${n0(r.impressions)} impressions` : `${n0(r.results)} ${r.resultLabel}`} · {r.kpiShort} {f.kpi(r.kpi, r.mode)}
                    </span>
                    <span>
                      brings {pct(rs)} of the {unit}
                    </span>
                  </span>
                </span>
                <span className="call">
                  <span className={`tag ${tone}`}>{word}</span>
                  {r.expected != null && <span className="small-note">expected {f.kpi(r.expected, r.mode)}</span>}
                </span>
              </button>
            );
          })}
        </div>
        <SpendChart rows={rows} daily={daily} from={v.from} to={v.to} />
      </section>
      <section className="section">
        <SectionHead
          title={
            <>
              What to do with the {o.label.toLowerCase()} budget <Src k="read" />
            </>
          }
          hint="AdMate’s calls, looking back only. It never forecasts results."
        />
        <div className="todo3">
          <div className="g">
            <span className="label">Add budget</span>
            {li(grp(["scale"]), "No campaign is clearly ready for more yet.")}
          </div>
          <div className="w">
            <span className="label">Fix first, then add</span>
            {li(grp(["fix"]), "Nothing needs fixing first.")}
          </div>
          <div className="b">
            <span className="label">Spend less</span>
            {li(grp(["cut"]), "Nothing clearly needs cutting.")}
          </div>
        </div>
        <p className="small-note">AdMate only says “add” or “spend less” when a change holds against older history, never on a single day. Raise budgets about 20% at a time and check again after 3–4 days.</p>
      </section>
    </>
  );
}

function SpendChart({ rows, daily, from, to }: { rows: Row[]; daily: { dates: string[]; by: Record<string, number[]> }; from: string; to: string }) {
  const { f } = useV5();
  const dates = daily.dates;
  if (dates.length < 2) return null;
  const top = rows.slice(0, 6);
  const rest = rows.slice(6);
  const spendOn = (r: Row, i: number) => daily.by[r.id]?.[i] ?? 0;
  const byDay = dates.map((date, i) => ({ date, parts: [...top.map((r) => spendOn(r, i)), ...(rest.length ? [rest.reduce((s, r) => s + spendOn(r, i), 0)] : [])] }));
  const names = [...top.map((r) => r.name), ...(rest.length ? [`${rest.length} other campaigns`] : [])];
  const max = Math.max(1, ...byDay.map((d) => d.parts.reduce((s, x) => s + x, 0))) * 1.12;
  const W = 640, H = 200, L0 = 52, R = 8, T0 = 12, B = 26;
  const bw = (W - L0 - R) / byDay.length;
  const y = (v: number) => H - B - (v / max) * (H - T0 - B);
  const i0 = dates.findIndex((d) => d >= from);
  const i1 = dates.length - 1 - [...dates].reverse().findIndex((d) => d <= to);
  const step = Math.max(1, Math.ceil(byDay.length / 7));
  return (
    <div className="chartbox">
      <span className="title">
        Daily spending, by campaign <span className="small-note">(last 4 weeks; hover a bar for the amount)</span>
      </span>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Daily spend by campaign">
        {i0 >= 0 && <rect x={L0 + i0 * bw} y={T0 - 6} width={(i1 - i0 + 1) * bw} height={H - T0 - B + 6} fill="var(--violet-soft)" />}
        {[0, max / 2, max].map((v, i) => (
          <Fragment key={i}>
            <line x1={L0} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth="0.8" />
            <text x={L0 - 6} y={y(v) + 3} textAnchor="end" fontSize="9.5" fill="var(--muted)">
              {f.money(v)}
            </text>
          </Fragment>
        ))}
        {byDay.map((d, i) => {
          let acc = 0;
          return (
            <Fragment key={d.date}>
              {d.parts.map((x, k) => {
                const y1 = y(acc + x);
                const h = y(acc) - y1;
                acc += x;
                return h > 0.2 ? (
                  <rect key={k} x={(L0 + i * bw + bw * 0.12).toFixed(1)} y={y1.toFixed(1)} width={(bw * 0.76).toFixed(1)} height={h.toFixed(1)} fill={CAT[k % CAT.length]}>
                    <title>{`${fmtDay(d.date)} · ${names[k]}: ${f.money(x)}`}</title>
                  </rect>
                ) : null;
              })}
            </Fragment>
          );
        })}
        {dates.map((d, i) =>
          i % step === 0 || i === dates.length - 1 ? (
            <text key={d} x={L0 + i * bw + bw / 2} y={H - 8} textAnchor="middle" fontSize="9.5" fill="var(--muted)">
              {fmtDate(d)}
            </text>
          ) : null,
        )}
      </svg>
      <div className="legend">
        {names.map((n, k) => (
          <span key={n}>
            <i className="sw" style={{ background: CAT[k % CAT.length] }} />
            {n}
          </span>
        ))}
        <span>
          <i className="sw" style={{ background: "var(--violet-soft)" }} />
          selected period
        </span>
      </div>
    </div>
  );
}
