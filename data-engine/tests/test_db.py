"""
test_db.py — Unit tests for db.py database operations.

Strategy: Every test mocks psycopg2.connect() so no real PostgreSQL instance
is needed. The mock cursor captures SQL calls and returns controlled fixture
data. This lets us verify:
  - That the right SQL is executed (via call assertions)
  - That the return values are transformed correctly
  - That edge cases (empty results, errors) are handled gracefully

Pattern: Arrange → Act → Assert throughout.
"""

import pytest
from unittest.mock import MagicMock, call


# ─────────────────────────────────────────────────────────────────────────────
# Fixture: mock psycopg2 connection + cursor
# ─────────────────────────────────────────────────────────────────────────────

@pytest.fixture
def mock_cursor(mocker):
    """
    Patch psycopg2.connect at the db module level and return a MagicMock
    cursor that tests can configure with .fetchone() / .fetchall() return values.

    The context managers (conn.__enter__, cursor.__enter__) are wired so that
    the `with get_cursor() as cur:` pattern in db.py works correctly.
    """
    mock_conn = MagicMock()
    mock_cur = MagicMock()

    # Wire the connection context manager: `with conn:` yields mock_conn
    mock_conn.__enter__ = MagicMock(return_value=mock_conn)
    mock_conn.__exit__ = MagicMock(return_value=False)

    # Wire the cursor context manager: `with conn.cursor(...) as cur:` yields mock_cur
    mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_cur)
    mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)

    mocker.patch("db.psycopg2.connect", return_value=mock_conn)

    return mock_cur


# ─────────────────────────────────────────────────────────────────────────────
# upsert_properties
# ─────────────────────────────────────────────────────────────────────────────

class TestUpsertProperties:
    def test_returns_zero_for_empty_records(self, mock_cursor):
        # Arrange
        import db

        # Act
        count = db.upsert_properties([], "for_sale")

        # Assert — nothing was written, no DB call needed
        assert count == 0

    def test_returns_count_of_records_inserted(self, mock_cursor):
        # Arrange
        import db
        records = [
            {"mls_id": "MLS001", "address": "123 Oak", "city": "Tampa", "zip": "33606",
             "lat": 27.948, "lng": -82.458, "year_built": 1965, "sqft": 1800,
             "lot_sqft": 7500, "list_price": 450000, "sold_price": None,
             "sold_date": None, "property_type": "SINGLE_FAMILY"},
        ]

        # Act
        count = db.upsert_properties(records, "for_sale")

        # Assert
        assert count == 1

    def test_sets_listing_type_on_every_record(self, mock_cursor):
        # Arrange
        import db
        records = [
            {"mls_id": "A", "address": "1st St", "city": "Tampa", "zip": "33606",
             "lat": 27.9, "lng": -82.4, "year_built": 1970, "sqft": 1500,
             "lot_sqft": 6000, "list_price": 300000, "sold_price": None,
             "sold_date": None, "property_type": "SINGLE_FAMILY"},
        ]

        # Act
        db.upsert_properties(records, "sold")

        # Assert — the listing_type was stamped on the record before the DB call
        assert records[0]["listing_type"] == "sold"

    def test_calls_execute_batch(self, mocker, mock_cursor):
        # Arrange
        import db
        mock_batch = mocker.patch("db.psycopg2.extras.execute_batch")
        records = [
            {"mls_id": "B", "address": "2nd Ave", "city": "Tampa", "zip": "33606",
             "lat": 27.9, "lng": -82.4, "year_built": 1980, "sqft": 2000,
             "lot_sqft": 8000, "list_price": 500000, "sold_price": None,
             "sold_date": None, "property_type": "SINGLE_FAMILY"},
        ]

        # Act
        db.upsert_properties(records, "for_sale")

        # Assert — execute_batch was called once with the correct arguments
        assert mock_batch.call_count == 1
        _, args, kwargs = mock_batch.mock_calls[0]
        # args: (cursor, sql, records, page_size=100)
        assert args[0] is mock_cursor
        assert len(args[2]) == 1  # one record


