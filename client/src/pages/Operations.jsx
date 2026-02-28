import { useState, useEffect, useCallback, useRef } from "react";

const API = "";

const MARKETS = [
  { value: "tampa", label: "Tampa", zips: ["33606", "33629", "33611"] },
  { value: "orlando", label: "Orlando", zips: ["32803", "32806"] },
  { value: "winter_garden", label: "Winter Garden", zips: ["34787"] },
  { value: "winter_park", label: "Winter Park", zips: ["32789", "32792"] },
];

// ── Shared primitives ────────────────────────────────────────────────

function Label({ children }) {
  return <span className="text-xs font-mono uppercase tracking-widest text-plt-muted">{children}</span>;
}

function Val({ children, green, yellow, red, mono }) {
  const color = green ? "text-plt-green" : yellow ? "text-yellow-400" : red ? "text-red-400" : "text-plt-primary";
  return <span className={`${color} ${mono ? "font-mono" : ""}`}>{children}</span>;
}

function PanelCard({ title, tag, children, className = "" }) {
  return (
    <div className={`bg-plt-panel border border-plt-border flex flex-col ${className}`}>
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-plt-border flex-shrink-0">
        <span className="text-xs font-mono font-semibold uppercase tracking-widest text-plt-secondary">{title}</span>
        {tag && <span className="text-xs font-mono text-plt-muted">{tag}</span>}
      </div>
      <div className="p-4 flex-1 min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}

function StatusDot({ status }) {
  const map = {
    running:   "bg-blue-400 animate-pulse",
    completed: "bg-plt-green status-dot-active",
    failed:    "bg-red-500",
    pending:   "bg-yellow-500 animate-pulse",
    idle:      "bg-plt-muted",
  };
  return <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${map[status] || map.idle}`} />;
}

function Btn({ children, onClick, disabled, variant = "primary", small }) {
  const base = `font-mono text-xs uppercase tracking-widest transition-all border disabled:opacity-40 disabled:cursor-not-allowed ${small ? "px-3 py-1" : "px-4 py-2"}`;
  const variants = {
    primary: "bg-plt-green/10 border-plt-green text-plt-green hover:bg-plt-green/20",
    ghost:   "bg-transparent border-plt-border text-plt-secondary hover:border-plt-green hover:text-plt-green",
    danger:  "bg-red-500/10 border-red-500 text-red-400 hover:bg-red-500/20",
    blue:    "bg-blue-500/10 border-blue-500 text-blue-400 hover:bg-blue-500/20",
  };
  return (
    <button className={`${base} ${variants[variant]}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

function Select({ value, onChange, options, className = "" }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`bg-plt-bg border border-plt-border text-plt-primary font-mono text-xs px-3 py-2 focus:outline-none focus:border-plt-green ${className}`}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

// ── Job console ───────────────────────────────────────────────────────

function JobConsole({ jobId, onClear }) {
  const [job, setJob] = useState(null);
  const [stopping, setStopping] = useState(false);
  const scrollRef = useRef(null);
  const intervalRef = useRef(null);

  const poll = useCallback(async () => {
    if (!jobId) return;
    try {
      const res = await fetch(`${API}/api/jobs/${jobId}`);
      const data = await res.json();
      setJob(data);
      if (data.status === "completed" || data.status === "failed") {
        clearInterval(intervalRef.current);
      }
    } catch {}
  }, [jobId]);

  useEffect(() => {
    if (!jobId) { setJob(null); return; }
    setStopping(false);
    poll();
    intervalRef.current = setInterval(poll, 1200);
    return () => clearInterval(intervalRef.current);
  }, [jobId, poll]);

  useEffect(() => {
    if (scrollRef.current) {
      const { scrollHeight, clientHeight } = scrollRef.current;
      scrollRef.current.scrollTo({ top: scrollHeight - clientHeight, behavior: "smooth" });
    }
  }, [job?.logs?.length]);

  const stopJob = async () => {
    if (!jobId) return;
    setStopping(true);
    try {
      await fetch(`${API}/api/jobs/${jobId}/stop`, { method: "POST" });
      setTimeout(poll, 500);
    } catch (err) {
      console.error("Failed to stop job", err);
    } finally {
      setStopping(false);
    }
  };

  const statusColor = {
    running: "text-blue-400", completed: "text-plt-green",
    failed: "text-red-400", pending: "text-yellow-400",
  };

  return (
    <div className="flex flex-col h-full bg-plt-bg border border-plt-border overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-plt-border bg-plt-panel flex-shrink-0">
        <div className="flex items-center gap-2">
          {job && <StatusDot status={job.status} />}
          <span className="text-xs font-mono text-plt-muted">
            {job ? (
              <span className={statusColor[job.status]}>{job.status?.toUpperCase()}</span>
            ) : "IDLE"}
            {jobId && <span className="text-plt-muted ml-2">#{jobId}</span>}
          </span>
        </div>
        <div className="flex gap-3">
          {job?.status === "running" && (
            <button 
              onClick={stopJob} 
              disabled={stopping}
              className="text-red-400 hover:text-red-300 text-[10px] font-mono border border-red-900/50 px-2 py-0.5 rounded bg-red-950/20"
            >
              {stopping ? "STOPPING..." : "STOP PROCESS"}
            </button>
          )}
          {onClear && (
            <button onClick={onClear} className="text-plt-muted hover:text-plt-secondary text-xs font-mono">CLR</button>
          )}
        </div>
      </div>

      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-3 console-log bg-plt-bg font-mono text-[11px] space-y-0.5"
      >
        {!job && (
          <div className="text-plt-muted italic">
            <span className="text-plt-green mr-1">›</span> Awaiting job input...
            <span className="animate-blink ml-1">_</span>
          </div>
        )}
        {job?.logs?.map((line, i) => {
          const lower = line.toLowerCase();
          const isError = lower.includes("error") || lower.includes("failed");
          const isWarn = lower.includes("warn") || lower.includes("[skip]");
          const isInfo = line.includes("[scraper") || line.includes("[ml") || line.includes("[db") || line.includes("[census");
          const isSkip = lower.includes("[skip]");
          const isDown = lower.includes("[down]");
          
          let color = "text-plt-secondary";
          if (isError) color = "text-red-400";
          else if (isSkip) color = "text-yellow-500 font-bold";
          else if (isWarn) color = "text-yellow-400";
          else if (isDown) color = "text-blue-400";
          else if (isInfo) color = "text-plt-green";

          return (
            <div key={i} className={`${color} break-all whitespace-pre-wrap`}>
              {line}
            </div>
          );
        })}
        {job?.status === "running" && (
          <div className="text-blue-400 mt-1">
            <span className="animate-blink">█</span>
          </div>
        )}
        {job?.status === "completed" && (
          <div className="text-plt-green mt-2 font-bold">› Process exited 0</div>
        )}
        {job?.status === "failed" && (
          <div className="text-red-400 mt-2 font-bold">› Process exited {job.returncode ?? 1}</div>
        )}
      </div>
    </div>
  );
}

// ── Section: Inventory counts ─────────────────────────────────────────

function InventoryBar({ mlStatus, scrapeStatus }) {
  const soldTotal = scrapeStatus
    .filter((r) => r.listing_type === "sold")
    .reduce((s, r) => s + parseInt(r.property_count), 0);
  const forSaleTotal = scrapeStatus
    .filter((r) => r.listing_type === "for_sale")
    .reduce((s, r) => s + parseInt(r.property_count), 0);
  const unscored = mlStatus?.counts?.for_sale?.unscored ?? 0;
  const r2 = mlStatus?.train?.r2_score;

  const stats = [
    { label: "Sold", value: soldTotal.toLocaleString(), green: soldTotal > 0 },
    { label: "Active", value: forSaleTotal.toLocaleString(), green: forSaleTotal > 0 },
    { label: "Unscored", value: unscored, yellow: unscored > 0, green: unscored === 0 && forSaleTotal > 0 },
    { label: "Model R²", value: r2 ? parseFloat(r2).toFixed(3) : "—", green: r2 > 0.7, yellow: r2 > 0 && r2 <= 0.7 },
    { label: "Status", value: mlStatus?.train?.status?.toUpperCase() ?? "IDLE",
      green: mlStatus?.train?.status === "completed", red: mlStatus?.train?.status === "failed" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 border border-plt-border bg-plt-panel">
      {stats.map((s, i) => (
        <div key={s.label} className={`px-3 md:px-4 py-2 md:py-3 border-plt-border ${i % 2 !== 0 ? 'border-l' : ''} ${i >= 2 ? 'border-t md:border-t-0' : ''} ${i > 0 && i < 5 ? 'md:border-l' : ''}`}>
          <div className="text-[9px] md:text-xs font-mono uppercase tracking-widest text-plt-muted mb-0.5">{s.label}</div>
          <div className={`text-sm md:text-lg font-mono font-semibold truncate ${
            s.green ? "text-plt-green" : s.yellow ? "text-plt-warning" : s.red ? "text-plt-danger" : "text-plt-primary"
          }`}>{s.value}</div>
        </div>
      ))}
    </div>
  );
}

// ── Section: Pipeline controls ────────────────────────────────────────

function PipelineControls({ onJob, activeJobId }) {
  const [market, setMarket] = useState("tampa");
  const [start, setStart] = useState("2022-01");
  const [end, setEnd] = useState("2024-12");
  const [forceRenew, setForceRenew] = useState(false);
  const [allZips, setAllZips] = useState(false);
  const [running, setRunning] = useState({});

  const run = async (label, fetchFn) => {
    setRunning((p) => ({ ...p, [label]: true }));
    try {
      const res = await fetchFn();
      const data = await res.json();
      if (data.job_id) onJob(data.job_id, label);
    } catch (err) {
      console.error(label, err);
    } finally {
      setRunning((p) => ({ ...p, [label]: false }));
    }
  };

  const marketOpts = [{ value: "all", label: "All Markets" }, ...MARKETS.map((m) => ({ value: m.value, label: m.label }))];

  return (
    <PanelCard title="Pipeline" tag="DATA INGESTION" className="h-full">
      <div className="space-y-5">
        {/* Market selector */}
        <div>
          <Label>Market</Label>
          <Select
            value={market}
            onChange={setMarket}
            options={marketOpts}
            className="w-full mt-1.5"
          />
        </div>

        {/* Options */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input 
              type="checkbox" 
              id="force-renew"
              checked={forceRenew}
              onChange={(e) => setForceRenew(e.target.checked)}
              className="w-3.5 h-3.5 accent-plt-green bg-plt-bg dark:bg-plt-bg border-plt-border rounded"
            />
            <label htmlFor="force-renew" className="text-[10px] font-mono uppercase tracking-wider text-plt-secondary cursor-pointer">
              Force Fresh Scrape (ignore DB)
            </label>
          </div>
          <div className="flex items-center gap-2">
            <input 
              type="checkbox" 
              id="all-zips"
              checked={allZips}
              onChange={(e) => setAllZips(e.target.checked)}
              className="w-3.5 h-3.5 accent-plt-green bg-plt-bg dark:bg-plt-bg border-plt-border rounded"
            />
            <label htmlFor="all-zips" className="text-[10px] font-mono uppercase tracking-wider text-plt-secondary cursor-pointer">
              Explore ALL city ZIPs
            </label>
          </div>
        </div>

        {/* Scrape For Sale */}
        <div className="space-y-2">
          <Btn
            variant="primary"
            disabled={running["for_sale"]}
            onClick={() => run("for_sale", () =>
              fetch(`${API}/api/scrape/trigger`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ type: "for_sale", market, force_renew: forceRenew, all_zips: allZips }),
              })
            )}
          >
            {running["for_sale"] ? "▶ Running…" : "▶ Fetch Listings"}
          </Btn>
        </div>

        <div className="border-t border-plt-border" />

        {/* Scrape Sold History */}
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Start</Label>
              <input
                type="month"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="w-full mt-1.5 bg-plt-bg border border-plt-border text-plt-primary font-mono text-xs px-3 py-2 focus:outline-none focus:border-plt-green"
              />
            </div>
            <div>
              <Label>End</Label>
              <input
                type="month"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="w-full mt-1.5 bg-plt-bg border border-plt-border text-plt-primary font-mono text-xs px-3 py-2 focus:outline-none focus:border-plt-green"
              />
            </div>
          </div>
          <Btn
            variant="ghost"
            disabled={running["sold"]}
            onClick={() => run("sold", () =>
              fetch(`${API}/api/scrape/trigger`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ type: "sold", market, start, end, force_renew: forceRenew, all_zips: allZips }),
              })
            )}
          >
            {running["sold"] ? "▶ Running…" : "▶ Scrape Sold Data"}
          </Btn>
        </div>

        <div className="border-t border-plt-border" />

        {/* Census */}
        <div className="space-y-2">
          <Btn
            variant="ghost"
            disabled={running["census"]}
            onClick={() => run("census", () =>
              fetch(`${API}/api/ml/census`, { method: "POST" })
            )}
          >
            {running["census"] ? "▶ Running…" : "▶ Fetch Census Data"}
          </Btn>
        </div>
      </div>
    </PanelCard>
  );
}

