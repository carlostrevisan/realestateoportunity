const express = require("express");
const { Parser } = require("json2csv");
const { requireAuth } = require("../middleware/auth");
const rateLimit = require("express-rate-limit");
const router = express.Router();

const exportLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });

/**
 * GET /api/export/csv
 *
 * Exports filtered opportunity properties as a downloadable CSV.
 *
 * Query parameters (mirrors /api/opportunities):
 *   city           {string} - City name filter
 *   zip            {string} - 5-digit ZIP code filter (mutually exclusive with city)
 *   listing_type   {string} - "for_sale" | "sold" | "all"  (default: "for_sale")
 *   min_roi        {number} - Minimum opportunity_result
 *   max_year_built {number} - Max year built filter
 *   limit          {number} - Max rows (default 5000, hard cap 10000)
 */
router.get("/csv", exportLimiter, requireAuth, async (req, res) => {
  const db = req.app.locals.db;

  const city = req.query.city || null;
  const zip  = req.query.zip  || null;
  if (zip && !/^\d{5}$/.test(zip)) {
    return res.status(400).json({ error: "zip must be 5 digits" });
  }

  const listingType = req.query.listing_type || "for_sale";
  if (!["for_sale", "sold", "all"].includes(listingType)) {
    return res.status(400).json({ error: 'listing_type must be "for_sale", "sold", or "all"' });
  }

  const minRoi       = parseInt(req.query.min_roi,        10) || null;
  const maxYearBuilt = parseInt(req.query.max_year_built, 10) || null;
  const limit        = Math.min(parseInt(req.query.limit, 10) || 5000, 10000);

  const conditions = [];
  const params     = [];

  if (listingType !== "all") {
    params.push(listingType);
    conditions.push(`listing_type = $${params.length}`);
  }
  if (city) {
    params.push(city);
    conditions.push(`city ILIKE $${params.length}`);
  }
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
      listing_type,
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
      "listing_type",
      "predicted_rebuild_value", "opportunity_result",
      "construction_cost_per_sqft", "created_at",
    ];

    const parser = new Parser({ fields });
    const csv    = parser.parse(rows);

    const slug     = city || zip || "all";
    const filename = `opportunities_${slug}_${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    console.error("[export/csv] Error:", err.message);
    res.status(500).json({ error: "Export failed" });
  }
});

module.exports = router;
