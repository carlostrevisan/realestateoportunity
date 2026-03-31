const router = require("express").Router();
const { requireAuth } = require("../middleware/auth");

const WORKER_URL = process.env.WORKER_URL || "http://data-worker:5000";

/**
 * POST /api/schools/fetch
 * Triggers the school_fetcher.py job on the data-worker.
 */
router.post("/fetch", requireAuth, async (req, res) => {
  try {
    const workerRes = await fetch(`${WORKER_URL}/run/schools`, { method: "POST" });
    const data = await workerRes.json();
    res.status(workerRes.status).json(data);
  } catch (err) {
    console.error("[schools] Worker unreachable:", err.message);
    res.status(503).json({ error: "data-worker unavailable" });
  }
});

module.exports = router;
