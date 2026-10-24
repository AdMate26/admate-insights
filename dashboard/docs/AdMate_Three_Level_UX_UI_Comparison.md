# AdMate — Three-Level UX/UI Comparison

**Version:** prototype v5.1 · 22 October 2026 (v5 was 20 October)
**Status:** prototype only. Nothing here is live. The live site (admate-alpha.vercel.app) still runs v3.
**Try it:** the private prototype link (same link as before). Code: branch `v4-levels-prototype`, folder `docs/prototype/`.

---

## What's new in v5.1

Your four adjustments, all in the prototype only:

| # | You asked for | What changed | Where |
|---|---|---|---|
| 1 | A custom date calendar in Beginner, like the other two views | Every view now has **the same period picker**: Day, Week, Month or **Calendar** (two months side by side; click the first day, then the last). Compare with the period right before, another period you choose (also with the calendar), or don't compare. Beginner keeps a plain sentence under it, e.g. *"Showing Oct 10–16, compared with Oct 3–9 (the 7 days before)."* The four quick buttons are gone. | The period button under each page title |
| 2 | Campaigns in Advanced | A **Campaigns** page in the Advanced menu: the campaign → ad set → ad table from Intermediate, plus CPM, frequency and money at stake. Tick 2–3 rows to compare them. | Advanced → This account → Campaigns |
| 3 | Alerts with two key features | **Automatic alerts** (new): AdMate compares every campaign with **its own past** (when it has past data) and with **its target** (the campaign's own target, or else the goal's). You choose what to compare with, how sensitive to be ("AdMate decides" or your own %), and whether to hear good news too. **Your own KPI alerts** (as before): any metric, limit and campaigns, with templates. **Send alerts:** always in AdMate, plus **Telegram** right away, every day, or on the days you pick, at the time you pick, with a preview of the exact message. | Advanced → Alerts |
| 4 | An easier Budget page | **Where your money goes**: one bar split by goal, and a card per goal. Click a goal (e.g. Sales) and **every campaign with that goal** appears with its spend, share, spend per day, results, what it brings in and AdMate's call (Add budget / Fix first, then add / Spend less / Keep as is). Below that: daily spending by campaign, and "What to do with the sales budget". | Advanced → Budget |

**Telegram is a preview only.** Sending real messages needs an AdMate Telegram bot (a bot token from Telegram) and a small server that sends on schedule. Both mean new credentials and deploying something, so they wait for your go-ahead. The prototype saves the settings, shows the exact message, and says plainly that nothing is sent.

**Campaign targets.** Every campaign can have its own target, in the unit it's judged by: cost per result, ROAS, or CPM for awareness. Without one, the goal's target from Goals & settings is used when it's in the same unit.

**How automatic alerts decide** (default: "AdMate decides"):
- **vs its past:** at least 20% worse than in the comparison period, *and* AdMate's confidence that the change is real isn't low. Skipped when you choose "Don't compare" or the campaign has no past data.
- **vs its target:** more than 10% worse than its target, on at least 10 results (or 1,000 impressions for CPM), so a slow day with 2 sales doesn't fire.
- **Your own %:** "more than X% worse" replaces both limits.
- **Good news** (optional): the same checks in the other direction.

**Example** (Lotus Skincare, Oct 10–16 vs Oct 3–9): 6 automatic alerts with no setup. The catalog sales campaign appears twice: *"ROAS 1.73× vs 3.02× in Oct 3–9: 43% worse"* (vs its past) and *"ROAS 1.73× vs the goal target 3.00×: 42% worse"* (vs its target). On Budget → Sales, its call is **"Fix first, then add"**.

---

## In one minute

- **The problem:** v4's Intermediate and Advanced views were the same product. Same pages, same menu, and the Overview was word-for-word identical (1,023 words). Only a few details differed: tooltips, two date options and two table columns.
- **The fix:** each view now does a different *job*:
  - **Beginner — Understand.** "Am I OK? What do I fix first? What do I do next?" on one screen.
  - **Intermediate — Analyze & optimize.** "Why did it change, where, and which fix is worth the most money?"
  - **Advanced — Control & scale.** "Across all my accounts and campaigns, where do I put my attention and budget, fast?"
