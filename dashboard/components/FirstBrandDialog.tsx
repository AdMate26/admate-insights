import { createWorkspace } from "@/app/actions";
import { signOut } from "@/app/(auth)/actions";
import { INDUSTRIES } from "@/lib/accountOptions";
import { AppIcon } from "./Logo";

export function FirstBrandDialog({ error }: { error?: "name" | "industry" }) {
  return (
    <main className="v5 brand-onboarding" id="v5root">
      <section className="onboard brand-onboarding-dialog" role="dialog" aria-modal="true" aria-labelledby="first-brand-title" aria-describedby="first-brand-description">
        <div className="brand-onboarding-heading">
          <AppIcon size={42} />
          <h1 id="first-brand-title">Create your brand</h1>
          <p className="muted" id="first-brand-description">Enter your brand name and industry to open your dashboard.</p>
        </div>
        <form action={createWorkspace} className="brand-onboarding-form">
          {error && <p className="errbox" role="alert">{error === "name" ? "Enter your brand name." : "Choose your brand’s industry."}</p>}
          <label className="field">
            <span>Brand name</span>
            <span className="in">
              <input name="name" type="text" required maxLength={120} pattern={".*\\S.*"} autoComplete="organization" placeholder="Your brand name" aria-invalid={error === "name" || undefined} />
            </span>
          </label>
          <label className="field">
            <span>Industry</span>
            <span className="in">
              <select name="industry" defaultValue="" required aria-invalid={error === "industry" || undefined}>
                <option value="" disabled>Choose an industry</option>
                {INDUSTRIES.map((industry) => <option key={industry}>{industry}</option>)}
              </select>
            </span>
          </label>
          <button className="btn primary" type="submit">Create brand</button>
        </form>
        <form className="brand-onboarding-signout" action={signOut}>
          <button className="btn" type="submit">Sign out</button>
        </form>
      </section>
    </main>
  );
}
