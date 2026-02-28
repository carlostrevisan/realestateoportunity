import { useState, useEffect, useCallback, useRef } from "react";

const API = "";

const MARKETS = [
  { value: "tampa", label: "Tampa", zips: ["33606", "33629", "33611"] },
  { value: "orlando", label: "Orlando", zips: ["32803", "32806"] },
  { value: "winter_garden", label: "Winter Garden", zips: ["34787"] },
  { value: "winter_park", label: "Winter Park", zips: ["32789", "32792"] },
];

// ── Shared Primitives (Palantir Tactical) ──────────────────────────

function Label({ children }) {
  return <span className="text-[10px] font-semibold uppercase tracking-wider text-plt-muted mb-2 block">{children}</span>;
}

function Val({ children, green, yellow, red, mono, lg }) {
  let color = "text-plt-primary";
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
    <div className={`bg-plt-panel border border-plt-border flex flex-col relative overflow-hidden rounded ${className}`}>
      <div className="absolute top-0 right-0 w-32 h-32 bg-plt-accent/5 blur-[60px] pointer-events-none" />
      <div className="flex items-center justify-between px-3 py-2.5 sm:px-4 sm:py-3 border-b border-plt-border bg-plt-bg/30 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-1.5 h-1.5 bg-plt-accent rounded-full shadow-[0_0_8px_var(--plt-accent)]" />
          <span className="text-xs font-semibold text-plt-primary">{title}</span>
        </div>
        {tag && <span className="text-[9px] font-mono text-plt-muted tracking-widest">{tag}</span>}
      </div>
      <div className="p-4 sm:p-5 flex-1">{children}</div>
    </div>
  );
}

