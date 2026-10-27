"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useV5, usePeriodQuery } from "./ctx";
import { usePage } from "./page";
import { Src } from "./bits";
import { detailOf } from "./core";
import { creditsText } from "@/lib/ai/pricing";
import { apiPath } from "@/lib/integration/paths";

// AdMate Assistant (prototype 50-assistant.js): answers questions about the analysis
// on screen with Claude on the server, using only AdMate's numbers. It opens from the
// "AdMate Assistant" button at the bottom right of every page (or "/").

type Turn = { role: "user" | "assistant" | "error"; content: string; unverified?: string[]; used?: number; buy?: boolean };
type Credits = { balance: number; canBuy: boolean; testPayments: boolean; packs: { id: string; credits: number; amountCents: number }[]; history: { units: number; kind: string; note: string | null; createdAt: string }[] };
const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

const GREET = {
  beginner: "Hi! Ask me anything about your ads, in your own words. I’ll explain it simply, using only your AdMate numbers.",
  intermediate: "Ask me about your results, a campaign, or any recommendation. I answer from your AdMate analysis.",
  advanced: "Ask me anything about your results: a number you don’t understand, why something changed, or what to do next. I answer only from your AdMate numbers and say how sure AdMate is.",
};
const BY_PAGE: Record<string, string[]> = {
  home: ["Am I doing OK this week?", "What should I do first?", "What does “cost per result” mean?"],
  todo: ["Which of these should I do first?", "Can you explain the first one simply?"],
  myads: ["Which campaign is doing best?", "Which campaign is wasting money?"],
  overview: ["What changed most, and why?", "Which campaign should get more budget?", "Why did my costs go up?"],
  optimize: ["Which 3 should I do this week?", "Which one costs me the most money?", "What happens if I ignore these?"],
  campaigns: ["Which campaign should get more budget?", "Compare my two biggest campaigns"],
  audcre: ["Which audience should I test next?", "Which ad should I copy?"],
  portfolio: ["Which account needs me first?", "Summarise all accounts in 3 lines"],
  actions: ["What can I safely bulk-dismiss?", "Which items are driven by low data?"],
  explorer: ["Which ad sets are fatiguing?", "Where is spend not turning into results?"],
  budget: ["Where should I move budget, and why?", "Is any campaign under-funded?"],
  audience: ["Which group should I test next?", "Can I trust this audience data?"],
  alerts: ["Suggest 3 alert rules for this account", "Why is this campaign on the alert?"],
  geography: ["Where is most of my money going?", "Which location gives the cheapest results?", "Should I spend less anywhere?"],
  report: ["Summarise this period for my boss in 3 lines", "What is the one thing to fix first?"],
};

// Short paragraphs, "- " bullets, "1. " steps and **bold**, as the prompt asks for.
function md(t: string): ReactNode {
  return t.split(/\n{2,}/).map((b, i) => {
    const lines = b.split("\n");
    const bold = (s: string) => s.split(/\*\*(.+?)\*\*/g).map((x, k) => (k % 2 ? <b key={k}>{x}</b> : x));
    if (lines.every((l) => /^\s*[-*•] /.test(l))) return <ul key={i}>{lines.map((l, k) => <li key={k}>{bold(l.replace(/^\s*[-*•] /, ""))}</li>)}</ul>;
    if (lines.every((l) => /^\s*\d+[.)] /.test(l))) return <ol key={i}>{lines.map((l, k) => <li key={k}>{bold(l.replace(/^\s*\d+[.)] /, ""))}</li>)}</ol>;
    return (
      <p key={i}>
        {lines.map((l, k) => (
          <span key={k}>
            {k > 0 && <br />}
            {bold(l)}
          </span>
        ))}
      </p>
    );
  });
}

