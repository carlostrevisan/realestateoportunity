import { useEffect, useState, useMemo, useRef } from "react";
import L from "leaflet";

const API_BASE = "";

// ── Florida geographic constraints ──────────────────────────────────
const FL_BOUNDS = {
  lat: [24.0, 31.5],
  lng: [-88.0, -79.0]
};

function isValidFL(lat, lng) {
  return lat >= FL_BOUNDS.lat[0] && lat <= FL_BOUNDS.lat[1] &&
         lng >= FL_BOUNDS.lng[0] && lng <= FL_BOUNDS.lng[1];
}

const COLOR_MAP = {
  green: "#10b981", 
  yellow: "#f59e0b",
  red: "#ef4444",
  gray: "#a1a1aa",
};

export default function OpportunityMap({ filters, roiFilters, onSelectProperty, selectedId, comparables = [], focusCoord = null }) {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markersLayer = useRef(L.layerGroup());
  const comparablesLayer = useRef(L.layerGroup());
  
  const [geojson, setGeojson] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isDark, setIsDark] = useState(document.documentElement.classList.contains("dark"));

  // 1. Initialize Map with size validation
  useEffect(() => {
    if (mapInstance.current) return;

    // Small delay to ensure parent styles are applied
    const timer = setTimeout(() => {
      if (!mapRef.current) return;
      
      const map = L.map(mapRef.current, {
        center: [27.7663, -81.6868],
        zoom: 7,
        zoomControl: false,
        attributionControl: true,
        fadeAnimation: false,
        zoomAnimation: true,
        markerZoomAnimation: true
      });

      L.control.zoom({ position: 'bottomright' }).addTo(map);
      markersLayer.current.addTo(map);
      comparablesLayer.current.addTo(map);
      mapInstance.current = map;

      // Force initial tile load
      updateTiles(map, document.documentElement.classList.contains("dark"));
      
      // Force size update immediately
      map.invalidateSize();
    }, 300);

    // Robust resize handling
    const resizeObserver = new ResizeObserver(() => {
      if (mapInstance.current) {
        mapInstance.current.invalidateSize();
      }
    });

    if (mapRef.current) {
      resizeObserver.observe(mapRef.current);
    }

    return () => {
      clearTimeout(timer);
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
      resizeObserver.disconnect();
    };
  }, []);

  const updateTiles = (map, dark) => {
    if (!map) return;
    
    // Clear existing tiles
    map.eachLayer((layer) => {
      if (layer instanceof L.TileLayer) map.removeLayer(layer);
    });

    const tileUrl = dark 
      ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"
      : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png";

    L.tileLayer(tileUrl, {
      attribution: '&copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 20,
      updateWhenIdle: true,
      keepBuffer: 2
    }).addTo(map);
  };

  // 2. Handle Theme Changes
  useEffect(() => {
    const obs = new MutationObserver(() => {
      const dark = document.documentElement.classList.contains("dark");
      setIsDark(dark);
      if (mapInstance.current) {
        updateTiles(mapInstance.current, dark);
      }
    });
    
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    
    return () => obs.disconnect();
  }, []);

  // 3. Fetch Data
  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (filters.city) p.set("city", filters.city);
    if (filters.zip) p.set("zip", filters.zip);
    if (filters.min_roi) p.set("min_roi", filters.min_roi);
    if (filters.max_year_built) p.set("max_year_built", filters.max_year_built);
    if (filters.listing_type) p.set("listing_type", filters.listing_type);
    return p.toString();
  }, [filters]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`${API_BASE}/api/opportunities?${queryString}`)
      .then(res => res.ok ? res.json() : Promise.reject(`Server error: ${res.status}`))
      .then(setGeojson)
      .catch(err => setError(err.toString()))
      .finally(() => setLoading(false));
  }, [queryString]);

  // 4. Update Markers & Selection
  useEffect(() => {
    if (!mapInstance.current || !geojson) return;
    const map = mapInstance.current;
    const layer = markersLayer.current;
    layer.clearLayers();

    const features = geojson.features || [];
    const validCoords = [];

    features.forEach(f => {
      const coords = f.geometry.coordinates;
      if (!coords || coords.length < 2) return;
      const [lng, lat] = coords;
      if (!isValidFL(lat, lng)) return;

      const p = f.properties;
      const colorKey = p.roi_color || 'gray';
      
      // Filter by ROI selection (if roiFilters is provided)
      if (roiFilters && !roiFilters[colorKey]) {
        return;
      }

      validCoords.push([lat, lng]);
      const color = COLOR_MAP[colorKey] || COLOR_MAP.gray;
      const isSelected = selectedId === p.id;

      const marker = L.circleMarker([lat, lng], {
        radius: isSelected ? 10 : 7,
        fillColor: color,
        color: isSelected ? 'white' : color,
        weight: isSelected ? 3 : 1,
        opacity: 1,
        fillOpacity: 0.8
      });

      const cityDisplay = p.city ? p.city.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : '';
      const zillowListingUrl = `https://www.zillow.com/homes/${encodeURIComponent(`${p.address}, ${cityDisplay}, FL ${p.zip}`)}_rb/`;
      const zillowAreaUrl = `https://www.zillow.com/homes/${p.zip}_rb/`;

      const popupHtml = `
        <div style="min-width: 200px; font-family: sans-serif; color: #333; padding: 4px;">
          <div style="font-weight: 600; border-bottom: 1px solid #eee; padding-bottom: 6px; margin-bottom: 8px; font-size: 12px;">
            ${p.address}
          </div>
          <div style="color: #666; font-size: 11px; margin-bottom: 10px;">
            ${cityDisplay}, FL ${p.zip}
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 12px; margin-bottom: 12px; background: #f9f9f9; padding: 8px; border-radius: 4px;">
            <span style="color: #888;">Est. Profit</span>
            <span style="color: ${color}; font-weight: 600;">$${p.opportunity_result?.toLocaleString() || '0'}</span>
            <span style="color: #888;">Size</span>
            <span>${p.sqft?.toLocaleString() || 'N/A'} sqft</span>
            <span style="color: #888;">Built</span>
            <span>${p.year_built}</span>
          </div>

          <div style="display: flex; flex-direction: column; gap: 4px;">
            <a href="${zillowListingUrl}" target="_blank" rel="noopener noreferrer"
               style="display: block; text-align: center; background: #3b82f6; color: white; text-decoration: none; padding: 7px; border-radius: 4px; font-size: 11px; font-weight: 600;">
               Find on Zillow
            </a>
            <a href="${zillowAreaUrl}" target="_blank" rel="noopener noreferrer"
               style="display: block; text-align: center; border: 1px solid #3b82f6; color: #3b82f6; text-decoration: none; padding: 6px; border-radius: 4px; font-size: 11px; font-weight: 600;">
               Browse Area
            </a>
          </div>
        </div>
      `;

      marker.bindPopup(popupHtml);
      
      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        if (onSelectProperty) onSelectProperty(p);
        map.setView(e.target.getLatLng(), Math.max(map.getZoom(), 15));
      });

      marker.addTo(layer);
    });

    // Auto-zoom only if not currently selecting a property
    if (validCoords.length > 0 && !selectedId) {
      const bounds = L.latLngBounds(validCoords);
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    }
  }, [geojson, roiFilters, selectedId]);

  // 5. Pan to focusCoord when requested
  useEffect(() => {
    if (focusCoord && mapInstance.current) {
      mapInstance.current.setView(focusCoord, 16);
    }
  }, [focusCoord]);

  // 6. Render comparable markers
  useEffect(() => {
    const layer = comparablesLayer.current;
    layer.clearLayers();
    if (!mapInstance.current) return;

    comparables.forEach(comp => {
      if (!comp.lat || !comp.lng) return;
      if (!isValidFL(comp.lat, comp.lng)) return;

      const isNew = comp.year_built >= 2015;
      const fillColor = isNew ? "#06b6d4" : "#8b5cf6";

      const marker = L.circleMarker([comp.lat, comp.lng], {
        radius: 6,
        fillColor,
        color: "#fff",
        weight: 2,
        opacity: 1,
        fillOpacity: 0.85,
      });

      const soldDateStr = comp.sold_date
        ? new Date(comp.sold_date).toLocaleDateString("en-US", { month: "short", year: "numeric" })
        : "N/A";
      const newBadge = isNew ? " · <strong>New Build</strong>" : "";
      marker.bindPopup(`
        <div style="font-family:sans-serif;font-size:12px;min-width:180px;padding:2px">
          <div style="font-weight:600;margin-bottom:4px">${comp.address} · ${comp.city || ""}</div>
          <div>Sold <strong>$${comp.sold_price?.toLocaleString()}</strong> · ${soldDateStr}</div>
          <div style="color:#666;margin-top:2px">${comp.sqft?.toLocaleString()} sqft · Built ${comp.year_built}${newBadge}</div>
        </div>
      `);

      marker.addTo(layer);
    });
  }, [comparables]);

  return (
    <div className="w-full h-full relative bg-plt-bg overflow-hidden flex flex-col">
      {/* Overlay UI */}
      <div className="absolute top-3 left-3 right-3 z-[1000] flex items-center justify-between pointer-events-none">
        <div className="flex gap-2 pointer-events-auto">
          <div className="bg-white dark:bg-plt-panel border border-plt-border px-3 py-1.5 rounded shadow-lg text-xs flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${loading ? 'bg-plt-accent animate-pulse' : 'bg-plt-accent'}`} />
            <span className="text-plt-primary font-medium">
              {loading ? "Loading..." : `${geojson?.features?.length || 0} properties`}
            </span>
          </div>
          <button
            onClick={() => {
              if (onSelectProperty) onSelectProperty(null);
              mapInstance.current?.setView([27.7663, -81.6868], 7);
            }}
            className="bg-white dark:bg-plt-panel border border-plt-border px-3 py-1.5 rounded shadow-lg text-xs text-plt-secondary hover:text-plt-primary font-medium transition-colors"
          >
            Reset view
          </button>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/5 text-red-600 dark:text-red-400 px-3 py-1.5 rounded shadow-lg text-xs pointer-events-auto font-medium">
            {error}
          </div>
        )}
      </div>

      {/* Map Container */}
      <div
        ref={mapRef}
        className="flex-1 w-full h-full"
        style={{ zIndex: 1, backgroundColor: isDark ? '#07090f' : '#f4f4f5' }}
      />

      {/* Map Legend */}
      {comparables.length > 0 && (
        <div
          className="absolute bottom-10 right-3 z-[1000] pointer-events-none"
          style={{ fontSize: "10px", lineHeight: "1.6" }}
        >
          <div className="bg-white dark:bg-plt-panel border border-plt-border rounded shadow-lg px-3 py-2 text-plt-primary space-y-0.5">
            {[
              { color: "#10b981", label: "> $200k profit" },
              { color: "#f59e0b", label: "$0–200k" },
              { color: "#ef4444", label: "Loss" },
              { color: "#a1a1aa", label: "Unscored" },
            ].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-2">
                <span style={{ color, fontSize: 14 }}>●</span>
                <span className="text-plt-muted">{label}</span>
              </div>
            ))}
            <div className="border-t border-plt-border/50 my-1" />
            <div className="flex items-center gap-2">
              <span style={{ color: "#06b6d4", fontSize: 14 }}>●</span>
              <span className="text-plt-muted">Comp · New Build</span>
            </div>
            <div className="flex items-center gap-2">
              <span style={{ color: "#8b5cf6", fontSize: 14 }}>●</span>
              <span className="text-plt-muted">Comp · Older</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
