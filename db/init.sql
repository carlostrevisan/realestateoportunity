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

-- Tracks successfully completed scrape chunks to avoid re-fetching
CREATE TABLE IF NOT EXISTS scrape_log (
    id          SERIAL PRIMARY KEY,
    market      VARCHAR(100),  -- e.g. 'tampa' or '33629'
    month       INTEGER,
    year        INTEGER,
    scrape_type VARCHAR(20),   -- 'sold' or 'for_sale'
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(market, month, year, scrape_type)
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
    error_message       TEXT,               -- populated on failure
    model_path          VARCHAR(255),       -- path to saved model file (train runs only)
    training_context    JSONB,              -- metadata: markets, date range, features, hyperparams
    is_active           BOOLEAN DEFAULT FALSE  -- which model is currently used for scoring
);

CREATE INDEX IF NOT EXISTS idx_properties_zip
    ON properties(zip);

CREATE INDEX IF NOT EXISTS idx_properties_opportunity
    ON properties(opportunity_result DESC);

CREATE INDEX IF NOT EXISTS idx_properties_year_built
    ON properties(year_built);

CREATE INDEX IF NOT EXISTS idx_properties_listing_type
    ON properties(listing_type);

CREATE INDEX IF NOT EXISTS idx_scrape_log_lookup
    ON scrape_log(market, year, month);

CREATE INDEX IF NOT EXISTS idx_zip_listing_opp
    ON properties(zip, listing_type, opportunity_result DESC NULLS LAST);
