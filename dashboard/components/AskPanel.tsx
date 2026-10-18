"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { track } from "@/lib/analytics";
import { ASK_EVENT, type AskRequest } from "./askEvents";
import { buttonClass, cx } from "./ui";

interface Msg {
  role: "user" | "assistant";
  text: string;
  status?: string;
  unverified?: string[];
  error?: boolean;
}

const SUGGESTIONS = [
  "What should I look at first?",
  "What changed compared with last period?",
  "Which campaigns are wasting budget?",
  "Which ad is performing best, and why?",
  "Write a summary report I can share.",
];

const SELECTION_KEYS = ["from", "to", "cmp", "cfrom", "cto", "report", "vs"];

// Ask AdMate: a side panel that answers questions from the account's numbers.
// Opens from the sidebar, the "/" key, or "Ask AdMate why" on any finding.
export function AskPanel({ workspaceId, accountName, enabled: hasKey, available }: { workspaceId: string; accountName: string; enabled: boolean; available: boolean }) {
  // Usable only when the feature is switched on (it's still in development) and an API key is set.
  const enabled = available && hasKey;
  const search = useSearchParams();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [findingKey, setFindingKey] = useState<string | undefined>();
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const send = useCallback(
    async (question: string, key?: string) => {
      if (!question.trim() || busy) return;
      const history = msgs.filter((m) => !m.error && m.text).map((m) => ({ role: m.role, text: m.text }));
      setMsgs((m) => [...m, { role: "user", text: question }, { role: "assistant", text: "", status: "Thinking…" }]);
      setInput("");
      setBusy(true);
      // Not the question itself — only that one was asked, and from where.
      track("ask_sent", { from_finding: Boolean(key), suggested: SUGGESTIONS.includes(question) });
      const update = (fn: (m: Msg) => Msg) => setMsgs((all) => [...all.slice(0, -1), fn(all[all.length - 1])]);
      try {
        const selection = Object.fromEntries(SELECTION_KEYS.map((k) => [k, search.get(k) ?? undefined]).filter(([, v]) => v));
        const res = await fetch("/api/ask", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ workspaceId, selection, history, question, findingKey: key }),
        });
        if (!res.ok || !res.body) {
          const j = await res.json().catch(() => ({}));
          update(() => ({ role: "assistant", text: j.error ?? "Something went wrong.", error: true }));
          return;
        }
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
            if (e.type === "text") update((m) => ({ ...m, text: m.text + e.delta, status: undefined }));
            else if (e.type === "status") update((m) => ({ ...m, status: `${e.text}…` }));
            else if (e.type === "replace") update((m) => ({ ...m, text: "", status: "Double-checking the numbers…" }));
            else if (e.type === "done") update((m) => ({ ...m, status: undefined, unverified: e.unverified?.length ? e.unverified : undefined }));
            else if (e.type === "error") update((m) => ({ ...m, text: m.text || e.message, status: undefined, error: !m.text }));
          }
        }
      } catch {
        update(() => ({ role: "assistant", text: "Couldn't reach AdMate. Check that the app is running.", error: true }));
      } finally {
        setBusy(false);
      }
    },
    [busy, msgs, search, workspaceId],
  );

  useEffect(() => {
    const onAsk = (e: Event) => {
      const req = (e as CustomEvent<AskRequest>).detail ?? {};
      setOpen(true);
      setFindingKey(req.findingKey);
      if (req.question && enabled) void send(req.question, req.findingKey);
      else setTimeout(() => inputRef.current?.focus(), 50);
    };
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) && !t.isContentEditable) {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener(ASK_EVENT, onAsk);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(ASK_EVENT, onAsk);
      window.removeEventListener("keydown", onKey);
    };
  }, [enabled, send]);

  useEffect(() => endRef.current?.scrollIntoView({ block: "end" }), [msgs]);

  if (!open) return null;
  return (
    <aside className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-line bg-bg shadow-2xl" aria-label="Ask AdMate">
      <header className="flex items-center gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 font-bold tracking-tight">
            Ask AdMate
            {!available && <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-muted">Soon</span>}
          </div>
          <div className="truncate text-xs text-muted">About {accountName} · answers use only your uploaded numbers</div>
        </div>
        {msgs.length > 0 && (
          <button className={buttonClass.quiet} onClick={() => setMsgs([])} disabled={busy}>
            New chat
          </button>
        )}
        <button className={buttonClass.quiet} onClick={() => setOpen(false)} aria-label="Close">
          ✕
        </button>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {!available && (
          <div className="rounded-lg border border-line bg-surface px-4 py-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-violet-soft px-2 py-0.5 text-[11px] font-medium text-violet">In development</span>
            </div>
            <p className="mt-2 font-medium">Ask AdMate isn’t available yet.</p>
            <p className="mt-1 text-muted">
              We’re still building and testing the assistant, so that every answer is based only on your uploaded numbers. It will open here as soon as it’s ready.
            </p>
            <p className="mt-2 text-muted">
              In the meantime, open <b className="font-medium text-fg">Show analysis</b> on any card in Recommendations or Alerts to see why something is happening and what to do next.
            </p>
          </div>
        )}
        {available && !hasKey && (
          <p className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
            The assistant needs an Anthropic API key. Add <span className="num">ANTHROPIC_API_KEY=…</span> to <span className="num">.env.local</span> and restart the app. Everything else in AdMate works without it.
          </p>
        )}
        {msgs.length === 0 && enabled && (
          <div>
            <p className="text-sm text-muted">Ask about your campaigns, what changed, or what to do next. Try:</p>
            <div className="mt-3 flex flex-col items-start gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s, findingKey)} className="rounded-full border border-line px-3 py-1 text-left text-sm hover:border-violet hover:text-violet">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={cx("text-sm", m.role === "user" ? "ml-8 rounded-lg bg-surface px-3 py-2" : "")}>
            {m.text && <div className={cx("whitespace-pre-wrap leading-relaxed", m.error && "text-bad")}>{m.text}</div>}
            {m.status && <div className="label mt-1 animate-pulse !normal-case !tracking-normal">{m.status}</div>}
            {m.unverified && (
              <p className="mt-2 rounded-md bg-warn-soft px-2 py-1 text-xs text-warn">
                AdMate couldn’t match these numbers to your data: {m.unverified.join(", ")}. Check them against the evidence before relying on them.
              </p>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <form
        className="border-t border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input, findingKey);
        }}
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(input, findingKey);
            }
          }}
          rows={2}
          disabled={!enabled}
          placeholder={enabled ? "Ask a question about this account…" : !available ? "Coming soon — Ask AdMate is in development" : "Add an API key to use the assistant"}
          className="w-full resize-none rounded-lg border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-violet"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[11px] text-faint">AdMate can be wrong. Evidence is on each finding.</span>
          <button className={buttonClass.primary} disabled={!enabled || busy || !input.trim()}>
            {busy ? "Answering…" : "Ask"}
          </button>
        </div>
      </form>
    </aside>
  );
}
