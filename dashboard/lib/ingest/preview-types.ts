import type { Objective } from "../metrics/objectives";
import type { FieldKey, Platform } from "./headers";
import type { MatchSuggestion } from "./match";
import type { Granularity, Level } from "./normalize";
import type { BreakdownKind } from "./breakdown";

// What the upload screen shows before the user confirms an import.
export interface PreviewResponse {
  uploadId: string;
  fileName: string;
  platform: Platform | null;
  level: Level;
  breakdown: BreakdownKind | null;
  granularity: Granularity;
  period: { start: string; end: string; guessed: boolean; source: string } | null;
  currency: string | null;
  workspaceCurrency: string;
  attribution: string | null;
  warnings: string[];
  mapping: { header: string; field: FieldKey | null }[];
  rowCount: number;
  campaigns: {
    name: string;
    objective: Objective;
    objectiveSource: string;
    spend: number;
    results: number;
    status: string | null;
    exists: boolean;
  }[];
  totals: { spend: number; impressions: number };
  suggestions: MatchSuggestion[];
  overlaps: { fileName: string; periodStart: string; periodEnd: string }[];
}

export interface CommitRequest {
  uploadId: string;
  workspaceId: string;
  platform: Platform;
  periodStart: string;
  periodEnd: string;
  objectives: Record<string, Objective>;
  matches: Record<string, string>;
}
