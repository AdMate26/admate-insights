import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db/client";
import { commitImport } from "@/lib/data/imports";
import { readUpload } from "@/lib/data/uploads";
import { getWorkspace } from "@/lib/data/workspaces";
import { isValidISO } from "@/lib/dates";
import { PLATFORMS } from "@/lib/ingest/headers";
import { normalizeTable } from "@/lib/ingest/normalize";
import type { CommitRequest } from "@/lib/ingest/preview-types";
import { OBJECTIVES } from "@/lib/metrics/objectives";

export async function POST(request: Request) {
  const body = (await request.json()) as CommitRequest;
  const ws = await getWorkspace(body.workspaceId);
  if (!ws) return Response.json({ error: "Client not found." }, { status: 404 });
  const up = await readUpload(body.uploadId, ws.id);
  if (!up) return Response.json({ error: "Upload expired — please upload the file again." }, { status: 404 });
  if (!PLATFORMS.includes(body.platform)) return Response.json({ error: "Choose the ad platform." }, { status: 400 });
  if (!isValidISO(body.periodStart) || !isValidISO(body.periodEnd) || body.periodStart > body.periodEnd) {
    return Response.json({ error: "Enter a valid reporting period." }, { status: 400 });
  }

  const preview = normalizeTable(up.bytes, up.fileName, body.platform);
  if (preview.rows.length === 0) return Response.json({ error: "No campaign rows found in this file." }, { status: 422 });

  // Daily rows carry their own dates; the confirmed period only frames snapshot rows.
  const rows = preview.rows.filter((r) => !r.date || (r.date >= body.periodStart && r.date <= body.periodEnd));
  const objectiveOverrides = Object.fromEntries(
    Object.entries(body.objectives ?? {}).filter(([, o]) => OBJECTIVES.includes(o)),
  );

  const db = await getDb();
  const { importId, diff } = await commitImport(db, {
    workspaceId: ws.id,
    fileName: up.fileName,
    platform: body.platform,
    level: preview.level,
    granularity: preview.granularity,
    period: { start: body.periodStart, end: body.periodEnd },
    currency: preview.currency,
    attribution: preview.attribution,
    warnings: preview.warnings,
    columns: preview.measuresPresent,
    rows,
    objectiveOverrides,
    matches: body.matches ?? {},
    breakdown: preview.breakdown,
  });
  revalidatePath("/", "layout");
  return Response.json({ importId, diff });
}
