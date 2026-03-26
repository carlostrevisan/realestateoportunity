const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/auth");

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

    res.json({ train: runs["train"] || null, score: runs["score"] || null, score_weighted: runs["score_weighted"] || null, counts });
  } catch (err) {
    console.error("[ml/status] Error:", err.message);
    res.status(500).json({ error: "Failed to fetch ML status" });
  }
});

/**
 * POST /api/ml/train
 * Proxies to data-worker to actually run ml_model.py --train
 */
router.post("/train", requireAuth, async (req, res) => {
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
router.post("/score", requireAuth, async (req, res) => {
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
 * POST /api/ml/score-weighted
 * Proxies to data-worker to run ml_model.py --score-weighted with weights
 */
router.post("/score-weighted", requireAuth, async (req, res) => {
  try {
    const workerRes = await fetch(`${WORKER_URL}/run/score-weighted`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });
    const data = await workerRes.json();
    res.status(workerRes.status).json(data);
  } catch (err) {
    console.error("[ml/score-weighted] Worker unreachable:", err.message);
    res.status(503).json({ error: "data-worker unavailable", detail: err.message });
  }
});

/**
 * POST /api/ml/census
 * Proxies to data-worker to run census_fetcher.py --all
 */
router.post("/census", requireAuth, async (req, res) => {
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
router.patch("/models/:id", requireAuth, async (req, res) => {
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
router.post("/models/:id/activate", requireAuth, async (req, res) => {
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

/**
 * DELETE /api/ml/models/:id
 * Deletes a model run and its associated file via data-worker.
 */
router.delete("/models/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid model id" });
  try {
    const workerRes = await fetch(`${WORKER_URL}/models/${id}`, { method: "DELETE" });
    const data = await workerRes.json();
    res.status(workerRes.status).json(data);
  } catch (err) {
    console.error("[ml/models/delete] Worker unreachable:", err.message);
    res.status(503).json({ error: "data-worker unavailable", detail: err.message });
  }
});

/**
 * GET /api/ml/results
 * Returns opportunity_result distribution across all scored properties.
 */
router.get("/results", async (req, res) => {
  const db = req.app.locals.db;
  try {
    const { rows: [r] } = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE opportunity_result < 0)                                       AS red_lt0,
        COUNT(*) FILTER (WHERE opportunity_result >= 0     AND opportunity_result < 50000)   AS yellow_0_50k,
        COUNT(*) FILTER (WHERE opportunity_result >= 50000 AND opportunity_result < 100000)  AS yellow_50_100k,
        COUNT(*) FILTER (WHERE opportunity_result >= 100000 AND opportunity_result < 200000) AS yellow_100_200k,
        COUNT(*) FILTER (WHERE opportunity_result >= 200000 AND opportunity_result < 500000) AS green_200_500k,
        COUNT(*) FILTER (WHERE opportunity_result >= 500000)                                 AS green_gt500k,
        COUNT(*)                                                                             AS total,
        COALESCE(AVG(opportunity_result)::integer, 0)                                        AS avg_opportunity
      FROM properties
      WHERE opportunity_result IS NOT NULL
    `);

    const red    = parseInt(r.red_lt0);
    const yellow = parseInt(r.yellow_0_50k) + parseInt(r.yellow_50_100k) + parseInt(r.yellow_100_200k);
    const green  = parseInt(r.green_200_500k) + parseInt(r.green_gt500k);
    const total  = parseInt(r.total);

    res.json({
      distribution: [
        { label: "<$0",       count: parseInt(r.red_lt0),          color: "red"    },
        { label: "$0–50k",    count: parseInt(r.yellow_0_50k),     color: "yellow" },
        { label: "$50–100k",  count: parseInt(r.yellow_50_100k),   color: "yellow" },
        { label: "$100–200k", count: parseInt(r.yellow_100_200k),  color: "yellow" },
        { label: "$200–500k", count: parseInt(r.green_200_500k),   color: "green"  },
        { label: ">$500k",    count: parseInt(r.green_gt500k),      color: "green"  },
      ],
      totals: { green, yellow, red, total },
      avg_opportunity: parseInt(r.avg_opportunity),
    });
  } catch (err) {
    console.error("[ml/results] Error:", err.message);
    res.status(500).json({ error: "Failed to fetch results" });
  }
});

/**
 * GET /api/ml/ops-log
 * Returns a unified, chronologically sorted log of all operations from the DB
 * (model_runs + scrape_log). Persistent across restarts — unlike in-memory job logs.
 */
router.get("/ops-log", async (req, res) => {
  const db = req.app.locals.db;
  try {
    const [{ rows: mlOps }, { rows: scrapeOps }] = await Promise.all([
      db.query(`
        SELECT id, run_type AS type, status, started_at, completed_at,
               properties_trained, properties_scored, r2_score,
               training_context->>'algorithm' AS algorithm,
               error_message, name
        FROM model_runs
        ORDER BY started_at DESC LIMIT 50
      `),
      db.query(`
        SELECT id, 'scrape' AS type, 'completed' AS status,
               created_at AS started_at, created_at AS completed_at,
               market, month, year, scrape_type
        FROM scrape_log
        ORDER BY created_at DESC LIMIT 50
      `),
    ]);

    const merged = [...mlOps, ...scrapeOps]
      .sort((a, b) => new Date(b.started_at) - new Date(a.started_at))
      .slice(0, 100);

    res.json(merged);
  } catch (err) {
    console.error("[ml/ops-log] Error:", err.message);
    res.status(500).json({ error: "Failed to fetch ops log" });
  }
});

module.exports = router;
