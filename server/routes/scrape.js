const express = require("express");
const router = express.Router();

const WORKER_URL = process.env.WORKER_URL || "http://data-worker:5000";
const VALID_MARKETS = ["tampa", "orlando", "winter_garden", "winter_park", "all"];

/**
 * POST /api/scrape/trigger
 * Validates input then proxies to data-worker Flask runner.
 *
 * Body for for_sale (active listings):
 *   { type: "for_sale", market: "tampa" }
 *
 * Body for sold (historical training data):
 *   { type: "sold", market: "tampa", start: "2022-01", end: "2024-12" }
 */
router.post("/trigger", async (req, res) => {
  const { type = "for_sale", zip, market, start, end, force_renew, all_zips } = req.body;

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
    return res.status(400).json({ error: `Invalid market. Valid: ${VALID_MARKETS.join(", ")}` });
  }
  if (type === "sold" && !(start && end)) {
    return res.status(400).json({ error: 'type "sold" requires start and end (YYYY-MM)' });
  }

  try {
    const workerRes = await fetch(`${WORKER_URL}/run/scrape`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, zip, market, start, end, force_renew, all_zips }),
    });
    const data = await workerRes.json();
    res.status(workerRes.status).json(data);
  } catch (err) {
    console.error("[scrape/trigger] Worker unreachable:", err.message);
    res.status(503).json({ error: "data-worker unavailable", detail: err.message });
  }
});

/**
 * GET /api/scrape/status
 * Returns data freshness per ZIP and listing_type from the DB.
 */
router.get("/status", async (req, res) => {
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

module.exports = router;
