"use strict";

// Mock pg before any require that uses it
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

// Mock global fetch - scrape routes proxy to the data-worker via fetch()
global.fetch = jest.fn();

const request = require("supertest");
const express = require("express");
const { Pool } = require("pg");
const scrapeRouter = require("../routes/scrape");

// ─────────────────────────────────────────────────────────────────────────────
// Test app factory
// ─────────────────────────────────────────────────────────────────────────────

function buildApp() {
  const app = express();
  app.use(express.json());

  const pool = new Pool();
  app.locals.db = pool;

  app.use("/api/scrape", scrapeRouter);
  app.use((req, res) => res.status(404).json({ error: "Not found" }));

  return { app, mockQuery: Pool.__mockQuery };
}

// Reset fetch mock between tests
beforeEach(() => {
  global.fetch.mockReset();
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/scrape/trigger - input validation
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/scrape/trigger - validation", () => {
  it("returns 400 when neither zip nor market is provided", async () => {
    // Arrange
    const { app } = buildApp();

    // Act
    const res = await request(app)
      .post("/api/scrape/trigger")
      .send({ type: "for_sale" });

    // Assert
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/zip or market/i);
  });

  it("returns 400 when type is not 'sold' or 'for_sale'", async () => {
    // Arrange
    const { app } = buildApp();

    // Act
    const res = await request(app)
      .post("/api/scrape/trigger")
      .send({ type: "rental", zip: "33606" });

    // Assert
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/type must be/i);
  });

  it("returns 400 when zip does not match 5-digit pattern", async () => {
    // Arrange
    const { app } = buildApp();

    // Act
    const res = await request(app)
      .post("/api/scrape/trigger")
      .send({ type: "for_sale", zip: "336" }); // too short

    // Assert
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/5 digits/i);
  });

  it("returns 400 when type is 'sold' but start/end are missing", async () => {
    // Arrange
    const { app } = buildApp();

    // Act
    const res = await request(app)
      .post("/api/scrape/trigger")
      .send({ type: "sold", market: "tampa" }); // missing start & end

    // Assert
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/requires start and end/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/scrape/trigger - successful proxy
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/scrape/trigger - data-worker proxy", () => {
  it("forwards a valid for_sale + market request to the data-worker and returns its response", async () => {
    // Arrange
    const { app } = buildApp();
    const workerResponse = { job_id: "abc123", status: "pending" };
    global.fetch.mockResolvedValueOnce({
      status: 202,
      json: async () => workerResponse,
    });

    // Act
    const res = await request(app)
      .post("/api/scrape/trigger")
      .send({ type: "for_sale", market: "tampa" });

    // Assert - status mirrors the worker response
    expect(res.status).toBe(202);
    expect(res.body).toEqual(workerResponse);
    // fetch was called once with the worker URL
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain("/run/scrape");
    expect(JSON.parse(options.body)).toMatchObject({ type: "for_sale", market: "tampa" });
  });

  it("returns 503 when the data-worker is unreachable", async () => {
    // Arrange
    const { app } = buildApp();
    global.fetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    // Act
    const res = await request(app)
      .post("/api/scrape/trigger")
      .send({ type: "for_sale", market: "orlando" });

    // Assert
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/data-worker unavailable/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/scrape/status
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/scrape/status", () => {
  it("returns 200 with a scrape_status array", async () => {
    // Arrange
    const { app, mockQuery } = buildApp();
    mockQuery.mockResolvedValueOnce({
      rows: [
        { zip: "33606", listing_type: "for_sale", property_count: "45", last_scraped: "2026-03-11T00:00:00Z", earliest_sale: null, latest_sale: null },
        { zip: "33629", listing_type: "sold", property_count: "120", last_scraped: "2026-03-10T00:00:00Z", earliest_sale: "2022-01-01", latest_sale: "2025-12-31" },
      ],
    });

    // Act
    const res = await request(app).get("/api/scrape/status");

    // Assert
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("scrape_status");
    expect(Array.isArray(res.body.scrape_status)).toBe(true);
    expect(res.body.scrape_status).toHaveLength(2);
    expect(res.body.scrape_status[0]).toHaveProperty("zip", "33606");
  });

  it("returns 500 when the database query throws", async () => {
    // Arrange
    const { app, mockQuery } = buildApp();
    mockQuery.mockRejectedValueOnce(new Error("DB timeout"));

    // Act
    const res = await request(app).get("/api/scrape/status");

    // Assert
    expect(res.status).toBe(500);
  });
});
