import React, { useState, useEffect, useCallback, useRef } from "react";
import { useAuth, useUser } from "@clerk/react";
import { Label, Val, StatusDot, Btn, StatusBadge } from "../components/UI.jsx";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, Cell, CartesianGrid } from "recharts";

const API = "";

async function delayMinimum(startTime, ms = 600) {
  const elapsed = Date.now() - startTime;
  if (elapsed < ms) await new Promise(r => setTimeout(r, ms - elapsed));
}

// Helper for authenticated requests
const useAuthenticatedFetch = () => {
  const { getToken, isSignedIn } = useAuth();
  
  return async (url, options = {}) => {
    if (!isSignedIn) {
      alert("⚠️ Authentication Required: Please Sign In to perform this action.");
      return { ok: false, status: 401 };
    }

    const token = await getToken();
    const headers = {
      ...options.headers,
      Authorization: `Bearer ${token}`,
    };
    
    try {
      const res = await fetch(url, { ...options, headers });
      if (res.status === 403) {
        alert("🚫 Access Denied: This operation requires Admin privileges.");
      } else if (res.status === 401) {
        alert("⚠️ Session Expired: Please Sign In again.");
      }
      return res;
    } catch (e) {
      alert("🚨 Network Error: Failed to reach the server.");
      return { ok: false, status: 500 };
    }
  };
};

const MARKETS = [
  { value: "tampa",        label: "Tampa" },
  { value: "orlando",      label: "Orlando" },
  { value: "winter_garden",label: "Winter Garden" },
  { value: "winter_park",  label: "Winter Park" },
];

// ── Components ───────────────────────────────────────────────────────

// ── Ops History (persistent DB log) ──────────────────────────────────

const OP_TYPE_LABEL = {
  train:         "TRAIN",
  score:         "SCORE",
  score_weighted:"WEIGHTED",
  scrape:        "SCRAPE",
  census:        "CENSUS",
};

