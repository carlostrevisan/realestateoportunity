const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/auth");

const WORKER_URL = process.env.WORKER_URL || "http://data-worker:5000";

/**
 * GET /api/jobs
 * Returns list of recent jobs from the data-worker runner.
 */
router.get("/", async (req, res) => {
  try {
    const workerRes = await fetch(`${WORKER_URL}/jobs`);
    const data = await workerRes.json();
    res.json(data);
  } catch (err) {
    res.status(503).json({ error: "data-worker unavailable" });
  }
});

/**
 * GET /api/jobs/:id
 * Returns a specific job with full log output.
 */
router.get("/:id", async (req, res) => {
  try {
    const workerRes = await fetch(`${WORKER_URL}/jobs/${req.params.id}`);
    const data = await workerRes.json();
    res.status(workerRes.status).json(data);
  } catch (err) {
    res.status(503).json({ error: "data-worker unavailable" });
  }
});

/**
 * POST /api/jobs/:id/stop
 * Signals the worker to terminate a running job.
 */
router.post("/:id/stop", requireAuth, async (req, res) => {
  try {
    const workerRes = await fetch(`${WORKER_URL}/jobs/${req.params.id}/stop`, {
      method: "POST"
    });
    const data = await workerRes.json();
    res.status(workerRes.status).json(data);
  } catch (err) {
    res.status(503).json({ error: "data-worker unavailable" });
  }
});

module.exports = router;
