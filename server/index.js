require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const opportunitiesRouter = require("./routes/opportunities");
const scrapeRouter = require("./routes/scrape");
const exportRouter = require("./routes/export");
const mlRouter = require("./routes/ml");
const jobsRouter = require("./routes/jobs");

const app = express();
const PORT = process.env.PORT || 4000;

// Database pool — shared across routes
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Make pool available to route handlers
app.locals.db = pool;

app.use(cors());
app.use(express.json());

// Request logger
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

// Health check — used by Docker healthcheck and load balancers
app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", db: "connected" });
  } catch (err) {
    res.status(503).json({ status: "error", db: "disconnected", error: err.message });
  }
});

// API routes
app.use("/api/opportunities", opportunitiesRouter);
app.use("/api/scrape", scrapeRouter);
app.use("/api/export", exportRouter);
app.use("/api/ml", mlRouter);
app.use("/api/jobs", jobsRouter);

// 404 fallback
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("[ERROR]", err.message);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`[server] Listening on port ${PORT}`);
  console.log(`[server] Health: http://localhost:${PORT}/health`);
  console.log(`[server] API:    http://localhost:${PORT}/api/opportunities`);
});
