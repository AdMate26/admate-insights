import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../db/client";
import { facts, imports, tiktokSyncImports } from "../db/schema";
import type { Tx } from "../data/imports";

// Rolling sync history (TIKTOK-SYNC-PLAN.md §3). Each TikTok sync is its own
// import. Only the KEEP_RECENT_SYNCS newest syncs of an advertiser stay "active"
// (undoable, listed one by one). Older ones become "history":
// - their stored rows are not moved or changed, so every number keeps its
//   source sync and its own set of available measures, and the analysis sees
//   exactly the same active rows
// - they can no longer be undone, and they don't count toward any limit
// - replaced copies that only an undo of a history sync could bring back are
//   deleted, which keeps storage bounded
// Everything runs inside the sync's own transaction: if any step fails, the
// sync and the consolidation roll back together.

export const KEEP_RECENT_SYNCS = 7;

/** Retires this advertiser's syncs beyond the newest `keep` into history, in this account only. */
export async function consolidateSyncHistory(tx: Tx, workspaceId: string, advertiserId: string, keep = KEEP_RECENT_SYNCS) {
  const recent = await tx
    .select({ id: imports.id })
    .from(tiktokSyncImports)
    .innerJoin(imports, and(eq(imports.id, tiktokSyncImports.importId), eq(imports.workspaceId, workspaceId)))
    .where(and(eq(tiktokSyncImports.workspaceId, workspaceId), eq(tiktokSyncImports.advertiserId, advertiserId), eq(imports.status, "active")))
    .orderBy(desc(imports.createdAt), desc(imports.id));
  const retire = recent.slice(keep).map((r) => r.id);
  if (retire.length) {
    await tx.update(imports).set({ status: "history" }).where(and(eq(imports.workspaceId, workspaceId), eq(imports.status, "active"), inArray(imports.id, retire)));
  }
  // Undo copies no undo can reach any more: rows replaced by a history sync of this account.
  const historySyncs = tx
    .select({ id: tiktokSyncImports.importId })
    .from(tiktokSyncImports)
    .innerJoin(imports, and(eq(imports.id, tiktokSyncImports.importId), eq(imports.workspaceId, workspaceId), eq(imports.status, "history")))
    .where(eq(tiktokSyncImports.workspaceId, workspaceId));
  const pruned = await tx
    .delete(facts)
    .where(and(eq(facts.workspaceId, workspaceId), eq(facts.active, false), inArray(facts.replacedBy, historySyncs)))
    .returning({ id: facts.id });
  return { retired: retire.length, pruned: pruned.length };
}

/** The account's sync imports (for the Reports page): import id → advertiser. */
export async function syncImportsOf(workspaceId: string): Promise<Map<string, string>> {
  const db = await getDb();
  const rows = await db
    .select({ importId: tiktokSyncImports.importId, advertiserId: tiktokSyncImports.advertiserId })
    .from(tiktokSyncImports)
    .innerJoin(imports, and(eq(imports.id, tiktokSyncImports.importId), eq(imports.workspaceId, workspaceId)))
    .where(eq(tiktokSyncImports.workspaceId, workspaceId));
  return new Map(rows.map((r) => [r.importId, r.advertiserId]));
}
