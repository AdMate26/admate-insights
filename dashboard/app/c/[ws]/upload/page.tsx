import { UploadFlow } from "@/components/UploadFlow";
import { PageHead } from "@/components/v5/PageHead";
import { V5Page } from "@/components/v5/page";
import { getCurrentUser } from "@/lib/auth/session";
import { MAX_UPLOAD_MB } from "@/lib/data/uploads";
import { getLevel } from "@/lib/data/settings";
import { requireWorkspace } from "@/lib/data/workspaces";
import { SignInToChange } from "@/lib/integration/read-only";

export const metadata = { title: "Upload report" };

const GUIDES: { platform: string; steps: string[] }[] = [
  {
    platform: "Meta Ads Manager",
    steps: [
      "Open Ads Manager → Campaigns (or Ad sets / Ads for more detail) and pick the date range.",
      "Breakdown → By time → Day (recommended: unlocks trends, day-by-day and tracking checks).",
      "Keep the Results, Result indicator, Amount spent, Impressions, Reach and Link clicks columns.",
      "Reports → Export table data → .xlsx or .csv.",
      "For Audience insight: export again with Breakdown → By delivery → Age and gender (or Region, Placement, Impression device), or By time → Time of day.",
    ],
  },
  {
    platform: "TikTok Ads Manager",
    steps: ["Campaign tab → choose the date range.", "Custom columns: Cost, Impressions, Reach, Clicks (destination), Conversions, Video views, Paid follows.", "Export → .xlsx. For daily data, use Reporting → Custom report with the Day dimension.", "For Audience insight: a custom report with Age and Gender, Province, Placement or Hour."],
  },
  { platform: "Google Ads", steps: ["Campaigns → set the date range.", "Segment → Time → Day.", "Download → .csv or Excel.", "For Audience insight: Insights and reports → Demographics, Locations, or When and where ads showed."] },
  { platform: "LinkedIn Campaign Manager", steps: ["Analyze → Campaign performance.", "Time breakdown → Daily.", "Export → .csv."] },
];

// Add a new export (prototype uploadHtml). On the sample account, the upload starts
// the user's own account instead, so the sample stays as it is.
export default async function UploadPage({ params }: PageProps<"/c/[ws]/upload">) {
  const { ws } = await params;
  const [workspace, level] = await Promise.all([requireWorkspace(ws), getLevel()]);
  const guides = level === "beginner" ? GUIDES.slice(0, 1) : GUIDES;
  // AdMate integration: public demo visitors can't upload; signing up gives them their own account.
  const readOnly = !!(await getCurrentUser())?.readOnly;
  return (
    <V5Page vm={null} page="upload">
      <PageHead title="Upload report" withPeriod={false} />
      <div className="uploadgrid">
        <div className="card">
          <div className="pad" style={{ display: "grid", gap: 12 }}>
            <h2 style={{ fontSize: 18 }}>{workspace.isSample ? "Upload your own report" : "Add an export from your ads manager"}</h2>
            <p className="muted">AdMate reads CSV or XLSX exports from Meta, TikTok, Google Ads and LinkedIn. It shows the platform and columns it found before anything is saved.</p>
            {readOnly ? (
              <div style={{ display: "grid", gap: 8 }}>
                <p>Uploading needs a free AdMate account. Your reports are stored privately and only you can see them.</p>
                <SignInToChange what="upload your own report" />
              </div>
            ) : (
              <UploadFlow workspaceId={ws} maxMb={MAX_UPLOAD_MB} newAccount={workspace.isSample} />
            )}
          </div>
        </div>
        <aside className="guides">
          <h2 style={{ fontSize: 17 }}>How to export</h2>
          {guides.map((g, i) => (
            <details key={g.platform} open={i === 0}>
              <summary>{g.platform}</summary>
              <ol>
                {g.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            </details>
          ))}
          <p className="small-note">Breakdown exports (age &amp; gender, location, placement, device, time of day) go to Audience insight and never change your campaign totals.</p>
          <p className="small-note">Google Ads and LinkedIn exports haven’t been tested on many real files yet. Check the column mapping in the preview before importing.</p>
          <p className="small-note">Your reports are stored in AdMate’s database and only your account can see them. They are never used to train AI models.</p>
        </aside>
      </div>
    </V5Page>
  );
}
