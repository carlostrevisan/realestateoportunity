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
    const { rows: cityRows } = await db.query(
      `SELECT DISTINCT city FROM properties WHERE city IS NOT NULL AND city != '' ORDER BY city`
    );
    const { rows: zipRows } = await db.query(
      `SELECT DISTINCT zip FROM properties WHERE zip IS NOT NULL ORDER BY zip`
    );
    res.json({
      cities: cityRows.map(r => r.city),
      zips: zipRows.map(r => r.zip),
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
    const targetRes = await db.query(
      "SELECT lat, lng, sqft, year_built FROM properties WHERE id = $1", 
      [id]
    );
    if (targetRes.rows.length === 0) return res.status(404).json({ error: "Property not found" });
    
    const { lat, lng, sqft, year_built } = targetRes.rows[0];
    
    // Fallback if coordinates are missing: use original zip-based logic
    if (!lat || !lng) {
      const zipRes = await db.query("SELECT zip FROM properties WHERE id = $1", [id]);
      const zip = zipRes.rows[0]?.zip;
      const compsRes = await db.query(`
        SELECT id, address, city, zip, year_built, sqft, sold_price, sold_date, lat, lng
        FROM properties
        WHERE zip = $1 AND listing_type = 'sold' AND sqft BETWEEN $2 AND $3 AND id != $4
        ORDER BY sold_date DESC LIMIT 10
      `, [zip, Math.round(sqft * 0.75), Math.round(sqft * 1.25), id]);
      return res.json(compsRes.rows);
    }

    // 2. Proximity and Similarity Ranking
    // - Focused on newly built houses (>= 2015) to match rebuild strategy
    // - Radius reduced to 0.5 miles (roughly 0.0075 degrees)
    const compsQuery = `
      SELECT * FROM (
        SELECT
          id, address, city, zip, year_built, sqft,
          sold_price, sold_date, lat, lng,
          (3959 * acos(LEAST(1.0, cos(radians($1)) * cos(radians(lat)) * cos(radians(lng) - radians($2)) + sin(radians($1)) * sin(radians(lat))))) AS distance_mi
        FROM properties
        WHERE
          listing_type = 'sold'
          AND id != $4
          AND lat IS NOT NULL
          AND lng IS NOT NULL
          AND year_built >= 2015
          AND lat BETWEEN $1 - 0.0075 AND $1 + 0.0075
          AND lng BETWEEN $2 - 0.0075 AND $2 + 0.0075
      ) sub
      ORDER BY distance_mi ASC, ABS(sqft - $3) ASC
      LIMIT 10
    `;
    
    const compsRes = await db.query(compsQuery, [lat, lng, sqft, id]);
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
  
  let minRoi = null;
  if (req.query.min_roi && req.query.min_roi.trim() !== "") {
    minRoi = parseInt(req.query.min_roi, 10);
    if (isNaN(minRoi)) return res.status(400).json({ error: "min_roi must be a number" });
  }

  let maxYearBuilt = null;
  if (req.query.max_year_built && req.query.max_year_built.trim() !== "") {
    maxYearBuilt = parseInt(req.query.max_year_built, 10);
    if (isNaN(maxYearBuilt)) return res.status(400).json({ error: "max_year_built must be a number" });
  }

  let minYearBuilt = null;
  if (req.query.min_year_built && req.query.min_year_built.trim() !== "") {
    minYearBuilt = parseInt(req.query.min_year_built, 10);
    if (isNaN(minYearBuilt)) return res.status(400).json({ error: "min_year_built must be a number" });
  }
  const listingType = req.query.listing_type || "for_sale";
  if (!["for_sale", "sold", "all"].includes(listingType)) {
    return res.status(400).json({ error: 'listing_type must be "for_sale", "sold", or "all"' });
  }
  const limit = Math.min(parseInt(req.query.limit, 10) || 1000, 5000);

  const conditions = ["lat IS NOT NULL", "lng IS NOT NULL"];
  const params = [];

  // Default to for_sale - the active listings with opportunity scores
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

  if (minYearBuilt !== null) {
    params.push(minYearBuilt);
    conditions.push(`year_built >= $${params.length}`);
  }

  const whereClause = "WHERE " + conditions.join(" AND ");

  try {
    // 1. Get true total count matching these filters
    const countQuery = `SELECT COUNT(*) as count FROM properties ${whereClause}`;
    const { rows: countRows } = await db.query(countQuery, params);
    const totalMatch = parseInt(countRows[0].count);

    // 2. Get the limited records for display
    const limitParams = [...params, limit];
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
      LIMIT $${limitParams.length}
    `;

    const { rows } = await db.query(query, limitParams);

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
      meta: { 
        total: totalMatch, 
        showing: features.length,
        limit, 
        listing_type: listingType 
      },
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
