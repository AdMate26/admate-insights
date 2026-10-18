"use server";

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { entities, goals, recStatus, workspaces } from "@/lib/db/schema";
import { undoImport } from "@/lib/data/imports";
import { baselineFor, loadAnalysis, requireWorkspace } from "@/lib/data/workspaces";
import type { SelectionParams } from "@/lib/analysis/periods";
import { kpiLabel, OBJECTIVES, type Objective } from "@/lib/metrics/objectives";
import { isRole, type Role } from "@/lib/analysis/roles";
import { createSampleAccount } from "@/lib/sample/load";
import { addDays, toISO } from "@/lib/dates";

// Server actions are public endpoints: every action below signs the user in
// (requireUser) or checks they own the account (requireWorkspace) first.

async function insertWorkspace(formData: FormData): Promise<string | null> {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim().slice(0, 120);
  if (!name) return null;
  const currency = String(formData.get("currency") ?? "USD").trim().toUpperCase().slice(0, 3) || "USD";
  const industry = String(formData.get("industry") ?? "").trim() || null;
  const country = String(formData.get("country") ?? "").trim() || null;
  const id = randomUUID();
  const db = await getDb();
  await db.insert(workspaces).values({ id, ownerId: user.id, name, currency, industry, country });
  return id;
}

export async function createWorkspace(formData: FormData) {
  const id = await insertWorkspace(formData);
  if (!id) return;
  revalidatePath("/", "layout");
  redirect(`/c/${id}/upload`);
}

// Upload report on the sample account: the user's first real report goes into
// a new account of their own, so the sample stays untouched. No redirect — the
// upload screen carries on with the new account.
export async function createWorkspaceForUpload(formData: FormData): Promise<{ id?: string; error?: string }> {
  const id = await insertWorkspace(formData);
  return id ? { id } : { error: "Enter your business or brand name first." };
}

export async function loadSampleData() {
  const user = await requireUser();
  const id = await createSampleAccount(user.id);
  revalidatePath("/", "layout");
  redirect(`/c/${id}`);
}

// The user's decision on a finding. "done" also stores the item's numbers at
// that moment, so AdMate can check later whether the change worked.
export async function setFindingStatus(
  workspaceId: string,
  key: string,
  status: "done" | "dismissed" | "snoozed" | "in_review" | "todo",
  title: string,
  selection: SelectionParams,
  reason?: string,
  // "Remind me later": how many days to hide it (default 7).
  remindDays?: number,
) {
  await requireWorkspace(workspaceId);
  const db = await getDb();
  if (status === "todo") {
    await db.delete(recStatus).where(and(eq(recStatus.workspaceId, workspaceId), eq(recStatus.key, key)));
  } else {
    const today = toISO(new Date());
    let baseline: unknown = null;
    if (status === "done") {
      const a = await loadAnalysis(workspaceId, selection);
      const f = a?.findings.find((x) => x.key === key);
      if (f && a) {
        const b = baselineFor(f, a);
        baseline = b ? { ...b, recheckDays: f.recheckDays } : { recheckDays: f.recheckDays };
      } else if (a && key.startsWith("plan:")) {
        // A campaign plan card: key = plan:<level>:<id>:<stance>
        const [, level, id] = key.split(":");
        const row = (level === "campaign" ? a.campaigns : level === "ad_group" || level === "ad" ? a.byLevel[level] : []).find((x) => x.info.id === id);
        if (row && row.kpiB !== null) {
          baseline = { level, entityId: row.info.id, objective: row.info.objective, mode: row.mode, kpiLabel: kpiLabel(row.info.objective, row.mode), kpi: row.kpiB, periodEnd: a.selection.b.to, recheckDays: 7 };
        }
      }
    }
    const values = {
      workspaceId, key, status, title,
      dismissReason: status === "dismissed" ? reason ?? null : null,
      snoozeUntil: status === "snoozed" ? addDays(today, remindDays && remindDays >= 1 && remindDays <= 30 ? Math.round(remindDays) : 7) : null,
      doneAt: status === "done" ? today : null,
      baseline,
      updatedAt: new Date(),
    };
    await db.insert(recStatus).values(values).onConflictDoUpdate({ target: [recStatus.workspaceId, recStatus.key], set: values });
  }
  revalidatePath("/", "layout");
}

// "Use this as your target" from the goal status card.
export async function setTarget(workspaceId: string, objective: Objective, value: number) {
  if (!OBJECTIVES.includes(objective) || !(value > 0)) return;
  await requireWorkspace(workspaceId);
  const db = await getDb();
  await db.insert(goals).values({ workspaceId, objective, target: value }).onConflictDoUpdate({ target: [goals.workspaceId, goals.objective], set: { target: value } });
  revalidatePath("/", "layout");
}

function numOrNull(v: FormDataEntryValue | null): number | null {
  if (v === null) return null;
  const n = parseFloat(String(v).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function saveSettings(workspaceId: string, formData: FormData) {
  await requireWorkspace(workspaceId);
  const db = await getDb();
  const name = String(formData.get("name") ?? "").trim();
  const currency = String(formData.get("currency") ?? "").trim().toUpperCase();
  const country = String(formData.get("country") ?? "").trim() || null;
  const industry = String(formData.get("industry") ?? "").trim() || null;
  if (name) await db.update(workspaces).set({ name, country, industry, ...(currency ? { currency } : {}) }).where(eq(workspaces.id, workspaceId));
  for (const objective of OBJECTIVES) {
    if (!formData.has(`${objective}.target`)) continue;
    const values = {
      target: numOrNull(formData.get(`${objective}.target`)),
      marginPct: numOrNull(formData.get(`${objective}.margin`)),
      leadToCustomerPct: numOrNull(formData.get(`${objective}.close`)),
      profitPerCustomer: numOrNull(formData.get(`${objective}.profit`)),
    };
    await db.insert(goals).values({ workspaceId, objective, ...values }).onConflictDoUpdate({ target: [goals.workspaceId, goals.objective], set: values });
  }
  revalidatePath("/", "layout");
}

export async function setCampaignObjective(workspaceId: string, campaignId: string, objective: Objective) {
  if (!OBJECTIVES.includes(objective)) return;
  await requireWorkspace(workspaceId);
  const db = await getDb();
  await db.update(entities).set({ objective, objectiveSource: "user" }).where(and(eq(entities.id, campaignId), eq(entities.workspaceId, workspaceId)));
  revalidatePath("/", "layout");
}

// The campaign's funnel role. null = go back to guessing it from the name.
export async function setCampaignRole(workspaceId: string, campaignId: string, role: Role | null) {
  if (role !== null && !isRole(role)) return;
  await requireWorkspace(workspaceId);
  const db = await getDb();
  await db.update(entities).set({ role }).where(and(eq(entities.id, campaignId), eq(entities.workspaceId, workspaceId), eq(entities.level, "campaign")));
  revalidatePath("/", "layout");
}

export async function undoImportAction(workspaceId: string, importId: string) {
  await requireWorkspace(workspaceId);
  const db = await getDb();
  await undoImport(db, workspaceId, importId);
  revalidatePath("/", "layout");
}

export async function deleteWorkspace(workspaceId: string) {
  await requireWorkspace(workspaceId);
  const db = await getDb();
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
  revalidatePath("/", "layout");
  redirect("/");
}