- **Navigation is simpler.** Beginner has 3 main pages, Intermediate 4 and Advanced 8 (Campaigns joined in v5.1). Each view has its own menu, built around its job, plus a short "Data & settings" group.
- **Less clutter.** The top of every page went from about 104 words of banners to 46. The Intermediate Overview dropped from 1,023 words (about 4½ screens) to 563 (2½). Beginner Home is 290 words.
- **Data, interpretation and suggestions now carry labels**: "From your data", "AdMate's read", "Suggested step" and "AI answer".
- **Same engine, same numbers in every view.** No numbers were invented. The only simulated data is the sample's audience split, and it's labelled as simulated.

---

## 1. What we found (Phase 1 audit)

We measured the v4 prototype page by page (desktop, 1280 × 860).

| # | Problem | Evidence (v4) | Cause |
|---|---|---|---|
| 1 | Intermediate ≈ Advanced | Same 7-item menu. Identical Overview (1,023 words, 174 numbers, 40 controls). Identical Actions (267 words) and Audience (563 words). | Product logic: the levels changed only a few settings, not the job. |
| 2 | Too much on one screen | The Intermediate Overview was 3,726 px tall (about 4½ screens) with 8 sections. | Information architecture: everything sat on one page. |
| 3 | The same thing appears 3 times | "Needs your decision" repeated the Actions page, "Doing great" overlapped it, and "All campaigns" repeated the Campaigns page. | Information architecture. |
| 4 | Too much text before any numbers | About 104 words of banners, notes and comparison explanations above the first number. | UI. |
| 5 | No clear next step for Intermediate or Advanced users | No ranking by money at stake. The engine could already explain *why* a number changed (ad cost vs click rate vs conversion rate), but nothing showed it. | UI hid existing engine features. |
| 6 | Beginner "falls off a cliff" | "Show more detail" jumped straight into the full expert page. | Navigation. |
| 7 | Data, interpretation and AI were mixed | A fact, AdMate's interpretation and a suggestion looked the same. | UI. |
| 8 | Controls that did nothing | "My business", "Compare with previous", "Undo", file upload and "Sign out" only showed a message. | Prototype shortcuts. |
| 9 | The detail panel was long | 11 sections and about 420 words for one item, at every level. | UI. |

---

## 2. Design principles (Phase 2) and where they come from

| Principle | What we took from | How AdMate applies it |
|---|---|---|
| A simple mode and an expert mode for different people | **Google Ads**: new accounts start in Smart mode and can switch to Expert mode. | Three named views, one switch ("Your view"), the same data underneath. |
| Explain *why* performance changed | **Google Ads "Explanations"**: likely causes of a change between two periods. | Intermediate "What changed and why" splits each change into ad cost, click rate and conversion rate, then names the campaigns behind it. |
| A short, ranked to-do list with the reason for each | **Madgicx AI Marketer**: a daily audit with ranked suggestions, each explained; the user decides. | Beginner gets one "Fix this first"; Intermediate gets Optimize, ranked by money at stake; Advanced gets Actions with bulk decisions. |
| Goals and alerts on metrics | **Databox**: goals, threshold alerts and short metric summaries. | Goal bars and states; Advanced alert rules; Beginner sees goals in plain sentences. |
| One workspace for many clients | **Adriel**: agencies run many clients from one place. | Advanced Portfolio covers all accounts. Client permissions and scheduled client reports are listed as gaps. |
| Progressive disclosure | General UX practice | The essentials come first. Detail opens on request, at the same level of language. |
| Tell the user where a statement comes from | AI-product trust practice | "From your data" / "AdMate's read" / "Suggested step" / "AI answer" labels. |
| Never fake a control | Your brief | Every button works, or the text says plainly what happens in the real app. |

We did not copy any of these interfaces. We kept AdMate's look (Space Grotesk and IBM Plex Mono, violet, priority colours) and its rules: no forecasts, AdMate never changes the ad account, and a single day never triggers a budget call.

---

## 3. The three views side by side

