"""
db.py — Single source of truth for all PostgreSQL operations.

All other modules import from here; none call psycopg2 directly.
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
    """Return a new psycopg2 connection."""
    return psycopg2.connect(DATABASE_URL)


@contextmanager
def get_cursor(commit: bool = True):
    """Context manager yielding a DictCursor; auto-commits or rolls back."""
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
    """
    Create tables and indexes if they don't exist.
    Safe to call repeatedly (uses IF NOT EXISTS).
    """
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
            error_message       TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_properties_zip
            ON properties(zip);
        CREATE INDEX IF NOT EXISTS idx_properties_opportunity
            ON properties(opportunity_result DESC);
        CREATE INDEX IF NOT EXISTS idx_properties_year_built
            ON properties(year_built);
        CREATE INDEX IF NOT EXISTS idx_properties_listing_type
            ON properties(listing_type);
    """
    with get_cursor() as cur:
        cur.execute(ddl)
    logger.info("[db] Schema ensured")


def upsert_properties(records: list[dict], listing_type: str = "sold") -> int:
    """
    Insert or update properties using mls_id as the conflict key.

    Args:
        records:      List of dicts with keys matching the properties table columns.
        listing_type: 'sold' or 'for_sale' — written to every row in this batch.

    Returns:
        Number of rows upserted.
    """
    if not records:
        return 0

    # Inject listing_type into every record
    for r in records:
        r["listing_type"] = listing_type

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
            address       = EXCLUDED.address,
            lat           = EXCLUDED.lat,
            lng           = EXCLUDED.lng,
            list_price    = EXCLUDED.list_price,
            sold_price    = EXCLUDED.sold_price,
            sold_date     = EXCLUDED.sold_date,
            listing_type  = EXCLUDED.listing_type,
            updated_at    = NOW()
        WHERE properties.updated_at < EXCLUDED.updated_at
    """

    with get_cursor() as cur:
        psycopg2.extras.execute_batch(cur, insert_sql, records, page_size=100)
        count = len(records)

    logger.info(f"[db] Upserted {count} {listing_type} properties")
    return count


def check_month_exists(zip_codes: list[str], start_date: date, end_date: date) -> bool:
    """
    Check if we already have a significant amount of data for these ZIPs in this month.
    Used to skip redundant scrapes.
    """
    query = """
        SELECT COUNT(*) as cnt FROM properties
        WHERE zip = ANY(%s)
          AND sold_date >= %s
          AND sold_date <= %s
          AND listing_type = 'sold'
    """
    with get_cursor() as cur:
        cur.execute(query, (zip_codes, start_date, end_date))
        row = cur.fetchone()
        return row["cnt"] > 0


def upsert_zip_income(zip_code: str, median_income: int):
    """Insert or update median household income for a ZIP code."""
    sql_str = """
        INSERT INTO zip_income (zip, median_household_income, fetched_at)
        VALUES (%s, %s, NOW())
        ON CONFLICT (zip) DO UPDATE SET
            median_household_income = EXCLUDED.median_household_income,
            fetched_at = NOW()
    """
    with get_cursor() as cur:
        cur.execute(sql_str, (zip_code, median_income))
    logger.info(f"[db] Upserted income for ZIP {zip_code}: ${median_income:,}")


def fetch_sold_for_training() -> list[dict]:
    """
    Fetch sold properties suitable for ML training.
    Uses recent new-build sold properties (year_built > 2015) as training data
    since their sold_price approximates what a new rebuild would sell for.
    """
    query = """
        SELECT
            p.id, p.mls_id, p.zip, p.sqft, p.lot_sqft, p.year_built,
            p.list_price, p.sold_price, p.construction_cost_per_sqft,
            zi.median_household_income
        FROM properties p
        LEFT JOIN zip_income zi ON p.zip = zi.zip
        WHERE p.listing_type = 'sold'
          AND p.sqft IS NOT NULL
          AND p.sqft > 0
          AND p.sold_price IS NOT NULL
          AND p.sold_price > 0
        ORDER BY p.id
    """
    with get_cursor() as cur:
        cur.execute(query)
        return [dict(row) for row in cur.fetchall()]


def fetch_for_sale_for_scoring() -> list[dict]:
    """
    Fetch active for-sale properties to apply opportunity scoring.
    These are the candidates we want to identify as teardown opportunities.
    """
    query = """
        SELECT
            p.id, p.mls_id, p.zip, p.sqft, p.lot_sqft, p.year_built,
            p.list_price, p.sold_price, p.construction_cost_per_sqft,
            zi.median_household_income
        FROM properties p
        LEFT JOIN zip_income zi ON p.zip = zi.zip
        WHERE p.listing_type = 'for_sale'
          AND p.sqft IS NOT NULL
          AND p.sqft > 0
          AND p.list_price IS NOT NULL
          AND p.list_price > 0
        ORDER BY p.id
    """
    with get_cursor() as cur:
        cur.execute(query)
        return [dict(row) for row in cur.fetchall()]


def write_opportunity_scores(scores: list[dict]):
    """
    Write ML-computed scores back to the properties table.

    Args:
        scores: List of dicts with keys: id, predicted_rebuild_value, opportunity_result
    """
    if not scores:
        return

    update_sql = """
        UPDATE properties SET
            predicted_rebuild_value = %(predicted_rebuild_value)s,
            opportunity_result      = %(opportunity_result)s,
            updated_at              = NOW()
        WHERE id = %(id)s
    """
    with get_cursor() as cur:
        psycopg2.extras.execute_batch(cur, update_sql, scores, page_size=100)
    logger.info(f"[db] Wrote {len(scores)} opportunity scores")


# ── model_runs tracking ──────────────────────────────────────────────

def start_model_run(run_type: str) -> int:
    """Insert a new model_runs row with status='running'. Returns the run id."""
    with get_cursor() as cur:
        cur.execute(
            "INSERT INTO model_runs (run_type, status) VALUES (%s, 'running') RETURNING id",
            (run_type,)
        )
        return cur.fetchone()["id"]


def complete_model_run(run_id: int, **kwargs):
    """
    Mark a model run as completed.
    kwargs: properties_trained, properties_scored, r2_score
    """
    fields = ", ".join(f"{k} = %({k})s" for k in kwargs)
    sql = f"""
        UPDATE model_runs SET
            status = 'completed',
            completed_at = NOW(),
            {fields}
        WHERE id = %(run_id)s
    """
    with get_cursor() as cur:
        cur.execute(sql, {"run_id": run_id, **kwargs})


def fail_model_run(run_id: int, error: str):
    """Mark a model run as failed with an error message."""
    with get_cursor() as cur:
        cur.execute(
            """UPDATE model_runs SET
               status = 'failed', completed_at = NOW(), error_message = %s
               WHERE id = %s""",
            (error, run_id)
        )


def fetch_all_existing_mls_ids() -> set[str]:
    """Retrieve all MLS IDs currently in the database to allow the scraper to skip duplicates."""
    query = "SELECT mls_id FROM properties WHERE mls_id IS NOT NULL"
    with get_cursor() as cur:
        cur.execute(query)
        return {row["mls_id"] for row in cur.fetchall()}


def fetch_all_unique_zips() -> list[str]:
    """Retrieve all unique ZIP codes from the properties table."""
    query = "SELECT DISTINCT zip FROM properties WHERE zip IS NOT NULL AND zip != ''"
    with get_cursor() as cur:
        cur.execute(query)
        return [row["zip"] for row in cur.fetchall()]


def fetch_model_status() -> dict:
    """Return the latest train and score run metadata."""
    with get_cursor() as cur:
        cur.execute("""
            SELECT DISTINCT ON (run_type)
                run_type, status, started_at, completed_at,
                properties_trained, properties_scored, r2_score, error_message
            FROM model_runs
            ORDER BY run_type, started_at DESC
        """)
        rows = {r["run_type"]: dict(r) for r in cur.fetchall()}

        cur.execute("SELECT COUNT(*) as cnt FROM properties WHERE listing_type = 'for_sale'")
        rows["for_sale_count"] = cur.fetchone()["cnt"]

        cur.execute("SELECT COUNT(*) as cnt FROM properties WHERE listing_type = 'sold'")
        rows["sold_count"] = cur.fetchone()["cnt"]

        cur.execute("""
            SELECT COUNT(*) as cnt FROM properties
            WHERE listing_type = 'for_sale' AND opportunity_result IS NULL
        """)
        rows["unscored_count"] = cur.fetchone()["cnt"]

    return rows
