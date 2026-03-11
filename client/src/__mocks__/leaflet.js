// Manual Leaflet stub for jsdom tests.
// Leaflet relies on browser DOM/Canvas APIs that jsdom does not provide.
// This stub prevents import errors without affecting any test assertions
// (OpportunityMap is mocked at the component level in page tests).

const noop = () => {};
const noopObj = { on: noop, off: noop, addTo: noop, remove: noop, setLatLng: noop, openPopup: noop, addLayer: noop, removeLayer: noop, clearLayers: noop, setView: noop, fitBounds: noop, invalidateSize: noop };

const leaflet = {
  map: () => ({ ...noopObj, addLayer: noop, removeLayer: noop }),
  tileLayer: () => noopObj,
  layerGroup: () => ({ ...noopObj, getLayers: () => [] }),
  circleMarker: () => ({ ...noopObj, getLatLng: () => ({ lat: 0, lng: 0 }), bindPopup: () => noopObj }),
  popup: () => ({ ...noopObj, setContent: () => noopObj }),
  latLngBounds: () => noopObj,
  Icon: { Default: { mergeOptions: noop } },
  DomEvent: { on: noop, off: noop },
  Browser: { mobile: false },
  extend: (base, props) => ({ ...base, ...props }),
};

export default leaflet;
export const { map, tileLayer, layerGroup, circleMarker, popup, latLngBounds, Icon, DomEvent, Browser, extend } = leaflet;
