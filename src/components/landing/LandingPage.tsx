import { useEffect, useId, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Building2,
  Check,
  ChevronDown,
  FileUp,
  Layers3,
  Menu,
  Moon,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Sun,
  Target,
  UserRound,
  X,
  Zap,
} from "lucide-react";
import { plans, type PlanId } from "./plans";
import "./customer-landing.css";

const groups = {
  personal: ["free", "starter", "freelancer"],
  business: ["free", "growth", "pro", "enterprise"],
} satisfies Record<string, PlanId[]>;
type Group = keyof typeof groups;
const planIcons = {
  free: Sparkles,
  starter: Zap,
  freelancer: UserRound,
  growth: Target,
  pro: Building2,
  enterprise: Layers3,
};
const flow = [
  {
    icon: FileUp,
    tab: "Upload",
    title: "Bring your ad report.",
    description: "Upload an export from Meta, TikTok, Google Ads or LinkedIn.",
    tags: ["Your export", "Private workspace"],
  },
  {
    icon: ScanLine,
    tab: "Analyze",
    title: "See what changed.",
    description: "Compare periods and judge each campaign against its own goal.",
    tags: ["Period comparison", "Campaign goals"],
  },
  {
    icon: Target,
    tab: "Decide",
    title: "Know what to do next.",
    description: "Review the evidence and choose which recommendation to apply.",
    tags: ["AI recommendations", "You make the changes"],
  },
] as const;

