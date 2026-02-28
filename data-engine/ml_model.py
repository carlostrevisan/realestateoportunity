"""
ml_model.py — XGBoost opportunity predictor.

Data flow:
  TRAIN  — learns from sold new-build data (year_built > 2015)
           what a newly-built home sells for in each ZIP
  SCORE  — applies that model to active for-sale listings
           to estimate their rebuild value and opportunity profit

Formula:
    opportunity_result = predicted_rebuild_value - (acquisition_cost + construction_cost)
    acquisition_cost  = list_price  (for for_sale listings)
    construction_cost = sqft × construction_cost_per_sqft  ($175 default)

Usage:
    python ml_model.py --train    # Train on sold data and score all for_sale properties
    python ml_model.py --score    # Score for_sale properties with existing model
"""

import argparse
import logging
import os
import pickle

import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from xgboost import XGBRegressor

import db

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

MODEL_DIR = os.path.join(os.path.dirname(__file__), "models")
MODEL_PATH = os.path.join(MODEL_DIR, "xgb_rebuild_value.pkl")
ENCODER_PATH = os.path.join(MODEL_DIR, "zip_encoder.pkl")

DEFAULT_CONSTRUCTION_COST_PER_SQFT = 175.0
NEW_BUILD_YEAR_THRESHOLD = 2015


def train():
    """
    Train XGBoost on sold new-build data, then score all for_sale properties.
    Records the run in model_runs table.
    """
    os.makedirs(MODEL_DIR, exist_ok=True)
    run_id = db.start_model_run("train")

    try:
        logger.info("[ml/train] Fetching sold properties for training...")
        sold_records = db.fetch_sold_for_training()

        if not sold_records:
            msg = "No sold properties in database. Run: python scraper.py --market tampa --type sold --start 2022-01 --end 2024-12"
            logger.error(f"[ml/train] {msg}")
            db.fail_model_run(run_id, msg)
            return

        df = pd.DataFrame(sold_records)
        logger.info(f"[ml/train] Loaded {len(df)} sold properties")

        # Training set: new builds where we know the sold price
        # These proxy for "what a new build on this lot would sell for"
        train_df = df[
            df["year_built"].notna() &
            (df["year_built"] > NEW_BUILD_YEAR_THRESHOLD)
        ].copy()

        if len(train_df) < 10:
            msg = f"Not enough new-build training data ({len(train_df)} records, need ≥10 with year_built > {NEW_BUILD_YEAR_THRESHOLD})"
            logger.error(f"[ml/train] {msg}")
            db.fail_model_run(run_id, msg)
            return

        logger.info(f"[ml/train] Training on {len(train_df)} new-build records (year_built > {NEW_BUILD_YEAR_THRESHOLD})")

        # Encode ZIPs
        le = LabelEncoder()
        all_zips = df["zip"].fillna("00000").astype(str)
        le.fit(all_zips)
        train_df["zip_encoded"] = le.transform(train_df["zip"].fillna("00000").astype(str))

        features = ["sqft", "lot_sqft", "year_built", "median_household_income", "zip_encoded"]
        target = "sold_price"

        for col in features:
            if col in train_df.columns:
                train_df[col] = pd.to_numeric(train_df[col], errors="coerce")
                train_df[col] = train_df[col].fillna(train_df[col].median())
            else:
                train_df[col] = 0

        X = train_df[features].values
        y = train_df[target].values

        X_train, X_val, y_train, y_val = train_test_split(X, y, test_size=0.2, random_state=42)

        model = XGBRegressor(
            n_estimators=200,
            max_depth=5,
            learning_rate=0.05,
            subsample=0.8,
            colsample_bytree=0.8,
            random_state=42,
            verbosity=0,
        )
        model.fit(X_train, y_train)

        val_r2 = model.score(X_val, y_val)
        logger.info(f"[ml/train] Validation R² = {val_r2:.4f}")

        with open(MODEL_PATH, "wb") as f:
            pickle.dump(model, f)
        with open(ENCODER_PATH, "wb") as f:
            pickle.dump(le, f)
        logger.info(f"[ml/train] Model saved to {MODEL_PATH}")

        # Now score all for_sale properties
        scored = _score_for_sale(model, le)

        db.complete_model_run(
            run_id,
            properties_trained=len(train_df),
            properties_scored=scored,
            r2_score=round(val_r2, 4),
        )

    except Exception as e:
        logger.exception("[ml/train] Unexpected error")
        db.fail_model_run(run_id, str(e))
        raise


def score():
    """Load existing model and score all for_sale properties."""
    if not os.path.exists(MODEL_PATH):
        logger.error(f"[ml/score] No trained model at {MODEL_PATH}. Run with --train first.")
        return

    run_id = db.start_model_run("score")
    try:
        with open(MODEL_PATH, "rb") as f:
            model = pickle.load(f)
        with open(ENCODER_PATH, "rb") as f:
            le = pickle.load(f)

        scored = _score_for_sale(model, le)
        db.complete_model_run(run_id, properties_scored=scored)

    except Exception as e:
        logger.exception("[ml/score] Unexpected error")
        db.fail_model_run(run_id, str(e))
        raise


def _score_for_sale(model: XGBRegressor, le: LabelEncoder) -> int:
    """
    Predict rebuild value and compute opportunity_result for all for_sale properties.
    Uses list_price as acquisition cost (no sold_price for active listings).

    Returns: number of properties scored
    """
    logger.info("[ml/score] Fetching for_sale properties...")
    records = db.fetch_for_sale_for_scoring()

    if not records:
        logger.warning("[ml/score] No for_sale properties to score. Run the for_sale scraper first.")
        return 0

    df = pd.DataFrame(records)
    logger.info(f"[ml/score] Scoring {len(df)} for_sale properties")

    # Encode ZIPs
    known_classes = set(le.classes_)
    df["zip_encoded"] = df["zip"].fillna("00000").astype(str).apply(
        lambda z: le.transform([z])[0] if z in known_classes else -1
    )

    features = ["sqft", "lot_sqft", "year_built", "median_household_income", "zip_encoded"]
    for col in features:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)
        else:
            df[col] = 0

    X = df[features].values
    predicted_rebuild_values = model.predict(X)

    scores = []
    for i, row in df.iterrows():
        # For active listings: acquisition cost = list_price (what you'd pay to buy it)
        acquisition_cost = float(row.get("list_price") or 0)
        cost_per_sqft = float(row.get("construction_cost_per_sqft") or DEFAULT_CONSTRUCTION_COST_PER_SQFT)
        sqft = float(row.get("sqft") or 0)
        construction_cost = sqft * cost_per_sqft

        predicted_value = int(predicted_rebuild_values[i])
        opportunity = int(predicted_value - acquisition_cost - construction_cost)

        scores.append({
            "id": row["id"],
            "predicted_rebuild_value": predicted_value,
            "opportunity_result": opportunity,
        })

    db.write_opportunity_scores(scores)

    profitable = sum(1 for s in scores if s["opportunity_result"] > 0)
    logger.info(f"[ml/score] Done — {len(scores)} scored, {profitable} profitable opportunities")
    return len(scores)


def main():
    parser = argparse.ArgumentParser(
        description="Train XGBoost on sold data, score for_sale listings"
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument(
        "--train",
        action="store_true",
        help="Train model on sold new-build data, then score all for_sale listings",
    )
    group.add_argument(
        "--score",
        action="store_true",
        help="Score all for_sale listings using existing trained model",
    )

    args = parser.parse_args()

    if args.train:
        train()
    elif args.score:
        score()


if __name__ == "__main__":
    main()
