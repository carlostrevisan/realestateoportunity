"use strict";

jest.mock("pg", () => {
  const mockQuery = jest.fn();
  const MockPool = jest.fn(() => ({ query: mockQuery }));
  MockPool.__mockQuery = mockQuery;
  return { Pool: MockPool };
});

jest.mock("../middleware/auth", () => ({
  requireAuth: (req, res, next) => next(),
  requireAdmin: (req, res, next) => next(),
}));

const request = require("supertest");
const express = require("express");
const { Pool } = require("pg");
const exportRouter = require("../routes/export");

function buildApp() {
  const app = express();
  app.use(express.json());
  const pool = new Pool();
  app.locals.db = pool;
  app.use("/api/export", exportRouter);
  return { app, mockQuery: Pool.__mockQuery };
}

describe("Export Routes", () => {
  describe("GET /api/export/csv", () => {
    it("returns 200 and a CSV file when rows are found", async () => {
      const { app, mockQuery } = buildApp();
      mockQuery.mockResolvedValueOnce({
        rows: [{
          mls_id: "MLS1",
          address: "123 St",
          opportunity_result: 100000
        }]
      });

      const res = await request(app).get("/api/export/csv");
      expect(res.status).toBe(200);
      expect(res.header["content-type"]).toBe("text/csv; charset=utf-8");
      expect(res.text).toContain('"mls_id","address"');
      expect(res.text).toContain('"MLS1","123 St"');
    });

    it("returns 404 when no rows match filters", async () => {
      const { app, mockQuery } = buildApp();
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get("/api/export/csv");
      expect(res.status).toBe(404);
      expect(res.body.error).toBe("No properties match the given filters");
    });

    it("correctly builds query with filters", async () => {
      const { app, mockQuery } = buildApp();
      mockQuery.mockResolvedValueOnce({ rows: [{ mls_id: "1" }] });

      await request(app).get("/api/export/csv?zip=33606&min_roi=100000");

      const [query, params] = mockQuery.mock.calls[0];
      // listing_type is always included ($1), zip becomes $2, min_roi becomes $3
      expect(query).toContain("listing_type = $1");
      expect(query).toContain("zip = $2");
      expect(query).toContain("opportunity_result >= $3");
      expect(params).toContain("for_sale");
      expect(params).toContain("33606");
      expect(params).toContain(100000);
    });

    it("accepts city and listing_type filters", async () => {
      const { app, mockQuery } = buildApp();
      mockQuery.mockResolvedValueOnce({ rows: [{ mls_id: "1" }] });

      await request(app).get("/api/export/csv?city=tampa&listing_type=sold");

      const [query, params] = mockQuery.mock.calls[0];
      expect(query).toContain("listing_type = $1");
      expect(query).toContain("city ILIKE $2");
      expect(params).toContain("sold");
      expect(params).toContain("tampa");
    });

    it("rejects invalid listing_type", async () => {
      const { app } = buildApp();
      const res = await request(app).get("/api/export/csv?listing_type=bad");
      expect(res.status).toBe(400);
    });
  });
});
