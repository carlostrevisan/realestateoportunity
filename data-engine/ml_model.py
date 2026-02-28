"""
ml_model.py — XGBoost training and scoring logic.
"""

import argparse
import json
import logging
import os
from datetime import datetime

import pandas as pd
import xgboost as xgb
from sklearn.model_selection import train_test_split
from sklearn.metrics import r2_score

import db

FEATURE_COLS = ['sqft', 'lot_sqft', 'year_built', 'median_household_income', 'zip']

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

def train_model(n_estimators=1000, max_depth=6, learning_rate=0.05, min_year_built=2015, test_split=0.2):
    run_id = db.start_model_run("train")
    logger.info("[EXEC] Starting model training...")
    logger.info(f"[DATA] Hyperparams: estimators={n_estimators} depth={max_depth} lr={learning_rate} min_year={min_year_built} test_split={test_split}")

    try:
        data = db.fetch_sold_for_training()
        if not data or len(data) < 10:
            msg = "Not enough data — minimum 10 records required"
            logger.warning(f"[SKIP] {msg}")
            db.fail_model_run(run_id, msg)
            return

        df = pd.DataFrame(data)
        # Training on new builds to predict rebuild value
        train_df = df[df['year_built'] >= min_year_built].copy()

        if train_df.empty:
            msg = f"No new builds (post-{min_year_built}) found in dataset"
            logger.warning(f"[SKIP] {msg}")
            db.fail_model_run(run_id, msg)
            return

        # Rough ETA: XGBoost with 1000 estimators scales ~linearly; ~0.02s per row
        est_seconds = max(10, len(train_df) * 0.02)
        if est_seconds < 60:
            eta_str = f"~{int(est_seconds)}s"
        else:
            eta_str = f"~{int(est_seconds / 60)} min"
        logger.info(f"[DATA] Training on {len(train_df)} properties — est. {eta_str}")

        # Label encode ZIP codes
        unique_zips = sorted(train_df['zip'].dropna().unique().tolist())
        zip_map = {z: i for i, z in enumerate(unique_zips)}

        # Features: SQFT, Lot SQFT, Year Built, Median Income, ZIP
        X = train_df[FEATURE_COLS].copy()
        for col in ['sqft', 'lot_sqft', 'year_built', 'median_household_income']:
            X[col] = X[col].fillna(0)
        X['zip'] = X['zip'].map(zip_map).fillna(-1)

        y = train_df['sold_price']

        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=test_split, random_state=42)

        model = xgb.XGBRegressor(
            objective='reg:squarederror',
            n_estimators=n_estimators,
            learning_rate=learning_rate,
            max_depth=max_depth,
            random_state=42
        )

        model.fit(X_train, y_train)

        raw_imp = model.feature_importances_
        feature_importances = {feat: round(float(imp), 4) for feat, imp in zip(FEATURE_COLS, raw_imp)}

        preds = model.predict(X_test)
        r2 = r2_score(y_test, preds)

        # Save to a unique versioned path — never overwrites a previous model
        if not os.path.exists("models"): os.makedirs("models")
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        model_path = f"models/rebuild_{run_id}_{timestamp}.json"
        model.save_model(model_path)

        # Extract training context from the full dataset for the model card
        zip_codes = sorted(df['zip'].dropna().unique().tolist()) if 'zip' in df.columns else []
        cities = sorted(df['city'].dropna().unique().tolist()) if 'city' in df.columns else []
        sold_date_from = str(df['sold_date'].min())[:7] if 'sold_date' in df.columns and df['sold_date'].notna().any() else None
        sold_date_to   = str(df['sold_date'].max())[:7] if 'sold_date' in df.columns and df['sold_date'].notna().any() else None
        context = {
            "zip_codes": zip_codes,
            "cities": cities,
            "sold_date_from": sold_date_from,
            "sold_date_to": sold_date_to,
            "year_built_min": min_year_built,
            "features": FEATURE_COLS,
            "n_estimators": n_estimators,
            "learning_rate": learning_rate,
            "max_depth": max_depth,
            "test_split": test_split,
            "train_rows": len(X_train),
            "test_rows": len(X_test),
            "feature_importances": feature_importances,
            "zip_map": zip_map,
        }

        db.complete_model_run(
            run_id,
            properties_trained=len(train_df),
            r2_score=r2,
            model_path=model_path,
            training_context=json.dumps(context),
        )
        db.set_active_model(run_id)
        logger.info(f"[LOAD] Model saved → {model_path} — R² = {r2:.4f}")
        logger.info(f"[DATA] Context: {len(zip_codes)} ZIP(s), {sold_date_from} – {sold_date_to}")
        logger.info("[EXEC] Training complete")

    except Exception as e:
        logger.error(f"[FAIL] Training failed: {str(e)}")
        db.fail_model_run(run_id, str(e))

def score_properties():
    run_id = db.start_model_run("score")
    logger.info("[EXEC] Starting opportunity scoring...")

    try:
        active = db.get_active_model()
        if not active or not active.get("model_path"):
            msg = "No active model — train a model first"
            logger.error(f"[FAIL] {msg}")
            db.fail_model_run(run_id, msg)
            return

        model_path = active["model_path"]
        if not os.path.exists(model_path):
            msg = f"Model file missing ({model_path}) — retrain to restore"
            logger.error(f"[FAIL] {msg}")
            db.fail_model_run(run_id, msg)
            return

        context_raw = active.get("training_context")
        if isinstance(context_raw, str):
            context = json.loads(context_raw)
        else:
            context = context_raw or {}
        zip_map = context.get("zip_map", {})

        logger.info(f"[DATA] Loading model: {model_path} (R²={active.get('r2_score', 'n/a')})")
        model = xgb.XGBRegressor()
        model.load_model(model_path)

        candidates = db.fetch_for_sale_for_scoring()
        if not candidates:
            logger.info("[SKIP] No unscored properties found")
            db.complete_model_run(run_id, properties_scored=0)
            return

        # Scoring is batch inference — fast, ~0.001s per row
        est_seconds = max(2, int(len(candidates) * 0.001))
        logger.info(f"[DATA] Found {len(candidates)} properties to score — est. ~{est_seconds}s")
        
        df = pd.DataFrame(candidates)
        X = df[FEATURE_COLS].copy()
        for col in ['sqft', 'lot_sqft', 'year_built', 'median_household_income']:
            X[col] = X[col].fillna(0)
        X['zip'] = X['zip'].map(zip_map).fillna(-1)
        
        # Predict rebuild value
        df['predicted_rebuild_value'] = model.predict(X).astype(int)
        
        # Calculate Opportunity: Predicted Value - (Acquisition + Construction)
        # Assuming construction cost is stored or defaulted in DB
        results = []
        for _, row in df.iterrows():
            # Opportunity = Vpre - (Acq + (sqft * cost_per_sqft))
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
        logger.info(f"[LOAD] Scored {len(results)} properties")
        logger.info("[EXEC] Scoring complete")

    except Exception as e:
        logger.error(f"[FAIL] Scoring failed: {str(e)}")
        db.fail_model_run(run_id, str(e))

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--train", action="store_true")
    parser.add_argument("--score", action="store_true")
    parser.add_argument("--n-estimators", type=int, default=1000)
    parser.add_argument("--max-depth", type=int, default=6)
    parser.add_argument("--lr", type=float, default=0.05)
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
        )
    if args.score:
        score_properties()
