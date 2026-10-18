# AdMate: Product Plan v2

**Status:** Approved 2026-09-29 (founder: "go with what you recommend"; thresholds = A, fixed defaults; scores = goal status + money at stake). Phases 0–5 built locally; see §15. Nothing deployed.
**Date:** 2026-09-29
**Based on:** the audit of the local repo, plus the founder's answers to the audit questions.

---

## 1. Decisions so far

| # | Topic | Decision |
|---|---|---|
| 1 | Codebase | Work in **this local repo** only. Nothing is deployed. Where it lives (GitHub, Railway, merge with the live app) is decided after review. |
| 2 | Primary user | **One person managing their own ad account**: a business owner who runs their own ads, or an in-house marketer. The multi-client freelancer view is no longer the design center. |
| 3 | Data source | **Upload only** (CSV/XLSX). API connectors come later. |
| 4 | Platforms | All four accepted at upload: **Meta, TikTok, Google Ads, LinkedIn**. |
| 5 | AI assistant | **A side panel scoped to the account and the selected period**, with suggested questions and "Ask AdMate why" on every finding. |
| 6 | Scores | **Proposed (pending founder OK):** remove the 0–100 Health score and the "could save $X/week" estimates. Replace them with (a) a **goal status** line and (b) **money at stake / extra cost**, both calculated only from real numbers. See §6. |
| 7 | Reporting | A **copyable summary** for a manager or boss in the MVP. PDF comes later. Extra logic proposed in §8. |
| 8 | Thresholds | **Pending.** Recommendation: fixed, conservative defaults, with the rule shown on every finding. See §9. |
| — | Actions | **Advisory only.** AdMate never changes an ad account. |

### What changes because of decision 2 (one account)

- There is no cross-client "Today" page. **The account home is the first screen.**
- The data model keeps "workspace" internally (one person may still add a second business later), but the UI shows one account and hides client switching.
- The default tone is **plain language with exact numbers**. Jargon (CPM, CTR, ROAS) stays, with a one-line definition on hover. The "Expert / Client version" toggle is replaced by **"Write a summary for my manager"**.
- Sample data becomes **one** realistic sample account (Meta + TikTok, mixed objectives) instead of three clients.
- `prd.md` §0.1 and §2 need updating to match (Phase 0).

---

## 2. The five questions the product must answer

Every screen element must serve one of these; anything else is cut or deferred.

1. How are my ads performing?
2. What is going wrong?
3. What is performing well?
4. Why is it happening?
5. What should I do next?

---

## 3. Product flow

```
Upload an export (or try the sample account)
   ↓
Account home (one page)
   ① Summary: 3 plain sentences + goal status + KPI strip
      (only metrics that exist in the data; the rest say "not in your export")
   ② 🔴 Needs attention (n)
   ③ 🟢 Opportunities (n)
   ④ 🟡 Monitor (collapsed): early signals, not enough data yet
   ⑤ Performance by objective (collapsed): tiles, trend, "why it moved"
        ↓ click any finding
   Finding detail (expands in place):
      What happened · Why it matters · Likely cause (labelled as a hypothesis)
      · Evidence (A → B numbers) · Recommended action · Priority + why
      · Data confidence ("based on 7 days, 2,400 impressions, 14 leads")
      · Risk · When to re-check
      [Ask AdMate why]  [Mark done]  [Dismiss ▾]
        ↓
Ask AdMate panel (opens with the finding already loaded)
        ↓
Mark done → re-check after N days → "It worked / It didn't / Not enough data"
```

## 4. Information architecture

```
AdMate
├─ Home          summary · needs attention · opportunities · monitor · performance
├─ Campaigns     campaign / ad set / ad table: verdict, A | B | Δ, New / Stopped badges
├─ Data          uploads + undo · export guides · goals & targets · account settings
└─ Ask AdMate    side panel on every page (shortcut: /)
Top bar: one period control ("Sep 22–28 vs previous 7 days" / "Report A vs Report B")
         · [Write summary] · [Upload]
```

