# Florida Real Estate Opportunity Engine

A full-stack investment analysis tool that identifies **Buy, Demolish, Rebuild** opportunities across Florida markets. It surfaces aging single-family homes where lot value + new construction costs make teardown candidates profitable — scored by an ML model and displayed on an interactive map.

---

## What It Does

- Scrapes live MLS listings via HomeHarvest (Realtor.com) by market and date range, capturing beds, baths, sqft, lot size, and coordinates
- Cleans and filters data to single-family homes within investment-relevant parameters
- Enriches properties with ZIP-level median household income from the US Census API
- Optionally enriches with FL DOE school quality ratings per ZIP (`school_fetcher.py`)
- Trains a model (XGBoost, Random Forest, Ridge, or LightGBM) on 10 features including geospatial new-build comps (0.5-mile radius), beds/baths, month sold, and city encoding — using a forward-looking temporal train/test split
- Scores every for-sale property using a realistic BDR cost formula that accounts for soft costs, carrying costs, and contingency
- Generates confidence intervals (10th–90th percentile range) when using XGBoost via quantile regression
- Displays results on a live map with color-coded ROI markers and per-property confidence bands
- Tracks all scrape, train, and score jobs with a real-time console
- Exports filtered results to CSV

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite 5, Tailwind CSS, React-Leaflet, shadcn/ui |
| Auth | Clerk |
| Backend | Node.js, Express 4, pg |
| Data Engine | Python 3.11+, HomeHarvest, pandas, XGBoost, scikit-learn, LightGBM, Flask |
| Database | PostgreSQL 15 |
| Reverse Proxy | Caddy 2 (HTTPS auto-provisioning) |
| Container | Docker Compose with named volumes |

---

## Getting Started

### Prerequisites

- Docker & Docker Compose
- A `.env` file in the project root

### Environment Variables

Create a `.env` file:

```env
DB_PASSWORD=your_secure_password
DB_USER=realestate_user           # optional, defaults to realestate_user
DB_NAME=realestate                # optional, defaults to realestate

CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_SECRET_KEY=sk_live_...
VITE_CLERK_PUBLISHABLE_KEY=pk_live_...

# Optional: school quality enrichment (Tier 3)
# Set one of these to enable the /api/schools/fetch endpoint:
FLDOE_SCHOOL_DATA_PATH=/path/to/school_grades.csv   # local CSV file
FLDOE_SCHOOL_GRADES_URL=https://...                  # remote CSV URL
```

### Run the Stack

```bash
docker compose up
```

The app will be available at `http://localhost` (or your domain over HTTPS via Caddy).

---

## Services

| Service | Description | Port |
|---------|-------------|------|
| `frontend` | React app served via nginx | 3000 (internal) |
| `backend` | Express REST API | 4000 (internal) |
| `data-worker` | Python scraper + ML engine (Flask) | 5000 (internal) |
| `db` | PostgreSQL 15 | 5432 (internal) |
| `caddy` | Reverse proxy + TLS termination | 80, 443 |

---

## API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/opportunities` | GET | GeoJSON FeatureCollection of scored properties |
| `/api/opportunities/filters` | GET | Unique cities and ZIP codes for dropdowns |
| `/api/opportunities/:id/comparables` | GET | Comparable sold listings for a property |
| `/api/stats` | GET | Aggregate KPIs (totals, model R², last run) |
| `/api/scrape/trigger` | POST | Trigger a scrape job |
| `/api/scrape/status` | GET | Per-market property counts by listing type |
| `/api/ml/train` | POST | Start a model training run |
| `/api/ml/score` | POST | Score all for-sale candidates |
| `/api/ml/status` | GET | Active model info + unscored counts |
| `/api/ml/models` | GET | List all trained models |
| `/api/ml/results` | GET | Opportunity score distribution |
| `/api/jobs` | GET | List recent jobs |
| `/api/jobs/:id` | GET | Poll a specific job's logs and status |
| `/api/export/csv` | GET | Export filtered opportunities as CSV |
| `/api/schools/fetch` | POST | Trigger FL DOE school ratings ingest (requires env var) |

