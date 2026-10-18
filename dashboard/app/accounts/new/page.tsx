import { createWorkspace } from "@/app/actions";
import { Shell } from "@/components/Shell";
import { buttonClass } from "@/components/ui";
import { COUNTRIES, INDUSTRIES } from "@/lib/accountOptions";

export const metadata = { title: "Add an ad account" };

const input = "w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-violet";

export default function NewAccountPage() {
  return (
    <Shell>
      <div className="mx-auto max-w-lg px-4 py-10 md:px-8">
        <p className="label">Step 1 of 2</p>
        <h1 className="mt-1 text-3xl">Add your ad account</h1>
        <p className="mt-2 text-muted">The business or brand you run ads for. Next, you’ll upload an export from your ads manager.</p>
        <form action={createWorkspace} className="mt-6 space-y-4">
          <label className="block">
            <span className="text-sm font-medium">Business or brand name</span>
            <input name="name" required placeholder="e.g. Lotus Skincare" className={input + " mt-1"} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm font-medium">Industry</span>
              <select name="industry" className={input + " mt-1"} defaultValue="">
                <option value="">Choose…</option>
                {INDUSTRIES.map((i) => (
                  <option key={i}>{i}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium">Country</span>
              <select name="country" className={input + " mt-1"} defaultValue="">
                <option value="">Choose…</option>
                {COUNTRIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="block w-32">
            <span className="text-sm font-medium">Currency</span>
            <input name="currency" defaultValue="USD" maxLength={3} className={input + " mt-1 uppercase"} />
          </label>
          <p className="text-xs text-muted">Industry and country aren’t used to judge you today. They’ll let AdMate compare you with similar advertisers later, once there’s enough data.</p>
          <button className={buttonClass.primary}>Continue to upload</button>
        </form>
      </div>
    </Shell>
  );
}
