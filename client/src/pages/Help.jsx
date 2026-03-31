import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function Help() {
  return (
    <div className="flex-1 overflow-y-auto bg-plt-bg custom-scrollbar">
      <div className="max-w-3xl mx-auto px-6 py-10">

        <header className="mb-10 border-b border-plt-border pb-6">
          <h1 className="text-2xl font-bold text-plt-primary mb-1 tracking-tight">RE Opportunity</h1>
          <p className="text-plt-muted text-xs uppercase tracking-widest font-semibold">How it works</p>
        </header>

        <section className="mb-10">
          <SectionTitle>What is this?</SectionTitle>
          <p className="text-sm text-plt-secondary leading-relaxed">
            This tool finds "Buy, Demolish, Rebuild" opportunities across Florida. It scrapes MLS listings, pulls Census income data, and runs an ML model to estimate what a brand-new home on each lot would sell for today. Properties where that predicted value beats the acquisition and construction costs show up as green on the map.
          </p>
        </section>

        <section className="mb-10">
          <SectionTitle>Pipeline</SectionTitle>
          <div className="grid md:grid-cols-3 gap-3">
            <PhaseCard num="01" title="Ingestion">
              Scrapes Realtor.com via HomeHarvest, captures beds, baths, sqft, lot size, and coordinates. Cleans the data and fetches median household income from the U.S. Census Bureau per ZIP code. Optionally enriches with FL DOE school quality ratings per ZIP.
            </PhaseCard>
            <PhaseCard num="02" title="Modeling">
              Trains an ML model on recent nearby sales (10 features including geospatial new-build comps, beds/baths, month sold, and city) to predict the price a new build would fetch on the same lot. Uses a forward-looking temporal split to prevent data leakage.
            </PhaseCard>
            <PhaseCard num="03" title="Scoring">
              Computes a realistic total development cost (acquisition + hard build + soft costs + contingency + carrying) and subtracts it from the predicted rebuild value. XGBoost also produces confidence intervals (10th–90th percentile). Results are stored in Postgres and surfaced on the map.
            </PhaseCard>
          </div>
        </section>

        <section className="mb-10">
          <SectionTitle>Formula</SectionTitle>
          <Card>
            <CardContent className="p-6">
              <div className="text-center mb-6">
                <div className="text-base font-black tracking-tight text-plt-primary mb-1">
                  Opportunity = <span className="text-plt-accent">Predicted Value</span> − <span className="text-plt-danger">Total Dev Cost</span>
                </div>
                <div className="text-[11px] text-plt-muted">
                  Total Dev Cost = list price × 1.08 + (sqft × $175) × 1.36
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-4 text-left text-xs mb-4">
                <div className="p-3 bg-plt-bg rounded border border-plt-border">
                  <span className="text-plt-accent font-bold uppercase tracking-wider block mb-1">Predicted Value</span>
                  <span className="text-plt-secondary">What the ML model says a new build on that lot would sell for today, based on 10 features including nearby new-build comps, beds/baths, income, and city.</span>
                </div>
                <div className="p-3 bg-plt-bg rounded border border-plt-border">
                  <span className="text-plt-danger font-bold uppercase tracking-wider block mb-1">Total Dev Cost</span>
                  <span className="text-plt-secondary">Acquisition with carrying costs (×1.08) plus hard construction with soft costs, contingency, and financing (×1.36). More conservative than a simple sum.</span>
                </div>
              </div>
              <div className="grid md:grid-cols-3 gap-3 text-xs">
                <div className="p-3 bg-plt-bg rounded border border-plt-border">
                  <span className="text-plt-muted font-bold uppercase tracking-wider block mb-1 text-[10px]">× 1.08 on Acquisition</span>
                  <span className="text-plt-secondary">Closing costs, title, legal, and short-term carrying.</span>
                </div>
                <div className="p-3 bg-plt-bg rounded border border-plt-border">
                  <span className="text-plt-muted font-bold uppercase tracking-wider block mb-1 text-[10px]">× 1.36 on Hard Build</span>
                  <span className="text-plt-secondary">+18% soft (design, permits, insurance) +10% contingency +8% construction financing.</span>
                </div>
                <div className="p-3 bg-plt-bg rounded border border-plt-border">
                  <span className="text-plt-muted font-bold uppercase tracking-wider block mb-1 text-[10px]">Confidence Range</span>
                  <span className="text-plt-secondary">XGBoost also trains q10/q90 quantile models. The map popup and detail panel show the 10th–90th percentile range for each property.</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="mb-10">
          <SectionTitle>Algorithm Selection</SectionTitle>
          <p className="text-sm text-plt-secondary leading-relaxed mb-5">
            Pick a training algorithm in the Data Engine before each run. The trained model list shows the R² score for each so you can compare.
          </p>
          <div className="grid md:grid-cols-2 gap-3">
            <AlgoCard title="XGBoost" badge="Default" accent>
              Sequential boosted trees. Best all-around choice here. Handles non-linear relationships, missing values, and feature interactions without much preprocessing.
            </AlgoCard>
            <AlgoCard title="Random Forest" badge="Robust">
              Independent parallel trees. More stable when sold history is limited. Good baseline when data is noisy.
            </AlgoCard>
            <AlgoCard title="Ridge Regression" badge="Baseline">
              Linear model with L2 regularization. Fastest to train and fully interpretable. Use it as a sanity check against the tree models.
            </AlgoCard>
            <AlgoCard title="LightGBM" badge="Fast">
              Leaf-wise gradient boosting. Faster than XGBoost on large datasets. Best when you're retraining frequently.
            </AlgoCard>
          </div>
        </section>

        <section className="mb-10">
          <SectionTitle>Map Features</SectionTitle>
          <div className="grid md:grid-cols-2 gap-3">
            <Card>
              <CardContent className="p-4">
                <h4 className="text-[10px] font-bold text-plt-accent uppercase tracking-widest mb-2">Market Context</h4>
                <p className="text-xs text-plt-secondary leading-relaxed">
                  Shows active listings built in the last 5 years as blue dots. Useful for seeing what new construction is asking in the same neighborhood.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <h4 className="text-[10px] font-bold text-plt-accent uppercase tracking-widest mb-2">Comparable Sales</h4>
                <p className="text-xs text-plt-secondary leading-relaxed">
                  Selecting a property pulls recent sales within 0.5 miles, prioritizing new builds. Clicking a comp pans the map and opens a popup with the valuation breakdown.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        <footer className="mt-10 pt-6 border-t border-plt-border text-center pb-6">
          <p className="text-plt-muted text-[10px] uppercase tracking-widest font-semibold">
            Internal use only
          </p>
        </footer>

      </div>
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <h2 className="text-base font-bold text-plt-primary mb-4 flex items-center gap-2">
      <span className="w-1.5 h-5 bg-plt-accent inline-block rounded-full flex-shrink-0" />
      {children}
    </h2>
  );
}

function PhaseCard({ num, title, children }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-plt-accent font-bold text-xs uppercase tracking-tighter mb-2">Phase {num} - {title}</div>
        <p className="text-xs leading-relaxed text-plt-secondary">{children}</p>
      </CardContent>
    </Card>
  );
}

function AlgoCard({ title, badge, accent, children }) {
  return (
    <div className={`p-4 rounded-xl border ${accent ? "border-plt-accent/30 bg-plt-accent/[0.03]" : "border-plt-border bg-white"}`}>
      <div className="flex items-center justify-between mb-2">
        <span className={`text-[10px] font-black uppercase tracking-widest ${accent ? "text-plt-accent" : "text-plt-primary"}`}>{title}</span>
        <Badge variant={accent ? "default" : "outline"} className="text-[9px] tracking-wider">{badge}</Badge>
      </div>
      <p className="text-xs text-plt-secondary leading-relaxed">{children}</p>
    </div>
  );
}
