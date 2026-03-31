"""
test_school_fetcher.py - Unit tests for school_fetcher.py.

Tests grade conversion and per-ZIP aggregation logic without touching
the database or making any HTTP requests.
"""

import pytest
import pandas as pd
from school_fetcher import convert_grade, compute_zip_ratings


# ─────────────────────────────────────────────────────────────────────────────
# Grade conversion
# ─────────────────────────────────────────────────────────────────────────────

class TestConvertGrade:
    def test_a_maps_to_5(self):
        assert convert_grade("A") == 5

    def test_b_maps_to_4(self):
        assert convert_grade("B") == 4

    def test_c_maps_to_3(self):
        assert convert_grade("C") == 3

    def test_d_maps_to_2(self):
        assert convert_grade("D") == 2

    def test_f_maps_to_1(self):
        assert convert_grade("F") == 1

    def test_lowercase_a_maps_to_5(self):
        assert convert_grade("a") == 5

    def test_lowercase_f_maps_to_1(self):
        assert convert_grade("f") == 1

    def test_grade_with_whitespace_is_stripped(self):
        assert convert_grade("  B  ") == 4

    def test_incomplete_grade_returns_none(self):
        assert convert_grade("I") is None

    def test_unknown_grade_returns_none(self):
        assert convert_grade("X") is None

    def test_empty_string_returns_none(self):
        assert convert_grade("") is None

    def test_none_input_returns_none(self):
        assert convert_grade(None) is None

    def test_numeric_string_returns_none(self):
        assert convert_grade("5") is None


# ─────────────────────────────────────────────────────────────────────────────
# ZIP aggregation
# ─────────────────────────────────────────────────────────────────────────────

class TestComputeZipRatings:
    def _make_df(self, rows: list[dict]) -> pd.DataFrame:
        return pd.DataFrame(rows, dtype=str)

    def test_single_zip_single_school(self):
        df = self._make_df([{"zip": "33606", "grade": "A"}])
        result = compute_zip_ratings(df, "zip", "grade")
        assert len(result) == 1
        assert result[0]["zip"] == "33606"
        assert result[0]["avg_rating"] == pytest.approx(5.0)
        assert result[0]["school_count"] == 1

    def test_single_zip_multiple_schools_averages_correctly(self):
        # A=5, B=4, C=3  → avg = 4.0
        df = self._make_df([
            {"zip": "33606", "grade": "A"},
            {"zip": "33606", "grade": "B"},
            {"zip": "33606", "grade": "C"},
        ])
        result = compute_zip_ratings(df, "zip", "grade")
        assert len(result) == 1
        assert result[0]["avg_rating"] == pytest.approx(4.0)
        assert result[0]["school_count"] == 3

    def test_multiple_zips_aggregated_separately(self):
        df = self._make_df([
            {"zip": "33606", "grade": "A"},  # avg=5
            {"zip": "33629", "grade": "C"},  # avg=3
            {"zip": "33629", "grade": "D"},  # avg=(3+2)/2=2.5
        ])
        result = compute_zip_ratings(df, "zip", "grade")
        by_zip = {r["zip"]: r for r in result}
        assert by_zip["33606"]["avg_rating"] == pytest.approx(5.0)
        assert by_zip["33629"]["avg_rating"] == pytest.approx(2.5)
        assert by_zip["33629"]["school_count"] == 2

    def test_incomplete_grades_are_skipped(self):
        # "I" (Incomplete) should not count
        df = self._make_df([
            {"zip": "33606", "grade": "A"},
            {"zip": "33606", "grade": "I"},  # should be skipped
        ])
        result = compute_zip_ratings(df, "zip", "grade")
        assert result[0]["school_count"] == 1
        assert result[0]["avg_rating"] == pytest.approx(5.0)

    def test_non_five_digit_zips_are_filtered_out(self):
        df = self._make_df([
            {"zip": "33606",  "grade": "A"},   # valid
            {"zip": "XXXXX",  "grade": "B"},   # invalid
            {"zip": "3360",   "grade": "C"},   # too short
        ])
        result = compute_zip_ratings(df, "zip", "grade")
        assert len(result) == 1
        assert result[0]["zip"] == "33606"

    def test_all_unknown_grades_returns_empty(self):
        df = self._make_df([
            {"zip": "33606", "grade": "I"},
            {"zip": "33606", "grade": "X"},
        ])
        result = compute_zip_ratings(df, "zip", "grade")
        assert result == []

    def test_avg_rating_is_rounded_to_one_decimal(self):
        # A=5, B=4, C=3  → avg = 4.0; A=5, D=2 → avg = 3.5
        df = self._make_df([
            {"zip": "33606", "grade": "A"},
            {"zip": "33606", "grade": "D"},
        ])
        result = compute_zip_ratings(df, "zip", "grade")
        # 3.5 rounded to 1 decimal = 3.5
        assert result[0]["avg_rating"] == pytest.approx(3.5)
