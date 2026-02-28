const express = require("express");
const { Parser } = require("json2csv");
const router = express.Router();

/**
 * GET /api/export/csv
 *
 * Exports filtered opportunity properties as a downloadable CSV.
 *
 * Query parameters (same as /api/opportunities):
 *   zip           {string} - Filter by ZIP code
 *   min_roi       {number} - Minimum opportunity_result
 *   max_year_built {number} - Max year built filter
 *   limit         {number} - Max rows (default 5000, no 2000 cap for exports)
 */
router.get("/csv", async (req, res) => {
  const db = req.app.locals.db;

  const zip = req.query.zip || null;
  const minRoi = parseInt(req.query.min_roi) || null;
  const maxYearBuilt = parseInt(req.query.max_year_built) || null;
  const limit = Math.min(parseInt(req.query.limit) || 5000, 10000);

  const conditions = [];
  const params = [];

  if (zip) {
    params.push(zip);
    conditions.push(`zip = $${params.length}`);
  }

  if (minRoi !== null) {
    params.push(minRoi);
    conditions.push(`opportunity_result >= $${params.length}`);
  }

  if (maxYearBuilt !== null) {
    params.push(maxYearBuilt);
    conditions.push(`year_built <= $${params.length}`);
  }

  const whereClause = conditions.length > 0
    ? "WHERE " + conditions.join(" AND ")
    : "";

  params.push(limit);

  const query = `
    SELECT
      mls_id, address, city, zip,
      lat, lng,
      year_built, sqft, lot_sqft,
      list_price, sold_price, sold_date,
      predicted_rebuild_value,
      opportunity_result,
      construction_cost_per_sqft,
      created_at
    FROM properties
    ${whereClause}
    ORDER BY opportunity_result DESC NULLS LAST
    LIMIT $${params.length}
  `;

  try {
    const { rows } = await db.query(query, params);

    if (rows.length === 0) {
      return res.status(404).json({ error: "No properties match the given filters" });
    }

    const fields = [
      "mls_id", "address", "city", "zip",
      "lat", "lng",
      "year_built", "sqft", "lot_sqft",
      "list_price", "sold_price", "sold_date",
      "predicted_rebuild_value", "opportunity_result",
      "construction_cost_per_sqft", "created_at",
    ];

    const parser = new Parser({ fields });
    const csv = parser.parse(rows);

    const filename = `opportunities_${zip || "all"}_${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    console.error("[export/csv] Error:", err.message);
    res.status(500).json({ error: "Export failed" });
  }
});

module.exports = router;
