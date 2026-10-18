import { randomUUID } from "node:crypto";
import { and, eq, gte, lte } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { entities, imports } from "@/lib/db/schema";
import { getWorkspace } from "@/lib/data/workspaces";
import { MAX_UPLOAD_MB, readUpload, saveUpload } from "@/lib/data/uploads";
import { PLATFORMS, type Platform } from "@/lib/ingest/headers";
import { nameKey, suggestMatches } from "@/lib/ingest/match";
import { normalizeTable } from "@/lib/ingest/normalize";
import type { PreviewResponse } from "@/lib/ingest/preview-types";
import { resultCount } from "@/lib/metrics/objectives";

const MAX_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  const workspaceId = String(form.get("workspaceId") ?? "");
  const override = String(form.get("platform") ?? "");
  const reuse = String(form.get("uploadId") ?? "");
  const ws = await getWorkspace(workspaceId);
  if (!ws) return Response.json({ error: "Client not found." }, { status: 404 });

  let uploadId: string;
  let fileName: string;
  let bytes: Buffer;
  if (file instanceof File) {
    if (file.size > MAX_BYTES) return Response.json({ error: `File is larger than ${MAX_UPLOAD_MB} MB. Export a shorter date range or fewer columns.` }, { status: 413 });
    if (!/\.(csv|tsv|txt|xlsx|xls)$/i.test(file.name)) return Response.json({ error: "Upload a .csv, .tsv or .xlsx export." }, { status: 415 });
    uploadId = randomUUID();
    fileName = file.name;
    bytes = Buffer.from(await file.arrayBuffer());
    await saveUpload(uploadId, fileName, bytes, workspaceId);
  } else if (reuse) {
    // Re-run the preview with a different platform choice.
    const up = await readUpload(reuse, workspaceId);
    if (!up) return Response.json({ error: "Upload expired — please upload the file again." }, { status: 404 });
    uploadId = reuse;
    fileName = up.fileName;
    bytes = up.bytes;
  } else {
    return Response.json({ error: "No file received." }, { status: 400 });
  }

  let preview;
  try {
    preview = normalizeTable(bytes, fileName, PLATFORMS.includes(override as Platform) ? (override as Platform) : undefined);
  } catch {
    return Response.json({ error: "We couldn't read this file. Export it again as .xlsx or .csv." }, { status: 422 });
  }

  const db = await getDb();
  const existing = preview.platform
    ? await db.select({ id: entities.id, name: entities.name, nameKey: entities.nameKey })
        .from(entities)
        .where(and(eq(entities.workspaceId, workspaceId), eq(entities.platform, preview.platform), eq(entities.level, "campaign")))
    : [];
  const exactKeys = new Set(existing.map((e) => e.nameKey));

  const byCampaign = new Map<string, PreviewResponse["campaigns"][number]>();
  for (const r of preview.rows) {
    const c = byCampaign.get(r.campaign) ?? {
      name: r.campaign, objective: r.objective, objectiveSource: r.objectiveSource, spend: 0, results: 0,
      status: r.status, exists: exactKeys.has(nameKey(r.campaign)),
    };
    c.spend += r.measures.spend;
    c.results += resultCount(r.measures, r.objective);
    byCampaign.set(r.campaign, c);
  }

  const overlaps = preview.platform && preview.period
    ? await db.select({ fileName: imports.fileName, periodStart: imports.periodStart, periodEnd: imports.periodEnd })
        .from(imports)
        .where(and(
          eq(imports.workspaceId, workspaceId), eq(imports.platform, preview.platform), eq(imports.status, "active"), eq(imports.kind, preview.breakdown ?? "performance"),
          lte(imports.periodStart, preview.period.end), gte(imports.periodEnd, preview.period.start),
        ))
    : [];

  const warnings = [...preview.warnings];
  if (preview.currency && preview.currency !== ws.currency) {
    warnings.unshift(`This export is in ${preview.currency} but ${ws.name} uses ${ws.currency}. Numbers are not converted.`);
  }

  const body: PreviewResponse = {
    uploadId,
    fileName,
    platform: preview.platform,
    level: preview.level,
    breakdown: preview.breakdown,
    granularity: preview.granularity,
    period: preview.period,
    currency: preview.currency,
    workspaceCurrency: ws.currency,
    attribution: preview.attribution,
    warnings,
    mapping: preview.mapping,
    rowCount: preview.rows.length,
    campaigns: [...byCampaign.values()].sort((x, y) => y.spend - x.spend),
    totals: {
      spend: preview.rows.reduce((s, r) => s + r.measures.spend, 0),
      impressions: preview.rows.reduce((s, r) => s + r.measures.impressions, 0),
    },
    suggestions: suggestMatches(preview.rows.map((r) => r.campaign), existing, exactKeys),
    overlaps,
  };
  return Response.json(body);
}
