const express = require("express");
const router = express.Router();

const WORKER_URL = process.env.WORKER_URL || "http://data-worker:5000";

/**
 * GET /api/ml/status
 * Returns ML pipeline status from the DB (model_runs + property counts).
 */
router.get("/status", async (req, res) => {
  const db = req.app.locals.db;
  try {
    const { rows: runRows } = await db.query(`
      SELECT DISTINCT ON (run_type)
        run_type, status, started_at, completed_at,
        properties_trained, properties_scored, r2_score, error_message
      FROM model_runs
      ORDER BY run_type, started_at DESC
    `);

    const runs = {};
    for (const row of runRows) runs[row.run_type] = row;

    const { rows: countRows } = await db.query(`
      SELECT listing_type, COUNT(*) as total, COUNT(opportunity_result) as scored
      FROM properties
      GROUP BY listing_type
    `);

    const counts = {};
    for (const row of countRows) {
      counts[row.listing_type] = {
        total: parseInt(row.total),
        scored: parseInt(row.scored),
        unscored: parseInt(row.total) - parseInt(row.scored),
      };
    }

    res.json({ train: runs["train"] || null, score: runs["score"] || null, counts });
  } catch (err) {
    console.error("[ml/status] Error:", err.message);
    res.status(500).json({ error: "Failed to fetch ML status" });
  }
});

/**
 * POST /api/ml/train
 * Proxies to data-worker to actually run ml_model.py --train
 */
router.post("/train", async (req, res) => {
  try {
    const workerRes = await fetch(`${WORKER_URL}/run/train`, { method: "POST" });
    const data = await workerRes.json();
    res.status(workerRes.status).json(data);
  } catch (err) {
    console.error("[ml/train] Worker unreachable:", err.message);
    res.status(503).json({ error: "data-worker unavailable", detail: err.message });
  }
});

/**
 * POST /api/ml/score
 * Proxies to data-worker to actually run ml_model.py --score
 */
router.post("/score", async (req, res) => {
  try {
    const workerRes = await fetch(`${WORKER_URL}/run/score`, { method: "POST" });
    const data = await workerRes.json();
    res.status(workerRes.status).json(data);
  } catch (err) {
    console.error("[ml/score] Worker unreachable:", err.message);
    res.status(503).json({ error: "data-worker unavailable", detail: err.message });
  }
});

/**
 * POST /api/ml/census
 * Proxies to data-worker to run census_fetcher.py --all
 */
router.post("/census", async (req, res) => {
  try {
    const workerRes = await fetch(`${WORKER_URL}/run/census`, { method: "POST" });
    const data = await workerRes.json();
    res.status(workerRes.status).json(data);
  } catch (err) {
    console.error("[ml/census] Worker unreachable:", err.message);
    res.status(503).json({ error: "data-worker unavailable", detail: err.message });
  }
});

module.exports = router;
