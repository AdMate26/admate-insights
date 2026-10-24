import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { sendAfterUpload } from "@/lib/telegram";
import { getDb } from "@/lib/db/client";
import { commitImport } from "@/lib/data/imports";
import { readUpload } from "@/lib/data/uploads";
import { getWorkspace } from "@/lib/data/workspaces";
import { isValidISO } from "@/lib/dates";
import { PLATFORMS } from "@/lib/ingest/headers";
import { normalizeTable } from "@/lib/ingest/normalize";
import type { CommitRequest } from "@/lib/ingest/preview-types";
import { OBJECTIVES } from "@/lib/metrics/objectives";
import { checkImportLimit, checkRowCount, checkUploadFile } from "@/lib/integration/limits";

export async function POST(request: Request) {
  const body = (await request.json()) as CommitRequest;
  const ws = await getWorkspace(body.workspaceId);
  if (!ws) return Response.json({ error: "Client not found." }, { status: 404 });
  // AdMate integration: only signed-in owners import, within the MVP limits (lib/integration/limits.ts).
  const user = await getCurrentUser();
  if (!user || user.readOnly) return Response.json({ error: "Please sign in." }, { status: 401 });
  const full = await checkImportLimit(ws.id);
  if (full) return Response.json({ error: full }, { status: 429 });
  const up = await readUpload(body.uploadId, ws.id);
  if (!up) return Response.json({ error: "Upload expired — please upload the file again." }, { status: 404 });
  const invalid = checkUploadFile(up.fileName, up.bytes);
  if (invalid) return Response.json({ error: invalid }, { status: 415 });
  if (!PLATFORMS.includes(body.platform)) return Response.json({ error: "Choose the ad platform." }, { status: 400 });
  if (!isValidISO(body.periodStart) || !isValidISO(body.periodEnd) || body.periodStart > body.periodEnd) {
    return Response.json({ error: "Enter a valid reporting period." }, { status: 400 });
  }

  const preview = normalizeTable(up.bytes, up.fileName, body.platform);
  if (preview.rows.length === 0) return Response.json({ error: "No campaign rows found in this file." }, { status: 422 });
  const tooMany = checkRowCount(preview.rows.length);
  if (tooMany) return Response.json({ error: tooMany }, { status: 413 });

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
  // Telegram "right away": the account's alerts on the new data, after the response.
  after(() => sendAfterUpload(user.id, ws.id).catch((err) => console.warn("[admate] telegram after upload failed:", err)));
  return Response.json({ importId, diff });
}
