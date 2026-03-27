# Florida Real Estate Opportunity Engine

A full-stack investment analysis tool that identifies **Buy, Demolish, Rebuild** opportunities across Florida markets. It surfaces aging single-family homes where lot value + new construction costs ≈ 3× the current property value - pinpointing profitable teardown candidates on an interactive map.

---

## What It Does

- Scrapes live MLS listings via HomeHarvest (Realtor.com)
- Cleans and filters data to single-family homes within investment-relevant parameters
- Trains an XGBoost model to predict post-rebuild property value
- Scores every property with an opportunity result: `predicted_rebuild_value − (acquisition_cost + construction_cost)`
- Displays results on a live map with color-coded ROI markers
- Exports filtered results to CSV

---
## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, Tailwind CSS, React-Leaflet |
| Backend | Node.js, Express |
| Data Engine | Python 3.11+, HomeHarvest, pandas, XGBoost, Flask |
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
DB_USER=realestate_user      # optional, defaults to realestate_user
DB_NAME=realestate            # optional, defaults to realestate
```

### Run the Stack

```bash
# Pull images and start all services
docker compose up

# First run will initialize the database automatically
# The app will be available at http://localhost (port 80)
```

### Dev Mode (hot reload)

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

---

## Services

| Service | Description | Port |
|---------|-------------|------|
| `frontend` | React app served via Caddy | 80 / 443 |
| `backend` | Express REST API | 4000 (internal) |
| `data-worker` | Python scraper + ML engine (Flask) | 5000 (internal) |
| `db` | PostgreSQL 15 | 5432 (internal) |
| `caddy` | Reverse proxy + TLS | 80, 443 |

---

## API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/opportunities` | GET | Returns GeoJSON FeatureCollection of scored properties |
| `/api/scrape/trigger` | POST | Triggers a data-worker scrape job |
| `/api/export/csv` | GET | Exports filtered opportunities as CSV |

**Query params for `/api/opportunities`:** `zip`, `min_roi`, `max_year_built`, `limit`

---

## Running the Scraper Manually

```bash
# Scrape a specific ZIP and date range
docker compose run data-worker python scraper.py --zip 33629 --start 2023-01 --end 2023-03
```

Scrapes are chunked by month to stay under Realtor.com's result cap. A random 2–5 second delay is applied between requests.

---

## ML Model

The XGBoost model is trained on comparable new builds and predicts post-rebuild market value. The opportunity score formula:

```
opportunity_result = predicted_rebuild_value − (acquisition_cost + construction_cost)
```

- `acquisition_cost` = sold price (or list price if unsold)
- `construction_cost` = sqft × $175/sqft (Florida market rate)
- Positive score = potentially profitable teardown candidate

ROI color coding on the map:
- **Green** - opportunity > $200k
- **Yellow** - opportunity $0–$200k
- **Red** - negative opportunity

---

## Data Persistence

PostgreSQL data is stored in a named Docker volume (`realestateoportunity_postgres_data`) and **survives `docker compose down`**. To fully wipe the database:

```bash
docker compose down -v
```

---

## Project Structure

```
.
├── client/          # React frontend
├── server/          # Express backend
├── data-engine/     # Python scraper, cleaner, ML model
│   ├── scraper.py        # Fetches MLS data via HomeHarvest
│   ├── cleaner.py        # Data quality filters
│   ├── census_fetcher.py # ZIP-level income from Census API
│   ├── ml_model.py       # XGBoost training + scoring
│   └── db.py             # PostgreSQL connection & upserts
├── db/              # init.sql schema
├── docker-compose.yml
└── Caddyfile
```

---

## Verify Data Survived a Restart

```bash
docker compose down && docker compose up
curl http://localhost/api/opportunities
```
