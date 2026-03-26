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

// Mock global fetch for proxy routes
global.fetch = jest.fn();

const request = require("supertest");
const express = require("express");
const { Pool } = require("pg");
const mlRouter = require("../routes/ml");

function buildApp() {
  const app = express();
  app.use(express.json());
  const pool = new Pool();
  app.locals.db = pool;
  app.use("/api/ml", mlRouter);
  return { app, mockQuery: Pool.__mockQuery };
}

describe("ML Routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("GET /api/ml/status", () => {
    it("returns 200 with runs and counts", async () => {
      const { app, mockQuery } = buildApp();
      mockQuery
        .mockResolvedValueOnce({ rows: [{ run_type: "train", status: "completed" }] })
        .mockResolvedValueOnce({ rows: [{ listing_type: "for_sale", total: "10", scored: "5" }] });

      const res = await request(app).get("/api/ml/status");
      expect(res.status).toBe(200);
      expect(res.body.train.status).toBe("completed");
      expect(res.body.counts.for_sale.unscored).toBe(5);
    });
  });

  describe("POST /api/ml/train", () => {
    it("proxies to data-worker and returns 200", async () => {
      const { app } = buildApp();
      global.fetch.mockResolvedValueOnce({
        status: 200,
        json: async () => ({ ok: true, job_id: 123 }),
      });

      const res = await request(app).post("/api/ml/train").send({ n_estimators: 100 });
      expect(res.status).toBe(200);
      expect(res.body.job_id).toBe(123);
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("/run/train"), expect.any(Object));
    });

    it("returns 503 if data-worker is unreachable", async () => {
      const { app } = buildApp();
      global.fetch.mockRejectedValueOnce(new Error("Network fail"));

      const res = await request(app).post("/api/ml/train");
      expect(res.status).toBe(503);
      expect(res.body.error).toBe("data-worker unavailable");
    });
  });

  describe("GET /api/ml/results", () => {
    it("calculates distribution and totals correctly", async () => {
      const { app, mockQuery } = buildApp();
      mockQuery.mockResolvedValueOnce({
        rows: [{
          red_lt0: "10",
          yellow_0_50k: "5",
          yellow_50_100k: "5",
          yellow_100_200k: "5",
          green_200_500k: "10",
          green_gt500k: "5",
          total: "40",
          avg_opportunity: "150000"
        }]
      });

      const res = await request(app).get("/api/ml/results");
      expect(res.status).toBe(200);
      expect(res.body.totals.red).toBe(10);
      expect(res.body.totals.yellow).toBe(15);
      expect(res.body.totals.green).toBe(15);
      expect(res.body.totals.total).toBe(40);
      expect(res.body.distribution).toHaveLength(6);
    });
  });

  describe("GET /api/ml/ops-log", () => {
    it("merges and sorts ml runs and scrape logs", async () => {
      const { app, mockQuery } = buildApp();
      // First call for model_runs
      mockQuery.mockResolvedValueOnce({
        rows: [{ type: "train", started_at: "2024-03-24T12:00:00Z", status: "completed" }]
      });
      // Second call for scrape_log
      mockQuery.mockResolvedValueOnce({
        rows: [{ type: "scrape", started_at: "2024-03-24T11:00:00Z", status: "completed" }]
      });

      const res = await request(app).get("/api/ml/ops-log");
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(new Date(res.body[0].started_at) > new Date(res.body[1].started_at)).toBe(true);
    });
  });
});