export function Assistant({ open, about, current, onOpen, onClose }: { open: boolean; about: string | null; current: string | null; onOpen: () => void; onClose: () => void }) {
  const { ws, level, isBeg, name, askReady, readOnly, nudge } = useV5();
  const { vm, page } = usePage();
  const { params } = usePeriodQuery();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState("");
  const [status, setStatus] = useState("");
  const [input, setInput] = useState("");
  // Credits (one balance per person): shown in the header, used per answer, topped up in "buy".
  const [credits, setCredits] = useState<Credits | null>(null);
  const [view, setView] = useState<"chat" | "buy">("chat");
  const loadCredits = () =>
    fetch(apiPath("/api/credits"))
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => c && setCredits(c))
      .catch(() => {});
  const out = !!credits && credits.balance <= 0;
  // Minimized: a small bar instead of the panel; the chat and any answer in progress go on.
  const [min, setMin] = useState(false);
  const [unseen, setUnseen] = useState(false);
  // Asking about a specific item (or opening again) brings the panel back.
  const [seenAbout, setSeenAbout] = useState(about);
  if (seenAbout !== about) {
    setSeenAbout(about);
    setMin(false);
  }
  const ctl = useRef<AbortController | null>(null);
  const msgs = useRef<HTMLDivElement>(null);
  const inRef = useRef<HTMLTextAreaElement>(null);
  const item = vm ? detailOf(vm, about ?? current) : null;

  useEffect(() => {
    if (msgs.current) msgs.current.scrollTop = msgs.current.scrollHeight;
  }, [turns, live, open]);
  useEffect(() => {
    if (open) inRef.current?.focus();
    if (open) void loadCredits();
  }, [open]);
  // "/" opens the Assistant from anywhere except a text field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) && !t.isContentEditable) {
        e.preventDefault();
        onOpen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onOpen]);

  const chips = item
    ? (() => {
        const short = item.title.length > 46 ? `${item.title.slice(0, 44)}…` : item.title;
        return isBeg ? [`Explain “${short}” simply`, "What exactly should I click?", "What happens if I ignore this?"] : [`Why is “${short}” ${item.priority} priority?`, "What exactly should I change in my ads manager?", "How sure is AdMate about this?", "What else could explain it?"];
      })()
    : (BY_PAGE[page] ?? ["What should I do first?", "Am I doing OK this week?"]);

  async function send(q: string) {
    q = q.trim();
    if (!q || busy) return;
    if (readOnly) return nudge("ask the Assistant about your own ads");
    const history = turns.filter((t) => t.role !== "error").slice(-10).map((t) => ({ role: t.role as "user" | "assistant", text: t.content }));
    setTurns((t) => [...t, { role: "user", content: q }]);
    setInput("");
    setBusy(true);
    setLive("");
    setStatus("Thinking…");
    const c = new AbortController();
    ctl.current = c;
    let text = "";
    let unverified: string[] | undefined;
    let error: string | null = null;
    let used: number | undefined;
    let buy = false;
    try {
      const res = await fetch(apiPath("/api/ask"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: c.signal,
        body: JSON.stringify({ workspaceId: ws, selection: params, history, question: q, findingKey: item?.key, aboutTitle: item?.title, level, page }),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        error = j.error ?? "Something went wrong. Please try again.";
        if (j.code === "no_credits") {
          buy = true;
          setCredits((c) => (c ? { ...c, balance: 0 } : c));
        }
      } else {
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl);
            buf = buf.slice(nl + 1);
            if (!line.trim()) continue;
            const e = JSON.parse(line);
            if (e.type === "text") {
              text += e.delta;
              setLive(text);
              setStatus("");
            } else if (e.type === "status") setStatus(`${e.text}…`);
            else if (e.type === "replace") {
              text = "";
              setLive("");
              setStatus("Double-checking the numbers…");
            } else if (e.type === "done") unverified = e.unverified?.length ? e.unverified : undefined;
            else if (e.type === "error") error = e.message;
            else if (e.type === "credits") {
              used = e.used;
              setCredits((c) => (c ? { ...c, balance: e.balance } : c));
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error)?.name === "AbortError") text += text ? "\n\n(Stopped.)" : "";
      else error = "Couldn’t reach AdMate. Please try again.";
    } finally {
      setTurns((t) => [...t, ...(text ? [{ role: "assistant" as const, content: text, unverified, used }] : []), ...(error ? [{ role: "error" as const, content: error, buy }] : [])]);
      setBusy(false);
      setLive("");
      setStatus("");
      setUnseen(true);
      ctl.current = null;
      inRef.current?.focus();
    }
  }

  if (!open)
    return (
      <button className="asst-fab" type="button" onClick={onOpen} title="Ask about your results (or press /)">
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M2.5 3.5h11v7.5H7l-3 2.5V11H2.5Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
        AdMate Assistant
      </button>
    );
  if (min)
    return (
      <div className="asst-min" role="region" aria-label="AdMate Assistant, minimized">
        <button
          type="button"
          className="asst-min-open"
          title="Open the AdMate Assistant again"
          onClick={() => {
            setMin(false);
            setUnseen(false);
          }}
        >
          <b>AdMate Assistant</b>
          <span className={busy ? "busy" : unseen ? "new" : ""}>{busy ? "Answering…" : unseen ? "New answer" : credits ? `${creditsText(Math.max(0, credits.balance))} credits` : "Minimized"}</span>
        </button>
        <button
          type="button"
          aria-label="Close the AdMate Assistant"
          title="Close"
          onClick={() => {
            ctl.current?.abort();
            setMin(false);
            onClose();
          }}
        >
          ✕
        </button>
      </div>
    );
  return (
    <section className="asst" role="dialog" aria-label="AdMate Assistant">
      <header>
        <div className="who">
          <b>AdMate Assistant</b>
          <span>
            <Src k="ai" /> Only your AdMate numbers
          </span>
        </div>
        {credits && (
          <button type="button" className={`creditchip${credits.balance < 200 ? " low" : ""}`} title={credits.canBuy ? "Your AdMate Assistant credits. Each answer uses credits for the AI work it took." : "Your free beta credits. Each answer uses credits for the AI work it took."} onClick={() => setView(view === "buy" ? "chat" : "buy")}>
            {creditsText(Math.max(0, credits.balance))} credits
          </button>
        )}
        <button
          type="button"
          title="Start a new chat"
          onClick={() => {
            ctl.current?.abort();
            setTurns([]);
          }}
        >
          New chat
        </button>
        <button
          type="button"
          className="asst-minbtn"
          aria-label="Minimize"
          title="Minimize: keep the chat in a small bar"
          onClick={() => {
            setUnseen(false);
            setMin(true);
          }}
        >
          —
        </button>
        <button
          type="button"
          onClick={() => {
            ctl.current?.abort();
            onClose();
          }}
        >
          Close ✕
        </button>
      </header>
      {view === "buy" && credits ? (
        <BuyCredits credits={credits} onDone={(balance) => setCredits((c) => (c ? { ...c, balance } : c))} reload={loadCredits} onBack={() => setView("chat")} />
      ) : (
      <div className="msgs" ref={msgs}>
        <div className="bubble ai">
          <p>{GREET[level]}</p>
        </div>
        <span className="ctxchip">
          Looking at: <b>{item ? item.title : `${pageTitle(page)} · ${page === "portfolio" ? "all accounts" : name}`}</b>
        </span>
        {!askReady && (
          <div className="bubble ai err">
            <p>The Assistant needs an Anthropic API key. Paste it after ANTHROPIC_API_KEY= in the .env.local file, then restart the app. Everything else in AdMate works without it.</p>
          </div>
        )}
        {turns.map((t, i) =>
          t.role === "user" ? (
            <div className="bubble me" key={i}>
              {t.content}
            </div>
          ) : (
            <div className={`bubble ai${t.role === "error" ? " err" : ""}`} key={i}>
              {md(t.content)}
              {t.unverified && <p className="small-note">AdMate couldn’t match these numbers to your data: {t.unverified.join(", ")}. Check them before relying on them.</p>}
              {t.used != null && t.used > 0 && <p className="used">Used {creditsText(t.used)} credits</p>}
              {t.buy && (
                <p>
                  <button className="btn primary small" type="button" onClick={() => setView("buy")}>
                    Buy more
                  </button>
                </p>
              )}
            </div>
          ),
        )}
        {busy && <div className="bubble ai">{live ? md(live) : <span className="think">{status || "Thinking…"}</span>}</div>}
        {out && !busy && !turns.some((t) => t.role === "error") && (
          <div className="bubble ai err">
            <p>Your credits ran out.</p>
            <p>
              <button className="btn primary small" type="button" onClick={() => setView("buy")}>
                Buy more
              </button>
            </p>
          </div>
        )}
        {!busy && askReady && !out && (
          <div className="chips">
            {chips.map((c) => (
              <button key={c} type="button" onClick={() => send(c)}>
                {c}
              </button>
            ))}
          </div>
        )}
      </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <div className="row">
          <textarea
            ref={inRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            placeholder={!askReady ? "Add an API key to ask" : out ? "Your credits ran out" : "Ask about your ads…"}
            aria-label="Your question"
            disabled={!askReady || out}
          />
          {busy ? (
            <button className="btn" type="button" onClick={() => ctl.current?.abort()}>
              Stop
            </button>
          ) : (
            <button className="btn primary" type="submit" disabled={!askReady || out}>
              Send
            </button>
          )}
        </div>
      </form>
    </section>
  );
}

// Buy credits: the packs, the (test) checkout, and recent credit history.
function BuyCredits({ credits, onDone, reload, onBack }: { credits: Credits; onDone: (balance: number) => void; reload: () => Promise<void>; onBack: () => void }) {
  const [pending, setPending] = useState<{ purchaseId: string; credits: number; amountCents: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const post = (url: string, body: unknown) => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => ({ ok: r.ok, j: await r.json().catch(() => ({})) }));
  const choose = async (pack: string) => {
    setBusy(true);
    setMsg(null);
    const { ok, j } = await post(apiPath("/api/credits/checkout"), { pack });
    setBusy(false);
    if (!ok) return setMsg(j.error ?? "Couldn’t start the checkout.");
    setPending({ purchaseId: j.purchaseId, credits: j.credits, amountCents: j.amountCents });
  };
  const finish = async (action: "pay" | "cancel") => {
    if (!pending) return;
    setBusy(true);
    const { ok, j } = await post(apiPath("/api/credits/test-pay"), { purchaseId: pending.purchaseId, action });
    setBusy(false);
    setPending(null);
    if (!ok) return setMsg(j.error ?? "Something went wrong.");
    onDone(j.balance);
    void reload();
    setMsg(action === "pay" ? `Done: ${pending.credits} credits added.` : "Canceled. Nothing was charged.");
  };
  return (
    <div className="msgs buy">
      <div className="buyhead">
        <b>Buy more credits</b>
        <span>
          You have <b>{creditsText(Math.max(0, credits.balance))}</b> credits. Each answer uses credits for the AI work it took: short questions use fewer.
        </span>
      </div>
      {credits.testPayments && <p className="testbanner">Test mode: no real money is charged.</p>}
      {!credits.canBuy ? (
        <div className="soon">
          <span className="soonchip">Coming soon</span>
          <span>You’ll be able to buy more credits here soon.</span>
        </div>
      ) : pending ? (
        <div className="checkout">
          <b>
            {pending.credits} credits · {usd(pending.amountCents)}
          </b>
          <span className="small-note">Test checkout. A real payment page will appear here once a payment provider is connected.</span>
          <div className="row">
            <button className="btn primary" type="button" disabled={busy} onClick={() => finish("pay")}>
              Pay {usd(pending.amountCents)} (test)
            </button>
            <button className="btn" type="button" disabled={busy} onClick={() => finish("cancel")}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="packs">
          {credits.packs.map((p) => (
            <button key={p.id} type="button" className="pack" disabled={busy || !credits.testPayments} onClick={() => choose(p.id)}>
              <b>{p.credits} credits</b>
              <span className="num">{usd(p.amountCents)}</span>
              <small>{usd(Math.round(p.amountCents / p.credits * 100) / 100)} per credit</small>
            </button>
          ))}
        </div>
      )}
      {msg && <p className="small-note" role="status">{msg}</p>}
      {credits.history.length > 0 && (
        <div className="hist">
          <b>Recent</b>
          {credits.history.map((h, i) => (
            <div key={i}>
              <span>{h.kind === "usage" ? "Answer" : h.kind === "purchase" ? "Bought" : h.kind === "grant" ? "Free credits" : "Adjustment"}</span>
              <span className="muted small">{new Date(h.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
              <span className={`num ${h.units < 0 ? "muted" : "plus"}`}>
                {h.units > 0 ? "+" : "−"}
                {creditsText(Math.abs(h.units))}
              </span>
            </div>
          ))}
        </div>
      )}
      <p>
        <button className="link" type="button" onClick={onBack}>
          ← Back to the chat
        </button>
      </p>
    </div>
  );
}

const TITLES: Record<string, string> = { geography: "Geography", report: "Performance report", home: "Home", todo: "Things to do", myads: "My ads", overview: "Overview", optimize: "Optimize", campaigns: "Campaigns", audcre: "Audiences & creatives", portfolio: "Portfolio", actions: "Actions", explorer: "Explorer", budget: "Budget", audience: "Audience insight", alerts: "Alerts" };
const pageTitle = (p: string) => TITLES[p] ?? "AdMate";