**Query params for `/api/opportunities`:** `zip`, `city`, `min_roi`, `min_year_built`, `max_year_built`, `listing_type`, `limit`

---

## ML Model

The model is trained on new-build sold comps and predicts post-rebuild market value. Four algorithms are supported: `xgboost` (default), `random_forest`, `ridge`, `lightgbm`.

**Realistic BDR cost formula:**

```
hard_cost        = sqft × construction_cost_per_sqft
total_dev_cost   = list_price × 1.08 + hard_cost × 1.36
opportunity_result = predicted_rebuild_value − total_dev_cost
```

The multipliers reflect real BDR project economics:
- `× 1.08` on acquisition — closing costs, carrying costs, legal
- `× 1.36` on hard construction — 18% soft costs (design, permits, insurance) + 10% contingency + 8% financing

`construction_cost_per_sqft` defaults to $175/sqft (Florida market rate). Positive score = potentially profitable teardown candidate.

**Feature set (10 features):**

| Feature | Description |
|---------|-------------|
| `sqft` | Living area square footage |
| `lot_sqft` | Lot size |
| `year_built` | Age of structure |
| `beds` | Bedroom count |
| `baths` | Bathroom count |
| `month_sold` | Month sold (1–12), captures seasonality |
| `median_household_income` | ZIP-level income from US Census |
| `zip` | Ordinal-encoded ZIP code |
| `city_encoded` | Ordinal-encoded city |
| `avg_new_build_price_sqft_05mi` | Avg $/sqft of new builds within 0.5 miles (haversine) |

**Train/test split:** Forward-looking temporal split — trained on the oldest 80% of sold dates, tested on the newest 20%. Prevents data leakage from future comps into training.

**Confidence intervals (XGBoost only):** Two additional quantile models (q10 / q90) are trained alongside the main model. The resulting `opp_low` / `opp_high` bounds are stored per property and displayed in the map popup and detail panel.

**ROI color coding on the map:**
- **Green** — opportunity > $200k
- **Yellow** — opportunity $0–$200k
- **Red** — negative opportunity

A weighted scoring mode is also available, which skips ML training and scores candidates using manually assigned feature weights.

---

## Data Persistence

PostgreSQL data is stored in a named Docker volume (`realestateoportunity_postgres_data`) and **survives `docker compose down`**.

To wipe the database intentionally:

```bash
docker compose down -v
```

> **Warning:** using `-v` on a deploy command will destroy all scraped data. The safe deploy command is:
> ```bash
> docker compose down && docker compose pull && docker compose up -d
> ```

---

## Testing

| Layer | Runner | Command |
|-------|--------|---------|
| Frontend (React/Vite) | Vitest 2 + RTL + happy-dom | `cd client && npm test` |
| Backend (Express) | Jest 29 + Supertest | `cd server && npm test` |
| Python data engine | pytest 8 + pytest-mock | `cd data-engine && python3 -m pytest` |

---

## Project Structure

```
.
├── client/               # React frontend (Vite, Tailwind, shadcn/ui)
│   ├── src/pages/        # Home, Dashboard (map), Operations, Reporting, Help
│   └── nginx.conf        # Serves static build + proxies /api to backend
├── server/               # Express backend
│   └── routes/           # opportunities, scrape, ml, jobs, stats, export, schools
├── data-engine/          # Python scraper, cleaner, ML model
│   ├── scraper.py        # Fetches MLS data via HomeHarvest
│   ├── cleaner.py        # Data quality filters (captures beds/baths)
│   ├── census_fetcher.py # ZIP-level income from Census API
│   ├── school_fetcher.py # ZIP-level school ratings from FL DOE (optional)
│   ├── ml_model.py       # Training (temporal split, quantile), scoring, weighted scoring
│   ├── runner.py         # Flask job runner (called by backend)
│   ├── db.py             # PostgreSQL connection & queries
│   └── tests/            # pytest suite: test_db, test_cleaner, test_ml_model, test_school_fetcher
├── db/
│   └── init.sql          # Schema and seed structure
├── docker-compose.yml
└── Caddyfile
```
