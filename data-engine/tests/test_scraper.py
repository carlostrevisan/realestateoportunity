import pytest
import pandas as pd
import numpy as np
from unittest.mock import MagicMock, patch
from scraper import _get_location_and_zips, _format_eta, _scrape_with_retry, _filter_to_zips

def test_get_location_and_zips():
    # Market string
    loc, zips = _get_location_and_zips("tampa")
    assert loc == "Tampa, FL"
    assert zips is None

    # Zip string
    loc, zips = _get_location_and_zips("33101")
    assert loc == "33101"
    assert zips == ["33101"]

    # Custom location
    loc, zips = _get_location_and_zips("Miami, FL")
    assert loc == "Miami, FL"
    assert zips is None

def test_format_eta():
    assert _format_eta(30) == "~30s"
    assert _format_eta(120) == "~2 min"
    assert _format_eta(3660) == "~1h 1min"

@patch("time.sleep") # Don't actually sleep in tests
def test_scrape_with_retry_success(mock_sleep):
    mock_scrape = MagicMock()
    mock_scrape.return_value = pd.DataFrame({'id': [1]})
    
    with patch("homeharvest.scrape_property", mock_scrape):
        res, ok = _scrape_with_retry("Tampa, FL", "sold", label="test")
        assert ok is True
        assert len(res) == 1
        assert mock_scrape.call_count == 1

@patch("time.sleep")
def test_scrape_with_retry_transient_failure(mock_sleep):
    mock_scrape = MagicMock()
    # Fail twice with 429, then succeed
    mock_scrape.side_effect = [Exception("429 Too Many Requests"), Exception("429"), pd.DataFrame({'id': [1]})]
    
    with patch("homeharvest.scrape_property", mock_scrape):
        res, ok = _scrape_with_retry("Tampa, FL", "sold", label="test")
        assert ok is True
        assert len(res) == 1
        assert mock_scrape.call_count == 3
        assert mock_sleep.call_count == 2

@patch("time.sleep")
def test_scrape_with_retry_fatal_failure(mock_sleep):
    mock_scrape = MagicMock()
    # Fatal error (not in the transient list)
    mock_scrape.side_effect = Exception("Some weird error")
    
    with patch("homeharvest.scrape_property", mock_scrape):
        res, ok = _scrape_with_retry("Tampa, FL", "sold", label="test")
        assert ok is False
        assert res is None
        assert mock_scrape.call_count == 1

def test_filter_to_zips():
    df = pd.DataFrame({
        'mls_id': [1, 2, 3],
        'zip_code': ['33101', '33102', '33103']
    })
    
    # Filter to one zip
    filtered = _filter_to_zips(df, ['33101'])
    assert len(filtered) == 1
    assert filtered.iloc[0]['mls_id'] == 1
    
    # Filter to multiple
    filtered = _filter_to_zips(df, ['33101', '33102'])
    assert len(filtered) == 2
    
    # No filter
    filtered = _filter_to_zips(df, None)
    assert len(filtered) == 3

    # Other zip column name
    df2 = pd.DataFrame({'zip': ['33101', '44101']})
    filtered = _filter_to_zips(df2, ['33101'])
    assert len(filtered) == 1
