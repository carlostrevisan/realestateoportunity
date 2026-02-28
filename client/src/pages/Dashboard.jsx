import { useState, useEffect } from "react";
import OpportunityMap from "../components/OpportunityMap.jsx";

const API_BASE = "";

export default function Dashboard() {
  const [filters, setFilters] = useState({
    city: "", zip: "", min_roi: "", max_year_built: "", listing_type: "for_sale",
  });

  const [roiFilters, setRoiFilters] = useState({
    green: true, yellow: true, red: true, gray: true,
  });

  const [availableFilters, setAvailableFilters] = useState({ cities: [], zips: [] });
  const [selectedProp, setSelectedProp] = useState(null);
  const [comparables, setComparables] = useState([]);
  const [loadingComps, setLoadingComps] = useState(false);
  const [focusCoord, setFocusCoord] = useState(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/opportunities/filters`)
      .then(res => res.json())
      .then(data => setAvailableFilters({ cities: data.cities || [], zips: data.zips || [] }))
      .catch(err => console.error("Failed to fetch filters", err));
  }, []);

  useEffect(() => {
    if (!selectedProp) return;
    setLoadingComps(true);
    setComparables([]);
    fetch(`${API_BASE}/api/opportunities/${selectedProp.id}/comparables`)
      .then(res => res.ok ? res.json() : [])
      .then(data => setComparables(Array.isArray(data) ? data : []))
      .catch(() => setComparables([]))
      .finally(() => setLoadingComps(false));
  }, [selectedProp]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (type === "checkbox") {
      setRoiFilters((prev) => ({ ...prev, [name]: checked }));
    } else {
      setFilters((prev) => {
        const next = { ...prev, [name]: value };
        if (name === "city") next.zip = "";
        if (name === "zip" && value !== "") next.city = "";
        return next;
      });
    }
  };

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-plt-bg">
      {/* Tactical Filter Bar */}
      <div className="bg-plt-panel border-b border-plt-border px-3 sm:px-6 py-3 flex flex-col gap-3 flex-shrink-0 z-10">
        {/* Filters — 2-col grid on mobile, single row on sm+ */}
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-4 sm:items-end">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase font-semibold text-plt-muted tracking-wider">Type</label>
            <select name="listing_type" value={filters.listing_type} onChange={handleChange} className="w-full h-9 text-xs">
              <option value="for_sale">Active Listings</option>
              <option value="sold">Sold History</option>
              <option value="all">All Properties</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase font-semibold text-plt-muted tracking-wider">City</label>
            <select name="city" value={filters.city} onChange={handleChange} className="w-full h-9 text-xs">
              <option value="">All Markets</option>
              {availableFilters.cities.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase font-semibold text-plt-muted tracking-wider">ZIP Code</label>
            <select name="zip" value={filters.zip} onChange={handleChange} className="w-full h-9 text-xs">
              <option value="">All ZIP Codes</option>
              {availableFilters.zips.map(z => <option key={z} value={z}>{z}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase font-semibold text-plt-muted tracking-wider">Min Profit</label>
            <input type="number" name="min_roi" value={filters.min_roi} onChange={handleChange} placeholder="50000" className="w-full h-9 text-xs px-2 font-mono" />
          </div>
        </div>

        {/* ROI Legend */}
        <div className="flex flex-wrap gap-3 sm:gap-4 items-center pt-1 sm:pt-0 sm:border-t-0 border-t border-plt-border/50">
          {['green', 'yellow', 'red', 'gray'].map(color => (
            <label key={color} className="flex items-center gap-2 cursor-pointer group">
              <input type="checkbox" name={color} checked={roiFilters[color]} onChange={handleChange} className="hidden" />
              <div className={`w-3 h-3 rounded-sm border transition-all ${roiFilters[color] ? `bg-opportunity-${color} border-transparent shadow-[0_0_8px_var(--opportunity-${color})]` : 'bg-transparent border-plt-border opacity-30'}`} />
              <span className={`text-[10px] font-semibold uppercase ${roiFilters[color] ? 'text-plt-primary' : 'text-plt-muted'}`}>
                {color === 'green' ? '>$200k' : color === 'yellow' ? '$0–200k' : color === 'red' ? 'Negative' : 'Unscored'}
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className={`flex-1 relative transition-all duration-500 ${selectedProp ? 'mr-0' : ''}`}>
          <OpportunityMap filters={filters} roiFilters={roiFilters} onSelectProperty={setSelectedProp} selectedId={selectedProp?.id} comparables={comparables} focusCoord={focusCoord} />
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
                    <button onClick={() => setSelectedProp(null)} className="p-2 hover:bg-plt-danger/10 text-plt-muted hover:text-plt-danger transition-all rounded flex-shrink-0">
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
                          <span className="text-right font-semibold text-plt-primary">${comp.sold_price?.toLocaleString()}</span>
                          <span className="text-plt-muted">Sold</span>
                          <span className="text-right">{comp.sold_date ? new Date(comp.sold_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'N/A'}</span>
                          <span className="text-plt-muted">Details</span>
                          <span className="text-right font-mono text-[11px]">{comp.sqft?.toLocaleString()} sqft · {comp.year_built}</span>
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
