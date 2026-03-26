const express = require("express");
const router = express.Router();

/**
 * GET /api/stats
 * Returns a unified pipeline-state summary for the Home dashboard.
 */
router.get("/", async (req, res) => {
  const db = req.app.locals.db;

  try {
    const [
      totalRes,
      candidatesRes,
      avgDiffRes,
      r2Res,
      lastRunRes,
      overTimeRes,
      cityRes,
    ] = await Promise.all([
      db.query("SELECT COUNT(*) AS count FROM properties"),
      db.query(
        "SELECT COUNT(*) AS count FROM properties WHERE listing_type = 'for_sale' AND opportunity_result > 0"
      ),
      db.query(
        `SELECT ROUND(AVG(opportunity_result::float / NULLIF(list_price, 0) * 100)::numeric, 1) AS avg_pct
         FROM properties
         WHERE listing_type = 'for_sale' AND opportunity_result > 0 AND list_price > 0`
      ),
      db.query(
        "SELECT r2_score FROM model_runs WHERE is_active = true LIMIT 1"
      ),
      db.query(
        `SELECT run_type, status, started_at, completed_at, properties_trained, properties_scored
         FROM model_runs ORDER BY started_at DESC LIMIT 1`
      ),
      db.query(
        `SELECT created_at::date AS date, COUNT(*) AS count
         FROM properties
         WHERE listing_type = 'for_sale' AND opportunity_result > 0
         GROUP BY created_at::date
         ORDER BY date ASC`
      ),
      db.query(
        `SELECT city, COUNT(*) AS count
         FROM properties
         WHERE listing_type = 'for_sale' AND opportunity_result > 0 AND city IS NOT NULL AND city != ''
         GROUP BY city
         ORDER BY count DESC
         LIMIT 10`
      ),
    ]);

    res.json({
      total_properties:    parseInt(totalRes.rows[0].count),
      total_candidates:    parseInt(candidatesRes.rows[0].count),
      avg_price_diff_pct:  parseFloat(avgDiffRes.rows[0].avg_pct) || 0,
      model_r2:            r2Res.rows[0] ? parseFloat(r2Res.rows[0].r2_score) : null,
      last_run:            lastRunRes.rows[0] || null,
      candidates_over_time: overTimeRes.rows.map(r => ({
        date:  r.date,
        count: parseInt(r.count),
      })),
      city_breakdown: cityRes.rows.map(r => ({
        city:  r.city,
        count: parseInt(r.count),
      })),
    });
  } catch (err) {
    console.error("[stats] Error:", err.message);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

module.exports = router;
