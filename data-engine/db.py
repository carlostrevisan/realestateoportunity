"""
db.py - Single source of truth for all PostgreSQL operations.
"""

import os
import logging
from datetime import date
from contextlib import contextmanager

import psycopg2
import psycopg2.extras

logger = logging.getLogger(__name__)

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    raise EnvironmentError("DATABASE_URL environment variable is not set")


def get_connection():
    return psycopg2.connect(DATABASE_URL)


@contextmanager
def get_cursor(commit: bool = True):
    conn = get_connection()
    try:
        with conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                yield cur
                if commit:
                    conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def ensure_schema():
    ddl = """
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
            listing_type                VARCHAR(20) DEFAULT 'sold',
            predicted_rebuild_value     INTEGER,
            opportunity_result          INTEGER,
            construction_cost_per_sqft  DECIMAL(6,2) DEFAULT 175.00,
            created_at                  TIMESTAMPTZ DEFAULT NOW(),
            updated_at                  TIMESTAMPTZ DEFAULT NOW()
        );

        -- New table to track successfully completed scrapes
        CREATE TABLE IF NOT EXISTS scrape_log (
            id          SERIAL PRIMARY KEY,
            market      VARCHAR(100),  -- e.g. 'tampa' or '33629'
            month       INTEGER,
            year        INTEGER,
            scrape_type VARCHAR(20),   -- 'sold' or 'for_sale'
            created_at  TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(market, month, year, scrape_type)
        );

        CREATE TABLE IF NOT EXISTS zip_income (
            zip                     VARCHAR(10) PRIMARY KEY,
            median_household_income INTEGER,
            fetched_at              TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS model_runs (
            id                  SERIAL PRIMARY KEY,
            run_type            VARCHAR(20),
            status              VARCHAR(20) DEFAULT 'running',
            started_at          TIMESTAMPTZ DEFAULT NOW(),
            completed_at        TIMESTAMPTZ,
            properties_trained  INTEGER,
            properties_scored   INTEGER,
            r2_score            DECIMAL(5,4),
            error_message       TEXT,
            model_path          VARCHAR(255),
            training_context    JSONB,
            is_active           BOOLEAN DEFAULT FALSE
        );

        -- Migrate existing DBs: add new columns if they don't exist yet
        ALTER TABLE model_runs ADD COLUMN IF NOT EXISTS model_path       VARCHAR(255);
        ALTER TABLE model_runs ADD COLUMN IF NOT EXISTS training_context JSONB;
        ALTER TABLE model_runs ADD COLUMN IF NOT EXISTS is_active        BOOLEAN DEFAULT FALSE;
        ALTER TABLE model_runs ADD COLUMN IF NOT EXISTS name             VARCHAR(100);
        ALTER TABLE model_runs ADD COLUMN IF NOT EXISTS description      TEXT;

        CREATE INDEX IF NOT EXISTS idx_properties_zip ON properties(zip);
        CREATE INDEX IF NOT EXISTS idx_properties_opportunity ON properties(opportunity_result DESC);
        CREATE INDEX IF NOT EXISTS idx_properties_listing_type ON properties(listing_type);
        CREATE INDEX IF NOT EXISTS idx_properties_year_built ON properties(year_built);
        CREATE INDEX IF NOT EXISTS idx_scrape_log_lookup ON scrape_log(market, year, month);
        CREATE INDEX IF NOT EXISTS idx_zip_listing_opp ON properties(zip, listing_type, opportunity_result DESC NULLS LAST);
    """
    with get_cursor() as cur:
        cur.execute(ddl)


