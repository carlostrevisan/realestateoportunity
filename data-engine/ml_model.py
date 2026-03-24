"""
ml_model.py — XGBoost training and scoring logic + Weighted Scoring + Geospatial Features.
"""

import argparse
import gc
import json
import joblib
import logging
import os
import traceback
import time
from datetime import datetime

import pandas as pd
import numpy as np
import xgboost as xgb
from sklearn.model_selection import train_test_split
from sklearn.metrics import r2_score

import db

# Updated feature set
FEATURE_COLS = ['sqft', 'lot_sqft', 'year_built', 'median_household_income', 'zip', 'avg_new_build_price_sqft_05mi']

# Module-level constants — replace magic numbers throughout
NEARBY_RADIUS_MILES       = 0.5
BBOX_MARGIN_DEGREES       = 0.015
CONSTRUCTION_COST_DEFAULT = 175.0
MIN_YEAR_BUILT_DEFAULT    = 2015

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

def _coerce_coordinates(df: pd.DataFrame) -> None:
    """Coerce lat/lng columns from Decimal (DB) to float64 in-place.

    No-ops on an empty DataFrame. Unparseable values become NaN, which
    callers already handle via has_coords / notna() checks.
    """
    if not df.empty:
        df['lat'] = pd.to_numeric(df['lat'], errors='coerce')
        df['lng'] = pd.to_numeric(df['lng'], errors='coerce')

def _save_model(model, algorithm: str, run_id: int, timestamp: str) -> str:
    """Persist a trained model to disk; return the file path.

    Uses XGBoost's native JSON format for xgboost models;
    falls back to joblib pickle for sklearn-compatible estimators.
    """
    os.makedirs("models", exist_ok=True)
    if algorithm == "xgboost":
        path = f"models/rebuild_{run_id}_{timestamp}.json"
        model.save_model(path)
    else:
        path = f"models/rebuild_{run_id}_{timestamp}.pkl"
        joblib.dump(model, path)
    return path

def _load_model(algorithm: str, model_path: str):
    """Load a trained model from disk; return (model_object, feature_name_list).

    For XGBoost, feature names are read from the booster itself so that models
    saved without explicit metadata still work via FEATURE_COLS fallback.
    For sklearn-compatible models the feature list is always FEATURE_COLS.
    """
    if algorithm == "xgboost":
        model = xgb.XGBRegressor()
        model.load_model(model_path)
        try:
            feature_names = model.get_booster().feature_names
            logger.info(f"[LOAD] Model expects features: {feature_names}")
            if not feature_names:
                feature_names = FEATURE_COLS
        except Exception as fe:
            logger.warning(f"[SKIP] Could not read feature names ({fe}), falling back to FEATURE_COLS")
            feature_names = FEATURE_COLS
    else:
        model = joblib.load(model_path)
        feature_names = FEATURE_COLS
    return model, feature_names

