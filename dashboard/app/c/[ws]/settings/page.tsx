import { notFound } from "next/navigation";
import type { InputHTMLAttributes, ReactNode } from "react";
import { saveSettings } from "@/app/actions";
import { DeleteClientButton } from "@/components/DeleteClientButton";
import { SettingsForm } from "@/components/SettingsForm";
import { PageHead } from "@/components/v5/PageHead";
import { V5Page } from "@/components/v5/page";
import { COUNTRIES, INDUSTRIES } from "@/lib/accountOptions";
import { breakEven } from "@/lib/analysis/goals";
import { getGoals, getWorkspace, loadCampaigns } from "@/lib/data/workspaces";
import { money } from "@/lib/format";
import { OBJECTIVE_DEFS, OBJECTIVES, type Objective } from "@/lib/metrics/objectives";

export const metadata = { title: "Goals & settings" };

// Goals & settings (prototype settingsHtml): what good looks like for each goal, the
// break-even it implies, and the account's details.
export default async function SettingsPage({ params }: PageProps<"/c/[ws]/settings">) {
  const { ws } = await params;
  const workspace = await getWorkspace(ws);
  if (!workspace) notFound();
  const [goals, campaigns] = await Promise.all([getGoals(ws), loadCampaigns(ws)]);
  const used = new Set<Objective>([...campaigns.map((c) => c.objective), ...goals.map((g) => g.objective)]);
  const objectives = OBJECTIVES.filter((o) => used.size === 0 || used.has(o));
  const cur = workspace.currency;
  const action = saveSettings.bind(null, ws);
  const withTarget = objectives.filter((o) => goals.find((g) => g.objective === o)?.target != null).length;

  return (
    <V5Page vm={null} page="settings">
      <PageHead title="Goals & settings" withPeriod={false} />
      <SettingsForm action={action}>
        <div className="card formcard" id="targets">
          <header>
            <div>
              <h2 style={{ fontSize: 18 }}>Goals</h2>
              <p>The most you want to pay per result (or the return you need). Leave one empty and AdMate compares that goal with the period before. Saved targets re-judge your goals everywhere.</p>
            </div>
            <span className="state flat num">
              {withTarget} of {objectives.length} set
            </span>
          </header>
          {objectives.map((o) => {
            const g = goals.find((x) => x.objective === o);
            const def = OBJECTIVE_DEFS[o];
            const roas = o === "sales";
            const be = g ? breakEven(g, roas ? "roas" : "cost") : null;
            return (
              <div key={o} className="trow">
                <div className="who">
                  <b>{def.label}</b>
                  <span>Judged by {roas ? "ROAS (or cost per purchase when there’s no revenue)" : def.kpiLabel}</span>
                </div>
                <div className="fields">
                  <Field label={roas ? "Target ROAS" : `Target ${def.kpiLabel.toLowerCase()}`} name={`${o}.target`} defaultValue={g?.target ?? ""} prefix={roas ? undefined : cur} suffix={roas ? "×" : undefined} />
                  {o === "sales" && <Field label="Gross margin" name={`${o}.margin`} defaultValue={g?.marginPct ?? ""} placeholder="e.g. 40" suffix="%" />}
                  {(o === "leads" || o === "messages") && (
                    <>
                      <Field label={`Out of 100 ${o === "leads" ? "leads" : "conversations"}, how many buy?`} name={`${o}.close`} defaultValue={g?.leadToCustomerPct ?? ""} placeholder="e.g. 10" suffix="%" />
                      <Field label="Profit from one customer" name={`${o}.profit`} defaultValue={g?.profitPerCustomer ?? ""} placeholder="e.g. 20" prefix={cur} />
                    </>
                  )}
                  {o === "awareness" && <p className="note">With daily reports AdMate judges awareness by cost per 1,000 impressions (reach can’t be added up across days), so this target is used for period reports.</p>}
                  {be !== null && (
                    <p className="be">
                      Break-even: <b>{roas ? `ROAS ${be.toFixed(2)}×` : `${def.kpiShort} ${money(be, cur)}`}</b>. Worse than this loses money.
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="card formcard" id="account">
          <header>
            <div>
              <h2 style={{ fontSize: 18 }}>Account</h2>
              <p>How this ad account appears across AdMate.</p>
            </div>
          </header>
          <div className="pad">
            <div className="fields">
              <Labelled label="Account name">
                <input name="name" defaultValue={workspace.name} style={{ fontFamily: "var(--font-display)" }} />
              </Labelled>
              <Labelled label="Currency (3 letters, e.g. USD or KHR)">
                <input name="currency" defaultValue={cur} maxLength={3} autoCapitalize="characters" style={{ textTransform: "uppercase" }} />
              </Labelled>
              <Labelled label="Industry">
                <select name="industry" defaultValue={workspace.industry ?? ""}>
                  <option value="">Not set</option>
                  {[...new Set([...INDUSTRIES, ...(workspace.industry ? [workspace.industry] : [])])].map((i) => (
                    <option key={i}>{i}</option>
                  ))}
                </select>
              </Labelled>
              <Labelled label="Country">
                <select name="country" defaultValue={workspace.country ?? ""}>
                  <option value="">Not set</option>
                  {[...new Set([...COUNTRIES, ...(workspace.country ? [workspace.country] : [])])].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Labelled>
            </div>
          </div>
        </div>
      </SettingsForm>
      <div className="card pad" style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between", borderColor: "color-mix(in srgb, var(--hi) 35%, var(--line))" }}>
        <div>
          <h2 style={{ fontSize: 16 }}>Delete this ad account</h2>
          <p className="small-note">Removes the account and every report uploaded to it. This can’t be undone.</p>
        </div>
        <DeleteClientButton workspaceId={ws} />
      </div>
    </V5Page>
  );
}

function Labelled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      <span className="in">{children}</span>
    </label>
  );
}

// A number with its unit on either side (currency code, ×, %).
function Field({ label, prefix, suffix, ...props }: { label: string; prefix?: string; suffix?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="field">
      <span>{label}</span>
      <span className="in">
        {prefix && <i>{prefix}</i>}
        <input inputMode="decimal" placeholder="Optional" autoComplete="off" {...props} />
        {suffix && <i>{suffix}</i>}
      </span>
    </label>
  );
}
