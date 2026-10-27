import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { digestCard } from "@/lib/telegramCard";

// "Preview the Telegram message": draws the picture that would be sent for the alerts
// on screen. The browser sends the digest it already shows (display text only, for
// the signed-in person), so the preview follows unsaved alert settings too.
const s = (n: number) => z.string().max(n);
const Digest = z.object({
  account: s(200),
  period: s(120),
  headline: s(300),
  sub: s(300),
  groups: z
    .array(
      z.object({
        sev: z.enum(["urgent", "watch", "good"]),
        title: s(60),
        items: z.array(z.object({ sev: z.enum(["urgent", "watch", "good"]), name: s(300), platform: s(40), metric: s(120), vs: z.array(s(200)).max(6), money: s(80).nullable(), next: s(400).nullable(), early: z.boolean() })).max(10),
      }),
    )
    .max(3),
  rules: z.array(z.object({ name: s(300), text: s(300), limit: s(200) })).max(10),
  more: z.number().int().min(0).max(10_000),
  allClear: z.boolean(),
  stake: s(40).nullable(),
  scale: z.array(z.object({ name: s(300), platform: s(40), metric: s(120), action: s(400).nullable() })).max(5),
});

export async function POST(request: Request) {
  await requireUser();
  const parsed = Digest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Not a digest." }, { status: 400 });
  const img = digestCard(parsed.data);
  return new Response(await img.arrayBuffer(), { headers: { "content-type": "image/png", "cache-control": "no-store" } });
}
