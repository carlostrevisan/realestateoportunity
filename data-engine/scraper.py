"""
scraper.py — HomeHarvest MLS scraper.
"""

import argparse
import logging
import random
import time
import os
from datetime import date, timedelta
from dateutil.relativedelta import relativedelta

import db
from cleaner import clean, normalize_for_db

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

import re

MARKET_CITIES = {
    "tampa":         "Tampa, FL",
    "orlando":       "Orlando, FL",
    "winter_garden": "Winter Garden, FL",
    "winter_park":   "Winter Park, FL",
}

def _get_location_and_zips(market_or_zip):
    if market_or_zip in MARKET_CITIES:
        return MARKET_CITIES[market_or_zip], None
    # If it's a 5-digit zip, we treat it as a zip target
    if re.match(r"^\d{5}$", str(market_or_zip)):
        return market_or_zip, [market_or_zip]
    # Otherwise, it's a custom location string (e.g. "Miami, FL")
    return market_or_zip, None

MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]

# Throttling
MAX_RETRIES  = 3
BACKOFF_BASE = 60


def _format_eta(seconds: float) -> str:
    """Format a duration in seconds to a human-readable ETA string."""
    if seconds < 60:
        return f"~{int(seconds)}s"
    elif seconds < 3600:
        return f"~{int(seconds / 60)} min"
    else:
        h = int(seconds / 3600)
        m = int((seconds % 3600) / 60)
        return f"~{h}h {m}min"

def _scrape_with_retry(location, listing_type, date_from=None, date_to=None, label=""):
    try:
        from homeharvest import scrape_property
    except:
        logger.error("[FAIL] HomeHarvest library not installed")
        return None, False

    kwargs = dict(location=location, listing_type=listing_type, property_type=["single_family"])
    if date_from: kwargs["date_from"] = date_from
    if date_to: kwargs["date_to"] = date_to

    for attempt in range(MAX_RETRIES + 1):
        try:
            return scrape_property(**kwargs), True
        except Exception as e:
            err_msg = str(e)
            is_transient = any(m in err_msg for m in [
                "403", "429", "IncompleteRead", "Connection broken",
                "Connection aborted", "RemoteDisconnected", "Remote end closed",
                "SSL", "timeout", "Connection reset", "EOF", "Read timed out",
            ])

            if is_transient and attempt < MAX_RETRIES:
                wait = BACKOFF_BASE * (2 ** attempt)
                logger.warning(f"[WARN] Retry {attempt+1}/{MAX_RETRIES} for {label} — waiting {wait}s")
                time.sleep(wait)
            else:
                logger.error(f"[FAIL] Request failed for {label}: {err_msg}")
                return None, False
    return None, False

