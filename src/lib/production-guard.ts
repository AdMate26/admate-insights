/**
 * Refuses a Vercel Production build of this site that would break or bypass
 * the release path:
 *
 * - Production must be built from `main`. A Preview of another branch that is
 *   promoted to Production (Vercel rebuilds it with VERCEL_ENV=production)
 *   fails here, so the current production deployment stays live.
 * - Production must serve the AdMate dashboard: without ADMATE_DASHBOARD_ORIGIN
 *   /home and /demo would send people to a missing /app.
 *
 * Applies only when VERCEL_ENV is "production". Preview, local and other
 * (e.g. Lovable) builds are unaffected.
 */
export const PRODUCTION_BRANCH = "main";

type BuildEnv = Record<string, string | undefined>;

export function productionBuildProblems(env: BuildEnv): string[] {
  if (env["VERCEL_ENV"] !== "production") return [];
  const problems: string[] = [];
  const ref = env["VERCEL_GIT_COMMIT_REF"]?.trim();
  if (ref !== PRODUCTION_BRANCH) {
    problems.push(
      `Production builds must come from "${PRODUCTION_BRANCH}" (this build is from ${
        ref ? `"${ref}"` : "an unknown branch"
      }). Release by merging into ${PRODUCTION_BRANCH}; do not promote other branches.`,
    );
  }
  const origin = env["ADMATE_DASHBOARD_ORIGIN"]?.trim();
  if (!origin) {
    problems.push("ADMATE_DASHBOARD_ORIGIN must be set for Production builds.");
  } else if (!origin.startsWith("https://")) {
    problems.push("ADMATE_DASHBOARD_ORIGIN must be an https:// origin in Production.");
  }
  return problems;
}

export function assertProductionBuild(env: BuildEnv): void {
  const problems = productionBuildProblems(env);
  if (problems.length > 0) {
    throw new Error(`Refusing this Production build:\n- ${problems.join("\n- ")}`);
  }
}
