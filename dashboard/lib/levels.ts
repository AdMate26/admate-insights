// AdMate's three views. Each has its own job, menu and pages; the numbers underneath
// are the same. Used by the server (saved choice, redirects) and the browser (menus).

export const LEVELS = ["beginner", "intermediate", "advanced"] as const;
export type Level = (typeof LEVELS)[number];
export const isLevel = (x: unknown): x is Level => LEVELS.includes(x as Level);

// Shown behind the welcome question, before someone has chosen.
export const DEFAULT_LEVEL: Level = "intermediate";

export const LEVEL_INFO: Record<Level, { name: string; job: string; who: string; see: string[]; example: string }> = {
  beginner: {
    name: "Beginner",
    job: "Understand",
    who: "New to ads, or you just want to know what to do.",
    see: ["“Am I doing OK?” in one sentence", "The biggest problem and the one next step", "Plain words, simple charts"],
    example: "“Each conversation cost you $0.93. Your goal is $1.20, so you’re on track.”",
  },
  intermediate: {
    name: "Intermediate",
    job: "Analyze & optimize",
    who: "You run your own ads and know the basics: budget, ad sets, cost per result.",
    see: ["What changed and why (click rate, ad cost, conversion)", "Optimizations ranked by money at stake", "Compare campaigns, audiences and creatives"],
    example: "“Cost/conv. +42% vs Oct 3–9. Main driver: click rate −32%.”",
  },
  advanced: {
    name: "Advanced",
    job: "Control & scale",
    who: "You manage ads daily, or for several clients, and want speed and control.",
    see: ["All your accounts in one portfolio", "Custom tables, filters, saved views, bulk actions", "Budget allocation and your own alert rules"],
    example: "“4 accounts · $612 at stake · 3 alerts fired · 2 campaigns to scale”",
  },
};

// Pages of one ad account; href is relative to /c/<account>.
export const PAGES = ["overview", "actions", "campaigns", "audience", "portfolio", "explorer", "budget", "alerts", "reports", "upload", "settings"] as const;
export type PageId = (typeof PAGES)[number];
export const PAGE_HREF: Record<PageId, string> = {
  overview: "",
  actions: "/actions",
  campaigns: "/campaigns",
  audience: "/audience",
  portfolio: "/portfolio",
  explorer: "/explorer",
  budget: "/budget",
  alerts: "/alerts",
  reports: "/reports",
  upload: "/upload",
  settings: "/settings",
};
// The URL parameters of the selected period, and the pages that keep it when you
// move between them (analysis pages; not uploads or settings).
export const PERIOD_KEYS = ["from", "to", "cmp", "cfrom", "cto", "report", "vs"] as const;
export const KEEPS_PERIOD = new Set<PageId>(["overview", "actions", "campaigns", "audience", "portfolio", "explorer", "budget", "alerts"]);

// Menu icons (prototype v5.1), one per subject.
export type MenuIcon = "home" | "todo" | "myads" | "optimize" | "campaigns" | "audience" | "portfolio" | "actions" | "explorer" | "budget" | "alerts" | "reports" | "upload" | "settings";
export type MenuItem = { page: PageId; label: string; icon: MenuIcon; hint: string; badge?: "actions" | "alerts" };
export type MenuGroup = { group: string | null; items: MenuItem[] };

