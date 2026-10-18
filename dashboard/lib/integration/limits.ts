import "server-only";
import { and, count, eq, gte, inArray } from "drizzle-orm";
import { getDb } from "../db/client";
import { imports, uploads, workspaces } from "../db/schema";

// Upload and account limits for the multi-user MVP (AdMate integration,
// INTEGRATION.md). Conservative on purpose; raise them deliberately.
export const LIMITS = {
  maxFileBytes: 4 * 1024 * 1024, // Vercel's request limit is 4.5 MB
  maxUnzippedBytes: 60 * 1024 * 1024, // .xlsx files are zip archives
  maxZipEntries: 2000,
  uploadsPerHour: 20, // per user
  accountsPerUser: 5, // own accounts, not counting the sample
  importsPerAccount: 50, // active reports per account
  rowsPerImport: 50_000,
};

const MB = (n: number) => `${Math.round(n / 1024 / 1024)} MB`;

// Checks the file itself, not only its name: a real spreadsheet or text export,
// within size, and not a compressed "zip bomb" that would explode when parsed.
// Returns an error message, or null when the file may be parsed.
export function checkUploadFile(fileName: string, bytes: Uint8Array): string | null {
  const ext = /\.([a-z0-9]+)$/i.exec(fileName)?.[1]?.toLowerCase() ?? "";
  if (!["csv", "tsv", "txt", "xlsx", "xls"].includes(ext)) return "Upload a .csv, .tsv or .xlsx export.";
  if (bytes.length === 0) return "This file is empty.";
  if (bytes.length > LIMITS.maxFileBytes) return `File is larger than ${MB(LIMITS.maxFileBytes)}. Export a shorter date range or fewer columns.`;
  const zip = bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
  const ole = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every((b, i) => bytes[i] === b);
  if (ext === "xlsx") {
    if (!zip) return "This isn't a valid .xlsx file. Export it again from your ads manager.";
    return checkZip(bytes);
  }
  if (ext === "xls") {
    if (zip) return checkZip(bytes); // an .xlsx saved with the old extension
    if (ole || looksLikeText(bytes)) return null;
    return "This isn't a valid .xls file. Export it again as .xlsx or .csv.";
  }
  if (!looksLikeText(bytes)) return "This doesn't look like a CSV or text export. Export it again as .csv or .xlsx.";
  return null;
}

function looksLikeText(bytes: Uint8Array): boolean {
  const n = Math.min(bytes.length, 64 * 1024);
  for (let i = 0; i < n; i++) if (bytes[i] === 0) return false;
  return true;
}

// Reads the zip's central directory (without unpacking) and checks the total
// uncompressed size and number of entries.
function checkZip(bytes: Uint8Array): string | null {
  const bad = "This .xlsx file can't be read safely. Export it again from your ads manager.";
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return bad;
  const entries = view.getUint16(eocd + 10, true);
  const cdOffset = view.getUint32(eocd + 16, true);
  if (entries === 0xffff || cdOffset === 0xffffffff) return bad; // zip64: not expected from ads exports
  if (entries > LIMITS.maxZipEntries) return bad;
  let p = cdOffset;
  let total = 0;
  for (let k = 0; k < entries; k++) {
    if (p + 46 > bytes.length || view.getUint32(p, true) !== 0x02014b50) return bad;
    const size = view.getUint32(p + 24, true);
    if (size === 0xffffffff) return bad;
    total += size;
    if (total > LIMITS.maxUnzippedBytes) return "This .xlsx file is too large once unpacked. Export a shorter date range or fewer columns.";
    p += 46 + view.getUint16(p + 28, true) + view.getUint16(p + 30, true) + view.getUint16(p + 32, true);
  }
  return null;
}

async function ownWorkspaceIds(userId: string): Promise<string[]> {
  const db = await getDb();
  const rows = await db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.ownerId, userId));
  return rows.map((r) => r.id);
}

export async function checkUploadRate(userId: string): Promise<string | null> {
  const ids = await ownWorkspaceIds(userId);
  if (!ids.length) return null;
  const db = await getDb();
  const [{ n }] = await db
    .select({ n: count() })
    .from(uploads)
    .where(and(inArray(uploads.workspaceId, ids), gte(uploads.createdAt, new Date(Date.now() - 60 * 60 * 1000))));
  return n >= LIMITS.uploadsPerHour ? `You've uploaded ${LIMITS.uploadsPerHour} files in the last hour. Please try again later.` : null;
}

export async function checkAccountLimit(userId: string): Promise<string | null> {
  const db = await getDb();
  const [{ n }] = await db
    .select({ n: count() })
    .from(workspaces)
    .where(and(eq(workspaces.ownerId, userId), eq(workspaces.isSample, false)));
  return n >= LIMITS.accountsPerUser ? `You can have up to ${LIMITS.accountsPerUser} ad accounts for now. Delete one in Targets & settings to add another.` : null;
}

export async function checkImportLimit(workspaceId: string): Promise<string | null> {
  const db = await getDb();
  const [{ n }] = await db
    .select({ n: count() })
    .from(imports)
    .where(and(eq(imports.workspaceId, workspaceId), eq(imports.status, "active")));
  return n >= LIMITS.importsPerAccount ? `This account already has ${LIMITS.importsPerAccount} reports. Undo an old one in Reports to add another.` : null;
}

export function checkRowCount(rows: number): string | null {
  return rows > LIMITS.rowsPerImport ? `This file has more than ${LIMITS.rowsPerImport.toLocaleString("en-US")} rows. Export a shorter date range or fewer levels.` : null;
}
