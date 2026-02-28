# RE Opportunity

**Automated "Buy, Demolish, Rebuild" investment analysis for Florida real estate markets.**

Identifies aging single-family homes where acquiring the property, tearing it down, and building new is profitable — by combining live MLS data, U.S. Census income statistics, and an XGBoost model trained on comparable new-construction sales.

---

## The Core Formula

```
Opportunity = Predicted Rebuild Value − (Acquisition Cost + Construction Cost)
```

| Variable | Source |
|---|---|
| **Predicted Rebuild Value** | XGBoost model trained on recent new-build sales |
| **Acquisition Cost** | Current list price (or last sold price) |
| **Construction Cost** | `sqft × $175/sqft` (Florida market default) |

A positive result means the teardown-and-rebuild scenario is estimated to be profitable at today's market prices.

---

## Target Markets

| City | ZIP Codes |
|---|---|
| Tampa | 33606, 33629, 33611 |
| Orlando | 32803, 32806 |
| Winter Garden | 34787 |
| Winter Park | 32789, 32792 |

---

## Architecture

```
┌─────────────┐    HTTP     ┌──────────────┐    SQL     ┌────────────────┐
│   Browser   │ ─────────▶  │   Express    │ ─────────▶ │  PostgreSQL 15 │
│  React+Vite │ ◀─────────  │   :4000      │ ◀───────── │  (named vol.)  │
│    :3000    │             └──────┬───────┘            └────────────────┘
└─────────────┘                   │ proxy                       ▲
                                  ▼                             │
                          ┌───────────────┐   subprocess   ┌───┴──────────┐
                          │  data-worker  │ ─────────────▶ │  Python      │
                          │  Flask :5000  │                │  ml_model.py │
                          └───────────────┘                │  scraper.py  │
                                                           │  cleaner.py  │
                                                           └──────────────┘
```

**Four Docker services:**
- `db` — PostgreSQL 15, data persisted in a named Docker volume
- `backend` — Node.js / Express API on port 4000
- `frontend` — React / Vite dev server on port 3000
- `data-worker` — Python Flask runner on port 5000 (internal only); spawns ML and scrape subprocesses on demand

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS |
| Map | React-Leaflet (no API key required) |
| Backend | Node.js, Express |
| Database | PostgreSQL 15 |
| Data Engine | Python, HomeHarvest, pandas |
| ML Model | XGBoost, scikit-learn |
| Infrastructure | Docker Compose |

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (includes Compose)
- WSL2 on Windows (recommended) — do **not** bind-mount the Windows filesystem into the DB container

---

## Setup

### 1. Clone and configure environment

```bash
git clone <repo-url>
cd realestateoportunity
cp .env.example .env
```

Edit `.env` and set a strong `DB_PASSWORD`.

### 2. Start all services

```bash
docker compose up --build
```

First run downloads images and installs dependencies — expect 3–5 minutes. Subsequent starts are fast.

### 3. Verify everything is running

```
http://localhost:3000   → Frontend (map, empty)
http://localhost:4000/api/opportunities → { "type": "FeatureCollection", "features": [] }
```

---

## Using the App

The app has three pages accessible from the top nav.

### Map (/)

The main investment dashboard.

- **Filters** — narrow by city, ZIP code, listing type, and minimum profit threshold
- **ROI color toggles** — show/hide properties by profitability tier:
  - 🟢 Green — estimated profit > $200k
  - 🟡 Yellow — estimated profit $0–$200k
  - 🔴 Red — estimated loss
  - ⚫ Gray — not yet scored by the ML model
- **Click a marker** — opens a sidebar with full property details, the estimated profit breakdown, and Zillow links
- **Comparable sales** — the sidebar shows nearby recent sales used to train the model; click any comp card to pan the map to that address

### Data Engine (/ops)

Controls for the full data pipeline. On mobile, use the **Controls / Console** tabs.

#### Data Collection

| Button | What it does |
|---|---|
| Sync Active Listings | Scrapes current for-sale listings from Realtor.com via HomeHarvest |
| Sync Sold History | Scrapes closed sales for the selected date range (used to train the model) |

**Market** — choose a specific city or all markets at once.
**Request Speed** — controls the delay between scrape requests. Use "Safe (30s)" if you're seeing rate-limit errors.
**Re-fetch existing data** — by default the scraper skips properties already in the database. Check this to force a full refresh.

#### ML Model

| Button | What it does |
|---|---|
| Train ML Model | Opens a modal to configure hyperparameters and kick off a training run |
| Score with Active Model | Runs the active model against all unscored for-sale listings |

After training, you can activate any past model version from the model list. The active model is used for all scoring runs.

#### Train Modal — Hyperparameter Guide

| Field | Default | Effect |
|---|---|---|
| **Estimators** | 1000 | Number of trees. Higher = more accurate, slower. Lower (200–300) for quick test runs. |
| **Max Tree Depth** | 6 | How complex each tree can get. Higher risks overfitting. |
| **Learning Rate** | 0.05 | Step size per tree. Lower needs more estimators; they trade off together. |
| **Min Year Built** | 2015 | Cutoff for what counts as "new build" in the training set. Lower = more training rows; higher = more current pricing signals. |
| **Test Split** | 0.20 | Fraction of data held out to produce the R² score. |

