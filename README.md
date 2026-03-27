# Florida Real Estate Opportunity Engine

A full-stack investment analysis tool that identifies **Buy, Demolish, Rebuild** opportunities across Florida markets. It surfaces aging single-family homes where lot value + new construction costs make teardown candidates profitable — scored by an ML model and displayed on an interactive map.

---

## What It Does

- Scrapes live MLS listings via HomeHarvest (Realtor.com) by market and date range
- Cleans and filters data to single-family homes within investment-relevant parameters
- Enriches properties with ZIP-level median household income from the US Census API
- Trains a model (XGBoost, Random Forest, Ridge, or LightGBM) to predict post-rebuild property value using geospatial features (0.5-mile radius new-build comps)
- Scores every for-sale property: `predicted_rebuild_value − (list_price + sqft × construction_cost/sqft)`
- Displays results on a live map with color-coded ROI markers
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

**Query params for `/api/opportunities`:** `zip`, `min_roi`, `max_year_built`, `limit`

---

## ML Model

The model is trained on new-build sold comps and predicts post-rebuild market value. Four algorithms are supported: `xgboost` (default), `random_forest`, `ridge`, `lightgbm`.

**Opportunity score formula:**

```
opportunity_result = predicted_rebuild_value − (list_price + sqft × construction_cost_per_sqft)
```

- `construction_cost_per_sqft` defaults to $175/sqft (Florida market rate)
- Positive score = potentially profitable teardown candidate

**Feature set:** `sqft`, `lot_sqft`, `year_built`, `median_household_income`, `zip`, `avg_new_build_price_sqft_05mi`

The geospatial feature (`avg_new_build_price_sqft_05mi`) is computed per-property using a 0.5-mile haversine radius against the sold dataset.

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
│   └── routes/           # opportunities, scrape, ml, jobs, stats, export
├── data-engine/          # Python scraper, cleaner, ML model
│   ├── scraper.py        # Fetches MLS data via HomeHarvest
│   ├── cleaner.py        # Data quality filters
│   ├── census_fetcher.py # ZIP-level income from Census API
│   ├── ml_model.py       # Training, scoring, weighted scoring
│   ├── runner.py         # Flask job runner (called by backend)
│   └── db.py             # PostgreSQL connection & queries
├── db/
│   └── init.sql          # Schema and seed structure
├── docker-compose.yml
└── Caddyfile
```
