import { describe, expect, it } from "vitest";
import { isLevel, LEVELS, MENUS, PAGE_HREF, pageFor, pageLabel, parseAccountPath, PAGES } from "@/lib/levels";

describe("the three views", () => {
  it("reads account pages from the address, and nothing else", () => {
    expect(parseAccountPath("/c/abc-123")).toEqual({ ws: "abc-123", page: "overview" });
    expect(parseAccountPath("/c/abc/actions")).toEqual({ ws: "abc", page: "actions" });
    expect(parseAccountPath("/c/abc/explorer/")).toEqual({ ws: "abc", page: "explorer" });
    expect(parseAccountPath("/c/abc/nope")).toBeNull();
    expect(parseAccountPath("/c/abc/actions/more")).toBeNull();
    expect(parseAccountPath("/accounts/new")).toBeNull();
    expect(parseAccountPath("//evil.example/c/abc")).toBeNull();
  });

  it("switching keeps you on the same subject", () => {
    expect(pageFor("beginner", "explorer")).toBe("campaigns");
    expect(pageFor("beginner", "budget")).toBe("campaigns");
    expect(pageFor("beginner", "audience")).toBe("overview");
    expect(pageFor("beginner", "reports")).toBe("overview");
    expect(pageFor("intermediate", "portfolio")).toBe("overview");
    expect(pageFor("intermediate", "explorer")).toBe("campaigns");
    for (const level of LEVELS) for (const page of ["overview", "actions", "campaigns"] as const) expect(pageFor(level, page)).toBe(page);
  });

  it("every view has a home, a decisions page with its badge, and campaigns", () => {
    for (const level of LEVELS) {
      const items = MENUS[level].flatMap((g) => g.items);
      expect(items.map((i) => i.page)).toEqual(expect.arrayContaining(["overview", "actions", "campaigns", "upload", "settings"]));
      expect(items.find((i) => i.page === "actions")?.badge).toBe("actions");
      expect(new Set(items.map((i) => i.page)).size).toBe(items.length);
    }
  });

  it("each view names the same pages its own way", () => {
    expect(pageLabel("beginner", "actions")).toBe("To-do");
    expect(pageLabel("intermediate", "actions")).toBe("Optimize");
    expect(pageLabel("advanced", "actions")).toBe("Actions");
    expect(pageLabel("beginner", "campaigns")).toBe("My ads");
  });

  it("every page has an address and levels are checked", () => {
    for (const p of PAGES) expect(typeof PAGE_HREF[p]).toBe("string");
    expect(isLevel("advanced")).toBe(true);
    expect(isLevel("expert")).toBe(false);
    expect(isLevel(undefined)).toBe(false);
  });
});