#### Job Console

Every triggered job (scrape, train, score) streams its output here in real time. Click any job in the list to view its logs. Use **Clear done** to remove completed/failed entries.

### Guide (/help)

Full technical documentation including the ML formula, feature importance breakdown, and the opportunity scoring methodology.

---

## Running the Data Pipeline (CLI)

All Python scripts are run inside the `data-worker` container.

```bash
# Scrape active listings for Tampa
docker compose run data-worker python scraper.py --market tampa --type for_sale

# Scrape sold history for a specific ZIP, date range
docker compose run data-worker python scraper.py --zip 33629 --type sold --start 2022-01 --end 2024-06

# Fetch Census income data for all target ZIPs
docker compose run data-worker python census_fetcher.py --all

# Train the ML model (default hyperparameters)
docker compose run data-worker python ml_model.py --train

# Train with custom hyperparameters
docker compose run data-worker python ml_model.py --train --n-estimators 2000 --lr 0.03 --min-year-built 2018

# Score all unscored for-sale listings
docker compose run data-worker python ml_model.py --score
```

---

## Data Cleaning Rules

Properties are filtered before being written to the database. All of the following must be true:

| Field | Rule |
|---|---|
| `property_type` | Single Family only |
| `list_price` | $100,000 – $5,000,000 |
| `year_built` | > 1901 (excludes unknowns coded as 0 or 1900) |
| `sqft` | < 5,000 sqft (excludes mansions — not teardown candidates) |
| `lat` / `lng` | Non-null (required for map rendering) |

---

## Database

PostgreSQL 15. Data persists in a named Docker volume (`postgres_data`) and survives `docker compose down`. It is only destroyed by running `docker compose down -v` explicitly.

```bash
# Confirm the volume exists
docker volume ls | grep postgres

# Verify data survived a restart
docker compose down && docker compose up
curl http://localhost:4000/api/opportunities
```

### Key Tables

| Table | Purpose |
|---|---|
| `properties` | All scraped and cleaned listings; upsert key is `mls_id` |
| `model_runs` | Training and scoring job history, model paths, R² scores |
| `zip_income` | Census median household income per ZIP code |

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/opportunities` | GeoJSON FeatureCollection of scored properties |
| `GET` | `/api/opportunities/filters` | Available city and ZIP values for filter dropdowns |
| `GET` | `/api/opportunities/:id/comparables` | Recent nearby sales for a given property |
| `POST` | `/api/scrape/trigger` | Start a scrape job |
| `GET` | `/api/scrape/status` | Property counts by ZIP and listing type |
| `POST` | `/api/ml/train` | Start a training run (accepts hyperparameter body) |
| `POST` | `/api/ml/score` | Score all unscored properties with the active model |
| `GET` | `/api/ml/status` | Current model state and property counts |
| `GET` | `/api/ml/models` | List all completed training runs |
| `POST` | `/api/ml/models/:id/activate` | Set a model as active for scoring |
| `GET` | `/api/export/csv` | Download filtered opportunities as CSV |
| `GET` | `/api/jobs` | List recent data-worker jobs |
| `GET` | `/api/jobs/:id` | Get job status and streamed logs |

**`GET /api/opportunities` query parameters:**

| Param | Type | Description |
|---|---|---|
| `zip` | string | Filter by ZIP code |
| `city` | string | Filter by city slug (e.g. `winter_park`) |
| `min_roi` | number | Minimum `opportunity_result` value |
| `max_year_built` | number | Exclude properties built after this year |
| `listing_type` | string | `for_sale`, `sold`, or `all` |
| `limit` | number | Max features returned (default 500) |

---

## Development (Hot Reload)

```bash
# Start with bind mounts for live code reloading
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

Source code is bind-mounted into the containers. Changes to `client/src` and `server/` reload automatically. The DB volume is never bind-mounted (WSL2 I/O performance).

---

## Project Structure

```
├── client/                 # React + Vite frontend
│   ├── src/
│   │   ├── App.jsx         # Layout, routing, theme toggle
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx    # Map + property sidebar
│   │   │   ├── Operations.jsx   # Data pipeline controls
│   │   │   └── Help.jsx         # Technical documentation
│   │   └── components/
│   │       └── OpportunityMap.jsx  # React-Leaflet map
│   └── index.html
├── server/                 # Express API
│   ├── index.js            # App entry, DB pool
│   └── routes/
│       ├── opportunities.js
│       ├── ml.js
│       └── scrape.js
├── data-engine/            # Python data pipeline
│   ├── runner.py           # Flask job runner (internal API)
│   ├── scraper.py          # HomeHarvest MLS scraper
│   ├── cleaner.py          # Data quality filters
│   ├── ml_model.py         # XGBoost train + score
│   ├── census_fetcher.py   # Census ACS income data
│   └── db.py               # PostgreSQL access (single source of truth)
├── db/
│   └── init.sql            # Schema + indexes
├── docker-compose.yml
├── docker-compose.dev.yml
└── .env.example
```