| Dimension | Beginner — Understand | Intermediate — Analyze & optimize | Advanced — Control & scale |
|---|---|---|---|
| **Target user** | Small business owners and people new to ads. | Marketers and owners who run their own ads and know the basics. | Performance marketers, specialists and agencies with several accounts. |
| **Primary goal** | Know if ads are OK, what to fix first and what to do next. | Understand why results change and which optimization is worth the most. | See everything at once, direct attention and budget, and act on many items fast. |
| **Main dashboard** | **Home**: one coloured "Am I doing OK?" card (main goals in plain sentences), "Fix this first" with steps, "What's working", one simple chart, and plain definitions of terms. | **Overview**: 4 status chips, an AdMate one-liner, key-result tiles with trend lines, a trend chart, **What changed and why** (causes plus the campaigns behind them) and the top 3 optimizations. | **Portfolio**: every account in one table (status, spend, main goal, problems, money at stake, top problem) and cross-account "needs action now". Then a dense **Overview**: goals table, "Why goals moved" table and data notes. |
| **Navigation structure** | 3 main pages (Home, To-do, My ads) + Upload and Goals under "More". | 4 main pages (Overview, Optimize, Campaigns, Audiences & creatives) + Data & settings (Reports, Upload, Goals). | All accounts (Portfolio), then This account (Overview, Actions, Campaigns, Explorer, Budget, Audience, Alerts), then Data & settings. |
| **Default information displayed** | The 3 main goals, the one most urgent problem, one success, one chart. Smaller goals are one click away. | The 4 biggest goals, the 3 biggest changes with causes, the top 3 optimizations. | All goals with targets, break-even and confidence. Every driver. All accounts. |
| **Metrics and terminology** | No jargon. "Each conversation cost you $0.93"; "click rate" instead of CTR; "$1.73 back for every $1" instead of ROAS. | Standard terms (CTR, CPM, ROAS, Cost/conv.), explained when you hover them. | Standard terms with no explanations, plus frequency, CPC, conversion rate, z-score and index. |
| **Chart and visualization complexity** | One bar chart (results per day), best day marked, one plain takeaway. | Tiles with small trend lines; a daily chart with two axes; "why" bars; overlaid lines in Compare. | Dense tables with mini trend lines, spend-vs-result bars, driver tables, and the same charts as Intermediate. |
| **AI analysis depth** | One plain-language reading per item, with a "likely reason" marked as a best guess. | The cause split into drivers (e.g. "conversion rate −43% explains ~94% of the drop"), the campaigns behind it, siblings compared. | All of that, plus statistics: the comparison basis, the history checked, confidence and how each call was judged. |
| **Recommendation style** | One thing at a time: "Do this first", 1–3 steps, "I did this" / "Remind me tomorrow". | Ranked by money at stake; open one to investigate (1 What changed → 2 Why → 3 Where → 4 Day by day → What to do). | A queue to work through: filter, sort and decide in bulk; budget shifts as "take from / give to / fix first". |
| **Campaign comparison** | None; each campaign is a card with a plain status. | Tick 2–3 campaigns, ad sets or ads, then Compare: side-by-side metrics, best and worst marked, a sentence explaining the difference, an overlay chart. Creatives are compared within their ad set. | **Campaigns**: the Intermediate table plus CPM, frequency and money at stake, with the same Compare. **Explorer**: any level, any columns, sort, group by goal, platform, role or campaign, with subtotals. |
| **Filters and customization** | The same period picker as the other views (day, week, month or calendar; compare with the period before, a period you pick, or nothing), summed up in a plain sentence; the My ads filter (All / Needs attention / Doing well / Too early). | The same period picker; filters for goal and level; sort Optimize. | The same period picker; column picker; search; goal, platform and priority filters; "only items with a problem"; quick views; saved views; CSV export. |
| **Alerts and monitoring** | The badge on To-do; "AdMate is keeping an eye on N smaller things". | The badge on Optimize; a "Watch" tab for early signals. | **Alerts**, in two parts. **Automatic alerts:** every campaign against its own past and its target, as sensitive as you choose, with optional good news. **Your own KPI alerts** (e.g. "main result >30% worse", "frequency > 3", "ROAS below break-even"). Shown in AdMate and, on your schedule, sent to Telegram (preview only). Plus on/off switches for AdMate's 19 automatic checks. |
| **Level of user guidance** | High: plain sentences, numbered steps, definitions, the Assistant answers in plain words. | Medium: numbered investigation steps, tooltips, labels on every section. | Low: dense, fast, no explanations. The "/" key jumps to search. |
| **Typical user workflow** | Open Home → read the status → do the one step → tick "I did this" → (optional) ask the Assistant. | Overview → see what changed and why → Optimize → investigate the top item → compare with a sibling → act → mark "Action taken". | Portfolio → open the account with the most at stake → Actions (bulk) or Explorer (saved view) → Budget: click a goal and move money → Alerts: set campaign targets and when to hear about problems. |
| **Key differentiating features** | "Am I doing OK?" in one card · "Fix this first" · plain language · one simple chart. | "What changed and why" · ranking by money at stake · the investigate flow · Compare · creatives within ad sets. | Portfolio across accounts · Explorer with saved views and CSV · bulk actions · Budget by goal · automatic and KPI alerts, with a Telegram schedule. |