def calculate_geospatial_features(df, reference_df, batch_size=50):
    """
    For each row in df, find new builds in reference_df within NEARBY_RADIUS_MILES miles
    and calculate their average sold price per sqft.
    Processes in batches with a bounding-box pre-filter to keep RAM low.
    """
    logger.info(f"[EXEC] Calculating {NEARBY_RADIUS_MILES}-mile radius features for {len(df)} properties (batch_size={batch_size})...")

    ref = reference_df.copy()
    if ref.empty:
        logger.warning("[SKIP] No valid reference data for geospatial features. Using 0.")
        return np.zeros(len(df))

    ref['price_sqft'] = ref['sold_price'] / ref['sqft']
    ref = ref[ref['price_sqft'].notna() & np.isfinite(ref['price_sqft'])]

    if ref.empty:
        logger.warning("[SKIP] No valid reference data for geospatial features (post-filter). Using 0.")
        return np.zeros(len(df))

    ref_lats   = ref['lat'].astype(float).values
    ref_lngs   = ref['lng'].astype(float).values
    ref_prices = ref['price_sqft'].values
    ref_ids    = ref['id'].values
    ref_zips   = ref['zip'].astype(str).values

    df_lats = df['lat'].astype(float).values
    df_lngs = df['lng'].astype(float).values
    df_ids  = df['id'].values
    df_zips = df['zip'].astype(str).values
    has_coords = ~(np.isnan(df_lats) | np.isnan(df_lngs))

    global_avg   = float(ref_prices.mean())
    zip_avgs     = {z: float(ref_prices[ref_zips == z].mean()) for z in np.unique(ref_zips)}
    zip_fallback = np.array([zip_avgs.get(z, global_avg) for z in df_zips])

    # NEARBY_RADIUS_MILES ≈ 0.0072° lat at Florida latitudes — BBOX_MARGIN_DEGREES gives buffer

    result = np.where(has_coords, zip_fallback, 0.0)  # default to zip avg

    for start in range(0, len(df), batch_size):
        end = min(start + batch_size, len(df))
        b_lats = df_lats[start:end]
        b_lngs = df_lngs[start:end]
        b_ids  = df_ids[start:end]
        b_has  = has_coords[start:end]

        if not b_has.any():
            continue

        # Bounding-box pre-filter — shrinks ref dramatically before haversine
        lat_min = np.nanmin(b_lats[b_has]) - BBOX_MARGIN_DEGREES
        lat_max = np.nanmax(b_lats[b_has]) + BBOX_MARGIN_DEGREES
        lng_min = np.nanmin(b_lngs[b_has]) - BBOX_MARGIN_DEGREES
        lng_max = np.nanmax(b_lngs[b_has]) + BBOX_MARGIN_DEGREES
        bbox_mask = (
            (ref_lats >= lat_min) & (ref_lats <= lat_max) &
            (ref_lngs >= lng_min) & (ref_lngs <= lng_max)
        )
        r_lats   = ref_lats[bbox_mask]
        r_lngs   = ref_lngs[bbox_mask]
        r_prices = ref_prices[bbox_mask]
        r_ids    = ref_ids[bbox_mask]

        if len(r_lats) == 0:
            continue  # keep zip fallback for this batch

        safe_lats = np.where(b_has, b_lats, 0.0)[:, None]
        safe_lngs = np.where(b_has, b_lngs, 0.0)[:, None]
        dist = haversine_distance(safe_lats, safe_lngs, r_lats[None, :], r_lngs[None, :])

        nearby = (dist <= NEARBY_RADIUS_MILES) & (b_ids[:, None] != r_ids[None, :])
        nearby[~b_has] = False

        counts    = nearby.sum(axis=1)
        price_sum = (r_prices[None, :] * nearby).sum(axis=1)
        has_nearby = counts > 0

        result[start:end] = np.where(
            has_nearby,
            price_sum / np.where(has_nearby, counts, 1),
            result[start:end],  # keep zip fallback if no nearby
        )

    return result

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