The current **Compare**, **Actions** and **Today** pages are folded into Home and Campaigns (see §5).

---

## 5. Feature decisions (updated for one account)

| Feature today | Decision | Where it goes |
|---|---|---|
| Today (multi-client) | **REMOVE** as a page | Home replaces it |
| Overview narrative | **KEEP** | Home ① summary (3 lines) |
| Expert / Client toggle | **REPLACE** | "Write a summary for my manager" |
| Objective KPI tiles | **SIMPLIFY** | Home ⑤, collapsed; missing metrics show "not in export" |
| "Why it moved" bars | **REDESIGN** | Inside each finding; fix shares shown as >100% |
| Trend chart | **KEEP** | Inside findings + Home ⑤ |
| By-platform table | **SIMPLIFY** | One line in the summary ("Meta 70% of spend · TikTok 30%") |
| Health score | **REMOVE** (pending OK) | Replaced by goal status (§6) |
| $ impact estimates | **REPLACE** (pending OK) | Money at stake / extra cost (§6) |
| Top action card + Actions tab | **COMBINE** | Home ②③④ |
| Accept / Snooze / Dismiss / Done | **SIMPLIFY** | To do → Done · Dismiss (reason) · Snooze 7 days |
| Compare: which period was better | **COMBINE** | Home summary + objective sections |
| Compare: best performers & lessons | **COMBINE** | Opportunities (one set of rules) |
| Compare: head-to-head, new/stopped | **COMBINE** | Campaigns table (A / B / Δ + badges) |
| Compare: name patterns | **DEFER** | Maybe later as "Insights (experimental)" |
| Report picker + date picker | **SIMPLIFY** | One period control |
| Campaigns table (3 levels, objective override) | **KEEP** | Campaigns |
| Upload flow, export guides | **KEEP** | Data |
| Goals & profit inputs | **KEEP** | Data; also asked once after the first upload |
| 12 detectors | **KEEP + EXTEND** | §8 |
| Verdict engine | **KEEP** | Campaigns chips, same words as the Home buckets |
| AI narrative + number check + cache | **KEEP** | Reused by summary + assistant |
| Ask AdMate | **BUILD** | Side panel |
| First-run audit | **COMBINE** | Home right after the first upload *is* the audit |
| Outcome re-check | **BUILD (light)** | Phase 5 |
| PDF reports, Creatives view, API connectors | **DEFER** | After MVP |

---

## 6. Scores: which is most valuable for the user (decision 6)

The one-account user wants to know two things: "am I OK?" and "what should I look at first?". Here are the four candidates:

| Option | Question it answers | Honest? | Verdict |
|---|---|---|---|
| **Health score 0–100** | "Am I OK overall?" | ❌ The weights are invented. It showed 97/100 on an account that spent $13.74. A single number hides *why*. | **Remove** |
| **"Could save $X/week" estimates** | "How much is this worth?" | ❌ They use hand-picked multipliers (×0.7, ×0.5–1.2). They look precise but are guesses. | **Remove** |
| **Goal status** | "Am I OK overall?" | ✅ "Cost per lead $12.40 vs your target $10.00, 24% over." It compares against a target the user set. | **Keep, as the headline** |
| **Money at stake / extra cost** | "What should I look at first?" | ✅ Calculated from real numbers only (below). | **Keep, for ranking** |

**Recommendation:** replace the Health score with **goal status**, and rank findings by **money at stake**, showing **extra cost** when it can be computed.

### Definitions (no invented multipliers)

- **Money at stake** = what the affected campaign, ad set or ad actually spent in the selected period.
  > "This campaign spent $1,240 this week (38% of your budget)."
- **Extra cost vs before** (cost KPIs, only when confidence is at least medium and both periods have data):
  results now × (cost per result now − cost per result before).
  > "At last week's CPA you would have paid $336 less for the same 120 conversions."
