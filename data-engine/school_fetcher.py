"""
school_fetcher.py - Fetch FL DOE school grades per ZIP and store per-ZIP averages.

Reads Florida Department of Education School Accountability data (annual A–F grades).
Set FLDOE_SCHOOL_DATA_PATH to a local CSV file path, or FLDOE_SCHOOL_GRADES_URL to a
download URL for the CSV. If neither is set, the script exits with a clear error.

Grade conversion: A=5, B=4, C=3, D=2, F=1  (I=Incomplete and unknowns are skipped)

The CSV must contain at minimum:
  - A ZIP/postal code column (tries: 'zipcode', 'zip_code', 'zip', 'postal_code')
  - A school grade column (tries: 'grade', 'school_grade', 'letter_grade', 'grade2')

Usage:
    python school_fetcher.py --all
    python school_fetcher.py --zips 33629 33606
"""

import argparse
import io
import logging
import os

import requests
import pandas as pd

import db

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

GRADE_MAP = {"A": 5, "B": 4, "C": 3, "D": 2, "F": 1}

# Column name candidates in order of preference
ZIP_COL_CANDIDATES   = ["zipcode", "zip_code", "zip", "postal_code", "school_zip"]
GRADE_COL_CANDIDATES = ["grade2", "grade", "school_grade", "letter_grade", "grade_2023",
                        "grade_2024", "grade_2022"]


def _find_col(df: pd.DataFrame, candidates: list[str]) -> str | None:
    """Return the first candidate column name that exists (case-insensitive)."""
    lower_cols = {c.lower(): c for c in df.columns}
    for candidate in candidates:
        if candidate.lower() in lower_cols:
            return lower_cols[candidate.lower()]
    return None


def _load_csv() -> pd.DataFrame:
    """Load FL DOE school grades CSV from local path or URL env var."""
    local_path = os.environ.get("FLDOE_SCHOOL_DATA_PATH")
    url        = os.environ.get("FLDOE_SCHOOL_GRADES_URL")

    if local_path:
        if not os.path.exists(local_path):
            raise FileNotFoundError(f"FLDOE_SCHOOL_DATA_PATH not found: {local_path}")
        logger.info(f"[school] Loading from local path: {local_path}")
        return pd.read_csv(local_path, dtype=str)

    if url:
        logger.info(f"[school] Downloading from URL...")
        response = requests.get(url, timeout=60)
        response.raise_for_status()
        return pd.read_csv(io.StringIO(response.text), dtype=str)

    raise EnvironmentError(
        "Neither FLDOE_SCHOOL_DATA_PATH nor FLDOE_SCHOOL_GRADES_URL is set. "
        "Set one of these env vars pointing to the FL DOE School Grades CSV."
    )


def convert_grade(raw: str) -> int | None:
    """Convert a letter grade string to numeric (A=5 … F=1). Returns None to skip."""
    if not isinstance(raw, str):
        return None
    return GRADE_MAP.get(raw.strip().upper())


def compute_zip_ratings(df: pd.DataFrame, zip_col: str, grade_col: str) -> list[dict]:
    """Group by ZIP and compute avg_rating and school_count."""
    df = df[[zip_col, grade_col]].copy()
    df["_numeric"] = df[grade_col].map(lambda x: convert_grade(x))
    df = df.dropna(subset=["_numeric"])
    df[zip_col] = df[zip_col].astype(str).str.strip().str[:5]
    df = df[df[zip_col].str.match(r"^\d{5}$")]  # FL ZIPs are 5 digits

    if df.empty:
        logger.warning("[school] No valid grade rows after filtering")
        return []

    grouped = (
        df.groupby(zip_col)["_numeric"]
        .agg(avg_rating="mean", school_count="count")
        .reset_index()
    )
    grouped["avg_rating"] = grouped["avg_rating"].round(1)
    return grouped.rename(columns={zip_col: "zip"}).to_dict("records")


def fetch_school_ratings(zip_filter: list[str] | None = None):
    """Load CSV, compute per-ZIP averages, and upsert into zip_school table."""
    db.ensure_schema()

    df = _load_csv()
    logger.info(f"[school] Loaded {len(df)} rows, columns: {list(df.columns)}")

    zip_col   = _find_col(df, ZIP_COL_CANDIDATES)
    grade_col = _find_col(df, GRADE_COL_CANDIDATES)

    if not zip_col:
        raise ValueError(f"No ZIP column found. Expected one of: {ZIP_COL_CANDIDATES}. Got: {list(df.columns)}")
    if not grade_col:
        raise ValueError(f"No grade column found. Expected one of: {GRADE_COL_CANDIDATES}. Got: {list(df.columns)}")

    logger.info(f"[school] Using ZIP col='{zip_col}', grade col='{grade_col}'")
    ratings = compute_zip_ratings(df, zip_col, grade_col)

    if zip_filter:
        zip_set  = set(zip_filter)
        ratings  = [r for r in ratings if r["zip"] in zip_set]

    success = 0
    for row in ratings:
        db.upsert_zip_school(row["zip"], float(row["avg_rating"]), int(row["school_count"]))
        success += 1

    logger.info(f"[school] Done — {success} ZIPs upserted into zip_school table")


def main():
    parser = argparse.ArgumentParser(
        description="Fetch FL DOE school grades per ZIP and store per-ZIP averages"
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--zips", nargs="+", help="One or more 5-digit ZIP codes to process")
    group.add_argument("--all",  action="store_true", help="Process all ZIPs in the CSV")

    args = parser.parse_args()
    zip_filter = args.zips if not args.all else None
    fetch_school_ratings(zip_filter=zip_filter)


if __name__ == "__main__":
    main()
