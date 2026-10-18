import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { assertProductionBuild, productionBuildProblems } from "./production-guard";

const DASHBOARD = "https://admate-dashboard.vercel.app";
const good = {
  VERCEL_ENV: "production",
  VERCEL_GIT_COMMIT_REF: "main",
  ADMATE_DASHBOARD_ORIGIN: DASHBOARD,
};

test("a Production build from main with the dashboard origin passes", () => {
  expect(productionBuildProblems(good)).toEqual([]);
  expect(() => assertProductionBuild(good)).not.toThrow();
});

test("a promoted integration branch is refused in Production", () => {
  const env = { ...good, VERCEL_GIT_COMMIT_REF: "integration/admate-logic" };
  expect(() => assertProductionBuild(env)).toThrow(/must come from "main"/);
  expect(() => assertProductionBuild({ ...good, VERCEL_GIT_COMMIT_REF: undefined })).toThrow(
    /unknown branch/,
  );
});

test("Production without an https dashboard origin is refused", () => {
  expect(() => assertProductionBuild({ ...good, ADMATE_DASHBOARD_ORIGIN: undefined })).toThrow(
    /ADMATE_DASHBOARD_ORIGIN must be set/,
  );
  expect(() => assertProductionBuild({ ...good, ADMATE_DASHBOARD_ORIGIN: "  " })).toThrow(
    /must be set/,
  );
  expect(() =>
    assertProductionBuild({ ...good, ADMATE_DASHBOARD_ORIGIN: "http://localhost:3100" }),
  ).toThrow(/https/);
});

test("Preview, development and non-Vercel builds are never blocked", () => {
  for (const env of [
    { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "integration/admate-logic" },
    { VERCEL_ENV: "preview" },
    { VERCEL_ENV: "development" },
    {},
  ]) {
    expect(productionBuildProblems(env)).toEqual([]);
    expect(() => assertProductionBuild(env)).not.toThrow();
  }
});

test("the build config runs the guard", () => {
  const config = readFileSync(new URL("../../vite.config.ts", import.meta.url), "utf8");
  expect(config).toContain("assertProductionBuild(process.env);");
});