def upsert_properties(records: list[dict], listing_type: str = "sold") -> int:
    if not records: return 0
    for r in records: r["listing_type"] = listing_type

    insert_sql = """
        INSERT INTO properties (
            mls_id, address, city, zip, lat, lng,
            year_built, sqft, lot_sqft,
            list_price, sold_price, sold_date, property_type,
            listing_type, updated_at
        ) VALUES (
            %(mls_id)s, %(address)s, %(city)s, %(zip)s, %(lat)s, %(lng)s,
            %(year_built)s, %(sqft)s, %(lot_sqft)s,
            %(list_price)s, %(sold_price)s, %(sold_date)s, %(property_type)s,
            %(listing_type)s, NOW()
        )
        ON CONFLICT (mls_id) DO UPDATE SET
            list_price    = EXCLUDED.list_price,
            sold_price    = EXCLUDED.sold_price,
            sold_date     = EXCLUDED.sold_date,
            listing_type  = EXCLUDED.listing_type,
            updated_at    = NOW()
        WHERE properties.updated_at < EXCLUDED.updated_at
    """
    with get_cursor() as cur:
        psycopg2.extras.execute_batch(cur, insert_sql, records, page_size=100)
        return len(records)


def check_chunk_completed(market: str, month: int, year: int, scrape_type: str) -> bool:
    """Check the scrape_log table to see if this specific month/market is done."""
    query = "SELECT 1 FROM scrape_log WHERE market = %s AND month = %s AND year = %s AND scrape_type = %s"
    with get_cursor() as cur:
        cur.execute(query, (market, month, year, scrape_type))
        return cur.fetchone() is not None


def mark_chunk_completed(market: str, month: int, year: int, scrape_type: str):
    """Log that a specific month/market has been fully processed."""
    query = """
        INSERT INTO scrape_log (market, month, year, scrape_type) 
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (market, month, year, scrape_type) DO NOTHING
    """
    with get_cursor() as cur:
        cur.execute(query, (market, month, year, scrape_type))


def fetch_all_existing_mls_ids() -> set[str]:
    with get_cursor() as cur:
        cur.execute("SELECT mls_id FROM properties WHERE mls_id IS NOT NULL")
        return {str(row["mls_id"]) for row in cur.fetchall()}


def fetch_sold_mls_ids() -> set[str]:
    """Returns only MLS IDs already stored as sold - used to skip re-processing sold history."""
    with get_cursor() as cur:
        cur.execute("SELECT mls_id FROM properties WHERE mls_id IS NOT NULL AND listing_type = 'sold'")
        return {str(row["mls_id"]) for row in cur.fetchall()}


def fetch_sold_for_training() -> list[dict]:
    query = """
        SELECT p.id, p.mls_id, p.zip, p.city, p.sqft, p.lot_sqft, p.year_built,
               p.lat, p.lng,
               p.list_price, p.sold_price, p.sold_date,
               p.construction_cost_per_sqft, zi.median_household_income
        FROM properties p
        LEFT JOIN zip_income zi ON p.zip = zi.zip
        WHERE p.listing_type = 'sold' AND p.sqft > 0 AND p.sold_price > 0
        ORDER BY p.id
    """
    with get_cursor() as cur:
        cur.execute(query)
        return [dict(row) for row in cur.fetchall()]


def fetch_for_sale_for_scoring() -> list[dict]:
    query = """
        SELECT p.id, p.mls_id, p.zip, p.sqft, p.lot_sqft, p.year_built, 
               p.lat, p.lng,
               p.list_price, p.sold_price, 
               p.construction_cost_per_sqft, zi.median_household_income
        FROM properties p
        LEFT JOIN zip_income zi ON p.zip = zi.zip
        WHERE p.listing_type = 'for_sale' AND p.sqft > 0 AND p.list_price > 0
        ORDER BY p.id
    """
    with get_cursor() as cur:
        cur.execute(query)
        return [dict(row) for row in cur.fetchall()]


def write_opportunity_scores(scores: list[dict]):
    if not scores: return
    update_sql = "UPDATE properties SET predicted_rebuild_value=%(predicted_rebuild_value)s, opportunity_result=%(opportunity_result)s, updated_at=NOW() WHERE id=%(id)s"
    with get_cursor() as cur:
        psycopg2.extras.execute_batch(cur, update_sql, scores, page_size=100)


