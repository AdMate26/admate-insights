// A campaign's role in the funnel (MRD FR-07). Retargeting and existing-customer
// campaigns are structurally cheaper than prospecting, so AdMate only compares
// campaigns (and ad sets, ads) with others of the same role.

export const ROLES = ["prospecting", "retargeting", "existing", "brand"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  prospecting: "Prospecting",
  retargeting: "Retargeting",
  existing: "Existing customers",
  brand: "Brand search",
};

export type RoleSource = "user" | "name" | "parent" | "default";

// Naming conventions advertisers use. Order matters: the first match wins.
const RULES: [RegExp, Role][] = [
  [/\b(existing|retention|loyal(ty)?|repeat|past (buyers|purchasers|customers)|customer ?list|crm|upsell|win ?back)\b/i, "existing"],
  [/(re-?target|remarket|\brmkt\b|\brt\b|\bwarm\b|\batc\b|add(ed)? to cart|cart abandon|engagers?\b|visitors?\b|\bdpa\b|website custom|custom audience|\b(7|14|30|45|60|90|180|365) ?d(ays?)?\b)/i, "retargeting"],
  [/\b(branded|brand (search|terms|keywords?)|brand kw)\b/i, "brand"],
];

export function roleFromName(name: string | null | undefined): Role | null {
  if (!name) return null;
  for (const [re, role] of RULES) if (re.test(name)) return role;
  return null;
}

export function isRole(v: unknown): v is Role {
  return typeof v === "string" && (ROLES as readonly string[]).includes(v);
}

// The role of an item: the user's choice, else its own name, else its parent's
// (ad set for ads, campaign for ad sets), else prospecting.
export function resolveRole(own: { role?: Role | null; name: string }, parents: { role: Role; source: RoleSource } | null, parentName?: string | null): { role: Role; source: RoleSource } {
  if (own.role) return { role: own.role, source: "user" };
  const byName = roleFromName(own.name);
  if (byName) return { role: byName, source: "name" };
  const byParentName = roleFromName(parentName);
  if (byParentName) return { role: byParentName, source: "parent" };
  if (parents && parents.source !== "default") return { role: parents.role, source: "parent" };
  return { role: "prospecting", source: "default" };
}