def scrape_sold_range(market_or_zip, start_ym, end_ym, throttle=None, dry_run=False, force_renew=False, all_zips=False):
    db.ensure_schema()

    # Only skip IDs already stored as sold — for_sale IDs should be re-processed
    # so they get updated to sold with sold_price/sold_date
    sold_ids = db.fetch_sold_mls_ids()
    logger.info(f"[SYST] Loaded {len(sold_ids)} existing sold MLS IDs for deduplication")

    location, target_zips = _get_location_and_zips(market_or_zip)

    current = _parse_ym(start_ym)
    end_date_obj = _parse_ym(end_ym)
    all_tasks = []
    while current <= end_date_obj:
        all_tasks.append((current, (current + relativedelta(months=1)) - timedelta(days=1)))
        current += relativedelta(months=1)

    t_min = max(5, int(throttle * 0.8)) if throttle else 5
    t_max = max(8, int(throttle * 1.2)) if throttle else 15
    t_avg = (t_min + t_max) / 2

    # Pre-determine which months actually need fetching (vs already cached)
    if not force_renew:
        to_fetch = [
            (cs, ce) for cs, ce in all_tasks
            if not db.check_chunk_completed(market_or_zip, cs.month, cs.year, "sold")
        ]
        cached_count = len(all_tasks) - len(to_fetch)
    else:
        to_fetch = list(all_tasks)
        cached_count = 0

    if cached_count > 0:
        logger.info(f"[SKIP] {cached_count} of {len(all_tasks)} months already cached")

    if not to_fetch:
        logger.info(f"[EXEC] All {len(all_tasks)} months already cached for {location} — nothing to fetch")
        return 0

    # Estimate: throttle avg + ~6s for network per chunk
    est_seconds = len(to_fetch) * (t_avg + 6)
    logger.info(f"[EXEC] Scraping {len(to_fetch)} months for {location} (throttle {t_min}-{t_max}s) — est. {_format_eta(est_seconds)}")

    total_upserted = 0
    failed_chunks = []
    start_time = time.time()

    for i, (cs, ce) in enumerate(to_fetch):
        month_label = f"{MONTH_NAMES[cs.month-1]} {cs.year}"
        progress = f"({i+1}/{len(to_fetch)})"

        if i > 0:
            wait = random.randint(t_min, t_max)
            logger.info(f"[SYST] Waiting {wait}s...")
            time.sleep(wait)

        logger.info(f"[NETW] Fetching {month_label} {progress}...")
        results, ok = _scrape_with_retry(location, "sold", cs.strftime("%Y-%m-%d"), ce.strftime("%Y-%m-%d"), f"{location} {month_label}")

        if ok:
            upserted = 0
            if results is not None and not results.empty:
                # Only skip IDs already stored as sold — not for_sale IDs
                results = results[~results['mls_id'].astype(str).isin(sold_ids)]

                if not results.empty:
                    results = _filter_to_zips(results, target_zips)
                    cleaned = clean(results)
                    if not cleaned.empty:
                        if not dry_run:
                            records = normalize_for_db(cleaned)
                            upserted = db.upsert_properties(records, "sold")
                            total_upserted += upserted
                            sold_ids.update(str(r["mls_id"]) for r in records)

                if upserted > 0:
                    logger.info(f"[LOAD] Saved {upserted} new listings — {location}, {month_label}")
                else:
                    logger.info(f"[SYST] No new listings — {location}, {month_label}")
            else:
                logger.info(f"[SYST] No data returned — {location}, {month_label}")

            if not dry_run:
                db.mark_chunk_completed(market_or_zip, cs.month, cs.year, "sold")
        else:
            failed_chunks.append((cs, ce))

        # Running ETA after each chunk (except the last)
        chunks_done = i + 1
        if chunks_done < len(to_fetch):
            elapsed = time.time() - start_time
            avg_per_chunk = elapsed / chunks_done
            remaining_eta = _format_eta((len(to_fetch) - chunks_done) * avg_per_chunk)
            logger.info(f"[SYST] {chunks_done}/{len(to_fetch)} months done — {remaining_eta} remaining")

    # Second pass: retry any months that failed in the main loop, using a safe 30s wait
    # regardless of the requested throttle speed, to guarantee data completeness.
    if failed_chunks:
        logger.info(f"[RETRY] {len(failed_chunks)} month(s) failed — retrying with 30s safety wait to ensure complete data")
        for cs, ce in failed_chunks:
            month_label = f"{MONTH_NAMES[cs.month-1]} {cs.year}"
            logger.info(f"[SYST] Waiting 30s before retry...")
            time.sleep(30)
            logger.info(f"[NETW] Retry: {month_label}...")
            results, ok = _scrape_with_retry(location, "sold", cs.strftime("%Y-%m-%d"), ce.strftime("%Y-%m-%d"), f"{location} {month_label} [retry]")
            if ok:
                upserted = 0
                if results is not None and not results.empty:
                    results = results[~results['mls_id'].astype(str).isin(sold_ids)]
                    if not results.empty:
                        results = _filter_to_zips(results, target_zips)
                        cleaned = clean(results)
                        if not cleaned.empty and not dry_run:
                            records = normalize_for_db(cleaned)
                            upserted = db.upsert_properties(records, "sold")
                            total_upserted += upserted
                            sold_ids.update(str(r["mls_id"]) for r in records)
                if not dry_run:
                    db.mark_chunk_completed(market_or_zip, cs.month, cs.year, "sold")
                logger.info(f"[LOAD] Retry succeeded — {upserted} listings saved for {location}, {month_label}")
            else:
                logger.error(f"[FAIL] {location}, {month_label} still failed — will retry on next run")

    logger.info(f"[EXEC] Done — {total_upserted} total properties saved")
    return total_upserted

def scrape_for_sale(market_or_zip, throttle=None, dry_run=False, all_zips=False):
    db.ensure_schema()

    location, target_zips = _get_location_and_zips(market_or_zip)

    # Active listings are always re-fetched — prices change, and properties that were
    # previously sold may relist. No in-memory dedup: the upsert handles duplicates.
    logger.info(f"[EXEC] Fetching active listings for {location} (single request)...")
    results, ok = _scrape_with_retry(location, "for_sale", label=location)

    if ok and results is not None and not results.empty:
        results = _filter_to_zips(results, target_zips)
        cleaned = clean(results)
        if not cleaned.empty and not dry_run:
            count = db.upsert_properties(normalize_for_db(cleaned), "for_sale")
            logger.info(f"[LOAD] Saved {count} active listings")
            return count
        elif cleaned.empty:
            logger.info("[SKIP] No listings passed quality filters")
    else:
        logger.info("[SKIP] No active listings returned")

    logger.info("[EXEC] Audit complete")
    return 0

def _parse_ym(ym):
    p = ym.split("-")
    return date(int(p[0]), int(p[1]), 1)

def _filter_to_zips(df, tz):
    if not tz: return df
    for c in ["zip_code", "postal_code", "zip"]:
        if c in df.columns: return df[df[c].astype(str).str[:5].isin(set(tz))]
    return df

def _resolve_targets(za, ma):
    if za: return [za]
    m = ma.lower()
    if m == "all": return list(MARKET_CITIES.keys())
    if m in MARKET_CITIES: return [m]
    # Allow custom market strings
    return [ma]

def main():
    parser = argparse.ArgumentParser()
    target_group = parser.add_mutually_exclusive_group(required=True)
    target_group.add_argument("--zip")
    target_group.add_argument("--market")
    parser.add_argument("--type", choices=["sold", "for_sale"], default="sold")
    parser.add_argument("--start")
    parser.add_argument("--end")
    parser.add_argument("--throttle", type=int, help="Target wait time between chunks in seconds")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--force-renew", action="store_true")
    parser.add_argument("--all-zips", action="store_true")
    args = parser.parse_args()

    targets = _resolve_targets(args.zip, args.market)
    for target in targets:
        if args.type == "sold":
            scrape_sold_range(target, args.start, args.end, throttle=args.throttle, dry_run=args.dry_run, force_renew=args.force_renew, all_zips=args.all_zips)
        else:
            scrape_for_sale(target, throttle=args.throttle, dry_run=args.dry_run, all_zips=args.all_zips)

if __name__ == "__main__":
    main()
