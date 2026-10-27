"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createWorkspaceForUpload } from "@/app/actions";
import { COUNTRIES, INDUSTRIES } from "@/lib/accountOptions";
import { track } from "@/lib/analytics";
import { rangeDays } from "@/lib/dates";
import { money, num } from "@/lib/format";
import { PLATFORM_LABEL, PLATFORMS, type Platform } from "@/lib/ingest/headers";
import type { PreviewResponse } from "@/lib/ingest/preview-types";
import { OBJECTIVE_DEFS, OBJECTIVES, type Objective } from "@/lib/metrics/objectives";
import { buttonClass, cx } from "./ui";
import { apiPath } from "@/lib/integration/paths";

const input = "num rounded-md border border-line bg-bg px-2 py-1.5 text-sm outline-none focus:border-violet";

// newAccount: the user is on the sample account, so the upload first creates
// their own account (named in the form above the drop zone) and goes there.
export function UploadFlow({ workspaceId: startId, maxMb, newAccount = false }: { workspaceId: string; maxMb: number; newAccount?: boolean }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const accountRef = useRef<HTMLFormElement>(null);
  const [workspaceId, setWorkspaceId] = useState(startId);
  const creating = newAccount && workspaceId === startId;
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [platform, setPlatform] = useState<Platform | "">("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [objectives, setObjectives] = useState<Record<string, Objective>>({});
  const [matches, setMatches] = useState<Record<string, string>>({});

  // first: a new file (not a re-read after changing the platform), for analytics.
  async function send(body: FormData, first = false) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(apiPath("/api/import/preview"), { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw Object.assign(new Error(json.error ?? "Upload failed."), { status: res.status });
      const p = json as PreviewResponse;
      setPreview(p);
      setPlatform(p.platform ?? "");
      setStart(p.period?.start ?? "");
      setEnd(p.period?.end ?? "");
      setObjectives({});
      setMatches(Object.fromEntries(p.suggestions.filter((s) => s.likely).map((s) => [s.incoming, s.existingId])));
      if (first) track("report_previewed", { platform: p.platform, level: p.level, granularity: p.granularity, rows: p.rowCount });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Upload failed.";
      setError(message);
      track("report_upload_failed", { stage: "reading_file", reason: failReason(e) });
    } finally {
      setBusy(false);
    }
  }

  async function upload(file: File) {
    // Checked here too: on Vercel an oversized request is refused before it reaches AdMate.
    const sizeKb = Math.round(file.size / 1024);
    track("report_upload_started", { file_type: fileType(file.name), size_kb: sizeKb, new_account: creating });
    if (file.size > maxMb * 1024 * 1024) {
      setError(`This file is larger than ${maxMb} MB. Export a shorter date range or fewer columns.`);
      track("report_upload_failed", { stage: "file_too_large", size_kb: sizeKb });
      return;
    }
    let id = workspaceId;
    if (creating) {
      const form = accountRef.current;
      if (!form?.reportValidity()) return;
      setBusy(true);
      setError(null);
      const res = await createWorkspaceForUpload(new FormData(form)).catch(() => ({ id: undefined, error: undefined }));
      setBusy(false);
      if (!res.id) {
        setError(res.error ?? "Couldn't create your account. Try again.");
        track("report_upload_failed", { stage: "creating_account", reason: res.error ? "refused" : "unknown" });
        return;
      }
      id = res.id;
      setWorkspaceId(id);
    }
    const fd = new FormData();
    fd.set("file", file);
    fd.set("workspaceId", id);
    void send(fd, true);
  }

  function changePlatform(p: Platform) {
    setPlatform(p);
    if (!preview) return;
    const fd = new FormData();
    fd.set("uploadId", preview.uploadId);
    fd.set("workspaceId", workspaceId);
    fd.set("platform", p);
    void send(fd);
  }

  async function commit() {
    if (!preview || !platform) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(apiPath("/api/import/commit"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ uploadId: preview.uploadId, workspaceId, platform, periodStart: start, periodEnd: end, objectives, matches }),
      });
      const json = await res.json();
      if (!res.ok) throw Object.assign(new Error(json.error ?? "Import failed."), { status: res.status });
      track("report_uploaded", {
        platform,
        level: preview.level,
        granularity: preview.granularity,
        breakdown: preview.breakdown ?? "none",
        rows: preview.rowCount,
        days: rangeDays(start, end),
        new_account: newAccount,
      });
      // A breakdown export feeds Audience insight; a performance export opens as a report.
      router.push(preview.breakdown ? `/c/${workspaceId}/audience?bd=${preview.breakdown}` : `/c/${workspaceId}?report=${json.importId}`);
      router.refresh();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Import failed.";
      setError(message);
      track("report_upload_failed", { stage: "saving", reason: failReason(e) });
      setBusy(false);
    }
  }

  if (!preview) {
    return (
      <div>
        {creating && (
          <form ref={accountRef} onSubmit={(e) => e.preventDefault()} className="mb-5 space-y-3 rounded-lg border border-line p-4">
            <div>
              <h2 className="text-base">Your ad account</h2>
              <p className="text-sm text-muted">Your report goes into a new account of your own. The sample account stays as it is.</p>
            </div>
            <label className="block">
              <span className="text-sm font-medium">Business or brand name</span>
              <input name="name" required maxLength={120} placeholder="e.g. your shop or brand" className={input + " mt-1 w-full"} />
            </label>
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_96px]">
              <label className="block">
                <span className="text-sm font-medium">Industry</span>
                <select name="industry" className={input + " mt-1 w-full"} defaultValue="">
                  <option value="">Choose…</option>
                  {INDUSTRIES.map((i) => (
                    <option key={i}>{i}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-medium">Country</span>
                <select name="country" className={input + " mt-1 w-full"} defaultValue="">
                  <option value="">Choose…</option>
                  {COUNTRIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-medium">Currency</span>
                <input name="currency" defaultValue="USD" maxLength={3} className={input + " mt-1 w-full uppercase"} />
              </label>
            </div>
          </form>
        )}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            const f = e.dataTransfer.files[0];
            if (f) void upload(f);
          }}
          className={cx("flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-14 text-center", drag ? "border-violet bg-violet-soft" : "border-line")}
        >
          <p className="text-lg font-medium">{busy ? "Reading your export…" : "Drop an export here"}</p>
          <p className="mt-1 text-sm text-muted">.xlsx, .csv or .tsv from Meta, Google Ads, TikTok or LinkedIn · up to {maxMb} MB</p>
          <button className={buttonClass.primary + " mt-4"} disabled={busy} onClick={() => fileRef.current?.click()}>
            Choose file
          </button>
          <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,.xlsx,.xls" className="hidden" onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void upload(f);
            }}
          />
        </div>
        {error && <p className="mt-3 text-sm text-bad">{error}</p>}
      </div>
    );
  }

  const p = preview;
  const periodOk = !!start && !!end && start <= end;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="label">Review before importing</p>
          <h2 className="text-xl break-all">{p.fileName}</h2>
          <p className="text-sm text-muted">
            {p.breakdown && <b className="font-medium text-violet">Breakdown for Audience insight · </b>}
            {num(p.rowCount)} rows · {p.level === "campaign" ? "campaign level" : p.level === "ad_group" ? "ad set / ad group level" : "ad level"} ·{" "}
            {p.granularity === "daily" ? "daily breakdown" : "one row per campaign for the period"} · {money(p.totals.spend, p.currency ?? p.workspaceCurrency)} spend
          </p>
        </div>
        <button className={buttonClass.quiet} onClick={() => setPreview(null)}>
          Choose another file
        </button>
      </div>

      {p.warnings.length > 0 && (
        <ul className="space-y-1 rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">
          {p.warnings.map((w) => (
            <li key={w}>• {w}</li>
          ))}
        </ul>
      )}
      {p.overlaps.length > 0 && (
        <p className="rounded-lg border border-line px-4 py-3 text-sm">
          This period overlaps {p.overlaps.length} earlier upload{p.overlaps.length > 1 ? "s" : ""} ({p.overlaps.map((o) => o.fileName).join(", ")}). The newest upload wins; you can undo it later.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium">Platform</span>
          <select className={input + " mt-1 w-full"} value={platform} onChange={(e) => changePlatform(e.target.value as Platform)}>
            <option value="" disabled>
              Choose…
            </option>
            {PLATFORMS.map((pl) => (
              <option key={pl} value={pl}>
                {PLATFORM_LABEL[pl]}
              </option>
            ))}
          </select>
        </label>
        <div>
          <span className="text-sm font-medium">Reporting period {p.period && <span className="text-xs font-normal text-muted">(from {p.period.source})</span>}</span>
          <div className="mt-1 flex items-center gap-2">
            <input type="date" className={input} value={start} disabled={p.granularity === "daily"} onChange={(e) => setStart(e.target.value)} />
            <span className="text-muted">–</span>
            <input type="date" className={cx(input, p.period?.guessed && "border-warn")} value={end} disabled={p.granularity === "daily"} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
      </div>

      {p.suggestions.length > 0 && (
        <div className="rounded-lg border border-line p-4">
          <h3 className="text-base">Same campaign as before?</h3>
          <p className="text-sm text-muted">These names are close to campaigns you uploaded earlier. Tick the ones that are the same campaign so their history connects.</p>
          <ul className="mt-2 space-y-1.5">
            {p.suggestions.map((s) => (
              <li key={s.incoming} className="flex flex-wrap items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={matches[s.incoming] === s.existingId}
                  onChange={(e) =>
                    setMatches((m) => {
                      const n = { ...m };
                      if (e.target.checked) n[s.incoming] = s.existingId;
                      else delete n[s.incoming];
                      return n;
                    })
                  }
                />
                <span className="font-medium">{s.incoming}</span>
                <span className="text-muted">↔</span>
                <span>{s.existingName}</span>
                <span className="num text-xs text-faint">{Math.round(s.score * 100)}% similar</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="label border-b border-line text-left">
              <th className="px-3 py-2 font-normal">Campaign</th>
              <th className="px-3 py-2 font-normal">Objective (judged by)</th>
              <th className="px-3 py-2 text-right font-normal">Spend</th>
              <th className="px-3 py-2 text-right font-normal">Results</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {p.campaigns.map((c) => {
              const value = objectives[c.name] ?? c.objective;
              return (
                <tr key={c.name}>
                  <td className="px-3 py-2">
                    {c.name}
                    {!c.exists && <span className="label ml-2 !text-[10px]">new</span>}
                  </td>
                  <td className="px-3 py-2">
                    <select
                      className={cx("rounded border bg-bg px-1 py-0.5 text-xs", c.objectiveSource === "default" && !objectives[c.name] ? "border-warn" : "border-line")}
                      value={value}
                      onChange={(e) => setObjectives((o) => ({ ...o, [c.name]: e.target.value as Objective }))}
                    >
                      {OBJECTIVES.map((o) => (
                        <option key={o} value={o}>
                          {OBJECTIVE_DEFS[o].label} ({OBJECTIVE_DEFS[o].kpiShort})
                        </option>
                      ))}
                    </select>
                    <span className="ml-2 text-[11px] text-faint">{objectives[c.name] ? "set by you" : `from ${c.objectiveSource.replace("_", " ")}`}</span>
                  </td>
                  <td className="num px-3 py-2 text-right">{money(c.spend, p.currency ?? p.workspaceCurrency)}</td>
                  <td className="num px-3 py-2 text-right">{num(c.results, true)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <details className="rounded-lg border border-line px-4 py-3 text-sm">
        <summary className="cursor-pointer font-medium">Column mapping ({p.mapping.filter((m) => m.field).length} of {p.mapping.length} columns used)</summary>
        <p className="mt-2 text-muted">Ratio columns (CTR, CPC, cost per result) are ignored on purpose: AdMate recalculates them from raw counts so every platform is measured the same way.</p>
        <ul className="mt-2 grid gap-x-6 gap-y-0.5 sm:grid-cols-2">
          {p.mapping.map((m) => (
            <li key={m.header} className={cx("flex justify-between gap-3", !m.field && "text-faint")}>
              <span className="truncate">{m.header}</span>
              <span className="num text-xs">{m.field ?? "ignored"}</span>
            </li>
          ))}
        </ul>
      </details>

      {error && <p className="text-sm text-bad">{error}</p>}
      <div className="flex justify-end gap-2">
        <button className={buttonClass.ghost} onClick={() => setPreview(null)} disabled={busy}>
          Cancel
        </button>
        <button className={buttonClass.primary} onClick={commit} disabled={busy || !platform || !periodOk || p.rowCount === 0}>
          {busy ? "Importing…" : `Import ${num(p.campaigns.length)} campaigns`}
        </button>
      </div>
    </div>
  );
}

// Analytics only gets a code for why an upload failed, never the message (it
// can contain the file name or values from the file).
function failReason(e: unknown): string {
  const status = e && typeof e === "object" && "status" in e ? Number((e as { status: unknown }).status) : NaN;
  if (Number.isInteger(status)) return `http_${status}`;
  return e instanceof TypeError ? "network" : "unknown";
}

// Analytics gets only the kind of file from a fixed list, never its name.
function fileType(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return ["csv", "tsv", "txt", "xls", "xlsx", "zip"].includes(ext) ? ext : "other";
}
