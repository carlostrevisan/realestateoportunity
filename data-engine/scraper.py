"""
scraper.py — HomeHarvest MLS scraper adapted from working reference implementation.
"""

import argparse
import logging
import random
import time
import os
import pandas as pd
from datetime import date, timedelta
from dateutil.relativedelta import relativedelta

import db
from cleaner import clean, normalize_for_db

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

# Market → city search string
MARKET_CITIES = {
    "tampa":         "Tampa, FL",
    "orlando":       "Orlando, FL",
    "winter_garden": "Winter Garden, FL",
    "winter_park":   "Winter Park, FL",
}

# Market → target ZIP codes
MARKETS = {
    "tampa":         ["33606", "33629", "33611"],
    "orlando":       ["32803", "32806"],
    "winter_garden": ["34787"],
    "winter_park":   ["32789", "32792"],
}
TARGET_ZIPS = [z for zips in MARKETS.values() for z in zips]

MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]

# Persistence
PERSISTENT_CSV = "data/scraped_listings.csv"

# Retry / backoff constants
MAX_RETRIES   = 3
BACKOFF_BASE  = 60
COOLDOWN_AFTER = 3
COOLDOWN_SECS  = 600

def _ensure_data_dir():
    if not os.path.exists("data"):
        os.makedirs("data")

def _append_to_csv(df):
    """Keep a persistent CSV record of all cleaned listings."""
    _ensure_data_dir()
    header = not os.path.exists(PERSISTENT_CSV)
    df.to_csv(PERSISTENT_CSV, mode='a', index=False, header=header)
    logger.info(f"[CSV] Appended {len(df)} records to {PERSISTENT_CSV}")

def _check_csv_exists(zip_codes, start_date, end_date):
    """Check if the persistent CSV already contains data for these ZIPs and dates."""
    if not os.path.exists(PERSISTENT_CSV):
        return False
    
    try:
        # We only read the necessary columns to be memory efficient
        df = pd.read_csv(PERSISTENT_CSV, usecols=['zip_code', 'sold_date'])
        df['sold_date'] = pd.to_datetime(df['sold_date']).dt.date
        df['zip_code'] = df['zip_code'].astype(str).str[:5]
        
        mask = (
            (df['zip_code'].isin(zip_codes)) & 
            (df['sold_date'] >= start_date) & 
            (df['sold_date'] <= end_date)
        )
        return mask.any()
    except Exception as e:
        logger.warning(f"[CSV] Error checking persistence: {e}")
        return False

def _scrape_with_retry(location, listing_type, date_from=None, date_to=None, label=""):
    try:
        from homeharvest import scrape_property
    except Exception as e:
        logger.error(f"[ERROR] Could not import homeharvest: {e}")
        return None, False

    kwargs = dict(
        location=location,
        listing_type=listing_type,
        property_type=["single_family"],
    )
    if date_from:
        kwargs["date_from"] = date_from
    if date_to:
        kwargs["date_to"] = date_to

    for attempt in range(MAX_RETRIES + 1):
        try:
            results = scrape_property(**kwargs)
            return results, True
        except Exception as e:
            err_str = str(e)
            is_rate_limit = "403" in err_str or "ResponseError" in err_str or "429" in err_str

            if is_rate_limit and attempt < MAX_RETRIES:
                backoff = BACKOFF_BASE * (2 ** attempt)
                logger.warning(f"[WAIT] 403 on {label} (attempt {attempt+1}/{MAX_RETRIES}) — backoff {backoff}s...")
                _countdown(backoff, step=15)
            else:
                logger.error(f"[ERROR] {label}: {e}")
                return None, False
    return None, False

def _countdown(seconds, step=5):
    elapsed = 0
    while elapsed < seconds:
        remaining = seconds - elapsed
        chunk = min(step, remaining)
        logger.info(f"[WAIT] Resuming in {remaining}s...")
        time.sleep(chunk)
        elapsed += chunk

def _filter_to_zips(df, target_zips):
    if not target_zips: return df
    for col in ["zip_code", "postal_code", "zip"]:
        if col in df.columns:
            mask = df[col].astype(str).str[:5].isin(set(target_zips))
            return df[mask]
    return df

