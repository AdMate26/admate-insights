import { FAMILY_ORDER, type CampaignFinding } from "./analysis/engine";

/** Use the same objective IDs, labels and order as the existing campaign sections. */
export function campaignObjectiveOptions(findings: CampaignFinding[]) {
  return FAMILY_ORDER.flatMap((id) => {
    const finding = findings.find((f) => f.objectiveFamily === id);
    return finding ? [{ id, label: finding.objectiveLabel }] : [];
  });
}

export function filterCampaignObjectives(findings: CampaignFinding[], requested: unknown) {
  const options = campaignObjectiveOptions(findings);
  const objective = options.find((option) => option.id === requested)?.id;
  return {
    options,
    objective,
    findings: objective ? findings.filter((f) => f.objectiveFamily === objective) : findings,
  };
}
