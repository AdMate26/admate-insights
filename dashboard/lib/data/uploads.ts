import "server-only";
import { and, eq, lt } from "drizzle-orm";
import { getDb } from "../db/client";
import { uploads } from "../db/schema";

// Uploaded files wait in the database between preview and commit (and for
// re-running the preview with another platform). On Vercel those requests can
// reach different servers, so a local file would not be found. Files older than
// a day are removed; the imported rows themselves are kept.
const KEEP_MS = 24 * 60 * 60 * 1000;

// Vercel functions accept request bodies up to 4.5 MB; locally there is no such limit.
export const MAX_UPLOAD_MB = process.env.VERCEL ? 4 : 50;

export async function saveUpload(id: string, fileName: string, bytes: Buffer, workspaceId: string) {
  const db = await getDb();
  await db.delete(uploads).where(lt(uploads.createdAt, new Date(Date.now() - KEEP_MS)));
  await db.insert(uploads).values({ id, workspaceId, fileName, bytes });
}

export async function readUpload(id: string, workspaceId: string): Promise<{ fileName: string; bytes: Buffer } | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const db = await getDb();
  const [row] = await db.select().from(uploads).where(and(eq(uploads.id, id), eq(uploads.workspaceId, workspaceId)));
  // node-postgres returns a Buffer, PGlite a Uint8Array.
  return row ? { fileName: row.fileName, bytes: Buffer.from(row.bytes) } : null;
}
