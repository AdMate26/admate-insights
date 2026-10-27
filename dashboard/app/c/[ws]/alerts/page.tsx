import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { NoData } from "@/components/v5/NoData";
import { PageHead } from "@/components/v5/PageHead";
import { V5Page } from "@/components/v5/page";
import { pageData } from "@/components/v5/server";
import { AdvAlerts, type Tg } from "@/components/v5/views/alerts";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { telegramLinks } from "@/lib/db/schema";
import { telegramEnabled } from "@/lib/telegram";

export const metadata = { title: "Alerts" };

// Advanced: automatic alerts, your own KPI alerts, campaign targets and Telegram.
// Beginner and Intermediate don't have Alerts: their decisions page is the same subject.
export default async function AlertsPage({ params, searchParams }: PageProps<"/c/[ws]/alerts">) {
  const { ws } = await params;
  const { level, data, st, ask, sp } = await pageData(ws, searchParams);
  if (level !== "advanced") {
    const q = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])));
    redirect(`/c/${ws}/actions${q.size ? `?${q}` : ""}`);
  }
  if (!data) return <NoData title="Alerts" />;
  const user = await requireUser();
  const db = await getDb();
  const [link] = await db.select().from(telegramLinks).where(eq(telegramLinks.userId, user.id));
  const tg: Tg = {
    on: !!link?.on,
    when: link?.when ?? "now",
    time: link?.time ?? "09:00",
    days: (link?.days as number[] | undefined) ?? [1, 2, 3, 4, 5],
    tz: link?.tz ?? "Asia/Phnom_Penh",
    linked: !!link?.chatId,
    username: link?.username ?? null,
  };
  return (
    <V5Page vm={data.vm} page="alerts" askAvailable={ask}>
      <PageHead title="Alerts" />
      <div className="page">
        <AdvAlerts config={st.config} rules={st.rules} targets={st.targets} tg={tg} tgEnabled={telegramEnabled()} />
      </div>
    </V5Page>
  );
}
