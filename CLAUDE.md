# Florida Real Estate Opportunity Engine — Project Rules

## What This Project Does
Identifies "Buy, Demolish, Rebuild" investment opportunities in Florida markets where:
**lot value + new construction ≈ 3× the current value of an aging home**

## Target Markets
| City | ZIP Codes |
|------|-----------|
| Tampa | 33606, 33629, 33611 |
| Orlando | 32803, 32806 |
| Winter Garden | 34787 |
| Winter Park | 32789, 32792 |

## Tech Stack (Non-Negotiable)
- **Database:** PostgreSQL 15 only — no SQLite, no JSON files, no CSV as persistence
- **Backend:** Node.js + Express (API layer)
- **Frontend:** React + Vite + Tailwind CSS
- **Map:** React-Leaflet (no Mapbox API key required)
- **Data Engine:** Python (HomeHarvest for MLS data, pandas for cleaning, XGBoost for ML)
- **Container:** Docker Compose with named volumes for DB persistence

## Data Cleaning Rules (cleaner.py)
All properties must pass ALL of these filters before being written to the DB:

| Field | Rule |
|-------|------|
| `property_type` | `Single Family` only — exclude condos, townhomes, land, multi-family |
| `list_price` | Between $100,000 and $5,000,000 |
| `year_built` | Greater than 1901 (exclude unknowns coded as 0 or 1900) |
| `sqft` | Less than 5,000 sq ft (exclude mansions — not teardown candidates) |
| `lat` / `lng` | Must be non-null (needed for map rendering) |

## Core ML Formula
```
opportunity_result = predicted_rebuild_value - (acquisition_cost + construction_cost)
```

Where:
- `acquisition_cost` = `sold_price` (or `list_price` if unsold)
- `construction_cost` = `sqft * construction_cost_per_sqft`
- `construction_cost_per_sqft` default = **$175/sqft** (Florida market rate)
- `predicted_rebuild_value` = XGBoost model output trained on comparable new builds

Positive `opportunity_result` = potentially profitable teardown candidate.

## API Design
- `GET /api/opportunities` — returns GeoJSON FeatureCollection
  - Query params: `zip`, `min_roi`, `max_year_built`, `limit`
  - Color coding: `roi_color` — green (>$200k), yellow ($0–$200k), red (negative)
- `POST /api/scrape/trigger` — kicks off data-worker scrape job
- `GET /api/export/csv` — exports filtered opportunities as CSV

## Volume Strategy
- **PostgreSQL:** Named Docker volume `postgres_data` — survives `docker compose down`
  - Only destroyed with `docker compose down -v` (intentional wipe)
- **Source code:** Bind mounts in `docker-compose.dev.yml` for hot reload
- **Never** bind-mount the Windows filesystem into the DB container (WSL2 I/O penalty)

## Scraper Rate Limiting
HomeHarvest scrapes Realtor.com. Always:
- Scrape in monthly chunks (not full-year queries — avoids 200-result cap)
- Pause `random.uniform(2, 5)` seconds between chunk requests
- Log each chunk: zip, date range, records returned

## Database Schema Key Points
- `properties.mls_id` is the upsert key (UNIQUE constraint)
- `zip_income` table stores Census median household income per ZIP
- Always index: `zip`, `opportunity_result DESC`, `year_built`
- `opportunity_result` is recomputed by `ml_model.py` — not manually set

## Development Commands
```bash
# Start all services
docker compose up --build

# Dev mode with hot reload
docker compose -f docker-compose.yml -f docker-compose.dev.yml up

# Run scraper for a specific ZIP and date range
docker compose run data-worker python scraper.py --zip 33629 --start 2023-01 --end 2023-03

# Verify PostgreSQL data survived restart
docker compose down && docker compose up
curl http://localhost:4000/api/opportunities

# List volumes (confirm named volume exists)
docker volume ls
```

## File Ownership
- `scraper.py` — fetches raw MLS data via HomeHarvest
- `cleaner.py` — applies data quality filters
- `census_fetcher.py` — fetches ZIP-level income from Census API
- `ml_model.py` — trains XGBoost model, writes `opportunity_result` scores
- `db.py` — all PostgreSQL connection and upsert logic (single source of truth for DB ops)
