# System Architecture

## Overview
Florida Real Estate Opportunity Engine — identifies "Buy, Demolish, Rebuild" investment candidates.

## Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                         DATA INGESTION                               │
│                                                                       │
│  Realtor.com (MLS)          U.S. Census Bureau                       │
│       │                           │                                   │
│       ▼                           ▼                                   │
│  scraper.py              census_fetcher.py                           │
│  (HomeHarvest,           (Public API, keyless,                       │
│   monthly chunks,         500 req/day limit)                         │
│   rate-limited)                   │                                   │
│       │                           │                                   │
│       ▼                           │                                   │
│  cleaner.py                       │                                   │
│  (SF only, $100k-$5M,            │                                   │
│   yr>1901, sqft<5000)            │                                   │
│       │                           │                                   │
│       └──────────┬────────────────┘                                   │
│                  ▼                                                    │
│           ┌─────────────┐                                             │
│           │ PostgreSQL  │                                             │
│           │             │                                             │
│           │  properties │◄─── ml_model.py (XGBoost scoring)         │
│           │  zip_income │     opportunity_result = predicted_value   │
│           └─────────────┘     - (acquisition + construction cost)    │
└─────────────────────────────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                           API LAYER                                   │
│                                                                       │
│                    Express.js (port 4000)                            │
│                                                                       │
│  GET  /api/opportunities   → GeoJSON FeatureCollection               │
│  POST /api/scrape/trigger  → Kicks off data-worker job               │
│  GET  /api/export/csv      → CSV download of filtered results        │
└─────────────────────────────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        FRONTEND (port 3000)                           │
│                                                                       │
│  Dashboard.jsx                                                        │
│  ├── OpportunityMap.jsx   (React-Leaflet, GeoJSON overlay)           │
│  │   └── Color-coded pins: green >$200k, yellow $0-$200k, red <$0   │
│  │                                                                    │
│  ModelingTool.jsx                                                     │
│  └── ModelingSliders.jsx  (Adjust construction cost $/sqft,          │
│                            recalculate opportunity_result live)       │
│                                                                       │
│  DataCenter.jsx                                                       │
│  └── DataCenterPanel.jsx  (Trigger scrape, export CSV, view logs)    │
└─────────────────────────────────────────────────────────────────────┘

## Service Topology (Docker Compose)

```
┌────────────────────────────────────────────────────────┐
│                    Docker Network                        │
│                                                          │
│  ┌──────────┐    ┌──────────┐    ┌────────────────┐    │
│  │ frontend │───►│ backend  │───►│      db         │    │
│  │ :3000    │    │ :4000    │    │ postgres:5432   │    │
│  └──────────┘    └──────────┘    └────────┬───────┘    │
│                                            │             │
│  ┌─────────────┐                   postgres_data        │
│  │ data-worker │──────────────────► (named volume)      │
│  │ (no port)   │                                         │
│  └─────────────┘                                         │
└────────────────────────────────────────────────────────┘
```

## Database Schema

```sql
-- Primary data table
CREATE TABLE properties (
  id                        SERIAL PRIMARY KEY,
  mls_id                    VARCHAR(50) UNIQUE,        -- upsert key
  address                   TEXT,
  city                      VARCHAR(100),
  zip                       VARCHAR(10),
  lat                       DECIMAL(10,7),
  lng                       DECIMAL(10,7),
  year_built                INTEGER,
  sqft                      INTEGER,
  lot_sqft                  INTEGER,
  list_price                INTEGER,
  sold_price                INTEGER,
  sold_date                 DATE,
  property_type             VARCHAR(50),
  -- ML outputs (written by ml_model.py)
  predicted_rebuild_value   INTEGER,
  opportunity_result        INTEGER,                   -- core metric
  construction_cost_per_sqft DECIMAL(6,2) DEFAULT 175.00,
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  updated_at                TIMESTAMPTZ DEFAULT NOW()
);

-- Census income data
CREATE TABLE zip_income (
  zip                     VARCHAR(10) PRIMARY KEY,
  median_household_income INTEGER,
  fetched_at              TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_properties_zip         ON properties(zip);
CREATE INDEX idx_properties_opportunity ON properties(opportunity_result DESC);
CREATE INDEX idx_properties_year_built  ON properties(year_built);
```

## ML Model Design

**Input features (XGBoost):**
- `sqft`, `lot_sqft`, `year_built`
- `median_household_income` (joined from `zip_income`)
- `zip` (label-encoded)

**Target:** `sold_price` of recently built homes (year_built > 2015) in the same ZIP

**Output:** `predicted_rebuild_value` — what a new build on this lot would sell for

**Opportunity Score:**
```
opportunity_result = predicted_rebuild_value - acquisition_cost - construction_cost
acquisition_cost  = sold_price (or list_price)
construction_cost = sqft × construction_cost_per_sqft ($175 default)
```

## Key Constraints
- HomeHarvest monthly chunks prevent hitting the 200-result API cap
- Census API: keyless public endpoint, 500 req/day — cache aggressively in `zip_income`
- React-Leaflet: no Mapbox key required, uses OpenStreetMap tiles
```
