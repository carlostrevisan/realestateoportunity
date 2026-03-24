import { http, HttpResponse } from "msw";

// ---------------------------------------------------------------------------
// Fixture data — minimal valid shapes for every API endpoint the app uses
// ---------------------------------------------------------------------------

const FILTERS_FIXTURE = {
  cities: ["Tampa", "Orlando"],
  zips: ["33606", "33629", "32803"],
};

const GEOJSON_FIXTURE = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [-82.458, 27.948] },
      properties: {
        id: 1,
        mls_id: "MLS001",
        address: "123 Oak St",
        city: "Tampa",
        zip: "33606",
        year_built: 1965,
        sqft: 1800,
        lot_sqft: 7500,
        list_price: 450000,
        sold_price: null,
        sold_date: null,
        listing_type: "for_sale",
        predicted_rebuild_value: 720000,
        opportunity_result: 115000,
        construction_cost_per_sqft: 175,
        roi_color: "yellow",
      },
    },
  ],
  meta: { total: 1, showing: 1, limit: 1000, listing_type: "for_sale" },
};

const COMPARABLES_FIXTURE = [
  {
    id: 2,
    address: "456 Elm Ave",
    city: "Tampa",
    zip: "33606",
    year_built: 2019,
    sqft: 1750,
    sold_price: 680000,
    sold_date: "2024-06-15",
    lat: 27.949,
    lng: -82.459,
    distance_mi: 0.12,
  },
];

const ML_STATUS_FIXTURE = {
  train: { run_id: 1, status: "completed", properties_trained: 342, r2_score: 0.87 },
  score: { run_id: 2, status: "completed", properties_scored: 128 },
  score_weighted: null,
  counts: {
    for_sale: { total: 128, scored: 128, unscored: 0 },
    sold: { total: 342, scored: 0, unscored: 342 },
  },
};

const SCRAPE_STATUS_FIXTURE = {
  scrape_status: [
    { zip: "33606", listing_type: "for_sale", property_count: "45", last_scraped: "2026-03-11T00:00:00Z", earliest_sale: null, latest_sale: null },
    { zip: "33606", listing_type: "sold", property_count: "342", last_scraped: "2026-03-11T00:00:00Z", earliest_sale: null, latest_sale: null },
  ],
};

const JOBS_FIXTURE = [
  { id: "abc123", type: "scrape", status: "completed", started_at: "2026-03-11T10:00:00Z", completed_at: "2026-03-11T10:05:00Z" },
];

// ---------------------------------------------------------------------------
// MSW handlers — intercept fetch() calls from the React components
// ---------------------------------------------------------------------------

export const handlers = [
  http.get("/api/opportunities/filters", () =>
    HttpResponse.json(FILTERS_FIXTURE)
  ),

  http.get("/api/opportunities", () =>
    HttpResponse.json(GEOJSON_FIXTURE)
  ),

  http.get("/api/opportunities/:id/comparables", () =>
    HttpResponse.json(COMPARABLES_FIXTURE)
  ),

  http.get("/api/ml/status", () =>
    HttpResponse.json(ML_STATUS_FIXTURE)
  ),

  http.get("/api/scrape/status", () =>
    HttpResponse.json(SCRAPE_STATUS_FIXTURE)
  ),

  http.get("/api/jobs", () =>
    HttpResponse.json(JOBS_FIXTURE)
  ),

  http.get("/api/jobs/:id", ({ params }) =>
    HttpResponse.json({ ...JOBS_FIXTURE[0], id: params.id, logs: ["[EXEC] Job started", "[LOAD] 45 records"] })
  ),

  http.post("/api/scrape/trigger", () =>
    HttpResponse.json({ job_id: "new-job-1", status: "pending" })
  ),

  http.post("/api/ml/train", () =>
    HttpResponse.json({ job_id: "train-job-1", status: "pending" })
  ),

  http.get("/api/ml/models", () =>
    HttpResponse.json([])
  ),

  http.get("/api/ml/results", () =>
    HttpResponse.json({
      distribution: [
        { label: "$0–50k", count: 10, color: "yellow" },
        { label: "$200–500k", count: 5, color: "green" },
      ],
      totals: { green: 5, yellow: 10, red: 0, total: 15 },
      avg_opportunity: 150000,
    })
  ),

  http.get("/api/ml/ops-log", () =>
    HttpResponse.json([
      { id: 1, type: "train", status: "completed", started_at: new Date().toISOString() },
    ])
  ),
];