function StatusDot({ status }) {
  const map = {
    running:   "bg-plt-accent shadow-[0_0_10px_var(--plt-accent)] animate-pulse",
    completed: "bg-plt-success shadow-[0_0_10px_var(--plt-success)]",
    failed:    "bg-plt-danger shadow-[0_0_10px_var(--plt-danger)]",
    pending:   "bg-plt-warning animate-pulse",
    idle:      "bg-plt-border",
  };
  return <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${map[status] || map.idle}`} />;
}

function Btn({ children, onClick, disabled, variant = "primary" }) {
  const variants = {
    primary: "bg-plt-accent text-white font-semibold hover:brightness-110 shadow-lg shadow-plt-accent/10",
    ghost:   "bg-transparent border border-plt-border text-plt-primary hover:border-plt-accent hover:text-plt-accent",
    success: "bg-plt-success text-white font-semibold hover:brightness-110",
  };
  return (
    <button
      className={`w-full text-xs py-2.5 px-4 transition-all rounded disabled:opacity-30 disabled:cursor-not-allowed ${variants[variant]}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

// ── Components ───────────────────────────────────────────────────────

function JobConsole({ newJobId, onClear }) {
  const [jobs, setJobs] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedJob, setSelectedJob] = useState(null);
  const [stopping, setStopping] = useState({});
  const scrollRef = useRef(null);

  // Auto-select newly triggered jobs
  useEffect(() => {
    if (newJobId) setSelectedId(newJobId);
  }, [newJobId]);

  // Poll full job list every 2s
  useEffect(() => {
    const poll = async () => {
      try {
        const data = await fetch(`${API}/api/jobs`).then(r => r.json());
        setJobs(data);
      } catch {}
    };
    poll();
    const id = setInterval(poll, 2000);
    return () => clearInterval(id);
  }, []);

  // Poll selected job logs every 1.5s
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

  // Auto-scroll on new log lines
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [selectedJob?.logs?.length]);

  const stopJob = async (e, jobId) => {
    e.stopPropagation();
    setStopping(p => ({ ...p, [jobId]: true }));
    try { await fetch(`${API}/api/jobs/${jobId}/stop`, { method: "POST" }); } catch {}
    setStopping(p => ({ ...p, [jobId]: false }));
  };

  const handleClear = () => { setSelectedId(null); setSelectedJob(null); onClear?.(); };
  const clearDone = () => setJobs(prev => prev.filter(j => j.status === "running"));

  const runningCount = jobs.filter(j => j.status === "running").length;
  const hasDone = jobs.some(j => j.status !== "running");
  const visibleJobs = jobs.slice(0, 20);
  const statusLabel = selectedJob?.status
    ? selectedJob.status.charAt(0).toUpperCase() + selectedJob.status.slice(1)
    : runningCount > 0 ? `${runningCount} Running` : "Ready";

  return (
    <div className="flex flex-col h-full bg-plt-bg border border-plt-border overflow-hidden relative shadow-2xl rounded">

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 sm:px-5 sm:py-3 border-b border-plt-border bg-plt-panel/50 flex-shrink-0">
        <div className="flex items-center gap-3">
          <StatusDot status={selectedJob?.status || (runningCount > 0 ? "running" : "idle")} />
          <span className="text-xs font-semibold text-plt-primary">
            Console · {statusLabel}
            {selectedId && <span className="text-plt-muted ml-3 font-mono text-[10px]">#{selectedId}</span>}
          </span>
        </div>
        {(selectedId || jobs.length > 0) && (
          <button onClick={handleClear} className="text-plt-muted hover:text-plt-accent text-xs font-medium transition-colors">Clear</button>
        )}
      </div>

      {/* Job list */}
      {jobs.length > 0 && (
        <div className="flex-shrink-0 border-b border-plt-border bg-plt-panel/30 max-h-[200px] overflow-y-auto">
          <div className="px-3 py-1.5 flex items-center justify-between sticky top-0 bg-plt-panel/80 backdrop-blur-sm">
            <span className="text-[9px] font-semibold uppercase tracking-widest text-plt-muted">
              Jobs <span className="text-plt-primary">{jobs.length}</span>
            </span>
            <div className="flex items-center gap-3">
              {runningCount > 0 && <span className="text-[9px] font-mono text-plt-accent">{runningCount} active</span>}
              {hasDone && (
                <button onClick={clearDone} className="text-[9px] text-plt-muted hover:text-plt-warning transition-colors font-medium">
                  Clear done
                </button>
              )}
            </div>
          </div>
          {visibleJobs.map(job => {
            const isSelected = job.id === selectedId;
            const isRunning = job.status === "running";
            const context = [job.meta?.market || job.meta?.zip, job.meta?.scrape_type].filter(Boolean).join(" · ") || "—";
            const timeStr = job.started_at
              ? new Date(job.started_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
              : "";
            const statusColor = isRunning ? "text-plt-accent" : job.status === "completed" ? "text-plt-success" : job.status === "failed" ? "text-plt-danger" : "text-plt-muted";
            return (
              <div
                key={job.id}
                onClick={() => setSelectedId(job.id)}
                className={`flex items-center gap-2 sm:gap-3 px-3 py-2 cursor-pointer transition-colors border-t border-plt-border/30 ${
                  isSelected ? "bg-plt-accent/10 border-l-2 border-l-plt-accent" : "hover:bg-plt-accent/5"
                }`}
              >
                <StatusDot status={job.status} />
                <span className="font-mono text-[10px] text-plt-primary font-semibold w-10 flex-shrink-0">{job.type}</span>
                <span className="text-[10px] text-plt-muted flex-1 truncate min-w-0">{context}</span>
                <span className="text-[9px] font-mono text-plt-muted flex-shrink-0 hidden sm:block">{timeStr}</span>
                <span className={`text-[9px] font-mono flex-shrink-0 ${statusColor}`}>{job.status}</span>
                {isRunning && (
                  <button
                    onClick={e => stopJob(e, job.id)}
                    disabled={stopping[job.id]}
                    className="flex-shrink-0 text-[9px] font-bold px-2 py-0.5 rounded border border-plt-danger/60 text-plt-danger hover:bg-plt-danger hover:text-white transition-all disabled:opacity-40"
                  >
                    {stopping[job.id] ? "…" : "Stop"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Log viewer */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 sm:px-6 sm:py-4 font-mono text-[10px] sm:text-[11px] leading-relaxed">
        {!selectedJob && jobs.length === 0 && (
          <span className="text-plt-muted opacity-40">No jobs yet — trigger a scrape or ML run.</span>
        )}
        {!selectedJob && jobs.length > 0 && (
          <span className="text-plt-muted opacity-40">Select a job above to view its output.</span>
        )}
        {selectedJob?.logs?.map((line, i) => {
          const lower = line.toLowerCase();
          let color = "text-plt-muted", weight = "font-normal";
          if (line.includes("[FAIL]") || lower.includes("failed") || lower.includes("error")) { color = "text-plt-danger"; weight = "font-medium"; }
          else if (line.includes("[SKIP]")) { color = "text-plt-warning"; }
          else if (line.includes("[LOAD]")) { color = "text-plt-success"; weight = "font-medium"; }
          else if (line.includes("[EXEC]")) { color = "text-plt-accent"; weight = "font-semibold"; }
          else if (line.includes("[NETW]")) { color = "text-blue-400"; }
          else if (line.includes("[WARN]") || lower.includes("retry") || lower.includes("retrying")) { color = "text-plt-warning"; weight = "font-medium"; }
          return (
            <div key={i} className={`${color} ${weight} break-all whitespace-pre-wrap mb-1 flex gap-2 sm:gap-4 hover:bg-plt-accent/5 transition-colors`}>
              <span className="opacity-30 select-none w-6 sm:w-8 text-[9px] flex-shrink-0">{(i + 1).toString().padStart(3, "0")}</span>
              <span className="flex-1">{line}</span>
            </div>
          );
        })}
        {selectedJob?.status === "running" && <div className="text-plt-accent mt-2 animate-pulse font-mono ml-12">▌</div>}
      </div>
    </div>
  );
}

function HUD({ mlStatus, scrapeStatus }) {
  const soldTotal = scrapeStatus.filter(r => r.listing_type === 'sold').reduce((s, r) => s + parseInt(r.property_count), 0);
  const forSaleTotal = scrapeStatus.filter(r => r.listing_type === 'for_sale').reduce((s, r) => s + parseInt(r.property_count), 0);
  const unscored = mlStatus?.counts?.for_sale?.unscored ?? 0;
  const r2 = mlStatus?.train?.r2_score;

  const stats = [
    { label: "Historical", val: soldTotal.toLocaleString(), green: soldTotal > 0 },
    { label: "Active", val: forSaleTotal.toLocaleString(), green: forSaleTotal > 0 },
    { label: "Unscored", val: unscored.toLocaleString(), yellow: unscored > 0 },
    { label: "Precision", val: r2 ? parseFloat(r2).toFixed(4) : "None", green: r2 > 0.8, yellow: r2 > 0 && r2 <= 0.8 },
    { label: "State", val: mlStatus?.train?.status ? mlStatus.train.status.charAt(0).toUpperCase() + mlStatus.train.status.slice(1) : "Idle", mono: true },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 border border-plt-border bg-plt-panel divide-x divide-plt-border rounded overflow-hidden">
      {stats.map(s => (
        <div key={s.label} className="px-3 py-3 sm:px-5 sm:py-4">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-plt-muted mb-1.5">{s.label}</div>
          <Val mono lg green={s.green} yellow={s.yellow}>{s.val}</Val>
        </div>
      ))}
    </div>
  );
}

// ── Train Modal ───────────────────────────────────────────────────────

function TrainModal({ onClose, onJob }) {
  const DEFAULTS = { n_estimators: 1000, max_depth: 6, lr: 0.05, min_year_built: 2015, test_split: 0.20 };
  const [params, setParams] = useState(DEFAULTS);
  const [running, setRunning] = useState(false);

  const set = (k, v) => setParams(p => ({ ...p, [k]: v }));

  const submit = async () => {
    setRunning(true);
    try {
      const res = await fetch(`${API}/api/ml/train`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      const data = await res.json();
      if (data.job_id) onJob(data.job_id);
    } catch {}
    setRunning(false);
    onClose();
  };

  const fields = [
    {
      key: "n_estimators",
      label: "Estimators",
      min: 100, max: 5000, step: 100,
      hint: "Number of decision trees in the ensemble. More trees = higher accuracy but longer training time. 1000 is a solid default. Lower to 200–300 for a quick test run; raise to 2000–3000 only if your dataset is large (1000+ new builds) and R² is plateauing.",
      tradeoff: "↑ Higher → more accurate, slower   ↓ Lower → faster, less precise",
    },
    {
      key: "max_depth",
      label: "Max Tree Depth",
      min: 2, max: 15, step: 1,
      hint: "How many levels deep each tree can branch. Deeper trees can model complex interactions between sqft, lot size, and income — but too deep and the model memorizes training data instead of learning patterns.",
      tradeoff: "↑ Higher → captures more nuance, risk of overfit   ↓ Lower → simpler model, generalizes better",
    },
    {
      key: "lr",
      label: "Learning Rate",
      min: 0.001, max: 0.5, step: 0.001,
      hint: "How aggressively each new tree corrects the previous trees' errors. Pairs with Estimators: a lower learning rate needs more trees to converge, but usually produces a more robust model. If you lower this, raise Estimators proportionally.",
      tradeoff: "↑ Higher → trains faster, may overshoot   ↓ Lower → more stable, needs more estimators",
    },
    {
      key: "min_year_built",
      label: "Min Year Built (training set)",
      min: 1990, max: 2023, step: 1,
      hint: "Only homes built this year or later are used as training examples. The model learns what a newly-built home is worth by studying these recent sales. Set lower (e.g. 2010) to include more training records when data is scarce; set higher (e.g. 2018) to reflect only the most current construction pricing.",
      tradeoff: "↑ Higher → reflects latest pricing trends, fewer training rows   ↓ Lower → more training data, older price signals mixed in",
    },
    {
      key: "test_split",
      label: "Test Split",
      min: 0.10, max: 0.40, step: 0.01,
      hint: "Fraction of training data held back to evaluate the model — this is what produces the R² score you see in the model card. Does not affect what gets scored afterward. With small datasets (< 200 records) keep this at 0.15–0.20 so you have enough training rows.",
      tradeoff: "↑ Higher → more reliable R² estimate, less training data   ↓ Lower → trains on more data, R² less reliable",
    },
  ];

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-plt-panel border border-plt-border rounded shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-plt-border flex-shrink-0">
          <div>
            <span className="text-sm font-semibold text-plt-primary">Train ML Model</span>
            <p className="text-[10px] text-plt-muted mt-0.5">XGBoost · predicts rebuilt home value from sqft, lot size &amp; area income</p>
          </div>
          <button onClick={onClose} className="text-plt-muted hover:text-plt-danger transition-colors p-1 flex-shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Scrollable fields */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {fields.map(f => (
            <div key={f.key} className="bg-plt-bg/50 border border-plt-border/60 rounded p-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold text-plt-primary">{f.label}</span>
                <input
                  type="number"
                  value={params[f.key]}
                  min={f.min}
                  max={f.max}
                  step={f.step}
                  onChange={e => set(f.key, parseFloat(e.target.value))}
                  className="w-28 h-7 px-2 text-xs font-mono text-right flex-shrink-0"
                />
              </div>
              <p className="text-[11px] text-plt-muted leading-relaxed">{f.hint}</p>
              <div className="text-[10px] font-mono text-plt-muted/70 bg-plt-border/20 rounded px-2 py-1">{f.tradeoff}</div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-5 py-4 border-t border-plt-border flex-shrink-0">
          <button
            onClick={submit}
            disabled={running}
            className="flex-1 text-xs font-semibold py-2.5 rounded bg-plt-accent text-white hover:brightness-110 disabled:opacity-40 transition-all"
          >
            {running ? "Starting…" : "Train Model"}
          </button>
          <button
            onClick={onClose}
            className="flex-1 text-xs font-semibold py-2.5 rounded border border-plt-border text-plt-primary hover:border-plt-accent hover:text-plt-accent transition-all"
          >
            Cancel
          </button>
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
  const [throttle, setThrottle] = useState(10);  // default: Balanced
  const [forceRenew, setForceRenew] = useState(false);
  const [running, setRunning] = useState({});

  const trigger = async (type, params = {}) => {
    setRunning(p => ({ ...p, [type]: true }));
    const body = { type, market, throttle, force_renew: forceRenew, all_zips: true, ...params };
    const res = await fetch(`${API}/api/scrape/trigger`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    if (data.job_id) onJob(data.job_id);
    setRunning(p => ({ ...p, [type]: false }));
  };

  return (
    <div className="space-y-5 sm:space-y-8">
      <div className="grid grid-cols-2 gap-2 sm:gap-4">
        <div><Label>Market</Label><select value={market} onChange={e => setMarket(e.target.value)} className="w-full h-9 sm:h-10 px-2 sm:px-3 text-xs"><option value="all">All Markets</option>{MARKETS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}</select></div>
        <div><Label>Request Speed</Label><select value={throttle} onChange={e => setThrottle(parseInt(e.target.value))} className="w-full h-9 sm:h-10 px-2 sm:px-3 text-xs"><option value="5">Fast (5s)</option><option value="10">Balanced (10s)</option><option value="30">Safe (30s)</option></select></div>
      </div>

      <div className="flex items-center gap-3 py-2 border-y border-plt-border/50">
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={forceRenew} onChange={e => setForceRenew(e.target.checked)} className="w-4 h-4 accent-plt-accent" />
          <span className="text-xs text-plt-muted">Re-fetch existing data</span>
        </label>
      </div>

      <div className="space-y-4 sm:space-y-6">
        <div><Label>Active Listings</Label><Btn variant="success" disabled={running.for_sale} onClick={() => trigger("for_sale")}>{running.for_sale ? "Running..." : "Sync Active Listings"}</Btn></div>
        <div className="space-y-3">
          <Label>Sales History Range</Label>
          <div className="grid grid-cols-2 gap-2"><input type="month" value={start} onChange={e => setStart(e.target.value)} className="w-full h-9 px-2 text-xs" /><input type="month" value={end} onChange={e => setEnd(e.target.value)} className="w-full h-9 px-2 text-xs" /></div>
          <Btn disabled={running.sold} onClick={() => trigger("sold", { start, end })}>{running.sold ? "Running..." : "Sync Sold History"}</Btn>
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
  const [editFields, setEditFields] = useState({});  // { [modelId]: { name, description } }
  const [showTrainModal, setShowTrainModal] = useState(false);

  const trigger = async (endpoint) => {
    setRunning(p => ({ ...p, [endpoint]: true }));
    const res = await fetch(`${API}/api/ml/${endpoint}`, { method: "POST" });
    const data = await res.json();
    if (data.job_id) onJob(data.job_id);
    setRunning(p => ({ ...p, [endpoint]: false }));
  };

  const fetchModels = async () => {
    try {
      const data = await fetch(`${API}/api/ml/models`).then(r => r.json());
      if (Array.isArray(data)) {
        setModels(data);
        // Seed editFields for any new models not yet tracked
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
    try {
      await fetch(`${API}/api/ml/models/${modelId}/activate`, { method: "POST" });
      await fetchModels();
    } catch {}
    setActivating(null);
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
    <div className="space-y-5 sm:space-y-6">

      {/* Model list */}
      <div className="space-y-2">
        <Label>Trained Models</Label>
        {models.length === 0 ? (
          <div className="text-[10px] text-plt-muted opacity-50 py-3 text-center border border-plt-border/30 rounded">
            No models yet — train one below
          </div>
        ) : (
          <div className="border border-plt-border rounded overflow-hidden divide-y divide-plt-border/50">
            {models.map(m => {
              const ctx = m.training_context || {};
              const isActive = m.is_active;
              const isExpanded = expandedId === m.id;
              const dateStr = m.started_at
                ? new Date(m.started_at).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })
                : "—";
              const r2 = m.r2_score ? parseFloat(m.r2_score).toFixed(4) : "n/a";
              const r2Color = parseFloat(m.r2_score) > 0.8 ? "text-plt-success" : parseFloat(m.r2_score) > 0.5 ? "text-plt-warning" : "text-plt-muted";

              const cities = ctx.cities?.length ? ctx.cities.join(", ") : ctx.zip_codes?.slice(0, 3).join(", ") || "—";
              const dateRange = ctx.sold_date_from && ctx.sold_date_to
                ? `${ctx.sold_date_from} – ${ctx.sold_date_to}`
                : null;
              const props = m.properties_trained ? parseInt(m.properties_trained).toLocaleString() : "—";
              const displayName = m.name || `Model #${m.id}`;
              const edit = editFields[m.id] || { name: "", description: "" };

              // Feature importances from training_context
              const importances = ctx.feature_importances
                ? Object.entries(ctx.feature_importances).sort((a, b) => b[1] - a[1])
                : null;

              return (
                <div
                  key={m.id}
                  className={`transition-colors ${isActive ? "bg-plt-accent/8 border-l-2 border-l-plt-accent" : ""}`}
                >
                  {/* Collapsed header row */}
                  <div
                    className={`px-3 py-2.5 flex items-start justify-between gap-2 cursor-pointer ${!isExpanded ? "hover:bg-plt-accent/5" : ""}`}
                    onClick={() => setExpandedId(isExpanded ? null : m.id)}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-0.5 ${isActive ? "bg-plt-success shadow-[0_0_6px_var(--plt-success)]" : "bg-plt-border"}`} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-[10px] text-plt-primary font-semibold">{displayName}</span>
                          <span className="text-[9px] text-plt-muted">{dateStr}</span>
                          <span className={`font-mono text-[10px] font-bold ${r2Color}`}>R² {r2}</span>
                        </div>
                        <div className="text-[10px] text-plt-muted mt-0.5 truncate">{cities} · {props} props</div>
                        {dateRange && <div className="text-[9px] text-plt-muted/70 mt-0.5">{dateRange}</div>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {isActive ? (
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-plt-success/15 text-plt-success border border-plt-success/30">Active</span>
                      ) : (
                        <button
                          onClick={e => { e.stopPropagation(); activateModel(m.id); }}
                          disabled={activating === m.id}
                          className="text-[9px] font-semibold px-2 py-0.5 rounded border border-plt-border text-plt-muted hover:border-plt-accent hover:text-plt-accent transition-all disabled:opacity-40"
                        >
                          {activating === m.id ? "…" : "Use"}
                        </button>
                      )}
                      {/* Chevron */}
                      <svg className={`w-3 h-3 text-plt-muted transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>

                  {/* Expanded panel */}
                  {isExpanded && (
                    <div className="px-3 pb-4 pt-1 bg-plt-bg/40 border-t border-plt-border/40 space-y-4">
                      {/* Name / Description */}
                      <div className="space-y-2">
                        <div>
                          <label className="text-[9px] font-semibold uppercase tracking-wider text-plt-muted block mb-1">Name</label>
                          <input
                            type="text"
                            value={edit.name}
                            onChange={e => setEditFields(p => ({ ...p, [m.id]: { ...p[m.id], name: e.target.value } }))}
                            onBlur={() => patchModel(m.id)}
                            placeholder={`Model #${m.id}`}
                            className="w-full h-7 px-2 text-[11px] bg-plt-panel border border-plt-border rounded focus:border-plt-accent outline-none text-plt-primary"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] font-semibold uppercase tracking-wider text-plt-muted block mb-1">Description</label>
                          <textarea
                            value={edit.description}
                            onChange={e => setEditFields(p => ({ ...p, [m.id]: { ...p[m.id], description: e.target.value } }))}
                            onBlur={() => patchModel(m.id)}
                            placeholder="e.g. Full market, 1,847 new builds"
                            rows={2}
                            className="w-full px-2 py-1.5 text-[11px] bg-plt-panel border border-plt-border rounded focus:border-plt-accent outline-none text-plt-primary resize-none"
                          />
                        </div>
                      </div>

                      {/* Feature Importances */}
                      {importances && (
                        <div>
                          <div className="text-[9px] font-semibold uppercase tracking-wider text-plt-muted mb-2">Feature Importances</div>
                          <div className="space-y-1.5">
                            {importances.map(([feat, imp]) => (
                              <div key={feat} className="flex items-center gap-2">
                                <span className="text-[10px] text-plt-muted font-mono w-36 flex-shrink-0 truncate">{feat}</span>
                                <div className="flex-1 h-2 bg-plt-border/40 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-plt-accent rounded-full"
                                    style={{ width: `${(imp * 100).toFixed(0)}%` }}
                                  />
                                </div>
                                <span className="text-[10px] font-mono text-plt-primary w-8 text-right">{(imp * 100).toFixed(0)}%</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Hyperparameters */}
                      {(ctx.n_estimators || ctx.train_rows) && (
                        <div>
                          <div className="text-[9px] font-semibold uppercase tracking-wider text-plt-muted mb-1.5">Hyperparameters</div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-mono text-plt-muted">
                            {ctx.n_estimators && <span>Estimators: <span className="text-plt-primary">{ctx.n_estimators}</span></span>}
                            {ctx.max_depth && <span>Depth: <span className="text-plt-primary">{ctx.max_depth}</span></span>}
                            {ctx.learning_rate && <span>LR: <span className="text-plt-primary">{ctx.learning_rate}</span></span>}
                            {ctx.train_rows && <span>Train: <span className="text-plt-primary">{ctx.train_rows.toLocaleString()}</span></span>}
                            {ctx.test_rows && <span>Test: <span className="text-plt-primary">{ctx.test_rows.toLocaleString()}</span></span>}
                          </div>
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

      {/* Train */}
      {showTrainModal && (
        <TrainModal
          onClose={() => setShowTrainModal(false)}
          onJob={jobId => { onJob(jobId); }}
        />
      )}
      <div className="space-y-3 pt-2 border-t border-plt-border/50">
        <div className="flex justify-between items-center">
          <Label>Train New Model</Label>
          <StatusDot status={mlStatus?.train?.status} />
        </div>
        <Btn onClick={() => setShowTrainModal(true)}>
          Train ML Model
        </Btn>
      </div>

      {/* Score */}
      <div className="space-y-3 border-t border-plt-border/50 pt-2">
        <div className="flex justify-between items-center">
          <Label>Score Properties</Label>
          <StatusDot status={mlStatus?.score?.status} />
        </div>
        {activeModel && (
          <div className="text-[9px] text-plt-muted font-mono bg-plt-bg/50 border border-plt-border/50 rounded px-2 py-1.5">
            Using Model #{activeModel.id} · R² {parseFloat(activeModel.r2_score || 0).toFixed(4)}
          </div>
        )}
        <Btn disabled={running.score || !activeModel} onClick={() => trigger("score")}>
          {running.score ? "Scoring…" : activeModel ? "Score with Active Model" : "No Active Model"}
        </Btn>
      </div>

    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────

export default function Operations() {
  const [mlStatus, setMlStatus] = useState(null);
  const [scrapeStatus, setScrapeStatus] = useState([]);
  const [activeJobId, setActiveJobId] = useState(null);
  const [activeTab, setActiveTab] = useState("controls");
  const pollRef = useRef(null);

  const fetchStatus = useCallback(async () => {
    try {
      const [ml, sc] = await Promise.all([
        fetch(`${API}/api/ml/status`).then(r => r.json()),
        fetch(`${API}/api/scrape/status`).then(r => r.json()),
      ]);
      setMlStatus(ml); setScrapeStatus(sc.scrape_status || []);
    } catch {}
  }, []);

  useEffect(() => {
    fetchStatus(); pollRef.current = setInterval(fetchStatus, 10000);
    return () => clearInterval(pollRef.current);
  }, [fetchStatus]);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-plt-bg text-plt-primary">
      <div className="flex-shrink-0 p-3 sm:p-6"><HUD mlStatus={mlStatus} scrapeStatus={scrapeStatus} /></div>

      {/* Mobile tab bar */}
      <div className="lg:hidden flex-shrink-0 flex border-b border-plt-border bg-plt-panel px-3">
        {[{ id: "controls", label: "Controls" }, { id: "console", label: "Console" }].map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex-1 py-2.5 text-xs font-semibold transition-all border-b-2 ${
              activeTab === t.id
                ? "border-plt-accent text-plt-accent"
                : "border-transparent text-plt-muted hover:text-plt-primary"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden px-3 pb-3 sm:px-6 sm:pb-6 pt-3 gap-4 sm:gap-6">
        <div className={`w-full lg:w-[380px] flex flex-col gap-4 sm:gap-6 overflow-y-auto no-scrollbar pb-4 lg:pb-0 ${activeTab === "console" ? "hidden lg:flex" : "flex"}`}>
          <Panel title="Data Collection" tag="PROXIED"><IngestionControls onJob={setActiveJobId} /></Panel>
          <Panel title="ML Model" tag="XGBOOST"><IntelControls mlStatus={mlStatus} onJob={setActiveJobId} /></Panel>
          <div className="border border-plt-danger/20 rounded p-4 sm:p-5 bg-plt-danger/5"><h3 className="text-xs font-semibold text-plt-danger mb-3">Reset Database</h3><button onClick={() => window.confirm("This clears all properties, ML scores, and scrape history from the database.\n\nYour Docker volume is NOT deleted — data only disappears permanently if you run 'docker compose down -v'. Continue?") && fetch(`${API}/api/scrape/reset`, { method: "POST" }).then(() => window.location.reload())} className="w-full text-xs font-medium text-plt-danger hover:bg-plt-danger hover:text-white border border-plt-danger/50 py-2.5 rounded transition-all">Wipe All Data</button></div>
        </div>
        <div className={`flex-1 min-h-[280px] sm:min-h-[400px] ${activeTab === "controls" ? "hidden lg:block" : "flex flex-col"}`}>
          <JobConsole newJobId={activeJobId} onClear={() => setActiveJobId(null)} />
        </div>
      </div>
    </div>
  );
}