---

## 4. Design rationale

- **Beginner is designed around worry, not data.** A new advertiser's real question is "am I wasting money?". So the first thing on screen is a coloured verdict and one sentence per main goal, with numbers in plain words. Everything else is hidden until asked for. The first card is the *most urgent* problem, not the most expensive one: a tracking break comes first because it makes every other number wrong. "More detail" stays in plain language. Only an explicit link opens the full analysis, so nobody is pushed into expert screens by accident.
- **Intermediate is designed around "why".** People who run their own ads already see the numbers in Meta or TikTok. What they lack is the diagnosis. AdMate's engine can split a change in cost per result into ad cost, click rate and conversion rate. It also knows which campaigns moved the total and how ads compare within an ad set. Intermediate makes those the centre of the experience: what changed, why, where, and which fix is worth the most money.
- **Advanced is designed around speed and scale.** Experts don't want explanations; they want control. One table for everything, their own columns and saved views, decisions on many items at once, budget by goal, and alerts that watch every campaign for them: automatically against its past and its target, or by their own KPI limits. Agencies also need every client at a glance, so Advanced starts on the Portfolio.
- **Budget starts from the goal, not from a table** (v5.1). People think "how much am I spending on sales?" before "which campaign?". So Budget opens with spend by goal. One click shows every campaign with that goal: what it costs, what it brings in, and AdMate's call.
- **Choosing dates isn't an expert skill** (v5.1). A beginner also asks "how did my sale weekend go?". So every view has the same period picker, calendar included. Beginner differs only in how the period is described.
- **One engine, three views.** All three use the same analysis, priorities and money figures, so switching views never contradicts what you saw before. Switching keeps you on the same subject (e.g. Advanced Explorer → Intermediate Campaigns → Beginner My ads).

---

## 5. Example: the same problem in each view

**The situation (sample account Lotus Skincare, Oct 10–16 vs Oct 3–9):** the catalog sales campaign's ROAS fell from 3.02× to 1.73×. People still click as often, but fewer of them buy. AdMate calculates this as **$809 in lost revenue** compared with the week before.

| | What the user sees | What they do |
|---|---|---|
| **Beginner** | Home: **"Your ads need attention: 4 problems to fix"** · *"Sales: you got $1.73 back in sales for every $1 you spent. Your goal is $3.00 back, so you're losing money on these ads."* Opening the item: *"People click … as often as before (click rate −0.0%), but the share of clickers who bought or signed up fell from 3.8% to 2.2%. This cost you about $809 in lost sales."* Step: *"Open the landing page on a phone, submit the form yourself, and confirm the conversion is recorded."* | Does the one step, taps **I did this**, or asks the Assistant "Explain this simply". |
| **Intermediate** | Overview → **What changed and why**: *"Sales ROAS 3.02× → 1.73× (−43%)"*, bars showing conversion rate −43% (about 94% of the change), and *"Mainly because fewer of the people who clicked went on to act."* "Where it came from": that campaign, **$809 lost revenue**. Optimize: **#1**, ranked by money. The investigate panel: 1 What changed → 2 Why → 3 Where (its ad sets and ads) → 4 Day by day → What to do. | Investigates, checks which ad set dropped, compares the two catalog ad sets, fixes the page, marks **Action taken**. |
| **Advanced** | Portfolio: Lotus is **"Needs action"**, 6 problems (3 high), **$1,051 at stake**. In "Needs action now, across accounts" this item is #2, after Bloom Co's $1,131 problem. **Automatic alerts** catch it with no setup: *"ROAS 1.73× vs 3.02× in Oct 3–9: 43% worse"* (vs its past) and *"vs the goal target 3.00×: 42% worse"* (vs its target). Budget → Sales: its call is **"Fix first, then add"**. | Works through Actions in bulk, saves an Explorer view "Where money leaks", and sets a Telegram summary for Monday mornings (a preview in the prototype). |

