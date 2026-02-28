import { useState, useEffect, useCallback, useRef } from "react";

const API = "";

const MARKETS = [
  { value: "tampa", label: "Tampa", zips: ["33606", "33629", "33611"] },
  { value: "orlando", label: "Orlando", zips: ["32803", "32806"] },
  { value: "winter_garden", label: "Winter Garden", zips: ["34787"] },
  { value: "winter_park", label: "Winter Park", zips: ["32789", "32792"] },
];

// ── Shared Primitives (Assertive Tactical) ──────────────────────────

function Label({ children }) {
  return <span className="text-[10px] font-bold uppercase tracking-widest text-plt-text-muted mb-2 block">{children}</span>;
}

function Val({ children, green, yellow, red, mono, lg }) {
  let color = "text-plt-text-primary";
  if (green) color = "text-plt-success";
  if (yellow) color = "text-plt-warning";
  if (red) color = "text-plt-danger";
  return (
    <span className={`${color} ${mono ? "font-mono" : ""} ${lg ? "text-xl font-black tracking-tighter" : "text-xs font-bold"}`}>
      {children}
    </span>
  );
}

function Panel({ title, tag, children, className = "" }) {
  return (
    <div className={`bg-plt-panel border border-plt-border flex flex-col relative overflow-hidden rounded-md shadow-sm ${className}`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-plt-border bg-plt-bg/20 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-1.5 h-1.5 bg-plt-accent rounded-full" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-plt-text-primary">{title}</span>
        </div>
        {tag && <span className="text-[9px] font-mono font-bold text-plt-text-muted tracking-widest">{tag}</span>}
      </div>
      <div className="p-4 flex-1 overflow-y-auto custom-scrollbar">{children}</div>
    </div>
  );
}

function StatusDot({ status }) {
  const map = {
    running:   "bg-plt-accent animate-pulse shadow-[0_0_8px_var(--plt-accent)]",
    completed: "bg-plt-success shadow-[0_0_8px_var(--plt-success)]",
    failed:    "bg-plt-danger shadow-[0_0_8px_var(--plt-danger)]",
    pending:   "bg-plt-warning animate-pulse",
    idle:      "bg-plt-border",
  };
  return <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${map[status] || map.idle}`} />;
}

function Btn({ children, onClick, disabled, variant = "primary", className = "" }) {
  const variants = {
    primary: "bg-plt-accent text-white hover:bg-plt-accent-hover shadow-sm",
    success: "bg-plt-success text-white hover:bg-plt-success-hover shadow-sm",
    danger:  "bg-plt-danger text-white hover:bg-plt-danger-hover shadow-sm",
    ghost:   "bg-transparent border border-plt-border text-plt-text-secondary hover:bg-plt-hover hover:text-plt-text-primary",
    outline: "bg-transparent border border-plt-accent text-plt-accent hover:bg-plt-accent/5",
  };
  
  return (
    <button
      className={`w-full text-[11px] font-bold uppercase tracking-wider py-2.5 px-4 transition-all duration-150 rounded active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed disabled:active:scale-100 ${variants[variant]} ${className}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

// ── Components ───────────────────────────────────────────────────────

function JobConsole({ selectedId, setSelectedId, jobs = [], onClear }) {
  const [selectedJob, setSelectedJob] = useState(null);
  const scrollRef = useRef(null);

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

  const handleClear = () => { setSelectedId(null); setSelectedJob(null); onClear?.(); };

  const statusLabel = selectedJob?.status ? selectedJob.status.toUpperCase() : "READY";

  return (
    <div className="flex flex-col h-full bg-white border border-plt-border overflow-hidden relative shadow-sm rounded-md">
      {/* 1. Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-plt-border bg-plt-bg/20 flex-shrink-0">
        <div className="flex items-center gap-3">
          <StatusDot status={selectedJob?.status || "idle"} />
          <span className="text-[11px] font-bold uppercase tracking-widest text-plt-text-primary">
            Telemetry Stream · {statusLabel}
          </span>
        </div>
        {selectedId && (
          <button onClick={handleClear} className="text-plt-text-muted hover:text-plt-accent text-[10px] font-bold uppercase tracking-widest transition-colors">Close</button>
        )}
      </div>

      {/* 2. Job Selector Box (The requested "Box before logs") */}
      <div className="px-5 py-3 border-b border-plt-border bg-slate-50 flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[9px] font-black uppercase text-plt-text-muted tracking-widest">Recent & Active Tasks</span>
          {jobs.length > 0 && (
            <span className="text-[9px] font-bold text-plt-accent uppercase">{jobs.length} total</span>
          )}
        </div>
        
        {jobs.length === 0 ? (
          <div className="py-2 text-[10px] text-plt-text-muted italic opacity-60">No recent tasks found...</div>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar scroll-smooth">
            {jobs.slice(0, 10).map(j => {
              const isActive = selectedId == j.id;
              const shortId = j.id.toString().substring(0, 8);
              return (
                <button
                  key={j.id}
                  onClick={() => setSelectedId(j.id)}
                  className={`flex items-center gap-2.5 px-3 py-1.5 rounded border transition-all whitespace-nowrap group ${
                    isActive 
                      ? "bg-plt-accent border-plt-accent text-white shadow-sm ring-2 ring-plt-accent/10" 
                      : "bg-white border-plt-border text-plt-text-secondary hover:border-plt-accent/50 hover:bg-slate-50"
                  }`}
                >
                  <StatusDot status={j.status} />
                  <div className="flex flex-col items-start leading-tight">
                    <span className={`text-[10px] font-black uppercase tracking-tighter ${isActive ? "text-white" : "text-plt-text-primary"}`}>
                      {j.type} <span className={`font-mono font-medium ${isActive ? "text-white/70" : "text-plt-text-muted"}`}>#{shortId}</span>
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. Log Output Area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4 font-mono text-[11px] leading-relaxed bg-slate-50 custom-scrollbar">
        {!selectedJob && (
          <div className="h-full flex flex-col items-center justify-center text-center opacity-40 py-10">
            <svg className="w-8 h-8 mb-3 text-plt-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="text-plt-text-muted uppercase tracking-[0.2em] text-[10px] font-bold">
              {jobs.length > 0 ? "Select a task above to view real-time logs" : "Standby for new telemetry..."}
            </span>
          </div>
        )}
        {selectedJob?.logs?.map((line, i) => {
          const lower = line.toLowerCase();
          let color = "text-plt-text-secondary";
          if (line.includes("[FAIL]") || lower.includes("failed") || lower.includes("error")) color = "text-plt-danger";
          else if (line.includes("[SKIP]")) color = "text-plt-warning";
          else if (line.includes("[LOAD]")) color = "text-plt-success";
          else if (line.includes("[EXEC]")) color = "text-plt-accent font-bold";
          return (
            <div key={i} className={`${color} break-all whitespace-pre-wrap mb-1 flex gap-4`}>
              <span className="opacity-30 select-none w-8 flex-shrink-0">{(i + 1).toString().padStart(3, "0")}</span>
              <span className="flex-1">{line}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const HUD = React.memo(({ mlStatus, scrapeStatus }) => {
  const soldTotal = scrapeStatus.filter(r => r.listing_type === 'sold').reduce((s, r) => s + parseInt(r.property_count), 0);
  const forSaleTotal = scrapeStatus.filter(r => r.listing_type === 'for_sale').reduce((s, r) => s + parseInt(r.property_count), 0);
  const unscored = mlStatus?.counts?.for_sale?.unscored ?? 0;
  const r2 = mlStatus?.train?.r2_score;

  const stats = [
    { label: "Historical", val: soldTotal.toLocaleString(), green: soldTotal > 0 },
    { label: "Active", val: forSaleTotal.toLocaleString(), green: forSaleTotal > 0 },
    { label: "Unscored", val: unscored.toLocaleString(), yellow: unscored > 0 },
    { label: "R² Precision", val: r2 ? parseFloat(r2).toFixed(4) : "None", green: r2 > 0.8 },
    { label: "ML State", val: mlStatus?.train?.status ? mlStatus.train.status.toUpperCase() : "IDLE", mono: true },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 border border-plt-border bg-white divide-x divide-plt-border rounded-md overflow-hidden shadow-sm">
      {stats.map(s => (
        <div key={s.label} className="px-5 py-4">
          <div className="text-[9px] font-bold uppercase tracking-widest text-plt-text-muted mb-1.5">{s.label}</div>
          <Val mono lg green={s.green} yellow={s.yellow}>{s.val}</Val>
        </div>
      ))}
    </div>
  );
});

// ── Modals ─────────────────────────────────────────────────────────────

function TrainModal({ onClose, onJob }) {
  const DEFAULTS = { n_estimators: 1000, max_depth: 6, lr: 0.05, min_year_built: 2015, test_split: 0.20 };
  const [params, setParams] = useState(DEFAULTS);
  const [running, setRunning] = useState(false);

  const set = (k, v) => setParams(p => ({ ...p, [k]: v }));

  const submit = async () => {
    setRunning(true);
    const start = Date.now();
    try {
      const res = await fetch(`${API}/api/ml/train`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      const data = await res.json();
      if (data.job_id) onJob(data.job_id);
    } catch {}
    const elapsed = Date.now() - start;
    if (elapsed < 600) await new Promise(r => setTimeout(r, 600 - elapsed));
    setRunning(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white border border-plt-border rounded-lg shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-plt-border bg-slate-50 rounded-t-lg">
          <div>
            <span className="text-sm font-bold uppercase tracking-widest text-plt-text-primary">Train XGBoost Model</span>
            <p className="text-[10px] text-plt-text-muted mt-0.5 font-medium">Configure hyper-parameters for property valuation</p>
          </div>
          <button onClick={onClose} className="text-plt-text-muted hover:text-plt-danger transition-colors p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-6 space-y-5">
          {Object.entries(params).map(([key, val]) => (
            <div key={key} className="flex items-center justify-between gap-4">
              <label className="text-[11px] font-bold uppercase tracking-wider text-plt-text-secondary">{key.replace(/_/g, ' ')}</label>
              <input
                type="number"
                value={val}
                onChange={e => set(key, parseFloat(e.target.value))}
                className="w-32 h-9 px-3 text-xs font-mono text-right border border-plt-border rounded"
              />
            </div>
          ))}
        </div>
        <div className="flex gap-3 px-6 py-5 border-t border-plt-border bg-slate-50 rounded-b-lg">
          <Btn onClick={submit} disabled={running} variant="primary" className="flex-1 h-11">Start Training</Btn>
          <Btn onClick={onClose} variant="ghost" className="flex-1 h-11">Cancel</Btn>
        </div>
      </div>
    </div>
  );
}

function WeightedScoringModal({ onClose, onJob }) {
  const DEFAULTS = { sqft: 35, zip: 25, avg_new_build_price_sqft_05mi: 30, lot_sqft: 5, year_built: 5, median_household_income: 0 };
  const [weights, setWeights] = useState(DEFAULTS);
  const [running, setRunning] = useState(false);

  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  const update = (k, v) => setWeights(p => ({ ...p, [k]: Math.max(0, parseInt(v) || 0) }));

  const submit = async () => {
    if (total === 0) return alert("Total importance must be > 0%");
    setRunning(true);
    const start = Date.now();
    const normalized = {};
    Object.keys(weights).forEach(k => normalized[k] = weights[k] / total);
    try {
      const res = await fetch(`${API}/api/ml/score-weighted`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weights: normalized }),
      });
      const data = await res.json();
      if (data.job_id) onJob(data.job_id);
    } catch {}
    const elapsed = Date.now() - start;
    if (elapsed < 600) await new Promise(r => setTimeout(r, 600 - elapsed));
    setRunning(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white border border-plt-border rounded-lg shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-plt-border bg-slate-50 rounded-t-lg">
          <div>
            <span className="text-sm font-bold uppercase tracking-widest text-plt-text-primary">Weighted Scoring</span>
            <p className="text-[10px] text-plt-text-muted mt-0.5 font-medium">Define manual feature importance baseline</p>
          </div>
          <button onClick={onClose} className="text-plt-text-muted hover:text-plt-danger transition-colors p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-6 space-y-5">
          <div className={`p-2 rounded text-center text-[10px] font-bold border ${total === 100 ? "bg-plt-success/10 border-plt-success/30 text-plt-success" : "bg-plt-warning/10 border-plt-warning/30 text-plt-warning"}`}>
            TOTAL IMPORTANCE: {total}% {total !== 100 && "(WILL NORMALIZE)"}
          </div>
          {Object.entries(weights).map(([key, val]) => (
            <div key={key} className="flex items-center justify-between gap-4">
              <label className="text-[11px] font-bold uppercase tracking-wider text-plt-text-secondary">{key.replace(/_/g, ' ')}</label>
              <div className="flex items-center gap-2">
                <input type="number" value={val} onChange={e => update(key, e.target.value)} className="w-20 h-9 px-3 text-xs font-mono text-right border border-plt-border rounded" />
                <span className="text-[10px] font-bold text-plt-text-muted">%</span>
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-3 px-6 py-5 border-t border-plt-border bg-slate-50 rounded-b-lg">
          <Btn onClick={submit} disabled={running || total === 0} variant="primary" className="flex-1 h-11">Run Scoring</Btn>
          <Btn onClick={onClose} variant="ghost" className="flex-1 h-11">Cancel</Btn>
        </div>
      </div>
    </div>
  );
}

// ── Control Logic ─────────────────────────────────────────────────────

function IngestionControls({ onJob }) {
  const [market, setMarket] = useState("tampa");
  const [start, setStart] = useState("2022-01");
  const lastMonth = new Date(); lastMonth.setMonth(lastMonth.getMonth() - 1);
  const [end, setEnd] = useState(`${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`);
  const [throttle, setThrottle] = useState(10);
  const [forceRenew, setForceRenew] = useState(false);
  const [running, setRunning] = useState({});

  const trigger = async (type, params = {}) => {
    setRunning(p => ({ ...p, [type]: true }));
    const startTime = Date.now();
    const body = { type, market, throttle, force_renew: forceRenew, all_zips: true, ...params };
    const res = await fetch(`${API}/api/scrape/trigger`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    if (data.job_id) onJob(data.job_id);
    
    const elapsed = Date.now() - startTime;
    if (elapsed < 600) await new Promise(r => setTimeout(r, 600 - elapsed));
    setRunning(p => ({ ...p, [type]: false }));
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div><Label>Market</Label><select value={market} onChange={e => setMarket(e.target.value)} className="w-full h-10 px-3"><option value="all">All Markets</option>{MARKETS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}</select></div>
        <div><Label>Request Speed</Label><select value={throttle} onChange={e => setThrottle(parseInt(e.target.value))} className="w-full h-10 px-3"><option value="5">Fast (5s)</option><option value="10">Balanced (10s)</option><option value="30">Safe (30s)</option></select></div>
      </div>
      <div className="flex items-center gap-3 py-2 border-y border-plt-border/50">
        <label className="flex items-center gap-3 cursor-pointer group">
          <input type="checkbox" checked={forceRenew} onChange={e => setForceRenew(e.target.checked)} className="w-4 h-4 accent-plt-success" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-plt-text-secondary group-hover:text-plt-text-primary">Re-fetch existing data</span>
        </label>
      </div>
      <div className="space-y-4">
        <Btn variant="success" disabled={running.for_sale} onClick={() => trigger("for_sale")}>{running.for_sale ? "Syncing..." : "Sync Active Listings"}</Btn>
        <div className="space-y-3 p-4 bg-slate-50 border border-plt-border rounded-md">
          <Label>Historical Range</Label>
          <div className="grid grid-cols-2 gap-2 mb-2"><input type="month" value={start} onChange={e => setStart(e.target.value)} className="w-full h-9 px-2 text-xs" /><input type="month" value={end} onChange={e => setEnd(e.target.value)} className="w-full h-9 px-2 text-xs" /></div>
          <Btn variant="success" disabled={running.sold} onClick={() => trigger("sold", { start, end })}>{running.sold ? "Syncing..." : "Sync Sold History"}</Btn>
        </div>
      </div>
    </div>
  );
}

function IntelControls({ mlStatus, onJob }) {
  const [running, setRunning] = useState({});
  const [models, setModels] = useState([]);
  const [activating, setActivating] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [editFields, setEditFields] = useState({});
  const [showTrainModal, setShowTrainModal] = useState(false);
  const [showWeightedModal, setShowWeightedScoringModal] = useState(false);

  const trigger = async (endpoint) => {
    setRunning(p => ({ ...p, [endpoint]: true }));
    const startTime = Date.now();
    const res = await fetch(`${API}/api/ml/${endpoint}`, { method: "POST" });
    const data = await res.json();
    if (data.job_id) onJob(data.job_id);
    
    const elapsed = Date.now() - startTime;
    if (elapsed < 600) await new Promise(r => setTimeout(r, 600 - elapsed));
    setRunning(p => ({ ...p, [endpoint]: false }));
  };

  const fetchModels = async () => {
    try {
      const data = await fetch(`${API}/api/ml/models`).then(r => r.json());
      if (Array.isArray(data)) {
        setModels(data);
        setEditFields(prev => {
          const next = { ...prev };
          data.forEach(m => {
            if (!next[m.id]) next[m.id] = { name: m.name || "", description: m.description || "" };
          });
          return next;
        });
      }
    } catch {}
  };

  useEffect(() => {
    fetchModels();
    const id = setInterval(fetchModels, 8000);
    return () => clearInterval(id);
  }, []);

  const activateModel = async (modelId) => {
    setActivating(modelId);
    try { await fetch(`${API}/api/ml/models/${modelId}/activate`, { method: "POST" }); await fetchModels(); } catch {}
    setActivating(null);
  };

  const deleteModel = async (modelId) => {
    if (!window.confirm("ARE YOU SURE? THIS CANNOT BE UNDONE.")) return;
    try { await fetch(`${API}/api/ml/models/${modelId}`, { method: "DELETE" }); await fetchModels(); } catch {}
  };

  const patchModel = async (modelId) => {
    const fields = editFields[modelId];
    if (!fields) return;
    try {
      await fetch(`${API}/api/ml/models/${modelId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: fields.name || null, description: fields.description || null }),
      });
      await fetchModels();
    } catch {}
  };

  const activeModel = models.find(m => m.is_active);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label>Available Models</Label>
        {models.length === 0 ? (
          <div className="text-[10px] font-bold uppercase text-plt-text-muted opacity-50 py-6 text-center border border-dashed border-plt-border rounded">No models trained</div>
        ) : (
          <div className="border border-plt-border rounded divide-y divide-plt-border max-h-[320px] overflow-y-auto custom-scrollbar bg-slate-50">
            {models.map(m => {
              const isActive = m.is_active;
              const isExpanded = expandedId === m.id;
              const dateStr = m.started_at ? new Date(m.started_at).toLocaleDateString([], { month: "short", day: "numeric" }) : "—";
              const r2 = m.r2_score ? parseFloat(m.r2_score).toFixed(4) : "N/A";
              const displayName = m.name || `MODEL #${m.id}`;
              const edit = editFields[m.id] || { name: "", description: "" };
              const importances = m.training_context?.feature_importances ? Object.entries(m.training_context.feature_importances).sort((a, b) => b[1] - a[1]) : null;

              return (
                <div key={m.id} className={`transition-colors ${isActive ? "bg-white border-l-2 border-l-plt-accent shadow-sm" : ""}`}>
                  <div className={`px-4 py-3 flex items-start justify-between gap-3 cursor-pointer ${!isExpanded ? "hover:bg-white" : ""}`} onClick={() => setExpandedId(isExpanded ? null : m.id)}>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-mono text-[10px] font-black text-plt-text-primary uppercase">{displayName}</span>
                        <span className="text-[9px] font-bold text-plt-text-muted">{dateStr}</span>
                        <span className={`font-mono text-[10px] font-bold ${parseFloat(r2) > 0.8 ? "text-plt-success" : "text-plt-text-secondary"}`}>R² {r2}</span>
                      </div>
                      <div className="text-[9px] font-bold text-plt-text-muted uppercase tracking-tighter truncate">{m.properties_trained} PROPS · {m.training_context?.cities?.join(", ") || "MULTI-MARKET"}</div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {isActive ? (
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-plt-success/15 text-plt-success border border-plt-success/30 uppercase">Active</span>
                          <button onClick={e => { e.stopPropagation(); deleteModel(m.id); }} className="text-[9px] font-bold uppercase py-1 px-2 rounded text-plt-danger hover:bg-plt-danger/10 transition-all">Delete</button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <button onClick={e => { e.stopPropagation(); activateModel(m.id); }} disabled={activating === m.id} className="text-[9px] font-bold uppercase py-1 px-2 rounded border border-plt-border text-plt-text-secondary hover:border-plt-accent hover:text-plt-accent transition-all">Use</button>
                          <button onClick={e => { e.stopPropagation(); deleteModel(m.id); }} className="text-[9px] font-bold uppercase py-1 px-2 rounded text-plt-danger hover:bg-plt-danger/10 transition-all">Delete</button>
                        </div>
                      )}
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-1 bg-white space-y-4 border-t border-slate-100">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[9px] font-bold uppercase text-plt-text-muted mb-1 block">Identifier</label>
                          <input type="text" value={edit.name} onChange={e => setEditFields(p => ({ ...p, [m.id]: { ...p[m.id], name: e.target.value } }))} onBlur={() => patchModel(m.id)} className="w-full h-8 px-2 font-mono text-[10px]" />
                        </div>
                        <div>
                          <label className="text-[9px] font-bold uppercase text-plt-text-muted mb-1 block">Description</label>
                          <input type="text" value={edit.description} onChange={e => setEditFields(p => ({ ...p, [m.id]: { ...p[m.id], description: e.target.value } }))} onBlur={() => patchModel(m.id)} className="w-full h-8 px-2 font-mono text-[10px]" />
                        </div>
                      </div>
                      {importances && (
                        <div className="space-y-1.5">
                          <div className="text-[9px] font-bold uppercase text-plt-text-muted mb-2 tracking-widest">Model Decision Weights</div>
                          {importances.map(([feat, imp]) => (
                            <div key={feat} className="flex items-center gap-3">
                              <span className="text-[9px] font-bold text-plt-text-secondary w-24 uppercase truncate font-mono">{feat}</span>
                              <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full bg-plt-accent" style={{ width: `${(imp * 100).toFixed(0)}%` }} />
                              </div>
                              <span className="text-[9px] font-mono font-bold text-plt-text-primary">{(imp * 100).toFixed(0)}%</span>
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

      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-plt-border/50">
        <Btn onClick={() => setShowTrainModal(true)} variant="primary">New Train</Btn>
        <Btn onClick={() => trigger("score")} disabled={running.score || !activeModel} variant="outline">ML Score</Btn>
      </div>
      <Btn variant="ghost" onClick={() => setShowWeightedScoringModal(true)}>Weighted Score Algorithm</Btn>

      {showTrainModal && <TrainModal onClose={() => setShowTrainModal(false)} onJob={onJob} />}
      {showWeightedModal && <WeightedScoringModal onClose={() => setShowWeightedScoringModal(false)} onJob={onJob} />}
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────

export default function Operations() {
  const [mlStatus, setMlStatus] = useState(null);
  const [scrapeStatus, setScrapeStatus] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [activeJobId, setActiveJobId] = useState(null);
  const [activeTab, setActiveTab] = useState("controls");

  const fetchStatus = useCallback(async () => {
    try {
      const [ml, sc, jb] = await Promise.all([
        fetch(`${API}/api/ml/status`).then(r => r.json()),
        fetch(`${API}/api/scrape/status`).then(r => r.json()),
        fetch(`${API}/api/jobs`).then(r => r.json()),
      ]);
      setMlStatus(ml); 
      setScrapeStatus(sc.scrape_status || []);
      setJobs(jb);
    } catch {}
  }, []);

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, 4000);
    return () => clearInterval(id);
  }, [fetchStatus]);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-plt-bg text-plt-text-primary">
      <div className="flex-shrink-0 p-4 md:p-6">
        <HUD 
          mlStatus={mlStatus} 
          scrapeStatus={scrapeStatus} 
        />
      </div>

      <div className="lg:hidden flex-shrink-0 flex border-b border-plt-border bg-white px-3">
        {[{ id: "controls", label: "CONTROLS" }, { id: "console", label: "TELEMETRY" }].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} className={`flex-1 py-3 text-[10px] font-black transition-all border-b-2 ${activeTab === t.id ? "border-plt-accent text-plt-accent" : "border-transparent text-plt-text-muted"}`}>{t.label}</button>
        ))}
      </div>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden px-4 pb-4 md:px-6 md:pb-6 pt-2 gap-6">
        <div className={`w-full lg:w-[400px] flex flex-col gap-6 overflow-y-auto no-scrollbar pb-4 lg:pb-0 ${activeTab === "console" ? "hidden lg:flex" : "flex"}`}>
          <Panel title="Data Collection" tag="SCRAPER"><IngestionControls onJob={setActiveJobId} /></Panel>
          <Panel title="Intel Engine" tag="XGBOOST"><IntelControls mlStatus={mlStatus} onJob={setActiveJobId} /></Panel>
          
          <div className="border border-plt-danger/20 rounded-md p-5 bg-white shadow-sm flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 bg-plt-danger rounded-full" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-plt-danger">System Reset</span>
            </div>
            <p className="text-[10px] font-medium text-plt-text-secondary leading-tight uppercase tracking-tighter">Clears all properties, scores, and history.</p>
            <button onClick={() => window.confirm("PERMANENT DATA WIPE. CONTINUE?") && fetch(`${API}/api/scrape/reset`, { method: "POST" }).then(() => window.location.reload())} className="w-full text-[11px] font-black uppercase tracking-widest bg-plt-danger text-white hover:bg-plt-danger-hover py-3 rounded transition-all">Wipe Database</button>
          </div>
        </div>
        <div className={`flex-1 min-h-[300px] ${activeTab === "controls" ? "hidden lg:block" : "flex flex-col"}`}>
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
