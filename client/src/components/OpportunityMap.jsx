import { useEffect, useState, useMemo, useRef } from "react";
import L from "leaflet";
import { formatCityName, buildZillowUrl } from "../lib/utils";

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
  gray: "#94a3b8",
};

const MAP_CENTER = [27.7663, -81.6868];
const MAP_ZOOM   = 7;

/**
 * Builds an inline-styled HTML string for Leaflet popups.
 * All three marker types (main, comparable, new build) share the same outer
 * chrome, grid layout, and Zillow button — only the content differs.
 *
 * When `addressLine` is null the `header` is assumed to be the address itself
 * (main marker style: uppercase location, 11px header). When `addressLine` is
 * provided the header is a type label and the address appears below it.
 */
function buildPopupHtml({ minWidth = 180, header, headerFontSize = 10, headerColor = null,
                          addressLine = null, location, rows, zillowUrl,
                          buttonLabel = "View on Zillow", buttonColor }) {
  const headerColorStyle  = headerColor ? `color:${headerColor};` : '';
  const locationWeight    = addressLine ? '600' : '700';
  const locationTransform = addressLine ? 'none' : 'uppercase';
  const addressHtml = addressLine
    ? `<div style="font-weight:700;font-size:12px;margin-bottom:2px;">${addressLine}</div>`
    : '';
  const rowsHtml = rows.map(([label, value, valueStyle = '']) =>
    `<span style="color:#64748b;font-weight:600;">${label}</span><span style="${valueStyle}">${value}</span>`
  ).join('');
  return `
    <div style="min-width:${minWidth}px;font-family:'Plus Jakarta Sans',sans-serif;color:#0f172a;padding:4px;">
      <div style="font-weight:800;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e2e8f0;padding-bottom:6px;margin-bottom:8px;font-size:${headerFontSize}px;${headerColorStyle}">${header}</div>
      ${addressHtml}
      <div style="color:#64748b;font-size:10px;font-weight:${locationWeight};text-transform:${locationTransform};margin-bottom:10px;">${location}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:11px;margin-bottom:12px;background:#f8fafc;padding:10px;border-radius:4px;border:1px solid #e2e8f0;">${rowsHtml}</div>
      <a href="${zillowUrl}" target="_blank" rel="noopener noreferrer"
         style="display:block;text-align:center;background:${buttonColor};color:white;text-decoration:none;padding:8px;border-radius:4px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.05em;">${buttonLabel}</a>
    </div>`;
}

