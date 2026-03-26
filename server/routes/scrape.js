const express = require("express");
const router = require("express").Router();
const { requireAuth, requireAdmin } = require("../middleware/auth");

const WORKER_URL = process.env.WORKER_URL || "http://data-worker:5000";
const VALID_MARKETS = ["tampa", "orlando", "winter_garden", "winter_park", "all"];

/**
 * POST /api/scrape/trigger
 */
router.post("/trigger", requireAuth, async (req, res) => {
  const { type = "for_sale", zip, market, start, end, throttle, force_renew, all_zips } = req.body;

  if (!["sold", "for_sale"].includes(type)) {
    return res.status(400).json({ error: 'type must be "sold" or "for_sale"' });
  }
  if (!zip && !market) {
    return res.status(400).json({ error: "Provide zip or market" });
  }
  if (zip && !/^\d{5}$/.test(zip)) {
    return res.status(400).json({ error: "zip must be 5 digits" });
  }
  if (market && !VALID_MARKETS.includes(market)) {
    return res.status(400).json({ error: "Invalid market" });
  }
  if (type === "sold" && !(start && end)) {
    return res.status(400).json({ error: 'type "sold" requires start and end (YYYY-MM)' });
  }

  try {
    const workerRes = await fetch(`${WORKER_URL}/run/scrape`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, zip, market, start, end, throttle, force_renew, all_zips }),
    });
    const data = await workerRes.json();
    res.status(workerRes.status).json(data);
  } catch (err) {
    console.error("[scrape/trigger] Worker unreachable:", err.message);
    res.status(503).json({ error: "data-worker unavailable" });
  }
});

/**
 * GET /api/scrape/status
 */
router.get("/status", requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  try {
    const { rows } = await db.query(`
      SELECT
        zip,
        listing_type,
        COUNT(*) as property_count,
        MAX(updated_at) as last_scraped,
        MIN(sold_date) as earliest_sale,
        MAX(sold_date) as latest_sale
      FROM properties
      GROUP BY zip, listing_type
      ORDER BY zip, listing_type
    `);
    res.json({ scrape_status: rows });
  } catch (err) {
    console.error("[scrape/status] Error:", err.message);
    res.status(500).json({ error: "Failed to fetch scrape status" });
  }
});

/**
 * POST /api/scrape/reset
 */
router.post("/reset", requireAdmin, async (req, res) => {
  const db = req.app.locals.db;
  try {
    // 1. Clear Database
    await db.query("TRUNCATE properties, model_runs, scrape_log, zip_income RESTART IDENTITY");

    // 2. Tell worker to delete local assets if any (internal call)
    await fetch(`${WORKER_URL}/reset`, { method: "POST" });

    res.json({ status: "ok", message: "Kernel purged and logs cleared" });
  } catch (err) {
    console.error("[reset] Error:", err.message);
    res.status(500).json({ error: "Reset failed" });
  }
});

module.exports = router;
