import "server-only";
import { asc, eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { alertRules, alertSettings, campaignTargets } from "../db/schema";
import { isRuleMetric, parseAlertConfig, type AlertConfig, type CampaignTargets, type Rule } from "../analysis/alerts";
import { getWorkspace } from "./workspaces";

// The account's alert settings, the user's own KPI alerts and campaign targets.
// Reads go through getWorkspace, so only the signed-in owner's accounts are read.

export async function getAlertConfig(workspaceId: string): Promise<AlertConfig> {
  if (!(await getWorkspace(workspaceId))) return parseAlertConfig(null);
  return readConfig(workspaceId);
}
async function readConfig(workspaceId: string): Promise<AlertConfig> {
  const db = await getDb();
  const [row] = await db.select({ config: alertSettings.config }).from(alertSettings).where(eq(alertSettings.workspaceId, workspaceId));
  return parseAlertConfig(row?.config);
}

export async function listRules(workspaceId: string): Promise<Rule[]> {
  if (!(await getWorkspace(workspaceId))) return [];
  return readRules(workspaceId);
}
async function readRules(workspaceId: string): Promise<Rule[]> {
  const db = await getDb();
  const rows = await db.select().from(alertRules).where(eq(alertRules.workspaceId, workspaceId)).orderBy(asc(alertRules.createdAt));
  return rows.flatMap((r) => (isRuleMetric(r.metric) && (r.op === "by" || r.op === "above" || r.op === "below") ? [{ id: r.id, metric: r.metric, op: r.op, value: r.value, scope: r.scope, on: r.on }] : []));
}

export async function getCampaignTargets(workspaceId: string): Promise<CampaignTargets> {
  if (!(await getWorkspace(workspaceId))) return {};
  return readTargets(workspaceId);
}
async function readTargets(workspaceId: string): Promise<CampaignTargets> {
  const db = await getDb();
  const rows = await db.select().from(campaignTargets).where(eq(campaignTargets.workspaceId, workspaceId));
  return Object.fromEntries(rows.map((r) => [r.campaignId, { mode: r.mode, value: r.value }]));
}

// Everything the alert checks need, in one read.
export async function alertState(workspaceId: string) {
  const [config, rules, targets] = await Promise.all([getAlertConfig(workspaceId), listRules(workspaceId), getCampaignTargets(workspaceId)]);
  return { config, rules, targets };
}

// Server-side jobs only (scheduled alerts): no signed-in user to check against.
export async function alertStateTrusted(workspaceId: string) {
  const [config, rules, targets] = await Promise.all([readConfig(workspaceId), readRules(workspaceId), readTargets(workspaceId)]);
  return { config, rules, targets };
}
