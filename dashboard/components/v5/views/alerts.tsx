"use client";

import { useRef, useState, useTransition } from "react";
import { addRule, deleteRule, disconnectTelegram, saveAlertConfig, saveTelegram, sendTestTelegram, setCampaignTarget, setRuleOn, telegramLinkCode } from "@/app/alert-actions";
import { useSynced, useV5 } from "../ctx";
import { usePage } from "../page";
import { Empty, Plat, SectionHead } from "../bits";
import { TelegramPreview } from "../TelegramPreview";
import { allItems, DETECTOR_NAME, plural } from "../core";
import {
  alertDigest, alertsFired, autoAlerts, autoText, campaignTarget, firedText, goalTarget, ownTarget, ruleTemplates, ruleText, RULE_METRICS, worseBy,
  type AlertConfig, type CampaignTargets, type Rule,
} from "@/lib/analysis/alerts";
import { OBJECTIVE_DEFS, type Objective } from "@/lib/metrics/objectives";
import { apiPath } from "@/lib/integration/paths";

// Advanced · Alerts (prototype advAlerts): 1) automatic alerts, 2) your own KPI alerts,
// and where and when they're sent (in AdMate, and to Telegram).

export type Tg = { on: boolean; when: string; time: string; days: number[]; tz: string; linked: boolean; username: string | null };
const AUTO = Object.entries(DETECTOR_NAME).filter(([k]) => k !== "plan");
const DAYNAME = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function AdvAlerts({ config: cfg0, rules: rules0, targets: targets0, tg: tg0, tgEnabled }: { config: AlertConfig; rules: Rule[]; targets: CampaignTargets; tg: Tg; tgEnabled: boolean }) {
  const { f, ws, name } = useV5();
  const { vm, open, toast } = usePage();
  const v = vm!;
  // Local copies so switches respond at once; the server's answer replaces them.
  const [cfg, setCfg] = useSynced(cfg0);
  const [rules, setRules] = useSynced(rules0);
  const [targets, setTargets] = useSynced(targets0);
  const [tg, setTg] = useSynced(tg0);
  const [tab, setTab] = useState<"auto" | "own">("auto");
  const [preview, setPreview] = useState(false);
  const [, start] = useTransition();
  const auto = autoAlerts(v, cfg, targets);
  const fired = alertsFired(v, rules);
  const badN = auto.filter((a) => !a.good).length;
  const patchCfg = (p: Partial<AlertConfig>) => {
    setCfg((c) => ({ ...c, ...p }));
    start(() => saveAlertConfig(ws, p));
  };
  const patchTg = (p: Partial<Tg>) => {
    setTg((t) => ({ ...t, ...p }));
    start(() => saveTelegram(p));
  };
  const tgWhen = (t: Tg) => {
    if (t.when === "now") return "right away, each time new data arrives";
    if (t.when === "daily") return `every day at ${t.time}`;
    const d = [1, 2, 3, 4, 5, 6, 0].filter((x) => t.days.includes(x)).map((x) => DAYNAME[x]);
    return d.length ? `every ${d.join(", ")} at ${t.time}` : "on no days yet (pick at least one)";
  };
  const send = useRef<HTMLElement>(null);
  const P: Shared = { v, f, ws, cfg, patchCfg, targets, setTargets, rules, setRules, fired, auto, tg, setTg, patchTg, tgWhen, tgEnabled, open, toast, start };
  return (
    <>
      <div className="statusbar">
        <button className={`stat ${badN ? "hi" : ""}`} type="button" onClick={() => setTab("auto")}>
          <span className="num">{cfg.on ? auto.length : "Off"}</span> automatic {auto.length === 1 ? "alert" : "alerts"}
        </button>
        <button className={`stat ${fired.length ? "hi" : ""}`} type="button" onClick={() => setTab("own")}>
          <span className="num">{fired.length}</span> of your KPI alerts fired
        </button>
        <button className="stat" type="button" onClick={() => send.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>
          Telegram: <b style={{ fontWeight: 500 }}>{tg.on && tg.linked ? tgWhen(tg) : "off"}</b>
        </button>
      </div>
      <div className="tabs" role="tablist" aria-label="Alert type">
        <button type="button" role="tab" aria-selected={tab === "auto"} onClick={() => setTab("auto")}>
          Automatic alerts
        </button>
        <button type="button" role="tab" aria-selected={tab === "own"} onClick={() => setTab("own")}>
          Your own KPI alerts
        </button>
      </div>
      {tab === "auto" ? <AutoTab P={P} /> : <OwnTab P={P} />}
      <section className="section" id="send" ref={send}>
        <SectionHead title="Send alerts" hint="Where and when you hear about automatic alerts and your own KPI alerts" />
        <div className="card pad" style={{ display: "grid", gap: 12 }}>
          <div className="optrow">
            <span>In AdMate</span>
            <span className="small">Always on: alerts appear here and as a badge in the menu.</span>
          </div>
          <TelegramBlock P={P} />
          <div>
            <button className="btn" type="button" onClick={() => setPreview(true)}>
              Preview the Telegram message
            </button>
          </div>
        </div>
      </section>
      {preview && (
        <>
          <div className="scrim" onClick={() => setPreview(false)} />
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="tg-t" onClick={(e) => e.target === e.currentTarget && setPreview(false)}>
            <article className="mbox" style={{ width: "min(540px,100%)" }}>
              <header>
                <div>
                  <span className="label">Preview</span>
                  <h2 id="tg-t">Your Telegram message</h2>
                </div>
                <button className="btn" type="button" onClick={() => setPreview(false)}>
                  Close
                </button>
              </header>
              <div className="mbody">
                <TelegramPreview d={alertDigest(name, v, cfg, rules, targets, f)} when={tg.on && tg.linked ? `Sent ${tgWhen(tg)}` : "Telegram is switched off"} />
                <p className="small-note">Built from the alerts on screen right now: automatic alerts and your own KPI alerts for {name}, for {v.label}. Messages that go out on their own use your latest data.</p>
              </div>
            </article>
          </div>
        </>
      )}
    </>
  );

}

type Shared = {
  v: NonNullable<ReturnType<typeof usePage>["vm"]>;
  f: ReturnType<typeof useV5>["f"];
  ws: string;
  cfg: AlertConfig;
  patchCfg: (p: Partial<AlertConfig>) => void;
  targets: CampaignTargets;
  setTargets: React.Dispatch<React.SetStateAction<CampaignTargets>>;
  rules: Rule[];
  setRules: React.Dispatch<React.SetStateAction<Rule[]>>;
  fired: ReturnType<typeof alertsFired>;
  auto: ReturnType<typeof autoAlerts>;
  tg: Tg;
  setTg: React.Dispatch<React.SetStateAction<Tg>>;
  patchTg: (p: Partial<Tg>) => void;
  tgWhen: (t: Tg) => string;
  tgEnabled: boolean;
  open: ReturnType<typeof usePage>["open"];
  toast: (t: string) => void;
  start: React.TransitionStartFunction;
};

function AutoTab({ P }: { P: Shared }) {
  const { v, f, ws, cfg, patchCfg, targets, setTargets, auto, open, toast, start } = P;
  const counts = Object.fromEntries(AUTO.map(([k]) => [k, allItems(v).filter((d) => d.detector === k).length]));
  const off = !cfg.on;
  return (
    <section className="section">
      <div className="card pad" style={{ display: "grid", gap: 12 }}>
        <label className="switch">
          <input type="checkbox" checked={cfg.on} onChange={(e) => patchCfg({ on: e.target.checked })} /> Automatic alerts are {cfg.on ? "on" : "off"}
        </label>
        <p className="small-note">AdMate checks every campaign each time new data arrives. You only choose what to compare with and how sensitive to be.</p>
        <div className="optrow">
          <span>Compare each campaign with</span>
          <label>
            <input type="checkbox" checked={cfg.past} disabled={off} onChange={(e) => patchCfg({ past: e.target.checked })} /> its own past results <span className="small-note">(when it has some)</span>
          </label>
          <label>
            <input type="checkbox" checked={cfg.target} disabled={off} onChange={(e) => patchCfg({ target: e.target.checked })} /> its target
          </label>
        </div>
        <div className="optrow">
          <span>Alert me when</span>
          <label>
            <input type="radio" name="sens" checked={cfg.sens === "auto"} disabled={off} onChange={() => patchCfg({ sens: "auto" })} /> AdMate is sure the change is real <span className="small-note">(recommended)</span>
          </label>
          <label>
            <input type="radio" name="sens" checked={cfg.sens === "pct"} disabled={off} onChange={() => patchCfg({ sens: "pct" })} /> it’s more than
          </label>
          <input
            className="inp"
            type="number"
            min={1}
            max={300}
            step={1}
            defaultValue={cfg.pct}
            key={cfg.pct}
            style={{ width: 72 }}
            aria-label="Percent worse"
            disabled={!cfg.on || cfg.sens !== "pct"}
            onBlur={(e) => {
              const n = Math.round(Number(e.target.value));
              if (n >= 1 && n <= 300) patchCfg({ pct: n });
              else toast("Enter a percentage between 1 and 300");
            }}
          />
          <span className="small-note">% worse</span>
        </div>
        <div className="optrow">
          <span>Good news</span>
          <label>
            <input type="checkbox" checked={cfg.good} disabled={off} onChange={(e) => patchCfg({ good: e.target.checked })} /> Also tell me when a campaign is clearly doing better
          </label>
        </div>
      </div>
      <SectionHead
        title={
          <>
            Found now <span className="num">{cfg.on ? auto.length : 0}</span>
          </>
        }
        hint={cfg.on ? `In ${v.label}${v.compareLabel ? `, against each campaign’s past (${v.compareLabel}) and target` : ". No comparison period, so only targets are checked."}` : "Automatic alerts are off."}
      />
      {!cfg.on ? (
        <Empty title="Automatic alerts are off" text="Switch them on above." />
      ) : auto.length ? (
        <div className="rows">
          {auto.map((a, i) => (
            <button key={i} className={`irow ${a.good ? "low" : a.w > 0.3 ? "high" : "medium"}`} type="button" onClick={() => open(null, { entity: { level: "campaign", id: a.r.id } })}>
              <span className="body">
                <span className="tags">
                  <span className={`basis ${a.basis}`}>vs {a.basis === "past" ? "its past" : "its target"}</span>
                  {a.good && <span className="tag good">Doing better</span>}
                  <Plat p={a.r.platform} />
                </span>
                <span className="t">{a.r.name}</span>
                <span className="sub">{autoText(a, v, f)}</span>
              </span>
              <span className="side-r">
                <span className="link small">Investigate →</span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <Empty title="Nothing to report" text="Every campaign is within your settings for this period." />
      )}
      <SectionHead title="Campaign targets" hint="Set a target when a campaign starts, in the same unit as its result. Leave it empty to use the goal’s target from Goals & settings." />
      <div className="tablewrap">
        <table className="tbl dense" style={{ minWidth: 760 }}>
          <thead>
            <tr>
              <th>Campaign</th>
              <th>Goal</th>
              <th className="r">Result now</th>
              <th className="r">Goal target</th>
              <th>This campaign’s target</th>
              <th>vs target</th>
            </tr>
          </thead>
          <tbody>
            {v.levels.campaign.map((r) => {
              const g = goalTarget(r, v);
              const own = ownTarget(r, targets);
              const t = campaignTarget(r, v, targets);
              const w = t ? worseBy(r.kpi, t.value, r.mode) : null;
              const st = w == null ? null : w > 0.3 ? ["bad", "Far off"] : w > 0.1 ? ["warn", "Off track"] : ["good", "On track"];
              return (
                <tr key={r.id}>
                  <td>
                    <div className="nm">{r.name}</div>
                  </td>
                  <td className="small">{r.objectiveLabel}</td>
                  <td className="r num">
                    {r.kpiShort} {f.kpi(r.kpi, r.mode)}
                  </td>
                  <td className="r num">{g != null ? f.kpi(g, r.mode) : "—"}</td>
                  <td>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      {r.mode === "roas" ? null : <span className="small-note">{f.currency}</span>}
                      <input
                        className="inp"
                        inputMode="decimal"
                        placeholder={g != null ? String(g) : "none"}
                        defaultValue={own ?? ""}
                        key={`${r.id}:${own ?? ""}`}
                        style={{ width: 84 }}
                        aria-label={`${r.kpiShort} target for ${r.name}`}
                        onBlur={(e) => {
                          const n = parseFloat(e.target.value.replace(/[^\d.]/g, ""));
                          const value = n > 0 ? n : null;
                          if (value === own) return;
                          setTargets((x) => {
                            const y = { ...x };
                            if (value) y[r.id] = { mode: r.mode, value };
                            else delete y[r.id];
                            return y;
                          });
                          start(() => setCampaignTarget(ws, r.id, r.mode, value));
                          toast(value ? "Campaign target saved" : g != null ? "This campaign now uses the goal’s target" : "Campaign target removed");
                        }}
                      />
                      {r.mode === "roas" ? <span className="small-note">×</span> : null}
                    </span>
                  </td>
                  <td>{st ? <span className={`state ${st[0]}`}>{st[1]}</span> : <span className="small-note">{t ? "no results yet" : "no target"}</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <details className="small">
        <summary>What else AdMate checks automatically ({AUTO.length} checks)</summary>
        <div className="tablewrap" style={{ marginTop: 8 }}>
          <table className="tbl dense">
            <thead>
              <tr>
                <th>Check</th>
                <th className="r">Found in {v.label}</th>
                <th>Show in lists</th>
              </tr>
            </thead>
            <tbody>
              {AUTO.map(([k, nm]) => {
                const isMuted = cfg.muted.includes(k);
                return (
                  <tr key={k}>
                    <td>{nm}</td>
                    <td className="r num">{counts[k]}</td>
                    <td>
                      <label className="toggle">
                        <input type="checkbox" checked={!isMuted} onChange={(e) => patchCfg({ muted: e.target.checked ? cfg.muted.filter((x) => x !== k) : [...cfg.muted, k] })} /> {isMuted ? "Off" : "On"}
                      </label>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

function OwnTab({ P }: { P: Shared }) {
  const { v, f, ws, rules, setRules, fired, open, toast, start } = P;
  const objs = [...new Set(v.levels.campaign.map((r) => r.objective))];
  const [metric, setMetric] = useState<string>("worse");
  const [op, setOp] = useState<string>("by");
  const [value, setValue] = useState("");
  const [scope, setScope] = useState("all");
  const [err, setErr] = useState("");
  const add = (rule: { metric: string; op: string; value: number; scope: string }) =>
    start(async () => {
      const r = await addRule(ws, rule);
      if (r.error) return setErr(r.error);
      setErr("");
      setValue("");
      toast("Alert added");
    });
  return (
    <section className="section">
      <p className="small-note">Set your own limit on any number. AdMate checks it every time new data arrives.</p>
      <form
        className="card pad ruleform"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const n = parseFloat(value);
          if (!(n >= 0)) return setErr("Enter a number.");
          add({ metric, op, value: n, scope });
        }}
      >
        <select
          className="sel"
          aria-label="Metric"
          value={metric}
          onChange={(e) => {
            setMetric(e.target.value);
            if (e.target.value === "worse") setOp("by");
            else if (op === "by") setOp("above");
          }}
        >
          {Object.entries(RULE_METRICS).map(([k, m]) => (
            <option key={k} value={k}>
              {m.label}
            </option>
          ))}
        </select>
        <select className="sel" aria-label="Condition" value={op} onChange={(e) => setOp(e.target.value)}>
          <option value="by">is worse by more than</option>
          <option value="above">is above</option>
          <option value="below">is below</option>
        </select>
        <input className="inp" inputMode="decimal" placeholder="Value" aria-label="Value" style={{ width: 90 }} value={value} onChange={(e) => setValue(e.target.value)} />
        <select className="sel" aria-label="Applies to" value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="all">Any campaign</option>
          {objs.map((o) => (
            <option key={o} value={`obj:${o}`}>
              {OBJECTIVE_DEFS[o as Objective].label} campaigns
            </option>
          ))}
          {v.levels.campaign.map((r) => (
            <option key={r.id} value={`c:${r.id}`}>
              {r.name}
            </option>
          ))}
        </select>
        <button className="btn primary" type="submit">
          Add alert
        </button>
        <span className="small-note" role="alert">
          {err}
        </span>
      </form>
      <div className="views">
        <span className="label">Start from a template</span>
        {ruleTemplates(v).map((t) => (
          <button key={t.name} className="v" type="button" onClick={() => add(t.rule)}>
            {t.name}
          </button>
        ))}
      </div>
      {rules.length > 0 && (
        <div className="list">
          {rules.map((rule) => {
            const n = fired.filter((x) => x.rule.id === rule.id).length;
            return (
              <div key={rule.id} className="rule">
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={rule.on}
                    onChange={(e) => {
                      const on = e.target.checked;
                      setRules((rs) => rs.map((x) => (x.id === rule.id ? { ...x, on } : x)));
                      start(() => setRuleOn(ws, rule.id, on));
                    }}
                  />{" "}
                  On
                </label>
                <span className="grow">{ruleText(rule, v, f)}</span>
                {n ? <span className="fired">{plural(n, "campaign")} now</span> : <span className="small-note">quiet</span>}
                <button
                  className="link small"
                  type="button"
                  onClick={() => {
                    setRules((rs) => rs.filter((x) => x.id !== rule.id));
                    start(() => deleteRule(ws, rule.id));
                  }}
                >
                  Delete
                </button>
              </div>
            );
          })}
        </div>
      )}
      <SectionHead
        title={
          <>
            Fired now <span className="num">{fired.length}</span>
          </>
        }
        hint={`Checked against ${v.label}`}
      />
      {fired.length ? (
        <div className="rows">
          {fired.map((x, i) => (
            <button key={i} className="irow high" type="button" onClick={() => open(null, { entity: { level: "campaign", id: x.r.id } })}>
              <span className="body">
                <span className="t">{x.r.name}</span>
                <span className="sub">
                  <span className="fired">{firedText(x, f)}</span>
                  <span>alert: {ruleText(x.rule, v, f)}</span>
                </span>
              </span>
              <span className="side-r">
                <span className="link small">Investigate →</span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <Empty title={rules.length ? "None fired" : "No KPI alerts yet"} text={rules.length ? "Every campaign is inside your limits for this period." : "Add one above, or start from a template."} />
      )}
    </section>
  );
}

function TelegramBlock({ P }: { P: Shared }) {
  const { ws, tg, setTg, patchTg, tgWhen, tgEnabled, toast, start } = P;
  const [code, setCode] = useState<{ code: string; bot: string | null } | null>(null);
  const [checking, setChecking] = useState(false);
  if (!tgEnabled)
    return (
      <div className="optrow">
        <span>Telegram</span>
        <span className="small">Sending to Telegram starts once the AdMate Telegram bot is added to this AdMate (its token in the server settings). Alerts still appear here and in the menu.</span>
      </div>
    );
  if (!tg.linked)
    return (
      <div style={{ display: "grid", gap: 8 }}>
        <div className="optrow">
          <span>Telegram</span>
          {!code ? (
            <button className="btn primary" type="button" onClick={() => start(async () => setCode(await telegramLinkCode()))}>
              Connect Telegram
            </button>
          ) : (
            <span className="small">
              1. Open{" "}
              {code.bot ? (
                <a className="link" href={`https://t.me/${code.bot}?start=${code.code}`} target="_blank" rel="noreferrer">
                  the AdMate bot
                </a>
              ) : (
                "the AdMate bot"
              )}{" "}
              and press <b>Start</b>
              {code.bot ? "" : <> (or send it <span className="num">/start {code.code}</span>)</>}. 2. Then come back and{" "}
              <button
                className="link"
                type="button"
                disabled={checking}
                onClick={async () => {
                  setChecking(true);
                  const r = await fetch(apiPath("/api/telegram/link")).then((x) => x.json()).catch(() => null);
                  setChecking(false);
                  if (r?.linked) {
                    setTg((t) => ({ ...t, linked: true, on: true, username: r.username }));
                    toast("Telegram connected");
                  } else toast("Not yet. Press Start in the bot, then check again.");
                }}
              >
                {checking ? "checking…" : "check the connection"}
              </button>
              .
            </span>
          )}
        </div>
      </div>
    );
  return (
    <>
      <label className="switch">
        <input type="checkbox" checked={tg.on} onChange={(e) => patchTg({ on: e.target.checked })} /> Send to Telegram{tg.username ? ` (${tg.username})` : ""}
      </label>
      {tg.on && (
        <>
          <div className="optrow">
            <span>When</span>
            {(
              [
                ["now", "Right away (when new data arrives)"],
                ["daily", "Every day"],
                ["days", "On the days I choose"],
              ] as const
            ).map(([k, l]) => (
              <label key={k}>
                <input type="radio" name="tgwhen" checked={tg.when === k} onChange={() => patchTg({ when: k })} /> {l}
              </label>
            ))}
          </div>
          {tg.when === "days" && (
            <div className="optrow">
              <span>Days</span>
              <span className="days">
                {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                  <label key={d}>
                    <input type="checkbox" checked={tg.days.includes(d)} onChange={(e) => patchTg({ days: e.target.checked ? [...tg.days, d] : tg.days.filter((x) => x !== d) })} />
                    {DAYNAME[d]}
                  </label>
                ))}
              </span>
            </div>
          )}
          {tg.when !== "now" && (
            <div className="optrow">
              <span>Time</span>
              <input className="inp" type="time" step={3600} defaultValue={tg.time} key={tg.time} aria-label="Time" onBlur={(e) => patchTg({ time: `${(e.target.value || "09:00").slice(0, 2)}:00` })} />
              <span className="small-note">on the hour, {tg.tz.replace(/_/g, " ")} time</span>
            </div>
          )}
          <p className="small">AdMate sends {tgWhen(tg)}.</p>
        </>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          className="btn small"
          type="button"
          onClick={() =>
            start(async () => {
              const r = await sendTestTelegram(ws);
              toast(r.error ?? "Sent to your Telegram");
            })
          }
        >
          Send a test message now
        </button>
        <button className="link small" type="button" onClick={() => start(() => disconnectTelegram())}>
          Disconnect Telegram
        </button>
      </div>
    </>
  );
}

