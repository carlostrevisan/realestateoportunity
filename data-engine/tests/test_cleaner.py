"""
test_cleaner.py - Unit tests for cleaner.py data quality filters.

Each test exercises one filter rule in isolation using a small, hand-crafted
DataFrame. The goal is to verify that:
  1. Valid rows survive each filter.
  2. Invalid rows are removed.
  3. The boundary conditions (e.g., exactly 1901 vs. 1902) are handled correctly.

Pattern: Arrange → Act → Assert throughout.
"""

import pytest
import pandas as pd
from cleaner import clean, normalize_for_db


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def make_row(**overrides) -> dict:
    """Return a dict representing a single valid property row.

    Callers can override any field to test specific filter conditions.
    """
    base = {
        "style": "SINGLE_FAMILY",
        "list_price": 450_000,
        "year_built": 1965,
        "sqft": 1_800,
        "latitude": 27.948,
        "longitude": -82.458,
    }
    base.update(overrides)
    return base


def df_from_rows(*rows) -> pd.DataFrame:
    """Build a DataFrame from one or more row dicts."""
    return pd.DataFrame(list(rows))


# ─────────────────────────────────────────────────────────────────────────────
# Empty / None input
# ─────────────────────────────────────────────────────────────────────────────

class TestEmptyInput:
    def test_none_input_returns_empty_dataframe(self):
        # Arrange & Act
        result = clean(None)
        # Assert
        assert isinstance(result, pd.DataFrame)
        assert result.empty

    def test_empty_dataframe_input_returns_empty_dataframe(self):
        # Arrange
        df = pd.DataFrame()
        # Act
        result = clean(df)
        # Assert
        assert result.empty


# ─────────────────────────────────────────────────────────────────────────────
# Property type filter - Single Family only
# ─────────────────────────────────────────────────────────────────────────────

class TestPropertyTypeFilter:
    def test_single_family_row_survives(self):
        # Arrange
        df = df_from_rows(make_row(style="SINGLE_FAMILY"))
        # Act
        result = clean(df)
        # Assert
        assert len(result) == 1

    def test_single_family_mixed_case_survives(self):
        df = df_from_rows(make_row(style="Single Family"))
        result = clean(df)
        assert len(result) == 1

    def test_condo_is_removed(self):
        df = df_from_rows(make_row(style="CONDO"))
        result = clean(df)
        assert result.empty

    def test_townhome_is_removed(self):
        df = df_from_rows(make_row(style="TOWNHOME"))
        result = clean(df)
        assert result.empty

    def test_multi_family_is_removed(self):
        df = df_from_rows(make_row(style="MULTI_FAMILY"))
        result = clean(df)
        assert result.empty

    def test_land_is_removed(self):
        df = df_from_rows(make_row(style="LAND"))
        result = clean(df)
        assert result.empty

    def test_mixed_types_only_keeps_single_family(self):
        # Arrange - 1 valid row and 2 invalid rows
        df = df_from_rows(
            make_row(style="SINGLE_FAMILY"),
            make_row(style="CONDO"),
            make_row(style="TOWNHOME"),
        )
        # Act
        result = clean(df)
        # Assert
        assert len(result) == 1


# ─────────────────────────────────────────────────────────────────────────────
# Price filter - $100k to $5M
# ─────────────────────────────────────────────────────────────────────────────

class TestPriceFilter:
    def test_price_at_lower_bound_survives(self):
        df = df_from_rows(make_row(list_price=100_000))
        assert len(clean(df)) == 1

    def test_price_below_lower_bound_is_removed(self):
        df = df_from_rows(make_row(list_price=99_999))
        assert clean(df).empty

    def test_price_at_upper_bound_survives(self):
        df = df_from_rows(make_row(list_price=5_000_000))
        assert len(clean(df)) == 1

    def test_price_above_upper_bound_is_removed(self):
        df = df_from_rows(make_row(list_price=5_000_001))
        assert clean(df).empty

    def test_null_price_is_removed(self):
        df = df_from_rows(make_row(list_price=None))
        assert clean(df).empty


# ─────────────────────────────────────────────────────────────────────────────
# Year built filter - must be > 1901
# ─────────────────────────────────────────────────────────────────────────────

class TestYearBuiltFilter:
    def test_year_1902_survives(self):
        df = df_from_rows(make_row(year_built=1902))
        assert len(clean(df)) == 1

    def test_year_1901_is_removed(self):
        # Boundary: must be strictly greater than 1901
        df = df_from_rows(make_row(year_built=1901))
        assert clean(df).empty

    def test_year_1900_is_removed(self):
        # HomeHarvest sometimes uses 1900 for unknown year
        df = df_from_rows(make_row(year_built=1900))
        assert clean(df).empty

    def test_year_zero_is_removed(self):
        # HomeHarvest sometimes uses 0 for unknown year
        df = df_from_rows(make_row(year_built=0))
        assert clean(df).empty

    def test_null_year_built_is_removed(self):
        df = df_from_rows(make_row(year_built=None))
        assert clean(df).empty

    def test_modern_year_survives(self):
        df = df_from_rows(make_row(year_built=2015))
        assert len(clean(df)) == 1


# ─────────────────────────────────────────────────────────────────────────────
# Square footage filter - must be < 5,000
# ─────────────────────────────────────────────────────────────────────────────