// One menu per view, built around its job (prototype v5.1 NAVS).
const UPLOAD: MenuItem = { page: "upload", label: "Upload report", icon: "upload", hint: "Add a new export" };
const REPORTS: MenuItem = { page: "reports", label: "Reports", icon: "reports", hint: "Your uploaded reports" };
const SETTINGS: MenuItem = { page: "settings", label: "Goals & settings", icon: "settings", hint: "Targets, break-even, account" };
export const MENUS: Record<Level, MenuGroup[]> = {
  beginner: [
    {
      group: null,
      items: [
        { page: "overview", label: "Home", icon: "home", hint: "Am I doing OK? What do I fix first?" },
        { page: "actions", label: "To-do", icon: "todo", hint: "What to do next, one thing at a time (badge: things waiting)", badge: "actions" },
        { page: "campaigns", label: "My ads", icon: "myads", hint: "Each campaign and how it's doing" },
      ],
    },
    { group: "More", items: [UPLOAD, { ...SETTINGS, hint: "Your goals and account details" }] },
  ],
  intermediate: [
    {
      group: null,
      items: [
        { page: "overview", label: "Overview", icon: "home", hint: "What changed, and why" },
        { page: "actions", label: "Optimize", icon: "optimize", hint: "Fixes and opportunities ranked by money at stake (badge: decisions waiting)", badge: "actions" },
        { page: "campaigns", label: "Campaigns", icon: "campaigns", hint: "Every campaign, ad set and ad; compare two or three" },
        { page: "audience", label: "Audiences & creatives", icon: "audience", hint: "Who responds, where and when, and which creatives work" },
      ],
    },
    { group: "Data & settings", items: [REPORTS, UPLOAD, SETTINGS] },
  ],
  advanced: [
    { group: "All accounts", items: [{ page: "portfolio", label: "Portfolio", icon: "portfolio", hint: "Every account in one table" }] },
    {
      group: "This account",
      items: [
        { page: "overview", label: "Overview", icon: "home", hint: "Goals, drivers and data notes at a glance" },
        { page: "actions", label: "Actions", icon: "actions", hint: "Filter, sort and decide in bulk (badge: decisions waiting)", badge: "actions" },
        { page: "campaigns", label: "Campaigns", icon: "campaigns", hint: "The full table with CPM, frequency and money at stake" },
        { page: "explorer", label: "Explorer", icon: "explorer", hint: "Any level, your columns, saved views, CSV" },
        { page: "budget", label: "Budget", icon: "budget", hint: "Spend by goal, and where to add or cut" },
        { page: "audience", label: "Audience", icon: "audience", hint: "Segments with index and z-score" },
        { page: "alerts", label: "Alerts", icon: "alerts", hint: "Automatic alerts, your own KPI alerts and Telegram (badge: alerts now)", badge: "alerts" },
      ],
    },
    { group: "Data & settings", items: [REPORTS, UPLOAD, SETTINGS] },
  ],
};

const DEFAULT_LABEL: Record<PageId, string> = {
  overview: "Overview",
  actions: "Actions",
  campaigns: "Campaigns",
  audience: "Audience insight",
  portfolio: "Portfolio",
  explorer: "Explorer",
  budget: "Budget",
  alerts: "Alerts",
  reports: "Reports",
  upload: "Upload report",
  settings: "Goals & settings",
};
const itemOf = (level: Level, page: PageId) => MENUS[level].flatMap((g) => g.items).find((i) => i.page === page);
export const pageLabel = (level: Level, page: PageId) => itemOf(level, page)?.label ?? DEFAULT_LABEL[page];

// Where a page goes when the view changes, so switching keeps you on the same subject.
const EQUIV: Record<Level, Partial<Record<PageId, PageId>>> = {
  beginner: { audience: "overview", portfolio: "overview", explorer: "campaigns", budget: "campaigns", reports: "overview", alerts: "actions" },
  intermediate: { portfolio: "overview", explorer: "campaigns", budget: "campaigns", alerts: "actions" },
  advanced: {},
};
export const pageFor = (level: Level, page: PageId): PageId => (itemOf(level, page) ? page : (EQUIV[level][page] ?? "overview"));

// "/c/<account>/<page>" → the account id and page, or null for other paths.
export function parseAccountPath(pathname: string): { ws: string; page: PageId } | null {
  const m = /^\/c\/([A-Za-z0-9_-]+)(?:\/([a-z]+))?\/?$/.exec(pathname);
  if (!m) return null;
  const page = (Object.keys(PAGE_HREF) as PageId[]).find((p) => PAGE_HREF[p] === (m[2] ? `/${m[2]}` : ""));
  return page ? { ws: m[1], page } : null;
}
