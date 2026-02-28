"""
ml_model.py — XGBoost training and scoring logic + Weighted Scoring + Geospatial Features.
"""

import argparse
import json
import logging
import os
from datetime import datetime

import pandas as pd
import numpy as np
import xgboost as xgb
from sklearn.model_selection import train_test_split
from sklearn.metrics import r2_score

import db

# Updated feature set
FEATURE_COLS = ['sqft', 'lot_sqft', 'year_built', 'median_household_income', 'zip', 'avg_new_build_price_sqft_05mi']

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

def haversine_distance(lat1, lon1, lat2, lon2):
    """Vectorized haversine distance calculation (in miles)."""
    R = 3958.8  # Earth radius in miles
    phi1, phi2 = np.radians(lat1), np.radians(lat2)
    dphi = np.radians(lat2 - lat1)
    dlambda = np.radians(lon2 - lon1)
    a = np.sin(dphi/2)**2 + np.cos(phi1)*np.cos(phi2)*np.sin(dlambda/2)**2
    return 2 * R * np.arctan2(np.sqrt(a), np.sqrt(1-a))

def calculate_geospatial_features(df, reference_df):
    """
    For each row in df, find new builds in reference_df within 0.5 miles 
    and calculate their average sold price per sqft.
    """
    logger.info(f"[EXEC] Calculating 0.5-mile radius features for {len(df)} properties...")
    
    # Ensure we have price_per_sqft in reference
    ref = reference_df.copy()
    ref['price_sqft'] = ref['sold_price'] / ref['sqft']
    ref = ref[ref['price_sqft'].notna() & np.isfinite(ref['price_sqft'])]
    
    if ref.empty:
        logger.warning("[SKIP] No valid reference data for geospatial features. Using 0.")
        return np.zeros(len(df))

    avg_prices = []
    
    # Extract coordinates once for speed (Ensuring float type)
    ref_lats = ref['lat'].astype(float).values
    ref_lngs = ref['lng'].astype(float).values
    ref_prices = ref['price_sqft'].values
    ref_ids = ref['id'].values
    ref_zips = ref['zip'].values

    for idx, row in df.iterrows():
        # Handle cases where current row has no coordinates
        if pd.isna(row['lat']) or pd.isna(row['lng']):
            avg_prices.append(0.0)
            continue

        dist = haversine_distance(float(row['lat']), float(row['lng']), ref_lats, ref_lngs)
        # Find matches within 0.5 miles, excluding self
        mask = (dist <= 0.5) & (ref_ids != row['id'])
        
        nearby_prices = ref_prices[mask]
        if nearby_prices.size > 0:
            avg_prices.append(nearby_prices.mean())
        else:
            # Fallback 1: ZIP average from reference
            zip_mask = (ref_zips == row['zip'])
            zip_prices = ref_prices[zip_mask]
            if zip_prices.size > 0:
                avg_prices.append(zip_prices.mean())
            else:
                # Fallback 2: Global average from reference
                avg_prices.append(ref_prices.mean())
            
    return np.array(avg_prices)

def sanity_check_data(df, stage="training"):
    """Validates data quality before proceeding."""
    logger.info(f"[EXEC] Sanity Check: {stage} data...")
    errors = []
    
    if len(df) < 10:
        errors.append(f"Insufficient records ({len(df)}). Need at least 10.")
    
    # Check for coordinates
    null_coords = df['lat'].isna().sum() + df['lng'].isna().sum()
    if null_coords > len(df) * 0.5:
        errors.append(f"Too many missing coordinates ({null_coords} rows). Check scraper logs.")
        
    # Check for price realism
    if stage == "training":
        if 'sold_price' in df.columns:
            extreme_prices = df[(df['sold_price'] < 10000) | (df['sold_price'] > 50000000)]
            if len(extreme_prices) > len(df) * 0.2:
                errors.append(f"Suspicious price distribution: {len(extreme_prices)} properties with extreme values.")

    if errors:
        msg = " | ".join(errors)
        logger.error(f"[FAIL] Sanity check failed: {msg}")
        return False, msg
    
    logger.info("[PASS] Sanity check passed.")
    return True, ""

