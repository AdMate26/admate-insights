import { findingDetail, planDetail, type Detail } from "./detail";
import { computePlan, isOpen, type Plan } from "./plan";
import type { Analysis, Finding } from "./types";

// The lists behind Alerts, Recommendations and the sidebar badges. All of them
// come from the same campaign plan and findings, so every page agrees.

const open = (f: Finding) => f.status === "todo" || f.status === "in_review";

// Detected problems (tracking, landing page, creative fatigue, …).
export function alerts(a: Analysis): Finding[] {
  return a.findings.filter((f) => open(f) && f.bucket === "attention");
}

export function monitoring(a: Analysis): Finding[] {
  return a.findings.filter((f) => open(f) && f.bucket === "monitor");
}

// Everything going wrong, most urgent first: detected problems, plus campaigns
// that are clearly worse than expected (from the plan) — which needs no
// comparison period.
export function alertDetails(a: Analysis, plan: Plan[] = computePlan(a)): Detail[] {
  const problems = alerts(a);
  const withProblem = new Set(problems.map((f) => f.campaignId));
  const worse = plan.filter((p) => isOpen(p) && p.kind === "issue" && p.stance !== "fix" && !withProblem.has(p.row.info.id));
  // A problem on a campaign shows the campaign's priority (one priority per
  // campaign on every page; the plan already takes the problem's priority when
  // the problem decides the action).
  const planOf = new Map(plan.map((p) => [p.row.info.id, p]));
  const P = ["high", "medium", "low", "monitor"];
  return [
    ...problems.map((f) => {
      const d = findingDetail(a, f);
      const p = f.level === "campaign" && f.entityId ? planOf.get(f.entityId) : undefined;
      return p && p.kind === "issue" ? { ...d, priority: p.priority, priorityReason: planDetail(a, p).priorityReason } : d;
    }),
    ...worse.map((p) => planDetail(a, p)),
  ].sort((x, y) => P.indexOf(x.priority) - P.indexOf(y.priority));
}

// Sidebar badges for the selected period.
export function badgeCounts(a: Analysis): { alerts: number; recommendations: number } {
  const plan = computePlan(a);
  return {
    alerts: alertDetails(a, plan).length,
    recommendations: plan.filter((p) => isOpen(p) && p.priority === "high").length + alerts(a).filter((f) => f.level === "account").length,
  };
}