---

## 6. How navigation changes

| | Beginner | Intermediate | Advanced |
|---|---|---|---|
| **Lands on** | Home | Overview | Portfolio (all accounts) |
| **Main menu** | Home · To-do · My ads | Overview · Optimize · Campaigns · Audiences & creatives | Portfolio · Overview · Actions · Campaigns · Explorer · Budget · Audience · Alerts |
| **Secondary** | Upload report · Goals & settings | Reports · Upload report · Goals & settings | Reports · Upload report · Goals & settings |
| **Badge** | To-do (decisions waiting) | Optimize (decisions waiting) | Actions (decisions waiting) and Alerts (automatic alerts plus KPI alerts fired) |
| **Period control** | **The same picker in every view** (v5.1): day, week, month or calendar; compare with the period before, a chosen period, or nothing. Beginner adds a plain sentence: "Showing … compared with …" | The same picker | The same picker |
| **Detail panel** | Plain: what's happening, why it matters, what to do, a simple chart | Investigate: numbered steps with source labels | Investigate + statistics, "how it was judged" open |

**Shared in every view:**
- The **account switcher** at the top of the sidebar works; you can try all 4 sample accounts.
- **"Your view"** sits right under it. The menu shows each view's job and who it's for, plus "Compare the three views".
- The **Assistant** button sits bottom right.
- The **period picker**, calendar included, sits under each page title.
- The **welcome question** appears once at the start and can be shown again from the sidebar.

---

## 7. Feature availability

