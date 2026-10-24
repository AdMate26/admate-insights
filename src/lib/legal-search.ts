/** Search params for /privacy and /terms: `?from=login` adds a way back to sign-in. */
export type LegalSearch = { from?: "login" };

export function validateLegalSearch(search: Record<string, unknown>): LegalSearch {
  return search["from"] === "login" ? { from: "login" } : {};
}