# ─────────────────────────────────────────────────────────────────────────────
# check_chunk_completed
# ─────────────────────────────────────────────────────────────────────────────

class TestCheckChunkCompleted:
    def test_returns_true_when_chunk_exists_in_scrape_log(self, mock_cursor):
        # Arrange
        import db
        mock_cursor.fetchone.return_value = {"1": 1}  # row exists

        # Act
        result = db.check_chunk_completed("tampa", 3, 2025, "sold")

        # Assert
        assert result is True

    def test_returns_false_when_chunk_does_not_exist(self, mock_cursor):
        # Arrange
        import db
        mock_cursor.fetchone.return_value = None  # no row

        # Act
        result = db.check_chunk_completed("tampa", 3, 2025, "sold")

        # Assert
        assert result is False

    def test_executes_select_query_with_correct_parameters(self, mock_cursor):
        # Arrange
        import db
        mock_cursor.fetchone.return_value = None

        # Act
        db.check_chunk_completed("orlando", 6, 2024, "for_sale")

        # Assert — the cursor was called with the right positional params
        call_args = mock_cursor.execute.call_args
        sql, params = call_args[0]
        assert "scrape_log" in sql
        assert params == ("orlando", 6, 2024, "for_sale")


# ─────────────────────────────────────────────────────────────────────────────
# start_model_run
# ─────────────────────────────────────────────────────────────────────────────

class TestStartModelRun:
    def test_returns_integer_run_id(self, mock_cursor):
        # Arrange
        import db
        mock_cursor.fetchone.return_value = {"id": 42}

        # Act
        run_id = db.start_model_run("train")

        # Assert
        assert run_id == 42

    def test_inserts_row_with_running_status(self, mock_cursor):
        # Arrange
        import db
        mock_cursor.fetchone.return_value = {"id": 7}

        # Act
        db.start_model_run("score")

        # Assert — SQL contains RETURNING id and run_type
        call_args = mock_cursor.execute.call_args
        sql, params = call_args[0]
        assert "RETURNING id" in sql
        assert "running" in sql
        assert "score" in params


# ─────────────────────────────────────────────────────────────────────────────
# write_opportunity_scores
# ─────────────────────────────────────────────────────────────────────────────

class TestWriteOpportunityScores:
    def test_does_nothing_for_empty_scores(self, mocker, mock_cursor):
        # Arrange
        import db
        mock_batch = mocker.patch("db.psycopg2.extras.execute_batch")

        # Act
        db.write_opportunity_scores([])

        # Assert — no DB call made
        mock_batch.assert_not_called()

    def test_calls_execute_batch_with_update_sql(self, mocker, mock_cursor):
        # Arrange
        import db
        mock_batch = mocker.patch("db.psycopg2.extras.execute_batch")
        scores = [
            {"id": 1, "predicted_rebuild_value": 720000, "opportunity_result": 115000},
        ]

        # Act
        db.write_opportunity_scores(scores)

        # Assert
        assert mock_batch.call_count == 1
        _, args, _ = mock_batch.mock_calls[0]
        sql = args[1]
        assert "UPDATE properties" in sql
        assert "predicted_rebuild_value" in sql
        assert "opportunity_result" in sql


# ─────────────────────────────────────────────────────────────────────────────
# fail_model_run
# ─────────────────────────────────────────────────────────────────────────────

class TestFailModelRun:
    def test_updates_status_to_failed(self, mock_cursor):
        # Arrange
        import db

        # Act
        db.fail_model_run(run_id=3, error="XGBoost: insufficient training data")

        # Assert — SQL sets status='failed'
        call_args = mock_cursor.execute.call_args
        sql, params = call_args[0]
        assert "failed" in sql
        assert 3 in params
        assert "XGBoost: insufficient training data" in params