const OP_TYPE_COLOR = {
  train:         "bg-blue-100 text-blue-700 border-blue-200",
  score:         "bg-plt-success/10 text-plt-success border-plt-success/20",
  score_weighted:"bg-purple-100 text-purple-700 border-purple-200",
  scrape:        "bg-amber-100 text-amber-700 border-amber-200",
  census:        "bg-slate-100 text-slate-600 border-slate-200",
};

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function OpsHistory() {
  const [ops, setOps] = useState([]);
  useEffect(() => {
    const load = () =>
      fetch(`${API}/api/ml/ops-log`)
        .then(r => r.json())
        .then(d => Array.isArray(d) && setOps(d))
        .catch(() => {});
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, []);

  if (ops.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center py-20 opacity-50">
        <span className="text-slate-400 text-xs font-medium">No completed operations yet</span>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar px-5 py-4 bg-slate-50 space-y-2">
      {ops.map((op, i) => {
        const typeLabel = OP_TYPE_LABEL[op.type] || op.type?.toUpperCase();
        const typeColor = OP_TYPE_COLOR[op.type] || OP_TYPE_COLOR.census;
        const isFailed  = op.status === "failed";
        const isRunning = op.status === "running";

        let detail = "";
        if (op.type === "train") {
          const alg = op.algorithm ? op.algorithm.replace(/_/g, " ").toUpperCase() : "";
          const r2  = op.r2_score ? `R²=${parseFloat(op.r2_score).toFixed(4)}` : "";
          const n   = op.properties_trained ? `${op.properties_trained} records` : "";
          detail = [alg, r2, n].filter(Boolean).join(" · ");
        } else if (op.type === "score" || op.type === "score_weighted") {
          detail = op.properties_scored ? `${op.properties_scored} properties scored` : "";
        } else if (op.type === "scrape") {
          const monthStr = op.month && op.year ? `${op.month}/${op.year}` : "";
          detail = [op.market, monthStr, op.scrape_type].filter(Boolean).join(" · ");
        }

        const dotColor = isFailed ? "bg-plt-danger" : isRunning ? "bg-blue-400 animate-pulse" : "bg-plt-success";

        return (
          <div
            key={`${op.type}-${op.id}-${i}`}
            className="flex items-center gap-3 bg-white border border-plt-border rounded-lg px-3.5 py-2.5 shadow-sm hover:border-plt-accent/30 transition-colors"
          >
            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotColor}`} />
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border flex-shrink-0 ${typeColor}`}>
              {typeLabel}
            </span>
            <span className="flex-1 text-[11px] text-plt-secondary truncate min-w-0">
              {detail || op.name || "—"}
            </span>
            {isFailed && op.error_message && (
              <span className="text-[10px] text-plt-danger truncate max-w-[120px]">{op.error_message}</span>
            )}
            <span className="text-[9px] text-plt-muted flex-shrink-0 font-mono">{fmtDate(op.started_at)}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Job Console ────────────────────────────────────────────────────────

function JobConsole({ selectedId, setSelectedId, jobs = [], onClear }) {
  const [selectedJob, setSelectedJob] = useState(null);
  const [stopping, setStopping] = useState({});
  const scrollRef = useRef(null);
  const authFetch = useAuthenticatedFetch();

  useEffect(() => {
    if (!selectedId) { setSelectedJob(null); return; }
    const poll = async () => {
      try {
        const data = await fetch(`${API}/api/jobs/${selectedId}`).then(r => r.json());
        setSelectedJob(data);
      } catch {}
    };
    poll();
    const id = setInterval(poll, 1500);
    return () => clearInterval(id);
  }, [selectedId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [selectedJob?.logs?.length]);

  const stopJob = async (e, jobId) => {
    e.stopPropagation();
    if (!window.confirm("Terminate this process?")) return;
    setStopping(p => ({ ...p, [jobId]: true }));
    try { await authFetch(`${API}/api/jobs/${jobId}/stop`, { method: "POST" }); } catch {}
    setStopping(p => ({ ...p, [jobId]: false }));
  };

  const handleClear = () => { setSelectedId(null); setSelectedJob(null); onClear?.(); };

  const statusLabel = selectedJob?.status
    ? selectedJob.status.charAt(0).toUpperCase() + selectedJob.status.slice(1)
    : "Ready";

  return (
    <div className="flex flex-col flex-1 bg-white border border-plt-border overflow-hidden relative shadow-sm rounded-xl font-sans">
      <Tabs defaultValue="live" className="flex flex-col flex-1 min-h-0">
        {/* Console Header */}
        <div className="flex items-center justify-between px-3 sm:px-5 py-3 border-b border-plt-border bg-white flex-shrink-0">
          <div className="flex items-center gap-3">
            <StatusDot status={selectedJob?.status || "idle"} />
            <div className="flex flex-col">
              <span className="text-[9px] font-bold uppercase tracking-widest text-plt-muted">Telemetry</span>
              <span className="text-sm font-bold text-plt-primary">
                {statusLabel}
                {selectedId && (
                  <span className="text-plt-muted font-normal text-xs ml-2">
                    #{selectedId.toString().substring(0, 8)}
                  </span>
                )}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <TabsList className="bg-plt-bg border border-plt-border h-7">
              <TabsTrigger value="live" className="text-[9px] font-bold uppercase tracking-widest px-2.5 py-1">
                Live
              </TabsTrigger>
              <TabsTrigger value="history" className="text-[9px] font-bold uppercase tracking-widest px-2.5 py-1">
                History
              </TabsTrigger>
            </TabsList>
            {selectedJob?.status === "running" && (
              <button
                onClick={(e) => stopJob(e, selectedId)}
                disabled={stopping[selectedId]}
                className="bg-plt-danger/10 hover:bg-plt-danger text-plt-danger hover:text-white border border-plt-danger/30 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-[0.98] disabled:opacity-50"
              >
                {stopping[selectedId] ? "Stopping..." : "Stop Job"}
              </button>
            )}
            {selectedId && (
              <button
                onClick={handleClear}
                className="bg-plt-bg hover:bg-plt-hover text-plt-muted hover:text-plt-primary px-3 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-[0.98] border border-plt-border"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Live tab */}
        <TabsContent value="live" className="data-[state=active]:flex-1 data-[state=inactive]:hidden flex flex-col overflow-hidden mt-0">
          {/* Execution History Bar */}
          <div className="px-5 py-3 border-b border-plt-border bg-plt-bg/50 flex-shrink-0 min-w-0">
            <div className="text-[9px] font-bold uppercase tracking-widest text-plt-muted mb-2 flex items-center gap-2">
              <div className="w-1 h-1 bg-plt-accent rounded-full" />
              Execution History
            </div>
            {jobs.length === 0 ? (
              <div className="py-1 text-xs text-plt-muted italic">No tasks recorded yet</div>
            ) : (
              <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar scroll-smooth">
                {jobs.slice(0, 15).map(j => (
                  <StatusBadge
                    key={j.id}
                    job={j}
                    isActive={selectedId == j.id}
                    onClick={() => setSelectedId(j.id)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Log View */}
          <div
            ref={scrollRef}
            className="flex-1 min-h-0 overflow-y-auto relative px-6 py-5 text-[11px] leading-relaxed bg-slate-50 custom-scrollbar selection:bg-plt-accent selection:text-white font-sans"
          >
            {!selectedJob && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center opacity-50">
                <div className="w-10 h-10 mb-4 rounded-full border-2 border-dashed border-slate-300 flex items-center justify-center">
                  <div className="w-2 h-2 bg-plt-accent rounded-full animate-ping" />
                </div>
                <span className="text-slate-400 text-xs font-medium">Waiting for a job to run...</span>
              </div>
            )}
            {selectedJob?.logs?.map((line, i) => {
              const lower = line.toLowerCase();
              let color = "text-slate-600";
              if (line.includes("[FAIL]") || lower.includes("failed") || lower.includes("error"))
                color = "text-red-600 font-bold";
              else if (line.includes("[SKIP]"))
                color = "text-amber-600";
              else if (line.includes("[LOAD]"))
                color = "text-emerald-600 font-bold";
              else if (line.includes("[EXEC]"))
                color = "text-blue-600 font-bold";

              return (
                <div key={i} className={`${color} break-all whitespace-pre-wrap mb-1.5 flex gap-5 group`}>
                  <span className="text-slate-400 opacity-40 select-none w-10 flex-shrink-0 group-hover:opacity-100 transition-opacity text-right">
                    {(i + 1).toString().padStart(4, "0")}
                  </span>
                  <span className="flex-1">{line}</span>
                </div>
              );
            })}
          </div>
        </TabsContent>

        {/* History tab — persistent DB-backed ops log */}
        <TabsContent value="history" className="data-[state=active]:flex-1 data-[state=inactive]:hidden flex flex-col overflow-hidden mt-0">
          <OpsHistory />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ControlCard({ onJob, models, fetchModels }) {
  const authFetch = useAuthenticatedFetch();
  return (
    <div className="flex flex-col flex-1 bg-white border border-plt-border overflow-hidden relative shadow-sm rounded-xl font-sans">
      <Tabs defaultValue="acquisition" className="flex flex-col flex-1 min-h-0">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-plt-border bg-white flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-1.5 h-1.5 bg-plt-accent rounded-full" />
            <span className="text-[9px] font-bold uppercase tracking-widest text-plt-muted">Controls</span>
          </div>
          <TabsList className="bg-plt-bg border border-plt-border h-8">
            <TabsTrigger value="acquisition" className="text-[10px] font-bold uppercase tracking-widest px-3 py-1">
              Data Acquisition
            </TabsTrigger>
            <TabsTrigger value="model" className="text-[10px] font-bold uppercase tracking-widest px-3 py-1">
              Model Engine
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
          <TabsContent value="acquisition" className="mt-0">
            <div className="space-y-5">
              <IngestionControls onJob={onJob} />
              <div className="border border-plt-danger/25 rounded-xl p-5 bg-plt-danger/[0.02] flex flex-col gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-1.5 h-1.5 bg-plt-danger rounded-full animate-pulse" />
                  <span className="text-sm font-semibold text-plt-danger">Hard Reset</span>
                </div>
                <p className="text-xs text-plt-secondary leading-relaxed">
                  Permanently clears all properties, ML models, and job history from the database.
                </p>
                <button
                  onClick={async () => {
                    if (!window.confirm("🚨 DANGER: This will permanently wipe ALL data. Continue?")) return;
                    
                    const res = await authFetch(`${API}/api/scrape/reset`, { method: "POST" });
                    if (res.ok) window.location.reload();
                  }}
                  className="w-full text-sm font-semibold bg-white text-plt-danger border border-plt-danger/30 hover:bg-plt-danger hover:text-white py-2.5 rounded-lg transition-all active:scale-[0.98]"
                >
                  Wipe Database
                </button>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="model" className="mt-0">
            <IntelControls onJob={onJob} models={models} fetchModels={fetchModels} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

function HUD({ mlStatus, scrapeStatus }) {
  const soldTotal = scrapeStatus.filter(r => r.listing_type === 'sold').reduce((s, r) => s + parseInt(r.property_count), 0);
  const forSaleTotal = scrapeStatus.filter(r => r.listing_type === 'for_sale').reduce((s, r) => s + parseInt(r.property_count), 0);
  const unscored = mlStatus?.counts?.for_sale?.unscored ?? 0;
  const r2 = mlStatus?.train?.r2_score;

  const stats = [
    { label: "Sold History",   val: soldTotal.toLocaleString(),            green: soldTotal > 0 },
    { label: "Active Listings",val: forSaleTotal.toLocaleString(),          green: forSaleTotal > 0 },
    { label: "Pending Score",  val: unscored.toLocaleString(),              yellow: unscored > 0 },
    { label: "R² Accuracy",   val: r2 ? parseFloat(r2).toFixed(4) : "—",  green: r2 > 0.8 },
    { label: "System",        val: "Nominal" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 font-sans">
      {stats.map(s => (
        <div key={s.label} className="bg-white border border-plt-border px-4 py-3.5 rounded-xl shadow-sm">
          <div className="text-[9px] font-bold uppercase tracking-widest text-plt-muted mb-1.5">{s.label}</div>
          <Val lg green={s.green} yellow={s.yellow}>{s.val}</Val>
        </div>
      ))}
    </div>
  );
}

// ── Results Chart ─────────────────────────────────────────────────────

const PILL_COLOR = {
  green:  "bg-plt-success/10 text-plt-success border-plt-success/20",
  yellow: "bg-amber-50 text-amber-600 border-amber-200",
  red:    "bg-plt-danger/10 text-plt-danger border-plt-danger/20",
  default:"bg-slate-100 text-slate-600 border-slate-200",
};

const BAR_FILL = {
  "<$0":       "#ef4444",
  "$0–50k":    "#f97316",
  "$50–100k":  "#f59e0b",
  "$100–200k": "#84cc16",
  "$200–500k": "#22c55e",
  ">$500k":    "#10b981",
};

const CHART_CONFIG = { count: { label: "Properties" } };

function Pill({ label, value, color = "default" }) {
  return (
    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[10px] font-semibold ${PILL_COLOR[color]}`}>
      <span className="font-normal opacity-70">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function ResultsChart({ refreshKey }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch(`${API}/api/ml/results`)
      .then(r => r.json())
      .then(setData)
      .catch(() => {});
  }, [refreshKey]);

  if (!data || !data.totals || data.totals.total === 0) {
    return (
      <div className="bg-white border border-plt-border rounded-xl px-5 py-4 shadow-sm flex items-center gap-4">
        <div className="w-1.5 h-1.5 bg-plt-accent rounded-full" />
        <span className="text-[9px] font-bold uppercase tracking-widest text-plt-muted">
          Opportunity Distribution
        </span>
        <span className="text-xs text-plt-muted italic ml-2">
          Run ML Score to see results
        </span>
      </div>
    );
  }

  const avgK = data.avg_opportunity >= 0
    ? `+$${(data.avg_opportunity / 1000).toFixed(0)}k`
    : `-$${(Math.abs(data.avg_opportunity) / 1000).toFixed(0)}k`;

  return (
    <div className="bg-white border border-plt-border rounded-xl px-5 py-4 shadow-sm">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 bg-plt-accent rounded-full" />
          <span className="text-[9px] font-bold uppercase tracking-widest text-plt-muted">
            Opportunity Distribution · {data.totals.total} scored
          </span>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Pill label="High ROI >$200k"  value={data.totals.green}  color="green" />
          <Pill label="Moderate $0–200k" value={data.totals.yellow} color="yellow" />
          <Pill label="Avg"              value={avgK} />
        </div>
      </div>
      <ChartContainer config={CHART_CONFIG} className="h-[220px] w-full">
        <BarChart layout="vertical" data={data.distribution.filter(b => b.label !== "<$0")} margin={{ top: 0, right: 24, left: 4, bottom: 0 }}>
          <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis
            type="number"
            tick={{ fontSize: 9, fill: "#94a3b8" }}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={72}
            tick={{ fontSize: 9, fill: "#64748b" }}
            tickLine={false}
            axisLine={false}
          />
          <ChartTooltip
            cursor={{ fill: "#f8fafc" }}
            content={<ChartTooltipContent hideLabel />}
          />
          <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={18}>
            {data.distribution.map(b => (
              <Cell key={b.label} fill={BAR_FILL[b.label] ?? "#94a3b8"} />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
    </div>
  );
}

// ── Modals ─────────────────────────────────────────────────────────────

const WEIGHTED_DEFAULTS = { sqft: 35, zip: 25, avg_new_build_price_sqft_05mi: 30, lot_sqft: 5, year_built: 5, median_household_income: 0 };

function WeightedScoringModal({ open, onClose, onJob }) {
  const authFetch = useAuthenticatedFetch();
  const [weights, setWeights] = useState(WEIGHTED_DEFAULTS);
  const [running, setRunning] = useState(false);

  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  const update = (k, v) => setWeights(p => ({ ...p, [k]: Math.max(0, parseInt(v) || 0) }));

  const submit = async () => {
    if (total === 0) return alert("Total importance must be > 0%");
    setRunning(true);
    const start = Date.now();
    const normalized = {};
    Object.keys(weights).forEach(k => normalized[k] = weights[k] / total);
    
    const res = await authFetch(`${API}/api/ml/score-weighted`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weights: normalized }),
    });
    
    if (res.ok) {
      const data = await res.json();
      if (data.job_id) onJob(data.job_id);
    }
    
    await delayMinimum(start);
    setRunning(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md font-sans">
        <DialogHeader>
          <DialogTitle>Weighted Scoring</DialogTitle>
          <p className="text-xs text-plt-muted mt-0.5">Manually bias factor weights before scoring</p>
        </DialogHeader>
        <div className="overflow-y-auto max-h-[60vh] space-y-5">
          <div className={`p-3 rounded-lg text-center text-xs font-semibold border ${total === 100 ? "bg-plt-success/10 border-plt-success/20 text-plt-success" : "bg-plt-warning/10 border-plt-warning/20 text-plt-warning"}`}>
            Total: {total}%{total !== 100 && " — will be auto-normalized"}
          </div>
          {Object.entries(weights).map(([key, val]) => (
            <div key={key} className="flex items-center justify-between gap-4 group">
              <label className="text-sm font-medium text-plt-secondary group-hover:text-plt-accent transition-colors capitalize">
                {key.replace(/_/g, ' ')}
              </label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={val}
                  onChange={e => update(key, e.target.value)}
                  className="w-24 h-10 text-sm font-semibold text-right"
                />
                <span className="text-sm text-plt-muted">%</span>
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-3 pt-2 border-t border-plt-border">
          <Btn onClick={submit} disabled={running || total === 0} variant="primary" className="flex-1">
            {running ? "Scoring..." : "Run Scoring"}
          </Btn>
          <Btn onClick={onClose} variant="ghost" className="w-28">Cancel</Btn>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Shared Icons ──────────────────────────────────────────────────────

function TrashIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}

// ── Control Logic ─────────────────────────────────────────────────────

const ALGO_PARAMS = {
  xgboost:       { n_estimators: 1000, max_depth: 6, lr: 0.05, min_year_built: 2015, test_split: 0.20 },
  random_forest: { n_estimators: 500,  max_depth: 10,           min_year_built: 2015, test_split: 0.20 },
  ridge:         { alpha: 1.0,                                   min_year_built: 2015, test_split: 0.20 },
  lightgbm:      { n_estimators: 1000, max_depth: 6, lr: 0.05, min_year_built: 2015, test_split: 0.20 },
};

const PARAM_LABELS = {
  n_estimators:  "Estimators",
  max_depth:     "Max Depth",
  lr:            "Learning Rate",
  alpha:         "Alpha (λ)",
  min_year_built:"Min Year Built",
  test_split:    "Test Split",
};

const ALGOS = [
  { id: "xgboost",       label: "XGBoost" },
  { id: "random_forest", label: "Random Forest" },
  { id: "ridge",         label: "Ridge" },
  { id: "lightgbm",      label: "LightGBM" },
];

function IngestionControls({ onJob }) {
  const authFetch = useAuthenticatedFetch();
  const [market, setMarket] = useState("tampa");
  const [customMarket, setCustomMarket] = useState("");
  const [start, setStart] = useState("2022-01");
  const lastMonth = new Date(); lastMonth.setMonth(lastMonth.getMonth() - 1);
  const [end, setEnd] = useState(`${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`);
  const [throttle, setThrottle] = useState("10");
  const [forceRenew, setForceRenew] = useState(false);
  const [running, setRunning] = useState({});

  const trigger = async (type, params = {}) => {
    const finalMarket = market === "custom" ? customMarket : market;
    
    if (market === "custom" && !customMarket.trim()) {
      alert("Please enter a market name (e.g. 'Miami, FL')");
      return;
    }

    setRunning(p => ({ ...p, [type]: true }));
    const startTime = Date.now();

    const body = { type, market: finalMarket, throttle: parseInt(throttle), force_renew: forceRenew, all_zips: true, ...params };
    const res = await authFetch(`${API}/api/scrape/trigger`, { 
      method: "POST", 
      headers: { "Content-Type": "application/json" }, 
      body: JSON.stringify(body) 
    });
    
    if (res.ok) {
      const data = await res.json();
      if (data.job_id) onJob(data.job_id);
    }

    await delayMinimum(startTime);
    setRunning(p => ({ ...p, [type]: false }));
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label>Market</Label>
          <div className="space-y-2">
            <Select value={market} onValueChange={setMarket}>
              <SelectTrigger className="h-10 text-sm font-medium">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Markets</SelectItem>
                {MARKETS.map(m => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
                <SelectItem value="custom" className="border-t border-slate-100 mt-1 pt-2 font-semibold text-plt-accent">
                  Other...
                </SelectItem>
              </SelectContent>
            </Select>
            {market === "custom" && (
              <Input 
                placeholder="City, State (e.g. Miami, FL)" 
                value={customMarket}
                onChange={e => setCustomMarket(e.target.value)}
                className="h-9 text-xs"
                autoFocus
              />
            )}
          </div>
        </div>
        <div>
          <Label>Throttle</Label>
          <Select value={throttle} onValueChange={setThrottle}>
            <SelectTrigger className="h-10 text-sm font-medium">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="5">Fast (5s)</SelectItem>
              <SelectItem value="10">Balanced (10s)</SelectItem>
              <SelectItem value="30">Safe (30s)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="p-3.5 bg-slate-50 border border-plt-border rounded-xl">
        <label className="flex items-center gap-3 cursor-pointer group select-none">
          <Checkbox
            checked={forceRenew}
            onCheckedChange={checked => setForceRenew(!!checked)}
          />
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-plt-primary group-hover:text-plt-accent transition-colors">Force re-scrape</span>
            <span className="text-xs text-plt-muted">Re-fetch properties already in the database</span>
          </div>
        </label>
      </div>

      <Btn variant="success" disabled={running.for_sale} onClick={() => trigger("for_sale")}>
        {running.for_sale ? "Syncing active listings..." : "Sync Active Listings"}
      </Btn>

      <div className="space-y-3 p-4 bg-slate-50 border border-plt-border rounded-xl">
        <Label>Sold history date range</Label>
        <div className="grid grid-cols-2 gap-3">
          <Input type="month" value={start} onChange={e => setStart(e.target.value)} className="h-10 text-sm font-medium" />
          <Input type="month" value={end} onChange={e => setEnd(e.target.value)} className="h-10 text-sm font-medium" />
        </div>
        <Btn variant="success" disabled={running.sold} onClick={() => trigger("sold", { start, end })}>
          {running.sold ? "Syncing sold history..." : "Sync Sold History"}
        </Btn>
      </div>
    </div>
  );
}

function IntelControls({ onJob, models, fetchModels }) {
  const authFetch = useAuthenticatedFetch();
  const [running, setRunning] = useState({});
  const [activating, setActivating] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [editFields, setEditFields] = useState({});
  const [showWeightedModal, setShowWeightedScoringModal] = useState(false);
  const [algorithm, setAlgorithm] = useState("xgboost");
  const [trainParams, setTrainParams] = useState({ ...ALGO_PARAMS.xgboost });

  useEffect(() => {
    setEditFields(prev => {
      const next = { ...prev };
      models.forEach(m => {
        if (!next[m.id]) next[m.id] = { name: m.name || "", description: m.description || "" };
      });
      return next;
    });
  }, [models]);

  const trigger = async (endpoint) => {
    setRunning(p => ({ ...p, [endpoint]: true }));
    const startTime = Date.now();
    
    const res = await authFetch(`${API}/api/ml/${endpoint}`, { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      if (data.job_id) onJob(data.job_id);
    }
    
    await delayMinimum(startTime);
    setRunning(p => ({ ...p, [endpoint]: false }));
  };

  const startTraining = async () => {
    setRunning(p => ({ ...p, train: true }));
    const startTime = Date.now();
    
    const res = await authFetch(`${API}/api/ml/train`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ algorithm, ...trainParams }),
    });
    
    if (res.ok) {
      const data = await res.json();
      if (data.job_id) onJob(data.job_id);
    }
    
    await delayMinimum(startTime);
    setRunning(p => ({ ...p, train: false }));
  };

  const activateModel = async (modelId) => {
    setActivating(modelId);
    const res = await authFetch(`${API}/api/ml/models/${modelId}/activate`, { method: "POST" }); 
    if (res.ok) await fetchModels(); 
    setActivating(null);
  };

  const deleteModel = async (modelId) => {
    if (!window.confirm("Permanently delete this model?")) return;
    const res = await authFetch(`${API}/api/ml/models/${modelId}`, { method: "DELETE" }); 
    if (res.ok) await fetchModels(); 
  };

  const patchModel = async (modelId) => {
    const fields = editFields[modelId];
    if (!fields) return;
    const res = await authFetch(`${API}/api/ml/models/${modelId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: fields.name || null, description: fields.description || null }),
    });
    if (res.ok) await fetchModels();
  };

  const activeModel = models.find(m => m.is_active);

  return (
    <div className="space-y-5">
      {/* Trained Models */}
      <div className="space-y-2">
        <Label>Trained models</Label>
        {models.length === 0 ? (
          <div className="text-sm text-plt-muted py-8 text-center border-2 border-dashed border-plt-border rounded-xl">
            No models trained yet
          </div>
        ) : (
          <div className="border border-plt-border rounded-xl divide-y divide-plt-border max-h-[200px] overflow-y-auto custom-scrollbar bg-white">
            {models.map(m => {
              const isActive = m.is_active;
              const isExpanded = expandedId === m.id;
              const dateStr = m.started_at ? new Date(m.started_at).toLocaleDateString([], { month: "short", day: "numeric", year: "2-digit" }) : "—";
              const r2 = m.r2_score ? parseFloat(m.r2_score).toFixed(4) : "N/A";
              const displayName = m.name || `Model #${m.id.toString().substring(0, 6)}`;
              const edit = editFields[m.id] || { name: "", description: "" };
              const importances = m.training_context?.feature_importances
                ? Object.entries(m.training_context.feature_importances).sort((a, b) => b[1] - a[1])
                : null;
              const algoLabel = m.training_context?.algorithm?.replace(/_/g, ' ').toUpperCase();

              return (
                <div key={m.id} className={`transition-all ${isActive ? "border-l-4 border-l-plt-accent" : ""}`}>
                  <div
                    className={`px-4 py-3.5 flex items-start justify-between gap-3 cursor-pointer ${!isExpanded ? "hover:bg-plt-bg/50" : "bg-plt-bg/50"}`}
                    onClick={() => setExpandedId(isExpanded ? null : m.id)}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-sm font-semibold text-plt-primary">{displayName}</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${parseFloat(r2) > 0.8 ? "bg-plt-success/10 text-plt-success border-plt-success/20" : "bg-slate-100 text-slate-500 border-slate-200"}`}>
                          R² {r2}
                        </span>
                        {algoLabel && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border bg-slate-100 text-slate-500 border-slate-200">
                            {algoLabel}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-plt-muted">{dateStr} · {m.properties_trained} records</div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {isActive ? (
                        <>
                          <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-plt-success/15 text-plt-success border border-plt-success/25">Active</span>
                          <button onClick={e => { e.stopPropagation(); deleteModel(m.id); }} className="text-plt-muted hover:text-plt-danger p-1.5 rounded-lg transition-all active:scale-[0.98]">
                            <TrashIcon />
                          </button>
                        </>
                      ) : (
                        <>
                          <button onClick={e => { e.stopPropagation(); activateModel(m.id); }} disabled={activating === m.id} className="text-xs font-semibold py-1 px-3 rounded-lg border border-plt-border text-plt-secondary hover:border-plt-accent hover:text-plt-accent transition-all active:scale-[0.98]">
                            {activating === m.id ? "Mounting..." : "Mount"}
                          </button>
                          <button onClick={e => { e.stopPropagation(); deleteModel(m.id); }} className="text-plt-muted hover:text-plt-danger p-1.5 rounded-lg transition-all active:scale-[0.98]">
                            <TrashIcon />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-3 bg-white space-y-4 border-t border-plt-border/60">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label>Name</Label>
                          <input
                            type="text"
                            value={edit.name}
                            onChange={e => setEditFields(p => ({ ...p, [m.id]: { ...p[m.id], name: e.target.value } }))}
                            onBlur={() => patchModel(m.id)}
                            placeholder="Untitled"
                            className="h-9 text-sm w-full bg-transparent border-none focus:ring-0 font-semibold"
                          />
                        </div>
                        <div>
                          <Label>Notes</Label>
                          <input
                            type="text"
                            value={edit.description}
                            onChange={e => setEditFields(p => ({ ...p, [m.id]: { ...p[m.id], description: e.target.value } }))}
                            onBlur={() => patchModel(m.id)}
                            placeholder="Optional"
                            className="h-9 text-sm w-full bg-transparent border-none focus:ring-0"
                          />
                        </div>
                      </div>
                      {importances && (
                        <div className="space-y-2">
                          <div className="text-xs font-semibold text-plt-muted mb-2">Feature importance</div>
                          {importances.map(([feat, imp]) => (
                            <div key={feat} className="flex items-center gap-3">
                              <span className="text-xs text-plt-secondary w-32 truncate capitalize">{feat.replace(/_/g, ' ')}</span>
                              <Progress value={imp * 100} className="flex-1 h-1.5" />
                              <span className="text-xs font-semibold text-plt-primary w-9 text-right">{(imp * 100).toFixed(0)}%</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Inline Training Configuration */}
      <div className="bg-slate-50 border border-plt-border rounded-xl p-4 space-y-4">
        <Label>New Training Run</Label>

        {/* Algorithm selector */}
        <div>
          <div className="text-[9px] font-bold uppercase tracking-widest text-plt-muted mb-1.5 font-sans">Algorithm</div>
          <div className="grid grid-cols-2 gap-1">
            {ALGOS.map(a => (
              <button
                key={a.id}
                onClick={() => { setAlgorithm(a.id); setTrainParams({ ...ALGO_PARAMS[a.id] }); }}
                className={`py-2 px-3 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all duration-150 active:scale-[0.98] ${
                  algorithm === a.id
                    ? "bg-plt-accent text-white shadow-sm"
                    : "bg-white border border-plt-border text-plt-muted hover:text-plt-primary hover:border-plt-accent/40"
                }`}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>

        {/* Dynamic parameter inputs */}
        <div className="grid grid-cols-2 gap-3">
          {Object.entries(trainParams).map(([key, val]) => (
            <div key={key}>
              <Label>{PARAM_LABELS[key] || key}</Label>
              <Input
                type="number"
                value={val}
                step={key === "lr" || key === "test_split" ? "0.01" : key === "alpha" ? "0.1" : "1"}
                onChange={e => setTrainParams(p => ({ ...p, [key]: parseFloat(e.target.value) || 0 }))}
                className="h-9 text-sm font-semibold text-right"
              />
            </div>
          ))}
        </div>

        <Btn variant="primary" onClick={startTraining} disabled={running.train}>
          {running.train ? "Starting..." : "Start Training Run"}
        </Btn>
      </div>

      {/* Scoring actions */}
      <div className="pt-2 border-t border-plt-border/50">
        <Btn onClick={() => trigger("score")} disabled={running.score || !activeModel} variant="primary">
          {running.score ? "Scoring..." : "ML Score"}
        </Btn>
      </div>

      <WeightedScoringModal
        open={showWeightedModal}
        onClose={() => setShowWeightedScoringModal(false)}
        onJob={onJob}
      />
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────

export default function Operations() {
  const [mlStatus, setMlStatus] = useState(null);
  const [scrapeStatus, setScrapeStatus] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [activeJobId, setActiveJobId] = useState(null);
  const [models, setModels] = useState([]);

  const fetchModels = useCallback(async () => {
    try {
      const data = await fetch(`${API}/api/ml/models`).then(r => r.json());
      if (Array.isArray(data)) setModels(data);
    } catch {}
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const [ml, sc, jb] = await Promise.all([
        fetch(`${API}/api/ml/status`).then(r => r.json()),
        fetch(`${API}/api/scrape/status`).then(r => r.json()),
        fetch(`${API}/api/jobs`).then(r => r.json()),
      ]);
      setMlStatus(ml);
      setScrapeStatus(sc.scrape_status || []);
      setJobs(Array.isArray(jb) ? jb : []);
    } catch {}
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchModels();
    const id = setInterval(() => { fetchStatus(); fetchModels(); }, 4000);
    return () => clearInterval(id);
  }, [fetchStatus, fetchModels]);

  return (
    <div className="flex flex-col h-full overflow-y-auto lg:overflow-hidden bg-plt-bg text-plt-primary font-sans selection:bg-plt-accent selection:text-white custom-scrollbar">
      {/* System HUD */}
      <div className="flex-shrink-0 px-4 sm:px-6 pt-4 pb-3">
        <HUD mlStatus={mlStatus} scrapeStatus={scrapeStatus} />
      </div>

      {/* Results Chart */}
      <div className="flex-shrink-0 px-4 sm:px-6 pb-3">
        <ResultsChart refreshKey={mlStatus?.score?.completed_at || mlStatus?.score_weighted?.completed_at} />
      </div>

      {/* Main Workspace */}
      <div className="flex-1 flex flex-col lg:flex-row lg:overflow-hidden px-4 sm:px-6 pb-6 pt-0 gap-5 min-h-0">
        {/* Left Half: Tabbed control card */}
        <div className="flex-1 min-w-0 min-h-[360px] sm:min-h-[480px] lg:min-h-0 flex flex-col">
          <ControlCard onJob={setActiveJobId} models={models} fetchModels={fetchModels} />
        </div>

        {/* Right Half: Telemetry */}
        <div className="flex-1 min-w-0 min-h-[360px] sm:min-h-[480px] lg:min-h-0 flex flex-col">
          <JobConsole
            selectedId={activeJobId}
            setSelectedId={setActiveJobId}
            jobs={jobs}
            onClear={() => setActiveJobId(null)}
          />
        </div>
      </div>
    </div>
  );
}
