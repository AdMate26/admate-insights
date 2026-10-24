import { Link, createFileRoute } from "@tanstack/react-router";

import { ContactLink, LegalPage } from "@/components/landing/LegalPage";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — AdMate" },
      { name: "description", content: "The terms for using AdMate." },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <LegalPage title="Terms of Service" effectiveDate="October 24, 2026">
      <section>
        <p>
          These terms apply when you use AdMate at www.admate.site. By creating an account or using
          AdMate you agree to them. Questions: <ContactLink />.
        </p>
      </section>

      <section>
        <h2>The service</h2>
        <p>
          AdMate analyses advertising reports and suggests what to look at and what to do next. We
          continually improve AdMate, so features may change over time. We work to keep the service
          available, but we cannot guarantee it will always be uninterrupted.
        </p>
      </section>

      <section>
        <h2>Your account and your data</h2>
        <ul>
          <li>Keep your sign-in secure. You are responsible for activity on your account.</li>
          <li>
            You keep all rights to the reports you upload. You give AdMate permission to store and
            process them only to provide the service to you.
          </li>
          <li>Only upload data you are allowed to share.</li>
        </ul>
      </section>

      <section>
        <h2>Acceptable use</h2>
        <p>
          Do not misuse AdMate: no attempts to access other people’s data, disrupt the service, or
          use it for anything unlawful.
        </p>
      </section>

      <section>
        <h2>Recommendations are guidance</h2>
        <p>
          AdMate’s analysis and recommendations are based on the data you provide and are offered as
          guidance. You decide what to change in your ad accounts, and results are not guaranteed.
        </p>
      </section>

      <section>
        <h2>No warranty and limits of liability</h2>
        <p>
          AdMate is provided “as is”, without warranties of any kind. To the extent the law allows,
          AdMate is not liable for indirect or consequential losses, or for losses arising from
          decisions made using the service.
        </p>
      </section>

      <section>
        <h2>Ending your use</h2>
        <p>
          You can stop using AdMate at any time and ask us to delete your account. We may suspend
          accounts that break these terms.
        </p>
      </section>

      <section>
        <h2>Privacy and changes</h2>
        <p>
          Our{" "}
          <Link to="/privacy" className="text-foreground underline">
            Privacy Policy
          </Link>{" "}
          explains how we handle your information. If we change these terms, we will update this
          page and the effective date above.
        </p>
      </section>
    </LegalPage>
  );
}
