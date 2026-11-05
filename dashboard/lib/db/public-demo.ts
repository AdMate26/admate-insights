import "server-only";
import path from "node:path";
import type { DB } from "./client";
import * as schema from "./schema";
import { PUBLIC_DEMO_OWNER, PUBLIC_DEMO_WORKSPACE } from "../integration/public-demo";
import { insertSampleAccount } from "../sample/load";

const globalForDemo = globalThis as unknown as { __admatePublicDemoDb?: Promise<DB> };

async function createDemoDb(): Promise<DB> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const client = new PGlite();
  try {
    const db = drizzle({ client, schema });
    await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
    await db.insert(schema.users).values({
      id: PUBLIC_DEMO_OWNER,
      email: "public-demo@system.admate.invalid",
      passwordHash: "!public-demo-cannot-sign-in",
    });
    await insertSampleAccount(db as unknown as DB, PUBLIC_DEMO_OWNER, PUBLIC_DEMO_WORKSPACE);
    return db as unknown as DB;
  } catch (error) {
    await client.close();
    throw error;
  }
}

// No connection URL, sessions or customer database are used. Failed initialization
// retries on the next request and never falls back to the private database.
export function getPublicDemoDb(): Promise<DB> {
  if (!globalForDemo.__admatePublicDemoDb) {
    globalForDemo.__admatePublicDemoDb = createDemoDb().catch((error) => {
      delete globalForDemo.__admatePublicDemoDb;
      throw error;
    });
  }
  return globalForDemo.__admatePublicDemoDb;
}
