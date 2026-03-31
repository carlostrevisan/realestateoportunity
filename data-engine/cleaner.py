"""
cleaner.py - Data quality filters for raw HomeHarvest output.

All rules defined in CLAUDE.md:
  - property_type: Single Family only
  - list_price: $100k – $5M
  - year_built: > 1901
  - sqft: < 5,000
  - lat / lng: must be non-null
"""

import logging
import re
import pandas as pd

logger = logging.getLogger(__name__)

# Filter constants (see CLAUDE.md)
ALLOWED_PROPERTY_TYPES = {"SINGLE_FAMILY", "Single Family"}
MIN_PRICE = 100_000
MAX_PRICE = 5_000_000
MIN_YEAR_BUILT = 1901
MAX_SQFT = 5_000

# Pre-compiled - avoids recompiling for every row in the Series
_TYPE_RE = re.compile(r"SINGLE.FAMILY|SINGLE_FAMILY", re.IGNORECASE)


def clean(df: pd.DataFrame) -> pd.DataFrame:
    """
    Apply all data quality filters to a raw HomeHarvest DataFrame.

    Args:
        df: Raw DataFrame from HomeHarvest scrape.

    Returns:
        Cleaned DataFrame with only valid single-family teardown candidates.
    """
    if df is None or df.empty:
        logger.warning("[WARN] Received empty DataFrame - skipping")
        return pd.DataFrame()

    original_count = len(df)
    logger.info(f"[DATA] Cleaning {original_count} rows...")

    # Normalize column names (HomeHarvest may vary)
    df.columns = [c.lower().strip() for c in df.columns]

    # 1. Property type - Single Family only
    type_col = _find_col(df, ["style", "property_type", "home_type", "type"])
    if type_col:
        before = len(df)
        df = df[df[type_col].astype(str).str.contains(_TYPE_RE, na=False)]
        logger.info(f"[DATA] After type filter: {len(df)} rows (dropped {before - len(df)})")
    else:
        logger.warning("[WARN] No property_type column found - skipping type filter")

    # 2. Price filter ($100k – $5M)
    price_col = _find_col(df, ["list_price", "price", "sold_price"])
    if price_col:
        before = len(df)
        prices = pd.to_numeric(df[price_col], errors="coerce")
        logger.info(f"[DATA] Price range in data: ${prices.min():,.0f} – ${prices.max():,.0f} (median ${prices.median():,.0f})")
        df = df[prices.notna() & (prices >= MIN_PRICE) & (prices <= MAX_PRICE)]
        logger.info(f"[DATA] After price filter: {len(df)} rows (dropped {before - len(df)})")

    # 3. Year built > 1901
    year_col = _find_col(df, ["year_built", "yearbuilt"])
    if year_col:
        before = len(df)
        years = pd.to_numeric(df[year_col], errors="coerce")
        logger.info(f"[DATA] Year built range in data: {years.min():.0f} – {years.max():.0f}")
        df = df[years.notna() & (years > MIN_YEAR_BUILT)]
        logger.info(f"[DATA] After year filter: {len(df)} rows (dropped {before - len(df)})")

    # 4. Square footage < 5,000
    sqft_col = _find_col(df, ["sqft", "square_feet", "living_sqft", "lot_sqft"])
    if sqft_col:
        before = len(df)
        sqfts = pd.to_numeric(df[sqft_col], errors="coerce")
        logger.info(f"[DATA] Sqft range in data: {sqfts.min():.0f} – {sqfts.max():.0f} (median {sqfts.median():.0f})")
        df = df[sqfts.notna() & (sqfts < MAX_SQFT) & (sqfts > 0)]
        logger.info(f"[DATA] After sqft filter: {len(df)} rows (dropped {before - len(df)})")

    # 5. Coordinates must be non-null
    lat_col = _find_col(df, ["latitude", "lat"])
    lng_col = _find_col(df, ["longitude", "lng", "lon"])
    if lat_col and lng_col:
        before = len(df)
        null_lat = df[lat_col].isna().sum()
        null_lng = df[lng_col].isna().sum()
        if null_lat or null_lng:
            logger.info(f"[DATA] Null coords - lat: {null_lat}, lng: {null_lng}")
        df = df[df[lat_col].notna() & df[lng_col].notna()]
        logger.info(f"[DATA] After coords filter: {len(df)} rows (dropped {before - len(df)})")
    else:
        logger.warning("[WARN] lat/lng columns not found - keeping all rows")

    removed = original_count - len(df)
    logger.info(f"[DATA] Cleaning done - {len(df)} valid rows ({removed} removed)")

    return df.reset_index(drop=True)


def normalize_for_db(df: pd.DataFrame, default_zip: str = None) -> list[dict]:
    """
    Convert a cleaned DataFrame to a list of dicts ready for db.upsert_properties().

    Maps HomeHarvest column names to our schema column names.
    """
    logger.info(f"[DATA] Normalizing {len(df)} rows for DB insert...")
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
        "beds":          _find_col(df, ["beds", "bedrooms", "beds_min"]),
        "baths":         _find_col(df, ["full_baths", "baths", "bathrooms", "total_baths"]),
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
    records = out.where(out.notna(), other=None).to_dict('records')
    missing_mls = sum(1 for r in records if not r.get('mls_id'))
    if missing_mls:
        logger.warning(f"[WARN] {missing_mls}/{len(records)} rows have no mls_id - they will be skipped on upsert")
    logger.info(f"[DATA] Normalized {len(records)} records ready for upsert")
    return records


def _find_col(df: pd.DataFrame, candidates: list[str]) -> str | None:
    """Return the first candidate column name that exists in the DataFrame."""
    for col in candidates:
        if col in df.columns:
            return col
    return None
