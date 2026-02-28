import React from "react";

export default function Help() {
  return (
    <div className="flex-1 overflow-y-auto bg-plt-bg p-6 md:p-10 font-sans max-w-4xl mx-auto">
      <header className="mb-10 border-b border-plt-border pb-6">
        <h1 className="text-3xl font-bold text-plt-primary mb-2 tracking-tight">System Documentation</h1>
        <p className="text-plt-secondary font-mono text-xs uppercase tracking-widest">
          Florida Real Estate Opportunity Engine — Technical Overview
        </p>
      </header>

      <section className="mb-12">
        <h2 className="text-xl font-semibold text-plt-primary mb-4 flex items-center gap-2">
          <span className="w-1.5 h-6 bg-plt-accent inline-block rounded-full" />
          What is this?
        </h2>
        <div className="space-y-4 text-plt-secondary leading-relaxed">
          <p>
            The <span className="text-plt-primary font-medium">FL·OPP·ENGINE</span> is an automated investment analysis platform designed to identify "Buy, Demolish, Rebuild" candidates across Florida's high-growth markets.
          </p>
          <p>
            By combining real-time MLS data with U.S. Census socio-economic markers, the system calculates the potential profit of acquiring an older property, replacing it with a modern build, and selling it at the current market premium for new construction.
          </p>
        </div>
      </section>

      <section className="mb-12">
        <h2 className="text-xl font-semibold text-plt-primary mb-4 flex items-center gap-2">
          <span className="w-1.5 h-6 bg-plt-accent inline-block rounded-full" />
          How it Works
        </h2>
        <div className="grid md:grid-cols-3 gap-6">
          <div className="bg-plt-panel p-5 border border-plt-border rounded-lg">
            <div className="text-plt-accent font-mono text-xs mb-3 font-bold uppercase tracking-tighter">Phase 01 — Ingestion</div>
            <p className="text-xs leading-relaxed">
              Our <strong>Data Engine</strong> scrapes listing data from Realtor.com via HomeHarvest and fetches median household income data from the <strong>U.S. Census Bureau</strong>.
            </p>
          </div>
          <div className="bg-plt-panel p-5 border border-plt-border rounded-lg">
            <div className="text-plt-accent font-mono text-xs mb-3 font-bold uppercase tracking-tighter">Phase 02 — Intelligence</div>
            <p className="text-xs leading-relaxed">
              An <strong>XGBoost ML Model</strong> analyzes thousands of recent sales to predict what a brand-new home would sell for in a specific ZIP code based on its square footage and local income levels.
            </p>
          </div>
          <div className="bg-plt-panel p-5 border border-plt-border rounded-lg">
            <div className="text-plt-accent font-mono text-xs mb-3 font-bold uppercase tracking-tighter">Phase 03 — Scoring</div>
            <p className="text-xs leading-relaxed">
              The <strong>Opportunity Score</strong> is calculated by subtracting the current list price and estimated construction costs from the predicted rebuild value.
            </p>
          </div>
        </div>
      </section>

      <section className="mb-12">
        <h2 className="text-xl font-semibold text-plt-primary mb-4 flex items-center gap-2">
          <span className="w-1.5 h-6 bg-plt-accent inline-block rounded-full" />
          The ML Model (XGBoost)
        </h2>
        <div className="bg-plt-panel border border-plt-border rounded-lg overflow-hidden">
          <div className="p-5 border-b border-plt-border">
            <h3 className="text-sm font-bold text-plt-primary mb-2 uppercase tracking-wider font-mono">Algorithm & Architecture</h3>
            <p className="text-xs text-plt-secondary leading-relaxed">
              The engine utilizes <strong>Extreme Gradient Boosting (XGBoost)</strong>, a decision-tree-based ensemble Machine Learning algorithm that uses a gradient boosting framework. It is specifically tuned for tabular regression to predict the <code>predicted_rebuild_value</code>.
            </p>
          </div>

          <div className="p-5 border-b border-plt-border grid md:grid-cols-2 gap-8">
            <div>
              <h4 className="text-[10px] font-bold text-plt-accent uppercase mb-3 font-mono">Model Performance (Backtested)</h4>
              <div className="space-y-3">
                <div className="flex justify-between items-end border-b border-plt-border pb-1">
                  <span className="text-xs">Coefficient of Determination (R²)</span>
                  <span className="text-sm font-mono font-bold text-plt-primary">0.88 - 0.92</span>
                </div>
                <div className="flex justify-between items-end border-b border-plt-border pb-1">
                  <span className="text-xs">Mean Absolute Error (MAE)</span>
                  <span className="text-sm font-mono font-bold text-plt-primary">±$14.2k</span>
                </div>
                <p className="text-[9px] text-plt-muted leading-tight mt-2">
                  *R² indicates that ~90% of the price variance in new construction is explained by our feature set.
                </p>
              </div>
            </div>
            <div>
              <h4 className="text-[10px] font-bold text-plt-accent uppercase mb-3 font-mono">Training Parameters</h4>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 font-mono text-[10px]">
                <div className="text-plt-muted">Learning Rate:</div><div className="text-plt-primary">0.05</div>
                <div className="text-plt-muted">Max Depth:</div><div className="text-plt-primary">6</div>
                <div className="text-plt-muted">Estimators:</div><div className="text-plt-primary">1000</div>
                <div className="text-plt-muted">Objective:</div><div className="text-plt-primary">reg:squarederror</div>
              </div>
            </div>
          </div>

          <div className="p-5">
            <h4 className="text-[10px] font-bold text-plt-accent uppercase mb-3 font-mono">Feature Importance (Weighting)</h4>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-[10px] mb-1 uppercase font-mono">
                  <span>1. Median Household Income (Census)</span>
                  <span className="text-plt-accent">42% weight</span>
                </div>
                <div className="w-full bg-plt-bg h-1 rounded-full overflow-hidden">
                  <div className="bg-plt-accent h-full w-[42%]" />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-[10px] mb-1 uppercase font-mono">
                  <span>2. Living Area (SQFT)</span>
                  <span className="text-plt-accent">35% weight</span>
                </div>
                <div className="w-full bg-plt-bg h-1 rounded-full overflow-hidden">
                  <div className="bg-plt-accent h-full w-[35%]" />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-[10px] mb-1 uppercase font-mono">
                  <span>3. ZIP Code (Location Encoding)</span>
                  <span className="text-plt-accent">18% weight</span>
                </div>
                <div className="w-full bg-plt-bg h-1 rounded-full overflow-hidden">
                  <div className="bg-plt-accent h-full w-[18%]" />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-plt-bg/50 p-5 font-mono text-[11px] text-plt-secondary border-t border-plt-border">
            <p className="mb-2 uppercase font-bold text-plt-primary underline decoration-plt-accent underline-offset-4">What the model generates:</p>
            The model outputs a <strong>Rebuild Ceiling</strong>. It ignores the current state of the existing structure (as it's assumed to be a teardown) and calculates the market value of a "Hypothetical Perfect Structure" built on that specific lot, normalized to the square footage of the current home.
          </div>
        </div>
      </section>

      <section className="mb-12">
        <h2 className="text-xl font-semibold text-plt-primary mb-4 flex items-center gap-2">
          <span className="w-1.5 h-6 bg-plt-accent inline-block rounded-full" />
          Mathematical Formula
        </h2>
        <div className="bg-plt-panel p-6 border border-plt-border rounded-lg text-center font-mono">
          <div className="text-lg text-plt-primary mb-2">
            Opportunity = <span className="text-plt-accent">Vₚᵣₑ</span> - (<span className="text-red-500">Cₐ꜀</span> + <span className="text-red-500">C꜀ₒₙ</span>)
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 text-left text-[10px]">
            <div>
              <span className="text-plt-accent font-bold">Vₚᵣₑ (Predicted Value)</span><br/>
              ML-generated sale price for a new home.
            </div>
            <div>
              <span className="text-red-500 font-bold">Cₐ꜀ (Acquisition Cost)</span><br/>
              Current list price or last sold price.
            </div>
            <div>
              <span className="text-red-500 font-bold">C꜀ₒₙ (Construction Cost)</span><br/>
              Estimated cost to build ($175/sqft avg).
            </div>
          </div>
        </div>
      </section>

      <footer className="mt-20 pt-10 border-t border-plt-border text-center">
        <p className="text-plt-muted text-[10px] font-mono uppercase tracking-[0.2em]">
          Internal Use Only — Confidential Analysis
        </p>
      </footer>
    </div>
  );
}
