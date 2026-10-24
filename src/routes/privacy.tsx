import { createFileRoute } from "@tanstack/react-router";

import { ContactLink, LegalPage } from "@/components/landing/LegalPage";
import { validateLegalSearch } from "@/lib/legal-search";

export const Route = createFileRoute("/privacy")({
  validateSearch: validateLegalSearch,
  head: () => ({
    meta: [
      { title: "Privacy Policy — AdMate" },
      { name: "description", content: "How AdMate collects, uses and protects your information." },
    ],
  }),
  component: PrivacyPage,
});

const SECTIONS = [
  ["who-we-are", "Who we are"],
  ["information", "Information we collect"],
  ["use", "How we use information"],
  ["meta", "Signing in and connecting Meta Ads"],
  ["ai", "AI features"],
  ["telegram", "Telegram briefings"],
  ["providers", "Service providers"],
  ["cookies", "Cookies and analytics"],
  ["security", "How we protect information"],
  ["retention", "How long we keep information"],
  ["disconnect", "Disconnecting Meta Ads"],
  ["rights", "Your choices and rights"],
  ["data-deletion", "Data deletion"],
  ["children", "Children"],
  ["changes", "Changes and contact"],
] as const;

const PROVIDER_CATEGORIES = [
  "Cloud hosting and data storage",
  "Account sign-in and email delivery",
  "AI services that write explanations, summaries and answers",
  "Website and product analytics",
  "Integrations you choose to connect, such as Meta, Google sign-in and Telegram",
] as const;

function Heading({ n }: { n: number }) {
  return (
    <h2>
      {n + 1}. {SECTIONS[n]?.[1]}
    </h2>
  );
}