def train_model(n_estimators=1000, max_depth=6, learning_rate=0.05, min_year_built=2015, test_split=0.2):
    run_id = db.start_model_run("train")
    logger.info("[EXEC] Starting model training...")

    try:
        data = db.fetch_sold_for_training()
        df = pd.DataFrame(data)
        
        # Ensure coordinates are floats (DB returns Decimals which break NumPy)
        if not df.empty:
            df['lat'] = pd.to_numeric(df['lat'], errors='coerce')
            df['lng'] = pd.to_numeric(df['lng'], errors='coerce')
        
        # 1. Sanity Check
        ok, error_msg = sanity_check_data(df, "training")
        if not ok:
            db.fail_model_run(run_id, error_msg)
            return

        # 2. Filter for training (new builds)
        train_df = df[df['year_built'] >= min_year_built].copy()
        if train_df.empty:
            msg = f"No new builds (post-{min_year_built}) found"
            logger.warning(f"[SKIP] {msg}")
            db.fail_model_run(run_id, msg)
            return

        # 3. Feature Engineering: 0.5-mile radius price/sqft
        train_df['avg_new_build_price_sqft_05mi'] = calculate_geospatial_features(train_df, train_df)

        # 4. Prepare X, y
        unique_zips = sorted(train_df['zip'].dropna().unique().tolist())
        zip_map = {z: i for i, z in enumerate(unique_zips)}

        X = train_df[FEATURE_COLS].copy()
        for col in FEATURE_COLS:
            if col == 'zip':
                X['zip'] = X['zip'].map(zip_map).fillna(-1)
            else:
                X[col] = pd.to_numeric(X[col], errors='coerce').fillna(0)

        y = train_df['sold_price']

        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=test_split, random_state=42)

        # 5. Train
        model = xgb.XGBRegressor(
            objective='reg:squarederror',
            n_estimators=n_estimators,
            learning_rate=learning_rate,
            max_depth=max_depth,
            subsample=0.8,
            colsample_bytree=0.8,
            random_state=42
        )
        model.fit(X_train, y_train)

        raw_imp = model.feature_importances_
        feature_importances = {feat: round(float(imp), 4) for feat, imp in zip(FEATURE_COLS, raw_imp)}

        preds = model.predict(X_test)
        r2 = r2_score(y_test, preds)

        # Save model
        if not os.path.exists("models"): os.makedirs("models")
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        model_path = f"models/rebuild_{run_id}_{timestamp}.json"
        model.save_model(model_path)

        context = {
            "zip_codes": sorted(df['zip'].dropna().unique().tolist()),
            "year_built_min": min_year_built,
            "feature_importances": feature_importances,
            "zip_map": zip_map,
            "n_estimators": n_estimators,
            "max_depth": max_depth,
            "learning_rate": learning_rate,
            "train_rows": len(X_train),
            "test_rows": len(X_test)
        }

        db.complete_model_run(
            run_id,
            properties_trained=len(train_df),
            r2_score=r2,
            model_path=model_path,
            training_context=json.dumps(context),
        )
        db.set_active_model(run_id)
        logger.info(f"[LOAD] Model saved R² = {r2:.4f}")

    except Exception as e:
        logger.error(f"[FAIL] Training failed: {str(e)}")
        db.fail_model_run(run_id, str(e))

