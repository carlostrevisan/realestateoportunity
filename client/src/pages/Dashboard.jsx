import { useState, useEffect } from "react";
import OpportunityMap from "../components/OpportunityMap.jsx";

const API_BASE = "";

export default function Dashboard() {
  const [filters, setFilters] = useState({
    city: "",
    zip: "",
    min_roi: "",
    max_year_built: "",
    listing_type: "for_sale",
  });

  const [roiFilters, setRoiFilters] = useState({
    green: true,
    yellow: true,
    red: true,
    gray: true,
  });

  const [availableFilters, setAvailableFilters] = useState({
    cities: [],
    zips: []
  });

  // Selection & Comps State
  const [selectedProp, setSelectedProp] = useState(null);
  const [comparables, setComparables] = useState([]);
  const [loadingComps, setLoadingComps] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/opportunities/filters`)
      .then(res => res.json())
      .then(data => {
        setAvailableFilters({
          cities: data.cities || [],
          zips: data.zips || []
        });
      })
      .catch(err => console.error("Failed to fetch filter metadata:", err));
  }, []);

  // Fetch Comps when property selected
  useEffect(() => {
    if (!selectedProp) return;
    setLoadingComps(true);
    setComparables([]); // Clear previous
    
    fetch(`${API_BASE}/api/opportunities/${selectedProp.id}/comparables`)
      .then(res => res.ok ? res.json() : Promise.reject(`Server error: ${res.status}`))
      .then(data => {
        if (Array.isArray(data)) {
          setComparables(data);
        } else {
          setComparables([]);
        }
      })
      .catch(err => {
        console.error("Failed to fetch comparables:", err);
        setComparables([]);
      })
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
    <div className="flex flex-col h-full w-full overflow-hidden">
      {/* Filter bar */}
      <div className="bg-plt-panel border-b border-plt-border px-4 md:px-6 py-2 md:py-3 flex flex-col md:flex-row gap-3 md:gap-4 items-start md:items-end flex-shrink-0">
        <div className="flex flex-wrap gap-3 items-end w-full md:w-auto">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase font-mono text-plt-muted tracking-wider">Type</label>
            <select
              name="listing_type"
              value={filters.listing_type}
              onChange={handleChange}
              className="bg-plt-bg border border-plt-border rounded px-2 md:px-3 py-1.5 text-xs text-plt-primary focus:outline-none focus:border-plt-green"
            >
              <option value="for_sale">Active</option>
              <option value="sold">Sold</option>
              <option value="all">All</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase font-mono text-plt-muted tracking-wider">City</label>
            <select
              name="city"
              value={filters.city}
              onChange={handleChange}
              className="bg-plt-bg border border-plt-border rounded px-2 md:px-3 py-1.5 text-xs text-plt-primary focus:outline-none focus:border-plt-green min-w-[100px]"
            >
              <option value="">All Cities</option>
              {availableFilters.cities.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase font-mono text-plt-muted tracking-wider">ZIP Code</label>
            <select
              name="zip"
              value={filters.zip}
              onChange={handleChange}
              className="bg-plt-bg border border-plt-border rounded px-2 md:px-3 py-1.5 text-xs text-plt-primary focus:outline-none focus:border-plt-green min-w-[100px]"
            >
              <option value="">All ZIPs</option>
              {availableFilters.zips.map((zip) => (
                <option key={zip} value={zip}>
                  {zip}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase font-mono text-plt-muted tracking-wider">Min ROI ($)</label>
            <input
              type="number"
              name="min_roi"
              value={filters.min_roi}
              onChange={handleChange}
              placeholder="e.g. 50000"
              className="bg-plt-bg border border-plt-border rounded px-2 md:px-3 py-1.5 text-xs text-plt-primary w-24 md:w-36 focus:outline-none focus:border-plt-green"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase font-mono text-plt-muted tracking-wider">Built Before</label>
            <input
              type="number"
              name="max_year_built"
              value={filters.max_year_built}
              onChange={handleChange}
              placeholder="e.g. 1985"
              className="bg-plt-bg border border-plt-border rounded px-2 md:px-3 py-1.5 text-xs text-plt-primary w-20 md:w-28 focus:outline-none focus:border-plt-green"
            />
          </div>
        </div>

        {/* Legend / Checkbox Filters */}
        <div className="md:ml-auto flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-mono text-plt-secondary items-center uppercase tracking-wider">
          <label className="flex items-center gap-1.5 cursor-pointer hover:text-plt-primary transition-colors">
            <input type="checkbox" name="green" checked={roiFilters.green} onChange={handleChange} className="w-3 h-3 accent-opportunity-green" />
            <span className="w-2.5 h-2.5 rounded-full bg-opportunity-green inline-block" />
            &gt;$200k
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer hover:text-plt-primary transition-colors">
            <input type="checkbox" name="yellow" checked={roiFilters.yellow} onChange={handleChange} className="w-3 h-3 accent-opportunity-yellow" />
            <span className="w-2.5 h-2.5 rounded-full bg-opportunity-yellow inline-block" />
            $0–$200k
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer hover:text-plt-primary transition-colors">
            <input type="checkbox" name="red" checked={roiFilters.red} onChange={handleChange} className="w-3 h-3 accent-opportunity-red" />
            <span className="w-2.5 h-2.5 rounded-full bg-opportunity-red inline-block" />
            Negative
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer hover:text-plt-primary transition-colors">
            <input type="checkbox" name="gray" checked={roiFilters.gray} onChange={handleChange} className="w-3 h-3 accent-opportunity-gray" />
            <span className="w-2.5 h-2.5 rounded-full bg-opportunity-gray inline-block" />
            N/A
          </label>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Map Container */}
        <div className={`flex-1 relative min-h-0 transition-all duration-300 ${selectedProp ? 'hidden md:block' : 'block'}`}>
          <OpportunityMap 
            filters={filters} 
            roiFilters={roiFilters} 
            onSelectProperty={setSelectedProp}
            selectedId={selectedProp?.id}
          />
        </div>

        {/* Comparable Sidebar */}
        <aside className={`${selectedProp ? 'w-full md:w-[400px]' : 'w-0'} bg-plt-panel border-l border-plt-border flex flex-col transition-all duration-300 overflow-hidden shadow-2xl z-[1001]`}>
          {selectedProp && (() => {
            const searchAddress = `${selectedProp.address}, ${selectedProp.city}, FL ${selectedProp.zip}`;
            const realtorUrl = `https://www.realtor.com/realestateandhomes-search/${encodeURIComponent(searchAddress)}`;
            const zillowZipUrl = `https://www.zillow.com/homes/${selectedProp.zip}_rb/`;

            return (
              <div className="flex flex-col h-full">
                {/* Header */}
                <div className="p-4 border-b border-plt-border flex justify-between items-start bg-plt-bg">
                  <div>
                    <h3 className="text-sm font-bold uppercase tracking-tight leading-tight">{selectedProp.address}</h3>
                    <p className="text-[10px] text-plt-muted font-mono mt-0.5">{selectedProp.city}, FL {selectedProp.zip}</p>
                  </div>
                  <button 
                    onClick={() => setSelectedProp(null)}
                    className="p-1.5 hover:bg-plt-hover rounded transition-colors text-plt-secondary"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>

                {/* Main Action Links */}
                <div className="px-4 py-3 bg-plt-bg border-b border-plt-border grid grid-cols-2 gap-2">
                  <a href={realtorUrl} target="_blank" rel="noopener noreferrer" 
                     className="bg-plt-accent text-white text-[10px] font-bold py-2 px-3 rounded text-center uppercase tracking-wider hover:bg-plt-accent-dim transition-colors">
                    View on Realtor
                  </a>
                  <a href={zillowZipUrl} target="_blank" rel="noopener noreferrer" 
                     className="border border-plt-accent text-plt-accent text-[10px] font-bold py-2 px-3 rounded text-center uppercase tracking-wider hover:bg-plt-accent/5 transition-colors">
                    Market (Zillow)
                  </a>
                </div>

                {/* Detailed Stats */}
                <div className="p-4 space-y-4 border-b border-plt-border bg-plt-panel/50">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col">
                      <span className="text-[9px] text-plt-muted uppercase font-mono mb-0.5">Opportunity Result</span>
                      <span className={`text-base font-bold font-mono ${selectedProp.opportunity_result > 0 ? 'text-plt-green' : 'text-red-500'}`}>
                        ${selectedProp.opportunity_result?.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[9px] text-plt-muted uppercase font-mono mb-0.5">Current Price</span>
                      <span className="text-base font-bold font-mono">${selectedProp.list_price?.toLocaleString()}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 py-3 border-t border-plt-border/50">
                    <div className="flex flex-col">
                      <span className="text-[8px] text-plt-muted uppercase font-mono">Area</span>
                      <span className="text-xs font-semibold">{selectedProp.sqft?.toLocaleString()} <span className="text-[10px] font-normal text-plt-muted">sf</span></span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[8px] text-plt-muted uppercase font-mono">Built</span>
                      <span className="text-xs font-semibold">{selectedProp.year_built}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[8px] text-plt-muted uppercase font-mono">Type</span>
                      <span className="text-xs font-semibold uppercase truncate">{selectedProp.listing_type?.replace('_', ' ')}</span>
                    </div>
                  </div>
                </div>

                {/* Comps List */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-plt-bg/20">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-[10px] font-bold text-plt-secondary uppercase tracking-widest flex items-center gap-2">
                      <span className="w-1 h-1 bg-plt-accent rounded-full animate-pulse" />
                      Comparable Sold Listings
                    </h4>
                    {loadingComps && <div className="w-3 h-3 border-2 border-plt-accent border-t-transparent animate-spin rounded-full" />}
                  </div>

                  {comparables.length === 0 && !loadingComps && (
                    <div className="text-[10px] text-plt-muted italic py-10 text-center border border-dashed border-plt-border rounded-lg">No recent comparable sales found in this ZIP.</div>
                  )}

                  {comparables.map(comp => {
                    const isNewBuild = comp.year_built > 2015;
                    const soldDateStr = comp.sold_date ? new Date(comp.sold_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'N/A';
                    
                    return (
                      <div key={comp.id} className={`p-3 rounded-lg border transition-all hover:shadow-md ${isNewBuild ? 'bg-plt-accent/5 border-plt-accent/30' : 'bg-plt-bg border-plt-border'}`}>
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-[10px] font-bold truncate pr-2">{comp.address}</span>
                          {isNewBuild && (
                            <span className="bg-plt-accent text-white text-[8px] font-bold px-1.5 py-0.5 rounded uppercase tracking-tighter shrink-0">New Build</span>
                          )}
                        </div>
                        
                        <div className="grid grid-cols-2 gap-y-1.5 text-[10px] font-mono border-t border-plt-border/20 pt-2">
                          <span className="text-plt-muted uppercase text-[9px]">Sold For:</span>
                          <span className="text-right font-bold text-plt-primary">${comp.sold_price?.toLocaleString()}</span>
                          
                          <span className="text-plt-muted uppercase text-[9px]">Sold Date:</span>
                          <span className="text-right font-semibold">{soldDateStr}</span>
                          
                          <span className="text-plt-muted uppercase text-[9px]">Specifications:</span>
                          <span className="text-right">{comp.sqft} sf · {comp.year_built}</span>
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