function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" effectiveDate="October 24, 2026">
      <section className="rounded-xl border border-border bg-muted/40 p-5">
        <p className="font-semibold text-foreground">The short version</p>
        <ul className="mt-2">
          <li>We use your information only to run AdMate for you.</li>
          <li>We do not sell your personal information or use it for advertising.</li>
          <li>
            Our Meta Ads connection is read-only. AdMate never creates, edits or deletes your ads.
          </li>
          <li>
            You can disconnect Meta or ask us to delete your data at any time by emailing{" "}
            <ContactLink />.
          </li>
        </ul>
      </section>

      <nav aria-label="Contents">
        <p className="font-semibold text-foreground">Contents</p>
        <ol className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
          {SECTIONS.map(([id, label], i) => (
            <li key={id} className="!ml-0 !list-none">
              <a className="hover:text-foreground hover:underline" href={`#${id}`}>
                {i + 1}. {label}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <section id="who-we-are">
        <Heading n={0} />
        <p>
          AdMate is an AI-powered marketing analytics service based in Phnom Penh, Cambodia. This
          Privacy Policy explains how we collect, use and protect information when you use our
          website, dashboard and related services, including Meta Ads connections.
        </p>
      </section>

      <section id="information">
        <Heading n={1} />
        <ul>
          <li>
            <strong className="text-foreground">Account information:</strong> your email address,
            account identifier and sign-in records. If you sign in with Google, we also receive your
            name and profile picture from Google.
          </li>
          <li>
            <strong className="text-foreground">Workspace and uploaded information:</strong>{" "}
            workspace settings, report files you upload, campaign names and identifiers, advertising
            figures, analysis results and decisions you save in AdMate. When you use AI features, we
            also process your questions and relevant conversation history.
          </li>
          <li>
            <strong className="text-foreground">Connected Meta information:</strong> Meta user,
            business and advertising-account identifiers; account names, currency and time zone
            where returned; granted permissions; authorization dates and expiry information; and an
            access token. Authorized reporting requests may also return campaign names, identifiers,
            objectives, status, dates and performance figures such as spend, impressions, clicks and
            reach. Availability depends on Meta's response and your access.
          </li>
          <li>
            <strong className="text-foreground">Telegram information:</strong> if you turn on
            Telegram briefings, the Telegram chat that receives them and your delivery schedule.
          </li>
          <li>
            <strong className="text-foreground">Technical and support information:</strong> IP
            address, browser and device information, page interactions, request times and error
            diagnostics processed by our hosting and analytics services, and messages you send to
            us.
          </li>
        </ul>
      </section>

      <section id="use">
        <Heading n={2} />
        <p>
          We use information to sign you in, provide your workspace, process uploaded reports,
          retrieve the advertising information you authorize, show reports and analysis, deliver
          briefings you request, keep the service secure and working, fix errors and respond to
          support or privacy requests. We also use analytics to understand how AdMate is used so we
          can improve it.
        </p>
        <p>
          We do not sell your personal information. We do not use your information, including
          information received from Meta, for advertising or to build advertising profiles.
        </p>
      </section>

      <section id="meta">
        <Heading n={3} />
        <p>
          You sign in to AdMate with an email verification code or, if you choose, with Google.
          Connecting Meta Ads requires a separate authorization through Facebook Login for Business,
          which is linked to your AdMate account.
        </p>
        <p>
          When you choose <strong className="text-foreground">Connect Meta Ads</strong>, Meta asks
          you to authorize AdMate. The connection requests <code>ads_read</code> and{" "}
          <code>ads_mcp_management</code> to retrieve advertising account information and available
          reporting through Meta's Ads MCP service. Access depends on the permissions you grant,
          your advertising account access and Meta's availability. AdMate uses this connection only
          to read information; it does not create, edit, publish or delete advertisements.
        </p>
        <p>
          Meta handles your Facebook sign-in and consent. AdMate never asks for your Facebook
          password.
        </p>
      </section>

      <section id="ai">
        <Heading n={4} />
        <p>
          AdMate's numbers, scores and alerts are calculated by our own software. AI is used only to
          write explanations, summaries and suggested next steps.
        </p>
        <p>
          When you use AI features with uploaded reports, the relevant report information, your
          questions and relevant conversation history are sent to our AI provider to generate that
          text. AdMate does not send information retrieved through the Meta connection to AI
          features. If this changes, we will update this policy before it happens.
        </p>
      </section>

      <section id="telegram">
        <Heading n={5} />
        <p>
          If you turn on Telegram briefings, AdMate sends summaries of campaign findings to the
          Telegram chat you choose, on the schedule you set. Messages are delivered through Telegram
          and are also handled under Telegram's own privacy policy. AdMate does not include
          information retrieved through the Meta connection in Telegram briefings. You can turn
          briefings off at any time.
        </p>
      </section>

      <section id="providers">
        <Heading n={6} />
        <p>
          We work with trusted service providers that help us run AdMate. They fall into these
          categories:
        </p>
        <ul className="mt-2">
          {PROVIDER_CATEGORIES.map((category) => (
            <li key={category}>{category}</li>
          ))}
        </ul>
        <p>
          These providers process information on our behalf only as needed to provide their
          services, under their own security and confidentiality commitments. Some of them process
          information in countries other than Cambodia.
        </p>
      </section>

      <section id="cookies">
        <Heading n={7} />
        <p>
          We use browser storage and session cookies to keep you signed in. Website statistics and
          product analytics help us understand how the service is used. Product analytics may link
          page interactions and session recordings to your AdMate user ID and email. Session
          recordings may include content shown on a page; anything you type into forms is masked.
          You can limit analytics with your browser's privacy settings.
        </p>
      </section>

      <section id="security">
        <Heading n={8} />
        <p>
          All connections to AdMate use HTTPS. Meta access tokens are encrypted before they are
          stored and are never sent to your browser. Each saved Meta connection is linked to the
          AdMate account that authorized it, and using it requires you to be signed in. Access to
          stored information is limited to authorized AdMate personnel.
        </p>
        <p>
          Reports retrieved through the Meta connection are shown in your signed-in account without
          being added to your saved uploaded reports. Reports you upload separately are stored as
          workspace data.
        </p>
        <p>
          No online service is perfectly secure. If we become aware of a security incident that
          affects your personal information, we will notify you without undue delay.
        </p>
      </section>

      <section id="retention">
        <Heading n={9} />
        <p>
          We keep account and workspace information until you delete it in AdMate or we complete
          your deletion request. Removing an imported report in AdMate may leave some import records
          and uploaded files in storage; email us and we will remove them completely.
        </p>
        <p>
          We keep saved Meta connection information, including its encrypted access token, until you
          disconnect it or we complete your deletion request. If a token expires or is revoked, it
          can no longer be used, but the saved connection stays until you disconnect it.
        </p>
        <p>
          Copies in backups and service logs may remain for a limited time after deletion, under our
          providers' retention practices. When we respond to a deletion request, we will tell you
          about any records that must remain and why.
        </p>
      </section>

      <section id="disconnect">
        <Heading n={10} />
        <p>
          Choose <strong className="text-foreground">Disconnect from AdMate</strong> on the Meta
          connection page to remove your saved connection, including its stored access token,
          account information and any unfinished connection requests. AdMate then can no longer
          retrieve information through that connection.
        </p>
        <p>
          Disconnecting does not delete your AdMate account or uploaded reports, and it does not
          change your Meta campaigns. It also does not automatically remove AdMate on Meta's side;
          you can do that in Meta's Business Integrations settings.
        </p>
      </section>

      <section id="rights">
        <Heading n={11} />
        <p>
          You can ask us to access, correct, export or delete your personal information, or to stop
          a particular use of it, by emailing <ContactLink />. We may ask you to confirm that you
          control the account first. We aim to respond within 30 days.
        </p>
      </section>

      <section id="data-deletion">
        <Heading n={12} />
        <p>
          To request deletion of your AdMate account, workspace or uploaded data, or saved Meta
          connection, email <ContactLink /> with the subject{" "}
          <strong className="text-foreground">AdMate data deletion request</strong>. Send it from
          your account email where possible and say what you want removed. Never send passwords,
          verification codes, access tokens or App Secrets.
        </p>
        <p>
          We may ask you to confirm that you control the account. We will then process the request,
          aiming to complete it within 30 days, and confirm the outcome to you, including any
          records that must remain and why.
        </p>
      </section>

      <section id="children">
        <Heading n={13} />
        <p>
          AdMate is intended for business use and is not directed to children under 16. Contact us
          if you believe a child has given us personal information.
        </p>
      </section>

      <section id="changes">
        <Heading n={14} />
        <p>
          When this policy changes, we will update this page and its effective date. For important
          changes, we will also let signed-in users know.
        </p>
        <p>
          Questions and requests: <ContactLink />
        </p>
      </section>
    </LegalPage>
  );
}
