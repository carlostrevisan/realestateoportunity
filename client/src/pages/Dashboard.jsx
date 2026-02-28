import { useState, useEffect, useCallback } from "react";
import OpportunityMap from "../components/OpportunityMap.jsx";

const API_BASE = "";

export default function Dashboard() {
  const [filters, setFilters] = useState({
    city: "", zip: "", min_roi: "", max_year_built: "", listing_type: "for_sale",
    show_new_builds: false,
  });

  const [roiFilters, setRoiFilters] = useState({
    green: true, yellow: true, red: true, gray: true,
  });

  const [availableFilters, setAvailableFilters] = useState({ cities: [], zips: [] });
  const [selectedProp, setSelectedProp] = useState(null);
  const [comparables, setComparables] = useState([]);
  const [loadingComps, setLoadingComps] = useState(false);
  const [focusCoord, setFocusCoord] = useState(null);
  const [newBuilds, setNewBuilds] = useState([]);

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

  const handleChange = useCallback((e) => {
    const { name, value, type, checked } = e.target;
    if (type === "checkbox") {
      if (name === "show_new_builds") {
        setFilters(prev => ({ ...prev, show_new_builds: checked }));
      } else {
        setRoiFilters((prev) => ({ ...prev, [name]: checked }));
      }
    } else {
      setFilters((prev) => {
        const next = { ...prev, [name]: value };
        if (name === "city") next.zip = "";
        if (name === "zip" && value !== "") next.city = "";
        return next;
      });
    }
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({
      city: "", zip: "", min_roi: "", max_year_built: "", listing_type: "for_sale",
      show_new_builds: false,
    });
    setRoiFilters({
      green: true, yellow: true, red: true, gray: true,
    });
  }, []);

  const handleSelectProperty = useCallback((prop) => {
    setSelectedProp(prop);
  }, []);

  const handleSetFocusCoord = useCallback((coord) => {
    setFocusCoord(coord);
  }, []);

  const hasActiveFilters = filters.city !== "" || filters.zip !== "" || filters.min_roi !== "" || filters.max_year_built !== "" || filters.listing_type !== "for_sale" || filters.show_new_builds || !roiFilters.green || !roiFilters.yellow || !roiFilters.red || !roiFilters.gray;

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-plt-bg text-plt-primary">
      {/* Tactical Filter Bar */}
      <div className="bg-plt-panel border-b border-plt-border px-4 py-3 flex flex-col gap-4 flex-shrink-0 z-10 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Main Filters */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[9px] uppercase font-bold text-plt-muted tracking-widest flex items-center gap-1.5">
                <div className="w-1 h-1 bg-plt-accent rounded-full" />
                Inventory Type
              </label>
              <select name="listing_type" value={filters.listing_type} onChange={handleChange} className="bg-plt-bg border border-plt-border text-plt-primary rounded h-8 px-2 text-[11px] font-medium focus:border-plt-accent outline-none min-w-[120px] hover:bg-plt-panel transition-colors">
                <option value="for_sale">Active Listings</option>
                <option value="sold">Sold History</option>
                <option value="all">All Properties</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[9px] uppercase font-bold text-plt-muted tracking-widest flex items-center gap-1.5">
                <div className="w-1 h-1 bg-plt-accent rounded-full" />
                Market / City
              </label>
              <select name="city" value={filters.city} onChange={handleChange} className="bg-plt-bg border border-plt-border text-plt-primary rounded h-8 px-2 text-[11px] font-medium focus:border-plt-accent outline-none min-w-[140px] hover:bg-plt-panel transition-colors">
                <option value="">All Markets</option>
                {availableFilters.cities.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>)}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[9px] uppercase font-bold text-plt-muted tracking-widest flex items-center gap-1.5">
                <div className="w-1 h-1 bg-plt-accent rounded-full" />
                ZIP Code
              </label>
              <select name="zip" value={filters.zip} onChange={handleChange} className="bg-plt-bg border border-plt-border text-plt-primary rounded h-8 px-2 text-[11px] font-medium focus:border-plt-accent outline-none min-w-[100px] hover:bg-plt-panel transition-colors">
                <option value="">All ZIPs</option>
                {availableFilters.zips.map(z => <option key={z} value={z}>{z}</option>)}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[9px] uppercase font-bold text-plt-muted tracking-widest flex items-center gap-1.5">
                <div className="w-1 h-1 bg-plt-accent rounded-full" />
                Min. Opportunity
              </label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-plt-muted text-[10px] font-mono">$</span>
                <input type="number" name="min_roi" value={filters.min_roi} onChange={handleChange} placeholder="Any" className="bg-plt-bg border border-plt-border text-plt-primary rounded h-8 pl-5 pr-2 text-[11px] font-mono focus:border-plt-accent outline-none w-28 hover:bg-plt-panel transition-colors" />
              </div>
            </div>

            <div className="flex items-center gap-3 h-8 mt-4">
              <label className="flex items-center gap-2 cursor-pointer group select-none">
                <input type="checkbox" name="show_new_builds" checked={filters.show_new_builds} onChange={handleChange} className="hidden" />
                <div className={`w-8 h-4 rounded-full relative transition-colors ${filters.show_new_builds ? 'bg-plt-accent' : 'bg-plt-border'}`}>
                  <div className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform ${filters.show_new_builds ? 'translate-x-4' : ''}`} />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-plt-text-secondary">Market Context</span>
              </label>
            </div>
          </div>

          {/* ROI Toggles & Actions */}
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-4 bg-plt-bg/50 px-3 py-1.5 rounded-md border border-plt-border/50">
              {['green', 'yellow', 'red', 'gray'].map(color => (
                <label key={color} className="flex items-center gap-2 cursor-pointer group select-none">
                  <input type="checkbox" name={color} checked={roiFilters[color]} onChange={handleChange} className="hidden" />
                  <div className={`w-2.5 h-2.5 rounded-full border transition-all ${roiFilters[color] ? `bg-opportunity-${color} border-transparent shadow-[0_0_6px_var(--opportunity-${color})]` : 'bg-transparent border-plt-border opacity-20'}`} />
                  <span className={`text-[10px] font-bold uppercase tracking-tighter transition-colors ${roiFilters[color] ? 'text-plt-primary' : 'text-plt-muted group-hover:text-plt-primary/50'}`}>
                    {color === 'green' ? 'High' : color === 'yellow' ? 'Mid' : color === 'red' ? 'Loss' : 'None'}
                  </span>
                </label>
              ))}
            </div>

            {hasActiveFilters && (
              <button 
                onClick={clearFilters}
                className="text-[10px] font-bold uppercase tracking-widest text-plt-muted hover:text-plt-danger transition-colors flex items-center gap-1.5 px-2 py-1 rounded hover:bg-plt-danger/5"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                Reset
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className={`flex-1 relative transition-all duration-500 ${selectedProp ? 'mr-0' : ''}`}>
          <OpportunityMap 
            filters={filters} 
            roiFilters={roiFilters} 
            onSelectProperty={handleSelectProperty} 
            selectedId={selectedProp?.id} 
            comparables={comparables} 
            focusCoord={focusCoord} 
            newBuilds={newBuilds}
          />
        </div>

        {/* Property detail sidebar — overlays map on mobile, slides in from right on md+ */}
        <aside className={`${selectedProp ? 'w-full md:w-[420px]' : 'w-0'} absolute inset-0 md:relative md:inset-auto bg-plt-panel md:border-l border-plt-border flex flex-col transition-all duration-300 overflow-hidden shadow-2xl z-30`}>
          {selectedProp && (() => {
            const p = selectedProp;
            const cityDisplay = p.city ? p.city.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : '';
            const zillowListingUrl = `https://www.zillow.com/homes/${encodeURIComponent(`${p.address}, ${cityDisplay}, FL ${p.zip}`)}_rb/`;
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
                        <div className="text-[10px] text-plt-accent font-semibold tracking-wider">Property Selected</div>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${p.listing_type === 'sold' ? 'bg-plt-muted/20 text-plt-muted' : 'bg-plt-success/15 text-plt-success border border-plt-success/30'}`}>
                          {p.listing_type === 'sold' ? 'Sold' : 'For Sale'}
                        </span>
                      </div>
                      <h3 className="text-sm font-bold leading-tight">{p.address}</h3>
                      <p className="text-xs text-plt-muted mt-0.5">{cityDisplay}, FL {p.zip}</p>
                    </div>
                    <button onClick={() => handleSelectProperty(null)} className="p-2 hover:bg-plt-danger/10 text-plt-muted hover:text-plt-danger transition-all rounded flex-shrink-0">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>

                  {/* Property info grid */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs mb-4 py-3 border-y border-plt-border/50">
                    <span className="text-plt-muted">Year Built</span>
                    <span className="text-right font-mono text-plt-primary">{p.year_built || '—'}{age ? <span className="text-plt-muted ml-1">({age} yrs)</span> : ''}</span>
                    <span className="text-plt-muted">Size</span>
                    <span className="text-right font-mono text-plt-primary">{p.sqft ? p.sqft.toLocaleString() + ' sqft' : '—'}</span>
                    <span className="text-plt-muted">Lot</span>
                    <span className="text-right font-mono text-plt-primary">{p.lot_sqft ? p.lot_sqft.toLocaleString() + ' sqft' : '—'}</span>
                    <span className="text-plt-muted">Type</span>
                    <span className="text-right text-plt-primary">{p.property_type || 'Single Family'}</span>
                  </div>

                  {/* Financials */}
                  <div className="space-y-1.5 text-xs mb-4">
                    <div className="text-[9px] font-semibold uppercase tracking-wider text-plt-muted mb-2">Financials</div>
                    <div className="flex justify-between">
                      <span className="text-plt-muted">Asking Price</span>
                      <span className="font-mono text-plt-primary">{p.list_price ? '$' + p.list_price.toLocaleString() : '—'}</span>
                    </div>
                    {buildCost && (
                      <div className="flex justify-between">
                        <span className="text-plt-muted">Est. Build Cost <span className="text-[9px] opacity-60">({p.sqft?.toLocaleString()} × ${costPerSqft}/sqft)</span></span>
                        <span className="font-mono text-plt-primary">${buildCost.toLocaleString()}</span>
                      </div>
                    )}
                    {totalCost && (
                      <div className="flex justify-between border-t border-plt-border/40 pt-1.5">
                        <span className="text-plt-muted font-semibold">Total Cost</span>
                        <span className="font-mono font-semibold text-plt-primary">${totalCost.toLocaleString()}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-plt-muted">Predicted Value</span>
                      <span className="font-mono text-plt-primary">{p.predicted_rebuild_value ? '$' + p.predicted_rebuild_value.toLocaleString() : '—'}</span>
                    </div>
                    <div className="flex justify-between border-t border-plt-border/40 pt-1.5">
                      <span className="text-plt-muted font-semibold">Est. Profit</span>
                      <span className={`font-mono font-bold text-sm ${profitColor}`}>
                        {profit != null ? `${profitSign}$${Math.abs(profit).toLocaleString()}` : '—'}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <a href={zillowListingUrl} target="_blank" rel="noopener noreferrer" className="bg-plt-accent text-white text-xs font-semibold py-2.5 px-4 rounded text-center hover:brightness-110 transition-all">Find on Zillow</a>
                    <a href={zillowAreaUrl} target="_blank" rel="noopener noreferrer" className="border border-plt-accent text-plt-accent text-xs font-semibold py-2.5 px-4 rounded text-center hover:bg-plt-accent/5 transition-all">Browse Area</a>
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
                    const distanceDisplay = comp.distance_mi ? comp.distance_mi.toFixed(2) + ' mi' : '—';

                    return (
                      <div
                        key={comp.id}
                        className={`p-3 border rounded transition-all cursor-pointer hover:brightness-105 ${cardCls}`}
                        onClick={() => comp.lat && comp.lng ? handleSetFocusCoord([comp.lat, comp.lng]) : null}
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
                          <span className="text-right font-mono text-plt-primary">{distanceDisplay}</span>
                          <span className="text-plt-muted">Details</span>
                          <span className="text-right font-mono text-[11px] text-plt-primary">{comp.sqft?.toLocaleString()} sqft · {comp.year_built}</span>
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
