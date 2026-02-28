const express = require("express");
const router = express.Router();

/**
 * GET /api/opportunities/filters
 *
 * Returns unique cities and ZIP codes in the system for dropdown population.
 */
router.get("/filters", async (req, res) => {
  const db = req.app.locals.db;
  try {
    const citiesQuery = "SELECT DISTINCT city FROM properties WHERE city IS NOT NULL ORDER BY city ASC";
    const zipsQuery = "SELECT DISTINCT zip FROM properties WHERE zip IS NOT NULL ORDER BY zip ASC";

    const [citiesRes, zipsRes] = await Promise.all([
      db.query(citiesQuery),
      db.query(zipsQuery)
    ]);

    res.json({
      cities: citiesRes.rows.map(r => r.city),
      zips: zipsRes.rows.map(r => r.zip)
    });
  } catch (err) {
    console.error("[filters] Query error:", err.message);
    res.status(500).json({ error: "Failed to fetch filters" });
  }
});

/**
 * GET /api/opportunities/:id/comparables
 * 
 * Returns comparable sold listings for a specific property.
 */
router.get("/:id/comparables", async (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;

  try {
    // 1. Get the target property's details
    const targetRes = await db.query("SELECT zip, sqft FROM properties WHERE id = $1", [id]);
    if (targetRes.rows.length === 0) return res.status(404).json({ error: "Property not found" });
    
    const { zip, sqft } = targetRes.rows[0];
    const minSqft = Math.round(sqft * 0.75);
    const maxSqft = Math.round(sqft * 1.25);

    // 2. Find sold comps in same zip with similar sqft
    const compsQuery = `
      SELECT
        id, address, city, zip, year_built, sqft,
        list_price, sold_price, sold_date,
        lat, lng,
        opportunity_result, predicted_rebuild_value
      FROM properties
      WHERE zip = $1 
        AND listing_type = 'sold'
        AND sqft BETWEEN $2 AND $3
        AND id != $4
      ORDER BY sold_date DESC NULLS LAST
      LIMIT 10
    `;
    
    const compsRes = await db.query(compsQuery, [zip, minSqft, maxSqft, id]);
    res.json(compsRes.rows);
  } catch (err) {
    console.error("[comparables] Error:", err.message);
    res.status(500).json({ error: "Failed to fetch comparables" });
  }
});

/**
 * GET /api/opportunities
...
 */
router.get("/", async (req, res) => {
  const db = req.app.locals.db;

  const zip = req.query.zip || null;
  const city = req.query.city || null;
  const minRoi = req.query.min_roi !== undefined ? parseInt(req.query.min_roi, 10) : null;
  const maxYearBuilt = req.query.max_year_built !== undefined ? parseInt(req.query.max_year_built, 10) : null;

  if (minRoi !== null && isNaN(minRoi)) {
    return res.status(400).json({ error: "min_roi must be a number" });
  }
  if (maxYearBuilt !== null && isNaN(maxYearBuilt)) {
    return res.status(400).json({ error: "max_year_built must be a number" });
  }
  const listingType = req.query.listing_type || "for_sale";
  const limit = Math.min(parseInt(req.query.limit) || 1000, 5000);

  const conditions = ["lat IS NOT NULL", "lng IS NOT NULL"];
  const params = [];

  // Default to for_sale — the active listings with opportunity scores
  if (listingType !== "all") {
    params.push(listingType);
    conditions.push(`listing_type = $${params.length}`);
  }

  if (zip) {
    params.push(zip);
    conditions.push(`zip = $${params.length}`);
  }

  if (city) {
    params.push(city);
    conditions.push(`city ILIKE $${params.length}`);
  }

  if (minRoi !== null) {
    params.push(minRoi);
    conditions.push(`opportunity_result >= $${params.length}`);
  }

  if (maxYearBuilt !== null) {
    params.push(maxYearBuilt);
    conditions.push(`year_built <= $${params.length}`);
  }

  const whereClause = "WHERE " + conditions.join(" AND ");

  params.push(limit);
  const limitClause = `LIMIT $${params.length}`;

  const query = `
    SELECT
      id, mls_id, address, city, zip,
      lat, lng,
      year_built, sqft, lot_sqft,
      list_price, sold_price, sold_date,
      listing_type,
      predicted_rebuild_value,
      opportunity_result,
      construction_cost_per_sqft
    FROM properties
    ${whereClause}
    ORDER BY opportunity_result DESC NULLS LAST
    ${limitClause}
  `;

  try {
    const { rows } = await db.query(query, params);

    const features = rows.map((row) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [parseFloat(row.lng), parseFloat(row.lat)],
      },
      properties: {
        id: row.id,
        mls_id: row.mls_id,
        address: row.address,
        city: row.city,
        zip: row.zip,
        year_built: row.year_built,
        sqft: row.sqft,
        lot_sqft: row.lot_sqft,
        list_price: row.list_price,
        sold_price: row.sold_price,
        sold_date: row.sold_date,
        listing_type: row.listing_type,
        predicted_rebuild_value: row.predicted_rebuild_value,
        opportunity_result: row.opportunity_result,
        construction_cost_per_sqft: row.construction_cost_per_sqft,
        roi_color: getRoiColor(row.opportunity_result),
      },
    }));

    res.json({
      type: "FeatureCollection",
      features,
      meta: { total: features.length, limit, listing_type: listingType },
    });
  } catch (err) {
    console.error("[opportunities] Query error:", err.message);
    res.status(500).json({ error: "Database query failed" });
  }
});

function getRoiColor(opportunityResult) {
  if (opportunityResult === null || opportunityResult === undefined) return "gray";
  if (opportunityResult > 200000) return "green";
  if (opportunityResult >= 0) return "yellow";
  return "red";
}

module.exports = router;
