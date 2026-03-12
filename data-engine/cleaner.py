"""
cleaner.py — Data quality filters for raw HomeHarvest output.

All rules defined in CLAUDE.md:
  - property_type: Single Family only
  - list_price: $100k – $5M
  - year_built: > 1901
  - sqft: < 5,000
  - lat / lng: must be non-null
"""

import logging
import pandas as pd

logger = logging.getLogger(__name__)

# Filter constants (see CLAUDE.md)
ALLOWED_PROPERTY_TYPES = {"SINGLE_FAMILY", "Single Family"}
MIN_PRICE = 100_000
MAX_PRICE = 5_000_000
MIN_YEAR_BUILT = 1901
MAX_SQFT = 5_000


def clean(df: pd.DataFrame) -> pd.DataFrame:
    """
    Apply all data quality filters to a raw HomeHarvest DataFrame.

    Args:
        df: Raw DataFrame from HomeHarvest scrape.

    Returns:
        Cleaned DataFrame with only valid single-family teardown candidates.
    """
    if df is None or df.empty:
        logger.warning("[WARN] Received empty DataFrame — skipping")
        return pd.DataFrame()

    original_count = len(df)
    logger.info(f"[DATA] Cleaning {original_count} rows...")

    # Normalize column names (HomeHarvest may vary)
    df.columns = [c.lower().strip() for c in df.columns]

    # 1. Property type — Single Family only
    type_col = _find_col(df, ["style", "property_type", "home_type", "type"])
    if type_col:
        mask = df[type_col].astype(str).str.upper().str.contains("SINGLE.FAMILY|SINGLE_FAMILY", regex=True, na=False)
        df = df[mask]
        logger.info(f"[DATA] After type filter: {len(df)} rows (removed {original_count - len(df)})")
    else:
        logger.warning("[WARN] No property_type column found — skipping type filter")

    # 2. Price filter ($100k – $5M)
    price_col = _find_col(df, ["list_price", "price", "sold_price"])
    if price_col:
        df = df[
            df[price_col].notna() &
            (df[price_col] >= MIN_PRICE) &
            (df[price_col] <= MAX_PRICE)
        ]
        logger.info(f"[DATA] After price filter: {len(df)} rows")

    # 3. Year built > 1901
    year_col = _find_col(df, ["year_built", "yearbuilt"])
    if year_col:
        df = df[
            df[year_col].notna() &
            (df[year_col] > MIN_YEAR_BUILT)
        ]
        logger.info(f"[DATA] After year filter: {len(df)} rows")

    # 4. Square footage < 5,000
    sqft_col = _find_col(df, ["sqft", "square_feet", "living_sqft", "lot_sqft"])
    if sqft_col:
        df = df[
            df[sqft_col].notna() &
            (df[sqft_col] < MAX_SQFT) &
            (df[sqft_col] > 0)
        ]
        logger.info(f"[DATA] After sqft filter: {len(df)} rows")

    # 5. Coordinates must be non-null
    lat_col = _find_col(df, ["latitude", "lat"])
    lng_col = _find_col(df, ["longitude", "lng", "lon"])
    if lat_col and lng_col:
        df = df[df[lat_col].notna() & df[lng_col].notna()]
        logger.info(f"[DATA] After coordinates filter: {len(df)} rows")
    else:
        logger.warning("[WARN] lat/lng columns not found — keeping all rows")

    removed = original_count - len(df)
    logger.info(f"[DATA] Cleaning done — {len(df)} valid rows ({removed} removed)")

    return df.reset_index(drop=True)


def normalize_for_db(df: pd.DataFrame, default_zip: str = None) -> list[dict]:
    """
    Convert a cleaned DataFrame to a list of dicts ready for db.upsert_properties().

    Maps HomeHarvest column names to our schema column names.
    """
    zip_col = _find_col(df, ["zip_code", "postal_code", "zip"])

    col_map = {
        "mls_id":        _find_col(df, ["mls_id", "property_id", "listing_id", "id"]),
        "address":       _find_col(df, ["full_street_line", "street_address", "address"]),
        "city":          _find_col(df, ["city"]),
        "lat":           _find_col(df, ["latitude", "lat"]),
        "lng":           _find_col(df, ["longitude", "lng", "lon"]),
        "year_built":    _find_col(df, ["year_built", "yearbuilt"]),
        "sqft":          _find_col(df, ["sqft", "square_feet", "living_sqft"]),
        "lot_sqft":      _find_col(df, ["lot_sqft", "lot_size", "lot_square_feet"]),
        "list_price":    _find_col(df, ["list_price", "price"]),
        "sold_price":    _find_col(df, ["sold_price", "close_price", "last_sold_price"]),
        "sold_date":     _find_col(df, ["sold_date", "close_date", "date_sold", "last_sold_date"]),
        "property_type": _find_col(df, ["style", "property_type", "home_type", "type"]),
    }

    # Select and rename columns that exist in df
    rename_map = {src: db for db, src in col_map.items() if src is not None}
    out = df[list(rename_map.keys())].rename(columns=rename_map).copy()

    # Fill in columns missing from the source data
    for db_col, src_col in col_map.items():
        if src_col is None:
            out[db_col] = None

    # ZIP: truncate to 5 chars, fallback to default_zip
    if zip_col:
        out['zip'] = df[zip_col].where(df[zip_col].notna(), default_zip).astype(str).str[:5]
    else:
        out['zip'] = default_zip

    # mls_id must be a string for upsert key
    if 'mls_id' in out.columns:
        out['mls_id'] = out['mls_id'].where(out['mls_id'].isna(), out['mls_id'].astype(str))

    # Replace NaN → None for DB compatibility
    return out.where(out.notna(), other=None).to_dict('records')


def _find_col(df: pd.DataFrame, candidates: list[str]) -> str | None:
    """Return the first candidate column name that exists in the DataFrame."""
    for col in candidates:
        if col in df.columns:
            return col
    return None
