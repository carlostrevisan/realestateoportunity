import React, { useState, useEffect, useRef, useCallback } from "react";
import { Building2, Layers, TrendingUp, BarChart2, Play, RefreshCw } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
  BarChart, Bar, CartesianGrid,
} from "recharts";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Label, Val, StatusDot, Panel } from "../components/UI.jsx";
import { formatCityName } from "@/lib/utils";

const API = "";

const PIE_COLORS = [
  "var(--plt-accent)",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
  "#ef4444",
  "#06b6d4",
  "#f97316",
  "#84cc16",
  "#ec4899",
  "#6366f1",
];

function fmtDate(iso) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString([], {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function fmtShortDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// ── KPI Card ──────────────────────────────────────────────────────────

function KpiCard({ icon: Icon, label, value, subtitle, accentClass }) {
  return (
    <Card className="bg-white border-plt-border shadow-sm">
      <CardHeader className="pb-2 pt-4 px-5">
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-black uppercase tracking-[0.15em] text-plt-muted font-sans">
            {label}
          </span>
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${accentClass}`}>
            <Icon className="w-3.5 h-3.5" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-4">
        <div className="text-2xl font-black tracking-tighter text-plt-primary font-sans">
          {value ?? "-"}
        </div>
        {subtitle && (
          <p className="text-[10px] text-plt-muted mt-0.5 font-sans">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Opportunity Distribution Chart ────────────────────────────────────

const PILL_COLOR = {
  green:   "bg-plt-success/10 text-plt-success border-plt-success/20",
  yellow:  "bg-amber-50 text-amber-600 border-amber-200",
  red:     "bg-plt-danger/10 text-plt-danger border-plt-danger/20",
  default: "bg-slate-100 text-slate-600 border-slate-200",
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

// ── Reporting ─────────────────────────────────────────────────────────

export default function Reporting() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mlStatus, setMlStatus] = useState(null);
  const abortRef = useRef(null);

  const loadStats = async (signal) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/stats`, { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStats(await res.json());
    } catch (e) {
      if (e.name !== "AbortError") setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchMlStatus = useCallback(async () => {
    try {
      const ml = await fetch(`${API}/api/ml/status`).then(r => r.json());
      setMlStatus(ml);
    } catch {}
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    loadStats(ctrl.signal);
    return () => ctrl.abort();
  }, []);

  useEffect(() => {
    fetchMlStatus();
    const id = setInterval(fetchMlStatus, 15000);
    return () => clearInterval(id);
  }, [fetchMlStatus]);

  const s = stats;

  return (
    <div className="flex-1 overflow-y-auto bg-plt-bg p-5 md:p-7 font-sans">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* ── Opportunity Distribution ── */}
        <ResultsChart refreshKey={mlStatus?.score?.completed_at || mlStatus?.score_weighted?.completed_at} />

        {/* ── KPI Row ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard
            icon={Building2}
            label="Total Properties"
            value={loading ? "…" : s?.total_properties?.toLocaleString()}
            subtitle="All ingested records"
            accentClass="bg-blue-50 text-blue-600"
          />
          <KpiCard
            icon={Layers}
            label="Candidates"
            value={loading ? "…" : s?.total_candidates?.toLocaleString()}
            subtitle="For-sale with score > 0"
            accentClass="bg-emerald-50 text-emerald-600"
          />
          <KpiCard
            icon={TrendingUp}
            label="Avg Opportunity"
            value={loading ? "…" : s?.avg_price_diff_pct != null ? `${s.avg_price_diff_pct}%` : "-"}
            subtitle="Avg result / list price"
            accentClass="bg-amber-50 text-amber-600"
          />
          <KpiCard
            icon={BarChart2}
            label="Model R²"
            value={loading ? "…" : s?.model_r2 != null ? s.model_r2.toFixed(3) : "-"}
            subtitle="Active model accuracy"
            accentClass="bg-purple-50 text-purple-600"
          />
        </div>

        {error && (
          <div className="text-xs text-plt-danger bg-plt-danger/10 border border-plt-danger/20 rounded-lg px-4 py-2">
            Failed to load stats: {error}
          </div>
        )}

        {/* ── Charts Row ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Panel title="Candidates Over Time">
            {loading ? (
              <div className="h-40 flex items-center justify-center text-xs text-plt-muted">Loading…</div>
            ) : !s?.candidates_over_time?.length ? (
              <div className="h-40 flex items-center justify-center text-xs text-plt-muted">No data yet</div>
            ) : (
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={s.candidates_over_time} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                    <XAxis
                      dataKey="date"
                      tickFormatter={fmtShortDate}
                      tick={{ fontSize: 9, fill: "var(--plt-muted)" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 9, fill: "var(--plt-muted)" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid var(--plt-border)" }}
                      labelFormatter={fmtShortDate}
                    />
                    <Line
                      type="monotone"
                      dataKey="count"
                      stroke="var(--plt-accent)"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>

          <Panel title="Candidates by City">
            {loading ? (
              <div className="h-40 flex items-center justify-center text-xs text-plt-muted">Loading…</div>
            ) : !s?.city_breakdown?.length ? (
              <div className="h-40 flex items-center justify-center text-xs text-plt-muted">No data yet</div>
            ) : (
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={s.city_breakdown}
                      dataKey="count"
                      nameKey="city"
                      cx="50%"
                      cy="45%"
                      outerRadius={60}
                      strokeWidth={1}
                      stroke="var(--plt-bg)"
                    >
                      {s.city_breakdown.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid var(--plt-border)" }}
                      formatter={(v, name) => [v.toLocaleString(), formatCityName(name)]}
                    />
                    <Legend
                      iconType="circle"
                      iconSize={7}
                      formatter={(v) => (
                        <span style={{ fontSize: 10, color: "var(--plt-muted)" }}>{formatCityName(v)}</span>
                      )}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>
        </div>

        {/* ── Last Pipeline Run + Re-run ── */}
        <Panel title="Last Pipeline Run">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3">
              <div>
                <Label>Type</Label>
                <Val>{s?.last_run?.run_type?.toUpperCase() ?? "-"}</Val>
              </div>
              <div>
                <Label>Status</Label>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {s?.last_run?.status && <StatusDot status={s.last_run.status} />}
                  <Val>{s?.last_run?.status ?? "-"}</Val>
                </div>
              </div>
              <div>
                <Label>Started</Label>
                <Val>{fmtDate(s?.last_run?.started_at)}</Val>
              </div>
              <div>
                <Label>Completed</Label>
                <Val>{fmtDate(s?.last_run?.completed_at)}</Val>
              </div>
              {s?.last_run?.properties_scored != null && (
                <div>
                  <Label>Scored</Label>
                  <Val>{s.last_run.properties_scored?.toLocaleString()}</Val>
                </div>
              )}
              {s?.last_run?.properties_trained != null && (
                <div>
                  <Label>Trained on</Label>
                  <Val>{s.last_run.properties_trained?.toLocaleString()}</Val>
                </div>
              )}
            </div>
          </div>
        </Panel>

      </div>
    </div>
  );
}
