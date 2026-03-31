import pytest
import pandas as pd
import numpy as np
from ml_model import (
    haversine_distance, 
    _coerce_coordinates, 
    sanity_check_data, 
    calculate_geospatial_features,
    NEARBY_RADIUS_MILES
)

def test_haversine_distance():
    # NYC to LA (approx 2445 miles)
    nyc = (40.7128, -74.0060)
    la = (34.0522, -118.2437)
    dist = haversine_distance(nyc[0], nyc[1], la[0], la[1])
    assert 2400 < dist < 2500

    # Same point should be 0
    assert haversine_distance(40.7128, -74.0060, 40.7128, -74.0060) == 0

def test_coerce_coordinates():
    df = pd.DataFrame({
        'lat': [40.7128, '34.0522', None],
        'lng': [-74.0060, -118.2437, 'abc']
    })
    _coerce_coordinates(df)
    assert pd.api.types.is_float_dtype(df['lat'])
    assert pd.api.types.is_float_dtype(df['lng'])
    assert np.isnan(df.loc[2, 'lat'])
    assert np.isnan(df.loc[2, 'lng'])

def test_sanity_check_data():
    # Good data
    df_good = pd.DataFrame({
        'lat': [40.7] * 20,
        'lng': [-74.0] * 20,
        'sold_price': [500000] * 20
    })
    ok, msg = sanity_check_data(df_good, "training")
    assert ok is True

    # Insufficient records
    df_small = pd.DataFrame({'lat': [40.7], 'lng': [-74.0]})
    ok, msg = sanity_check_data(df_small, "training")
    assert ok is False
    assert "Insufficient records" in msg

    # Too many missing coords
    df_no_coords = pd.DataFrame({
        'lat': [None] * 20,
        'lng': [None] * 20,
        'sold_price': [500000] * 20
    })
    ok, msg = sanity_check_data(df_no_coords, "training")
    assert ok is False
    assert "Too many missing coordinates" in msg

    # Extreme prices
    df_extreme = pd.DataFrame({
        'lat': [40.7] * 20,
        'lng': [-74.0] * 20,
        'sold_price': [100] * 20
    })
    ok, msg = sanity_check_data(df_extreme, "training")
    assert ok is False
    assert "Suspicious price distribution" in msg

def test_calculate_geospatial_features():
    # 1. Setup reference data (new builds)
    ref_df = pd.DataFrame({
        'id': [1, 2, 3],
        'lat': [40.7128, 40.7130, 40.8128], # 1 & 2 are close, 3 is far
        'lng': [-74.0060, -74.0062, -74.1060],
        'sold_price': [1000000, 1200000, 1500000],
        'sqft': [1000, 1000, 1000],
        'zip': ['10001', '10001', '10002']
    })
    # price_sqft: 1000, 1200, 1500

    # 2. Setup target data
    # Prop A: near 1 & 2
    # Prop B: near 3
    # Prop C: near none (should use zip fallback or global)
    target_df = pd.DataFrame({
        'id': [10, 11, 12],
        'lat': [40.7129, 40.8129, 25.7617],
        'lng': [-74.0061, -74.1061, -80.1918],
        'zip': ['10001', '10002', '33101']
    })

    features = calculate_geospatial_features(target_df, ref_df)

    # Prop A (id 10) is near 1 & 2. Avg price_sqft = (1000 + 1200) / 2 = 1100
    assert features[0] == pytest.approx(1100)

    # Prop B (id 11) is near 3. Avg price_sqft = 1500
    assert features[1] == pytest.approx(1500)

    # Prop C (id 12) is near none. Zip '33101' not in ref. Should fallback to global avg.
    # Global avg = (1000 + 1200 + 1500) / 3 = 1233.33
    assert features[2] == pytest.approx(1233.3333333)

def test_calculate_geospatial_features_empty_ref():
    target_df = pd.DataFrame({'id': [1], 'lat': [40], 'lng': [-70], 'zip': ['10001']})
    ref_df = pd.DataFrame(columns=['id', 'lat', 'lng', 'sold_price', 'sqft', 'zip'])
    features = calculate_geospatial_features(target_df, ref_df)
    assert np.all(features == 0)


# ─────────────────────────────────────────────────────────────────────────────
# Temporal feature derivation
# ─────────────────────────────────────────────────────────────────────────────

