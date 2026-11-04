import { createWorkspace } from "@/app/actions";
import { Shell } from "@/components/Shell";
import { COUNTRIES, INDUSTRIES } from "@/lib/accountOptions";
import { requireUser } from "@/lib/auth/session";
import { listWorkspaces } from "@/lib/data/workspaces";
import { redirect } from "next/navigation";

export const metadata = { title: "Create a brand" };

export default async function NewAccountPage() {
  await requireUser();
  if (!(await listWorkspaces()).length) redirect("/");
  return (
    <Shell>
      <form action={createWorkspace} className="card formcard" style={{ maxWidth: 560 }}>
        <header>
          <div>
            <h2 style={{ fontSize: 20, marginTop: 4 }}>Create a brand</h2>
            <p>Set up a workspace for your business. You can upload an ad report when you’re ready.</p>
          </div>
        </header>
        <div className="pad" style={{ display: "grid", gap: 12 }}>
          <label className="field">
            <span>Business or brand name</span>
            <span className="in">
              <input name="name" required placeholder="Your business or brand name" style={{ fontFamily: "var(--font-display)" }} />
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
            Create brand
          </button>
        </div>
      </form>
    </Shell>
  );
}