| Feature | Beginner | Intermediate | Advanced |
|---|---|---|---|
| Goal status | **Simplified** (plain sentences, main 3) | Shared (tiles with state) | **Expanded** (table with target, break-even, confidence) |
| Problems & opportunities | **Simplified** (one at a time, To-do) | **Expanded** (Optimize, ranked by money) | **Expanded** (Actions, bulk, filters) |
| Item detail | **Simplified** (plain) | Shared (investigate flow) | **Expanded** (+ statistics) |
| "What changed and why" (drivers) | — | **Exclusive to Intermediate and Advanced** | Shown as a table |
| Money at stake (looking back) | In plain words ("cost you about $809") | Shown and used for ranking | Shown and sortable |
| Campaign list | **Simplified** (cards) | Hierarchy table | **Expanded** (Campaigns, with CPM, frequency and money at stake; Explorer) |
| Compare 2–3 items | — | Yes (Campaigns) | Yes (Campaigns, since v5.1) |
| Creatives within ad sets | — | Yes | Via Explorer "Creative check" |
| Audience insight | — | Yes (tab) | Yes (own page, plus index and z-score) |
| Portfolio (multi-account) | — | — | **Exclusive** |
| Saved views, column picker, CSV | — | — | **Exclusive** |
| Bulk decisions | — | — | **Exclusive** |
| Budget by goal (click a goal to see all its campaigns' spending) | — | — | **Exclusive** |
| Automatic alerts (vs its past, vs its target) | — | — | **Exclusive** |
| Your own KPI alerts and check switches | — | — | **Exclusive** |
| Campaign targets | — (goal targets only) | — (goal targets only) | **Exclusive** (on Alerts) |
| Telegram schedule and message preview | — | — | **Exclusive** (preview only; nothing is sent) |
| Period picker with calendar | Shared | Shared | Shared |
| Summary report | Shared ("Share a summary") | Shared | Shared |
| AdMate Assistant | Shared (plain style) | Shared (explains drivers) | Shared (precise, cites the comparison basis) |
| Goals & settings, Upload, Reports | Shared (Reports hidden) | Shared | Shared |

---

## 8. What each view helps people do

- **Beginner:**
  - know in 10 seconds whether their ads are OK;
  - fix the most urgent problem with clear steps;
  - learn the basic terms by using them;
  - look at any dates they care about, such as a sale weekend.
- **Intermediate:**
  - see why a result moved, not just that it moved;
  - spend their time on the fixes worth the most money;
  - test creatives and audiences fairly, comparing like with like.
- **Advanced:**
  - see every account at once;
  - spot the biggest money leaks quickly;
  - decide in bulk and move budget goal by goal, with evidence;
  - be warned when a campaign falls behind its past or its target, or crosses their own KPI limits: in AdMate now, and on Telegram at the times they pick once the bot is built.

---

## 9. Before → after (measured on the prototype, desktop 1280 × 860)

| Measure | v4 | v5 |
|---|---|---|
| Words above the content (banners, notes, comparison text) | ~104 | **46** |
| Beginner Home | 453 words · 2.1 screens | **290 words · 1.7 screens** |
| Intermediate Overview | 1,023 words · 174 numbers · ~4.3 screens | **563 words · 99 numbers · 2.5 screens** |
| Advanced Overview | identical to Intermediate | **458 words · 132 numbers**: denser on purpose, a different job |
| Same item's detail panel | ~420 words at every level | **Beginner ~106 words** · Intermediate ~574 (adds why + where) · Advanced ~676 (adds statistics) |
| Pages repeating each other on the Overview | 3 sections | **0** |
| Controls that did nothing | 5 | **0** (the upload page says plainly that uploading is off in the prototype) |

The Intermediate and Advanced detail panels are longer than before. That is on purpose: they are now the place where people investigate. Numbered steps, a "why" chart and the ad set / ad table replace what used to be spread over several pages.

These measures are from v5 (20 October) and were not re-taken for v5.1, which swaps Beginner's four period buttons for one period button and adds to Advanced. The new Telegram settings save and preview, and say plainly that nothing is sent, so there are still no controls that pretend to work.

---

## 10. Current gaps (needs more work)

1. **None of v5 or v5.1 is in the real app yet.** It's a prototype on sample data; the live site runs v3.
2. **Multi-account:**
   - **Done:** the Portfolio uses the four sample accounts that already ship with AdMate.
   - **Still needed for agencies:** client folders, team members and permissions, and scheduled client (white-label) reports.
3. **Alerts:**
   - **Done (prototype):** automatic alerts (vs its past, vs its target) and your own KPI alerts, shown in AdMate with a menu badge; campaign targets; Telegram schedule settings and a preview of the exact message. Everything is saved in the browser.
   - **Still needed in the app:**
     - database tables for alert settings, KPI rules and campaign targets, per account;
     - a background job that checks alerts each time new data arrives, plus a scheduler for the send times people choose, in their time zone;
     - **the AdMate Telegram bot**: a bot token kept as a server secret, and a "Connect Telegram" step. Telegram doesn't let a bot message someone first, so each user taps **Start** on the bot once and AdMate saves their chat. The prototype's username box stands in for this step;
     - a limit so people aren't flooded (e.g. one message per send time, with the rest in AdMate). Email or LINE could follow the same pattern.
   - **To tune with real accounts:** the "AdMate decides" limits (20% vs its past, with confidence; 10% vs its target, on 10+ results) are starting values. False alarms would hurt trust, so check them against real data first.
4. **Saved views, level choice, alert settings, campaign targets and Telegram settings** are saved in the browser. They should move to the user's account so they follow the user across devices.
5. **Connecting an ad account** is still by file upload. A direct Meta/TikTok/Google connection would remove manual exports. It needs each platform's API approval and credentials, and it is a major decision.
6. **Bulk decisions only record what the user did.** AdMate never changes ad accounts (by design). Changing campaigns from AdMate would be a separate, risky feature.
7. **Audience insight** needs breakdown exports. The real app (v3) accepts them; the sample's split is simulated and labelled.
8. **Assistant:**
   - **Done:** in the prototype it uses the viewer's own Claude account.
   - **Still needed in the app:** a server-side AI key, a daily limit per user, cost tracking, and tests of answer quality.
9. **"Did it work?":** the real app already re-checks done items after the next upload. The prototype can't show results, because its sample data doesn't change.
10. **An engine behaviour to fix:** when an ad set's other ads have fewer than 10 results, an ad is judged against its own past. During a campaign-wide drop (e.g. a landing page problem), this can say "Pause or replace" to the *better* creative. The prototype now shows which comparison was used. The fix: skip per-ad pause calls while the whole campaign has a diagnosed landing page or tracking problem.
11. **Prototype-only behaviour:**
    - Changing a campaign's goal or funnel role shows a message instead of re-running the analysis (the real app re-runs it).
    - "Add an ad account" doesn't create one.
12. **Not yet validated with users.** The word counts and screen heights are proxies. Five users per level should try the tasks below.
13. **Accessibility:** colours were chosen for contrast and every colour comes with an icon or word. A formal WCAG check and screen-reader test are still to do.
14. **Phones:**
    - **Works now:** Beginner and Intermediate fit a phone. So do Advanced Budget and the Alerts settings, and the calendar shows one month at a time.
    - **Still needed:** Advanced tables (Campaigns, Explorer, campaign targets) scroll sideways inside their box. Advanced is desktop-first, like Google Ads Expert mode, and a phone layout for it would be a separate project.

---

## 11. Implementation status

| Item | Status |
|---|---|
| Three views with different menus, landing pages and jobs | **Implemented** (prototype) |
| Welcome question, "Your view" switch, switching that keeps the subject | **Implemented** · improved from v4 |
| Beginner Home, To-do, My ads, plain detail panel, simple chart | **Implemented** · improved from v4 |
| The same period picker, with a calendar, in every view | **Implemented** (v5.1) |
| Intermediate "What changed and why", Optimize ranked by money at stake, investigate flow | **Implemented** (new) |
| Intermediate Compare (2–3 items) and creatives within ad sets | **Implemented** (new) |
| Advanced Portfolio, dense Overview, Actions with bulk decisions | **Implemented** (new) |
| Advanced Campaigns (the Intermediate table plus CPM, frequency and money at stake; Compare) | **Implemented** (v5.1) |
| Advanced Explorer (columns, filters, grouping, quick/saved views, CSV) | **Implemented** (new) |
| Advanced Budget, redesigned: spend by goal; click a goal to see all its campaigns; daily spending by campaign; add / fix first / spend less | **Implemented** (v5.1) |
| Advanced Alerts: automatic alerts (vs its past, vs its target; sensitivity; good news) and campaign targets | **Implemented** in-app only (v5.1) |
| Advanced Alerts: your own KPI alerts, templates, fired list, switches for automatic checks | **Implemented** in-app only |
| Telegram: schedule settings and message preview | **Prototype preview only**; sending is a **recommendation** (needs the bot and a server) |
| Source labels (data / AdMate's read / suggested step / AI answer) | **Implemented** |
| Shorter header; account switcher works; no fake controls | **Implemented** · improved from v4 |
| AdMate Assistant (real Claude, level-matched style) | **Implemented** in v4 · page suggestions updated |
| Client permissions, white-label reports, Telegram or email sending, synced settings | **Recommendation** |
| Direct ad-platform connection | **Recommendation** (major decision) |
| Building v5 into the real app | **Recommendation** (next phase, needs approval) |

---

## 12. Assumptions we made

- **Naming:** the views keep your names (Beginner, Intermediate, Advanced) and add their job (Understand, Analyze & optimize, Control & scale). People choose by job as much as by skill.
- **Beginner pages:** Beginner doesn't get Audience insight or Reports. They are optimization tools; Beginner stays focused on the three questions.
- **Advanced starts on Portfolio** because agencies are part of its audience. A single-account expert can go straight to Overview.
- **Money at stake looks backward only:** extra cost or lost revenue against what AdMate expected. There is no forecast, per your earlier decision.
- **Multi-account data:** the Portfolio uses the three sample businesses already in the product (Acme Dental, Bloom Co, Northwind B2B) plus Lotus. No new data was invented.
- **Saved in the browser:** the level, account, alert rules, automatic-alert settings, campaign targets, Telegram settings and saved views are saved per browser in the prototype. Decisions (done, remind, dismiss) last for the session.
- **Beginner dates (v5.1):** Beginner uses the same period picker as the other views, as you asked. Only the sentence describing the period is simpler.
- **"Past" means the campaign's own earlier results** in the comparison period (by default, the period right before). Comparing a new campaign with *earlier campaigns of the same goal* (e.g. this sale vs the last sale) isn't built. It could be a later option.
- **Campaign targets are kept in the unit the campaign is judged by.** If a campaign is later judged differently (e.g. purchase values start arriving, so cost per purchase becomes ROAS), its old target is ignored rather than misread.
- **Telegram:** the prototype asks for a username to keep the preview simple. The real app would connect Telegram through the bot instead (see gap 3).

---

## 13. Suggested next steps

1. **Run a 30-minute test per view**, with 5 people each. Example tasks:
   - Beginner: "Are your ads OK this week? What would you do first? How did October 1–14 compare with September 1–14?"
   - Intermediate: "Why did sales get worse? Which fix is worth most?"
   - Advanced: "Which account needs you first? Which sales campaign should get more budget? Get a Telegram summary every Monday at 9:00."
2. **Decide what to build first** in the real app. Our suggestion:
   1. The three menus and Beginner Home.
   2. Intermediate "What changed and why" and Optimize. The engine already supports these.
   3. Advanced Explorer and Portfolio.
   4. Alerts: automatic alerts first (they work with no setup), then your own KPI alerts, then Telegram (needs the bot, a scheduler and your OK on new credentials).
3. **Fix the per-ad "pause" rule** described in gap 10.
4. **Store settings in the user's account:** level, saved views, alert settings, campaign targets and the Telegram connection.
5. **Decide whether to pursue direct Meta/TikTok connections.** This affects onboarding the most.
6. **Decide whether Beginner and Intermediate get alerts too**, for example just the automatic alerts, as a short weekly Telegram summary in plain words.

---

## How to try the prototype

1. Open the prototype link and answer the welcome question.
2. Use **"Your view"** at the top of the sidebar to switch between Beginner, Intermediate and Advanced. "Compare the three views" shows them side by side.
3. Use the **Ad account** switcher to try the four sample businesses. In Advanced, start on **Portfolio**.
4. Click any item to open its detail panel. Try "Ask AdMate" (bottom right) for real AI answers. Claude asks you once to allow it, and it uses your Claude account.
5. Click the **period button** under any page title, choose **Calendar**, click a first and a last day, then **Apply**.
6. In Advanced, open **Budget** and click a goal. Then open **Alerts** to see the automatic alerts, set a campaign target, and preview the Telegram message.

---

### Sources (reference products)

- Google Ads Smart mode vs Expert mode: [Priority Pixels](https://prioritypixels.co.uk/blog/the-difference-between-google-ads-smart-mode-and-expert-mode), [Wix](https://www.wix.com/blog/how-to-advertise-on-google)
- Google Ads Explanations: [Search Engine Roundtable](https://seroundtable.com/google-ads-explanations-29563.html), [PPC Land](https://ppc.land/google-launches-explanations-in-google-64df3ea5e36c17001bef109d/)
- Databox goals, scorecards and alerts: [Databox help centre](https://help.databox.com/overview-databox), [Databox goal software](https://databox.com/goal-software)
- Madgicx AI Marketer: [Madgicx Academy](https://academy.madgicx.com/lessons/how-to-use-ai-marketer), [Madgicx AI Marketer](https://madgicx.com/products/ai-marketer)
- Adriel for agencies: [Adriel BI](https://adriel.com/adriel-bi), [Adriel vs DashThis](https://www.adriel.com/compare/dashthis)