def upsert_zip_income(zip_code: str, income: int):
    query = """
        INSERT INTO zip_income (zip, median_household_income, fetched_at)
        VALUES (%s, %s, NOW())
        ON CONFLICT (zip) DO UPDATE SET
            median_household_income = EXCLUDED.median_household_income,
            fetched_at = NOW()
    """
    with get_cursor() as cur:
        cur.execute(query, (zip_code, income))


def start_model_run(run_type: str) -> int:
    with get_cursor() as cur:
        cur.execute("INSERT INTO model_runs (run_type, status) VALUES (%s, 'running') RETURNING id", (run_type,))
        return cur.fetchone()["id"]


def complete_model_run(run_id: int, **kwargs):
    fields = ", ".join(f"{k} = %({k})s" for k in kwargs)
    sql = f"UPDATE model_runs SET status='completed', completed_at=NOW(), {fields} WHERE id=%(run_id)s"
    with get_cursor() as cur:
        cur.execute(sql, {"run_id": run_id, **kwargs})


def fail_model_run(run_id: int, error: str):
    with get_cursor() as cur:
        cur.execute("UPDATE model_runs SET status='failed', completed_at=NOW(), error_message=%s WHERE id=%s", (error, run_id))


def fetch_all_unique_zips() -> list[str]:
    with get_cursor() as cur:
        cur.execute("SELECT DISTINCT zip FROM properties WHERE zip IS NOT NULL AND zip != ''")
        return [row["zip"] for row in cur.fetchall()]


def get_all_trained_models() -> list[dict]:
    """Returns all completed training runs, newest first."""
    with get_cursor(commit=False) as cur:
        cur.execute("""
            SELECT id, status, started_at, completed_at, properties_trained,
                   r2_score, model_path, training_context, is_active, error_message
            FROM model_runs
            WHERE run_type = 'train' AND status = 'completed'
            ORDER BY started_at DESC
        """)
        return [dict(row) for row in cur.fetchall()]


def get_active_model() -> dict | None:
    """Returns the model currently flagged as active for scoring."""
    with get_cursor(commit=False) as cur:
        cur.execute("""
            SELECT id, model_path, training_context, r2_score, properties_trained, started_at
            FROM model_runs
            WHERE run_type = 'train' AND is_active = TRUE
            LIMIT 1
        """)
        row = cur.fetchone()
        return dict(row) if row else None


def set_active_model(run_id: int):
    """Deactivates all models then activates the specified one."""
    with get_cursor() as cur:
        cur.execute("UPDATE model_runs SET is_active = FALSE WHERE run_type = 'train'")
        cur.execute("UPDATE model_runs SET is_active = TRUE WHERE id = %s", (run_id,))


def delete_model_run(run_id: int) -> str | None:
    """Deletes a model run record and returns the model_path so the file can be deleted."""
    with get_cursor() as cur:
        cur.execute("SELECT model_path FROM model_runs WHERE id = %s", (run_id,))
        row = cur.fetchone()
        model_path = row["model_path"] if row else None
        cur.execute("DELETE FROM model_runs WHERE id = %s", (run_id,))
        return model_path


def fetch_model_status() -> dict:
    with get_cursor() as cur:
        cur.execute("SELECT DISTINCT ON (run_type) * FROM model_runs ORDER BY run_type, started_at DESC")
        rows = {r["run_type"]: dict(r) for r in cur.fetchall()}
        cur.execute("SELECT COUNT(*) as cnt FROM properties WHERE listing_type = 'for_sale'")
        rows["for_sale_count"] = cur.fetchone()["cnt"]
        cur.execute("SELECT COUNT(*) as cnt FROM properties WHERE listing_type = 'sold'")
        rows["sold_count"] = cur.fetchone()["cnt"]
        return rows
