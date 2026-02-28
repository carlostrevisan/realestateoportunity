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
    const workerRes = await fetch(`${WORKER_URL}/run/train`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });
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

/**
 * GET /api/ml/models
 * Returns all completed training runs with their model metadata, newest first.
 */
router.get("/models", async (req, res) => {
  const db = req.app.locals.db;
  try {
    const { rows } = await db.query(`
      SELECT id, status, started_at, completed_at,
             properties_trained, r2_score, error_message,
             model_path, training_context, is_active,
             name, description
      FROM model_runs
      WHERE run_type = 'train' AND status = 'completed'
      ORDER BY started_at DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error("[ml/models] Error:", err.message);
    res.status(500).json({ error: "Failed to fetch models" });
  }
});

/**
 * PATCH /api/ml/models/:id
 * Updates the name and/or description of a training run.
 */
router.patch("/models/:id", async (req, res) => {
  const db = req.app.locals.db;
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid model id" });
  const { name, description } = req.body;
  if (name === undefined && description === undefined) {
    return res.status(400).json({ error: "Provide name or description" });
  }
  try {
    const { rowCount } = await db.query(
      "UPDATE model_runs SET name=$1, description=$2 WHERE id=$3 AND run_type='train'",
      [name ?? null, description ?? null, id]
    );
    if (rowCount === 0) return res.status(404).json({ error: "Model not found" });
    res.json({ ok: true });
  } catch (err) {
    console.error("[ml/models/patch] Error:", err.message);
    res.status(500).json({ error: "Failed to update model" });
  }
});

/**
 * POST /api/ml/models/:id/activate
 * Sets the specified model as active for scoring (deactivates all others).
 */
router.post("/models/:id/activate", async (req, res) => {
  const db = req.app.locals.db;
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid model id" });
  try {
    await db.query("UPDATE model_runs SET is_active = FALSE WHERE run_type = 'train'");
    const { rowCount } = await db.query(
      "UPDATE model_runs SET is_active = TRUE WHERE id = $1 AND run_type = 'train' AND status = 'completed'",
      [id]
    );
    if (rowCount === 0) return res.status(404).json({ error: "Model not found" });
    res.json({ ok: true, active_id: id });
  } catch (err) {
    console.error("[ml/models/activate] Error:", err.message);
    res.status(500).json({ error: "Failed to activate model" });
  }
});

module.exports = router;
