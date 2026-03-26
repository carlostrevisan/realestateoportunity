import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "@clerk/react";
import { Building2, Layers, TrendingUp, BarChart2, Play, RefreshCw } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  if (!iso) return "—";
  return new Date(iso).toLocaleString([], {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function fmtShortDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// ── KPI Card ────────────────────────────────────────────────────────────────

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
          {value ?? "—"}
        </div>
        {subtitle && (
          <p className="text-[10px] text-plt-muted mt-0.5 font-sans">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Home ────────────────────────────────────────────────────────────────────

export default function Home() {
  const { getToken, isSignedIn } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [rerunning, setRerunning] = useState(false);
  const [rerunError, setRerunError] = useState(null);
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

  useEffect(() => {
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    loadStats(ctrl.signal);
    return () => ctrl.abort();
  }, []);

  const handleRerun = async () => {
    if (!isSignedIn) {
      alert("Please sign in to trigger a scoring run.");
      return;
    }
    setRerunning(true);
    setRerunError(null);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/api/ml/score`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      // Re-fetch stats after a short delay to pick up the new run
      setTimeout(() => loadStats(new AbortController().signal), 1500);
    } catch (e) {
      setRerunError(e.message);
    } finally {
      setRerunning(false);
    }
  };

  const s = stats;

  return (
    <div className="flex-1 overflow-y-auto bg-plt-bg p-5 md:p-7 font-sans">
      <div className="max-w-5xl mx-auto space-y-6">

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
            value={loading ? "…" : s?.avg_price_diff_pct != null ? `${s.avg_price_diff_pct}%` : "—"}
            subtitle="Avg result / list price"
            accentClass="bg-amber-50 text-amber-600"
          />
          <KpiCard
            icon={BarChart2}
            label="Model R²"
            value={loading ? "…" : s?.model_r2 != null ? s.model_r2.toFixed(3) : "—"}
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

          {/* Line Chart */}
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

          {/* Pie Chart */}
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
            {/* Run details */}
            <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3">
              <div>
                <Label>Type</Label>
                <Val>{s?.last_run?.run_type?.toUpperCase() ?? "—"}</Val>
              </div>
              <div>
                <Label>Status</Label>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {s?.last_run?.status && <StatusDot status={s.last_run.status} />}
                  <Val>{s?.last_run?.status ?? "—"}</Val>
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

            {/* Re-run button */}
            {isSignedIn && (
              <div className="flex flex-col items-start sm:items-end gap-1 flex-shrink-0">
                <button
                  onClick={handleRerun}
                  disabled={rerunning}
                  className="flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-plt-accent text-white rounded-lg hover:bg-plt-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {rerunning
                    ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Running…</>
                    : <><Play className="w-3.5 h-3.5" /> Re-run Score</>
                  }
                </button>
                {rerunError && (
                  <span className="text-[10px] text-plt-danger">{rerunError}</span>
                )}
              </div>
            )}
          </div>
        </Panel>

      </div>
    </div>
  );
}