def scrape_sold_range(market_or_zip, start_ym, end_ym, dry_run=False, force_renew=False, all_zips=False):
    db.ensure_schema()
    existing_ids = db.fetch_all_existing_mls_ids()
    logger.info(f"[INFO] Loaded {len(existing_ids)} existing MLS IDs to prevent duplicates")

    if market_or_zip in MARKET_CITIES:
        location, target_zips = MARKET_CITIES[market_or_zip], MARKETS[market_or_zip] if not all_zips else None
    else:
        location, target_zips = market_or_zip, [market_or_zip]

    start_date_obj, end_date_obj = _parse_ym(start_ym), _parse_ym(end_ym)
    tasks = []
    current = start_date_obj
    while current <= end_date_obj:
        chunk_start = current
        chunk_end = (current + relativedelta(months=1)) - timedelta(days=1)
        tasks.append((chunk_start, chunk_end))
        current += relativedelta(months=1)

    total_upserted = 0
    for i, (chunk_start, chunk_end) in enumerate(tasks):
        progress = f"[{i+1}/{len(tasks)}]"
        month_label = f"{MONTH_NAMES[chunk_start.month-1]} {chunk_start.year}"

        # 1. Check Database
        if not force_renew and target_zips:
            db_exists = db.check_month_exists(target_zips, chunk_start, chunk_end)
            if db_exists:
                logger.info(f"[SKIP] {progress} {location} · {month_label} already in Database")
                continue
        
        # 2. Check CSV Persistence
        if not force_renew and target_zips:
            csv_exists = _check_csv_exists(target_zips, chunk_start, chunk_end)
            if csv_exists:
                logger.info(f"[SKIP] {progress} {location} · {month_label} already in persistent CSV")
                continue

        results, ok = _scrape_with_retry(
            location=location, listing_type="sold",
            date_from=chunk_start.strftime("%Y-%m-%d"),
            date_to=chunk_end.strftime("%Y-%m-%d"),
            label=f"{location} {month_label}"
        )

        if ok and results is not None and not results.empty:
            # Persistent Row Skipping Logic
            if not force_renew and 'mls_id' in results.columns:
                initial_count = len(results)
                results = results[~results['mls_id'].astype(str).isin(existing_ids)]
                skipped = initial_count - len(results)
                if skipped > 0:
                    logger.info(f"[SKIP] {progress} {skipped}/{initial_count} listings already in database")

            if not results.empty:
                results = _filter_to_zips(results, target_zips)
                cleaned = clean(results)
                if not cleaned.empty:
                    _append_to_csv(cleaned)
                    records = normalize_for_db(cleaned)
                    if not dry_run:
                        count = db.upsert_properties(records, listing_type="sold")
                        total_upserted += count
                        logger.info(f"[SAVED] {progress} {count} new records added")
        
        if i < len(tasks) - 1:
            wait = random.randint(20, 45)
            _countdown(wait)

    return total_upserted

def scrape_for_sale(market_or_zip, dry_run=False, all_zips=False):
    db.ensure_schema()
    if market_or_zip in MARKET_CITIES:
        location, target_zips = MARKET_CITIES[market_or_zip], MARKETS[market_or_zip] if not all_zips else None
    else:
        location, target_zips = market_or_zip, [market_or_zip]

    results, ok = _scrape_with_retry(location=location, listing_type="for_sale", label=location)
    if ok and results is not None and not results.empty:
        results = _filter_to_zips(results, target_zips)
        cleaned = clean(results)
        if not cleaned.empty:
            _append_to_csv(cleaned)
            records = normalize_for_db(cleaned)
            if not dry_run:
                return db.upsert_properties(records, listing_type="for_sale")
    return 0

def _parse_ym(ym):
    p = ym.split("-")
    return date(int(p[0]), int(p[1]), 1)

def _resolve_targets(zip_arg, market_arg):
    if zip_arg: return [zip_arg]
    market = market_arg.lower()
    if market == "all": return list(MARKET_CITIES.keys())
    if market in MARKETS: return [market]
    raise ValueError(f"Unknown market '{market_arg}'")

def main():
    parser = argparse.ArgumentParser()
    target_group = parser.add_mutually_exclusive_group(required=True)
    target_group.add_argument("--zip")
    target_group.add_argument("--market")
    parser.add_argument("--type", choices=["sold", "for_sale"], default="sold")
    parser.add_argument("--start")
    parser.add_argument("--end")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--force-renew", action="store_true")
    parser.add_argument("--all-zips", action="store_true")
    args = parser.parse_args()

    targets = _resolve_targets(args.zip, args.market)
    for target in targets:
        if args.type == "sold":
            scrape_sold_range(target, args.start, args.end, args.dry_run, args.force_renew, args.all_zips)
        else:
            scrape_for_sale(target, args.dry_run, args.all_zips)

if __name__ == "__main__":
    main()
