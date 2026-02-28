import { useState, useEffect, useCallback } from "react";

const API_BASE = "";

const MARKETS = [
  { value: "tampa", label: "Tampa", zips: ["33606", "33629", "33611"] },
  { value: "orlando", label: "Orlando", zips: ["32803", "32806"] },
  { value: "winter_garden", label: "Winter Garden", zips: ["34787"] },
  { value: "winter_park", label: "Winter Park", zips: ["32789", "32792"] },
];
const ALL_ZIPS = MARKETS.flatMap((m) => m.zips);

// ── Staleness helpers ────────────────────────────────────────────────
function stalenessColor(dateStr) {
  if (!dateStr) return "text-gray-500";
  const days = (Date.now() - new Date(dateStr)) / 86400000;
  if (days < 7) return "text-green-400";
  if (days < 30) return "text-yellow-400";
  return "text-red-400";
}

function stalenessLabel(dateStr) {
  if (!dateStr) return "Never";
  const days = Math.floor((Date.now() - new Date(dateStr)) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  return new Date(dateStr).toLocaleDateString();
}

function Badge({ children, color = "gray" }) {
  const colors = {
    green: "bg-green-900/60 text-green-300 border-green-700",
    yellow: "bg-yellow-900/60 text-yellow-300 border-yellow-700",
    red: "bg-red-900/60 text-red-300 border-red-700",
    blue: "bg-blue-900/60 text-blue-300 border-blue-700",
    gray: "bg-gray-700 text-gray-300 border-gray-600",
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded border ${colors[color]}`}>
      {children}
    </span>
  );
}

function Card({ title, children, action }) {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-white">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

// ── Section A: Pipeline Status ────────────────────────────────────────
function PipelineStatus({ status, mlStatus, onRefresh, loading }) {
  const soldRows = status.filter((r) => r.listing_type === "sold");
  const forSaleRows = status.filter((r) => r.listing_type === "for_sale");

  const soldTotal = soldRows.reduce((s, r) => s + parseInt(r.property_count), 0);
  const forSaleTotal = forSaleRows.reduce((s, r) => s + parseInt(r.property_count), 0);
  const soldLastScrape = soldRows.reduce((latest, r) =>
    !latest || r.last_scraped > latest ? r.last_scraped : latest, null);
  const forSaleLastScrape = forSaleRows.reduce((latest, r) =>
    !latest || r.last_scraped > latest ? r.last_scraped : latest, null);

  const unscored = mlStatus?.counts?.for_sale?.unscored ?? null;
  const trainRun = mlStatus?.train;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Sold History */}
      <Card
        title="Sold History"
        action={
          <Badge color={soldTotal > 0 ? "green" : "gray"}>
            {soldTotal > 0 ? `${soldTotal.toLocaleString()} records` : "Empty"}
          </Badge>
        }
      >
        <p className="text-xs text-gray-400 mb-3">Training data for the ML model</p>
        {soldTotal === 0 ? (
          <p className="text-sm text-gray-500 italic">No sold data yet — run sold scrape</p>
        ) : (
          <div className="space-y-1">
            {MARKETS.map((m) => {
              const mRows = soldRows.filter((r) => m.zips.includes(r.zip));
              const count = mRows.reduce((s, r) => s + parseInt(r.property_count), 0);
              if (count === 0) return null;
              return (
                <div key={m.value} className="flex justify-between text-sm">
                  <span className="text-gray-400">{m.label}</span>
                  <span className="text-white font-mono">{count.toLocaleString()}</span>
                </div>
              );
            })}
          </div>
        )}
        <div className={`mt-3 text-xs ${stalenessColor(soldLastScrape)}`}>
          Last scraped: {stalenessLabel(soldLastScrape)}
        </div>
      </Card>

      {/* Active Listings */}
      <Card
        title="Active Listings"
        action={
          <Badge color={forSaleTotal > 0 ? "blue" : "gray"}>
            {forSaleTotal > 0 ? `${forSaleTotal.toLocaleString()} listings` : "Empty"}
          </Badge>
        }
      >
        <p className="text-xs text-gray-400 mb-3">Current for-sale properties to score</p>
        {forSaleTotal === 0 ? (
          <p className="text-sm text-gray-500 italic">No listings yet — run for_sale scrape</p>
        ) : (
          <div className="space-y-1">
            {MARKETS.map((m) => {
              const mRows = forSaleRows.filter((r) => m.zips.includes(r.zip));
              const count = mRows.reduce((s, r) => s + parseInt(r.property_count), 0);
              if (count === 0) return null;
              return (
                <div key={m.value} className="flex justify-between text-sm">
                  <span className="text-gray-400">{m.label}</span>
                  <span className="text-white font-mono">{count.toLocaleString()}</span>
                </div>
              );
            })}
          </div>
        )}
        <div className={`mt-3 text-xs ${stalenessColor(forSaleLastScrape)}`}>
          Last scraped: {stalenessLabel(forSaleLastScrape)}
        </div>
      </Card>

      {/* ML Status */}
      <Card title="ML Model">
        <p className="text-xs text-gray-400 mb-3">XGBoost trained on sold new-builds</p>
        {trainRun ? (
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Status</span>
              <Badge color={trainRun.status === "completed" ? "green" : trainRun.status === "running" ? "yellow" : "red"}>
                {trainRun.status}
              </Badge>
            </div>
            {trainRun.r2_score && (
              <div className="flex justify-between">
                <span className="text-gray-400">R² Score</span>
                <span className="text-white font-mono">{parseFloat(trainRun.r2_score).toFixed(4)}</span>
              </div>
            )}
            {trainRun.properties_trained && (
              <div className="flex justify-between">
                <span className="text-gray-400">Trained on</span>
                <span className="text-white">{parseInt(trainRun.properties_trained).toLocaleString()} records</span>
              </div>
            )}
            {unscored !== null && (
              <div className="flex justify-between">
                <span className="text-gray-400">Unscored listings</span>
                <span className={unscored > 0 ? "text-yellow-400" : "text-green-400"}>
                  {unscored}
                </span>
              </div>
            )}
            <div className={`text-xs mt-1 ${stalenessColor(trainRun.completed_at)}`}>
              Trained: {stalenessLabel(trainRun.completed_at)}
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500 italic">Not trained yet</p>
        )}
      </Card>
    </div>
  );
}

// ── Section B: Scrape Actions ─────────────────────────────────────────
function ScrapeActions({ onDone }) {
  const [activeTab, setActiveTab] = useState("for_sale");
  const [market, setMarket] = useState("tampa");
  const [start, setStart] = useState("2022-01");
  const [end, setEnd] = useState("2024-12");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const cmdPreview =
    activeTab === "for_sale"
      ? `python scraper.py --market ${market} --type for_sale`
      : `python scraper.py --market ${market} --type sold --start ${start} --end ${end}`;

  const trigger = async () => {
    setLoading(true);
    setResult(null);
    try {
      const body =
        activeTab === "for_sale"
          ? { type: "for_sale", market }
          : { type: "sold", market, start, end };

      const res = await fetch(`${API_BASE}/api/scrape/trigger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setResult({ ok: res.ok, data });
      if (res.ok) onDone?.();
    } catch (err) {
      setResult({ ok: false, data: { error: err.message } });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card title="Scrape Data">
      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-gray-900 rounded-lg p-1 w-fit">
        {[
          { id: "for_sale", label: "Active Listings" },
          { id: "sold", label: "Sold History" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); setResult(null); }}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? "bg-blue-600 text-white"
                : "text-gray-400 hover:text-white"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-4 items-end mb-4">
        {/* Market */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400">Market</label>
          <select
            value={market}
            onChange={(e) => setMarket(e.target.value)}
            className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white min-w-[160px]"
          >
            <option value="all">All Markets</option>
            {MARKETS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>

        {/* Date range — only for sold */}
        {activeTab === "sold" && (
          <>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-400">Start</label>
              <input
                type="month"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-400">End</label>
              <input
                type="month"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white"
              />
            </div>
          </>
        )}

        <button
          onClick={trigger}
          disabled={loading}
          className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {loading ? "Triggering…" : activeTab === "for_sale" ? "Refresh Listings" : "Start Scrape"}
        </button>
      </div>

      {/* Command preview */}
      <div className="bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 mb-3">
        <span className="text-xs text-gray-500 mr-2">CMD</span>
        <code className="text-xs text-green-400 font-mono">{cmdPreview}</code>
      </div>

      {activeTab === "for_sale" && (
        <p className="text-xs text-gray-500">
          Fetches all currently active single-family listings from Realtor.com. These become the scoring targets — the map will show them with opportunity scores after running the ML model.
        </p>
      )}
      {activeTab === "sold" && (
        <p className="text-xs text-gray-500">
          Fetches historical sold listings for training the XGBoost model. Monthly chunks avoid Realtor.com's 200-result cap. Rate-limited at 2–5s between requests.
        </p>
      )}

      {result && (
        <div className={`mt-4 rounded-lg px-4 py-3 text-xs font-mono ${
          result.ok ? "bg-green-900/30 text-green-300 border border-green-800" : "bg-red-900/30 text-red-300 border border-red-800"
        }`}>
          {JSON.stringify(result.data, null, 2)}
        </div>
      )}
    </Card>
  );
}

// ── Section C: ML Pipeline ────────────────────────────────────────────
function MLPipeline({ mlStatus, onRefresh }) {
  const trainRun = mlStatus?.train;
  const scoreRun = mlStatus?.score;
  const forSaleCount = mlStatus?.counts?.for_sale?.total ?? 0;
  const unscored = mlStatus?.counts?.for_sale?.unscored ?? 0;

  const trainCmd = "docker compose run --rm data-worker python ml_model.py --train";
  const scoreCmd = "docker compose run --rm data-worker python ml_model.py --score";

  return (
    <Card title="ML Pipeline">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Train */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-400" />
            <span className="text-sm font-medium text-white">Step 1 — Train Model</span>
          </div>
          <p className="text-xs text-gray-400">
            Trains XGBoost on sold new-builds (year_built &gt; 2015). The model learns what a newly-built home sells for in each ZIP, based on sqft, lot size, and neighborhood income.
          </p>

          {trainRun && (
            <div className="bg-gray-900 rounded-lg p-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Status</span>
                <Badge color={trainRun.status === "completed" ? "green" : "red"}>{trainRun.status}</Badge>
              </div>
              {trainRun.r2_score && (
                <div className="flex justify-between">
                  <span className="text-gray-400">R² score</span>
                  <span className="text-white font-mono">{parseFloat(trainRun.r2_score).toFixed(4)}</span>
                </div>
              )}
              {trainRun.properties_trained && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Training rows</span>
                  <span className="text-white">{parseInt(trainRun.properties_trained).toLocaleString()}</span>
                </div>
              )}
              <div className={`text-xs ${stalenessColor(trainRun.completed_at)}`}>
                {stalenessLabel(trainRun.completed_at)}
              </div>
            </div>
          )}

          <div className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2">
            <code className="text-xs text-green-400 font-mono break-all">{trainCmd}</code>
          </div>
        </div>

        {/* Score */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-purple-400" />
            <span className="text-sm font-medium text-white">Step 2 — Score Listings</span>
          </div>
          <p className="text-xs text-gray-400">
            Applies the trained model to active for-sale listings. Computes opportunity_result = predicted_rebuild_value − list_price − construction_cost. Results appear on the map.
          </p>

          {forSaleCount > 0 && (
            <div className="bg-gray-900 rounded-lg p-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">For-sale listings</span>
                <span className="text-white">{forSaleCount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Unscored</span>
                <span className={unscored > 0 ? "text-yellow-400" : "text-green-400"}>{unscored}</span>
              </div>
              {scoreRun?.completed_at && (
                <div className={`text-xs ${stalenessColor(scoreRun.completed_at)}`}>
                  Last scored: {stalenessLabel(scoreRun.completed_at)}
                </div>
              )}
            </div>
          )}

          <div className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2">
            <code className="text-xs text-green-400 font-mono break-all">{scoreCmd}</code>
          </div>
        </div>
      </div>
    </Card>
  );
}

// ── Section D: Export ─────────────────────────────────────────────────
function ExportPanel({ totalCount }) {
  const [market, setMarket] = useState("");
  const [minRoi, setMinRoi] = useState(0);
  const [maxYearBuilt, setMaxYearBuilt] = useState("");

  const buildUrl = () => {
    const params = new URLSearchParams();
    if (market) {
      // Market → pick first ZIP as representative filter (server-side doesn't support market name yet)
      const m = MARKETS.find((m) => m.value === market);
      if (m) params.set("zip", m.zips[0]); // TODO: extend API to support market param
    }
    if (minRoi > 0) params.set("min_roi", minRoi);
    if (maxYearBuilt) params.set("max_year_built", maxYearBuilt);
    return `${API_BASE}/api/export/csv${params.toString() ? "?" + params.toString() : ""}`;
  };

  return (
    <Card title="Export Opportunities">
      <div className="flex flex-wrap gap-4 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400">Market</label>
          <select
            value={market}
            onChange={(e) => setMarket(e.target.value)}
            className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white min-w-[160px]"
          >
            <option value="">All Markets</option>
            {MARKETS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1 min-w-[200px]">
          <label className="text-xs text-gray-400">
            Min ROI: <span className="text-white font-mono">${minRoi.toLocaleString()}</span>
          </label>
          <input
            type="range"
            min={0}
            max={500000}
            step={10000}
            value={minRoi}
            onChange={(e) => setMinRoi(Number(e.target.value))}
            className="accent-blue-500"
          />
          <div className="flex justify-between text-xs text-gray-500">
            <span>$0</span><span>$250k</span><span>$500k</span>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400">Built Before</label>
          <input
            type="number"
            value={maxYearBuilt}
            onChange={(e) => setMaxYearBuilt(e.target.value)}
            placeholder="e.g. 1990"
            className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white w-28"
          />
        </div>

        <a
          href={buildUrl()}
          download
          className="px-5 py-2 bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg transition-colors inline-flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Download CSV
        </a>
      </div>
    </Card>
  );
}

// ── Root Component ────────────────────────────────────────────────────
export default function DataCenterPanel() {
  const [status, setStatus] = useState([]);
  const [mlStatus, setMlStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [scrapeRes, mlRes] = await Promise.all([
        fetch(`${API_BASE}/api/scrape/status`).then((r) => r.json()),
        fetch(`${API_BASE}/api/ml/status`).then((r) => r.json()),
      ]);
      setStatus(scrapeRes.scrape_status || []);
      setMlStatus(mlRes);
    } catch (err) {
      console.error("Failed to fetch status:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const refreshBtn = (
    <button
      onClick={fetchAll}
      disabled={loading}
      className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50 flex items-center gap-1"
    >
      <svg className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
      {loading ? "Refreshing…" : "Refresh"}
    </button>
  );

  return (
    <div className="space-y-5">
      {/* Header with refresh */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Pipeline Overview</h2>
        </div>
        {refreshBtn}
      </div>

      {/* A — Status cards */}
      <PipelineStatus status={status} mlStatus={mlStatus} loading={loading} />

      {/* B — Scrape actions */}
      <ScrapeActions onDone={fetchAll} />

      {/* C — ML pipeline */}
      <MLPipeline mlStatus={mlStatus} onRefresh={fetchAll} />

      {/* D — Export */}
      <ExportPanel />
    </div>
  );
}
