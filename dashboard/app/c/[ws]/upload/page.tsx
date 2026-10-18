import { UploadFlow } from "@/components/UploadFlow";
import { Card } from "@/components/ui";
import { MAX_UPLOAD_MB } from "@/lib/data/uploads";
import { requireWorkspace } from "@/lib/data/workspaces";
import { getCurrentUser } from "@/lib/auth/session";
import { SignInToChange } from "@/lib/integration/read-only";

export const metadata = { title: "Upload report" };

const GUIDES: { platform: string; steps: string[] }[] = [
  {
    platform: "Meta Ads Manager",
    steps: [
      "Open Ads Manager → Campaigns (or Ad sets / Ads for more detail) and pick the date range.",
      "Breakdown → By time → Day (recommended: unlocks trends, day-vs-day and tracking checks).",
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

// Add a new export. After importing, AdMate opens the dashboard for that report.
// On the sample account, the upload starts the user's own account instead.
export default async function UploadPage({ params }: PageProps<"/c/[ws]/upload">) {
  const { ws } = await params;
  const workspace = await requireWorkspace(ws);
  // AdMate integration: public demo visitors can't upload; signing up gives them their own account.
  const readOnly = !!(await getCurrentUser())?.readOnly;
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <p className="label">Upload report</p>
        <h1 className="mt-1 text-2xl">{workspace.isSample ? "Upload your own report" : "Add an export from your ads manager"}</h1>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Card className="min-w-0 p-5">
          {readOnly ? (
            <div className="space-y-3 text-sm">
              <p>Uploading needs a free AdMate account. Your reports are stored privately and only you can see them.</p>
              <SignInToChange what="upload your own report" />
            </div>
          ) : (
            <UploadFlow workspaceId={ws} maxMb={MAX_UPLOAD_MB} newAccount={workspace.isSample} />
          )}
        </Card>
      <aside className="space-y-4">
        <h2 className="text-lg">How to export</h2>
        {GUIDES.map((g) => (
          <details key={g.platform} className="rounded-lg border border-line px-4 py-3" open={g.platform.startsWith("Meta")}>
            <summary className="cursor-pointer text-sm font-medium">{g.platform}</summary>
            <ol className="mt-2 list-decimal space-y-1 pl-4 text-sm text-muted">
              {g.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </details>
        ))}
        <p className="text-xs text-muted">Breakdown exports (age & gender, location, placement, device, time of day) go to Audience insight and never change your campaign totals.</p>
        <p className="text-xs text-muted">Google Ads and LinkedIn exports haven’t been tested on real files yet. Check the column mapping in the preview before importing.</p>
        <p className="text-xs text-muted">Your reports are stored in AdMate’s database, and only your account can see them. They are never used to train AI models.</p>
      </aside>
      </div>
    </div>
  );
}
