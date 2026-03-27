import { Link } from "react-router-dom";

const PIPELINE = [
  {
    step: "01",
    label: "Scrape",
    detail: "Active listings pulled from Realtor.com via HomeHarvest - address, price, beds, sqft, lot size.",
  },
  {
    step: "02",
    label: "Clean",
    detail: "Duplicates removed, missing fields imputed, sold comps matched to active listings by ZIP and sqft.",
  },
  {
    step: "03",
    label: "Train",
    detail: "XGBoost and LightGBM models trained on sold comps to predict fair market rebuild value.",
  },
  {
    step: "04",
    label: "Score",
    detail: "Each active listing scored: predicted value minus asking price = opportunity delta, ranked best→worst.",
  },
  {
    step: "05",
    label: "Explore",
    detail: "Browse scored properties on the map or dive into KPIs, charts, and model diagnostics in Reports.",
  },
];

const SECTIONS = [
  {
    to: "/map",
    accent: true,
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
        <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
      </svg>
    ),
    title: "Map",
    body: "Browse scored properties on an interactive map. Click any marker to see price, sqft, opportunity delta, and comparable sales.",
    cta: "View Map →",
  },
  {
    to: "/reporting",
    accent: false,
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
        <path d="M15.5 2A1.5 1.5 0 0014 3.5v13a1.5 1.5 0 001.5 1.5h1a1.5 1.5 0 001.5-1.5v-13A1.5 1.5 0 0016.5 2h-1zM9.5 6A1.5 1.5 0 008 7.5v9A1.5 1.5 0 009.5 18h1a1.5 1.5 0 001.5-1.5v-9A1.5 1.5 0 0010.5 6h-1zM3.5 10A1.5 1.5 0 002 11.5v5A1.5 1.5 0 003.5 18h1A1.5 1.5 0 006 16.5v-5A1.5 1.5 0 004.5 10h-1z" />
      </svg>
    ),
    title: "Reports",
    body: "KPI cards, opportunity distribution chart, ML model performance, and last pipeline run details - all in one dashboard.",
    cta: "View Reports →",
  },
  {
    to: "/ops",
    accent: false,
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
        <path fillRule="evenodd" d="M14.5 10a4.5 4.5 0 004.284-5.882c-.105-.324-.51-.391-.752-.15L15.34 6.66a.454.454 0 01-.493.11 3.01 3.01 0 01-1.618-1.616.455.455 0 01.11-.494l2.694-2.692c.24-.241.174-.647-.15-.752a4.5 4.5 0 00-5.873 4.575c.055.873-.128 1.808-.8 2.368l-7.23 6.024a2.724 2.724 0 103.837 3.837l6.024-7.23c.56-.672 1.495-.855 2.368-.8.096.007.193.01.291.01zM5 16a1 1 0 11-2 0 1 1 0 012 0z" clipRule="evenodd" />
      </svg>
    ),
    title: "Data Engine",
    body: "Trigger scrapes, kick off training runs, monitor live job status, and inspect the full operations log.",
    cta: "Open Engine →",
  },
];

const FACTS = [
  "Listings scraped from Realtor.com via HomeHarvest - no API key needed",
  "XGBoost + LightGBM ensembled; trained on 90-day sold comps per ZIP code",
  "Opportunity score = (predicted rebuild value − list price) / list price × 100",
];

export default function Home() {
  return (
    <div className="flex-1 overflow-y-auto bg-plt-bg font-sans">
      <div className="max-w-3xl mx-auto px-6 py-10 space-y-12">

        {/* Hero */}
        <div className="text-center space-y-3">
          <div className="flex items-center justify-center gap-3">
            <div className="w-3 h-3 bg-plt-accent rounded-sm shadow-[0_0_14px_var(--plt-accent)]" />
            <h1 className="text-3xl font-black tracking-tighter text-plt-primary">
              RE <span className="text-plt-accent">Opportunity</span>
            </h1>
          </div>
          <p className="text-sm text-plt-muted leading-relaxed max-w-md mx-auto">
            Florida real estate intelligence - scrape active listings, train ML models on sold comps,
            and surface properties priced below predicted market value.
          </p>
        </div>

        {/* Pipeline */}
        <div>
          <p className="text-[10px] font-semibold tracking-widest uppercase text-plt-muted mb-4">How it works</p>
          <div className="relative">
            {/* connector line - desktop only */}
            <div className="hidden sm:block absolute top-5 left-[2.25rem] right-[2.25rem] h-px bg-plt-border" />
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
              {PIPELINE.map(({ step, label, detail }, i) => (
                <div key={step} className="flex flex-col items-start sm:items-center gap-2">
                  <div className="flex items-center gap-3 sm:flex-col sm:gap-2 sm:items-center z-10">
                    <div className="w-10 h-10 rounded-full bg-plt-panel border-2 border-plt-accent flex items-center justify-center flex-shrink-0">
                      <span className="font-mono text-[10px] font-bold text-plt-accent">{step}</span>
                    </div>
                    <span className="text-xs font-bold text-plt-primary sm:text-center">{label}</span>
                  </div>
                  <p className="text-[11px] text-plt-muted leading-relaxed sm:text-center pl-0">{detail}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Section cards */}
        <div>
          <p className="text-[10px] font-semibold tracking-widest uppercase text-plt-muted mb-4">Explore the app</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {SECTIONS.map(({ to, accent, icon, title, body, cta }) => (
              <div
                key={to}
                className="bg-plt-panel border border-plt-border rounded-xl p-5 flex flex-col gap-3 hover:shadow-md hover:-translate-y-0.5 transition-all duration-150"
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${accent ? "bg-plt-accent text-white" : "bg-plt-hover text-plt-secondary"}`}>
                  {icon}
                </div>
                <div>
                  <p className="text-sm font-bold text-plt-primary">{title}</p>
                  <p className="text-[11px] text-plt-muted leading-relaxed mt-1">{body}</p>
                </div>
                <Link
                  to={to}
                  className={`mt-auto self-start text-xs font-semibold px-3 py-1.5 rounded transition-colors ${
                    accent
                      ? "bg-plt-accent text-white hover:bg-plt-accent/90"
                      : "border border-plt-border text-plt-secondary hover:bg-plt-hover"
                  }`}
                >
                  {cta}
                </Link>
              </div>
            ))}
          </div>
        </div>

        {/* Under the hood */}
        <div className="bg-plt-panel border border-plt-border rounded-xl p-5">
          <p className="text-[10px] font-semibold tracking-widest uppercase text-plt-muted mb-3">Under the hood</p>
          <ul className="space-y-2">
            {FACTS.map((f) => (
              <li key={f} className="flex items-start gap-2.5 text-[11px] text-plt-secondary leading-relaxed">
                <div className="w-1.5 h-1.5 bg-plt-accent rounded-full mt-1.5 flex-shrink-0" />
                {f}
              </li>
            ))}
          </ul>
        </div>

      </div>
    </div>
  );
}
