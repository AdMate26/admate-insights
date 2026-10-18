import { notFound } from "next/navigation";
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { saveSettings } from "@/app/actions";
import { DeleteClientButton } from "@/components/DeleteClientButton";
import { SettingsForm } from "@/components/SettingsForm";
import { Card, cx } from "@/components/ui";
import { COUNTRIES, INDUSTRIES } from "@/lib/accountOptions";
import { breakEven } from "@/lib/analysis/goals";
import { getGoals, getWorkspace, loadCampaigns } from "@/lib/data/workspaces";
import { money } from "@/lib/format";
import { OBJECTIVE_DEFS, OBJECTIVES, type Objective } from "@/lib/metrics/objectives";

export const metadata = { title: "Targets & settings" };

const control =
  "w-full min-w-0 rounded-lg border border-line bg-bg px-3 py-2 text-sm outline-none transition-colors placeholder:text-faint hover:border-faint focus:border-violet focus:ring-2 focus:ring-violet/20 focus-visible:outline-none!";

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
  const offersBreakEven = objectives.some((o) => o === "sales" || o === "leads" || o === "messages");

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <p className="label">Targets & settings</p>
        <h1 className="mt-1 text-2xl">What good looks like for {workspace.name}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">Tell AdMate what counts as a good result, so it can say whether each goal is on track. Every field is optional.</p>
      </header>

      <SettingsForm action={action}>
        <Card className="overflow-hidden">
          <SectionHeader
            id="targets"
            title="Targets"
            description="The most you want to pay per result. Leave a goal empty and AdMate compares it with your previous period instead."
            aside={
              <span className="num inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-surface-2 px-2.5 py-1 text-xs text-muted">
                <span className={cx("h-1.5 w-1.5 rounded-full", withTarget > 0 ? "bg-violet" : "bg-faint")} aria-hidden />
                {withTarget} of {objectives.length} targets set
              </span>
            }
          />

          <div className={cx("grid gap-px border-b border-line bg-line", offersBreakEven && "sm:grid-cols-2")}>
            <Tip title="Know your target?">Type it in. AdMate judges each goal against it and flags anything that drifts above.</Tip>
            {offersBreakEven && (
              <Tip title="Not sure what to aim for?">
                Fill in what a customer is worth. AdMate works out your break-even: the most you can pay per result without losing money.
              </Tip>
            )}
          </div>

          <div className="divide-y divide-line">
            {objectives.map((o) => {
              const g = goals.find((x) => x.objective === o);
              const def = OBJECTIVE_DEFS[o];
              const roasMode = o === "sales";
              const be = g ? breakEven(g, roasMode ? "roas" : "cost") : null;
              const hasTarget = g?.target != null;
              return (
                <div key={o} className="grid gap-4 px-5 py-5 sm:grid-cols-[200px_1fr] sm:gap-6">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{def.label}</span>
                      {hasTarget ? (
                        <span className="rounded-full bg-violet-soft px-2 py-0.5 text-[11px] font-medium text-violet">Target set</span>
                      ) : (
                        <span className="rounded-full border border-dashed border-line px-2 py-0.5 text-[11px] text-muted" title="No target yet — AdMate compares with your previous period">
                          vs. last period
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-muted">
                      Judged by {roasMode ? "ROAS (or cost per purchase when there’s no revenue)" : def.kpiLabel.toLowerCase()}
                    </p>
                  </div>
                  <div className="grid content-start gap-3 sm:grid-cols-[repeat(auto-fill,minmax(190px,1fr))]">
                    <Field
                      label={roasMode ? "Target ROAS" : `Target ${def.kpiLabel.toLowerCase()}`}
                      name={`${o}.target`}
                      defaultValue={g?.target ?? ""}
                      prefix={roasMode ? undefined : cur}
                      suffix={roasMode ? "×" : undefined}
                    />
                    {o === "sales" && <Field label="Gross margin" name={`${o}.margin`} defaultValue={g?.marginPct ?? ""} placeholder="e.g. 40" suffix="%" />}
                    {(o === "leads" || o === "messages") && (
                      <>
                        <Field
                          label={`Out of 100 ${o === "leads" ? "leads" : "conversations"}, how many buy?`}
                          name={`${o}.close`}
                          defaultValue={g?.leadToCustomerPct ?? ""}
                          placeholder="e.g. 10"
                          suffix="%"
                        />
                        <Field label="Profit from one customer" name={`${o}.profit`} defaultValue={g?.profitPerCustomer ?? ""} placeholder="e.g. 20" prefix={cur} />
                      </>
                    )}
                    {be !== null && (
                      <p className="flex items-start gap-2 rounded-lg bg-violet-soft px-3 py-2 text-xs text-fg sm:col-span-full">
                        <span className="label !text-[10px] !text-violet">Break-even</span>
                        <span>
                          <span className="num font-medium">{roasMode ? `ROAS ${be.toFixed(2)}×` : `${def.kpiShort} ${money(be, cur)}`}</span>
                          <span className="text-muted"> — worse than this loses money.</span>
                        </span>
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="overflow-hidden">
          <SectionHeader id="account" title="Account" description="How this ad account appears across AdMate." />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Labelled label="Account name">
              <input name="name" defaultValue={workspace.name} className={control} />
            </Labelled>
            <Labelled label="Currency" hint="3-letter code, e.g. USD or KHR. Used for every amount.">
              <input name="currency" defaultValue={cur} maxLength={3} autoCapitalize="characters" className={control + " num uppercase"} />
            </Labelled>
            <Labelled label="Industry">
              <Select name="industry" defaultValue={workspace.industry ?? ""}>
                <option value="">Not set</option>
                {[...new Set([...INDUSTRIES, ...(workspace.industry ? [workspace.industry] : [])])].map((i) => (
                  <option key={i}>{i}</option>
                ))}
              </Select>
            </Labelled>
            <Labelled label="Country">
              <Select name="country" defaultValue={workspace.country ?? ""}>
                <option value="">Not set</option>
                {[...new Set([...COUNTRIES, ...(workspace.country ? [workspace.country] : [])])].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </Labelled>
          </div>
        </Card>
      </SettingsForm>

      <Card className="border-bad/30">
        <div className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <h2 className="text-base">Delete this ad account</h2>
            <p className="mt-1 text-sm text-muted">Removes the account and every report uploaded to it. This can’t be undone.</p>
          </div>
          <DeleteClientButton workspaceId={ws} />
        </div>
      </Card>
    </div>
  );
}

function SectionHeader({ id, title, description, aside }: { id: string; title: string; description: string; aside?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
      <div className="min-w-[14rem] flex-1">
        <h2 id={id} className="scroll-mt-6 text-lg">
          {title}
        </h2>
        <p className="mt-0.5 text-sm text-muted">{description}</p>
      </div>
      {aside}
    </div>
  );
}

function Tip({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="bg-surface px-5 py-3.5">
      <div className="text-xs font-medium">{title}</div>
      <p className="mt-0.5 text-xs leading-relaxed text-muted">{children}</p>
    </div>
  );
}

function Labelled({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted">{label}</span>
      <div className="mt-1.5">{children}</div>
      {hint && <span className="mt-1 block text-xs text-faint">{hint}</span>}
    </label>
  );
}

// Numeric input with a unit on either side (currency code, ×, %).
function Field({ label, prefix, suffix, ...props }: { label: string; prefix?: string; suffix?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium leading-snug text-muted">{label}</span>
      <span className="mt-auto flex items-center rounded-lg border border-line bg-bg transition-colors hover:border-faint focus-within:border-violet focus-within:ring-2 focus-within:ring-violet/20">
        {prefix && <span className="num select-none pl-3 text-xs text-faint">{prefix}</span>}
        <input
          inputMode="decimal"
          placeholder="Optional"
          autoComplete="off"
          {...props}
          className="num w-full min-w-0 bg-transparent px-3 py-2 text-sm outline-none placeholder:font-sans placeholder:text-faint focus-visible:outline-none!"
        />
        {suffix && <span className="num select-none pr-3 text-xs text-faint">{suffix}</span>}
      </span>
    </label>
  );
}

function Select({ children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="relative block">
      <select {...props} className={control + " cursor-pointer appearance-none pr-9"}>
        {children}
      </select>
      <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-faint" width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
        <path d="m3 4.5 3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
