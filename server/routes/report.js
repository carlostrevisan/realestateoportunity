const express = require("express");
const { requireAuth } = require("../middleware/auth");
const router = express.Router();

const WORKER_URL = process.env.WORKER_URL || "http://data-worker:5000";

/**
 * POST /api/report
 * Starts a PDF report generation job and returns { job_id }.
 * Body: filter params - city, zip, min_roi, max_year_built, listing_type
 */
router.post("/", requireAuth, async (req, res) => {
  try {
    const workerRes = await fetch(`${WORKER_URL}/run/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filters: req.body }),
    });
    const data = await workerRes.json();
    res.status(workerRes.status).json(data);
  } catch (err) {
    console.error("[report] Worker unreachable:", err.message);
    res.status(503).json({ error: "data-worker unavailable" });
  }
});

/**
 * GET /api/report/:jobId
 * Streams the completed PDF from the worker once the job has finished.
 */
router.get("/:jobId", requireAuth, async (req, res) => {
  if (!/^[a-f0-9]{10}$/.test(req.params.jobId)) {
    return res.status(400).json({ error: "Invalid job id" });
  }
  try {
    const workerRes = await fetch(`${WORKER_URL}/report/${req.params.jobId}`);
    if (!workerRes.ok) {
      const body = await workerRes.json().catch(() => ({}));
      return res.status(workerRes.status).json(body);
    }
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="opportunity_report_${req.params.jobId}.pdf"`
    );
    const buf = await workerRes.arrayBuffer();
    res.send(Buffer.from(buf));
  } catch (err) {
    console.error("[report/download] Worker unreachable:", err.message);
    res.status(503).json({ error: "data-worker unavailable" });
  }
});

/**
 * GET /api/report/:jobId/map
 * Streams the companion interactive Folium HTML map.
 */
router.get("/:jobId/map", requireAuth, async (req, res) => {
  if (!/^[a-f0-9]{10}$/.test(req.params.jobId)) {
    return res.status(400).json({ error: "Invalid job id" });
  }
  try {
    const workerRes = await fetch(`${WORKER_URL}/report/${req.params.jobId}/map`);
    if (!workerRes.ok) {
      return res.status(workerRes.status).json({ error: "Map not available" });
    }
    res.setHeader("Content-Type", "text/html");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="opportunity_map_${req.params.jobId}.html"`
    );
    const buf = await workerRes.arrayBuffer();
    res.send(Buffer.from(buf));
  } catch (err) {
    console.error("[report/map] Worker unreachable:", err.message);
    res.status(503).json({ error: "data-worker unavailable" });
  }
});

module.exports = router;