// ── Section: ML controls ──────────────────────────────────────────────

function MLControls({ mlStatus, onJob }) {
  const [running, setRunning] = useState({});

  const run = async (label, fetchFn) => {
    setRunning((p) => ({ ...p, [label]: true }));
    try {
      const res = await fetchFn();
      const data = await res.json();
      if (data.job_id) onJob(data.job_id, label);
    } catch (err) {
      console.error(label, err);
    } finally {
      setRunning((p) => ({ ...p, [label]: false }));
    }
  };

  const trainRun = mlStatus?.train;
  const scoreRun = mlStatus?.score;

  return (
    <PanelCard title="ML Model" tag="XGBOOST" className="h-full">
      <div className="space-y-5">
        {/* Train */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Train Model</Label>
            {trainRun && <StatusDot status={trainRun.status} />}
          </div>
          {trainRun && (
            <div className="bg-plt-bg border border-plt-border p-3 space-y-1">
              {trainRun.r2_score && (
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-plt-muted">R² score</span>
                  <Val green={trainRun.r2_score > 0.7} yellow={trainRun.r2_score <= 0.7} mono>
                    {parseFloat(trainRun.r2_score).toFixed(4)}
                  </Val>
                </div>
              )}
              {trainRun.properties_trained && (
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-plt-muted">Training rows</span>
                  <Val mono>{parseInt(trainRun.properties_trained).toLocaleString()}</Val>
                </div>
              )}
            </div>
          )}
          <Btn
            variant="primary"
            disabled={running["train"]}
            onClick={() => run("train", () => fetch(`${API}/api/ml/train`, { method: "POST" }))}
          >
            {running["train"] ? "▶ Training…" : "▶ Train Model"}
          </Btn>
        </div>

        <div className="border-t border-plt-border" />

        {/* Score */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Score Listings</Label>
            {scoreRun && <StatusDot status={scoreRun.status} />}
          </div>
          {mlStatus?.counts?.for_sale && (
            <div className="text-xs font-mono text-plt-muted">
              {mlStatus.counts.for_sale.unscored > 0
                ? <Val yellow mono>{mlStatus.counts.for_sale.unscored} unscored listings</Val>
                : <Val green mono>All listings scored</Val>
              }
            </div>
          )}
          <Btn
            variant="blue"
            disabled={running["score"]}
            onClick={() => run("score", () => fetch(`${API}/api/ml/score`, { method: "POST" }))}
          >
            {running["score"] ? "▶ Scoring…" : "▶ Score Listings"}
          </Btn>
        </div>
      </div>
    </PanelCard>
  );
}

// ── Root ──────────────────────────────────────────────────────────────

export default function Operations() {
  const [mlStatus, setMlStatus] = useState(null);
  const [scrapeStatus, setScrapeStatus] = useState([]);
  const [activeJobId, setActiveJobId] = useState(null);
  const [activeJobLabel, setActiveJobLabel] = useState(null);
  const pollRef = useRef(null);

  const fetchStatus = useCallback(async () => {
    try {
      const [ml, sc] = await Promise.all([
        fetch(`${API}/api/ml/status`).then((r) => r.json()),
        fetch(`${API}/api/scrape/status`).then((r) => r.json()),
      ]);
      setMlStatus(ml);
      setScrapeStatus(sc.scrape_status || []);
    } catch {}
  }, []);

  useEffect(() => {
    fetchStatus();
    pollRef.current = setInterval(fetchStatus, 8000);
    return () => clearInterval(pollRef.current);
  }, [fetchStatus]);

  const handleJob = useCallback((jobId, label) => {
    setActiveJobId(jobId);
    setActiveJobLabel(label);
    // Refresh status after job likely finishes
    setTimeout(fetchStatus, 10000);
    setTimeout(fetchStatus, 30000);
  }, [fetchStatus]);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-plt-bg">
      {/* Top stats bar */}
      <div className="flex-shrink-0 p-3 md:p-4 pb-0">
        <InventoryBar mlStatus={mlStatus} scrapeStatus={scrapeStatus} />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-h-0 p-3 md:p-4 gap-3 md:gap-4 overflow-y-auto">
        {/* TOP: Controls */}
        <div className="grid grid-cols-12 gap-3 md:gap-4 flex-shrink-0">
          <div className="col-span-12 lg:col-span-6">
            <PipelineControls onJob={handleJob} activeJobId={activeJobId} />
          </div>
          <div className="col-span-12 lg:col-span-6">
            <MLControls mlStatus={mlStatus} onJob={handleJob} />
          </div>
        </div>

        {/* BOTTOM: Console - fixed height on mobile, flex on desktop */}
        <div className="h-[400px] md:h-[500px] lg:flex-1 lg:min-h-0 flex-shrink-0">
          <JobConsole
            jobId={activeJobId}
            onClear={() => { setActiveJobId(null); setActiveJobLabel(null); }}
          />
        </div>
      </div>
    </div>
  );
}
