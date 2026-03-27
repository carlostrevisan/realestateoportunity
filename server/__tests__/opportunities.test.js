"use strict";

// Mock `pg` before any require() that touches it.
// The factory returns a Pool instance whose `query` method is a jest.fn()
// so each test can configure its own response via mockResolvedValueOnce.
jest.mock("pg", () => {
  const mockQuery = jest.fn();
  const MockPool = jest.fn(() => ({ query: mockQuery }));
  MockPool.__mockQuery = mockQuery; // expose so tests can reach it
  return { Pool: MockPool };
});

const request = require("supertest");
const express = require("express");
const { Pool } = require("pg");
const opportunitiesRouter = require("../routes/opportunities");

// ─────────────────────────────────────────────────────────────────────────────
// Test app factory - builds a minimal Express app wired with the real
// opportunities router and a mocked DB pool. No listen() call is made;
// Supertest handles that internally.
// ─────────────────────────────────────────────────────────────────────────────

function buildApp() {
  const app = express();
  app.use(express.json());

  const pool = new Pool();
  app.locals.db = pool;

  app.use("/api/opportunities", opportunitiesRouter);

  // Minimal 404 fallback
  app.use((req, res) => res.status(404).json({ error: "Not found" }));

  return { app, mockQuery: Pool.__mockQuery };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/opportunities/filters
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/opportunities/filters", () => {
  it("returns 200 with cities and zips arrays", async () => {
    // Arrange
    const { app, mockQuery } = buildApp();
    mockQuery
      .mockResolvedValueOnce({ rows: [{ city: "Tampa" }, { city: "Orlando" }] })
      .mockResolvedValueOnce({ rows: [{ zip: "33606" }, { zip: "33629" }] });

    // Act
    const res = await request(app).get("/api/opportunities/filters");

    // Assert
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      cities: ["Tampa", "Orlando"],
      zips: ["33606", "33629"],
    });
  });

  it("returns 500 when the database query throws", async () => {
    // Arrange
    const { app, mockQuery } = buildApp();
    mockQuery.mockRejectedValue(new Error("Connection refused"));

    // Act
    const res = await request(app).get("/api/opportunities/filters");

    // Assert
    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty("error");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/opportunities
// ─────────────────────────────────────────────────────────────────────────────

const PROPERTY_ROW = {
  id: 1,
  mls_id: "MLS001",
  address: "123 Oak St",
  city: "Tampa",
  zip: "33606",
  lat: "27.948000",
  lng: "-82.458000",
  year_built: 1965,
  sqft: 1800,
  lot_sqft: 7500,
  list_price: 450000,
  sold_price: null,
  sold_date: null,
  listing_type: "for_sale",
  predicted_rebuild_value: 720000,
  opportunity_result: 115000,
  construction_cost_per_sqft: "175.00",
};

describe("GET /api/opportunities", () => {
  it("returns 200 with a GeoJSON FeatureCollection", async () => {
    // Arrange
    const { app, mockQuery } = buildApp();
    // First call = count query, second = data query
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: "1" }] })
      .mockResolvedValueOnce({ rows: [PROPERTY_ROW] });

    // Act
    const res = await request(app).get("/api/opportunities");

    // Assert
    expect(res.status).toBe(200);
    expect(res.body.type).toBe("FeatureCollection");
    expect(Array.isArray(res.body.features)).toBe(true);
    expect(res.body.features).toHaveLength(1);
  });

  it("assigns roi_color='yellow' when opportunity_result is between 0 and 200k", async () => {
    // Arrange
    const { app, mockQuery } = buildApp();
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: "1" }] })
      .mockResolvedValueOnce({ rows: [PROPERTY_ROW] }); // opportunity_result = 115000

    // Act
    const res = await request(app).get("/api/opportunities");

    // Assert
    expect(res.body.features[0].properties.roi_color).toBe("yellow");
  });

  it("assigns roi_color='green' when opportunity_result > 200,000", async () => {
    // Arrange
    const { app, mockQuery } = buildApp();
    const greenRow = { ...PROPERTY_ROW, opportunity_result: 350000 };
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: "1" }] })
      .mockResolvedValueOnce({ rows: [greenRow] });

    // Act
    const res = await request(app).get("/api/opportunities");

    // Assert
    expect(res.body.features[0].properties.roi_color).toBe("green");
  });

  it("assigns roi_color='red' when opportunity_result is negative", async () => {
    // Arrange
    const { app, mockQuery } = buildApp();
    const redRow = { ...PROPERTY_ROW, opportunity_result: -50000 };
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: "1" }] })
      .mockResolvedValueOnce({ rows: [redRow] });

    // Act
    const res = await request(app).get("/api/opportunities");

    // Assert
    expect(res.body.features[0].properties.roi_color).toBe("red");
  });

  it("assigns roi_color='gray' when opportunity_result is null (unscored)", async () => {
    // Arrange
    const { app, mockQuery } = buildApp();
    const grayRow = { ...PROPERTY_ROW, opportunity_result: null };
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: "1" }] })
      .mockResolvedValueOnce({ rows: [grayRow] });

    // Act
    const res = await request(app).get("/api/opportunities");

    // Assert
    expect(res.body.features[0].properties.roi_color).toBe("gray");
  });

  it("returns 400 when min_roi is not a number", async () => {
    // Arrange
    const { app } = buildApp();

    // Act
    const res = await request(app).get("/api/opportunities?min_roi=abc");

    // Assert
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/min_roi must be a number/i);
  });

  it("returns 400 when max_year_built is not a number", async () => {
    const { app } = buildApp();
    const res = await request(app).get("/api/opportunities?max_year_built=notanumber");
    expect(res.status).toBe(400);
  });

  it("returns meta object with total, showing, limit, and listing_type", async () => {
    // Arrange
    const { app, mockQuery } = buildApp();
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: "5" }] })
      .mockResolvedValueOnce({ rows: [PROPERTY_ROW] });

    // Act
    const res = await request(app).get("/api/opportunities");

    // Assert
    expect(res.body.meta).toMatchObject({
      total: 5,
      showing: 1,
      listing_type: "for_sale",
    });
    expect(typeof res.body.meta.limit).toBe("number");
  });

  it("includes GeoJSON coordinates as [lng, lat] pairs", async () => {
    // Arrange
    const { app, mockQuery } = buildApp();
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: "1" }] })
      .mockResolvedValueOnce({ rows: [PROPERTY_ROW] });

    // Act
    const res = await request(app).get("/api/opportunities");

    // Assert - GeoJSON spec: coordinates = [longitude, latitude]
    const [lng, lat] = res.body.features[0].geometry.coordinates;
    expect(lng).toBeCloseTo(-82.458, 2);
    expect(lat).toBeCloseTo(27.948, 2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/opportunities/:id/comparables
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/opportunities/:id/comparables", () => {
  it("returns 404 when the property does not exist", async () => {
    // Arrange
    const { app, mockQuery } = buildApp();
    mockQuery.mockResolvedValueOnce({ rows: [] }); // target property not found

    // Act
    const res = await request(app).get("/api/opportunities/9999/comparables");

    // Assert
    expect(res.status).toBe(404);
  });

  it("returns an array of comparable properties when the property exists", async () => {
    // Arrange
    const { app, mockQuery } = buildApp();
    // First call = fetch target property; second = fetch comps
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ lat: 27.948, lng: -82.458, sqft: 1800, year_built: 1965 }],
      })
      .mockResolvedValueOnce({
        rows: [
          { id: 2, address: "456 Elm Ave", city: "Tampa", zip: "33606", year_built: 2019, sqft: 1750, sold_price: 680000, sold_date: "2024-06-15", lat: 27.949, lng: -82.459, distance_mi: 0.12 },
        ],
      });

    // Act
    const res = await request(app).get("/api/opportunities/1/comparables");

    // Assert
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).toHaveProperty("sold_price");
    expect(res.body[0]).toHaveProperty("distance_mi");
  });
});
