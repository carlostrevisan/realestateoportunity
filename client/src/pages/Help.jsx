import React from "react";

export default function Help() {
  return (
    <div className="flex-1 overflow-y-auto bg-plt-bg p-4 sm:p-6 md:p-10 font-sans max-w-4xl mx-auto custom-scrollbar">
      <header className="mb-8 sm:mb-10 border-b border-plt-border pb-5 sm:pb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-plt-primary mb-2 tracking-tight">System Documentation</h1>
        <p className="text-plt-secondary font-sans font-bold text-xs uppercase tracking-widest">
          RE Opportunity — Technical Overview & Design
        </p>
      </header>

      <section className="mb-12">
        <h2 className="text-xl font-semibold text-plt-primary mb-4 flex items-center gap-2">
          <span className="w-1.5 h-6 bg-plt-accent inline-block rounded-full" />
          What is this?
        </h2>
        <div className="space-y-4 text-plt-secondary leading-relaxed">
          <p>
            The <span className="text-plt-primary font-medium">RE·OPP·ENGINE</span> is an automated investment analysis platform designed to identify "Buy, Demolish, Rebuild" candidates across Florida's high-growth markets.
          </p>
          <p>
            By combining real-time MLS data, U.S. Census socio-economic markers, and high-precision geospatial feature engineering (0.5-mile radius comps), the system calculates the potential profit of acquiring an older property, replacing it with a modern build, and selling it at the current market premium.
          </p>
        </div>
      </section>

      <section className="mb-12">
        <h2 className="text-xl font-semibold text-plt-primary mb-4 flex items-center gap-2">
          <span className="w-1.5 h-6 bg-plt-accent inline-block rounded-full" />
          How it Works
        </h2>
        <div className="grid md:grid-cols-3 gap-3 md:gap-6">
          <div className="bg-plt-panel p-5 border border-plt-border rounded-lg shadow-sm">
            <div className="text-plt-accent font-sans font-bold text-xs mb-3 font-bold uppercase tracking-tighter">Phase 01 — Ingestion</div>
            <p className="text-xs leading-relaxed text-plt-text-secondary">
              Our <strong>Data Engine</strong> scrapes listing data from Realtor.com via HomeHarvest, processes dates and missing fields, and fetches median household income from the <strong>U.S. Census Bureau</strong>.
            </p>
          </div>
          <div className="bg-plt-panel p-5 border border-plt-border rounded-lg shadow-sm">
            <div className="text-plt-accent font-sans font-bold text-xs mb-3 font-bold uppercase tracking-tighter">Phase 02 — Intelligence</div>
            <p className="text-xs leading-relaxed text-plt-text-secondary">
              An <strong>XGBoost ML Model</strong> analyzes thousands of recent sales to predict a brand-new home's sale price. It relies heavily on a <strong>0.5-mile geospatial radius</strong> to evaluate hyper-local price-per-square-foot dynamics.
            </p>
          </div>
          <div className="bg-plt-panel p-5 border border-plt-border rounded-lg shadow-sm">
            <div className="text-plt-accent font-sans font-bold text-xs mb-3 font-bold uppercase tracking-tighter">Phase 03 — Validation</div>
            <p className="text-xs leading-relaxed text-plt-text-secondary">
              The dashboard overlays <strong>Market Context</strong> (active new builds) and calculates proximity-based <strong>Comparable Sales</strong> within a strict 0.5-mile radius, visually distinguishing between new construction and older history.
            </p>
          </div>
        </div>
      </section>

      <section className="mb-12">
        <h2 className="text-xl font-semibold text-plt-primary mb-4 flex items-center gap-2">
          <span className="w-1.5 h-6 bg-plt-accent inline-block rounded-full" />
          The ML Model (XGBoost)
        </h2>
        <div className="bg-plt-panel border border-plt-border rounded-lg overflow-hidden shadow-sm">
          <div className="p-5 border-b border-plt-border">
            <h3 className="text-sm font-bold text-plt-primary mb-2 uppercase tracking-wider font-sans font-bold">Algorithm & Architecture</h3>
            <p className="text-xs text-plt-secondary leading-relaxed">
              The engine utilizes <strong>Extreme Gradient Boosting (XGBoost)</strong> specifically tuned for tabular regression. To prevent over-reliance on wide ZIP codes, the system calculates a localized <code>avg_new_build_price_sqft_05mi</code> for every property.
            </p>
          </div>

          <div className="p-4 sm:p-5 border-b border-plt-border grid md:grid-cols-2 gap-4 md:gap-8">
            <div>
              <h4 className="text-[10px] font-bold text-plt-accent uppercase mb-3 font-sans font-bold">Model Performance</h4>
              <div className="space-y-3">
                <div className="flex justify-between items-end border-b border-plt-border pb-1">
                  <span className="text-xs font-semibold text-plt-text-secondary">Validation Split</span>
                  <span className="text-sm font-sans font-bold text-plt-primary">20%</span>
                </div>
                <div className="flex justify-between items-end border-b border-plt-border pb-1">
                  <span className="text-xs font-semibold text-plt-text-secondary">Target Subsample</span>
                  <span className="text-sm font-sans font-bold text-plt-primary">0.8</span>
                </div>
                <p className="text-[9px] text-plt-muted leading-tight mt-2">
                  *A custom Weighted Scoring algorithm is also available as a deterministic fallback mechanism.
                </p>
              </div>
            </div>
            <div>
              <h4 className="text-[10px] font-bold text-plt-accent uppercase mb-3 font-sans font-bold">Training Parameters</h4>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 font-sans font-bold text-[10px]">
                <div className="text-plt-muted font-bold">LEARNING RATE:</div><div className="text-plt-primary text-right">0.05</div>
                <div className="text-plt-muted font-bold">MAX DEPTH:</div><div className="text-plt-primary text-right">6</div>
                <div className="text-plt-muted font-bold">ESTIMATORS:</div><div className="text-plt-primary text-right">1000</div>
                <div className="text-plt-muted font-bold">NEW BUILD YR:</div><div className="text-plt-primary text-right">&ge;2015</div>
              </div>
            </div>
          </div>

          <div className="p-5">
            <h4 className="text-[10px] font-bold text-plt-accent uppercase mb-3 font-sans font-bold">Core Feature Inputs</h4>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-[10px] mb-1 uppercase font-sans font-bold">
                  <span className="font-bold text-plt-text-secondary">1. Hyper-Local Baseline (0.5mi)</span>
                  <span className="text-plt-accent"><code>avg_new_build_price_sqft_05mi</code></span>
                </div>
                <p className="text-[10px] text-plt-muted">The average price/sqft of newly built homes strictly within a 0.5-mile Haversine radius.</p>
              </div>
              <div>
                <div className="flex justify-between text-[10px] mb-1 uppercase font-sans font-bold">
                  <span className="font-bold text-plt-text-secondary">2. Physical Dimensions</span>
                  <span className="text-plt-accent"><code>sqft</code> & <code>lot_sqft</code></span>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-[10px] mb-1 uppercase font-sans font-bold">
                  <span className="font-bold text-plt-text-secondary">3. Geographic & Economic</span>
                  <span className="text-plt-accent"><code>zip</code> & <code>median_household_income</code></span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-plt-bg/50 p-5 font-sans font-bold text-[11px] text-plt-secondary border-t border-plt-border">
            <p className="mb-2 uppercase font-bold text-plt-primary underline decoration-plt-accent underline-offset-4">What the model generates:</p>
            The model outputs a <strong>Rebuild Ceiling</strong>. It evaluates the raw land and location against the current premium for new construction, producing a hypothetical maximum value if the structure was rebuilt to current market standards.
          </div>
        </div>
      </section>

      <section className="mb-12">
        <h2 className="text-xl font-semibold text-plt-primary mb-4 flex items-center gap-2">
          <span className="w-1.5 h-6 bg-plt-accent inline-block rounded-full" />
          Dashboard Functionality
        </h2>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="p-4 border border-plt-border rounded-lg bg-plt-panel shadow-sm">
            <h4 className="text-[10px] font-bold text-plt-accent uppercase mb-2 font-sans font-bold tracking-widest">Market Context Toggle</h4>
            <p className="text-xs text-plt-text-secondary">
              Turning this on renders active listings built in the last 5 years as blue dots. This allows you to visually gauge what the competition is asking for new properties in the exact same neighborhood.
            </p>
          </div>
          <div className="p-4 border border-plt-border rounded-lg bg-plt-panel shadow-sm">
            <h4 className="text-[10px] font-bold text-plt-accent uppercase mb-2 font-sans font-bold tracking-widest">Comparable Sales (Comps)</h4>
            <p className="text-xs text-plt-text-secondary">
              When a property is selected, the system finds recent sales strictly within <strong>0.5 miles</strong>, prioritizing new builds. Clicking a comp card automatically pans the map and opens an interactive popup with valuation math.
            </p>
          </div>
        </div>
      </section>

      <section className="mb-12">
        <h2 className="text-xl font-semibold text-plt-primary mb-4 flex items-center gap-2">
          <span className="w-1.5 h-6 bg-plt-accent inline-block rounded-full" />
          Mathematical Formula
        </h2>
        <div className="bg-plt-panel p-6 border border-plt-border rounded-lg text-center font-sans font-bold shadow-sm">
          <div className="text-lg text-plt-primary mb-2 font-black tracking-tight">
            Opportunity = <span className="text-plt-accent">Vₚᵣₑ</span> - (<span className="text-plt-danger">Cₐ꜀</span> + <span className="text-plt-danger">C꜀ₒₙ</span>)
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8 text-left text-[10px]">
            <div className="p-3 bg-plt-bg rounded border border-plt-border">
              <span className="text-plt-accent font-bold uppercase tracking-wider block mb-1">Vₚᵣₑ (Predicted Value)</span>
              <span className="text-plt-text-secondary leading-relaxed">ML-generated sale price for a newly built home on the property.</span>
            </div>
            <div className="p-3 bg-plt-bg rounded border border-plt-border">
              <span className="text-plt-danger font-bold uppercase tracking-wider block mb-1">Cₐ꜀ (Acquisition Cost)</span>
              <span className="text-plt-text-secondary leading-relaxed">The current asking price required to purchase the teardown lot.</span>
            </div>
            <div className="p-3 bg-plt-bg rounded border border-plt-border">
              <span className="text-plt-danger font-bold uppercase tracking-wider block mb-1">C꜀ₒₙ (Construction Cost)</span>
              <span className="text-plt-text-secondary leading-relaxed">Estimated cost to rebuild, currently pegged at a baseline of $175/sqft.</span>
            </div>
          </div>
        </div>
      </section>

      <footer className="mt-10 sm:mt-20 pt-6 sm:pt-10 border-t border-plt-border text-center pb-10">
        <p className="text-plt-muted text-[10px] font-sans font-bold uppercase tracking-[0.2em] font-bold">
          Internal Use Only — Confidential Analysis
        </p>
      </footer>
    </div>
  );
}
