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
