"""
census_fetcher.py - Fetch median household income per ZIP from the U.S. Census API.

Uses the public ACS 5-year estimates endpoint - no API key required.
Rate limit: ~500 requests/day on unauthenticated access.

Usage:
    python census_fetcher.py --zips 33629 33606 32803
    python census_fetcher.py --all   # fetches all target ZIPs from CLAUDE.md
"""

import argparse
import logging
import time

import requests

import db

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

# ACS 5-Year Estimates - most recent stable year
# Variable B19013_001E = Median Household Income in the Past 12 Months
CENSUS_BASE = "https://api.census.gov/data"
ACS_YEAR = "2022"
ACS_DATASET = "acs/acs5"
INCOME_VARIABLE = "B19013_001E"

TARGET_ZIPS = [
    "33606", "33629", "33611",  # Tampa
    "32803", "32806",           # Orlando
    "34787",                    # Winter Garden
    "32789", "32792",           # Winter Park
]


def fetch_income_for_zip(zip_code: str) -> int | None:
    """
    Fetch median household income for a single ZIP code from Census ACS.

    Returns:
        Median income as integer, or None if unavailable.
    """
    url = f"{CENSUS_BASE}/{ACS_YEAR}/{ACS_DATASET}"
    params = {
        "get": f"NAME,{INCOME_VARIABLE}",
        "for": f"zip code tabulation area:{zip_code}",
    }

    try:
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()

        # Response format: [["NAME","B19013_001E","zip code tabulation area"], [row...]]
        if len(data) < 2:
            logger.warning(f"[census] No data returned for ZIP {zip_code}")
            return None

        income_raw = data[1][1]
        if income_raw is None or int(income_raw) < 0:
            logger.warning(f"[census] Invalid income value for ZIP {zip_code}: {income_raw}")
            return None

        income = int(income_raw)
        logger.info(f"[census] ZIP {zip_code}: median income = ${income:,}")
        return income

    except requests.RequestException as e:
        logger.error(f"[census] HTTP error for ZIP {zip_code}: {e}")
        return None
    except (IndexError, ValueError, KeyError) as e:
        logger.error(f"[census] Parse error for ZIP {zip_code}: {e}")
        return None


def fetch_all_zips(zip_codes: list[str], pause: float = 1.0):
    """
    Fetch and store income data for a list of ZIP codes.

    Args:
        zip_codes: List of 5-digit ZIP strings.
        pause:     Seconds to wait between requests (respects 500 req/day limit).
    """
    db.ensure_schema()

    success = 0
    failed = 0

    for zip_code in zip_codes:
        income = fetch_income_for_zip(zip_code)

        if income is not None:
            db.upsert_zip_income(zip_code, income)
            success += 1
        else:
            failed += 1

        time.sleep(pause)

    logger.info(f"[census] Done - {success} success, {failed} failed out of {len(zip_codes)} ZIPs")


def main():
    parser = argparse.ArgumentParser(
        description="Fetch median household income per ZIP from Census ACS API"
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--zips", nargs="+", help="One or more 5-digit ZIP codes")
    group.add_argument("--all", action="store_true", help="Fetch all target ZIPs")

    args = parser.parse_args()

    if args.all:
        db_zips = db.fetch_all_unique_zips()
        if db_zips:
            logger.info(f"[census] Found {len(db_zips)} unique ZIPs in database")
            zips = db_zips
        else:
            logger.info("[census] No ZIPs in database, using predefined target list")
            zips = TARGET_ZIPS
    else:
        zips = args.zips

    fetch_all_zips(zips)


if __name__ == "__main__":
    main()
