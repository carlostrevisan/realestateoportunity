"""
conftest.py — shared pytest fixtures and environment setup.

Two problems solved here:
1. db.py raises EnvironmentError when DATABASE_URL is not set.
2. psycopg2 may not be installed locally (it lives inside Docker).

Both are handled by injecting stubs into sys.modules BEFORE any test file
imports db.py. This means no real PostgreSQL connection is ever attempted.
"""
import os
import sys
from unittest.mock import MagicMock

# ── 1. Provide a dummy DATABASE_URL ────────────────────────────────────────
os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost/realestate_test")

# ── 2. Stub psycopg2 + psycopg2.extras + xgboost + lightgbm if they are not installed ───────────
# This allows db.py and ml_model.py to be imported without these being present or functional.
if "psycopg2" not in sys.modules:
    mock_psycopg2 = MagicMock()
    mock_psycopg2.extras = MagicMock()
    mock_psycopg2.extras.RealDictCursor = MagicMock()
    mock_psycopg2.extras.execute_batch = MagicMock()
    sys.modules["psycopg2"] = mock_psycopg2
    sys.modules["psycopg2.extras"] = mock_psycopg2.extras

if "xgboost" not in sys.modules or os.environ.get("STUB_ML"):
    mock_xgb = MagicMock()
    mock_xgb.XGBRegressor = MagicMock()
    sys.modules["xgboost"] = mock_xgb

if "lightgbm" not in sys.modules or os.environ.get("STUB_ML"):
    sys.modules["lightgbm"] = MagicMock()

# ── 3. Ensure the data-engine source directory is on the path ───────────────
_engine_dir = os.path.dirname(os.path.dirname(__file__))
if _engine_dir not in sys.path:
    sys.path.insert(0, _engine_dir)