export default function OpportunityMap({ filters, roiFilters, onSelectProperty, selectedId, comparables = [], focusCoord = null, newBuilds = [] }) {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markersLayer = useRef(L.layerGroup());
  const comparablesLayer = useRef(L.layerGroup());
  const newBuildsLayer = useRef(L.layerGroup());
  const compMarkersMap = useRef({});

  const [geojson, setGeojson] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [mapReady, setMapReady] = useState(false);
  const prevSelectedIdRef = useRef(null);

  // 1. Initialize Map
  useEffect(() => {
    if (mapInstance.current) return;

    const timer = setTimeout(() => {
      if (!mapRef.current) return;

      const map = L.map(mapRef.current, {
        center: MAP_CENTER,
        zoom: MAP_ZOOM,
        zoomControl: false,
        attributionControl: true,
        fadeAnimation: false,
        zoomAnimation: true,
        markerZoomAnimation: true
      });

      L.control.zoom({ position: 'bottomright' }).addTo(map);
      markersLayer.current.addTo(map);
      comparablesLayer.current.addTo(map);
      newBuildsLayer.current.addTo(map);
      mapInstance.current = map;
      setMapReady(true);

      // Assertive Light Tactical Tiles
      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png", {
        attribution: '&copy; CARTO',
        subdomains: 'abcd',
        maxZoom: 20,
        updateWhenIdle: true,
        keepBuffer: 2
      }).addTo(map);

      map.invalidateSize();
    }, 300);

    const resizeObserver = new ResizeObserver(() => {
      if (mapInstance.current) {
        mapInstance.current.invalidateSize();
      }
    });

    if (mapRef.current) resizeObserver.observe(mapRef.current);

    return () => {
      clearTimeout(timer);
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
      resizeObserver.disconnect();
    };
  }, []);

  // 2. Fetch Data
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

  // 3. Update Markers
  const visibleCount = useMemo(() => {
    if (!geojson?.features) return 0;
    return geojson.features.filter(f => {
      const colorKey = f.properties.roi_color || 'gray';
      return !roiFilters || roiFilters[colorKey];
    }).length;
  }, [geojson, roiFilters]);

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

      if (roiFilters && !roiFilters[colorKey]) return;

      validCoords.push([lat, lng]);
      const color = COLOR_MAP[colorKey] || COLOR_MAP.gray;
      const isSelected = selectedId === p.id;

      const marker = L.circleMarker([lat, lng], {
        radius: isSelected ? 10 : 7,
        fillColor: color,
        color: isSelected ? '#000' : color,
        weight: isSelected ? 3 : 1,
        opacity: 1,
        fillOpacity: 0.8
      });

      const cityDisplay      = formatCityName(p.city);
      const zillowListingUrl = buildZillowUrl(p.address, cityDisplay, p.zip);
      const popupHtml = buildPopupHtml({
        minWidth: 200, header: p.address, headerFontSize: 11,
        location: `${cityDisplay}, FL ${p.zip}`,
        rows: [
          ['EST. PROFIT', `$${p.opportunity_result?.toLocaleString() || '0'}`, `color:${color};font-weight:800;`],
          ['LIVING AREA', `${p.sqft?.toLocaleString() || 'N/A'} SQFT`,        'font-weight:700;'],
        ],
        zillowUrl: zillowListingUrl, buttonColor: '#2563eb',
      });

      marker.bindPopup(popupHtml);
      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        if (onSelectProperty) onSelectProperty(p);
        if (window.innerWidth >= 768) {
          map.setView(e.target.getLatLng(), Math.max(map.getZoom(), 15));
        }
      });
      marker.addTo(layer);
    });

    const wasDeselecting = prevSelectedIdRef.current !== null && !selectedId;
    prevSelectedIdRef.current = selectedId;

    if (validCoords.length > 0 && !selectedId && !wasDeselecting) {
      const bounds = L.latLngBounds(validCoords);
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    }
  }, [geojson, roiFilters, selectedId, mapReady]);

  // 4. Pan to focusCoord
  useEffect(() => {
    if (focusCoord && mapInstance.current) {
      const map = mapInstance.current;
      map.setView(focusCoord, 16);

      const key = `${focusCoord[0]},${focusCoord[1]}`;
      const marker = compMarkersMap.current[key];
      if (marker) {
        marker.openPopup();
      }
    }
  }, [focusCoord]);

  // 5. Comparable markers
  useEffect(() => {
    const layer = comparablesLayer.current;
    layer.clearLayers();
    compMarkersMap.current = {};
    if (!mapInstance.current) return;

    comparables.forEach(comp => {
      if (!comp.lat || !comp.lng) return;
      const isNew = comp.year_built >= 2015;
      const fillColor = isNew ? "#06b6d4" : "#8b5cf6";

      const marker = L.circleMarker([comp.lat, comp.lng], {
        radius: 6,
        fillColor,
        color: "#fff",
        weight: 2,
        opacity: 1,
        fillOpacity: 0.9,
      });

      const cityDisplay = formatCityName(comp.city);
      const zillowUrl   = buildZillowUrl(comp.address, cityDisplay, comp.zip);
      const popupHtml = buildPopupHtml({
        header: isNew ? 'NEW BUILD COMP' : 'OLDER COMP',
        addressLine: comp.address, location: `${cityDisplay}, FL ${comp.zip}`,
        rows: [
          ['SALE PRICE', `$${comp.sold_price?.toLocaleString() || '—'}`, 'font-weight:800;'],
          ['SIZE',       `${comp.sqft?.toLocaleString() || '—'} SQFT`,   'font-weight:700;'],
        ],
        zillowUrl, buttonLabel: 'Find on Zillow', buttonColor: fillColor,
      });

      marker.bindPopup(popupHtml);
      marker.addTo(layer);

      // Store marker in map by coordinate key or some stable identifier
      const key = `${comp.lat},${comp.lng}`;
      compMarkersMap.current[key] = marker;
    });
  }, [comparables]);

  // 6. Active New Builds markers (Market Context)
  useEffect(() => {
    const layer = newBuildsLayer.current;
    layer.clearLayers();
    if (!mapInstance.current) return;

    newBuilds.forEach(f => {
      const coords = f.geometry.coordinates;
      if (!coords || coords.length < 2) return;
      const [lng, lat] = coords;
      const p = f.properties;

      const marker = L.circleMarker([lat, lng], {
        radius: 5,
        fillColor: "#3b82f6",
        color: "#fff",
        weight: 1,
        opacity: 1,
        fillOpacity: 0.7,
      });

      const cityDisplay = formatCityName(p.city);
      const zillowUrl   = buildZillowUrl(p.address, cityDisplay, p.zip);
      const popupHtml = buildPopupHtml({
        header: 'MARKET CONTEXT (NEW BUILD)', headerColor: '#3b82f6',
        addressLine: p.address, location: `${cityDisplay}, FL ${p.zip}`,
        rows: [
          ['LIST PRICE', `$${p.list_price?.toLocaleString() || '—'}`, 'font-weight:800;'],
          ['SIZE',       `${p.sqft?.toLocaleString() || '—'} SQFT`,   'font-weight:700;'],
        ],
        zillowUrl, buttonColor: '#3b82f6',
      });

      marker.bindPopup(popupHtml);
      marker.addTo(layer);
    });
  }, [newBuilds]);

  return (
    <div className="w-full h-full relative bg-plt-bg overflow-hidden flex flex-col">
      <div className={`absolute top-4 left-4 right-4 z-[1000] items-center justify-between pointer-events-none ${selectedId ? 'hidden md:flex' : 'flex'}`}>
        <div className="flex gap-2 pointer-events-auto">
          <div className="bg-white/90 backdrop-blur-md border border-plt-border/60 px-4 py-2 rounded-lg shadow-md text-[10px] font-bold uppercase tracking-widest flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${loading ? 'bg-plt-accent animate-pulse' : 'bg-plt-accent'}`} />
            <span className="text-plt-primary">
              {loading ? "Syncing..." : (() => {
                const total = geojson?.meta?.total || 0;
                const showing = visibleCount;
                return total > showing ? `${total.toLocaleString()} found (${showing.toLocaleString()} visible)` : `${showing.toLocaleString()} Properties`;
              })()}
            </span>
          </div>
          <button
            onClick={() => {
              if (onSelectProperty) onSelectProperty(null);
              mapInstance.current?.setView(MAP_CENTER, MAP_ZOOM);
            }}
            className="bg-white/90 backdrop-blur-md border border-plt-border/60 px-4 py-2 rounded-lg shadow-md text-[10px] font-bold uppercase tracking-widest text-plt-secondary hover:text-plt-accent transition-all active:scale-[0.98]"
          >
            Reset Orientation
          </button>
        </div>

        {error && (
          <div className="bg-white/90 backdrop-blur-md border border-plt-danger/60 text-plt-danger px-4 py-2 rounded-lg shadow-md text-[10px] font-bold uppercase tracking-widest pointer-events-auto">
            Telemetry Error: {error}
          </div>
        )}
      </div>

      <div ref={mapRef} className="flex-1 w-full h-full" style={{ zIndex: 1, backgroundColor: '#f1f5f9' }} />

      <div className={`absolute bottom-6 right-4 z-[1000] pointer-events-none ${selectedId ? 'hidden md:block' : ''}`}>
        <div className="bg-white/90 backdrop-blur-md border border-plt-border/60 rounded-lg shadow-md px-4 py-3 space-y-1.5 pointer-events-auto">
          <div className="text-[9px] font-black uppercase tracking-[0.2em] text-plt-muted mb-2 border-b border-plt-border pb-1.5">Map Key</div>
          {[
            { color: COLOR_MAP.green,  label: "High Yield" },
            { color: COLOR_MAP.yellow, label: "Mid Yield" },
            { color: COLOR_MAP.red,    label: "Negative" },
            { color: "#3b82f6",        label: "Active New Build" },
            { color: "#06b6d4",        label: "Sold New Build" },
            { color: "#8b5cf6",        label: "Older Comp" },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-2.5">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
              <span className="text-[9px] font-bold uppercase tracking-wider text-plt-secondary">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
