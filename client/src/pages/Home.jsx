import { Link } from "react-router-dom";

export default function Home() {
  return (
    <div className="flex-1 flex items-center justify-center bg-plt-bg p-8 font-sans">
      <div className="max-w-lg text-center space-y-6">
        <div className="flex items-center justify-center gap-3 mb-2">
          <div className="w-3 h-3 bg-plt-accent rounded-sm shadow-[0_0_14px_var(--plt-accent)]" />
          <h1 className="text-3xl font-black tracking-tighter text-plt-primary">
            RE <span className="text-plt-accent">Opportunity</span>
          </h1>
        </div>
        <p className="text-sm text-plt-muted leading-relaxed">
          Florida real estate opportunity engine — scrapes active listings, trains ML models
          on sold comps, and scores properties by predicted market value vs. list price.
        </p>
        <div className="flex items-center justify-center gap-3 pt-2">
          <Link
            to="/map"
            className="px-5 py-2.5 text-sm font-semibold bg-plt-accent text-white rounded-lg hover:bg-plt-accent/90 transition-colors"
          >
            View Map →
          </Link>
          <Link
            to="/reporting"
            className="px-5 py-2.5 text-sm font-semibold bg-white text-plt-primary border border-plt-border rounded-lg hover:bg-plt-hover transition-colors"
          >
            View Reports →
          </Link>
        </div>
      </div>
    </div>
  );
}