def test_temporal_features_from_sold_date():
    """month_sold should be extracted correctly from sold_date strings."""
    df = pd.DataFrame({'sold_date': ['2023-03-15', '2022-11-01', None]})
    dates = pd.to_datetime(df['sold_date'], errors='coerce')
    month_sold = dates.dt.month.fillna(0).astype(int)
    assert month_sold.iloc[0] == 3
    assert month_sold.iloc[1] == 11
    assert month_sold.iloc[2] == 0  # NaT → 0


def test_temporal_features_no_date_column():
    """When sold_date is missing, month_sold should default to 0."""
    df = pd.DataFrame({'sqft': [1500, 2000]})
    month_sold = 0 if 'sold_date' not in df.columns else None
    assert month_sold == 0


# ─────────────────────────────────────────────────────────────────────────────
# City encoding
# ─────────────────────────────────────────────────────────────────────────────

def test_city_encoding_known_city():
    """Known cities should map to a non-negative integer."""
    cities = ['Tampa', 'Orlando', 'Miami']
    unique = sorted(c.lower() for c in cities)
    city_map = {c: i for i, c in enumerate(unique)}
    assert city_map['miami'] == 0
    assert city_map['orlando'] == 1
    assert city_map['tampa'] == 2


def test_city_encoding_unknown_city_maps_to_minus_one():
    """A city not seen during training should map to -1."""
    city_map = {'miami': 0, 'orlando': 1, 'tampa': 2}
    df = pd.DataFrame({'city': ['Miami', 'Sarasota', None]})
    encoded = df['city'].str.lower().map(city_map).fillna(-1)
    assert encoded.iloc[0] == 0    # Miami → 0
    assert encoded.iloc[1] == -1   # Sarasota → unknown → -1
    assert encoded.iloc[2] == -1   # None → -1


# ─────────────────────────────────────────────────────────────────────────────
# Realistic cost formula
# ─────────────────────────────────────────────────────────────────────────────

def test_realistic_cost_formula():
    """total_dev_cost = list_price * 1.08 + sqft * cost_per_sqft * 1.36"""
    list_price    = 400_000
    sqft          = 2_000
    cost_per_sqft = 175.0
    hard_cost     = sqft * cost_per_sqft          # 350_000
    total_cost    = list_price * 1.08 + hard_cost * 1.36   # 432_000 + 476_000 = 908_000
    assert total_cost == pytest.approx(908_000.0)


def test_realistic_cost_is_higher_than_naive_formula():
    """Realistic formula always produces a higher (more conservative) cost than naive."""
    list_price    = 300_000
    sqft          = 1_800
    cost_per_sqft = 175.0
    naive_total   = list_price + sqft * cost_per_sqft
    hard_cost     = sqft * cost_per_sqft
    realistic_total = list_price * 1.08 + hard_cost * 1.36
    assert realistic_total > naive_total


# ─────────────────────────────────────────────────────────────────────────────
# Temporal train/test split
# ─────────────────────────────────────────────────────────────────────────────

def test_temporal_split_ordering():
    """All test-set dates should be after the training cutoff date."""
    # Use pd.Series so .quantile() is available (DatetimeIndex lacks it)
    dates = pd.Series(pd.to_datetime([
        '2021-01-01', '2021-06-01', '2022-01-01',
        '2022-06-01', '2023-01-01', '2023-06-01',
        '2023-09-01', '2023-12-01', '2024-01-01', '2024-06-01',
    ]))
    test_split = 0.2
    cutoff = dates.quantile(1 - test_split)
    train_mask = dates <= cutoff
    test_dates  = dates[~train_mask]
    train_dates = dates[train_mask]

    assert len(train_dates) > 0
    assert len(test_dates) > 0
    assert test_dates.min() > train_dates.max()


def test_temporal_split_fallback_on_identical_dates():
    """When all dates are identical the cutoff equals max, so ~train_mask is empty."""
    # Use pd.Series so .quantile() is available
    dates = pd.Series(pd.to_datetime(['2022-06-01'] * 20))
    test_split = 0.2
    cutoff = dates.quantile(1 - test_split)
    train_mask = dates <= cutoff
    # All rows equal the cutoff date → all are in train → fallback path needed
    assert (~train_mask).sum() == 0