- **Revenue gap** (sales with revenue): spend now × (ROAS before − ROAS now).
- **Goal status** per objective:
  - If a target is set: on track (≤ 10% worse than target), off track (10–30% worse), far off track (> 30% worse, or below break-even).
  - If no target is set: compared with the previous period, labelled clearly: "No target set: compared with last period."

### When the user has no target (most new users)

AdMate never makes up a target and never uses outside benchmarks as one. It uses the best yardstick available and says which one it used.

| What the user has | What Home shows |
|---|---|
| **A target** | "Cost per message $0.85 vs your $1.00 target: on track." |
| **No target, earlier data** (two reports or daily data) | "No target set. Compared with last period: cost per message $0.85, 12% better than Sep 1–7." |
| **No target, one report only, ≥ 3 campaigns with the same objective** | "No target and no history yet. Within this report, your best campaign gets messages at $0.60 and your weakest at $1.40 (account average $0.85)." No good/bad label on the account. |
| **No target, one report, < 3 campaigns** | The numbers only, plus: "Upload an earlier report or set a target so AdMate can judge performance." No good/bad label. |

**Helping users who don't know their target** (a short card on Home until a target is set):

1. **Suggested target from their own data:** "Your average this period is $0.85 per message. Use it as your target?" One click; it can be edited later.
2. **Break-even from business numbers** (this already exists in Goals): "How much profit do you make from one customer?" and "About how many conversations out of 10 become customers?" From $20 profit and 1 in 10, the break-even is $2.00 per message, so anything above that loses money.
3. **Skip:** AdMate keeps working with history and within-account comparison.

Money at stake needs no target: it is what the campaign actually spent. Extra cost needs only an earlier period.

### Priority rule (shown on every card as "Why this priority")

| Priority | Rule |
|---|---|
| **High** | A tracking break · or money spent with zero results ≥ 2× the target/typical cost per result · or confidence High **and** money at stake ≥ 20% of account spend |
| **Medium** | Confidence at least Medium **and** money at stake ≥ 5% of account spend |
| **Low** | Confidence at least Medium, money at stake < 5% |
| **Monitor** | Confidence Low, whatever the size |

Within a priority level, findings are ordered by money at stake. The percentages are defaults; see §9.

---

## 7. Finding object (one shape used everywhere)

The Home cards, the Campaigns chips, the summary and the AI assistant all read this same object.

```
Finding {
  id, detector, bucket: needs_attention | opportunity | monitor
  entity: { level: account|campaign|ad_group|ad, id, name, platform, objective }
  period: { b, a }                      // selected period and comparison
  whatHappened: "CPA rose 34% (from $8.20 to $11.00)"
  whyItMatters: "You are paying more for each conversion."
  likelyCause: { text, isHypothesis: true, drivers: [...] }   // from decomposition
  evidence: [{ metric, a, b, change }]  // the exact numbers used
  action: "Review the 3 ads with the largest CTR decline ..."
  priority: high|medium|low|monitor, priorityReason
  confidence: high|medium|low, dataBasis: "7 days · 2,400 impressions · 14 leads"
  moneyAtStake, extraCost | null
  risk, recheck: { days, rule }
  status: todo|done|dismissed|snoozed, doneAt, outcome | null
}
```

Findings are **saved per upload/period**, so the assistant and the re-check can refer to them by ID.

---

## 8. Detection logic: what exists and what I propose to add (decision 7)

### Existing (keep, with fixes)

Tracking break · post-click drop (landing page) · creative fatigue · CPM spike · wasted spend · underperformer · awareness saturation · budget-limited winner · lessons from ended campaigns · no delivery · cross-platform shift.

### Proposed additions

