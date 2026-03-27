import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useAuth } from "@clerk/react";
import OpportunityMap from "../components/OpportunityMap.jsx";
import { formatCityName, buildZillowUrl } from "../lib/utils";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";

const API_BASE = "";

const INITIAL_FILTERS = {
  city: "", zip: "", min_roi: "", max_year_built: "", listing_type: "for_sale",
  show_new_builds: false,
};

const INITIAL_ROI_FILTERS = { green: true, yellow: false, red: false, gray: false };

// ── Tier helpers ──────────────────────────────────────────────────────────────
function tierLabel(val) {
  if (val == null)    return { label: "-",    cls: "text-plt-muted" };
  if (val > 200_000)  return { label: "HIGH", cls: "text-plt-success font-bold" };
  if (val >= 0)       return { label: "MID",  cls: "text-plt-warning font-bold" };
  return               { label: "LOSS", cls: "text-plt-danger  font-bold" };
}

function fmtMoney(v) {
  if (v == null) return "-";
  const abs  = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000)     return `${sign}$${(abs / 1_000).toFixed(0)}k`;
  return `${sign}$${abs}`;
}

// ── PropertyTable ─────────────────────────────────────────────────────────────
function PropertyTable({ rows, onSelect, selectedId, loading }) {
  const [sortKey,  setSortKey]  = useState("opportunity_result");
  const [sortDir,  setSortDir]  = useState("desc");

  const sorted = useMemo(() => {
    if (!rows) return [];
    return [...rows].sort((a, b) => {
      const av = a[sortKey] ?? (sortDir === "asc" ? Infinity : -Infinity);
      const bv = b[sortKey] ?? (sortDir === "asc" ? Infinity : -Infinity);
      return sortDir === "asc" ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
    });
  }, [rows, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (key === sortKey) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const Th = ({ k, label, right }) => {
    const active = sortKey === k;
    return (
      <th
        onClick={() => toggleSort(k)}
        className={`px-3 py-2 text-[9px] font-black uppercase tracking-[0.12em] cursor-pointer select-none whitespace-nowrap
          ${right ? "text-right" : "text-left"}
          ${active ? "text-plt-accent" : "text-plt-muted hover:text-plt-secondary"}`}
      >
        {label}
        {active && <span className="ml-1 opacity-60">{sortDir === "asc" ? "↑" : "↓"}</span>}
      </th>
    );
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs text-plt-muted">
        <div className="w-5 h-5 border-2 border-plt-accent border-t-transparent rounded-full animate-spin mr-2" />
        Loading properties…
      </div>
    );
  }

  if (!rows?.length) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs text-plt-muted italic opacity-60">
        No properties match the current filters.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full text-xs border-collapse">
        <thead className="sticky top-0 bg-white border-b border-plt-border shadow-sm z-10">
          <tr>
            <Th k="address"                label="Address" />
            <Th k="city"                   label="City" />
            <Th k="zip"                    label="ZIP" />
            <Th k="year_built"             label="Year"  right />
            <Th k="sqft"                   label="Sqft"  right />
            <Th k="list_price"             label="Asking" right />
            <Th k="predicted_rebuild_value" label="Predicted" right />
            <Th k="opportunity_result"     label="Opportunity" right />
            <th className="px-3 py-2 text-[9px] font-black uppercase tracking-[0.12em] text-plt-muted text-center">Tier</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p, i) => {
            const tier    = tierLabel(p.opportunity_result);
            const isActive = p.id === selectedId;
            return (
              <tr
                key={p.id}
                onClick={() => onSelect(p)}
                className={`border-b border-plt-border/40 cursor-pointer transition-colors
                  ${isActive
                    ? "bg-plt-accent/8 border-l-2 border-l-plt-accent"
                    : i % 2 === 0
                      ? "bg-white hover:bg-plt-bg"
                      : "bg-plt-bg/60 hover:bg-plt-bg"}`}
              >
                <td className="px-3 py-2 font-medium max-w-[200px] truncate">{p.address || "-"}</td>
                <td className="px-3 py-2 text-plt-muted whitespace-nowrap">{formatCityName(p.city)}</td>
                <td className="px-3 py-2 font-mono text-plt-muted">{p.zip || "-"}</td>
                <td className="px-3 py-2 text-right font-mono">{p.year_built || "-"}</td>
                <td className="px-3 py-2 text-right font-mono">{p.sqft ? p.sqft.toLocaleString() : "-"}</td>
                <td className="px-3 py-2 text-right font-mono">{p.list_price ? `$${p.list_price.toLocaleString()}` : "-"}</td>
                <td className="px-3 py-2 text-right font-mono">{p.predicted_rebuild_value ? `$${p.predicted_rebuild_value.toLocaleString()}` : "-"}</td>
                <td className={`px-3 py-2 text-right font-mono font-bold ${tier.cls}`}>
                  {p.opportunity_result != null ? fmtMoney(p.opportunity_result) : "-"}
                </td>
                <td className={`px-3 py-2 text-center text-[10px] font-bold ${tier.cls}`}>{tier.label}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function Dashboard() {
  const { getToken, isSignedIn } = useAuth();

  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [roiFilters, setRoiFilters] = useState(INITIAL_ROI_FILTERS);
  const [viewMode, setViewMode] = useState("map"); // "map" | "table"

  const [availableFilters, setAvailableFilters] = useState({ cities: [], zips: [] });
  const [selectedProp, setSelectedProp] = useState(null);
  const [comparables, setComparables] = useState([]);
  const [loadingComps, setLoadingComps] = useState(false);
  const [focusCoord, setFocusCoord] = useState(null);
  const [newBuilds, setNewBuilds] = useState([]);

  // Table view state
  const [tableRows, setTableRows] = useState(null);
  const [tableLoading, setTableLoading] = useState(false);

  // Export / Report state
  const [exporting, setExporting] = useState(false);
  const [reportState, setReportState] = useState(null); // null | "pending" | "running" | "done" | "failed"
  const [reportError, setReportError] = useState(null);
  const pollRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API_BASE}/api/opportunities/filters`, { signal: controller.signal })
      .then(res => res.json())
      .then(data => setAvailableFilters({ cities: data.cities || [], zips: data.zips || [] }))
      .catch(err => { if (err.name !== 'AbortError') console.error("Failed to fetch filters", err); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (filters.show_new_builds) {
      const controller = new AbortController();
      const currentYear = new Date().getFullYear();
      const params = new URLSearchParams({
        listing_type: "for_sale",
        min_year_built: (currentYear - 5).toString(),
        limit: "200"
      });
      if (filters.city) params.set("city", filters.city);
      if (filters.zip) params.set("zip", filters.zip);

      fetch(`${API_BASE}/api/opportunities?${params.toString()}`, { signal: controller.signal })
        .then(res => res.json())
        .then(data => setNewBuilds(data.features || []))
        .catch(err => { if (err.name !== 'AbortError') setNewBuilds([]); });
      return () => controller.abort();
    } else {
      setNewBuilds([]);
    }
  }, [filters.show_new_builds, filters.city, filters.zip]);

  useEffect(() => {
    if (!selectedProp) return;
    const controller = new AbortController();
    setLoadingComps(true);
    setComparables([]);
    fetch(`${API_BASE}/api/opportunities/${selectedProp.id}/comparables`, { signal: controller.signal })
      .then(res => res.ok ? res.json() : [])
      .then(data => setComparables(Array.isArray(data) ? data : []))
      .catch(err => { if (err.name !== 'AbortError') setComparables([]); })
      .finally(() => { if (!controller.signal.aborted) setLoadingComps(false); });
    return () => controller.abort();
  }, [selectedProp]);

  // ── Table data ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (viewMode !== "table") return;
    const ctrl = new AbortController();
    setTableLoading(true);
    const p = new URLSearchParams();
    if (filters.listing_type) p.set("listing_type", filters.listing_type);
    if (filters.city)         p.set("city",         filters.city);
    if (filters.zip)          p.set("zip",          filters.zip);
    if (filters.min_roi)      p.set("min_roi",      filters.min_roi);
    if (filters.max_year_built) p.set("max_year_built", filters.max_year_built);
    p.set("limit", "2000");

    fetch(`${API_BASE}/api/opportunities?${p}`, { signal: ctrl.signal })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(data => setTableRows((data.features || []).map(f => ({ id: f.properties.id, ...f.properties }))))
      .catch(err => { if (err.name !== "AbortError") setTableRows([]); })
      .finally(() => { if (!ctrl.signal.aborted) setTableLoading(false); });

    return () => ctrl.abort();
  }, [viewMode, filters]);

  // ── Export CSV ──────────────────────────────────────────────────────────────
  const handleExportCsv = useCallback(async () => {
    if (!isSignedIn) { alert("Please sign in to export data."); return; }
    setExporting(true);
    try {
      const token  = await getToken();
      const p      = new URLSearchParams();
      if (filters.listing_type) p.set("listing_type", filters.listing_type);
      if (filters.city)         p.set("city",         filters.city);
      if (filters.zip)          p.set("zip",          filters.zip);
      if (filters.min_roi)      p.set("min_roi",      filters.min_roi);
      if (filters.max_year_built) p.set("max_year_built", filters.max_year_built);
      p.set("limit", "10000");

      const res  = await fetch(`${API_BASE}/api/export/csv?${p}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { alert("Export failed - try again."); return; }

      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      const slug = filters.city || filters.zip || "all";
      a.href     = url;
      a.download = `opportunities_${slug}_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }, [filters, isSignedIn, getToken]);

  // ── Generate PDF Report ─────────────────────────────────────────────────────
  const handleGenerateReport = useCallback(async () => {
    if (!isSignedIn) { alert("Please sign in to generate a report."); return; }
    setReportState("pending");
    setReportError(null);

    try {
      const token = await getToken();
      const filterPayload = {
        listing_type: filters.listing_type || "for_sale",
        ...(filters.city          && { city:           filters.city }),
        ...(filters.zip           && { zip:            filters.zip }),
        ...(filters.min_roi       && { min_roi:        filters.min_roi }),
        ...(filters.max_year_built && { max_year_built: filters.max_year_built }),
      };

      const startRes = await fetch(`${API_BASE}/api/report`, {
        method:  "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body:    JSON.stringify(filterPayload),
      });
      if (!startRes.ok) { setReportState("failed"); setReportError("Could not start report job."); return; }
      const { job_id } = await startRes.json();
      setReportState("running");

      // Poll job status every 2 s
      pollRef.current = setInterval(async () => {
        try {
          const jobRes = await fetch(`${API_BASE}/api/jobs/${job_id}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const job = await jobRes.json();

          if (job.status === "completed") {
            clearInterval(pollRef.current);
            setReportState("done");

            // Download PDF
            const pdfRes = await fetch(`${API_BASE}/api/report/${job_id}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (pdfRes.ok) {
              const blob = await pdfRes.blob();
              const url  = URL.createObjectURL(blob);
              const a    = document.createElement("a");
              a.href     = url;
              a.download = `opportunity_report_${new Date().toISOString().slice(0, 10)}.pdf`;
              a.click();
              URL.revokeObjectURL(url);
            }
            setTimeout(() => setReportState(null), 3000);

          } else if (job.status === "failed") {
            clearInterval(pollRef.current);
            setReportState("failed");
            setReportError("Report generation failed. Check the Data Engine logs.");
          }
        } catch {
          clearInterval(pollRef.current);
          setReportState("failed");
          setReportError("Lost connection while polling.");
        }
      }, 2000);

    } catch {
      setReportState("failed");
      setReportError("Unexpected error starting report.");
    }
  }, [filters, isSignedIn, getToken]);

  // Clear poll on unmount
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const handleChange = useCallback((e) => {
    const { name, value } = e.target;
    setFilters((prev) => {
      const next = { ...prev, [name]: value };
      if (name === "city") next.zip = "";
      if (name === "zip" && value !== "") next.city = "";
      return next;
    });
  }, []);

  // shadcn Select uses onValueChange (not onChange), so we need a separate handler
  const handleSelectChange = useCallback((name, value) => {
    setFilters((prev) => {
      const next = { ...prev, [name]: value };
      if (name === "city") next.zip = "";
      if (name === "zip" && value !== "") next.city = "";
      return next;
    });
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(INITIAL_FILTERS);
    setRoiFilters(INITIAL_ROI_FILTERS);
  }, []);

  const hasActiveFilters = useMemo(
    () => filters.city !== "" || filters.zip !== "" || filters.min_roi !== "" || filters.max_year_built !== "" || filters.listing_type !== "for_sale" || filters.show_new_builds ||
      Object.keys(INITIAL_ROI_FILTERS).some(k => roiFilters[k] !== INITIAL_ROI_FILTERS[k]),
    [filters, roiFilters]
  );

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-plt-bg text-plt-primary">
      {/* Tactical Filter Bar - glassmorphism */}
      <div className="bg-white/90 backdrop-blur-sm border-b border-plt-border px-4 py-3 flex flex-col gap-4 flex-shrink-0 z-10 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Main Filters */}
          <div className="flex flex-wrap items-center gap-x-3 sm:gap-x-6 gap-y-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[9px] uppercase font-bold text-plt-muted tracking-widest flex items-center gap-1.5">
                <div className="w-1 h-1 bg-plt-accent rounded-full" />
                Inventory Type
              </label>
              <Select value={filters.listing_type} onValueChange={v => handleSelectChange("listing_type", v)}>
                <SelectTrigger className="h-8 text-[11px] min-w-[120px] font-medium">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="for_sale">Active Listings</SelectItem>
                  <SelectItem value="sold">Sold History</SelectItem>
                  <SelectItem value="all">All Properties</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[9px] uppercase font-bold text-plt-muted tracking-widest flex items-center gap-1.5">
                <div className="w-1 h-1 bg-plt-accent rounded-full" />
                Market / City
              </label>
              <Select value={filters.city || "__all__"} onValueChange={v => handleSelectChange("city", v === "__all__" ? "" : v)}>
                <SelectTrigger className="h-8 text-[11px] min-w-[140px] font-medium">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Markets</SelectItem>
                  {availableFilters.cities.map(c => (
                    <SelectItem key={c} value={c}>{formatCityName(c)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[9px] uppercase font-bold text-plt-muted tracking-widest flex items-center gap-1.5">
                <div className="w-1 h-1 bg-plt-accent rounded-full" />
                ZIP Code
              </label>
              <Select value={filters.zip || "__all__"} onValueChange={v => handleSelectChange("zip", v === "__all__" ? "" : v)}>
                <SelectTrigger className="h-8 text-[11px] min-w-[100px] font-medium">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All ZIPs</SelectItem>
                  {availableFilters.zips.map(z => (
                    <SelectItem key={z} value={z}>{z}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[9px] uppercase font-bold text-plt-muted tracking-widest flex items-center gap-1.5">
                <div className="w-1 h-1 bg-plt-accent rounded-full" />
                Min. Opportunity
              </label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-plt-muted text-[10px] font-sans font-bold z-10">$</span>
                <Input
                  type="number"
                  name="min_roi"
                  value={filters.min_roi}
                  onChange={handleChange}
                  placeholder="Any"
                  className="h-8 w-28 text-[11px] font-bold pl-5"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 h-8 mt-4">
              <label className="flex items-center gap-2 cursor-pointer group select-none">
                <Switch
                  checked={filters.show_new_builds}
                  onCheckedChange={checked => setFilters(prev => ({ ...prev, show_new_builds: checked }))}
                  aria-label="Market Context"
                />
                <span className="text-[10px] font-bold uppercase tracking-widest text-plt-text-secondary">Market Context</span>
              </label>
            </div>
          </div>

          {/* ROI Toggles & Actions */}
          <div className="flex items-center gap-3 sm:gap-6 flex-wrap">
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="text-[10px] font-bold uppercase tracking-widest text-plt-muted hover:text-plt-danger transition-colors flex items-center gap-1.5 px-2 py-1 rounded hover:bg-plt-danger/5"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                Reset
              </button>
            )}

            <div className="flex items-center gap-4 bg-plt-bg/50 px-3 py-1.5 rounded-md border border-plt-border/50">
              {['green', 'yellow', 'red', 'gray'].map(color => (
                <label key={color} className="flex items-center gap-2 cursor-pointer group select-none">
                  <Checkbox
                    checked={roiFilters[color]}
                    onCheckedChange={checked => setRoiFilters(prev => ({ ...prev, [color]: !!checked }))}
                    className={`w-2.5 h-2.5 rounded-full border-0 data-[state=checked]:bg-opportunity-${color} data-[state=checked]:text-white`}
                  />
                  <span className={`text-[10px] font-bold uppercase tracking-tighter transition-colors ${roiFilters[color] ? 'text-plt-primary' : 'text-plt-muted group-hover:text-plt-primary/50'}`}>
                    {color === 'green' ? 'High' : color === 'yellow' ? 'Mid' : color === 'red' ? 'Loss' : 'None'}
                  </span>
                </label>
              ))}
            </div>

            {/* Map / Table toggle */}
            <div className="flex items-center rounded-md border border-plt-border overflow-hidden text-[10px] font-bold uppercase tracking-widest">
              {["map", "table"].map(mode => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`px-3 py-1.5 transition-colors ${
                    viewMode === mode
                      ? "bg-plt-accent text-white"
                      : "bg-white text-plt-muted hover:text-plt-secondary"
                  }`}
                >{mode}</button>
              ))}
            </div>

            {/* Export + Report - only in table mode */}
            {viewMode === "table" && (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportCsv}
                  disabled={exporting}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-md border border-plt-border bg-white text-plt-secondary hover:border-plt-accent hover:text-plt-accent disabled:opacity-50 transition-colors"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  {exporting ? "Exporting…" : "Export CSV"}
                </button>

                <button
                  onClick={handleGenerateReport}
                  disabled={reportState === "pending" || reportState === "running"}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-md transition-colors
                    ${reportState === "done"
                      ? "bg-plt-success/10 border border-plt-success text-plt-success"
                      : reportState === "failed"
                        ? "bg-plt-danger/10 border border-plt-danger text-plt-danger"
                        : "bg-plt-accent text-white hover:bg-plt-accent/90 disabled:opacity-50"
                    }`}
                >
                  {reportState === "pending" || reportState === "running" ? (
                    <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
                    {reportState === "pending" ? "Starting…" : "Building…"}</>
                  ) : reportState === "done" ? (
                    <><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/></svg> Downloaded!</>
                  ) : (
                    <><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                    {reportState === "failed" ? "Retry Report" : "Generate Report"}</>
                  )}
                </button>
                {reportError && (
                  <span className="text-[9px] text-plt-danger max-w-[160px] leading-tight">{reportError}</span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className={`flex-1 relative flex flex-col transition-all duration-500 ${selectedProp ? 'mr-0' : ''}`}>
          {viewMode === "map" ? (
            <OpportunityMap
              filters={filters}
              roiFilters={roiFilters}
              onSelectProperty={setSelectedProp}
              selectedId={selectedProp?.id}
              comparables={comparables}
              focusCoord={focusCoord}
              newBuilds={newBuilds}
            />
          ) : (
            <>
              {/* Table toolbar: row count */}
              <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-plt-border flex-shrink-0">
                <span className="text-[10px] text-plt-muted font-sans">
                  {tableLoading
                    ? "Loading…"
                    : tableRows
                      ? `${tableRows.length.toLocaleString()} propert${tableRows.length === 1 ? "y" : "ies"} - sorted by opportunity`
                      : ""}
                </span>
                {selectedProp && (
                  <button onClick={() => setSelectedProp(null)} className="text-[10px] text-plt-muted hover:text-plt-danger transition-colors">
                    ✕ Close detail
                  </button>
                )}
              </div>
              <PropertyTable
                rows={tableRows}
                onSelect={setSelectedProp}
                selectedId={selectedProp?.id}
                loading={tableLoading}
              />
            </>
          )}
        </div>

        {/* Property detail sidebar - overlays map on mobile, slides in from right on md+ */}
        <aside className={`${selectedProp ? 'w-full md:w-[420px]' : 'w-0'} absolute inset-0 md:relative md:inset-auto bg-plt-panel md:border-l border-plt-border flex flex-col transition-all duration-300 overflow-hidden shadow-2xl ring-1 ring-black/5 z-30`}>
          {selectedProp && (() => {
            const p = selectedProp;
            const cityDisplay = formatCityName(p.city);
            const zillowListingUrl = buildZillowUrl(p.address, cityDisplay, p.zip);
            const zillowAreaUrl = `https://www.zillow.com/homes/${p.zip}_rb/`;

            const currentYear = new Date().getFullYear();
            const age = p.year_built ? currentYear - p.year_built : null;
            const costPerSqft = parseFloat(p.construction_cost_per_sqft || 175);
            const buildCost = p.sqft ? Math.round(p.sqft * costPerSqft) : null;
            const totalCost = p.list_price && buildCost ? p.list_price + buildCost : null;
            const profit = p.opportunity_result;
            const profitColor = profit == null ? "text-plt-muted" : profit > 200000 ? "text-plt-success" : profit > 0 ? "text-plt-warning" : "text-plt-danger";
            const profitSign = profit != null && profit > 0 ? "+" : "";

            return (
              <div className="flex flex-col h-full">
                {/* Header */}
                <div className="p-4 sm:p-5 border-b border-plt-border bg-plt-bg/50 flex-shrink-0">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-plt-accent/10 rounded-full w-fit">
                          <div className="w-1.5 h-1.5 rounded-full bg-plt-accent" />
                          <span className="text-[9px] font-black uppercase tracking-widest text-plt-accent">Property Selected</span>
                        </div>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${p.listing_type === 'sold' ? 'bg-plt-muted/20 text-plt-muted' : 'bg-plt-success/15 text-plt-success border border-plt-success/30'}`}>
                          {p.listing_type === 'sold' ? 'Sold' : 'For Sale'}
                        </span>
                      </div>
                      <h3 className="text-sm font-bold leading-tight">{p.address}</h3>
                      <p className="text-xs text-plt-muted mt-0.5">{cityDisplay}, FL {p.zip}</p>
                    </div>
                    <button onClick={() => setSelectedProp(null)} className="p-2 hover:bg-plt-danger/10 text-plt-muted hover:text-plt-danger transition-all rounded flex-shrink-0 active:scale-[0.98]">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>

                  {/* Property info grid */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs mb-4 py-3 border-y border-plt-border/50">
                    <span className="text-plt-muted">Year Built</span>
                    <span className="text-right font-mono font-bold text-plt-primary">{p.year_built || '-'}{age ? <span className="text-plt-muted ml-1">({age} yrs)</span> : ''}</span>
                    <span className="text-plt-muted">Size</span>
                    <span className="text-right font-mono font-bold text-plt-primary">{p.sqft ? p.sqft.toLocaleString() + ' sqft' : '-'}</span>
                    <span className="text-plt-muted">Lot</span>
                    <span className="text-right font-mono font-bold text-plt-primary">{p.lot_sqft ? p.lot_sqft.toLocaleString() + ' sqft' : '-'}</span>
                    <span className="text-plt-muted">Type</span>
                    <span className="text-right text-plt-primary">{p.property_type || 'Single Family'}</span>
                  </div>

                  {/* Financials */}
                  <div className="space-y-1.5 text-xs mb-4">
                    <div className="text-[9px] font-semibold uppercase tracking-wider text-plt-muted mb-2">Financials</div>
                    <div className="flex justify-between">
                      <span className="text-plt-muted">Asking Price</span>
                      <span className="font-mono font-bold text-plt-primary">{p.list_price ? '$' + p.list_price.toLocaleString() : '-'}</span>
                    </div>
                    {buildCost && (
                      <div className="flex justify-between">
                        <span className="text-plt-muted">Est. Build Cost <span className="text-[9px] opacity-60">({p.sqft?.toLocaleString()} × ${costPerSqft}/sqft)</span></span>
                        <span className="font-mono font-bold text-plt-primary">${buildCost.toLocaleString()}</span>
                      </div>
                    )}
                    {totalCost && (
                      <div className="flex justify-between border-t border-plt-border/40 pt-1.5">
                        <span className="text-plt-muted font-semibold">Total Cost</span>
                        <span className="font-mono font-bold text-plt-primary">${totalCost.toLocaleString()}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-plt-muted">Predicted Value</span>
                      <span className="font-mono font-bold text-plt-primary">{p.predicted_rebuild_value ? '$' + p.predicted_rebuild_value.toLocaleString() : '-'}</span>
                    </div>
                    <div className="flex justify-between border-t border-plt-border/40 pt-1.5">
                      <span className="text-plt-muted font-semibold">Est. Profit</span>
                      <span className={`font-mono font-bold text-sm ${profitColor}`}>
                        {profit != null ? `${profitSign}$${Math.abs(profit).toLocaleString()}` : '-'}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <a href={zillowListingUrl} target="_blank" rel="noopener noreferrer" className="bg-plt-accent text-white text-xs font-semibold py-2.5 px-4 rounded-lg text-center hover:brightness-110 transition-all active:scale-[0.98]">Find on Zillow</a>
                    <a href={zillowAreaUrl} target="_blank" rel="noopener noreferrer" className="border border-plt-accent text-plt-accent text-xs font-semibold py-2.5 px-4 rounded-lg text-center hover:bg-plt-accent/5 transition-all active:scale-[0.98]">Browse Area</a>
                  </div>
                </div>

                {/* Comparable Sales */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3 bg-plt-bg/30">
                  <div className="flex items-center justify-between border-b border-plt-border/50 pb-2">
                    <h4 className="text-xs font-semibold text-plt-primary flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-plt-accent rounded-full animate-pulse" />
                      Comparable Sales
                    </h4>
                    {loadingComps && <div className="w-3 h-3 border-2 border-plt-accent border-t-transparent animate-spin rounded-full" />}
                  </div>

                  {comparables.length === 0 && !loadingComps && (
                    <div className="text-xs text-plt-muted italic py-10 text-center opacity-60">No comparable sales found nearby</div>
                  )}

                  {comparables.map(comp => {
                    const isNew = comp.year_built >= 2015;
                    const cardCls = isNew
                      ? 'bg-cyan-500/10 border-cyan-500/30'
                      : 'bg-violet-500/10 border-violet-500/30';
                    const badgeCls = isNew
                      ? 'bg-cyan-500 text-white'
                      : 'bg-violet-500/20 text-violet-400 border border-violet-500/30';

                    const pricePerSqft = comp.sold_price && comp.sqft ? Math.round(comp.sold_price / comp.sqft) : null;
                    const distanceDisplay = comp.distance_mi ? comp.distance_mi.toFixed(2) + ' mi' : '-';

                    return (
                      <div
                        key={comp.id}
                        className={`p-3 border rounded transition-all cursor-pointer hover:brightness-105 ${cardCls}`}
                        onClick={() => comp.lat && comp.lng ? setFocusCoord([comp.lat, comp.lng]) : null}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-xs font-semibold truncate pr-2">{comp.address}</span>
                          <span className={`text-[9px] font-semibold px-2 py-0.5 rounded flex-shrink-0 ${badgeCls}`}>
                            {isNew ? 'New Build' : 'Older'}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-y-1.5 text-xs">
                          <span className="text-plt-muted">Sale Price</span>
                          <div className="text-right">
                            <span className="font-semibold text-plt-primary">${comp.sold_price?.toLocaleString()}</span>
                            {pricePerSqft && <span className="text-[10px] text-plt-muted ml-1.5">(${pricePerSqft}/ft²)</span>}
                          </div>
                          <span className="text-plt-muted">Proximity</span>
                          <span className="text-right font-mono font-bold text-plt-primary">{distanceDisplay}</span>
                          <span className="text-plt-muted">Details</span>
                          <span className="text-right font-mono font-bold text-[11px] text-plt-primary">{comp.sqft?.toLocaleString()} sqft · {comp.year_built}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </aside>
      </div>
    </div>
  );
}
