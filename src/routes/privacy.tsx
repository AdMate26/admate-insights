import { createFileRoute } from "@tanstack/react-router";

import { ContactLink, LegalPage } from "@/components/landing/LegalPage";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — AdMate" },
      { name: "description", content: "How AdMate collects, uses and protects your information." },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <section>
        <p>
          AdMate is an AI marketing analyst for ad managers. This policy explains what information
          AdMate collects when you use www.admate.site, why, and the choices you have. Questions:{" "}
          <ContactLink />.
        </p>
      </section>

      <section>
        <h2>Information we collect</h2>
        <ul>
          <li>
            <strong className="text-foreground">Account information:</strong> your email address. If
            you sign in with Google, we also receive your name and profile picture from Google.
          </li>
          <li>
            <strong className="text-foreground">Data you upload:</strong> the ad reports you upload
            (for example Meta, TikTok, Google Ads or LinkedIn exports), the analysis AdMate creates
            from them, and the decisions you record in the app.
          </li>
          <li>
            <strong className="text-foreground">Technical information:</strong> sign-in session
            cookies, basic server logs, and anonymous page-view statistics.
          </li>
        </ul>
      </section>

      <section>
        <h2>How we use it</h2>
        <ul>
          <li>To create your account and sign you in.</li>
          <li>To analyse your reports and show you results, recommendations and summaries.</li>
          <li>To keep the service secure and working, and to answer your questions.</li>
        </ul>
        <p className="mt-2">
          We do not sell your information and do not use it for advertising. We do not use your
          uploaded data to train AI models.
        </p>
      </section>

      <section>
        <h2>Google user data</h2>
        <p>
          When you choose “Continue with Google”, AdMate receives only your basic profile (name,
          email address and profile picture) to create and sign in to your account. We do not access
          your Gmail, Drive, contacts or any other Google data. AdMate’s use of information received
          from Google APIs adheres to the Google API Services User Data Policy, including the
          Limited Use requirements.
        </p>
      </section>

      <section>
        <h2>Service providers</h2>
        <p>
          We use trusted providers to run AdMate. They process data only to provide the service:
        </p>
        <ul>
          <li>Supabase: sign-in and database.</li>
          <li>Vercel and Google Cloud: hosting.</li>
          <li>
            Anthropic (Claude): when AI wording is enabled, it receives figures AdMate has already
            calculated, not your original files.
          </li>
          <li>Google: sign-in, if you choose “Continue with Google”.</li>
        </ul>
      </section>

      <section>
        <h2>Keeping your data safe</h2>
        <p>
          Connections are encrypted, and every request is checked so that each account can only see
          its own data. No method of storage or transmission is completely secure, but we work to
          protect your information.
        </p>
      </section>

      <section>
        <h2>How long we keep it, and your choices</h2>
        <p>
          We keep your information while your account exists. You can remove uploaded reports in the
          app at any time. To delete your account and all of its data, or to ask for a copy of your
          data, email <ContactLink />. We respond within 30 days.
        </p>
      </section>

      <section>
        <h2>Children</h2>
        <p>AdMate is meant for business use and is not directed to anyone under 16.</p>
      </section>

      <section>
        <h2>Changes</h2>
        <p>
          If we change this policy, we will update it on this page and change the effective date
          above.
        </p>
      </section>
    </LegalPage>
  );
}