def score_properties():
    run_id = db.start_model_run("score")
    try:
        active = db.get_active_model()
        if not active:
            logger.error("[FAIL] No active model found")
            return
        
        context = active.get("training_context")
        if isinstance(context, str): context = json.loads(context)
        zip_map = context.get("zip_map", {})

        # Load reference data for geospatial features
        sold_data = db.fetch_sold_for_training()
        sold_df = pd.DataFrame(sold_data)
        if not sold_df.empty:
            sold_df['lat'] = pd.to_numeric(sold_df['lat'], errors='coerce')
            sold_df['lng'] = pd.to_numeric(sold_df['lng'], errors='coerce')
        
        new_builds_ref = sold_df[sold_df['year_built'] >= context.get('year_built_min', 2015)]

        candidates = db.fetch_for_sale_for_scoring()
        if not candidates:
            db.complete_model_run(run_id, properties_scored=0)
            return

        df = pd.DataFrame(candidates)
        if not df.empty:
            df['lat'] = pd.to_numeric(df['lat'], errors='coerce')
            df['lng'] = pd.to_numeric(df['lng'], errors='coerce')
        
        # Calculate geospatial feature for scoring
        df['avg_new_build_price_sqft_05mi'] = calculate_geospatial_features(df, new_builds_ref)
        # Compatibility: Provide the old feature name as well in case an older model is active
        df['avg_new_build_price_sqft_1mi'] = df['avg_new_build_price_sqft_05mi']

        model = xgb.XGBRegressor()
        model.load_model(active["model_path"])

        # Detect which feature name the loaded model expects
        try:
            expected_features = model.get_booster().feature_names
            if expected_features:
                X = df[expected_features].copy()
            else:
                X = df[FEATURE_COLS].copy()
        except:
            X = df[FEATURE_COLS].copy()
        
        for col in X.columns:
            if col == 'zip':
                X['zip'] = X['zip'].map(zip_map).fillna(-1)
            else:
                X[col] = pd.to_numeric(X[col], errors='coerce').fillna(0)
        
        df['predicted_rebuild_value'] = model.predict(X).astype(int)
        
        results = []
        for _, row in df.iterrows():
            cost_per_sqft = float(row['construction_cost_per_sqft'] or 175.0)
            total_build_cost = row['sqft'] * cost_per_sqft
            opp = row['predicted_rebuild_value'] - (row['list_price'] + total_build_cost)
            results.append({
                "id": int(row['id']),
                "predicted_rebuild_value": int(row['predicted_rebuild_value']),
                "opportunity_result": int(opp)
            })

        db.write_opportunity_scores(results)
        db.complete_model_run(run_id, properties_scored=len(results))

    except Exception as e:
        logger.error(f"[FAIL] Scoring failed: {str(e)}")
        db.fail_model_run(run_id, str(e))