| # | Logic | Why it matters for one account |
|---|---|---|
| A1 | **Spend up, results flat or down** (campaign / ad set) | The most common "something's wrong" pattern; in your brief |
| A2 | **Budget concentration**: one item takes > 40% of spend with a worse-than-average KPI | Also in your brief |
| A3 | **Ad-level checks**: CTR drop per ad, ads spending with zero results inside a good campaign, one ad carrying the whole campaign | Enables "Ad 123: CTR −36%" |
| A4 | **What changed between periods**: new or stopped campaigns/ads, budget changes, status changes. Used as a *candidate cause* ("CPA rose after 3 new ads started on Sep 20") | Answers "why" with facts the user recognises |
| A5 | **Learning-phase protection**: no pause/scale advice on items younger than 7 days | Avoids bad advice (PRD open question; recommended yes) |
| A6 | **Data-quality findings** (shown as their own small "Data notes" list): conversion column missing · currency mismatch · attribution setting differs between reports · last day looks incomplete · periods of different length or platform · data older than 7 days | Stops AdMate from judging on bad inputs |
| A7 | **Minimum peer group**: compare with "similar campaigns" only when at least 3 exist; otherwise use target or own history only | Prevents fake winners and losers in small accounts |

### Manager summary logic

1. **Headline vs goal.** "Leads cost $12.40 this week, 24% above your $10 target."
2. **The 3 biggest changes, with numbers.** Chosen by money at stake.
3. **What's working.** The top opportunity.
4. **What I'm doing about it.** Taken from findings marked Done or To do.
5. **What happens next.** Re-check dates.
6. **Caveats.** Low data, missing metrics, platform attribution differences.

Every number is checked against the facts; the summary can be copied in plain text or markdown.

---

## 9. Thresholds explained (decision 8, still open)

**What a threshold is.** Every "needs attention" finding comes from a rule with numbers in it. For example:

> Flag rising CPA only if CPA rose **more than 20%**, **and** there were **at least 20 conversions** in each period, **and** the change is statistically real.

The numbers in bold are the thresholds. They decide how *sensitive* AdMate is:

- **Lower thresholds** (e.g. flag at +10% with 5 conversions) give more alerts, but many will be random noise, so the user learns to ignore them.
- **Higher thresholds** (e.g. flag at +40% with 50 conversions) give fewer, more reliable alerts, but a real problem may be caught later.

**The question is who sets those numbers.**

| Option | What the user sees | Good for |
|---|---|---|
| **A. Fixed defaults** *(recommended for MVP)* | Nothing to configure. Each card says why it was flagged: "Flagged because CPA rose more than 20% with at least 20 conversions." | Simple, safe, consistent. We tune the defaults from feedback. |
| B. One sensitivity switch | Settings: **Cautious / Balanced / Sensitive** | Users who feel "too many" or "too few" alerts. Easy to add later on top of A. |
| C. Full control | Per-metric numbers (CPA %, minimum conversions, CTR %, …) | Expert media buyers. Adds a lot of UI and a lot of ways to get bad advice. |

My recommendation: **A for the MVP, B soon after if beta users ask for it.** C is not needed for one-account users.

### What the fixed defaults are based on

There are two different jobs, and they need different sources:

| Job | Question | Source |
|---|---|---|
| **Thresholds** | "Is this change real, or just noise?" | **Statistics** (sample size + significance test, the same in any country) **+ Meta's published learning-phase guidance** |
| **Benchmarks** | "Is this level good or bad for this market?" | Country × platform × objective data. **No reliable Cambodia source exists** (see below) |

