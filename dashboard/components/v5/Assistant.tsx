"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useV5, usePeriodQuery } from "./ctx";
import { usePage } from "./page";
import { Src } from "./bits";
import { detailOf } from "./core";
import { LEVEL_INFO } from "@/lib/levels";
import { apiPath } from "@/lib/integration/paths";

// AdMate Assistant (prototype 50-assistant.js): answers questions about the analysis
// on screen with Claude on the server, using only AdMate's numbers. Its style follows
// the person's view: plain for Beginner, precise for Advanced.

type Turn = { role: "user" | "assistant" | "error"; content: string; unverified?: string[] };

const GREET = {
  beginner: "Hi! Ask me anything about your ads, in your own words. I’ll explain it simply, using only your AdMate numbers.",
  intermediate: "Ask me about your results, a campaign, or any recommendation. I answer from your AdMate analysis.",
  advanced: "Ask about any metric, comparison or call. I’ll cite the comparison basis and confidence from your analysis.",
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
  alerts: ["Suggest 3 alert rules for this account"],
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
  const ctl = useRef<AbortController | null>(null);
  const msgs = useRef<HTMLDivElement>(null);
  const inRef = useRef<HTMLTextAreaElement>(null);
  const item = vm ? detailOf(vm, about ?? current) : null;

  useEffect(() => {
    if (msgs.current) msgs.current.scrollTop = msgs.current.scrollHeight;
  }, [turns, live, open]);
  useEffect(() => {
    if (open) inRef.current?.focus();
  }, [open]);
  // "/" opens the Assistant from anywhere except a text field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "/" && level !== "advanced" && !["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) && !t.isContentEditable) {
        e.preventDefault();
        onOpen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [level, onOpen]);

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
          }
        }
      }
    } catch (err) {
      if ((err as Error)?.name === "AbortError") text += text ? "\n\n(Stopped.)" : "";
      else error = "Couldn’t reach AdMate. Please try again.";
    } finally {
      setTurns((t) => [...t, ...(text ? [{ role: "assistant" as const, content: text, unverified }] : []), ...(error ? [{ role: "error" as const, content: error }] : [])]);
      setBusy(false);
      setLive("");
      setStatus("");
      ctl.current = null;
      inRef.current?.focus();
    }
  }

  if (!open)
    return (
      <button className="asst-fab" type="button" onClick={onOpen} aria-label="Open AdMate Assistant">
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M2.5 3.5h11v7.5H7l-3 2.5V11H2.5Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
        Ask AdMate
      </button>
    );
  return (
    <section className="asst" role="dialog" aria-label="AdMate Assistant">
      <header>
        <div className="who">
          <b>AdMate Assistant</b>
          <span>
            <Src k="ai" /> {LEVEL_INFO[level].name} style · only your AdMate numbers
          </span>
        </div>
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
          onClick={() => {
            ctl.current?.abort();
            onClose();
          }}
        >
          Close ✕
        </button>
      </header>
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
            </div>
          ),
        )}
        {busy && <div className="bubble ai">{live ? md(live) : <span className="think">{status || "Thinking…"}</span>}</div>}
        {!busy && askReady && (
          <div className="chips">
            {chips.map((c) => (
              <button key={c} type="button" onClick={() => send(c)}>
                {c}
              </button>
            ))}
          </div>
        )}
      </div>
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
            placeholder={askReady ? "Ask about your ads…" : "Add an API key to ask"}
            aria-label="Your question"
            disabled={!askReady}
          />
          {busy ? (
            <button className="btn" type="button" onClick={() => ctl.current?.abort()}>
              Stop
            </button>
          ) : (
            <button className="btn primary" type="submit" disabled={!askReady}>
              Send
            </button>
          )}
        </div>
        <span className="fine">Answers can be wrong: check them against the numbers. AdMate never changes your ad account.</span>
      </form>
    </section>
  );
}

const TITLES: Record<string, string> = { home: "Home", todo: "Things to do", myads: "My ads", overview: "Overview", optimize: "Optimize", campaigns: "Campaigns", audcre: "Audiences & creatives", portfolio: "Portfolio", actions: "Actions", explorer: "Explorer", budget: "Budget", audience: "Audience insight", alerts: "Alerts" };
const pageTitle = (p: string) => TITLES[p] ?? "AdMate";