export function LandingPage({
  loginHref = "/login",
  legalBase = "",
  option = "a",
  onCookieSettings,
}: {
  loginHref?: string;
  legalBase?: string;
  option?: "a" | "b";
  onCookieSettings?: () => void;
}) {
  const [group, setGroup] = useState<Group>("personal");
  const [all, setAll] = useState(false);
  const [step, setStep] = useState(0);
  const [menu, setMenu] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">();
  const menuId = useId();
  useEffect(() => {
    const preference = matchMedia("(prefers-color-scheme: dark)");
    const sync = () => {
      let saved;
      try {
        saved = localStorage.getItem("admate-theme");
      } catch {
        /* Optional preference. */
      }
      setTheme(
        saved === "light" || saved === "dark" ? saved : preference.matches ? "dark" : "light",
      );
    };
    sync();
    preference.addEventListener("change", sync);
    window.addEventListener("storage", sync);
    return () => {
      preference.removeEventListener("change", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    try {
      localStorage.setItem("admate-theme", next);
    } catch {
      /* Theme still works. */
    }
  }
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const stage = flow[step] ?? flow[0];
  const StageIcon = stage.icon;
  const visiblePlans = all
    ? plans
    : plans.filter((plan) => (groups[group] as PlanId[]).includes(plan.id));

  return (
    <div className="cl" data-theme={theme} data-option={option}>
      <a className="cl-skip" href="#cl-main">
        Skip to content
      </a>
      <header className="cl-header">
        <div className="cl-wrap cl-nav">
          <a href="#cl-main" className="cl-logo" aria-label="AdMate home">
            <img src="/brand/mark-light-bg.svg" alt="" width="30" height="30" />
            <span>
              Ad<strong>Mate</strong>
            </span>
          </a>
          <nav id={menuId} className="cl-nav-links" data-open={menu} aria-label="Main navigation">
            <a href="#how-it-works" onClick={() => setMenu(false)}>
              How it works
            </a>
            <a href="#pricing" onClick={() => setMenu(false)}>
              Pricing
            </a>
          </nav>
          <div className="cl-nav-actions">
            <button
              className="cl-icon-button"
              type="button"
              aria-label="Toggle light and dark mode"
              aria-pressed={theme === "dark"}
              onClick={toggleTheme}
            >
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <a className="cl-button cl-primary" href={loginHref}>
              Log in <ArrowRight size={16} />
            </a>
            <button
              className="cl-icon-button cl-menu"
              type="button"
              aria-label={menu ? "Close menu" : "Open menu"}
              aria-controls={menuId}
              aria-expanded={menu}
              onClick={() => setMenu(!menu)}
            >
              {menu ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </header>
      <main id="cl-main">
        <section className="cl-wrap cl-hero">
          <div className="cl-hero-copy">
            <p className="cl-kicker">
              <Sparkles size={15} /> AI MARKETING ANALYST
            </p>
            <h1>
              {option === "a" ? "See what changed." : "Less digging."}
              <br />
              <em>{option === "a" ? "Know what to do." : "Clearer decisions."}</em>
            </h1>
            <p>Turn your ad reports into clear insights and a next step you can act on.</p>
            <div className="cl-ctas">
              <a className="cl-button cl-primary" href={loginHref}>
                Log in or sign up <ArrowRight size={18} />
              </a>
              <a className="cl-button cl-secondary" href="#pricing">
                See pricing <ArrowDown size={16} />
              </a>
            </div>
            <span className="cl-assurance">
              <ShieldCheck size={17} /> Work from your own ad data
            </span>
          </div>
          <section id="how-it-works" className="cl-visual" aria-label="How AdMate works">
            <div className="cl-visual-heading">
              <span>
                <BarChart3 size={16} /> REPORT TO RECOMMENDATION
              </span>
              <span>0{step + 1} / 03</span>
            </div>
            <div className="cl-steps" role="group" aria-label="Explore the workflow">
              {flow.map(({ tab, icon: Icon }, i) => (
                <button
                  key={tab}
                  type="button"
                  aria-pressed={step === i}
                  onClick={() => setStep(i)}
                >
                  <Icon size={17} /> {tab}
                </button>
              ))}
            </div>
            <div className="cl-stage" key={step} aria-live="polite">
              <div className="cl-graphic" aria-hidden="true">
                <div className="cl-orbit cl-orbit-outer" />
                <div className="cl-orbit cl-orbit-inner" />
                <span className="cl-satellite cl-satellite-a">
                  <FileUp size={20} />
                </span>
                <span className="cl-satellite cl-satellite-b">
                  <BarChart3 size={20} />
                </span>
                <span className="cl-satellite cl-satellite-c">
                  <Check size={20} />
                </span>
                <span className="cl-core">
                  <StageIcon size={42} strokeWidth={1.6} />
                </span>
              </div>
              <div className="cl-stage-copy">
                <h2>{stage.title}</h2>
                <p>{stage.description}</p>
                <div className="cl-tags">
                  {stage.tags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
              </div>
            </div>
            <div className="cl-visual-foot">
              <span>
                <i /> WORKFLOW
              </span>
              <div>
                <button
                  className="cl-icon-button"
                  type="button"
                  aria-label="Previous step"
                  disabled={step === 0}
                  onClick={() => setStep(step - 1)}
                >
                  <ArrowLeft size={17} />
                </button>
                <button
                  className="cl-icon-button"
                  type="button"
                  aria-label="Next step"
                  disabled={step === flow.length - 1}
                  onClick={() => setStep(step + 1)}
                >
                  <ArrowRight size={17} />
                </button>
              </div>
            </div>
          </section>
        </section>
        <section className="cl-pricing" id="pricing" aria-labelledby="cl-pricing-title">
          <div className="cl-wrap">
            <div className="cl-pricing-heading">
              <p className="cl-kicker">PRICING · USD</p>
              <h2 id="cl-pricing-title" tabIndex={-1}>
                Find your AdMate plan.
              </h2>
              <p>From your first brand to a whole portfolio.</p>
              <div className="cl-segment" role="group" aria-label="Plan category">
                {(["personal", "business"] as const).map((item) => (
                  <button
                    key={item}
                    type="button"
                    aria-pressed={group === item && !all}
                    aria-controls="cl-plan-grid"
                    onClick={() => {
                      setGroup(item);
                      setAll(false);
                    }}
                  >
                    {item === "personal" ? <UserRound size={17} /> : <Building2 size={17} />}
                    {item === "personal" ? "Personal" : "Business"}
                  </button>
                ))}
              </div>
            </div>
            <p className="cl-sr-only" role="status">
              {all ? "Showing all six plans" : `Showing ${group} plans`}
            </p>
            <div
              id="cl-plan-grid"
              className="cl-plan-grid"
              data-count={visiblePlans.length}
              key={all ? "all" : group}
            >
              {visiblePlans.map((plan) => {
                const Icon = planIcons[plan.id];
                const featured = plan.id === "starter" || plan.id === "growth";
                return (
                  <article className="cl-plan" key={plan.id} data-featured={featured}>
                    <div className="cl-plan-heading">
                      <span>
                        <Icon size={21} />
                      </span>
                      <h3>{plan.name}</h3>
                    </div>
                    <p className="cl-audience">{plan.description}</p>
                    <div className="cl-price">
                      <span>{plan.id === "enterprise" ? "From" : "USD"}</span>
                      <strong>${plan.price}</strong>
                      <small>/ month</small>
                    </div>
                    <a
                      className={`cl-button ${featured ? "cl-primary" : "cl-secondary"}`}
                      href={loginHref}
                    >
                      Log in or sign up <ArrowRight size={15} />
                    </a>
                    <ul className="cl-plan-facts">
                      <li>
                        <Check size={16} />{" "}
                        {plan.credits === "Custom"
                          ? "Custom AI credits"
                          : `${plan.credits} AI credits / month`}
                      </li>
                      <li>
                        <Check size={16} />{" "}
                        {plan.accounts === "Custom"
                          ? "Custom ad accounts"
                          : `${plan.accounts} ad account${plan.accounts === 1 ? "" : "s"}`}
                      </li>
                      <li>
                        <Check size={16} />{" "}
                        {plan.seats === "Custom"
                          ? "Custom seats"
                          : `${plan.seats} seat${plan.seats === 1 ? "" : "s"}`}
                      </li>
                      <li>
                        <Check size={16} /> {plan.platforms.join(", ")}
                      </li>
                    </ul>
                    <p className="cl-plan-highlight">
                      {plan.id === "free"
                        ? plan.features[0]
                        : plan.id === "enterprise"
                          ? "Dedicated manager"
                          : plan.consultation
                            ? `${plan.consultation} expert consultation${plan.consultation === 1 ? "" : "s"} / month`
                            : plan.id === "freelancer"
                              ? "Weekly reports per account"
                              : "AI optimization recommendations"}
                    </p>
                    {plan.id !== "free" && (
                      <details>
                        <summary>
                          What's included <ChevronDown size={16} />
                        </summary>
                        <ul>
                          {plan.features.map((feature) => (
                            <li key={feature}>{feature}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </article>
                );
              })}
            </div>
            <div className="cl-plan-bottom">
              <button
                className="cl-button cl-secondary"
                type="button"
                aria-expanded={all}
                aria-controls="cl-plan-grid"
                onClick={() => {
                  setAll(!all);
                  document.getElementById("cl-pricing-title")?.focus({ preventScroll: true });
                  document.getElementById("pricing")?.scrollIntoView({
                    behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
                      ? "instant"
                      : "smooth",
                  });
                }}
              >
                {all ? "Back to " + group + " plans" : "See all plans"}
                <ChevronDown size={17} />
              </button>
              <p>
                $4 per extra ad account on Freelancer, Growth and Pro. Credits and seats stay the
                same.
              </p>
              <p>Plan details are for reference. Online checkout is not available yet.</p>
            </div>
          </div>
        </section>
        <section className="cl-wrap cl-closing">
          <span className="cl-closing-icon">
            <Target size={25} />
          </span>
          <div>
            <h2>Start with your own ad report.</h2>
            <p>Sign in to create an account and upload your first export.</p>
          </div>
          <a className="cl-button cl-primary" href={loginHref}>
            Log in or sign up <ArrowRight size={18} />
          </a>
        </section>
      </main>
      <footer className="cl-footer">
        <div className="cl-wrap">
          <span>© {new Date().getFullYear()} AdMate</span>
          <nav aria-label="Footer">
            <a href={`${legalBase}/privacy`}>Privacy</a>
            <a href={`${legalBase}/terms`}>Terms</a>
            {onCookieSettings && (
              <button type="button" onClick={onCookieSettings}>
                Cookie settings
              </button>
            )}
          </nav>
        </div>
      </footer>
    </div>
  );
}
