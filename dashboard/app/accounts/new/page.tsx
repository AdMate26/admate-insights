import { createWorkspace } from "@/app/actions";
import { Shell } from "@/components/Shell";
import { COUNTRIES, INDUSTRIES } from "@/lib/accountOptions";

export const metadata = { title: "Add an ad account" };

// Step 1 of 2 (prototype "Add an ad account"): the business, then its first upload.
export default function NewAccountPage() {
  return (
    <Shell>
      <form action={createWorkspace} className="card formcard" style={{ maxWidth: 560 }}>
        <header>
          <div>
            <span className="label">Step 1 of 2</span>
            <h2 style={{ fontSize: 20, marginTop: 4 }}>Add your ad account</h2>
            <p>The business or brand you run ads for. Next, you’ll upload an export from your ads manager.</p>
          </div>
        </header>
        <div className="pad" style={{ display: "grid", gap: 12 }}>
          <label className="field">
            <span>Business or brand name</span>
            <span className="in">
              <input name="name" required placeholder="e.g. Lotus Skincare" style={{ fontFamily: "var(--font-display)" }} />
            </span>
          </label>
          <div className="fields">
            <label className="field">
              <span>Industry</span>
              <span className="in">
                <select name="industry" defaultValue="">
                  <option value="">Choose…</option>
                  {INDUSTRIES.map((i) => (
                    <option key={i}>{i}</option>
                  ))}
                </select>
              </span>
            </label>
            <label className="field">
              <span>Country</span>
              <span className="in">
                <select name="country" defaultValue="">
                  <option value="">Choose…</option>
                  {COUNTRIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </span>
            </label>
            <label className="field">
              <span>Currency</span>
              <span className="in">
                <input name="currency" defaultValue="USD" maxLength={3} style={{ textTransform: "uppercase" }} />
              </span>
            </label>
          </div>
          <p className="small-note">Industry and country aren’t used to judge you today. They’ll let AdMate compare you with similar advertisers later, once there’s enough data.</p>
        </div>
        <div className="formfoot">
          <span>You can change these later in Goals &amp; settings.</span>
          <button className="btn primary" type="submit">
            Continue to upload
          </button>
        </div>
      </form>
    </Shell>
  );
}