def train_model(n_estimators=300, max_depth=4, learning_rate=0.05, min_year_built=2015, test_split=0.2, algorithm="xgboost", alpha=1.0):
    run_id = db.start_model_run("train")
    logger.info("[EXEC] Starting model training...")

    try:
        data = db.fetch_sold_for_training()
        df = pd.DataFrame(data)
        del data; gc.collect()  # free raw list — DataFrame is all we need
        logger.info(f"[LOAD] Sold data: {len(df)} rows  RAM: {df.memory_usage(deep=True).sum() // 1024} KB")

        # Ensure coordinates are floats (DB returns Decimals which break NumPy)
        _coerce_coordinates(df)

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
        t0 = time.time()
        train_df['avg_new_build_price_sqft_05mi'] = calculate_geospatial_features(train_df, train_df)
        logger.info(f"[LOAD] Geospatial features done in {time.time() - t0:.1f}s")

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
        logger.info(f"[LOAD] Train/test split: {len(X_train)} train rows, {len(X_test)} test rows")

        # 5. Train
        if algorithm == "xgboost":
            model = xgb.XGBRegressor(
                objective='reg:squarederror',
                n_estimators=n_estimators,
                learning_rate=learning_rate,
                max_depth=max_depth,
                subsample=0.8,
                colsample_bytree=0.8,
                random_state=42,
                nthread=1,
            )
        elif algorithm == "random_forest":
            from sklearn.ensemble import RandomForestRegressor
            model = RandomForestRegressor(n_estimators=n_estimators, max_depth=max_depth, random_state=42, n_jobs=1)
        elif algorithm == "ridge":
            from sklearn.linear_model import Ridge
            model = Ridge(alpha=alpha)
        elif algorithm == "lightgbm":
            import lightgbm as lgb
            model = lgb.LGBMRegressor(n_estimators=n_estimators, max_depth=max_depth, learning_rate=learning_rate, random_state=42, verbose=-1, n_jobs=1)
        else:
            logger.error(f"[FAIL] Unknown algorithm: {algorithm}")
            db.fail_model_run(run_id, f"Unknown algorithm: {algorithm}")
            return

        logger.info(f"[EXEC] Training {algorithm} ({n_estimators} estimators, depth {max_depth})...")
        t0 = time.time()
        model.fit(X_train, y_train)
        logger.info(f"[LOAD] Training done in {time.time() - t0:.1f}s")

        if algorithm == "ridge":
            coef = np.abs(model.coef_)
            raw_imp = coef / (coef.sum() or 1.0)
        else:
            raw_imp = model.feature_importances_
        feature_importances = {feat: round(float(imp), 4) for feat, imp in zip(FEATURE_COLS, raw_imp)}

        preds = model.predict(X_test)
        r2 = r2_score(y_test, preds)

        # Save model
        timestamp  = datetime.now().strftime("%Y%m%d_%H%M%S")
        model_path = _save_model(model, algorithm, run_id, timestamp)

        context = {
            "algorithm": algorithm,
            "zip_codes": sorted(df['zip'].dropna().unique().tolist()),
            "year_built_min": min_year_built,
            "feature_importances": feature_importances,
            "zip_map": zip_map,
            "n_estimators": n_estimators,
            "max_depth": max_depth,
            "learning_rate": learning_rate,
            "alpha": alpha,
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
        logger.info("[EXEC] Score job started")

        active = db.get_active_model()
        if not active:
            logger.error("[FAIL] No active model found in DB")
            db.fail_model_run(run_id, "No active model found")
            return

        logger.info(f"[LOAD] Active model: id={active.get('id')} path={active.get('model_path')}")

        context = active.get("training_context")
        if context is None:
            logger.error("[FAIL] Active model has no training_context — run the UPDATE fix first")
            db.fail_model_run(run_id, "training_context is NULL on active model")
            return
        if isinstance(context, str):
            context = json.loads(context)
        logger.info(f"[LOAD] training_context keys: {list(context.keys())}")

        zip_map = context.get("zip_map", {})
        year_built_min = context.get("year_built_min", 2015)
        algorithm = context.get("algorithm", "xgboost")
        logger.info(f"[LOAD] algorithm={algorithm}  year_built_min={year_built_min}  zip_map entries={len(zip_map)}")

        # Load reference data for geospatial features
        logger.info("[EXEC] Fetching sold data for geospatial reference...")
        sold_data = db.fetch_sold_for_training()
        logger.info(f"[LOAD] Sold rows fetched: {len(sold_data)}")
        sold_df = pd.DataFrame(sold_data)
        del sold_data; gc.collect()
        _coerce_coordinates(sold_df)
        logger.info(f"[LOAD] Sold DataFrame RAM: {sold_df.memory_usage(deep=True).sum() // 1024} KB")

        new_builds_ref = sold_df[sold_df['year_built'] >= year_built_min]
        logger.info(f"[LOAD] New-build reference rows (yr >= {year_built_min}): {len(new_builds_ref)}")

        logger.info("[EXEC] Fetching for-sale candidates for scoring...")
        candidates = db.fetch_for_sale_for_scoring()
        if not candidates:
            logger.info("[LOAD] No for-sale candidates found — nothing to score")
            db.complete_model_run(run_id, properties_scored=0)
            return
        logger.info(f"[LOAD] Candidates to score: {len(candidates)}")

        df = pd.DataFrame(candidates)
        del candidates; gc.collect()
        _coerce_coordinates(df)
        logger.info(f"[LOAD] Candidates DataFrame RAM: {df.memory_usage(deep=True).sum() // 1024} KB")

        # Geospatial feature
        logger.info("[EXEC] Computing 0.5-mile geospatial features...")
        t0 = time.time()
        df['avg_new_build_price_sqft_05mi'] = calculate_geospatial_features(df, new_builds_ref)
        logger.info(f"[LOAD] Geo features done in {time.time() - t0:.1f}s — non-null: {df['avg_new_build_price_sqft_05mi'].notna().sum()}/{len(df)}")
        del sold_df; gc.collect()

        # Load model
        logger.info(f"[EXEC] Loading {algorithm} model from {active['model_path']}...")
        model, feature_names = _load_model(algorithm, active["model_path"])
        X = df[feature_names].copy()
        logger.info(f"[LOAD] Feature matrix shape: {X.shape}  columns: {list(X.columns)}")

        # Encode / coerce
        for col in X.columns:
            if col == 'zip':
                before = X['zip'].nunique()
                X['zip'] = X['zip'].map(zip_map).fillna(-1)
                logger.info(f"[EXEC] ZIP encoded: {before} unique zips, {(X['zip'] == -1).sum()} unmapped (set to -1)")
            else:
                X[col] = pd.to_numeric(X[col], errors='coerce').fillna(0)

        null_counts = X.isnull().sum()
        if null_counts.any():
            logger.warning(f"[SKIP] Nulls remaining in feature matrix after coercion: {null_counts[null_counts > 0].to_dict()}")

        # Predict
        logger.info(f"[EXEC] Running model.predict on {len(X)} rows...")
        df['predicted_rebuild_value'] = model.predict(X).astype(int)
        logger.info(f"[LOAD] Predictions done — min={df['predicted_rebuild_value'].min()}  max={df['predicted_rebuild_value'].max()}  mean={df['predicted_rebuild_value'].mean():.0f}")

        # Score
        cost_per_sqft = df['construction_cost_per_sqft'].fillna(CONSTRUCTION_COST_DEFAULT).astype(float)
        opp = df['predicted_rebuild_value'] - (df['list_price'] + df['sqft'] * cost_per_sqft)
        positive = (opp > 0).sum()
        logger.info(f"[EXEC] Opportunity scores computed — positive: {positive}/{len(df)}")

        results = (
            df[['id', 'predicted_rebuild_value']]
            .assign(opportunity_result=opp.astype(int))
            .astype({'id': int, 'predicted_rebuild_value': int, 'opportunity_result': int})
            .to_dict('records')
        )

        logger.info(f"[EXEC] Writing {len(results)} scores to DB...")
        db.write_opportunity_scores(results)
        db.complete_model_run(run_id, properties_scored=len(results))
        logger.info(f"[LOAD] Scoring complete — {len(results)} properties scored")

    except Exception as e:
        logger.error(f"[FAIL] Scoring failed: {str(e)}")
        logger.error(f"[FAIL] Traceback:\n{traceback.format_exc()}")
        db.fail_model_run(run_id, str(e))

def score_properties_weighted(weights: dict):
    run_id = db.start_model_run("score_weighted")
    try:
        sold_data = db.fetch_sold_for_training()
        if not sold_data:
            db.fail_model_run(run_id, "No sold data for reference")
            return
        sold_df = pd.DataFrame(sold_data)
        _coerce_coordinates(sold_df)

        new_builds_ref = sold_df[sold_df['year_built'] >= MIN_YEAR_BUILT_DEFAULT]

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
        _coerce_coordinates(df)

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

        cost_sqft = df['construction_cost_per_sqft'].fillna(CONSTRUCTION_COST_DEFAULT).astype(float)
        sqft_col  = df['sqft'].fillna(0.0).astype(float)
        acq_col   = df['list_price'].fillna(0.0).astype(float)
        opp       = df['predicted_rebuild_value'].astype(float) - (acq_col + sqft_col * cost_sqft)
        opp_int   = np.where(np.isfinite(opp), opp.astype(int), 0)
        results = (
            df[['id', 'predicted_rebuild_value']]
            .assign(opportunity_result=opp_int)
            .astype({'id': int, 'predicted_rebuild_value': int, 'opportunity_result': int})
            .to_dict('records')
        )

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
    parser.add_argument("--algorithm", type=str, default="xgboost")
    parser.add_argument("--n-estimators", type=int, default=1000)
    parser.add_argument("--max-depth", type=int, default=6)
    parser.add_argument("--lr", type=float, default=0.05)
    parser.add_argument("--alpha", type=float, default=1.0)
    parser.add_argument("--min-year-built", type=int, default=2015)
    parser.add_argument("--test-split", type=float, default=0.2)
    args = parser.parse_args()

    if args.train:
        train_model(
            n_estimators=args.n_estimators,
            max_depth=args.max_depth,
            learning_rate=args.lr,
            min_year_built=args.min_year_built,
            test_split=args.test_split,
            algorithm=args.algorithm,
            alpha=args.alpha,
        )
    if args.score:
        score_properties()
    if args.score_weighted:
        weights = json.loads(args.weights) if args.weights else {"sqft": 0.45, "zip": 0.45, "lot_sqft": 0.06, "year_built": 0.04, "median_household_income": 0.0}
        score_properties_weighted(weights)