class TestSqftFilter:
    def test_sqft_below_limit_survives(self):
        df = df_from_rows(make_row(sqft=4_999))
        assert len(clean(df)) == 1

    def test_sqft_at_limit_is_removed(self):
        # Boundary: must be strictly less than 5,000
        df = df_from_rows(make_row(sqft=5_000))
        assert clean(df).empty

    def test_sqft_above_limit_is_removed(self):
        df = df_from_rows(make_row(sqft=6_000))
        assert clean(df).empty

    def test_sqft_zero_is_removed(self):
        df = df_from_rows(make_row(sqft=0))
        assert clean(df).empty

    def test_null_sqft_is_removed(self):
        df = df_from_rows(make_row(sqft=None))
        assert clean(df).empty


# ─────────────────────────────────────────────────────────────────────────────
# Coordinates filter - lat and lng must be non-null
# ─────────────────────────────────────────────────────────────────────────────

class TestCoordinatesFilter:
    def test_row_with_valid_coordinates_survives(self):
        df = df_from_rows(make_row(latitude=27.948, longitude=-82.458))
        assert len(clean(df)) == 1

    def test_row_with_null_latitude_is_removed(self):
        df = df_from_rows(make_row(latitude=None, longitude=-82.458))
        assert clean(df).empty

    def test_row_with_null_longitude_is_removed(self):
        df = df_from_rows(make_row(latitude=27.948, longitude=None))
        assert clean(df).empty

    def test_row_with_both_null_coordinates_is_removed(self):
        df = df_from_rows(make_row(latitude=None, longitude=None))
        assert clean(df).empty


# ─────────────────────────────────────────────────────────────────────────────
# Multi-filter: a row failing multiple rules is counted once
# ─────────────────────────────────────────────────────────────────────────────

class TestMultipleFilterInteraction:
    def test_row_failing_two_rules_is_removed_once(self):
        # Arrange - fails both price and year_built rules
        df = df_from_rows(make_row(list_price=50_000, year_built=1900))
        # Act
        result = clean(df)
        # Assert - row is gone, but the result is still a valid (empty) DataFrame
        assert result.empty

    def test_all_valid_rows_survive_all_filters(self):
        # Arrange - 3 valid rows
        df = df_from_rows(
            make_row(style="SINGLE_FAMILY", list_price=300_000, year_built=1980, sqft=1_500, latitude=27.9, longitude=-82.4),
            make_row(style="SINGLE_FAMILY", list_price=500_000, year_built=1955, sqft=2_200, latitude=28.0, longitude=-81.9),
            make_row(style="Single Family", list_price=4_000_000, year_built=2010, sqft=4_800, latitude=28.5, longitude=-81.3),
        )
        # Act
        result = clean(df)
        # Assert - all 3 survive
        assert len(result) == 3


# ─────────────────────────────────────────────────────────────────────────────
# normalize_for_db
# ─────────────────────────────────────────────────────────────────────────────

class TestNormalizeForDb:
    def _valid_df(self) -> pd.DataFrame:
        """Minimal cleaned DataFrame matching the cleaner column names."""
        return pd.DataFrame([{
            "mls_id": "MLS001",
            "full_street_line": "123 Oak St",
            "city": "Tampa",
            "zip_code": "33606",
            "latitude": 27.948,
            "longitude": -82.458,
            "year_built": 1965,
            "sqft": 1800,
            "lot_sqft": 7500,
            "list_price": 450_000,
            "sold_price": None,
            "sold_date": None,
            "style": "SINGLE_FAMILY",
        }])

    def test_returns_a_list(self):
        result = normalize_for_db(self._valid_df())
        assert isinstance(result, list)

    def test_returns_one_record_per_row(self):
        result = normalize_for_db(self._valid_df())
        assert len(result) == 1

    def test_mls_id_is_cast_to_string(self):
        # Arrange - mls_id as an integer (as HomeHarvest sometimes returns)
        df = self._valid_df()
        df["mls_id"] = 12345  # integer
        result = normalize_for_db(df)
        assert isinstance(result[0]["mls_id"], str)
        assert result[0]["mls_id"] == "12345"

    def test_address_is_mapped_from_full_street_line(self):
        result = normalize_for_db(self._valid_df())
        assert result[0]["address"] == "123 Oak St"

    def test_zip_is_mapped_from_zip_code(self):
        result = normalize_for_db(self._valid_df())
        assert result[0]["zip"] == "33606"

    def test_default_zip_is_used_when_zip_column_is_missing(self):
        df = self._valid_df().drop(columns=["zip_code"])
        result = normalize_for_db(df, default_zip="33629")
        assert result[0]["zip"] == "33629"

    def test_lat_and_lng_are_mapped_correctly(self):
        result = normalize_for_db(self._valid_df())
        assert result[0]["lat"] == pytest.approx(27.948)
        assert result[0]["lng"] == pytest.approx(-82.458)

    def test_beds_and_baths_are_mapped_from_homeharvest_columns(self):
        # Arrange - HomeHarvest-style column names
        df = self._valid_df()
        df["beds"] = 3
        df["full_baths"] = 2.0
        # Act
        result = normalize_for_db(df)
        # Assert
        assert result[0]["beds"] == 3
        assert result[0]["baths"] == pytest.approx(2.0)

    def test_beds_and_baths_are_none_when_columns_absent(self):
        # Arrange - no beds/baths columns at all
        df = self._valid_df()
        # Act
        result = normalize_for_db(df)
        # Assert
        assert result[0]["beds"] is None
        assert result[0]["baths"] is None

    def test_beds_mapped_from_bedrooms_column(self):
        # Arrange - alternate HomeHarvest column name
        df = self._valid_df()
        df["bedrooms"] = 4
        df["baths"] = 3.0
        result = normalize_for_db(df)
        assert result[0]["beds"] == 4