def score_properties_weighted(weights: dict):
    run_id = db.start_model_run("score_weighted")
    pd.set_option('future.no_silent_downcasting', True)

    try:
        sold_data = db.fetch_sold_for_training()
        if not sold_data:
            db.fail_model_run(run_id, "No sold data for reference")
            return
        sold_df = pd.DataFrame(sold_data)
        if not sold_df.empty:
            sold_df['lat'] = pd.to_numeric(sold_df['lat'], errors='coerce')
            sold_df['lng'] = pd.to_numeric(sold_df['lng'], errors='coerce')
        
        new_builds_ref = sold_df[sold_df['year_built'] >= 2015]
        
        # Calculate geospatial feature for normalization range
        sold_df['avg_new_build_price_sqft_05mi'] = calculate_geospatial_features(sold_df, new_builds_ref)
        
        zip_values = sold_df.groupby('zip')['sold_price'].mean().to_dict()
        global_mean_sold = sold_df['sold_price'].mean() or 0.0

        ranges = {}
        for col in ['sqft', 'lot_sqft', 'year_built', 'median_household_income', 'avg_new_build_price_sqft_05mi']:
            c_min, c_max = sold_df[col].min(), sold_df[col].max()
            ranges[col] = {"min": float(c_min) if pd.notna(c_min) else 0.0, "max": float(c_max) if pd.notna(c_max) else 1.0}
        
        zip_sold_prices = [v for v in zip_values.values() if pd.notna(v)]
        ranges['zip'] = {"min": float(min(zip_sold_prices) if zip_sold_prices else 0), "max": float(max(zip_sold_prices) if zip_sold_prices else 1)}

        candidates = db.fetch_for_sale_for_scoring()
        if not candidates:
            db.complete_model_run(run_id, properties_scored=0)
            return
        df = pd.DataFrame(candidates)
        if not df.empty:
            df['lat'] = pd.to_numeric(df['lat'], errors='coerce')
            df['lng'] = pd.to_numeric(df['lng'], errors='coerce')
        
        df['avg_new_build_price_sqft_05mi'] = calculate_geospatial_features(df, new_builds_ref)
        
        norm_df = pd.DataFrame(index=df.index)
        for col in ['sqft', 'lot_sqft', 'year_built', 'median_household_income', 'avg_new_build_price_sqft_05mi']:
            r_min, r_max = ranges[col]['min'], ranges[col]['max']
            span = max(1.0, r_max - r_min)
            norm_df[col] = (df[col].fillna(r_min) - r_min) / span
        
        zip_price_series = df['zip'].map(zip_values).fillna(global_mean_sold)
        rz_min, rz_max = ranges['zip']['min'], ranges['zip']['max']
        rz_span = max(1.0, rz_max - rz_min)
        norm_df['zip'] = (zip_price_series - rz_min) / rz_span

        df['weighted_score'] = 0.0
        for feat, weight in weights.items():
            if feat in norm_df.columns:
                df['weighted_score'] += norm_df[feat].fillna(0.0) * float(weight)

        p10, p90 = sold_df['sold_price'].quantile(0.1), sold_df['sold_price'].quantile(0.9)
        if pd.isna(p10): p10 = global_mean_sold * 0.5
        if pd.isna(p90): p90 = global_mean_sold * 1.5
        price_range = max(100000.0, p90 - p10)
        
        df['predicted_rebuild_value'] = (p10 + df['weighted_score'] * price_range).fillna(p10).astype(int)

        results = []
        for _, row in df.iterrows():
            cost_sqft, sqft, acq = float(row['construction_cost_per_sqft'] or 175.0), float(row['sqft'] or 0.0), float(row['list_price'] or 0.0)
            opp = float(row['predicted_rebuild_value']) - (acq + (sqft * cost_sqft))
            results.append({"id": int(row['id']), "predicted_rebuild_value": int(row['predicted_rebuild_value']), "opportunity_result": int(opp) if np.isfinite(opp) else 0})

        db.write_opportunity_scores(results)
        db.complete_model_run(run_id, properties_scored=len(results), training_context=json.dumps({"weights": weights}))

    except Exception as e:
        logger.error(f"[FAIL] Weighted scoring failed: {str(e)}")
        db.fail_model_run(run_id, str(e))

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--train", action="store_true")
    parser.add_argument("--score", action="store_true")
    parser.add_argument("--score-weighted", action="store_true")
    parser.add_argument("--weights", type=str)
    parser.add_argument("--n-estimators", type=int, default=1000)
    parser.add_argument("--max-depth", type=int, default=6)
    parser.add_argument("--lr", type=float, default=0.05)
    parser.add_argument("--min-year-built", type=int, default=2015)
    parser.add_argument("--test-split", type=float, default=0.2)
    args = parser.parse_args()

    if args.train:
        train_model(n_estimators=args.n_estimators, max_depth=args.max_depth, learning_rate=args.lr, min_year_built=args.min_year_built, test_split=args.test_split)
    if args.score:
        score_properties()
    if args.score_weighted:
        weights = json.loads(args.weights) if args.weights else {"sqft": 0.45, "zip": 0.45, "lot_sqft": 0.06, "year_built": 0.04, "median_household_income": 0.0}
        score_properties_weighted(weights)
