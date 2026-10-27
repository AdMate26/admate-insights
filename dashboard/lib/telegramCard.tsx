import "server-only";
import { ImageResponse } from "next/og";
import type { Digest, DigestSev } from "./analysis/alerts";

// The Telegram alert as one picture: the account, what needs attention and the money at
// stake, then the campaigns doing well enough to consider more budget. No steps or
// explanations: the "Open in AdMate" button under the photo leads to the details.
// Drawn from the same digest as the text message, with the built-in font and no
// emoji, so nothing is fetched to draw it. 4:5, the shape a phone shows in full.

export const CARD = { width: 1080, height: 1350 } as const;

const C = { bg: "#0a0a13", panel: "#12121d", line: "#2a2a3a", fg: "#f1f1f6", muted: "#a8a8bc", faint: "#75758a", violet: "#7f61ff" };
const TONE: Record<DigestSev | "clear", { dot: string; soft: string; word: string }> = {
  urgent: { dot: "#ff6b6b", soft: "#2c1518", word: "Act now" },
  watch: { dot: "#f2b155", soft: "#2b2112", word: "Keep an eye on" },
  good: { dot: "#4fd19a", soft: "#10261d", word: "Going well" },
  clear: { dot: "#4fd19a", soft: "#10261d", word: "All clear" },
};
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
type CardRow = { sev: DigestSev; name: string; line: string; right: string };

// What fits: three campaigns to fix, two to grow (the rest are "+N more in AdMate").
export function cardRows(d: Digest) {
  const fix: CardRow[] = [
    ...d.groups.filter((g) => g.sev !== "good").flatMap((g) => g.items.map((i) => ({ sev: g.sev, name: i.name, line: i.metric, right: i.money ?? TONE[g.sev].word }))),
    ...d.rules.map((r) => ({ sev: "watch" as DigestSev, name: r.name, line: r.text, right: "Your alert" })),
  ];
  const good = d.groups.filter((g) => g.sev === "good").flatMap((g) => g.items.map((i) => ({ sev: "good" as DigestSev, name: i.name, line: i.metric, right: i.money ?? "Going well" })));
  const grow: CardRow[] = d.scale.length ? d.scale.map((g) => ({ sev: "good", name: g.name, line: g.metric, right: "Add budget" })) : good;
  const fixShown = fix.slice(0, 3);
  const growShown = grow.slice(0, 2);
  const more = fix.length - fixShown.length + (grow.length - growShown.length) + (d.scale.length ? good.length : 0) + d.more;
  return { fix: fixShown, grow: growShown, growTitle: d.scale.length ? "Consider more budget" : "Going well", more };
}

function Rows({ title, color, rows }: { title: string; color: string; rows: CardRow[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", marginTop: 34 }}>
      <div style={{ display: "flex", alignItems: "center", fontSize: 28, fontWeight: 700, color }}>{title}</div>
      {rows.map((r, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: C.panel, border: `2px solid ${C.line}`, borderRadius: 22, padding: "22px 30px", marginTop: 14 }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <div style={{ width: 18, height: 18, borderRadius: 9, background: TONE[r.sev].dot }} />
            <div style={{ display: "flex", flexDirection: "column", marginLeft: 20 }}>
              <div style={{ fontSize: 32, fontWeight: 700 }}>{cut(r.name, 30)}</div>
              <div style={{ fontSize: 26, color: C.muted, marginTop: 4 }}>{cut(r.line, 40)}</div>
            </div>
          </div>
          <div style={{ fontSize: 28, color: TONE[r.sev].dot, marginLeft: 20 }}>{cut(r.right, 22)}</div>
        </div>
      ))}
    </div>
  );
}

export function digestCard(d: Digest) {
  const top: DigestSev | "clear" = d.groups.some((g) => g.sev === "urgent") ? "urgent" : d.groups.some((g) => g.sev === "watch") || d.rules.length ? "watch" : d.groups.length || d.scale.length ? "good" : "clear";
  const tone = TONE[top];
  const title = d.headline.startsWith(`${d.account}: `) ? d.headline.slice(d.account.length + 2) : d.headline;
  const { fix, grow, growTitle, more } = cardRows(d);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: C.bg, color: C.fg, padding: 64 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <div style={{ width: 60, height: 60, borderRadius: 16, background: C.violet, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36, fontWeight: 700, color: "#fff" }}>A</div>
            <div style={{ display: "flex", flexDirection: "column", marginLeft: 20 }}>
              <div style={{ fontSize: 32, fontWeight: 700 }}>{cut(d.account, 34)}</div>
              <div style={{ fontSize: 26, color: C.muted }}>{d.period}</div>
            </div>
          </div>
          <div style={{ fontSize: 26, color: C.faint }}>AdMate</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", marginTop: 48, background: tone.soft, borderRadius: 28, padding: "34px 40px" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <div style={{ width: 24, height: 24, borderRadius: 12, background: tone.dot }} />
            <div style={{ fontSize: 42, fontWeight: 700, marginLeft: 18 }}>{cut(title.charAt(0).toUpperCase() + title.slice(1), 40)}</div>
          </div>
          {d.stake ? (
            <div style={{ display: "flex", alignItems: "flex-end", marginTop: 20 }}>
              <div style={{ fontSize: 96, fontWeight: 700, lineHeight: 1 }}>{d.stake}</div>
              <div style={{ fontSize: 32, color: C.muted, marginLeft: 18, marginBottom: 10 }}>at stake</div>
            </div>
          ) : (
            <div style={{ fontSize: 30, color: C.muted, marginTop: 16 }}>{d.allClear ? "Every campaign is within your settings." : "Nothing is costing you extra right now."}</div>
          )}
        </div>

        {fix.length > 0 && <Rows title="Needs attention" color={TONE[top === "urgent" ? "urgent" : "watch"].dot} rows={fix} />}
        {grow.length > 0 && <Rows title={growTitle} color={TONE.good.dot} rows={grow} />}
        {more > 0 && <div style={{ fontSize: 26, color: C.muted, marginTop: 20 }}>{`+${more} more in AdMate`}</div>}

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "auto", fontSize: 24, color: C.faint }}>
          <div>Tap “Open in AdMate” for the details</div>
          <div>Looking back, not a forecast</div>
        </div>
      </div>
    ),
    { ...CARD },
  );
}

// The short text under the photo (Telegram allows 1,024 characters there).
export function digestCaption(d: Digest) {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<b>${esc(d.headline)}</b>\n${esc(d.sub)}`.slice(0, 1000);
}
