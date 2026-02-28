-- Auto-run by PostgreSQL on first container initialization
-- (files in /docker-entrypoint-initdb.d/ are executed in alphabetical order)

CREATE TABLE IF NOT EXISTS properties (
    id                          SERIAL PRIMARY KEY,
    mls_id                      VARCHAR(50) UNIQUE,
    address                     TEXT,
    city                        VARCHAR(100),
    zip                         VARCHAR(10),
    lat                         DECIMAL(10,7),
    lng                         DECIMAL(10,7),
    year_built                  INTEGER,
    sqft                        INTEGER,
    lot_sqft                    INTEGER,
    list_price                  INTEGER,
    sold_price                  INTEGER,
    sold_date                   DATE,
    property_type               VARCHAR(50),
    listing_type                VARCHAR(20) DEFAULT 'sold',  -- 'sold' | 'for_sale'
    predicted_rebuild_value     INTEGER,
    opportunity_result          INTEGER,
    construction_cost_per_sqft  DECIMAL(6,2) DEFAULT 175.00,
    created_at                  TIMESTAMPTZ DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS zip_income (
    zip                     VARCHAR(10) PRIMARY KEY,
    median_household_income INTEGER,
    fetched_at              TIMESTAMPTZ DEFAULT NOW()
);

-- Tracks each ML training and scoring run
CREATE TABLE IF NOT EXISTS model_runs (
    id                  SERIAL PRIMARY KEY,
    run_type            VARCHAR(20),        -- 'train' | 'score'
    status              VARCHAR(20) DEFAULT 'running',  -- 'running' | 'completed' | 'failed'
    started_at          TIMESTAMPTZ DEFAULT NOW(),
    completed_at        TIMESTAMPTZ,
    properties_trained  INTEGER,            -- rows used to train (train runs only)
    properties_scored   INTEGER,            -- rows scored (score runs)
    r2_score            DECIMAL(5,4),       -- validation R² (train runs only)
    error_message       TEXT                -- populated on failure
);

CREATE INDEX IF NOT EXISTS idx_properties_zip
    ON properties(zip);

CREATE INDEX IF NOT EXISTS idx_properties_opportunity
    ON properties(opportunity_result DESC);

CREATE INDEX IF NOT EXISTS idx_properties_year_built
    ON properties(year_built);

CREATE INDEX IF NOT EXISTS idx_properties_listing_type
    ON properties(listing_type);