**Meta guidance we can use** (from Meta's Business Help Center, as summarised by several practitioner guides):
- An ad set needs about **50 optimization events in 7 days** to leave the learning phase.
  → AdMate labels ad sets below that as "still learning / limited data" and gives no pause or scale advice for them (A5).
- **"Significant edits"** (changing the optimization event, targeting or creative; big budget changes) restart learning. Meta's own example: $100 → $101 is unlikely to reset learning, $100 → $1,000 may.
  → Scaling advice stays modest (the common practitioner rule is ≤ 20% per change, then wait 3–4 days). Cards say this is a rule of thumb, not a Meta rule.

**Cambodia benchmarks (checked 2026-09-29):**
- No published, sourced Cambodia CPM/CPC/CPL benchmarks were found. A page titled "Cambodia" used generic figures with no source.
- Global benchmarks are unusable here. The global median Facebook CPM is quoted around $14, while the founder's real Cambodian TikTok account had CPMs of about $0.10–0.39. Global numbers would call every Cambodian account "excellent", which is wrong advice.
- **Decision:** the MVP uses **no external benchmarks**. The yardsticks are target → own history → within-account comparison.

**Later (after hosting is decided): AdMate's own benchmarks.** With users' consent, anonymised results can be grouped by country × platform × objective × month. A group is shown only when it has enough accounts (e.g. ≥ 20), as in "Compared with 34 Cambodian accounts running Messages on Meta: your cost per message is in the best 25%." This is the only honest way to get Cambodia benchmarks. To make it possible, the MVP stores **country** and **industry** per account from day one.

---

## 10. Ask AdMate (decision 5)

- **Surface:** a side panel, scoped to the account and the selected period. Suggested questions change with context (on a finding: "Why did this happen?", "What should I check first?"; on Home: "What changed vs last week?", "Write a summary for my manager").
- **Grounding:** Claude gets **read-only tools** backed by the analysis engine:
  - `get_summary`
  - `list_findings(bucket)`
  - `get_finding(id)`
  - `get_entity(level, id)`, returning A/B metrics and confidence
  - `compare_entities(a, b)`
  - `get_daily(id)`
  - `available_metrics()`, which says what is *not* in the data

  The model never does arithmetic: every number comes from a tool result.
- **Answer shape:** metric → change → likely cause (labelled as a hypothesis) → evidence → action → data confidence. It stays short by default and adds detail on request.
- **Safety:**
  - Numbers in each answer are checked against that conversation's tool results. An answer that fails the check is retried once, then replaced with a safe fallback.
  - When data is insufficient, the answer says so and names what's missing.
  - Campaign names are treated as data, not instructions.
- **Cost control:**
  - Use a mid-size model for chat and a small model for the 3-line summary. The exact models and prices are confirmed against the current Claude API reference before building.
  - Prompt caching on the system prompt and the account facts.
  - A daily question cap per user.
  - Every call is logged in `ai_usage`.
  - Without an API key, the assistant is hidden and summaries use templates.

---

## 11. Data-reliability fixes (must come before new features)

1. **Reach / frequency:** stop adding reach across days and scaling it by period length (reach can't be added). Use reach only where the export gives it for the whole period; otherwise mark reach-based metrics "not available for this range".
2. **Missing column ≠ zero:** save which metrics each upload actually contains, carry "not available" through the engine, and never produce "no results" findings from a missing column.
3. **Remove the $ impact multipliers.** Use money at stake / extra cost (§6).
4. **Decomposition display:** show drivers that offset each other correctly (no two "100%" bars).
5. **Minimum peer group of 3** (A7).
6. **Data-basis text** on every finding ("7 days · 2,400 impressions · 14 leads").

---

## 12. Implementation phases (not started, waiting for approval)

| Phase | Scope | Done when |
|---|---|---|
| **0: Setup** | Update `prd.md` to the one-account decision; add country + industry to the account | PRD matches this plan |
| **1: Data reliability** | §11 fixes + tests on real exports | No finding can come from a missing column; reach test passes |
| **2: Findings model** | §7 object, saved; buckets; priority rule; detectors A1–A7; merge Compare "best performers" | Each planted issue in the sample account is found at the right level with the right bucket |
| **3: Account home** | §3 / §4 layout; fold in Compare + Actions + Today; one period control; goal status; remove Health score | The five questions are answered on one page |
| **4: Ask AdMate** | §10 panel, tools, number check, caps; manager summary (§8) | 20–30 question evaluation set passes; no unchecked numbers |
| **5: Re-check** | After "Done", compare the metric N days later on the next upload | Done findings show "worked / didn't / not enough data" |
| **6: UX polish** | Brand guideline, empty states, mobile read-only | Design review with founder |
| **7: Testing** | Detector precision on real exports, AI evaluation set, end-to-end upload → finding → ask → summary | Checklist signed off |

**Not in MVP:** API connectors, PDF reports, creatives view, name patterns, alerts by email/Slack, auth/hosting (decided after review), multi-client views, write access to ad accounts.

## 13. Platforms without real test files

The founder chose to support all four platforms now. Meta and TikTok are tested on real exports; Google Ads and LinkedIn are not.

- Their importers follow each platform's documented export column names.
- The upload screen always shows the detected column mapping for confirmation before anything is saved.
- When a real Google Ads or LinkedIn export is available, it becomes a test fixture.

## 14. Needed from the founder

1. OK on §6: remove the Health score and $ estimates; use goal status (with the no-target behaviour) and money at stake.
2. Answer §9: thresholds A, B or C.
3. The brand guideline file, if it has changed since v1.0.
4. Approval of this plan, or edits to it.

## 15. Build status (2026-09-29, local only)

| Phase | Status | Notes |
|---|---|---|
| 0: Setup | ✅ | PRD decision log updated; account stores country + industry |
| 1: Data reliability | ✅ | Missing columns tracked per upload (older uploads: inferred from non-zero columns); reach not added across rows or compared across different lengths (awareness → CPM); "similar" needs ≥ 2 others; $ multipliers removed; data basis on every finding |
| 2: Findings model | ✅ | One `Finding` shape; buckets + priority rule; new rules: spend up / results flat, budget concentration, ad CTR drop, zero-result ad, strong ad/ad set, KPI got worse (campaign and objective level, which catches monthly flights), new/stopped ads as context, learning-phase protection, Meta 50-events note, data notes |
| 3: Account home | ✅ | Home / Campaigns / Data; one period control; goal status with "use as my target"; old Compare/Actions/Upload/Settings URLs redirect |
| 4: Ask AdMate + manager summary | ✅ built, ⚠ not tested against the live API | Tools, loop, number check and caps are unit-tested offline; a real conversation needs `ANTHROPIC_API_KEY` |
| 5: Re-check | ✅ | "Mark done" stores a baseline; "Did it work?" compares later data |
| 6: UX polish | Partly | Brand tokens kept; mobile layout checked (no horizontal scroll) |
| 7: Testing | Partly | 37 automated tests; still needs real Google Ads / LinkedIn files and an AI evaluation set (20–30 questions) |

Deviations from the plan text:
- Findings are **recomputed** from the data rather than stored; the user's decision and the baseline for the re-check are stored. Same result for the user, less to keep in sync.
- "Zero results" is only urgent (High) when it's ≥ 5% of spend, so a tiny test ad doesn't jump to the top.
- Added a "KPI got clearly worse" rule (campaign and objective level) — the brief's "CPA increased / ROAS decreased" case wasn't covered by the diagnostic rules on their own.
- The AI model is `claude-opus-5-5` (current default) at low effort for summaries and medium for chat, with caching and a daily cap (`ADMATE_ASK_DAILY_LIMIT`, default 40). Set `ADMATE_MODEL=claude-sonnet-5-5` for a cheaper model.

## 16. Navigation update (founder request, 2026-09-29)

The sidebar follows the live app's structure, keeping the v2 logic underneath:

| Menu | What it answers |
|---|---|
| Dashboard | How are my ads doing? Summary, goal status, KPIs, plus the top 3 alerts and the top 3 campaigns to act on |
| Recommendations (badge) | What should I do? Actions **grouped by the campaign that should act**, most urgent campaign first, each with its evidence |
| Alerts (badge) | What's going wrong? Problems with evidence; data problems at the top; early signals collapsed |
| Campaigns | Every campaign / ad set / ad, with an **Action** column showing the one to act on |
| Reports | Uploaded reports: open, compare with the one before, undo |
| Upload report | New export + export guides |
| Targets & settings | Targets, break-even inputs, account |

The Alerts badge counts open problems; the Recommendations badge counts open problems plus opportunities (an alert and its recommendation are the same finding, seen as "what's wrong" vs "what to do"). A "How AdMate works" note in the sidebar says numbers come from the uploads, the AI only explains them, and AdMate never changes the ad account.

## 17. Founder feedback round 2 (2026-09-30)

1. **Campaigns compare and explain.** Each objective shows the campaign *doing best* and the *weakest*, each against the others combined, with the main reasons (CPM, CTR, conversion rate…). Each row has a "Why vs <earlier period>" line, and the objective's comparison with the earlier period (what moved it + daily trend) moved here from the dashboard.
2. **An action for every campaign, with or without a comparison** (`lib/analysis/plan.ts`):
   - **High**: at least 20% better than expected → *put more money in* (raise the budget ~20%); at least 20% worse, below break-even, or spending with no results → *cut or fix*; or a serious problem was detected (e.g. broken tracking) → *fix first*.
   - **Medium**: within 20% of what's expected → *keep running*, improve one thing at a time.
   - **Low**: still in the learning phase (Meta "Learning" status, or under 7 days old) → *let it learn*; or fewer than 10 results → *not enough data yet*.
   - "Expected" = your target (or break-even) → your other campaigns with the same objective → the campaign's own earlier period. Ended campaigns get the same logic worded for the next flight (*reuse* / *don't repeat as is*).
   - A diagnosis (tracking, landing page, creative) beats a generic budget cut.
3. **Account summary replaces the Dashboard**: summary, KPIs, goal status, data notes and a short "Next steps" count by priority. Details live in Campaigns and Recommendations.
4. **"Summary report"** replaces "Write a summary for my manager"; its action list uses the same campaign plan.

The Recommendations badge now counts high-priority campaigns (plus account-wide problems). Meta "Learning" / "Learning limited" delivery status is now treated as running and in learning (before, it was read as not active).

## 18. Founder feedback round 3 (2026-09-30)

1. **Alerts no longer empty without a comparison.** Alerts = detected problems + campaigns clearly worse than expected from the campaign plan. Badges are computed for the selected period (`/api/counts`), so they always match the page.
2. **One assessment everywhere.** The old verdict ("On track") and the plan ("High · don't repeat") used different yardsticks. The Campaigns table now shows the plan's assessment (Better than expected / As expected / Worse than expected / Problem found / Still learning / Not enough data) with the same "why".
3. **"How AdMate judged this"** on every card: where the objective came from, the KPI formula, what it was compared with, and the priority rule.
4. **Detailed performance description** (`lib/analysis/detail.ts`, `components/AnalysisCard.tsx`) for every campaign plan and every detected problem: priority / type / New chips, title, campaign, description, metric tiles, confidence dots, then Why this might be happening (hypotheses from the KPI breakdown), What to do next, What to monitor afterwards, What this report can't tell us, confidence with reason, and In review / Action taken / Dismiss.

Also: a "high" call on an item with under 5% of all spend becomes medium (the card says why), and ended campaigns get next-flight advice rather than budget advice.

## 19. Judging order (founder request, 2026-09-30)

Each campaign is judged against, in order: **① its own past results** (the selected comparison period, or else everything uploaded before this period, if it has at least 10 results) → **② your target** (or break-even) → **③ your other campaigns with the same goal** → **④ industry benchmarks for Cambodia**, once reliable Cambodian data exists (none used today; no estimated numbers are shown). When a campaign has no past results, its card shows a small note explaining this order. The High / Medium / Low rule itself is unchanged.
